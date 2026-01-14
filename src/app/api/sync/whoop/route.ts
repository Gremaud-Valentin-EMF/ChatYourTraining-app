import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getRecovery,
  getSleep,
  getWorkouts,
  refreshTokens,
  mapWhoopSportType,
  WhoopSleep,
  WhoopRecovery,
  WhoopWorkout,
} from "@/lib/integrations/whoop";
import {
  acquireSyncLock,
  releaseSyncLock,
  matchPlannedWorkout,
  SyncLockError,
} from "@/lib/integrations/sync-helpers";
import type {
  ImportedActivityData,
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

    /* eslint-disable @typescript-eslint/no-explicit-any */
    // Get WHOOP integration
    const { data: integration }: { data: any } = await (supabase as any)
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "whoop")
      .single();

    if (!integration || !integration.is_active) {
      return NextResponse.json(
        { error: "WHOOP not connected" },
        { status: 400 }
      );
    }

    const syncState =
      (integration.sync_errors as SyncState | null) ?? null;
    integrationId = integration.id;

    try {
      lockedState = await acquireSyncLock(
        supabase,
        integration.id,
        "whoop",
        syncState
      );
      lockAcquired = true;
    } catch (lockError) {
      if (lockError instanceof SyncLockError) {
        return NextResponse.json(
          { error: "Synchronisation WHOOP déjà en cours" },
          { status: 429 }
        );
      }
      throw lockError;
    }

    // Get sync configuration (defaults if not set)
    const syncConfig = integration.sync_config || {};
    const syncSleep = syncConfig.sleep !== false; // Default: true
    const syncRecovery = syncConfig.recovery !== false; // Default: true
    const syncHrv = syncConfig.hrv !== false; // Default: true
    const syncStrain = syncConfig.strain !== false; // Default: true
    const syncWorkouts = syncConfig.workouts === true; // Default: false (avoid duplicates with Strava)

    console.log("WHOOP sync config:", {
      sleep: syncSleep,
      recovery: syncRecovery,
      hrv: syncHrv,
      strain: syncStrain,
      workouts: syncWorkouts,
    });

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
              Date.now() + newTokens.expires_in * 1000
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

    // First, test if the token works by fetching user profile
    console.log("Testing WHOOP API access...");
    console.log(
      "Access token (first 20 chars):",
      accessToken?.substring(0, 20) + "..."
    );

    const testResponse = await fetch(
      "https://api.prod.whoop.com/developer/v1/user/profile/basic",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    console.log("WHOOP profile test - Status:", testResponse.status);
    const testData = await testResponse.text();
    console.log("WHOOP profile test - Response:", testData);

    if (testResponse.status === 401 || testResponse.status === 403) {
      return NextResponse.json(
        {
          error: "Token invalide ou expiré",
          details: testData,
        },
        { status: 401 }
      );
    }

    // Smart sync: Check oldest WHOOP data to determine sync range
    console.log("Fetching WHOOP data...");

    const { data: oldestMetric } = await (supabase as any)
      .from("daily_metrics")
      .select("date")
      .eq("user_id", user.id)
      .eq("source", "whoop")
      .order("date", { ascending: true })
      .limit(1);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    let syncFromDate: Date;
    let syncReason: string;

    if (!oldestMetric || oldestMetric.length === 0) {
      // No WHOOP data: first sync, get 90 days
      syncFromDate = ninetyDaysAgo;
      syncReason = "first sync (90 days)";
    } else {
      const oldestDate = new Date(oldestMetric[0].date);
      const daysSinceOldest = Math.floor(
        (Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceOldest < 90) {
        // Less than 90 days: extend to 90 days
        syncFromDate = ninetyDaysAgo;
        syncReason = `extending to 90 days (had ${daysSinceOldest} days)`;
      } else {
        // Already have 90+ days: incremental sync from last 14 days
        // (WHOOP data can update retroactively, so 14 days is safer)
        syncFromDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        syncReason = `incremental (last 14 days)`;
      }
    }

    const endDate = new Date().toISOString();
    const startDate = syncFromDate.toISOString();
    console.log(
      `WHOOP sync - ${syncReason}, date range:`,
      startDate,
      "to",
      endDate
    );

    // Get data based on sync config (WHOOP API max limit is 25 per request)
    // Fetch data conditionally based on config
    const sleepData: { records: WhoopSleep[] } =
      syncSleep || syncRecovery || syncHrv
        ? await getSleep(accessToken, {
            start: startDate,
            end: endDate,
            limit: 25,
          })
        : { records: [] };

    const recoveryData: { records: WhoopRecovery[] } =
      syncRecovery || syncHrv || syncStrain
        ? await getRecovery(accessToken, {
            start: startDate,
            end: endDate,
            limit: 25,
          })
        : { records: [] };

    const workoutData: { records: WhoopWorkout[] } = syncWorkouts
      ? await getWorkouts(accessToken, {
          start: startDate,
          end: endDate,
          limit: 25,
        })
      : { records: [] };

    console.log(
      "WHOOP sleep records:",
      sleepData.records.length,
      syncSleep ? "(enabled)" : "(disabled)"
    );
    console.log(
      "WHOOP recovery records:",
      recoveryData.records.length,
      syncRecovery ? "(enabled)" : "(disabled)"
    );
    console.log(
      "WHOOP workout records:",
      workoutData.records.length,
      syncWorkouts ? "(enabled)" : "(disabled)"
    );

    let synced = 0;
    let updated = 0;

    // Process sleep data (if enabled)
    if (syncSleep || syncRecovery || syncHrv) {
      for (const sleep of sleepData.records) {
        // Skip naps
        if (sleep.nap) continue;

        // Use the END date (wake-up date) - this is what users expect
        // e.g., sleep from Jan 9 23:00 to Jan 10 07:00 → date = Jan 10
        const date = sleep.end.split("T")[0];
        const sleepScore = sleep.score;
        const sleepStages = sleepScore?.stage_summary;

        const metricsData: any = {
          date,
          sleep_score: sleepScore
            ? Math.round(sleepScore.sleep_performance_percentage)
            : null,
          sleep_duration_minutes: sleepStages
            ? Math.round(sleepStages.total_in_bed_time_milli / 60000)
            : null,
          sleep_deep_minutes: sleepStages
            ? Math.round(sleepStages.total_slow_wave_sleep_time_milli / 60000)
            : null,
          sleep_rem_minutes: sleepStages
            ? Math.round(sleepStages.total_rem_sleep_time_milli / 60000)
            : null,
          sleep_light_minutes: sleepStages
            ? Math.round(sleepStages.total_light_sleep_time_milli / 60000)
            : null,
          sleep_awake_minutes: sleepStages
            ? Math.round(sleepStages.total_awake_time_milli / 60000)
            : null,
          respiratory_rate: sleepScore?.respiratory_rate || null,
          source: "whoop",
        };

        // Match recovery data by cycle_id or sleep_id (WHOOP links recovery to specific sleep/cycle)
        const recovery = recoveryData.records.find(
          (r: any) =>
            r.cycle_id === sleep.cycle_id ||
            r.sleep_id === sleep.id ||
            r.sleep_id === sleep.v1_id ||
            // Also try matching by date (recovery created_at vs sleep end date)
            r.created_at?.split("T")[0] === date
        );
        if (recovery?.score) {
          metricsData.recovery_score = recovery.score.recovery_score;
          metricsData.hrv_ms = Math.round(recovery.score.hrv_rmssd_milli);
          metricsData.resting_hr = Math.round(
            recovery.score.resting_heart_rate
          );
        }

        // Upsert daily metrics
        const { data: existing } = await (supabase as any)
          .from("daily_metrics")
          .select("id")
          .eq("user_id", user.id)
          .eq("date", date)
          .limit(1);

        if (existing && existing.length > 0) {
          const { error: updateError } = await (supabase as any)
            .from("daily_metrics")
            .update(metricsData)
            .eq("id", existing[0].id);

          if (!updateError) updated++;
          else console.error("Update error:", updateError);
        } else {
          const { error: insertError } = await (supabase as any)
            .from("daily_metrics")
            .insert({
              user_id: user.id,
              ...metricsData,
            });

          if (!insertError) synced++;
          else console.error("Insert error:", insertError);
        }
      }
    } // End sleep processing

    // Get sports mapping for workouts
    const { data: sports } = await (supabase as any)
      .from("sports")
      .select("id, name");
    const sportMap = new Map<string, string>(
      (sports?.map((s: any) => [s.name, s.id]) as [string, string][]) || []
    );

    // Process workout data - import as activities for TSS calculation
    // Only import if no Strava activity exists for the same time period (avoid duplicates)
    let workoutsSynced = 0;
    let workoutsSkipped = 0;
    let workoutsMatched = 0;

    if (syncWorkouts) {
      for (const workout of workoutData.records) {
        // Check if workout already exists from WHOOP
        const { data: existingWhoop } = await (supabase as any)
          .from("activities")
          .select("id")
          .eq("user_id", user.id)
          .eq("source", "whoop")
          .eq("external_id", String(workout.id))
          .limit(1);

        if (existingWhoop && existingWhoop.length > 0) continue;

        // Check if a Strava activity exists for the same time period (deduplication)
        // Look for activities on the same date with similar duration (±30 min start time)
        const workoutDate = workout.start.split("T")[0];
        const workoutStart = new Date(workout.start);
        const workoutDuration = Math.round(
          (new Date(workout.end).getTime() - workoutStart.getTime()) / 60000
        );

        // Check for existing Strava activities on the same date
        const { data: stravaActivities } = await (supabase as any)
          .from("activities")
          .select("id, completed_date, actual_duration_minutes")
          .eq("user_id", user.id)
          .eq("source", "strava")
          .eq("scheduled_date", workoutDate);

        // Check if any Strava activity matches (within 60 min window and similar duration)
        let isDuplicate = false;
        if (stravaActivities && stravaActivities.length > 0) {
          for (const stravaActivity of stravaActivities) {
            if (stravaActivity.completed_date) {
              const stravaStart = new Date(stravaActivity.completed_date);
              const timeDiff =
                Math.abs(workoutStart.getTime() - stravaStart.getTime()) /
                60000; // minutes
              const durationDiff = Math.abs(
                workoutDuration - (stravaActivity.actual_duration_minutes || 0)
              );

              // Match if start times are within 60 min and durations are within 20 min
              if (timeDiff < 60 && durationDiff < 20) {
                isDuplicate = true;
                console.log(
                  `WHOOP workout skipped (duplicate of Strava): ${workoutDate}, duration ${workoutDuration}min`
                );
                break;
              }
            }
          }
        }

        if (isDuplicate) {
          workoutsSkipped++;
          continue;
        }

        // Map WHOOP sport type to our sport
        const sportType = mapWhoopSportType(workout.sport_id);
        const sportId = sportMap.get(sportType) || sportMap.get("other");

        if (!sportId) continue;

        // Calculate TSS from WHOOP strain (strain 0-21 maps roughly to 0-200+ TSS)
        // Strain is a logarithmic scale, so we use exponential conversion
        const strain = workout.score?.strain || 0;
        const tss = Math.round(Math.pow(strain / 21, 2) * 200);

        const titlePrefix = sportType
          .split("_")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        const workoutPayload: ImportedActivityData = {
          title: `WHOOP ${titlePrefix || "Workout"} Workout`,
          description: null,
          scheduled_date: workoutDate,
          completed_date: workout.end,
          status: "completed",
          actual_duration_minutes: workoutDuration,
          actual_distance_km:
            typeof workout.score?.distance_meter === "number"
              ? Math.round(workout.score.distance_meter / 10) / 100
              : null,
          elevation_gain_m:
            typeof workout.score?.altitude_gain_meter === "number"
              ? Math.round(workout.score.altitude_gain_meter)
              : null,
          avg_hr: workout.score?.average_heart_rate
            ? Math.round(workout.score.average_heart_rate)
            : null,
          max_hr: workout.score?.max_heart_rate
            ? Math.round(workout.score.max_heart_rate)
            : null,
          avg_power_watts: null,
          tss,
          source: "whoop",
          external_id: String(workout.id),
          raw_data: workout as unknown as ImportedActivityData["raw_data"],
        };

        const matchedPlan = await matchPlannedWorkout(supabase as any, {
          userId: user.id,
          sportId,
          scheduledDate: workoutDate,
          data: workoutPayload,
        });

        if (matchedPlan) {
          workoutsSynced++;
          workoutsMatched++;
          continue;
        }

        const { error: insertError } = await (supabase as any)
          .from("activities")
          .insert({
            user_id: user.id,
            sport_id: sportId,
            ...workoutPayload,
          });

        if (!insertError) workoutsSynced++;
      }
    } // End workout processing

    // Also add strain to daily_metrics for each day (if strain enabled)
    if (syncStrain && workoutData.records.length > 0) {
      for (const workout of workoutData.records) {
        const date = workout.start.split("T")[0];
        const strain = workout.score?.strain || 0;

        // Update daily_metrics with strain data
        const { data: existing } = await (supabase as any)
          .from("daily_metrics")
          .select("id, strain")
          .eq("user_id", user.id)
          .eq("date", date)
          .limit(1);

        if (existing && existing.length > 0) {
          // Add strain to existing record (accumulate if multiple workouts)
          const currentStrain = existing[0].strain || 0;
          await (supabase as any)
            .from("daily_metrics")
            .update({ strain: Math.max(currentStrain, strain) })
            .eq("id", existing[0].id);
        } else {
          await (supabase as any).from("daily_metrics").insert({
            user_id: user.id,
            date,
            strain,
            source: "whoop",
          });
        }
      }
    } // End strain processing

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
      updated,
      workoutsSynced,
      workoutsSkipped, // Skipped because already in Strava
      workoutsMatchedToPlan: workoutsMatched,
      totalSleep: sleepData.records.length,
      totalRecovery: recoveryData.records.length,
      totalWorkouts: workoutData.records.length,
    });
  } catch (error) {
    console.error("WHOOP sync error:", error);
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
