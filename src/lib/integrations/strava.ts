import type { Json } from "@/types/database";
import type { ImportedActivityData } from "@/lib/integrations/sync-helpers";
import {
  calculateActivityTSS as calculateActivityTSSOrchestrator,
} from "@/lib/calculations/training-load";

/**
 * Strava API Integration
 * Documentation: https://developers.strava.com/docs/reference/
 */

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface StravaAthlete {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  profile: string;
  profile_medium: string;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number; // meters
  average_speed: number; // m/s
  max_speed: number; // m/s
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  device_watts?: boolean; // true if power from a sensor, false if estimated by Strava
  kilojoules?: number;
  suffer_score?: number;
  workout_type?: number;
  description?: string;
  calories?: number;
  map?: {
    summary_polyline: string;
  };
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<StravaTokens> {
  const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to exchange Strava code for tokens");
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
}

/**
 * Refresh expired tokens
 */
export async function refreshTokens(
  refreshToken: string
): Promise<StravaTokens> {
  const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Strava tokens");
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
}

/**
 * Get athlete profile
 */
export async function getAthlete(accessToken: string): Promise<StravaAthlete> {
  const response = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Strava athlete");
  }

  return response.json();
}

/**
 * Get athlete activities
 */
export async function getActivities(
  accessToken: string,
  params: {
    before?: number; // Epoch timestamp
    after?: number; // Epoch timestamp
    page?: number;
    per_page?: number;
  } = {}
): Promise<StravaActivity[]> {
  const searchParams = new URLSearchParams();
  if (params.before) searchParams.set("before", String(params.before));
  if (params.after) searchParams.set("after", String(params.after));
  if (params.page) searchParams.set("page", String(params.page));
  if (params.per_page)
    searchParams.set("per_page", String(params.per_page || 30));

  const response = await fetch(
    `${STRAVA_API_BASE}/athlete/activities?${searchParams}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Strava activities");
  }

  return response.json();
}

/**
 * Get single activity details
 */
export async function getActivity(
  accessToken: string,
  activityId: number
): Promise<StravaActivity> {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Strava activity");
  }

  return response.json();
}

/**
 * Strava Streams API types
 */
export interface StravaStream {
  type: string;
  data: number[];
  series_type: string;
  original_size: number;
  resolution: string;
}

export interface StravaStreamsResponse {
  heartrate?: StravaStream;
  time?: StravaStream;
  watts?: StravaStream;
  cadence?: StravaStream;
  distance?: StravaStream;
  altitude?: StravaStream;
}

/**
 * Get activity streams (second-by-second data)
 * Keys: time, heartrate, watts, cadence, altitude, distance, etc.
 */
export async function getActivityStreams(
  accessToken: string,
  activityId: number,
  keys: string[] = ["heartrate", "time"]
): Promise<StravaStreamsResponse> {
  const response = await fetch(
    `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=${keys.join(
      ","
    )}&key_by_type=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      // No streams available for this activity
      return {};
    }
    throw new Error(`Failed to fetch activity streams: ${response.status}`);
  }

  return response.json();
}

/**
 * Calculate Normalized Heart Rate (NHR) from HR stream data
 * Similar to Normalized Power calculation (Coggan's algorithm):
 * 1. Calculate 30-second rolling average (using timeStream for accuracy)
 * 2. Raise each 30s average to the 4th power
 * 3. Take the mean of all values
 * 4. Take the 4th root
 *
 * This accounts for the physiological lag and gives more weight to high-intensity efforts
 */
export function calculateNormalizedHeartRate(hrData: number[], timeStream?: number[]): number {
  if (!hrData || hrData.length < 2) {
    // Not enough data
    if (hrData && hrData.length > 0) {
      return Math.round(hrData.reduce((a, b) => a + b, 0) / hrData.length);
    }
    return 0;
  }

  // Use time-based 30-second window if available, otherwise use 30-point window
  const rollingAverages: number[] = [];

  if (timeStream && timeStream.length === hrData.length) {
    // Time-based rolling average (more accurate for non-1Hz data)
    for (let i = 0; i < hrData.length; i++) {
      const targetStart = timeStream[i] - 30;
      let startIdx = i;
      while (startIdx > 0 && timeStream[startIdx - 1] >= targetStart) {
        startIdx--;
      }

      let sum = 0;
      let count = 0;
      for (let j = startIdx; j <= i; j++) {
        sum += hrData[j];
        count++;
      }
      if (count > 0) {
        rollingAverages.push(sum / count);
      }
    }
  } else {
    // Point-based rolling average (30 points)
    for (let i = 29; i < hrData.length; i++) {
      let sum = 0;
      for (let j = i - 29; j <= i; j++) {
        sum += hrData[j];
      }
      rollingAverages.push(sum / 30);
    }
  }

  if (rollingAverages.length === 0) {
    return Math.round(hrData.reduce((a, b) => a + b, 0) / hrData.length);
  }

  // Raise each to the 4th power and take mean
  const fourthPowers = rollingAverages.map((hr) => Math.pow(hr, 4));
  const meanFourthPower =
    fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length;

  // Take 4th root to get Normalized Heart Rate
  const nhr = Math.pow(meanFourthPower, 0.25);

  return Math.round(nhr);
}

/**
 * Calculate Normalized Power (NP) from power stream data
 * Same algorithm as NHR but for power
 */
export function calculateNormalizedPower(powerData: number[], timeStream?: number[]): number {
  if (!powerData || powerData.length < 2) {
    if (powerData && powerData.length > 0) {
      return Math.round(
        powerData.reduce((a, b) => a + b, 0) / powerData.length
      );
    }
    return 0;
  }

  // Use time-based 30-second window if available, otherwise use 30-point window
  const rollingAverages: number[] = [];

  if (timeStream && timeStream.length === powerData.length) {
    // Time-based rolling average (more accurate for non-1Hz data)
    for (let i = 0; i < powerData.length; i++) {
      const targetStart = timeStream[i] - 30;
      let startIdx = i;
      while (startIdx > 0 && timeStream[startIdx - 1] >= targetStart) {
        startIdx--;
      }

      let sum = 0;
      let count = 0;
      for (let j = startIdx; j <= i; j++) {
        sum += powerData[j];
        count++;
      }
      if (count > 0) {
        rollingAverages.push(sum / count);
      }
    }
  } else {
    // Point-based rolling average (30 points)
    for (let i = 29; i < powerData.length; i++) {
      let sum = 0;
      for (let j = i - 29; j <= i; j++) {
        sum += powerData[j];
      }
      rollingAverages.push(sum / 30);
    }
  }

  if (rollingAverages.length === 0) {
    return Math.round(powerData.reduce((a, b) => a + b, 0) / powerData.length);
  }

  // Raise each to the 4th power and take mean
  const fourthPowers = rollingAverages.map((p) => Math.pow(p, 4));
  const meanFourthPower =
    fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length;

  // Take 4th root to get Normalized Power
  return Math.round(Math.pow(meanFourthPower, 0.25));
}

const MINETTI_COEFFICIENTS = {
  a: 155.4,
  b: -30.4,
  c: -43.3,
  d: 46.3,
  e: 19.5,
  f: 3.6,
};

function calculateEnergyCost(grade: number): number {
  const g = Math.max(-0.3, Math.min(0.3, grade));
  const { a, b, c, d, e, f } = MINETTI_COEFFICIENTS;
  return (
    a * Math.pow(g, 5) +
    b * Math.pow(g, 4) +
    c * Math.pow(g, 3) +
    d * Math.pow(g, 2) +
    e * g +
    f
  );
}

/**
 * Calculate Normalized Graded Pace (NGP) from running stream data
 * Uses 30-SECOND TIME-BASED rolling window (not 30 points) to match TrainingPeaks
 *
 * Strava streams are non-uniform (~1.85s/point), so using 30 points would mean
 * ~55 seconds of smoothing instead of 30s, leading to ~10% rTSS underestimation
 */
export function calculateNormalizedGradedPace(
  timeStream: number[],
  distanceStream: number[],
  altitudeStream?: number[],
  activityName?: string // For logging
): number {
  if (!timeStream.length || !distanceStream.length) return 0;
  const length = Math.min(timeStream.length, distanceStream.length);
  const hasAltitude =
    altitudeStream && altitudeStream.length >= length;

  // Smooth altitude data to reduce GPS noise before grade calculation
  // GPS altitude has ±5-10m noise; on short ~7m segments this creates
  // extreme grades that inflate NGP via Minetti cost amplification
  // Use distance-based smoothing: ±50m window for consistent smoothing
  let smoothedAltitude: number[] | undefined;
  if (hasAltitude) {
    const SMOOTH_DISTANCE = 50; // meters - smooth altitude over ±50m
    smoothedAltitude = new Array(length);
    for (let i = 0; i < length; i++) {
      const centerDist = distanceStream[i];
      let sum = altitudeStream![i];
      let count = 1;
      // Look back within ±SMOOTH_DISTANCE
      for (let j = i - 1; j >= 0 && centerDist - distanceStream[j] <= SMOOTH_DISTANCE; j--) {
        sum += altitudeStream![j];
        count++;
      }
      for (let j = i + 1; j < length && distanceStream[j] - centerDist <= SMOOTH_DISTANCE; j++) {
        sum += altitudeStream![j];
        count++;
      }
      smoothedAltitude[i] = sum / count;
    }
  }

  // Build time-indexed array of grade-adjusted speeds
  const gapSpeeds: { time: number; speed: number }[] = [];
  const MIN_GRADE_DISTANCE = 20; // meters - minimum distance for grade calculation

  for (let i = 1; i < length; i++) {
    const dt = timeStream[i] - timeStream[i - 1];
    const dd = distanceStream[i] - distanceStream[i - 1];
    if (dt <= 0 || dd <= 0) continue;
    const speed = dd / dt; // m/s
    // Filter out GPS noise: ignore very slow (stopped) or very fast (spike) speeds
    if (speed < 0.5 || speed > 8.0) continue;
    let grade = 0;
    if (smoothedAltitude) {
      // Calculate grade over minimum distance to reduce noise
      let lookback = i;
      while (lookback > 0 && distanceStream[i] - distanceStream[lookback] < MIN_GRADE_DISTANCE) {
        lookback--;
      }
      const gradeDist = distanceStream[i] - distanceStream[lookback];
      if (gradeDist >= MIN_GRADE_DISTANCE) {
        grade = (smoothedAltitude[i] - smoothedAltitude[lookback]) / gradeDist;
      }
    }
    const cost = calculateEnergyCost(grade);
    // Dampen grade adjustment: GPS altitude noise + Minetti polynomial creates
    // excessive speed inflation. TP uses smoother barometric altitude.
    // Calibrated against 18 TP activities: damping=0.50 optimal.
    const rawFactor = cost / 3.6;
    const GRADE_DAMPING = 0.50;
    const dampenedFactor = 1 + (rawFactor - 1) * GRADE_DAMPING;
    const equivalentSpeed = speed * dampenedFactor;
    if (Number.isFinite(equivalentSpeed) && equivalentSpeed > 0) {
      gapSpeeds.push({ time: timeStream[i], speed: equivalentSpeed });
    }
  }

  if (gapSpeeds.length === 0) return 0;

  // Time-weighted average of grade-adjusted speeds
  // Calibrated against 18 TP running activities: time-weighted avg gives
  // 4.3% average difference vs TP (better than Coggan ^4 at 12.2%)
  let normalizedSpeed: number;
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

  const minSpeed = Math.min(...gapSpeeds.map(g => g.speed));
  const maxSpeed = Math.max(...gapSpeeds.map(g => g.speed));

  console.log(`[NGP] "${activityName}" - Time-weighted avg: ${gapSpeeds.length} segments, ` +
    `speeds=${minSpeed.toFixed(2)}-${maxSpeed.toFixed(2)}m/s → ` +
    `avg=${normalizedSpeed.toFixed(2)}m/s → NGP=${ngp}s/km (${Math.floor(ngp / 60)}:${String(Math.round(ngp % 60)).padStart(2, "0")}/km)`
  );

  return ngp;
}

/**
 * Map Strava sport type to our sport types
 */
export function mapStravaSportType(sportType: string): string {
  const mapping: Record<string, string> = {
    // Running
    Run: "running",
    "Trail Run": "running",
    VirtualRun: "running",
    
    // Cycling
    Ride: "cycling",
    MountainBikeRide: "cycling",
    GravelRide: "cycling",
    EBikeRide: "cycling",
    EMountainBikeRide: "cycling",
    Velomobile: "cycling",
    Handcycle: "cycling",
    VirtualRide: "spin",

    // Swimming & Water
    Swim: "swimming",
    Canoeing: "kayaking",
    Kayaking: "kayaking",
    Rowing: "kayaking", // Closest match available or "rowing" if added
    StandUpPaddling: "paddleboarding",
    Kitesurf: "kite_boarding",
    Windsurf: "kite_boarding",
    Surfing: "surfing", // Use direct mapping, fallback to other
    Wakeboarding: "wakeboarding",
    WaterSkiing: "water_skiing",
    Sail: "sailing",

    // Winter
    AlpineSki: "skiing",
    BackcountrySki: "skiing",
    Snowboard: "snowboarding", // Use direct mapping
    RollerSki: "skiing",
    NordicSki: "cross_country_skiing",
    IceSkate: "ice_skating", // Use direct mapping
    WinterBiathlon: "winter_biathlon",
    Snowshoe: "snowshoeing", // Use direct mapping

    // Fitness & Gym
    WeightTraining: "strength",
    Workout: "strength",
    CrossFit: "crossfit", // Use direct mapping
    HighIntensityIntervalTraining: "hiit", // Use direct mapping
    Yoga: "yoga", // Use direct mapping
    Pilates: "pilates", // Use direct mapping
    Barre: "barre",
    Elliptical: "elliptical", // Use direct mapping
    StairStepper: "stairmaster",
    
    // Team & Ball Sports
    Soccer: "soccer",
    Football: "football_american",
    Basketball: "basketball",
    Baseball: "baseball",
    Softball: "softball",
    Volleyball: "volleyball",
    Handball: "handball",
    Rugby: "rugby",
    Cricket: "cricket",
    Golf: "golf",
    Badminton: "badminton", // Use direct mapping
    Tennis: "tennis", // Use direct mapping
    Pickleball: "pickleball", // Use direct mapping
    Squash: "squash",
    Racquetball: "racquetball", // Use direct mapping
    TableTennis: "table_tennis_pingpong",

    // Other
    Walk: "walking", // Direct mapping as requested
    Hike: "hiking", // Direct mapping
    RockClimbing: "rock_climbing",
    InlineSkate: "inline_skating",
    Skateboard: "skateboarding", // Use direct mapping
    Wheelchair: "wheelchair_pushing",

    default: "other",
  };

  return mapping[sportType] || mapping["default"];
}

/**
 * Options for TSS calculation with optional stream data
 */
export interface TSSCalculationOptions {
  userHrMax?: number;
  userHrRest?: number;
  userFtp?: number;
  userLthr?: number;
  userThresholdPace?: number; // Threshold pace in seconds/km (e.g. 300 = 5:00/km)
  userCssPer100m?: number; // Critical Swim Speed in seconds per 100m
  userGender?: "male" | "female"; // For gender-specific TRIMP calculations
  normalizedHeartRate?: number; // From stream data (more accurate)
  normalizedPower?: number; // From stream data (more accurate)
  normalizedPaceSeconds?: number; // From stream data (NGP/NTP) in seconds/km
  // Raw stream data for storage and charting
  heartrateStream?: number[];
  powerStream?: number[];
  timeStream?: number[]; // Seconds from start
  distanceStream?: number[]; // Meters from start
  altitudeStream?: number[]; // Meters
}


/**
 * Convert Strava activity to our activity format
 */
export function convertStravaActivity(
  stravaActivity: StravaActivity,
  options: TSSCalculationOptions = {}
): ImportedActivityData {
  // Store normalized values and streams in raw_data for reference and charting
  const enrichedRawData: Json = {
    ...stravaActivity,
    _calculated: {
      normalized_hr: options.normalizedHeartRate || null,
      normalized_power: options.normalizedPower || null,
      normalized_pace: options.normalizedPaceSeconds || null,
    },
  } as Json;

  // Normalize sport type for the new orchestrator
  const sportType = stravaActivity.sport_type || stravaActivity.type;
  let sport: string | undefined;

  // Running types
  const runningTypes = ["Run", "Trail Run", "VirtualRun"];
  // Cycling types (all variants that use power/pace metrics)
  const cyclingTypes = ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EMountainBikeRide", "EBikeRide", "Handcycle", "Velomobile"];
  // Swimming types
  const swimmingTypes = ["Swim"];

  if (runningTypes.includes(sportType)) {
    sport = "running";
  } else if (cyclingTypes.includes(sportType)) {
    sport = "cycling";
  } else if (swimmingTypes.includes(sportType)) {
    sport = "swimming";
  }

  // Calculate pace data for running activities
  // avgPacePerKm must be in SECONDS/km (e.g. 300 = 5:00/km) for calculateRTSS
  const distanceKm = stravaActivity.distance / 1000;
  const durationMinutes = stravaActivity.moving_time / 60;
  const avgPaceSecondsPerKm = distanceKm > 0 && durationMinutes > 0
    ? (durationMinutes / distanceKm) * 60 // Convert min/km to seconds/km
    : undefined;

  // Use pre-computed NGP from streams (already in s/km) if available, otherwise simple avg pace
  const effectivePacePerKm = (options.normalizedPaceSeconds && options.normalizedPaceSeconds > 0)
    ? options.normalizedPaceSeconds
    : avgPaceSecondsPerKm;

  // Provide sensible defaults for all TSS methods (not just hrTSS)
  // This ensures rTSS and TSS power don't get skipped due to missing user config
  const effectiveHrMax = options.userHrMax ?? 190;
  const effectiveHrRest = options.userHrRest ?? 60;
  const effectiveLthr = options.userLthr ?? Math.round(effectiveHrMax * 0.85); // Aligned with sync route default
  const effectiveFtp = options.userFtp ?? 200; // Default recreational cyclist FTP
  const effectiveThresholdPace = options.userThresholdPace ?? 330; // Default recreational runner: 5:30/km (330 s/km)

  // Calculate TSS using new orchestrator function from training-load.ts
  // elapsed_time is passed for rTSS (TP uses total recording time for running)
  // moving_time is used for hrTSS and power TSS (long stops drop HR/power to ambient)
  // Guard against corrupt elapsed_time (e.g. activity left recording for days)
  let elapsedTime = stravaActivity.moving_time;
  if (typeof stravaActivity.elapsed_time === "number" && stravaActivity.elapsed_time > 0
    && stravaActivity.elapsed_time <= stravaActivity.moving_time * 3) {
    elapsedTime = stravaActivity.elapsed_time;
  }

  const orchestratorParams = {
    sport,
    durationSeconds: stravaActivity.moving_time,
    elapsedTimeSeconds: elapsedTime,
    hasRealPower: stravaActivity.device_watts !== false,
    // Power data — only used when hasRealPower=true (real sensor)
    normalizedPower: options.normalizedPower || undefined,
    powerStream: options.normalizedPower ? undefined : options.powerStream,
    avgPowerWatts: stravaActivity.weighted_average_watts || stravaActivity.average_watts || undefined,
    ftp: effectiveFtp,
    // Pace data (running)
    speedStream: options.distanceStream && options.timeStream ?
      options.distanceStream.map((d, i) => {
        const dt = i === 0 ? (options.timeStream![1] - options.timeStream![0]) : (options.timeStream![i] - options.timeStream![i - 1]);
        // distanceStream is cumulative, so calculate delta distance
        const dd = i === 0 ? d : (d - options.distanceStream![i - 1]);
        return dd / Math.max(dt, 1); // speed in m/s
      }) : undefined,
    distanceStream: options.distanceStream,
    altitudeStream: options.altitudeStream,
    avgPacePerKm: effectivePacePerKm,
    distanceKm: distanceKm || undefined,
    thresholdPacePerKm: effectiveThresholdPace,
    // Swim data
    distanceMeters: sport === "swimming" ? stravaActivity.distance : undefined,
    cssPer100m: options.userCssPer100m,
    // HR data (with defaults to ensure hrTSS can always fire as fallback)
    hrStream: options.heartrateStream,
    timeStream: options.timeStream,
    avgHr: stravaActivity.average_heartrate || options.normalizedHeartRate || undefined,
    hrRest: effectiveHrRest,
    hrMax: effectiveHrMax,
    lthr: effectiveLthr,
    gender: options.userGender,
  };

  console.log(`[TSS DEBUG] "${stravaActivity.name}" input:`, {
    sport,
    movingTime: stravaActivity.moving_time,
    elapsedTime: elapsedTime,
    pace: effectivePacePerKm,
    thresholdPace: options.userThresholdPace,
    hrStream: options.heartrateStream?.length ?? 0,
    avgHr: orchestratorParams.avgHr,
    hrMax: effectiveHrMax,
    lthr: effectiveLthr,
  });

  const tssResult = calculateActivityTSSOrchestrator(orchestratorParams);

  console.log(`[TSS DEBUG] "${stravaActivity.name}" → TSS=${tssResult.tss} (${tssResult.type})`);
  console.log(`[TSS DEBUG] "${stravaActivity.name}" result:`, {
    tss: tssResult.tss,
    type: tssResult.type,
  });

  return {
    title: stravaActivity.name,
    description: stravaActivity.description || null,
    scheduled_date: stravaActivity.start_date_local.split("T")[0],
    completed_date: stravaActivity.start_date,
    status: "completed",
    actual_duration_minutes: Math.round(stravaActivity.moving_time / 60),
    actual_distance_km: Math.round(stravaActivity.distance / 10) / 100, // Convert m to km with 2 decimals
    elevation_gain_m: stravaActivity.total_elevation_gain
      ? Math.round(stravaActivity.total_elevation_gain)
      : null,
    avg_hr: stravaActivity.average_heartrate
      ? Math.round(stravaActivity.average_heartrate)
      : null,
    max_hr: stravaActivity.max_heartrate
      ? Math.round(stravaActivity.max_heartrate)
      : null,
    avg_power_watts: (() => {
      const w = stravaActivity.weighted_average_watts || stravaActivity.average_watts;
      return w ? Math.round(w) : null;
    })(),
    tss: Math.round(tssResult.tss),
    source: "strava" as const,
    external_id: String(stravaActivity.id),
    raw_data: enrichedRawData,
  };
}
