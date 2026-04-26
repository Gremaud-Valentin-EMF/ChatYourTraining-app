import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getActivities,
  getActivityStreams,
  refreshTokens,
  convertStravaActivity,
  mapStravaSportType,
  calculateNormalizedHeartRate,
  calculateNormalizedPower,
  calculateNormalizedGradedPace,
  TSSCalculationOptions,
} from "@/lib/integrations/strava";
import {
  acquireSyncLock,
  releaseSyncLock,
  matchPlannedWorkout,
  SyncLockError,
  SyncState,
} from "@/lib/integrations/sync-helpers";

export async function POST() {
  const supabase = await createClient();
  let lockAcquired = false;
  let lockedState: SyncState | null = null;
  let integrationId: string | null = null;
  let releaseError: string | undefined;
  let syncSuccess = false;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get Strava integration
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { data: integration }: { data: any } = await (supabase as any)
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "strava")
      .single();

    if (!integration || !integration.is_active) {
      return NextResponse.json(
        { error: "Strava not connected" },
        { status: 400 }
      );
    }

    // Prevent concurrent syncs
    const syncState =
      (integration.sync_errors as SyncState | null) ?? null;
    integrationId = integration.id;
    try {
      lockedState = await acquireSyncLock(
        supabase,
        integration.id,
        "strava",
        syncState
      );
      lockAcquired = true;
    } catch (lockError) {
      if (lockError instanceof SyncLockError) {
        return NextResponse.json(
          { error: "Synchronisation déjà en cours" },
          { status: 429 }
        );
      }
      throw lockError;
    }

    // Get sync configuration (defaults if not set)
    const syncConfig = integration.sync_config || {};
    const syncActivities = syncConfig.activities !== false; // Default: true

    if (!syncActivities) {
      syncSuccess = true;
      console.log("Strava sync - Activities sync disabled");
      return NextResponse.json({
        success: true,
        synced: 0,
        skipped: 0,
        total: 0,
        message: "Activities sync disabled in configuration",
      });
    }

    let accessToken = integration.access_token;

    // Check if token is expired and refresh if needed
    const tokenExpiry = new Date(integration.token_expires_at);
    if (tokenExpiry < new Date()) {
      try {
        const newTokens = await refreshTokens(integration.refresh_token);
        accessToken = newTokens.access_token;

        // Update tokens in database
        await (supabase as any)
          .from("integrations")
          .update({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token,
            token_expires_at: new Date(
              newTokens.expires_at * 1000
            ).toISOString(),
          })
          .eq("id", integration.id);
      } catch {
        return NextResponse.json(
          { error: "Token refresh failed" },
          { status: 401 }
        );
      }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    /* eslint-disable @typescript-eslint/no-explicit-any */
    // Get user's physiological data for TSS calculation
    const { data: physioData } = await (supabase as any)
      .from("physiological_data")
      .select("hr_max, hr_rest, lthr")
      .eq("user_id", user.id)
      .limit(1);

    // Get user's gender for gender-specific TRIMP calculations
    const { data: userData } = await (supabase as any)
      .from("users")
      .select("gender")
      .eq("id", user.id)
      .single();

    // Get user's sports data (FTP, threshold pace, VMA, CSS) WITH sport names for sport-specific lookup
    const { data: userSports } = await (supabase as any)
      .from("user_sports")
      .select("ftp_watts, threshold_pace_per_km, vma_kmh, css_per_100m, sport_id, sports(name)")
      .eq("user_id", user.id);

    const userHrMax = physioData?.[0]?.hr_max ?? undefined;
    const userHrRest = physioData?.[0]?.hr_rest ?? undefined;
    const userGender = userData?.gender as "male" | "female" | undefined;

    // Sport-specific threshold lookup: prefer the running sport entry for pace/VMA,
    // and the cycling sport entry for FTP
    const runningSports = userSports?.filter((s: any) => {
      const name = s.sports?.name;
      return name === "running" || name === "trail_running";
    }) || [];
    const cyclingSports = userSports?.filter((s: any) => {
      const name = s.sports?.name;
      return name === "cycling" || name === "spin";
    }) || [];
    const swimmingSports = userSports?.filter((s: any) => {
      const name = s.sports?.name;
      return name === "swimming";
    }) || [];

    // FTP: prefer cycling-specific, then any sport
    const userFtp = cyclingSports.find((s: any) => s.ftp_watts)?.ftp_watts
      ?? userSports?.find((s: any) => s.ftp_watts)?.ftp_watts ?? undefined;

    // CSS: prefer swimming-specific, then any sport
    const userCssPer100m = swimmingSports.find((s: any) => s.css_per_100m)?.css_per_100m
      ?? userSports?.find((s: any) => s.css_per_100m)?.css_per_100m ?? undefined;

    // Threshold pace: ONLY from running-specific sport data (not "other")
    let userThresholdPace = runningSports.find((s: any) => s.threshold_pace_per_km)?.threshold_pace_per_km
      ?? undefined;
    if (!userThresholdPace) {
      // Derive from VMA: ONLY from running-specific sport data
      const vmaKmh = runningSports.find((s: any) => s.vma_kmh)?.vma_kmh;
      if (vmaKmh && vmaKmh > 0) {
        // FTPace speed = VMA × 0.85 (km/h) → convert to s/km
        userThresholdPace = Math.round(3600 / (vmaKmh * 0.85));
        console.log(`Strava sync - Threshold pace derived from VMA ${vmaKmh} km/h → ${userThresholdPace} s/km (${Math.floor(userThresholdPace / 60)}:${String(userThresholdPace % 60).padStart(2, "0")}/km)`);
      }
    }

    // Use stored LTHR or calculate from HRmax
    // LTHR is typically ~85% of HRmax for most athletes
    const userLthr =
      physioData?.[0]?.lthr ??
      (userHrMax ? Math.round(userHrMax * 0.85) : undefined);
    console.log("Strava sync - User physio data:", {
      userHrMax,
      userHrRest,
      userGender,
      userFtp,
      userThresholdPace,
      userCssPer100m,
      userLthr,
      storedLthr: physioData?.[0]?.lthr,
    });

    // Get sports mapping
    const { data: sports } = await (supabase as any)
      .from("sports")
      .select("id, name");

    const sportMap = new Map<string, string>(
      (sports?.map((s: any) => [s.name, s.id]) as [string, string][]) || []
    );

    // Smart sync: Check oldest Strava activity to determine sync range
    // - First sync or < 120 days of data: sync 120 days for accurate CTL (3x the 42-day constant)
    // - Otherwise: sync only from last sync date (incremental)
    const INITIAL_SYNC_DAYS = 120; // 3x CTL constant for accurate convergence

    const { data: oldestActivity } = await (supabase as any)
      .from("activities")
      .select("scheduled_date")
      .eq("user_id", user.id)
      .eq("source", "strava")
      .order("scheduled_date", { ascending: true })
      .limit(1);

    const initialSyncDate = new Date();
    initialSyncDate.setDate(initialSyncDate.getDate() - INITIAL_SYNC_DAYS);

    let syncFromDate: Date;
    let syncReason: string;

    if (!oldestActivity || oldestActivity.length === 0) {
      // No Strava activities: first sync, get 120 days
      syncFromDate = initialSyncDate;
      syncReason = `first sync (${INITIAL_SYNC_DAYS} days)`;
    } else {
      const oldestDate = new Date(oldestActivity[0].scheduled_date);
      const daysSinceOldest = Math.floor(
        (Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceOldest < INITIAL_SYNC_DAYS) {
        // Less than 120 days of history: extend for CTL accuracy
        syncFromDate = initialSyncDate;
        syncReason = `extending to ${INITIAL_SYNC_DAYS} days (had ${daysSinceOldest} days)`;
      } else {
        // Already have 120+ days: incremental sync from last sync or last 7 days
        const lastSyncDate = integration.last_sync_at
          ? new Date(integration.last_sync_at)
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Go back 7 days from last sync to catch any late-synced activities
        lastSyncDate.setDate(lastSyncDate.getDate() - 7);
        syncFromDate = lastSyncDate;
        syncReason = `incremental (from ${
          lastSyncDate.toISOString().split("T")[0]
        })`;
      }
    }

    const syncFromTimestamp = Math.floor(syncFromDate.getTime() / 1000);
    console.log(
      `Strava sync - ${syncReason}, fetching since:`,
      syncFromDate.toISOString()
    );

    const activities = await getActivities(accessToken, {
      after: syncFromTimestamp,
      per_page: 200,
    });
    console.log("Strava sync - Activities from API:", activities.length);

    // Log all activities from API for debugging
    for (const activity of activities) {
      console.log(
        `Strava API activity: ${activity.id} | ${activity.start_date_local.split("T")[0]} | ${activity.sport_type} | ${activity.name}`
      );
    }

    let synced = 0;
    let skipped = 0;
    let matchedToPlan = 0;
    let failedInserts = 0;
    const errors: { activityId: number; name: string; error: string }[] = [];

    // Process activities with rate limiting for streams API
    // Strava rate limit: 100 requests per 15 minutes, 1000 per day
    // Prioritize getting streams for accurate TSS calculation
    let streamsFetched = 0;
    const MAX_STREAMS_PER_SYNC = 80; // More streams for accurate NHR/TSS

    const buildStreamRows = (
      activityId: string,
      provider: "strava",
      options: TSSCalculationOptions
    ) => {
      const rows: {
        activity_id: string;
        provider: "strava";
        data_type:
          | "time"
          | "heartrate"
          | "power"
          | "distance"
          | "altitude";
        values: number[];
      }[] = [];
      if (options.timeStream && options.timeStream.length > 0) {
        rows.push({
          activity_id: activityId,
          provider,
          data_type: "time",
          values: options.timeStream,
        });
      }
      if (options.heartrateStream && options.heartrateStream.length > 0) {
        rows.push({
          activity_id: activityId,
          provider,
          data_type: "heartrate",
          values: options.heartrateStream,
        });
      }
      if (options.powerStream && options.powerStream.length > 0) {
        rows.push({
          activity_id: activityId,
          provider,
          data_type: "power",
          values: options.powerStream,
        });
      }
      if (options.distanceStream && options.distanceStream.length > 0) {
        rows.push({
          activity_id: activityId,
          provider,
          data_type: "distance",
          values: options.distanceStream,
        });
      }
      if (options.altitudeStream && options.altitudeStream.length > 0) {
        rows.push({
          activity_id: activityId,
          provider,
          data_type: "altitude",
          values: options.altitudeStream,
        });
      }
      return rows;
    };

    for (const stravaActivity of activities) {
      // Check if activity already exists
      const externalId = String(stravaActivity.id);
      const { data: existing } = await (supabase as any)
        .from("activities")
        .select("id")
        .eq("user_id", user.id)
        .eq("source", "strava")
        .eq("external_id", externalId)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        console.log(
          `Strava sync - Activity already imported, skipping: ${stravaActivity.name} (${externalId})`
        );
        continue;
      }

      // Map sport type
      const sportType = mapStravaSportType(stravaActivity.sport_type);
      const sportId = sportMap.get(sportType) || sportMap.get("other");

      if (!sportId) {
        console.error("Sport not found:", sportType);
        continue;
      }

      // Build TSS calculation options
      const tssOptions: TSSCalculationOptions = {
        userHrMax,
        userHrRest,
        userGender,
        userFtp,
        userLthr,
        userThresholdPace,
        userCssPer100m,
      };

      // Fetch streams for activities with HR/power data (for more accurate TSS and charting)
      // Only fetch streams if we haven't hit the rate limit
      if (streamsFetched < MAX_STREAMS_PER_SYNC) {
        const shouldFetchStreams =
          stravaActivity.average_heartrate ||
          (stravaActivity.weighted_average_watts && stravaActivity.device_watts === true);

        if (shouldFetchStreams) {
          try {
            // Always include time stream for charting
            const streamKeys = ["time", "distance", "altitude"];
            if (stravaActivity.average_heartrate) streamKeys.push("heartrate");
            if (stravaActivity.weighted_average_watts && stravaActivity.device_watts === true) streamKeys.push("watts");

            const streams = await getActivityStreams(
              accessToken,
              stravaActivity.id,
              streamKeys
            );
            streamsFetched++;

            // Store time stream for charting
            if (streams.time?.data) {
              tssOptions.timeStream = streams.time.data;
            }
            if (streams.distance?.data) {
              tssOptions.distanceStream = streams.distance.data;
            }
            if (streams.altitude?.data) {
              tssOptions.altitudeStream = streams.altitude.data;
            }

            // Calculate and store Heart Rate data
            if (streams.heartrate?.data) {
              tssOptions.heartrateStream = streams.heartrate.data;
              const nhr = calculateNormalizedHeartRate(streams.heartrate.data, streams.time?.data);
              if (nhr > 0) {
                tssOptions.normalizedHeartRate = nhr;
                console.log(
                  `Streams: ${stravaActivity.name} - NHR=${nhr} (avg=${stravaActivity.average_heartrate}), ${streams.heartrate.data.length} pts`
                );
              }
            }

            // Calculate and store Power data
            if (streams.watts?.data) {
              tssOptions.powerStream = streams.watts.data;
              const np = calculateNormalizedPower(streams.watts.data, streams.time?.data);
              if (np > 0) {
                tssOptions.normalizedPower = np;
                console.log(
                  `Streams: ${stravaActivity.name} - NP=${np} (strava=${stravaActivity.weighted_average_watts}), ${streams.watts.data.length} pts`
                );
              }
            }

            if (streams.time?.data && streams.distance?.data) {
              const ngp = calculateNormalizedGradedPace(
                streams.time.data,
                streams.distance.data,
                streams.altitude?.data,
                stravaActivity.name
              );
              if (ngp > 0) {
                tssOptions.normalizedPaceSeconds = ngp;
              }
            }
          } catch (streamError) {
            // Non-blocking: if streams fail, use average values
            console.log(
              `Streams not available for ${stravaActivity.name}:`,
              streamError
            );
          }
        }
      }

      // Convert and insert activity with TSS calculation
      const activityData = convertStravaActivity(stravaActivity, tssOptions);
      console.log(
        `Strava sync - Activity "${stravaActivity.name}": TSS=${activityData.tss}, ` +
          `duration=${activityData.actual_duration_minutes}min, ` +
          `HR=${
            tssOptions.normalizedHeartRate ||
            stravaActivity.average_heartrate ||
            "N/A"
          }${tssOptions.normalizedHeartRate ? " (NHR)" : ""}`
      );

      const matchedPlanId = await matchPlannedWorkout(supabase as any, {
        userId: user.id,
        sportId,
        scheduledDate: activityData.scheduled_date,
        data: activityData,
      });

      if (matchedPlanId) {
        const streamRows = buildStreamRows(
          matchedPlanId,
          "strava",
          tssOptions
        );
        if (streamRows.length > 0) {
          await (supabase as any)
            .from("activity_streams")
            .upsert(streamRows, { onConflict: "activity_id,data_type" });
        }
        synced++;
        matchedToPlan++;
        continue;
      }

      const { data: inserted, error: insertError } = await (supabase as any)
        .from("activities")
        .insert({
          user_id: user.id,
          sport_id: sportId,
          ...activityData,
        })
        .select("id");

      if (insertError) {
        const errorMsg = insertError.message || JSON.stringify(insertError);
        console.error(
          `Error inserting activity ${stravaActivity.id} "${stravaActivity.name}": ${errorMsg}`
        );
        failedInserts++;
        errors.push({
          activityId: stravaActivity.id,
          name: stravaActivity.name,
          error: errorMsg,
        });
      } else {
        const insertedActivityId =
          Array.isArray(inserted) && inserted.length > 0
            ? inserted[0]?.id
            : null;
        if (insertedActivityId) {
          const streamRows = buildStreamRows(
            insertedActivityId,
            "strava",
            tssOptions
          );
          if (streamRows.length > 0) {
            await (supabase as any)
              .from("activity_streams")
              .upsert(streamRows, { onConflict: "activity_id,data_type" });
          }
        }
        synced++;
      }
    }

    console.log(
      `Strava sync - Streams fetched: ${streamsFetched}/${MAX_STREAMS_PER_SYNC}`
    );

    // Update last sync timestamp
    await (supabase as any)
      .from("integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", integration.id);
    syncSuccess = true;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      matchedToPlan,
      failedInserts,
      total: activities.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Strava sync error:", error);
    releaseError =
      error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  } finally {
    if (lockAcquired && lockedState && integrationId) {
      await releaseSyncLock(supabase, integrationId, lockedState, {
        success: syncSuccess,
        errorMessage: syncSuccess ? undefined : releaseError,
      });
    }
  }
}
