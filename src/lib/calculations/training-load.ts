/**
 * Training Load Calculations - TrainingPeaks formulas
 *
 * CTL (Chronic Training Load) - Forme long terme (42 jours)
 * CTL_j = CTL_{j-1} + (TSS_j - CTL_{j-1}) / 42
 *
 * ATL (Acute Training Load) - Fatigue court terme (7 jours)
 * ATL_j = ATL_{j-1} + (TSS_j - ATL_{j-1}) / 7
 *
 * TSB (Training Stress Balance) - Fraîcheur
 * TSB_j = CTL_{j-1} - ATL_{j-1}  (⚠️ utilise les valeurs de la VEILLE)
 *
 * TSS (Training Stress Score) is calculated per activity
 */

/**
 * Calcule le HrTSS (Heart Rate Training Stress Score)
 * Basé sur le modèle standard TrainingPeaks/Coggan
 */
export function calculateHrTSS(
  movingTimeSeconds: number,
  avgHr: number,
  lthr: number
): number {
  if (!movingTimeSeconds || !avgHr || !lthr || lthr === 0) {
    return 0;
  }

  const intensityFactor = avgHr / lthr;
  const durationInHours = movingTimeSeconds / 3600;
  const hrTss = durationInHours * intensityFactor * intensityFactor * 100;

  return Math.round(hrTss);
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

// Time constants for TrainingPeaks formulas
const ATL_TIME_CONSTANT = 7; // 7 days for acute load (fatigue)
const CTL_TIME_CONSTANT = 42; // 42 days for chronic load (fitness)

/**
 * Calculate new value using TrainingPeaks formula
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
 * Calculate Training Stress Score (TSS) for a running activity
 * TSS = (duration_seconds * NGP * IF) / (FTP * 3600) * 100
 *
 * Simplified formula using heart rate:
 * TSS = (duration_minutes * hrTss_per_hour) / 60
 * hrTss_per_hour = ((avgHR - hrRest) / (hrMax - hrRest)) ^ 1.92 * 100
 */
export function calculateRunningTSS(
  durationMinutes: number,
  avgHR: number,
  hrMax: number,
  hrRest: number
): number {
  if (!avgHR || !hrMax || !hrRest || hrMax <= hrRest) {
    // Fallback: estimate based on duration and RPE
    return Math.round(durationMinutes * 0.8); // ~48 TSS per hour at moderate intensity
  }

  const hrReserve = (avgHR - hrRest) / (hrMax - hrRest);
  const intensityFactor = Math.pow(Math.max(0, Math.min(1, hrReserve)), 1.92);
  const hrTssPerHour = intensityFactor * 100;

  return Math.round((durationMinutes * hrTssPerHour) / 60);
}

/**
 * Calculate TSS for cycling using power data
 * TSS = (duration_seconds * NP * IF) / (FTP * 3600) * 100
 * where IF = NP / FTP
 */
export function calculateCyclingTSS(
  durationMinutes: number,
  normalizedPower: number,
  ftp: number
): number {
  if (!normalizedPower || !ftp || ftp <= 0) {
    // Fallback: estimate based on duration
    return Math.round(durationMinutes * 0.9);
  }

  const intensityFactor = normalizedPower / ftp;
  const tss =
    ((durationMinutes * 60 * normalizedPower * intensityFactor) /
      (ftp * 3600)) *
    100;

  return Math.round(tss);
}

/**
 * Calculate TSS for swimming
 * Uses a similar approach to running but with different constants
 */
export function calculateSwimmingTSS(
  durationMinutes: number,
  avgPace100m: number, // seconds per 100m
  css100m: number // Critical Swim Speed in seconds per 100m
): number {
  if (!avgPace100m || !css100m || css100m <= 0) {
    // Fallback: lower TSS for swimming (typically lower stress)
    return Math.round(durationMinutes * 0.7);
  }

  // Intensity based on pace vs CSS
  const intensityFactor = css100m / avgPace100m; // Faster = higher intensity
  const tss = Math.pow(intensityFactor, 3) * durationMinutes;

  return Math.round(Math.min(tss, durationMinutes * 2)); // Cap at 2x duration
}

/**
 * Estimate TSS from RPE (Rate of Perceived Exertion)
 * Useful when no other data is available
 */
export function estimateTSSFromRPE(
  durationMinutes: number,
  rpe: number // 1-10 scale
): number {
  // RPE 5 = ~60 TSS/hour (moderate)
  // RPE 7 = ~80 TSS/hour (hard)
  // RPE 9 = ~100+ TSS/hour (very hard)

  const rpeToIntensity: Record<number, number> = {
    1: 0.2,
    2: 0.3,
    3: 0.4,
    4: 0.5,
    5: 0.6,
    6: 0.7,
    7: 0.8,
    8: 0.9,
    9: 1.0,
    10: 1.2,
  };

  const intensity = rpeToIntensity[Math.round(rpe)] || 0.6;
  return Math.round(durationMinutes * intensity);
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
      advice: "Vous pouvez augmenter la charge ou planifier une compétition.",
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
