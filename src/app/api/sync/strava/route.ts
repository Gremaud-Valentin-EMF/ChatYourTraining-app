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
  TSSCalculationOptions,
} from "@/lib/integrations/strava";

export async function POST() {
  try {
    const supabase = await createClient();
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

    // Get sync configuration (defaults if not set)
    const syncConfig = integration.sync_config || {};
    const syncActivities = syncConfig.activities !== false; // Default: true

    if (!syncActivities) {
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

    // Get user's cycling FTP from user_sports
    const { data: cyclingSport } = await (supabase as any)
      .from("user_sports")
      .select("ftp_watts")
      .eq("user_id", user.id)
      .not("ftp_watts", "is", null)
      .limit(1);

    const userHrMax = physioData?.[0]?.hr_max || undefined;
    const userHrRest = physioData?.[0]?.hr_rest || undefined;
    const userFtp = cyclingSport?.[0]?.ftp_watts || undefined;
    // Use stored LTHR or calculate from HRmax
    // For running, LTHR is typically around 70-75% of HRmax (lower than cycling's 85%)
    // Based on Garmin data analysis, using 70% for running LTHR estimate
    const userLthr =
      physioData?.[0]?.lthr ||
      (userHrMax ? Math.round(userHrMax * 0.7) : undefined);
    console.log("Strava sync - User physio data:", {
      userHrMax,
      userHrRest,
      userFtp,
      userLthr,
      storedLthr: physioData?.[0]?.lthr,
    });

    // Get sports mapping
    const { data: sports } = await (supabase as any)
      .from("sports")
      .select("id, name");

    const sportMap = new Map(sports?.map((s: any) => [s.name, s.id]) || []);

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

    let synced = 0;
    let skipped = 0;

    // Process activities with rate limiting for streams API
    // Strava rate limit: 100 requests per 15 minutes, 1000 per day
    // Prioritize getting streams for accurate TSS calculation
    let streamsFetched = 0;
    const MAX_STREAMS_PER_SYNC = 80; // More streams for accurate NHR/TSS

    for (const stravaActivity of activities) {
      // Check if activity already exists
      const { data: existing } = await (supabase as any)
        .from("activities")
        .select("id")
        .eq("user_id", user.id)
        .eq("source", "strava")
        .eq("external_id", String(stravaActivity.id))
        .single();

      if (existing) {
        skipped++;
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
        userFtp,
        userLthr,
      };

      // Fetch streams for activities with HR/power data (for more accurate TSS and charting)
      // Only fetch streams if we haven't hit the rate limit
      if (streamsFetched < MAX_STREAMS_PER_SYNC) {
        const shouldFetchStreams =
          stravaActivity.average_heartrate ||
          stravaActivity.weighted_average_watts;

        if (shouldFetchStreams) {
          try {
            // Always include time stream for charting
            const streamKeys = ["time"];
            if (stravaActivity.average_heartrate) streamKeys.push("heartrate");
            if (stravaActivity.weighted_average_watts) streamKeys.push("watts");

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

            // Calculate and store Heart Rate data
            if (streams.heartrate?.data) {
              tssOptions.heartrateStream = streams.heartrate.data;
              const nhr = calculateNormalizedHeartRate(streams.heartrate.data);
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
              const np = calculateNormalizedPower(streams.watts.data);
              if (np > 0) {
                tssOptions.normalizedPower = np;
                console.log(
                  `Streams: ${stravaActivity.name} - NP=${np} (strava=${stravaActivity.weighted_average_watts}), ${streams.watts.data.length} pts`
                );
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

      const { error: insertError } = await (supabase as any)
        .from("activities")
        .insert({
          user_id: user.id,
          sport_id: sportId,
          ...activityData,
        });

      if (insertError) {
        console.error("Error inserting activity:", insertError);
      } else {
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
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      total: activities.length,
    });
  } catch (error) {
    console.error("Strava sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
