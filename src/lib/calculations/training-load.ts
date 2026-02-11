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

// Joe Friel's TSS per hour for each RPE level (1-10 scale)
const FRIEL_TSS_PER_HOUR: Record<number, number> = {
  1: 10,
  2: 20,
  3: 30,
  4: 40,
  5: 50,
  6: 60,
  7: 70,
  8: 80,
  9: 90,
  10: 100,
};

// TRIMP gender-specific constants (Banister exponential weighting)
const TRIMP_K_MALE = 1.92;
const TRIMP_K_FEMALE = 1.67;
const TRIMP_BASE_COEFFICIENT = 0.64;

// ============================================================================
// HELPER FUNCTIONS FOR NORMALIZATION
// ============================================================================

/**
 * Calculate rolling average to the 4th power (used in NP algorithm)
 * This emphasizes high-intensity efforts
 */
function calculateNormalizedValue(values: number[]): number {
  if (!values || values.length === 0) return 0;

  // Rolling 30-second average (assuming 1 Hz data, or scale if different)
  const windowSize = Math.max(1, Math.min(30, values.length));
  const rollingAverages: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(values.length, i + Math.ceil(windowSize / 2));
    const sum = values.slice(start, end).reduce((a, b) => a + b, 0);
    const avg = sum / (end - start);
    rollingAverages.push(avg);
  }

  // Raise to 4th power
  const fourthPowers = rollingAverages.map((v) => Math.pow(v, 4));

  // Average the 4th powers
  const meanFourthPower =
    fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length;

  // Take the 4th root
  const normalized = Math.pow(meanFourthPower, 0.25);

  return normalized;
}

/**
 * Calculate Minetti cost factor for grade-adjusted pace
 * Used in NGP (Normalized Graded Pace) calculation for running
 */
function calculateMinettiCost(gradient: number): number {
  const i = gradient; // gradient as decimal (e.g., 0.05 = 5%)
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

// ============================================================================
// TSS CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate hrTSS (Heart Rate TSS) using TRIMP with exponential weighting
 *
 * Formula: TRIMP = Σ(dt × HRR × 0.64 × e^(k × HRR))
 * where HRR = (HR - HR_rest) / (HR_max - HR_rest)
 * Normalized by TRIMP at LTHR for 1 hour
 * Result: hrTSS = (TRIMP_activity / TRIMP_threshold) × 100
 */
export function calculateHrTSS(params: {
  hrStream?: number[];
  avgHr?: number;
  hrRest: number;
  hrMax: number;
  lthr: number;
  durationSeconds: number;
  gender?: "male" | "female";
}): number {
  const {
    hrStream,
    avgHr,
    hrRest,
    hrMax,
    lthr,
    durationSeconds,
    gender = "male",
  } = params;

  // Validation
  if (
    !durationSeconds ||
    !hrMax ||
    !lthr ||
    hrMax <= hrRest ||
    (!hrStream && !avgHr)
  ) {
    return 0;
  }

  const k = gender === "female" ? TRIMP_K_FEMALE : TRIMP_K_MALE;

  // Calculate TRIMP threshold (1 hour at LTHR)
  const lthrr = Math.max(0, Math.min(1, (lthr - hrRest) / (hrMax - hrRest)));
  const trimpThreshold =
    60 * lthrr * TRIMP_BASE_COEFFICIENT * Math.exp(k * lthrr);

  let trimp = 0;

  if (hrStream && hrStream.length > 0) {
    // Calculate TRIMP second-by-second
    for (const hr of hrStream) {
      const hrr = Math.max(0, Math.min(1, (hr - hrRest) / (hrMax - hrRest)));
      const secondTrimp =
        (1 / 60) * hrr * TRIMP_BASE_COEFFICIENT * Math.exp(k * hrr);
      trimp += secondTrimp;
    }
  } else if (avgHr) {
    // Simplified TRIMP using average HR
    const durationMinutes = durationSeconds / 60;
    const hrr = Math.max(0, Math.min(1, (avgHr - hrRest) / (hrMax - hrRest)));
    trimp = durationMinutes * hrr * TRIMP_BASE_COEFFICIENT * Math.exp(k * hrr);
  }

  const hrTss = (trimp / trimpThreshold) * 100;
  return Math.round(hrTss);
}

/**
 * Calculate rTSS (Running TSS) using Normalized Graded Pace (NGP)
 *
 * NGP accounts for elevation changes using Minetti cost coefficients
 * Then applies NP normalization algorithm: rolling 30s → ^4 → mean → ^0.25
 *
 * Formula: rTSS = duration_hours × IF² × 100
 * where IF = NGP_speed / FTPace_speed
 */
export function calculateRTSS(params: {
  speedStream?: number[];
  distanceStream?: number[];
  altitudeStream?: number[];
  avgPacePerKm?: number;
  distanceKm?: number;
  durationSeconds: number;
  thresholdPacePerKm: number;
}): number {
  const {
    speedStream,
    distanceStream,
    altitudeStream,
    avgPacePerKm,
    durationSeconds,
    thresholdPacePerKm,
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
      // Calculate grade-adjusted speeds
      const adjustedSpeeds: number[] = [];
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
      // No elevation data, use speed directly
      ngpSpeed = calculateNormalizedValue(speedStream);
    }
  } else if (avgPacePerKm) {
    // Fallback: use average pace without normalization
    ngpSpeed = 1000 / avgPacePerKm; // convert to m/s
  } else {
    return 0; // No pace data available
  }

  // Convert threshold pace to speed
  const ftpaceSpeed = 1000 / thresholdPacePerKm; // m/s

  // Calculate intensity factor
  const intensityFactor = ngpSpeed / ftpaceSpeed;

  // Calculate rTSS
  const durationHours = durationSeconds / 3600;
  const rTss = durationHours * intensityFactor * intensityFactor * 100;

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
  powerStream?: number[];
  avgPowerWatts?: number;
  ftp: number;
  durationSeconds: number;
}): number {
  const { powerStream, avgPowerWatts, ftp, durationSeconds } = params;

  // Validation
  if (!ftp || ftp <= 0 || !durationSeconds) {
    return 0;
  }

  let normalizedPower = 0;

  if (powerStream && powerStream.length > 0) {
    normalizedPower = calculateNormalizedValue(powerStream);
  } else if (avgPowerWatts) {
    normalizedPower = avgPowerWatts;
  } else {
    return 0; // No power data
  }

  // Calculate intensity factor
  const intensityFactor = normalizedPower / ftp;

  // Calculate TSS
  const durationHours = durationSeconds / 3600;
  const tss = durationHours * intensityFactor * intensityFactor * 100;

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

  // Power data (cycling)
  powerStream?: number[];
  avgPowerWatts?: number;
  ftp?: number;

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
      durationSeconds,
      gender,
    });
    if (tss > 0) return { tss, type: "hrtss" };
  }

  // Priority 5: RPE-based estimation
  if (rpe && rpe >= 1 && rpe <= 10) {
    const tss = estimateTSSFromRPE({
      rpe,
      durationSeconds,
    });
    if (tss > 0) return { tss, type: "rpe" };
  }

  // Priority 6: Duration-based fallback estimation
  const baseRates: Record<string, number> = {
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
