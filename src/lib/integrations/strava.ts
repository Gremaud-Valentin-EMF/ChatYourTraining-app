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
 * Similar to Normalized Power calculation:
 * 1. Calculate 30-second rolling average
 * 2. Raise each 30s average to the 4th power
 * 3. Take the mean of all values
 * 4. Take the 4th root
 *
 * This accounts for the physiological lag and gives more weight to high-intensity efforts
 */
export function calculateNormalizedHeartRate(hrData: number[]): number {
  if (!hrData || hrData.length < 30) {
    // Not enough data for 30s rolling average, return simple average
    if (hrData && hrData.length > 0) {
      return Math.round(hrData.reduce((a, b) => a + b, 0) / hrData.length);
    }
    return 0;
  }

  // Calculate 30-second rolling averages
  const rollingAverages: number[] = [];
  for (let i = 29; i < hrData.length; i++) {
    let sum = 0;
    for (let j = i - 29; j <= i; j++) {
      sum += hrData[j];
    }
    rollingAverages.push(sum / 30);
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
export function calculateNormalizedPower(powerData: number[]): number {
  if (!powerData || powerData.length < 30) {
    if (powerData && powerData.length > 0) {
      return Math.round(
        powerData.reduce((a, b) => a + b, 0) / powerData.length
      );
    }
    return 0;
  }

  // Calculate 30-second rolling averages
  const rollingAverages: number[] = [];
  for (let i = 29; i < powerData.length; i++) {
    let sum = 0;
    for (let j = i - 29; j <= i; j++) {
      sum += powerData[j];
    }
    rollingAverages.push(sum / 30);
  }

  // Raise each to the 4th power and take mean
  const fourthPowers = rollingAverages.map((p) => Math.pow(p, 4));
  const meanFourthPower =
    fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length;

  // Take 4th root to get Normalized Power
  return Math.round(Math.pow(meanFourthPower, 0.25));
}

/**
 * Map Strava sport type to our sport types
 */
export function mapStravaSportType(sportType: string): string {
  const mapping: Record<string, string> = {
    Run: "running",
    "Trail Run": "running",
    Ride: "cycling",
    VirtualRide: "cycling",
    Swim: "swimming",
    WeightTraining: "strength",
    Workout: "strength",
    Walk: "other",
    Hike: "other",
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
  userThresholdPace?: number; // min/km at threshold
  normalizedHeartRate?: number; // From stream data (more accurate)
  normalizedPower?: number; // From stream data (more accurate)
  // Raw stream data for storage and charting
  heartrateStream?: number[];
  powerStream?: number[];
  timeStream?: number[]; // Seconds from start
}

/**
 * Calculate TSS from activity data using TrainingPeaks-compatible formulas
 *
 * TSS = Duration (hours) × IF² × 100
 *
 * IF calculation varies by activity type:
 * - Cycling with power: IF = NP / FTP (NP from streams if available)
 * - Running/Trail with HR: IF = NHR / LTHR (NHR = Normalized Heart Rate from streams)
 * - Other activities with HR: IF = NHR / 200 (reference HR)
 *
 * Normalized values (NP, NHR) are calculated from second-by-second streams
 * using 30-second rolling averages raised to the 4th power.
 */
export function calculateActivityTSS(
  activity: StravaActivity,
  options: TSSCalculationOptions = {}
): number {
  const {
    userHrMax,
    userFtp,
    userLthr,
    userThresholdPace,
    normalizedHeartRate,
    normalizedPower,
  } = options;

  const durationHours = activity.moving_time / 3600;
  const durationMinutes = activity.moving_time / 60;
  const sportType = activity.sport_type || activity.type;

  // Method 1: Cycling with power data (most accurate for cycling)
  // Use Normalized Power from streams if available, otherwise Strava's weighted_average_watts
  if (
    (sportType === "Ride" || sportType === "VirtualRide") &&
    (normalizedPower || activity.weighted_average_watts)
  ) {
    const np = normalizedPower || activity.weighted_average_watts!;
    const ftp = userFtp || 250; // Default FTP estimate
    const intensityFactor = np / ftp;
    // TSS = (Duration_s × NP × IF) / (FTP × 3600) × 100
    const tss =
      ((activity.moving_time * np * intensityFactor) / (ftp * 3600)) * 100;
    console.log(
      `TSS calc (power): NP=${np}${
        normalizedPower ? " (streams)" : " (strava)"
      }, FTP=${ftp}, IF=${intensityFactor.toFixed(2)}, TSS=${Math.round(tss)}`
    );
    return Math.round(tss);
  }

  // Method 2: Running/Trail with HR data - hrTSS formula
  // Use Normalized Heart Rate from streams if available (more accurate than average)
  if (sportType === "Run" || sportType === "Trail Run") {
    const hrValue = normalizedHeartRate || activity.average_heartrate;
    if (hrValue) {
      // LTHR: user provided, or estimate from HRmax (70% for running), or default
      const lthr = userLthr || (userHrMax ? Math.round(userHrMax * 0.7) : 132);
      const intensityFactor = hrValue / lthr;
      const rtss = durationHours * Math.pow(intensityFactor, 2) * 100;
      console.log(
        `TSS calc (running HR): HR=${hrValue}${
          normalizedHeartRate ? " (NHR)" : " (avg)"
        }, LTHR=${lthr}, IF=${intensityFactor.toFixed(2)}, rTSS=${Math.round(
          rtss
        )}`
      );
      return Math.round(rtss);
    }

    // Fallback: pace-based if no HR
    const distanceKm = activity.distance / 1000;
    if (distanceKm > 0.3) {
      const actualPace = durationMinutes / distanceKm; // min/km
      // Default threshold: 5:30/km (moderately fit runner)
      const thresholdPace = userThresholdPace || 5.5;
      const intensityFactor = Math.min(
        1.5,
        Math.max(0.5, thresholdPace / actualPace)
      );
      const rtss = durationHours * Math.pow(intensityFactor, 2) * 100;
      console.log(
        `TSS calc (running pace): pace=${actualPace.toFixed(
          1
        )}/km, threshold=${thresholdPace}/km, IF=${intensityFactor.toFixed(
          2
        )}, rTSS=${Math.round(rtss)}`
      );
      return Math.round(rtss);
    }
  }

  // Method 3: Swimming with pace - sTSS formula
  if (sportType === "Swim") {
    const distanceM = activity.distance;
    if (distanceM > 100) {
      const pace100m = (durationMinutes / distanceM) * 100; // min per 100m
      // CSS (Critical Swim Speed): ~1:45/100m for recreational, ~1:20/100m for competitive
      const cssEstimate = 1.75;
      const intensityFactor = Math.min(
        1.5,
        Math.max(0.5, cssEstimate / pace100m)
      );
      const stss = durationHours * Math.pow(intensityFactor, 2) * 100;
      console.log(
        `TSS calc (swim): pace=${pace100m.toFixed(
          1
        )}/100m, CSS=${cssEstimate}, IF=${intensityFactor.toFixed(
          2
        )}, sTSS=${Math.round(stss)}`
      );
      return Math.round(stss);
    }
  }

  // Method 4: Heart rate based for strength, walking, hiking, and other activities
  // Use Normalized Heart Rate from streams if available (more accurate)
  // IF = NHR / 200 (reference HR of 200, Garmin approach)
  // Then: hrTSS = Duration (h) × IF² × 100
  const hrValueGeneric = normalizedHeartRate || activity.average_heartrate;
  if (hrValueGeneric) {
    // Using 200 as reference for non-pace/power activities (Garmin approach)
    const referenceHr = 200;
    const intensityFactor = hrValueGeneric / referenceHr;
    const hrtss = durationHours * Math.pow(intensityFactor, 2) * 100;
    console.log(
      `TSS calc (hrTSS): HR=${hrValueGeneric}${
        normalizedHeartRate ? " (NHR)" : " (avg)"
      }, refHR=${referenceHr}, IF=${intensityFactor.toFixed(
        2
      )}, hrTSS=${Math.round(hrtss)}`
    );
    return Math.round(hrtss);
  }

  // Method 5: Strava suffer score as fallback (relative effort)
  if (activity.suffer_score) {
    // Strava's relative effort correlates loosely with TSS
    // Multiply by ~1.5 to better approximate TSS
    const tss = Math.round(activity.suffer_score * 1.5);
    console.log(
      `TSS calc (suffer): sufferScore=${activity.suffer_score}, TSS=${tss}`
    );
    return tss;
  }

  // Method 6: Duration-based estimation with sport-specific multipliers
  // Conservative estimates based on typical intensity
  const baseTssPerHour: Record<string, number> = {
    Run: 90,
    "Trail Run": 100,
    Ride: 60,
    VirtualRide: 70,
    Swim: 55,
    WeightTraining: 40,
    Workout: 45,
    Walk: 30,
    Hike: 60,
    Yoga: 15,
    CrossFit: 80,
    Elliptical: 55,
    StairStepper: 60,
    "Nordic Ski": 70,
    "Cross Country Skiing": 70,
    Rowing: 65,
  };

  const baseTss = baseTssPerHour[sportType] || 45;
  const tss = durationHours * baseTss;
  console.log(
    `TSS calc (duration): sport=${sportType}, duration=${durationHours.toFixed(
      2
    )}h, rate=${baseTss}/h, TSS=${Math.round(tss)}`
  );
  return Math.round(tss);
}

/**
 * Convert Strava activity to our activity format
 */
export function convertStravaActivity(
  stravaActivity: StravaActivity,
  options: TSSCalculationOptions = {}
): {
  title: string;
  description: string | null;
  scheduled_date: string;
  completed_date: string;
  status: "completed";
  actual_duration_minutes: number;
  actual_distance_km: number;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power_watts: number | null;
  tss: number;
  source: "strava";
  external_id: string;
  raw_data: object;
} {
  // Store normalized values and streams in raw_data for reference and charting
  const enrichedRawData = {
    ...stravaActivity,
    _calculated: {
      normalized_hr: options.normalizedHeartRate || null,
      normalized_power: options.normalizedPower || null,
    },
    _streams: {
      heartrate: options.heartrateStream || null,
      power: options.powerStream || null,
      time: options.timeStream || null,
    },
  };

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
    avg_power_watts:
      stravaActivity.weighted_average_watts ||
      stravaActivity.average_watts ||
      null,
    tss: calculateActivityTSS(stravaActivity, options),
    source: "strava" as const,
    external_id: String(stravaActivity.id),
    raw_data: enrichedRawData,
  };
}
