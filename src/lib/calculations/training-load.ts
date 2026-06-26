/**
 * Training Load Calculations - TrainingPeaks Aligned Formulas
 *
 * This module implements all 5 TrainingPeaks TSS (Training Stress Score) types:
 * 1. TSS   - Power-based (cycling) using Normalized Power (NP)
 * 2. rTSS  - Running TSS using Normalized Graded Pace (NGP)
 * 3. sTSS  - Swimming TSS using Critical Swim Speed (CSS)
 * 4. hrTSS - Heart Rate TSS using TRIMP (Training Impulse) with exponential weighting
 * 5. RPE   - Rate of Perceived Exertion based TSS using Friel's table
 *
 * CTL/ATL/TSB Formulas (unchanged from original):
 * CTL_j = CTL_{j-1} + (TSS_j - CTL_{j-1}) / 42   (42-day chronic load)
 * ATL_j = ATL_{j-1} + (TSS_j - ATL_{j-1}) / 7    (7-day acute load)
 * TSB_j = CTL_{j-1} - ATL_{j-1}                  (⚠️ uses PREVIOUS day's values)
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type TSSSType = "tss" | "rtss" | "stss" | "hrtss" | "rpe" | "estimated";

export interface TSSSResult {
  tss: number;
  type: TSSSType;
}

interface Activity {
  date: string;
  tss: number;
}

interface DailyLoad {
  date: string;
  dailyTss: number;
  atl: number;
  ctl: number;
  tsb: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Time constants for TrainingPeaks formulas
const ATL_TIME_CONSTANT = 7; // 7 days for acute load (fatigue)
const CTL_TIME_CONSTANT = 42; // 42 days for chronic load (fitness)

// Friel TSS per hour by RPE (1-10 scale) — source: "Estimating TSS from RPE or Average Heart Rate"
const FRIEL_TSS_PER_HOUR: Record<number, number> = {
  1: 20,
  2: 30,
  3: 40,
  4: 50,
  5: 60,
  6: 70,
  7: 80,
  8: 100,
  9: 120,
  10: 140,
};


// ============================================================================
// HELPER FUNCTIONS FOR NORMALIZATION
// ============================================================================

/**
 * Calculate rolling average to the 4th power (used in NP algorithm)
 * Uses TIME-BASED 30-second window when timeStream available (most accurate)
 * Falls back to POINT-BASED 30-point window for uniform 1Hz data
 * Algorithm: rolling_avg[i] = mean(values in 30s window), then ^4, mean, ^0.25
 */
function calculateNormalizedValue(
  values: number[],
  timeStream?: number[],
  streamName?: string // For logging
): number {
  if (!values || values.length === 0) return 0;

  const rollingAverages: number[] = [];
  let windowUsed = "point-based";

  // Prefer time-based 30-second window if timeStream is available
  if (timeStream && timeStream.length === values.length && timeStream.length > 1) {
    windowUsed = "time-based";

    // Time-based 30-second trailing window
    for (let i = 0; i < values.length; i++) {
      const currentTime = timeStream[i];
      const targetStart = currentTime - 30; // 30 seconds back

      // Find all points within the 30-second window
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

      if (count > 0) {
        rollingAverages.push(sum / count);
      }
    }
  } else {
    // Fallback: point-based 30-point window (assumes ~1Hz sampling)
    const windowSize = 30;
    for (let i = Math.min(windowSize - 1, values.length - 1); i < values.length; i++) {
      let sum = 0;
      for (let j = i - (windowSize - 1); j <= i; j++) {
        sum += values[j];
      }
      rollingAverages.push(sum / windowSize);
    }
  }

  if (rollingAverages.length === 0) {
    // Not enough data for 30s window, use simple average
    const simple = values.reduce((a, b) => a + b, 0) / values.length;
    console.log(
      `[NormValue] ${streamName || "unknown"} - Insufficient data (${values.length} pts), using simple avg: ${simple.toFixed(2)}`
    );
    return simple;
  }

  // Cap outlier rolling averages at 2× median to prevent GPS spikes
  const sortedRA = [...rollingAverages].sort((a, b) => a - b);
  const medianRA = sortedRA[Math.floor(sortedRA.length / 2)];
  const capRA = medianRA * 2;
  const cappedRA = rollingAverages.map(v => Math.min(v, capRA));

  // Raise to 4th power
  const fourthPowers = cappedRA.map((v) => Math.pow(v, 4));

  // Average the 4th powers
  const meanFourthPower =
    fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length;

  // Take the 4th root
  const normalized = Math.pow(meanFourthPower, 0.25);

  // Log stats
  const minRollingAvg = Math.min(...rollingAverages);
  const maxRollingAvg = Math.max(...rollingAverages);
  const avgWindowSize = values.length / rollingAverages.length;

  console.log(
    `[NormValue] ${streamName || "unknown"} - ${windowUsed} window: ` +
      `${values.length} pts → ${rollingAverages.length} rolling avgs (avg ${avgWindowSize.toFixed(1)} pts/window), ` +
      `range=${minRollingAvg.toFixed(2)}-${maxRollingAvg.toFixed(2)} → ` +
      `normalized=${normalized.toFixed(2)}`
  );

  return normalized;
}

/**
 * Calculate Minetti cost factor for grade-adjusted pace
 * Used in NGP (Normalized Graded Pace) calculation for running
 * Gradient is clamped to [-0.3, 0.3] to avoid polynomial divergence
 */
function calculateMinettiCost(gradient: number): number {
  // Clamp gradient to valid range to avoid polynomial divergence
  const i = Math.max(-0.3, Math.min(0.3, gradient)); // gradient as decimal (e.g., 0.05 = 5%)
  const cost =
    155.4 * Math.pow(i, 5) -
    30.4 * Math.pow(i, 4) -
    43.3 * Math.pow(i, 3) +
    46.3 * Math.pow(i, 2) +
    19.5 * i +
    3.6;
  const flatCost = 3.6;
  const rawFactor = cost / flatCost;

  // Dampen grade adjustment to match TrainingPeaks behavior
  // GPS altitude noise + Minetti polynomial creates excessive speed inflation
  // on hilly terrain. TP uses device barometric data which is much smoother.
  // Calibrated against 18 TP running activities: damping=0.50 optimal.
  const GRADE_DAMPING = 0.50;
  return 1 + (rawFactor - 1) * GRADE_DAMPING;
}

// ============================================================================
// TSS CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate Normalized Heart Rate (NHR) from HR stream using Coggan ^4 algorithm.
 * 30-second rolling averages → raise to 4th power → mean → 4th root.
 */
function calculateNHR(
  hrStream: number[],
  timeStream?: number[]
): number {
  if (!hrStream || hrStream.length < 30) {
    return hrStream ? hrStream.reduce((a, b) => a + b, 0) / hrStream.length : 0;
  }

  const rollingAverages: number[] = [];

  if (timeStream && timeStream.length === hrStream.length) {
    // Time-based 30s rolling window
    for (let i = 0; i < hrStream.length; i++) {
      const targetStart = timeStream[i] - 30;
      let startIdx = i;
      while (startIdx > 0 && timeStream[startIdx - 1] >= targetStart) startIdx--;
      let sum = 0;
      let count = 0;
      for (let j = startIdx; j <= i; j++) {
        sum += hrStream[j];
        count++;
      }
      if (count > 0) rollingAverages.push(sum / count);
    }
  } else {
    // Index-based 30-point rolling window
    for (let i = 29; i < hrStream.length; i++) {
      let sum = 0;
      for (let j = i - 29; j <= i; j++) sum += hrStream[j];
      rollingAverages.push(sum / 30);
    }
  }

  if (rollingAverages.length === 0) {
    return hrStream.reduce((a, b) => a + b, 0) / hrStream.length;
  }

  const mean4th =
    rollingAverages.reduce((s, v) => s + Math.pow(v, 4), 0) /
    rollingAverages.length;
  return Math.pow(mean4th, 0.25);
}

/**
 * Calculate hrTSS using Allen-Coggan IF²-based formula (TrainingPeaks standard).
 *
 * Formula: hrTSS = IF² × hours × 100
 * where IF = NHR / LTHR  (Lactate Threshold HR, not HRmax)
 * effectiveHR = NHR (^4 normalized) from HR stream if available, else avgHR
 *
 * Duration must be moving_time (not elapsed_time) — long stops drop HR to ambient
 * which does not represent training stress, and Coggan ^4 already emphasises
 * high-intensity periods within the recorded stream.
 */
export function calculateHrTSS(params: {
  hrStream?: number[];
  timeStream?: number[];
  avgHr?: number;
  hrRest: number;
  hrMax: number;
  lthr: number;
  durationSeconds: number;
  gender?: "male" | "female";
}): number {
  const { hrStream, timeStream, avgHr, lthr, durationSeconds } = params;

  if (!durationSeconds || !lthr || (!hrStream && !avgHr)) {
    return 0;
  }

  // Compute effective HR: NHR from stream if available, else avgHR
  let effectiveHR = 0;
  if (hrStream && hrStream.length > 0) {
    effectiveHR = calculateNHR(hrStream, timeStream);
  }
  if (effectiveHR <= 0 && avgHr) {
    effectiveHR = avgHr;
  }
  if (effectiveHR <= 0) return 0;

  // IF = (NHR - HRrest) / (LTHR - HRrest)  — Karvonen / heart rate reserve formula
  // Matches TrainingPeaks: at HRrest→IF=0, at LTHR→IF=1 (100 TSS/h)
  const workingHrRange = lthr - params.hrRest;
  const intensityFactor = workingHrRange > 0
    ? (effectiveHR - params.hrRest) / workingHrRange
    : effectiveHR / lthr;
  const durationHours = durationSeconds / 3600;

  const hrTss = intensityFactor * intensityFactor * durationHours * 100;
  return Math.round(hrTss);
}

/**
 * Calculate rTSS (Running TSS) using Normalized Graded Pace (NGP)
 *
 * NGP accounts for elevation changes using Minetti cost coefficients.
 * Uses time-weighted average of grade-adjusted speeds (not Coggan ^4 normalization).
 * Calibrated against 18 TrainingPeaks running activities: time-weighted avg with
 * damping=0.50 gives 4.3% average absolute difference vs TP.
 *
 * Formula: rTSS = duration_hours × IF² × 110
 * where IF = NGP_speed / FTPace_speed
 * Note: TP uses ×110 (not ×100) for running rTSS, accounting for
 * the higher metabolic cost of running (ground impact, eccentric load)
 */
export function calculateRTSS(params: {
  speedStream?: number[];
  distanceStream?: number[];
  altitudeStream?: number[];
  timeStream?: number[]; // For time-weighted NGP calculation
  avgPacePerKm?: number;
  distanceKm?: number;
  durationSeconds: number;
  thresholdPacePerKm: number;
  activityName?: string; // For logging
}): number {
  const {
    speedStream,
    distanceStream,
    altitudeStream,
    timeStream,
    avgPacePerKm,
    durationSeconds,
    thresholdPacePerKm,
    activityName,
  } = params;

  // Validation
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
      // Smooth altitude with distance-based window (±50m) to reduce GPS noise
      const SMOOTH_DISTANCE = 50; // meters
      const smoothedAlt: number[] = new Array(altitudeStream.length);
      for (let si = 0; si < altitudeStream.length; si++) {
        const centerDist = distanceStream[si];
        let sum = altitudeStream[si];
        let count = 1;
        for (let sj = si - 1; sj >= 0 && centerDist - distanceStream[sj] <= SMOOTH_DISTANCE; sj--) {
          sum += altitudeStream[sj];
          count++;
        }
        for (let sj = si + 1; sj < altitudeStream.length && distanceStream[sj] - centerDist <= SMOOTH_DISTANCE; sj++) {
          sum += altitudeStream[sj];
          count++;
        }
        smoothedAlt[si] = sum / count;
      }

      // Calculate grade-adjusted speeds with smoothed altitude
      // Build time-indexed array for time-weighted averaging
      const MIN_GRADE_DISTANCE = 20; // meters
      const gapSpeeds: { time: number; speed: number }[] = [];
      for (let i = 0; i < speedStream.length; i++) {
        // Filter GPS noise
        if (speedStream[i] < 0.5 || speedStream[i] > 8.0) continue;

        let gradient = 0;
        if (i > 0 && distanceStream[i] > distanceStream[i - 1]) {
          let lookback = i;
          while (lookback > 0 && distanceStream[i] - distanceStream[lookback] < MIN_GRADE_DISTANCE) {
            lookback--;
          }
          const gradeDist = distanceStream[i] - distanceStream[lookback];
          if (gradeDist >= MIN_GRADE_DISTANCE) {
            gradient = (smoothedAlt[i] - smoothedAlt[lookback]) / gradeDist;
          }
        }

        const minettiFactor = calculateMinettiCost(gradient);
        const adjustedSpeed = speedStream[i] * minettiFactor;
        if (Number.isFinite(adjustedSpeed) && adjustedSpeed > 0) {
          const time = timeStream && timeStream[i] !== undefined ? timeStream[i] : i;
          gapSpeeds.push({ time, speed: adjustedSpeed });
        }
      }

      // Time-weighted average of grade-adjusted speeds
      // (not Coggan ^4 normalization — calibrated to match TP for running)
      if (gapSpeeds.length > 0) {
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
          ngpSpeed = totalSpeed / totalTime;
        } else {
          ngpSpeed = gapSpeeds.reduce((s, g) => s + g.speed, 0) / gapSpeeds.length;
        }
      }
    } else {
      // No elevation data, use time-weighted average of raw speeds
      if (timeStream && timeStream.length === speedStream.length) {
        let totalSpeed = 0;
        let totalTime = 0;
        for (let i = 1; i < speedStream.length; i++) {
          if (speedStream[i] < 0.5 || speedStream[i] > 8.0) continue;
          const dt = timeStream[i] - timeStream[i - 1];
          if (dt > 0 && dt < 30) {
            totalSpeed += speedStream[i] * dt;
            totalTime += dt;
          }
        }
        if (totalTime > 0) ngpSpeed = totalSpeed / totalTime;
      }
      if (ngpSpeed <= 0) {
        const validSpeeds = speedStream.filter(s => s >= 0.5 && s <= 8.0);
        ngpSpeed = validSpeeds.length > 0
          ? validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length
          : 0;
      }
    }
  } else if (avgPacePerKm) {
    // Fallback: use average pace without normalization
    ngpSpeed = 1000 / avgPacePerKm; // convert to m/s
  } else {
    return 0; // No pace data available
  }

  if (ngpSpeed <= 0) return 0;

  // Convert threshold pace to speed
  const ftpaceSpeed = 1000 / thresholdPacePerKm; // m/s

  // Calculate intensity factor
  const intensityFactor = ngpSpeed / ftpaceSpeed;

  // Calculate rTSS
  const durationHours = durationSeconds / 3600;
  const rTss = durationHours * intensityFactor * intensityFactor * 110;

  // Convert speeds back to pace for logging
  const ngpPacePerKm = 1000 / ngpSpeed;
  const thresholdPaceMinsKm = Math.floor(thresholdPacePerKm / 60) + ":" + String(Math.round(thresholdPacePerKm % 60)).padStart(2, "0");
  const ngpMinsKm = Math.floor(ngpPacePerKm / 60) + ":" + String(Math.round(ngpPacePerKm % 60)).padStart(2, "0");

  console.log(`[rTSS] ${activityName || "running"} - duration=${durationHours.toFixed(2)}h, NGP=${ngpPacePerKm.toFixed(1)}s/km (${ngpMinsKm}/km), FTPace=${thresholdPacePerKm}s/km (${thresholdPaceMinsKm}/km), IF=${intensityFactor.toFixed(2)}, rTSS=${Math.round(rTss)} (×110)`);

  return Math.round(rTss);
}

/**
 * Calculate sTSS (Swimming TSS) using Critical Swim Speed (CSS)
 *
 * Water resistance increases with speed cubed, so IF is cubed (not squared)
 *
 * Formula: sTSS = IF³ × duration_hours × 100
 * where IF = NSS / CSS_speed
 * NSS (Normalized Swim Speed) = distance / time
 */
export function calculateSTSS(params: {
  distanceMeters: number;
  durationSeconds: number;
  cssPer100m: number;
}): number {
  const { distanceMeters, durationSeconds, cssPer100m } = params;

  // Validation
  if (!distanceMeters || !durationSeconds || !cssPer100m || cssPer100m <= 0) {
    return 0;
  }

  // Calculate speeds
  const nss = distanceMeters / durationSeconds; // m/s
  const cssSpeed = 100 / cssPer100m; // m/s

  // Calculate intensity factor
  const intensityFactor = nss / cssSpeed;

  // Calculate sTSS (note: cubed, not squared)
  const durationHours = durationSeconds / 3600;
  const sTss =
    Math.pow(intensityFactor, 3) * durationHours * 100;

  return Math.round(sTss);
}

/**
 * Calculate TSS using RPE (Rate of Perceived Exertion)
 *
 * Uses Joe Friel's official TSS/hour table (1-10 scale)
 * Formula: TSS = FRIEL_TSS_PER_HOUR[rpe] × duration_hours
 */
export function estimateTSSFromRPE(params: {
  rpe: number;
  durationSeconds: number;
}): number {
  const { rpe, durationSeconds } = params;

  if (!durationSeconds || rpe < 1 || rpe > 10) {
    return 0;
  }

  const roundedRpe = Math.round(rpe);
  const tssPerHour = FRIEL_TSS_PER_HOUR[roundedRpe] || 50;
  const durationHours = durationSeconds / 3600;

  return Math.round(tssPerHour * durationHours);
}

/**
 * Calculate TSS for cycling using power data (Normalized Power)
 *
 * Most accurate TSS method when power meter is available
 * Formula: TSS = duration_hours × IF² × 100
 * where IF = NP / FTP
 * NP = Normalized Power (rolling 30s → ^4 → mean → ^0.25)
 */
export function calculateCyclingTSS(params: {
  normalizedPower?: number; // Pre-calculated NP from timeStream (takes priority)
  powerStream?: number[];
  timeStream?: number[]; // For time-based NP normalization
  avgPowerWatts?: number;
  ftp: number;
  durationSeconds: number;
  activityName?: string; // For logging
}): number {
  const { normalizedPower: preCalcNp, powerStream, timeStream, avgPowerWatts, ftp, durationSeconds, activityName } = params;

  // Validation
  if (!ftp || ftp <= 0 || !durationSeconds) {
    return 0;
  }

  let normalizedPower = 0;

  // Priority: use pre-calculated NP (time-based, more accurate for Strava streams)
  if (preCalcNp && preCalcNp > 0) {
    normalizedPower = preCalcNp;
    console.log(`[NormPower] ${activityName || "cycling"} - Using pre-calculated NP: ${preCalcNp}W`);
  } else if (powerStream && powerStream.length > 0) {
    normalizedPower = Math.round(calculateNormalizedValue(powerStream, timeStream, `${activityName}-power`));
    console.log(`[NormPower] ${activityName || "cycling"} - Calculated NP from stream: ${normalizedPower}W`);
  } else if (avgPowerWatts) {
    normalizedPower = avgPowerWatts;
    console.log(`[NormPower] ${activityName || "cycling"} - Using avg power: ${avgPowerWatts}W`);
  } else {
    return 0; // No power data
  }

  // Calculate intensity factor
  const intensityFactor = normalizedPower / ftp;

  // Calculate TSS
  const durationHours = durationSeconds / 3600;
  const tss = durationHours * intensityFactor * intensityFactor * 100;

  console.log(`[CyclingTSS] ${activityName || "cycling"} - duration=${durationHours.toFixed(2)}h, NP=${normalizedPower}W, FTP=${ftp}W, IF=${intensityFactor.toFixed(2)}, TSS=${Math.round(tss)}`);

  return Math.round(tss);
}

/**
 * Orchestrator function that applies TrainingPeaks priority hierarchy
 *
 * Selects the best available TSS calculation method:
 * 1. Power (cycling) → TSS
 * 2. Pace (running) → rTSS
 * 3. Distance+time (swimming) → sTSS
 * 4. Heart Rate → hrTSS
 * 5. RPE → RPE TSS
 * 6. None → estimated fallback
 */
export function calculateActivityTSS(params: {
  sport?: string;
  durationSeconds: number;
  elapsedTimeSeconds?: number; // Total elapsed time (including rest) - used for hrTSS

  // Power data (cycling)
  normalizedPower?: number; // Pre-calculated from streams (takes priority)
  powerStream?: number[];
  avgPowerWatts?: number;
  ftp?: number;
  hasRealPower?: boolean; // true = real sensor, false = Strava-estimated (skip power TSS)

  // Pace data (running)
  speedStream?: number[];
  distanceStream?: number[];
  altitudeStream?: number[];
  avgPacePerKm?: number;
  distanceKm?: number;
  thresholdPacePerKm?: number;

  // Swim data
  distanceMeters?: number;
  cssPer100m?: number;

  // HR data
  hrStream?: number[];
  timeStream?: number[]; // For accurate TRIMP dt calculation
  avgHr?: number;
  hrRest?: number;
  hrMax?: number;
  lthr?: number;
  gender?: "male" | "female";

  // RPE
  rpe?: number;
}): TSSSResult {
  const {
    sport,
    durationSeconds,
    elapsedTimeSeconds,
    normalizedPower,
    powerStream,
    avgPowerWatts,
    ftp,
    hasRealPower,
    speedStream,
    distanceStream,
    altitudeStream,
    avgPacePerKm,
    distanceKm,
    thresholdPacePerKm,
    distanceMeters,
    cssPer100m,
    hrStream,
    timeStream,
    avgHr,
    hrRest,
    hrMax,
    lthr,
    gender,
    rpe,
  } = params;

  // hrTSS uses moving_time like power/pace TSS: long stops drop HR to ambient
  // and are not training stress. Coggan ^4 already emphasises high-intensity
  // periods within the recorded stream.
  const hrDurationSeconds = durationSeconds;

  // Sanity cap: no single activity should exceed 500 TSS
  const MAX_TSS = 500;
  function capped(result: TSSSResult): TSSSResult {
    if (result.tss > MAX_TSS) {
      console.warn(`[TSS] SANITY CAP: ${sport} TSS=${result.tss} (${result.type}) exceeds ${MAX_TSS}, clamping`);
      return { tss: MAX_TSS, type: result.type };
    }
    return result;
  }

  // Priority 1: Power-based TSS (cycling) — skip if power is Strava-estimated (not a real sensor)
  if (
    sport === "cycling" &&
    hasRealPower !== false &&
    (normalizedPower || powerStream?.length || avgPowerWatts) &&
    ftp &&
    ftp > 0
  ) {
    const tss = calculateCyclingTSS({
      normalizedPower,
      powerStream,
      timeStream,
      avgPowerWatts,
      ftp,
      durationSeconds,
      activityName: `activity`,
    });
    if (tss > 0) return capped({ tss, type: "tss" });
  }

  // Priority 2: Running TSS (pace-based)
  // Use elapsed_time for rTSS duration — TP uses total recording time, not moving time
  if (
    sport === "running" &&
    (speedStream?.length || avgPacePerKm) &&
    thresholdPacePerKm &&
    thresholdPacePerKm > 0
  ) {
    const rtssElapsed = elapsedTimeSeconds && elapsedTimeSeconds > 0
      ? elapsedTimeSeconds
      : durationSeconds;
    const tss = calculateRTSS({
      speedStream,
      distanceStream,
      altitudeStream,
      timeStream,
      avgPacePerKm,
      distanceKm,
      durationSeconds: rtssElapsed,
      thresholdPacePerKm,
      activityName: `activity`,
    });
    if (tss > 0) return capped({ tss, type: "rtss" });
  }

  // Priority 3: Swimming TSS
  if (sport === "swimming" && distanceMeters && cssPer100m && cssPer100m > 0) {
    const tss = calculateSTSS({
      distanceMeters,
      durationSeconds,
      cssPer100m,
    });
    if (tss > 0) return capped({ tss, type: "stss" });
  }

  // Priority 4: Heart Rate TSS (universal fallback)
  // Uses elapsed_time (not moving_time) because the heart works during rest periods too
  if (
    (hrStream?.length || avgHr) &&
    hrRest !== undefined &&
    hrMax &&
    lthr &&
    hrMax > hrRest
  ) {
    const tss = calculateHrTSS({
      hrStream,
      timeStream,
      avgHr,
      hrRest: hrRest || 60,
      hrMax,
      lthr,
      durationSeconds: hrDurationSeconds,
      gender,
    });
    if (tss > 0) return capped({ tss, type: "hrtss" });
  }

  // Priority 5: RPE-based estimation
  if (rpe && rpe >= 1 && rpe <= 10) {
    const tss = estimateTSSFromRPE({
      rpe,
      durationSeconds,
    });
    if (tss > 0) return capped({ tss, type: "rpe" });
  }

  // Priority 6: No usable data → TSS=0, type="estimated"
  return { tss: 0, type: "estimated" };
}

// ============================================================================
// CTL/ATL/TSB CALCULATION (unchanged from original)
// ============================================================================

/**
 * Calculate new value using TrainingPeaks EMA formula
 * newValue = previousValue + (todayTSS - previousValue) / timeConstant
 */
function calculateTrainingPeaksEMA(
  previousValue: number,
  todayTSS: number,
  timeConstant: number
): number {
  return previousValue + (todayTSS - previousValue) / timeConstant;
}

/**
 * Calculate daily training loads (ATL, CTL, TSB) from activity history
 * Using exact TrainingPeaks formulas:
 * - CTL_j = CTL_{j-1} + (TSS_j - CTL_{j-1}) / 42
 * - ATL_j = ATL_{j-1} + (TSS_j - ATL_{j-1}) / 7
 * - TSB_j = CTL_{j-1} - ATL_{j-1}  (uses YESTERDAY's values!)
 */
export function calculateTrainingLoads(
  activities: Activity[],
  startDate: Date,
  endDate: Date,
  initialAtl: number = 0,
  initialCtl: number = 0
): DailyLoad[] {
  // Group activities by date and sum TSS
  const tssByDate = new Map<string, number>();
  for (const activity of activities) {
    const current = tssByDate.get(activity.date) || 0;
    tssByDate.set(activity.date, current + activity.tss);
  }

  const results: DailyLoad[] = [];
  let previousAtl = initialAtl;
  let previousCtl = initialCtl;

  // Iterate through each day from start to end
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split("T")[0];
    const dailyTss = tssByDate.get(dateStr) || 0;

    // TSB uses YESTERDAY's values (TrainingPeaks convention)
    // TSB_j = CTL_{j-1} - ATL_{j-1}
    const tsb = previousCtl - previousAtl;

    // Calculate TODAY's ATL and CTL using TrainingPeaks formulas
    // ATL_j = ATL_{j-1} + (TSS_j - ATL_{j-1}) / 7
    // CTL_j = CTL_{j-1} + (TSS_j - CTL_{j-1}) / 42
    const currentAtl = calculateTrainingPeaksEMA(
      previousAtl,
      dailyTss,
      ATL_TIME_CONSTANT
    );
    const currentCtl = calculateTrainingPeaksEMA(
      previousCtl,
      dailyTss,
      CTL_TIME_CONSTANT
    );

    results.push({
      date: dateStr,
      dailyTss,
      atl: Math.round(currentAtl * 10) / 10,
      ctl: Math.round(currentCtl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
    });

    // Store today's values for tomorrow's TSB calculation
    previousAtl = currentAtl;
    previousCtl = currentCtl;

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return results;
}

/**
 * Get the latest training load values
 */
export function getLatestTrainingLoad(loads: DailyLoad[]): DailyLoad | null {
  if (loads.length === 0) return null;
  return loads[loads.length - 1];
}

/**
 * Calculate weekly TSS total
 */
export function calculateWeeklyTSS(activities: Activity[]): number {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const oneWeekAgoStr = oneWeekAgo.toISOString().split("T")[0];

  return activities
    .filter((a) => a.date >= oneWeekAgoStr)
    .reduce((sum, a) => sum + a.tss, 0);
}

/**
 * Calculate weekly duration in minutes
 */
export function calculateWeeklyDuration(
  activities: { date: string; duration_minutes: number }[]
): number {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const oneWeekAgoStr = oneWeekAgo.toISOString().split("T")[0];

  return activities
    .filter((a) => a.date >= oneWeekAgoStr)
    .reduce((sum, a) => sum + a.duration_minutes, 0);
}

/**
 * Interpret TSB value for UI display
 */
export function interpretTSB(tsb: number): {
  status: "fresh" | "optimal" | "tired" | "exhausted";
  label: string;
  color: string;
  advice: string;
} {
  if (tsb > 25) {
    return {
      status: "fresh",
      label: "Très frais",
      color: "text-secondary",
      advice:
        "Vous pouvez augmenter la charge ou planifier une compétition.",
    };
  } else if (tsb > 5) {
    return {
      status: "fresh",
      label: "Frais",
      color: "text-success",
      advice: "Bonne forme pour une séance intense ou une course.",
    };
  } else if (tsb > -10) {
    return {
      status: "optimal",
      label: "Optimal",
      color: "text-accent",
      advice: "Équilibre idéal entre charge et récupération.",
    };
  } else if (tsb > -30) {
    return {
      status: "tired",
      label: "Fatigué",
      color: "text-warning",
      advice: "Attention à la fatigue, privilégiez la récupération.",
    };
  } else {
    return {
      status: "exhausted",
      label: "Épuisé",
      color: "text-error",
      advice: "Risque de surentraînement. Repos fortement recommandé.",
    };
  }
}

/**
 * Interpret recovery score
 */
export function interpretRecoveryScore(score: number): {
  status: "green" | "yellow" | "red";
  label: string;
  color: string;
  canTrain: boolean;
} {
  if (score >= 67) {
    return {
      status: "green",
      label: "Optimal",
      color: "text-success",
      canTrain: true,
    };
  } else if (score >= 34) {
    return {
      status: "yellow",
      label: "Modéré",
      color: "text-warning",
      canTrain: true,
    };
  } else {
    return {
      status: "red",
      label: "Faible",
      color: "text-error",
      canTrain: false,
    };
  }
}

/**
 * Simple wrapper to calculate training load from TSS data
 * Returns array of { date, atl, ctl, tsb } for charting
 */
export function calculateTrainingLoad(
  tssData: { date: string; tss: number }[]
): { date: string; atl: number; ctl: number; tsb: number }[] {
  if (tssData.length === 0) return [];

  // Sort by date
  const sorted = [...tssData].sort((a, b) => a.date.localeCompare(b.date));

  const DISPLAY_WINDOW_DAYS = 90;
  const endDate = new Date();

  // Aggregate daily TSS to estimate realistic initial ATL/CTL values
  const tssByDate = new Map<string, number>();
  for (const entry of sorted) {
    const current = tssByDate.get(entry.date) || 0;
    tssByDate.set(entry.date, current + entry.tss);
  }

  const uniqueDates = Array.from(tssByDate.keys()).sort((a, b) =>
    a.localeCompare(b)
  );
  const firstDateStr = uniqueDates[0];
  const lastDateStr = uniqueDates[uniqueDates.length - 1];
  const startDate = new Date(firstDateStr);
  const lastTssDate = new Date(lastDateStr);

  const totalAvailableDays =
    Math.floor(
      (lastTssDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
    ) + 1;

  const computeInitialValue = (timeConstant: number): number => {
    if (totalAvailableDays <= 0) {
      return 0;
    }

    const windowDays = Math.min(timeConstant, totalAvailableDays);
    const cursor = new Date(startDate);
    const windowEnd = new Date(startDate);
    windowEnd.setDate(windowEnd.getDate() + windowDays - 1);

    let sum = 0;
    let days = 0;
    while (cursor <= windowEnd) {
      const dateStr = cursor.toISOString().split("T")[0];
      sum += tssByDate.get(dateStr) || 0;
      days += 1;
      cursor.setDate(cursor.getDate() + 1);
    }

    return days === 0 ? 0 : sum / days;
  };

  const initialAtl = computeInitialValue(ATL_TIME_CONSTANT);
  const initialCtl = computeInitialValue(CTL_TIME_CONSTANT);

  // Calculate loads using real data range with estimated initial values
  const loads = calculateTrainingLoads(
    sorted,
    startDate,
    endDate,
    initialAtl,
    initialCtl
  );

  // Keep display window
  const displayStart = new Date(endDate);
  displayStart.setDate(displayStart.getDate() - DISPLAY_WINDOW_DAYS);
  const filteredLoads = loads.filter((load) => {
    const loadDate = new Date(load.date);
    return loadDate >= displayStart;
  });

  // Return simplified format for charting
  return filteredLoads.map((l) => ({
    date: l.date,
    atl: l.atl,
    ctl: l.ctl,
    tsb: l.tsb,
  }));
}
