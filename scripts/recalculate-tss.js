#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Recalculate TSS for all activities using the updated TrainingPeaks-aligned formulas
 * This script fetches all activities and recalculates their TSS values with the corrections:
 * - Proper TRIMP coefficients (gender-specific)
 * - Default thresholds for running/cycling
 * - Correct NGP/NP algorithms
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env.local");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(ENV_PATH);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE env vars. Check .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// TRIMP gender-specific constants (Banister 1991)
const TRIMP_COEFFICIENTS = {
  male: { base: 0.64, k: 1.92 },
  female: { base: 0.86, k: 1.67 },
};

// Default thresholds when user hasn't configured them
const DEFAULTS = {
  thresholdPacePerKm: 330, // 5:30/km = 330 s/km (recreational runner)
  ftp: 200, // 200W (recreational cyclist)
  hrMax: 190,
  hrRest: 60,
  lthr: 168, // ~88% of 190
};

function calculateMinettiCost(gradient) {
  // Clamp gradient to [-0.3, 0.3] to avoid polynomial divergence
  const i = Math.max(-0.3, Math.min(0.3, gradient));
  const cost =
    155.4 * Math.pow(i, 5) -
    30.4 * Math.pow(i, 4) -
    43.3 * Math.pow(i, 3) +
    46.3 * Math.pow(i, 2) +
    19.5 * i +
    3.6;
  const flatCost = 3.6;
  return cost / flatCost;
}

function calculateNormalizedValue(values) {
  if (!values || values.length === 0) return 0;

  const windowSize = 30;
  const rollingAverages = [];

  // Trailing 30-point window (Coggan algorithm)
  for (let i = Math.min(windowSize - 1, values.length - 1); i < values.length; i++) {
    let sum = 0;
    for (let j = i - (windowSize - 1); j <= i; j++) {
      sum += values[j];
    }
    rollingAverages.push(sum / windowSize);
  }

  if (rollingAverages.length === 0) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  const fourthPowers = rollingAverages.map((v) => Math.pow(v, 4));
  const meanFourthPower =
    fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length;
  const normalized = Math.pow(meanFourthPower, 0.25);

  return normalized;
}

function calculateHrTSS(params) {
  const {
    hrStream,
    avgHr,
    hrRest,
    hrMax,
    lthr,
    durationSeconds,
    gender = "male",
  } = params;

  if (
    !durationSeconds ||
    !hrMax ||
    !lthr ||
    hrMax <= hrRest ||
    (!hrStream && !avgHr)
  ) {
    return 0;
  }

  const coeff = TRIMP_COEFFICIENTS[gender] || TRIMP_COEFFICIENTS.male;

  // Calculate TRIMP threshold (1 hour at LTHR)
  const lthrr = Math.max(0, Math.min(1, (lthr - hrRest) / (hrMax - hrRest)));
  const trimpThreshold =
    60 * lthrr * coeff.base * Math.exp(coeff.k * lthrr);

  let trimp = 0;

  if (hrStream && hrStream.length > 0) {
    const dtMinutes = (durationSeconds / hrStream.length) / 60;
    for (const hr of hrStream) {
      const hrr = Math.max(0, Math.min(1, (hr - hrRest) / (hrMax - hrRest)));
      trimp += dtMinutes * hrr * coeff.base * Math.exp(coeff.k * hrr);
    }
  } else if (avgHr) {
    const durationMinutes = durationSeconds / 60;
    const hrr = Math.max(0, Math.min(1, (avgHr - hrRest) / (hrMax - hrRest)));
    trimp = durationMinutes * hrr * coeff.base * Math.exp(coeff.k * hrr);
  }

  const hrTss = (trimp / trimpThreshold) * 100;
  return Math.round(hrTss);
}

function calculateRTSS(params) {
  const {
    speedStream,
    distanceStream,
    altitudeStream,
    avgPacePerKm,
    durationSeconds,
    thresholdPacePerKm,
  } = params;

  if (!durationSeconds || !thresholdPacePerKm || thresholdPacePerKm <= 0) {
    return 0;
  }

  let ngpSpeed = 0; // m/s

  if (speedStream && speedStream.length > 0) {
    // Try to calculate NGP with grade adjustment
    if (
      distanceStream &&
      distanceStream.length > 0 &&
      altitudeStream &&
      altitudeStream.length > 0
    ) {
      const adjustedSpeeds = [];
      for (let i = 0; i < speedStream.length; i++) {
        let gradient = 0;
        if (i > 0 && distanceStream[i] > distanceStream[i - 1]) {
          const distDiff = distanceStream[i] - distanceStream[i - 1];
          const altDiff = altitudeStream[i] - altitudeStream[i - 1];
          gradient = altDiff / distDiff;
        }

        const minettiFactor = calculateMinettiCost(gradient);
        const adjustedSpeed = speedStream[i] * minettiFactor;
        adjustedSpeeds.push(adjustedSpeed);
      }
      ngpSpeed = calculateNormalizedValue(adjustedSpeeds);
    } else {
      ngpSpeed = calculateNormalizedValue(speedStream);
    }
  } else if (avgPacePerKm) {
    ngpSpeed = 1000 / avgPacePerKm;
  } else {
    return 0;
  }

  const ftpaceSpeed = 1000 / thresholdPacePerKm;
  const intensityFactor = ngpSpeed / ftpaceSpeed;
  const durationHours = durationSeconds / 3600;
  const rTss = durationHours * intensityFactor * intensityFactor * 100;

  return Math.round(rTss);
}

function calculateCyclingTSS(params) {
  const { powerStream, avgPowerWatts, ftp, durationSeconds } = params;

  if (!ftp || ftp <= 0 || !durationSeconds) {
    return 0;
  }

  let normalizedPower = 0;

  if (powerStream && powerStream.length > 0) {
    normalizedPower = calculateNormalizedValue(powerStream);
  } else if (avgPowerWatts) {
    normalizedPower = avgPowerWatts;
  } else {
    return 0;
  }

  const intensityFactor = normalizedPower / ftp;
  const durationHours = durationSeconds / 3600;
  const tss = durationHours * intensityFactor * intensityFactor * 100;

  return Math.round(tss);
}

function calculateSTSS(params) {
  const { distanceMeters, durationSeconds, cssPer100m } = params;

  if (!distanceMeters || !durationSeconds || !cssPer100m || cssPer100m <= 0) {
    return 0;
  }

  const nss = distanceMeters / durationSeconds;
  const cssSpeed = 100 / cssPer100m;
  const intensityFactor = nss / cssSpeed;
  const durationHours = durationSeconds / 3600;
  const sTss = Math.pow(intensityFactor, 3) * durationHours * 100;

  return Math.round(sTss);
}

/**
 * Orchestrator function that selects the best TSS calculation method
 */
function calculateActivityTSS(params) {
  const {
    sport,
    durationSeconds,
    elapsedTimeSeconds,
    powerStream,
    avgPowerWatts,
    ftp,
    speedStream,
    distanceStream,
    altitudeStream,
    avgPacePerKm,
    distanceKm,
    thresholdPacePerKm,
    distanceMeters,
    cssPer100m,
    hrStream,
    avgHr,
    hrRest,
    hrMax,
    lthr,
    gender,
    rpe,
  } = params;

  const hrDurationSeconds =
    elapsedTimeSeconds && elapsedTimeSeconds > 0
      ? elapsedTimeSeconds
      : durationSeconds;

  // Priority 1: Power-based TSS (cycling)
  if (
    sport === "cycling" &&
    (powerStream?.length || avgPowerWatts) &&
    ftp &&
    ftp > 0
  ) {
    const tss = calculateCyclingTSS({
      powerStream,
      avgPowerWatts,
      ftp,
      durationSeconds,
    });
    if (tss > 0) return { tss, type: "tss" };
  }

  // Priority 2: Running TSS (pace-based)
  if (
    sport === "running" &&
    (speedStream?.length || avgPacePerKm) &&
    thresholdPacePerKm &&
    thresholdPacePerKm > 0
  ) {
    const tss = calculateRTSS({
      speedStream,
      distanceStream,
      altitudeStream,
      avgPacePerKm,
      distanceKm,
      durationSeconds,
      thresholdPacePerKm,
    });
    if (tss > 0) return { tss, type: "rtss" };
  }

  // Priority 3: Swimming TSS
  if (sport === "swimming" && distanceMeters && cssPer100m && cssPer100m > 0) {
    const tss = calculateSTSS({
      distanceMeters,
      durationSeconds,
      cssPer100m,
    });
    if (tss > 0) return { tss, type: "stss" };
  }

  // Priority 4: Heart Rate TSS (universal fallback)
  if (
    (hrStream?.length || avgHr) &&
    hrRest !== undefined &&
    hrMax &&
    lthr &&
    hrMax > hrRest
  ) {
    const tss = calculateHrTSS({
      hrStream,
      avgHr,
      hrRest: hrRest || 60,
      hrMax,
      lthr,
      durationSeconds: hrDurationSeconds,
      gender,
    });
    if (tss > 0) return { tss, type: "hrtss" };
  }

  // Priority 5: RPE-based estimation
  const FRIEL_TSS_PER_HOUR = {
    1: 10, 2: 20, 3: 30, 4: 40, 5: 50,
    6: 60, 7: 70, 8: 80, 9: 90, 10: 100,
  };
  if (rpe && rpe >= 1 && rpe <= 10) {
    const roundedRpe = Math.round(rpe);
    const tssPerHour = FRIEL_TSS_PER_HOUR[roundedRpe] || 50;
    const durationHours = durationSeconds / 3600;
    const tss = Math.round(tssPerHour * durationHours);
    if (tss > 0) return { tss, type: "rpe" };
  }

  // Priority 6: Duration-based fallback estimation
  const baseRates = {
    cycling: 60,
    running: 90,
    swimming: 55,
    other: 45,
  };
  const baseRate = baseRates[sport || "other"] || 45;
  const durationHours = durationSeconds / 3600;
  const estimatedTss = Math.round(baseRate * durationHours);

  return { tss: estimatedTss, type: "estimated" };
}

/**
 * Main recalculation function
 */
async function recalculateTSS() {
  console.log("🔄 Starting TSS recalculation...\n");

  try {
    // Fetch all users
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, gender");

    if (usersError) throw usersError;

    console.log(`📊 Found ${users.length} users\n`);

    let totalRecalculated = 0;
    let totalErrors = 0;

    for (const user of users) {
      const userId = user.id;
      const userGender = user.gender || "male";

      // Fetch user physiological data
      const { data: physioData } = await supabase
        .from("physiological_data")
        .select("hr_max, hr_rest, lthr")
        .eq("user_id", userId)
        .limit(1);

      // Fetch user sports data
      const { data: userSports } = await supabase
        .from("user_sports")
        .select("ftp_watts, threshold_pace_per_km, vma_kmh, css_per_100m");

      const userHrMax = physioData?.[0]?.hr_max ?? DEFAULTS.hrMax;
      const userHrRest = physioData?.[0]?.hr_rest ?? DEFAULTS.hrRest;
      const userLthr =
        physioData?.[0]?.lthr ?? Math.round(userHrMax * 0.88);
      const userFtp = userSports?.find((s) => s.ftp_watts)?.ftp_watts ?? DEFAULTS.ftp;
      const userThresholdPace =
        userSports?.find((s) => s.threshold_pace_per_km)?.threshold_pace_per_km ??
        DEFAULTS.thresholdPacePerKm;

      // Fetch all activities for user
      const { data: activities, error: activitiesError } = await supabase
        .from("activities")
        .select("id, sport_id, actual_duration_minutes, actual_distance_km, avg_hr, max_hr, avg_power_watts, raw_data, tss")
        .eq("user_id", userId);

      if (activitiesError) {
        console.log(`  ❌ Error fetching activities for user ${userId}: ${activitiesError.message}`);
        totalErrors++;
        continue;
      }

      if (activities.length === 0) {
        continue;
      }

      console.log(`👤 User ${userId.substring(0, 8)}... (${activities.length} activities)`);

      // Get sport name mapping
      const { data: sports } = await supabase
        .from("sports")
        .select("id, name");
      const sportMap = new Map(sports?.map((s) => [s.id, s.name]) || []);

      for (const activity of activities) {
        try {
          const sportName = sportMap.get(activity.sport_id);
          let sport = undefined;
          if (sportName === "running" || sportName === "trail_running") {
            sport = "running";
          } else if (sportName === "cycling" || sportName === "spin") {
            sport = "cycling";
          } else if (sportName === "swimming") {
            sport = "swimming";
          }

          const durationMinutes = activity.actual_duration_minutes || 0;
          const durationSeconds = durationMinutes * 60;
          const elapsedTime = durationSeconds; // Use moving time as elapsed time
          const distanceKm = activity.actual_distance_km || 0;
          const avgPacePerKm =
            distanceKm > 0 && durationMinutes > 0
              ? (durationMinutes / distanceKm) * 60 // Convert minutes/km to seconds/km
              : undefined;

          const rawData = activity.raw_data || {};
          const streams = rawData._streams || {};

          const tssResult = calculateActivityTSS({
            sport,
            durationSeconds,
            elapsedTimeSeconds: elapsedTime,
            avgPowerWatts: activity.avg_power_watts,
            ftp: userFtp,
            avgPacePerKm,
            distanceKm: distanceKm || undefined,
            thresholdPacePerKm: userThresholdPace,
            distanceMeters: sport === "swimming" ? activity.distance : undefined,
            avgHr: activity.avg_hr,
            hrRest: userHrRest,
            hrMax: userHrMax,
            lthr: userLthr,
            gender: userGender,
          });

          const newTss = tssResult.tss;
          const oldTss = activity.tss || 0;

          if (newTss !== oldTss) {
            await supabase
              .from("activities")
              .update({ tss: newTss })
              .eq("id", activity.id);

            totalRecalculated++;
            const change = newTss - oldTss;
            const changePercent = oldTss > 0 ? ((change / oldTss) * 100).toFixed(1) : "N/A";
            console.log(
              `    ✓ Activity: TSS ${oldTss} → ${newTss} (${change > 0 ? "+" : ""}${change}, ${changePercent}%)`
            );
          }
        } catch (error) {
          console.log(`    ❌ Error processing activity: ${error.message}`);
          totalErrors++;
        }
      }

      console.log();
    }

    console.log("\n✅ Recalculation complete!");
    console.log(`📈 Total activities recalculated: ${totalRecalculated}`);
    if (totalErrors > 0) {
      console.log(`⚠️  Total errors: ${totalErrors}`);
    }
  } catch (error) {
    console.error("❌ Fatal error:", error.message);
    process.exit(1);
  }
}

// Run the script
recalculateTSS().then(() => {
  process.exit(0);
});
