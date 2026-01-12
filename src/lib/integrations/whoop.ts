/**
 * WHOOP API Integration
 * Documentation: https://developer.whoop.com/docs
 * Using API v2 (current version)
 */

const WHOOP_API_V1 = "https://api.prod.whoop.com/developer/v1";
const WHOOP_API_V2 = "https://api.prod.whoop.com/developer/v2";
const WHOOP_OAUTH_BASE = "https://api.prod.whoop.com/oauth/oauth2";

export interface WhoopTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface WhoopUser {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface WhoopRecovery {
  cycle_id: number;
  sleep_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: string;
  score: {
    user_calibrating: boolean;
    recovery_score: number; // 0-100
    resting_heart_rate: number; // bpm
    hrv_rmssd_milli: number; // ms
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
}

export interface WhoopSleep {
  id: string; // UUID in v2
  v1_id: number | null; // Legacy v1 ID
  cycle_id: number; // Cycle this sleep belongs to
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: string;
  score: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed: {
      baseline_milli: number;
      need_from_sleep_debt_milli: number;
      need_from_recent_strain_milli: number;
      need_from_recent_nap_milli: number;
    };
    respiratory_rate: number;
    sleep_performance_percentage: number;
    sleep_consistency_percentage: number;
    sleep_efficiency_percentage: number;
  };
}

export interface WhoopWorkout {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_id: number;
  score_state: string;
  score: {
    strain: number; // 0-21
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    percent_recorded: number;
    distance_meter?: number;
    altitude_gain_meter?: number;
    altitude_change_meter?: number;
    zone_duration: {
      zone_zero_milli: number;
      zone_one_milli: number;
      zone_two_milli: number;
      zone_three_milli: number;
      zone_four_milli: number;
      zone_five_milli: number;
    };
  };
}

export interface WhoopCycle {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  score_state: string;
  score: {
    strain: number;
    kilojoule: number;
    average_heart_rate: number;
    max_heart_rate: number;
  };
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<WhoopTokens> {
  console.log("Exchanging WHOOP code for tokens...");
  console.log(
    "Client ID:",
    process.env.WHOOP_CLIENT_ID?.substring(0, 10) + "..."
  );
  console.log("Redirect URI:", redirectUri);

  const response = await fetch(`${WHOOP_OAUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const responseText = await response.text();
  console.log("WHOOP token response status:", response.status);
  console.log("WHOOP token response body:", responseText);

  if (!response.ok) {
    throw new Error(
      `Failed to exchange WHOOP code for tokens: ${responseText}`
    );
  }

  const tokens = JSON.parse(responseText);
  console.log("Parsed tokens - has refresh_token:", !!tokens.refresh_token);

  return tokens;
}

/**
 * Refresh expired tokens
 */
export async function refreshTokens(
  refreshToken: string
): Promise<WhoopTokens> {
  const response = await fetch(`${WHOOP_OAUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh WHOOP tokens");
  }

  return response.json();
}

/**
 * Get user profile
 */
export async function getUser(accessToken: string): Promise<WhoopUser> {
  const response = await fetch(`${WHOOP_API_V1}/user/profile/basic`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch WHOOP user");
  }

  return response.json();
}

/**
 * Get recovery data
 */
export async function getRecovery(
  accessToken: string,
  params: {
    start?: string;
    end?: string;
    limit?: number;
    nextToken?: string;
  } = {}
): Promise<{ records: WhoopRecovery[]; next_token?: string }> {
  const searchParams = new URLSearchParams();
  if (params.start) searchParams.set("start", params.start);
  if (params.end) searchParams.set("end", params.end);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.nextToken) searchParams.set("nextToken", params.nextToken);

  // Use v2 API endpoint for recovery: /developer/v2/recovery
  const url = `${WHOOP_API_V2}/recovery?${searchParams}`;
  console.log("Fetching WHOOP recovery from:", url);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Log the full response for debugging
  const responseText = await response.text();
  console.log("WHOOP recovery response:", response.status, responseText);

  // 404 means no data for this period - return empty array
  if (response.status === 404) {
    console.log("No WHOOP recovery data - trying to parse response...");
    // Try to parse if there's JSON
    try {
      const data = JSON.parse(responseText);
      if (data.records) return data;
    } catch {
      // Not JSON, return empty
    }
    return { records: [] };
  }

  // Try to parse successful response
  if (response.ok) {
    try {
      const data = JSON.parse(responseText);
      console.log(
        "WHOOP recovery parsed data:",
        JSON.stringify(data).substring(0, 200)
      );
      return data;
    } catch {
      console.error("Failed to parse WHOOP recovery response");
      return { records: [] };
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error("WHOOP recovery error:", response.status, errorText);
    throw new Error(
      `Failed to fetch WHOOP recovery: ${response.status} - ${errorText}`
    );
  }

  return response.json();
}

/**
 * Get sleep data
 */
export async function getSleep(
  accessToken: string,
  params: {
    start?: string;
    end?: string;
    limit?: number;
    nextToken?: string;
  } = {}
): Promise<{ records: WhoopSleep[]; next_token?: string }> {
  const searchParams = new URLSearchParams();
  if (params.start) searchParams.set("start", params.start);
  if (params.end) searchParams.set("end", params.end);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.nextToken) searchParams.set("nextToken", params.nextToken);

  // Use v2 API endpoint for sleep: /developer/v2/activity/sleep
  const url = `${WHOOP_API_V2}/activity/sleep?${searchParams}`;
  console.log("Fetching WHOOP sleep from:", url);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Log the full response for debugging
  const responseText = await response.text();
  console.log("WHOOP sleep response:", response.status, responseText);

  // 404 means no data for this period - return empty array
  if (response.status === 404) {
    console.log("No WHOOP sleep data - trying to parse response...");
    try {
      const data = JSON.parse(responseText);
      if (data.records) return data;
    } catch {
      // Not JSON, return empty
    }
    return { records: [] };
  }

  // Try to parse successful response
  if (response.ok) {
    try {
      const data = JSON.parse(responseText);
      console.log(
        "WHOOP sleep parsed data:",
        JSON.stringify(data).substring(0, 200)
      );
      return data;
    } catch {
      console.error("Failed to parse WHOOP sleep response");
      return { records: [] };
    }
  }

  console.error("WHOOP sleep error:", response.status, responseText);
  throw new Error(
    `Failed to fetch WHOOP sleep: ${response.status} - ${responseText}`
  );
}

/**
 * Get workout data
 */
export async function getWorkouts(
  accessToken: string,
  params: {
    start?: string;
    end?: string;
    limit?: number;
    nextToken?: string;
  } = {}
): Promise<{ records: WhoopWorkout[]; next_token?: string }> {
  const searchParams = new URLSearchParams();
  if (params.start) searchParams.set("start", params.start);
  if (params.end) searchParams.set("end", params.end);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.nextToken) searchParams.set("nextToken", params.nextToken);

  // Use v2 API for workouts
  const url = `${WHOOP_API_V2}/activity/workout?${searchParams}`;
  console.log("Fetching WHOOP workouts from:", url);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const responseText = await response.text();
  console.log(
    "WHOOP workouts response:",
    response.status,
    responseText.substring(0, 200)
  );

  // 404 means no data - return empty array
  if (response.status === 404) {
    return { records: [] };
  }

  if (response.ok) {
    try {
      const data = JSON.parse(responseText);
      return data;
    } catch {
      return { records: [] };
    }
  }

  console.error("WHOOP workouts error:", response.status, responseText);
  return { records: [] };
}

/**
 * Convert WHOOP recovery to our daily metrics format
 */
export function convertWhoopRecovery(
  recovery: WhoopRecovery,
  sleep?: WhoopSleep
) {
  const sleepScore = sleep?.score;
  const sleepStages = sleepScore?.stage_summary;

  return {
    date: recovery.created_at.split("T")[0],
    recovery_score: recovery.score.recovery_score,
    hrv_ms: Math.round(recovery.score.hrv_rmssd_milli),
    resting_hr: Math.round(recovery.score.resting_heart_rate),
    respiratory_rate: sleepScore?.respiratory_rate || null,
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
    source: "whoop" as const,
  };
}

/**
 * Map WHOOP sport ID to our sport types
 */
export function mapWhoopSportType(sportId: number): string {
  // WHOOP sport IDs - common ones
  const mapping: Record<number, string> = {
    0: "running",
    1: "cycling",
    33: "swimming",
    43: "strength",
    44: "running", // Treadmill
    52: "other", // Yoga
    63: "other", // Hiking
    71: "triathlon",
  };

  return mapping[sportId] || "other";
}
