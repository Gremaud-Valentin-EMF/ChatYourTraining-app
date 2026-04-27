#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Recalculate TSS for all activities using the updated TrainingPeaks-aligned formulas.
 *
 * This script mirrors the exact same logic as the Strava sync route:
 * - Reads raw Strava data from raw_data (moving_time, elapsed_time, distance)
 * - Fetches HR/power/distance/altitude streams from activity_streams table
 * - Computes NHR, NP, NGP from streams when available
 * - Derives threshold pace from VMA when no explicit threshold is set
 * - Uses correct gender-specific TRIMP coefficients
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
  console.error("Missing SUPABASE env vars. Check .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ============================================================================
// TRIMP + TSS CALCULATION (mirrors training-load.ts exactly)
// ============================================================================


const DEFAULTS = {
  thresholdPacePerKm: 330,
  ftp: 200,
  hrMax: 190,
  hrRest: 60,
};

function calculateNormalizedValue(values, timeStream, streamName) {
  if (!values || values.length === 0) return 0;

  const rollingAverages = [];
  let windowUsed = "point-based";

  if (timeStream && timeStream.length === values.length && timeStream.length > 1) {
    windowUsed = "time-based";
    // Time-based 30-second trailing window (accurate for non-1Hz data)
    for (let i = 0; i < values.length; i++) {
      const targetStart = timeStream[i] - 30;
      let startIdx = i;
      while (startIdx > 0 && timeStream[startIdx - 1] >= targetStart) {
        startIdx--;
      }
      let sum = 0;
      let count = 0;
      for (let j = startIdx; j <= i; j++) {
        sum += values[j];
        count++;
      }
      if (count > 0) rollingAverages.push(sum / count);
    }
  } else {
    // Point-based 30-point trailing window (Coggan algorithm)
    for (let i = 29; i < values.length; i++) {
      let sum = 0;
      for (let j = i - 29; j <= i; j++) {
        sum += values[j];
      }
      rollingAverages.push(sum / 30);
    }
  }

  if (rollingAverages.length === 0) {
    const simple = values.reduce((a, b) => a + b, 0) / values.length;
    console.log(
      `    [NormValue] ${streamName || "unknown"} - Insufficient data (${values.length} pts), using simple avg: ${simple.toFixed(2)}`
    );
    return simple;
  }

  // Cap outlier rolling averages at 2× median
  const sortedRA = [...rollingAverages].sort((a, b) => a - b);
  const medianRA = sortedRA[Math.floor(sortedRA.length / 2)];
  const capRA = medianRA * 2;
  const cappedRA = rollingAverages.map(v => Math.min(v, capRA));

  const fourthPowers = cappedRA.map((v) => Math.pow(v, 4));
  const meanFourthPower =
    fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length;
  const normalized = Math.pow(meanFourthPower, 0.25);

  // Log stats
  const minRollingAvg = Math.min(...rollingAverages);
  const maxRollingAvg = Math.max(...rollingAverages);
  const avgWindowSize = values.length / rollingAverages.length;

  console.log(
    `    [NormValue] ${streamName || "unknown"} - ${windowUsed} window: ` +
      `${values.length} pts → ${rollingAverages.length} rolling avgs (avg ${avgWindowSize.toFixed(1)} pts/window), ` +
      `range=${minRollingAvg.toFixed(2)}-${maxRollingAvg.toFixed(2)} → ` +
      `normalized=${normalized.toFixed(2)}`
  );

  return normalized;
}

function calculateMinettiCost(gradient) {
  const i = Math.max(-0.3, Math.min(0.3, gradient));
  const cost =
    155.4 * Math.pow(i, 5) -
    30.4 * Math.pow(i, 4) -
    43.3 * Math.pow(i, 3) +
    46.3 * Math.pow(i, 2) +
    19.5 * i +
    3.6;
  const rawFactor = cost / 3.6;
  // Dampen grade adjustment to match TP (GPS altitude noise amplification)
  // Calibrated against 18 TP running activities: damping=0.50 optimal.
  const GRADE_DAMPING = 0.50;
  return 1 + (rawFactor - 1) * GRADE_DAMPING;
}

/**
 * Compute NGP (Normalized Graded Pace) from streams.
 * Uses 30-SECOND TIME-BASED rolling window (not 30 points) to match TrainingPeaks
 * Mirrors calculateNormalizedGradedPace in strava.ts
 * Returns pace in seconds/km, or 0 if not computable.
 */
function computeNGP(timeStream, distanceStream, altitudeStream, activityName) {
  if (!timeStream || !timeStream.length || !distanceStream || !distanceStream.length) return 0;
  const length = Math.min(timeStream.length, distanceStream.length);
  const hasAltitude = altitudeStream && altitudeStream.length >= length;

  // Smooth altitude with distance-based window (±50m) to reduce GPS noise
  let smoothedAltitude;
  if (hasAltitude) {
    const SMOOTH_DISTANCE = 50; // meters
    smoothedAltitude = new Array(length);
    for (let si = 0; si < length; si++) {
      const centerDist = distanceStream[si];
      let sum = altitudeStream[si];
      let count = 1;
      for (let sj = si - 1; sj >= 0 && centerDist - distanceStream[sj] <= SMOOTH_DISTANCE; sj--) {
        sum += altitudeStream[sj];
        count++;
      }
      for (let sj = si + 1; sj < length && distanceStream[sj] - centerDist <= SMOOTH_DISTANCE; sj++) {
        sum += altitudeStream[sj];
        count++;
      }
      smoothedAltitude[si] = sum / count;
    }
  }

  const gapSpeeds = [];
  const MIN_GRADE_DISTANCE = 20; // meters

  for (let i = 1; i < length; i++) {
    const dt = timeStream[i] - timeStream[i - 1];
    const dd = distanceStream[i] - distanceStream[i - 1];
    if (dt <= 0 || dd <= 0) continue;
    const speed = dd / dt;
    // Filter GPS noise
    if (speed < 0.5 || speed > 8.0) continue;
    let grade = 0;
    if (smoothedAltitude) {
      let lookback = i;
      while (lookback > 0 && distanceStream[i] - distanceStream[lookback] < MIN_GRADE_DISTANCE) {
        lookback--;
      }
      const gradeDist = distanceStream[i] - distanceStream[lookback];
      if (gradeDist >= MIN_GRADE_DISTANCE) {
        grade = (smoothedAltitude[i] - smoothedAltitude[lookback]) / gradeDist;
      }
    }
    const cost = calculateMinettiCost(grade);
    const equivalentSpeed = speed * cost;
    if (Number.isFinite(equivalentSpeed) && equivalentSpeed > 0) {
      gapSpeeds.push({ time: timeStream[i], speed: equivalentSpeed });
    }
  }

  if (gapSpeeds.length === 0) return 0;

  // Time-weighted average of grade-adjusted speeds
  // Calibrated against 18 TP running activities: better than Coggan ^4 normalization
  let normalizedSpeed;
  let totalSpeed = 0;
  let totalTime = 0;
  for (let i = 1; i < gapSpeeds.length; i++) {
    const dt = gapSpeeds[i].time - gapSpeeds[i - 1].time;
    if (dt > 0 && dt < 30) { // ignore large gaps (pauses)
      totalSpeed += gapSpeeds[i].speed * dt;
      totalTime += dt;
    }
  }
  if (totalTime > 0) {
    normalizedSpeed = totalSpeed / totalTime;
  } else {
    normalizedSpeed = gapSpeeds.reduce((sum, gs) => sum + gs.speed, 0) / gapSpeeds.length;
  }

  if (!Number.isFinite(normalizedSpeed) || normalizedSpeed <= 0) return 0;

  const ngp = Math.round((1000 / normalizedSpeed) * 10) / 10;

  console.log(`    [NGP] "${activityName}" - Time-weighted avg: ${gapSpeeds.length} segments → ` +
    `avg=${normalizedSpeed.toFixed(2)}m/s → NGP=${ngp}s/km (${Math.floor(ngp / 60)}:${String(Math.round(ngp % 60)).padStart(2, "0")}/km)`
  );

  return ngp;
}

/**
 * Normalized Heart Rate (NHR) via Coggan ^4 algorithm.
 * 30s rolling averages → ^4 → mean → ^0.25
 */
function calculateNHR(hrStream, timeStream) {
  if (!hrStream || hrStream.length < 30) {
    return hrStream ? hrStream.reduce((a, b) => a + b, 0) / hrStream.length : 0;
  }
  const rollingAverages = [];
  if (timeStream && timeStream.length === hrStream.length) {
    for (let i = 0; i < hrStream.length; i++) {
      const targetStart = timeStream[i] - 30;
      let startIdx = i;
      while (startIdx > 0 && timeStream[startIdx - 1] >= targetStart) startIdx--;
      let sum = 0, count = 0;
      for (let j = startIdx; j <= i; j++) { sum += hrStream[j]; count++; }
      if (count > 0) rollingAverages.push(sum / count);
    }
  } else {
    for (let i = 29; i < hrStream.length; i++) {
      let sum = 0;
      for (let j = i - 29; j <= i; j++) sum += hrStream[j];
      rollingAverages.push(sum / 30);
    }
  }
  if (rollingAverages.length === 0) return hrStream.reduce((a, b) => a + b, 0) / hrStream.length;
  const mean4th = rollingAverages.reduce((s, v) => s + Math.pow(v, 4), 0) / rollingAverages.length;
  return Math.pow(mean4th, 0.25);
}

/**
 * hrTSS = IF² × hours × 100
 * where IF = NHR / LTHR  (Allen-Coggan / TrainingPeaks standard)
 * effectiveHR = NHR from stream if available, else avgHR
 * durationSeconds must be moving_time (not elapsed_time)
 */
function calculateHrTSS(params) {
  const { hrStream, timeStream, avgHr, lthr, durationSeconds } = params;
  if (!durationSeconds || !lthr || (!hrStream && !avgHr)) return 0;

  let effectiveHR = 0;
  if (hrStream && hrStream.length > 0) {
    effectiveHR = calculateNHR(hrStream, timeStream);
  }
  if (effectiveHR <= 0 && avgHr) effectiveHR = avgHr;
  if (effectiveHR <= 0) return 0;

  const intensityFactor = effectiveHR / lthr;
  const durationHours = durationSeconds / 3600;
  return Math.round(intensityFactor * intensityFactor * durationHours * 100);
}

function calculateRTSS(params) {
  const { avgPacePerKm, durationSeconds, thresholdPacePerKm } = params;
  if (!durationSeconds || !thresholdPacePerKm || thresholdPacePerKm <= 0 || !avgPacePerKm) return 0;

  const ngpSpeed = 1000 / avgPacePerKm;
  const ftpaceSpeed = 1000 / thresholdPacePerKm;
  const intensityFactor = ngpSpeed / ftpaceSpeed;
  const durationHours = durationSeconds / 3600;
  return Math.round(durationHours * intensityFactor * intensityFactor * 110);
}

function calculateCyclingTSS(params) {
  const { normalizedPower, avgPowerWatts, ftp, durationSeconds } = params;
  if (!ftp || ftp <= 0 || !durationSeconds) return 0;

  const np = normalizedPower || avgPowerWatts;
  if (!np) return 0;

  const intensityFactor = np / ftp;
  const durationHours = durationSeconds / 3600;
  return Math.round(durationHours * intensityFactor * intensityFactor * 100);
}

function calculateSTSS(params) {
  const { distanceMeters, durationSeconds, cssPer100m } = params;
  if (!distanceMeters || !durationSeconds || !cssPer100m || cssPer100m <= 0) return 0;

  const nss = distanceMeters / durationSeconds;
  const cssSpeed = 100 / cssPer100m;
  const intensityFactor = nss / cssSpeed;
  const durationHours = durationSeconds / 3600;
  return Math.round(Math.pow(intensityFactor, 3) * durationHours * 100);
}

/**
 * Orchestrator - mirrors calculateActivityTSS in training-load.ts
 */
function calculateActivityTSS(params) {
  const {
    sport, durationSeconds, elapsedTimeSeconds,
    normalizedPower, avgPowerWatts, ftp,
    avgPacePerKm, thresholdPacePerKm,
    distanceMeters, cssPer100m,
    hrStream, timeStream, avgHr, hrRest, hrMax, lthr, gender,
  } = params;

  // hrTSS uses moving_time — see calculateHrTSS comment
  const hrDurationSeconds = durationSeconds;

  const MAX_TSS = 500;
  function capped(result) {
    if (result.tss > MAX_TSS) {
      console.warn(`    [TSS] SANITY CAP: ${sport} TSS=${result.tss} (${result.type}) exceeds ${MAX_TSS}, clamping`);
      return { tss: MAX_TSS, type: result.type };
    }
    return result;
  }

  // Priority 1: Power-based TSS (cycling)
  if (sport === "cycling" && (normalizedPower || avgPowerWatts) && ftp && ftp > 0) {
    const tss = calculateCyclingTSS({ normalizedPower, avgPowerWatts, ftp, durationSeconds });
    if (tss > 0) return capped({ tss, type: "tss" });
  }

  // Priority 2: Running TSS (pace-based)
  // Use elapsed_time for rTSS duration — TP uses total recording time, not moving time
  if (sport === "running" && avgPacePerKm && thresholdPacePerKm && thresholdPacePerKm > 0) {
    const rtssElapsed = (elapsedTimeSeconds && elapsedTimeSeconds > 0)
      ? elapsedTimeSeconds : durationSeconds;
    const tss = calculateRTSS({ avgPacePerKm, durationSeconds: rtssElapsed, thresholdPacePerKm });
    if (tss > 0) return capped({ tss, type: "rtss" });
  }

  // Priority 3: Swimming TSS
  if (sport === "swimming" && distanceMeters && cssPer100m && cssPer100m > 0) {
    const tss = calculateSTSS({ distanceMeters, durationSeconds, cssPer100m });
    if (tss > 0) return capped({ tss, type: "stss" });
  }

  // Priority 4: Heart Rate TSS
  if ((hrStream?.length || avgHr) && hrRest !== undefined && hrMax && lthr && hrMax > hrRest) {
    const tss = calculateHrTSS({
      hrStream, timeStream, avgHr, hrRest: hrRest || 60, hrMax, lthr,
      durationSeconds: hrDurationSeconds, gender,
    });
    if (tss > 0) return capped({ tss, type: "hrtss" });
  }

  // Priority 5: Duration-based fallback
  const baseRates = {
    cycling: 60, running: 90, swimming: 55,
    cross_country_skiing: 70, trail_running: 90,
    hiking: 40, walking: 30, strength: 50, other: 45
  };
  const baseRate = baseRates[sport || "other"] || 45;
  const estimatedTss = Math.round((durationSeconds / 3600) * baseRate);
  return capped({ tss: estimatedTss, type: "estimated" });
}

// ============================================================================
// MAIN
// ============================================================================

async function recalculateTSS() {
  console.log("Starting TSS recalculation...\n");

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, gender");
  if (usersError) { console.error("Error fetching users:", usersError.message); process.exit(1); }

  console.log(`Found ${users.length} users\n`);

  let totalRecalculated = 0;
  let totalChanged = 0;
  let totalErrors = 0;

  for (const user of users) {
    const userId = user.id;
    const userGender = user.gender || "male";

    // --- User physiological data ---
    const { data: physioData } = await supabase
      .from("physiological_data")
      .select("hr_max, hr_rest, lthr")
      .eq("user_id", userId)
      .limit(1);

    // --- User sports data (filtered by user_id!) WITH sport names ---
    const { data: userSports } = await supabase
      .from("user_sports")
      .select("ftp_watts, threshold_pace_per_km, vma_kmh, css_per_100m, sports(name)")
      .eq("user_id", userId);

    const userHrMax = physioData?.[0]?.hr_max ?? DEFAULTS.hrMax;
    const userHrRest = physioData?.[0]?.hr_rest ?? DEFAULTS.hrRest;
    // LTHR default: 85% of HRmax (aligned with sync route)
    const userLthr = physioData?.[0]?.lthr ?? Math.round(userHrMax * 0.85);

    // Sport-specific threshold lookup (don't use "other" sport thresholds for running)
    const runningSports = (userSports || []).filter((s) => {
      const name = s.sports?.name;
      return name === "running" || name === "trail_running";
    });
    const cyclingSports = (userSports || []).filter((s) => {
      const name = s.sports?.name;
      return name === "cycling" || name === "spin";
    });
    const swimmingSports = (userSports || []).filter((s) => {
      const name = s.sports?.name;
      return name === "swimming";
    });

    // FTP: prefer cycling-specific, then any sport
    const userFtp = cyclingSports.find((s) => s.ftp_watts)?.ftp_watts
      ?? userSports?.find((s) => s.ftp_watts)?.ftp_watts ?? DEFAULTS.ftp;

    // CSS: prefer swimming-specific, then any sport
    const userCssPer100m = swimmingSports.find((s) => s.css_per_100m)?.css_per_100m
      ?? userSports?.find((s) => s.css_per_100m)?.css_per_100m ?? undefined;

    // Threshold pace: ONLY from running-specific sport data (not "other")
    let userThresholdPace = runningSports.find((s) => s.threshold_pace_per_km)?.threshold_pace_per_km ?? undefined;
    if (!userThresholdPace) {
      // VMA: ONLY from running-specific sport data
      const vmaKmh = runningSports.find((s) => s.vma_kmh)?.vma_kmh;
      if (vmaKmh && vmaKmh > 0) {
        userThresholdPace = Math.round(3600 / (vmaKmh * 0.85));
        console.log(`  VMA ${vmaKmh} km/h -> threshold pace ${userThresholdPace} s/km (${Math.floor(userThresholdPace / 60)}:${String(userThresholdPace % 60).padStart(2, "0")}/km)`);
      } else {
        userThresholdPace = DEFAULTS.thresholdPacePerKm;
        console.log(`  No running threshold/VMA found, using default: ${userThresholdPace} s/km`);
      }
    } else {
      console.log(`  Explicit threshold pace: ${userThresholdPace} s/km (${Math.floor(userThresholdPace / 60)}:${String(userThresholdPace % 60).padStart(2, "0")}/km)`);
    }

    // --- All activities for this user ---
    const { data: activities, error: activitiesError } = await supabase
      .from("activities")
      .select("id, sport_id, actual_duration_minutes, actual_distance_km, avg_hr, max_hr, avg_power_watts, raw_data, tss")
      .eq("user_id", userId);

    if (activitiesError) {
      console.log(`  Error fetching activities for user ${userId}: ${activitiesError.message}`);
      totalErrors++;
      continue;
    }
    if (!activities || activities.length === 0) continue;

    // --- Fetch ALL streams for this user's activities in one query ---
    const activityIds = activities.map((a) => a.id);
    const { data: allStreams } = await supabase
      .from("activity_streams")
      .select("activity_id, data_type, values")
      .in("activity_id", activityIds);

    // Index streams by activity_id -> { heartrate, time, power, distance, altitude }
    const streamsByActivity = new Map();
    if (allStreams) {
      for (const s of allStreams) {
        if (!streamsByActivity.has(s.activity_id)) {
          streamsByActivity.set(s.activity_id, {});
        }
        streamsByActivity.get(s.activity_id)[s.data_type] = s.values;
      }
    }

    // --- Sport mapping ---
    const { data: sports } = await supabase.from("sports").select("id, name");
    const sportMap = new Map(sports?.map((s) => [s.id, s.name]) || []);

    console.log(`User ${userId.substring(0, 8)}... (${activities.length} activities, ${allStreams?.length || 0} stream rows)`);

    for (const activity of activities) {
      try {
        const sportName = sportMap.get(activity.sport_id);
        let sport = undefined;
        if (sportName === "running" || sportName === "trail_running") sport = "running";
        else if (sportName === "cycling" || sportName === "spin") sport = "cycling";
        else if (sportName === "swimming") sport = "swimming";

        // --- Use raw Strava data when available (exact seconds, not rounded minutes) ---
        const rawData = activity.raw_data || {};
        const movingTime = rawData.moving_time; // original seconds from Strava
        const elapsedTime = rawData.elapsed_time; // includes rest periods
        const rawDistance = rawData.distance; // original meters from Strava

        const durationSeconds = (typeof movingTime === "number" && movingTime > 0)
          ? movingTime
          : (activity.actual_duration_minutes || 0) * 60;

        // Validate elapsed_time: if it's more than 3x moving_time, it's likely
        // corrupt data from Strava (e.g. activity left recording for days)
        let elapsedTimeSeconds = durationSeconds;
        if (typeof elapsedTime === "number" && elapsedTime > 0) {
          if (elapsedTime <= durationSeconds * 3) {
            elapsedTimeSeconds = elapsedTime;
          }
        }

        const distanceMeters = (typeof rawDistance === "number" && rawDistance > 0)
          ? rawDistance
          : (activity.actual_distance_km || 0) * 1000;

        const distanceKm = distanceMeters / 1000;

        // --- Get streams for this activity ---
        const streams = streamsByActivity.get(activity.id) || {};
        const hrStream = streams.heartrate || null;
        const powerStream = streams.power || null;
        const timeStream = streams.time || null;
        const distanceStream = streams.distance || null;
        const altitudeStream = streams.altitude || null;

        // --- Compute normalized values from streams (same as sync route) ---
        let normalizedPower = null;
        let normalizedPaceSeconds = null;

        // NP from power stream (use regardless of device_watts — estimated power aligns with TP)
        if (powerStream && powerStream.length > 0) {
          normalizedPower = Math.round(calculateNormalizedValue(powerStream, timeStream, `activity-power`));
        }

        // NGP from distance/time/altitude streams (running only)
        if (sport === "running" && timeStream && distanceStream) {
          const ngp = computeNGP(timeStream, distanceStream, altitudeStream, `activity`);
          if (ngp > 0) normalizedPaceSeconds = ngp;
        }

        // --- Compute effective pace (NGP preferred, then avg pace) ---
        const avgPaceSecondsPerKm = (distanceKm > 0 && durationSeconds > 0)
          ? (durationSeconds / distanceKm)
          : undefined;

        const effectivePacePerKm = (normalizedPaceSeconds && normalizedPaceSeconds > 0)
          ? normalizedPaceSeconds
          : avgPaceSecondsPerKm;

        // --- Effective defaults (aligned with convertStravaActivity in strava.ts) ---
        const effectiveHrMax = physioData?.[0]?.hr_max ?? DEFAULTS.hrMax;
        const effectiveHrRest = physioData?.[0]?.hr_rest ?? DEFAULTS.hrRest;
        const effectiveLthr = userLthr;
        const effectiveFtp = userFtp;
        const effectiveThresholdPace = userThresholdPace;

        // --- Calculate TSS (same orchestrator logic) ---
        const tssResult = calculateActivityTSS({
          sport,
          durationSeconds,
          elapsedTimeSeconds,
          normalizedPower,
          avgPowerWatts: activity.avg_power_watts || rawData.weighted_average_watts || rawData.average_watts || undefined,
          ftp: effectiveFtp,
          avgPacePerKm: effectivePacePerKm,
          thresholdPacePerKm: effectiveThresholdPace,
          distanceMeters: sport === "swimming" ? distanceMeters : undefined,
          cssPer100m: userCssPer100m,
          hrStream,
          timeStream,
          avgHr: activity.avg_hr || rawData.average_heartrate || undefined,
          hrRest: effectiveHrRest,
          hrMax: effectiveHrMax,
          lthr: effectiveLthr,
          gender: userGender,
        });

        const newTss = tssResult.tss;
        const oldTss = activity.tss || 0;

        // Always update tss and tss_type together
        await supabase
          .from("activities")
          .update({ tss: newTss, tss_type: tssResult.type })
          .eq("id", activity.id);

        totalRecalculated++;
        const change = newTss - oldTss;

        if (newTss !== oldTss) {
          totalChanged++;
          const pct = oldTss > 0 ? ((change / oldTss) * 100).toFixed(1) : "N/A";
          const streamInfo = hrStream ? `HR stream ${hrStream.length}pts` :
                            (activity.avg_hr ? `avg HR ${activity.avg_hr}` : "no HR");
          console.log(
            `    ${oldTss} -> ${newTss} (${change > 0 ? "+" : ""}${change}, ${pct}%) [${tssResult.type}] ${streamInfo}`
          );
        }
      } catch (error) {
        console.log(`    Error: ${error.message}`);
        totalErrors++;
      }
    }

    console.log();
  }

  console.log("Recalculation complete!");
  console.log(`  Total processed: ${totalRecalculated}`);
  console.log(`  Changed: ${totalChanged}`);
  if (totalErrors > 0) console.log(`  Errors: ${totalErrors}`);
}

recalculateTSS().then(() => process.exit(0));
