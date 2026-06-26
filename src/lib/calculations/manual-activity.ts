/**
 * Manual activity creation — threshold loading + TSS computation.
 *
 * Mirrors the threshold-resolution logic used during Strava sync
 * (src/app/api/sync/strava/route.ts) so that a manually entered activity is
 * scored with the exact same engine and the same athlete thresholds.
 *
 * See documentation/activity_creation/activity_creation_data.md (Étape 3).
 */
import {
  calculateActivityTSS,
  type TSSSType,
} from "@/lib/calculations/training-load";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface UserThresholds {
  ftp?: number;
  thresholdPacePerKm?: number; // seconds/km
  lthr?: number;
  hrMax?: number;
  hrRest?: number;
  cssPer100m?: number;
  gender?: "male" | "female";
}

/**
 * Per-session values entered in the manual creation form.
 * All optional — the engine picks the best available method.
 */
export interface ManualActivityMetrics {
  sportSlug: string;
  durationMinutes: number;
  distanceKm?: number;
  avgPaceSecondsPerKm?: number; // running
  normalizedPower?: number; // cycling — NP read from head unit
  avgPowerWatts?: number; // cycling — fallback for NP
  avgHr?: number;
  rpe?: number;
}

export type ManualActivityStatus = "planned" | "completed" | "skipped";

/**
 * Derive the activity status + dates from the two optional date inputs of the
 * manual creation form (date planifiée + date réalisée). See
 * documentation/activity_creation/activity_creation_data.md.
 *
 * - réalisée renseignée            → completed (faite, planifiée ou non)
 * - planifiée seule, dans le passé → skipped (manquée)
 * - planifiée seule, aujourd'hui/futur → planned
 *
 * `scheduledDate` (NOT NULL en base) = date planifiée si fournie, sinon la date
 * réalisée. `completedDate` = date réalisée si fournie, sinon null.
 */
export function deriveActivityStatus(params: {
  plannedDate?: string; // YYYY-MM-DD
  realizedDate?: string; // YYYY-MM-DD
  todayStr: string; // YYYY-MM-DD
}): {
  status: ManualActivityStatus;
  scheduledDate: string | null;
  completedDate: string | null;
} {
  const plannedDate = params.plannedDate || undefined;
  const realizedDate = params.realizedDate || undefined;
  const scheduledDate = plannedDate || realizedDate || null;

  if (realizedDate) {
    return { status: "completed", scheduledDate, completedDate: realizedDate };
  }
  if (plannedDate && plannedDate < params.todayStr) {
    return { status: "skipped", scheduledDate, completedDate: null };
  }
  return { status: "planned", scheduledDate, completedDate: null };
}

/**
 * The MVP sport slugs the manual creation form is allowed to offer
 * (Étape 0 of documentation/activity_creation/activity_creation_data.md).
 * The `sports` table contains many more rows — restrict the selector to these.
 */
export const MVP_SPORT_SLUGS = [
  "running",
  "cycling",
  "mountain-biking",
  "walking",
  "hiking",
  "alpine-skiing",
  "cross-country-skiing",
  "strength",
  "other",
] as const;

export function isMvpSport(slug: string): boolean {
  return (MVP_SPORT_SLUGS as readonly string[]).includes(slug);
}

/**
 * Which adaptive fields to show for a sport in the manual creation form
 * (Étape 2 of documentation/activity_creation/activity_creation_data.md).
 */
export interface SportFields {
  distance: boolean;
  elevation: boolean;
  pace: boolean;
  power: boolean;
  hr: boolean;
}

export function getSportFields(slug: string): SportFields {
  const isCycling = slug === "cycling" || slug === "mountain-biking";
  const isRunning = slug === "running";
  const hasDistance = slug !== "strength";
  const hasElevation =
    isRunning ||
    isCycling ||
    ["walking", "hiking", "cross-country-skiing", "alpine-skiing"].includes(
      slug
    );
  return {
    distance: hasDistance,
    elevation: hasElevation,
    pace: isRunning,
    power: isCycling,
    hr: true,
  };
}

/** Parse a "m:ss" pace string into seconds/km (e.g. "5:30" → 330). */
export function parsePaceToSeconds(pace: string): number | undefined {
  const match = pace.trim().match(/^(\d+):(\d{1,2})$/);
  if (!match) return undefined;
  const seconds = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  return seconds > 0 ? seconds : undefined;
}

/**
 * Map a sport slug to the slug the TSS engine branches on. The engine gates
 * power TSS on sport === "cycling" and pace TSS on sport === "running", so VTT
 * (mountain-biking) must be treated as cycling to reach the power branch.
 * hrTSS and RPE are not sport-gated.
 */
function engineSport(slug: string): string {
  if (slug === "mountain-biking") return "cycling";
  return slug;
}

/**
 * Load the athlete's thresholds, replicating the Strava sync resolution:
 * - FTP: cycling-specific, then any sport
 * - threshold pace: running-specific, else derived from VMA (× 0.85)
 * - LTHR: stored, else 85 % of HRmax
 */
export async function loadUserThresholds(
  supabase: any,
  userId: string
): Promise<UserThresholds> {
  const { data: physioData } = await supabase
    .from("physiological_data")
    .select("hr_max, hr_rest, lthr")
    .eq("user_id", userId)
    .limit(1);

  const { data: userData } = await supabase
    .from("users")
    .select("gender")
    .eq("id", userId)
    .single();

  const { data: userSports } = await supabase
    .from("user_sports")
    .select("ftp_watts, threshold_pace_per_km, vma_kmh, css_per_100m, sport_id, sports(name)")
    .eq("user_id", userId);

  const hrMax = physioData?.[0]?.hr_max ?? undefined;
  const hrRest = physioData?.[0]?.hr_rest ?? undefined;
  const gender = (userData?.gender as "male" | "female" | undefined) ?? undefined;

  const runningSports =
    userSports?.filter((s: any) => {
      const name = s.sports?.name;
      return name === "running" || name === "trail_running";
    }) || [];
  const cyclingSports =
    userSports?.filter((s: any) => {
      const name = s.sports?.name;
      return name === "cycling" || name === "mountain-biking" || name === "spin";
    }) || [];
  const swimmingSports =
    userSports?.filter((s: any) => s.sports?.name === "swimming") || [];

  const ftp =
    cyclingSports.find((s: any) => s.ftp_watts)?.ftp_watts ??
    userSports?.find((s: any) => s.ftp_watts)?.ftp_watts ??
    undefined;

  const cssPer100m =
    swimmingSports.find((s: any) => s.css_per_100m)?.css_per_100m ??
    userSports?.find((s: any) => s.css_per_100m)?.css_per_100m ??
    undefined;

  let thresholdPacePerKm =
    runningSports.find((s: any) => s.threshold_pace_per_km)?.threshold_pace_per_km ??
    undefined;
  if (!thresholdPacePerKm) {
    const vmaKmh = runningSports.find((s: any) => s.vma_kmh)?.vma_kmh;
    if (vmaKmh && vmaKmh > 0) {
      thresholdPacePerKm = Math.round(3600 / (vmaKmh * 0.85));
    }
  }

  const lthr =
    physioData?.[0]?.lthr ?? (hrMax ? Math.round(hrMax * 0.85) : undefined);

  return { ftp, thresholdPacePerKm, lthr, hrMax, hrRest, cssPer100m, gender };
}

export interface ManualTSSResult {
  tss: number;
  type: TSSSType;
}

/**
 * Compute the TSS for a manually entered (realized) activity.
 * Derives average pace from distance/duration when not provided directly.
 */
export function computeManualTSS(
  metrics: ManualActivityMetrics,
  thresholds: UserThresholds
): ManualTSSResult {
  const durationSeconds = Math.round(metrics.durationMinutes * 60);

  // Derive avg pace (s/km) from distance + duration when not entered.
  let avgPacePerKm = metrics.avgPaceSecondsPerKm;
  if (
    !avgPacePerKm &&
    metrics.distanceKm &&
    metrics.distanceKm > 0 &&
    durationSeconds > 0
  ) {
    avgPacePerKm = Math.round(durationSeconds / metrics.distanceKm);
  }

  const result = calculateActivityTSS({
    sport: engineSport(metrics.sportSlug),
    durationSeconds,
    elapsedTimeSeconds: durationSeconds,
    // Power (cycling / VTT) — manual NP entry implies a real sensor.
    normalizedPower: metrics.normalizedPower || undefined,
    avgPowerWatts: metrics.avgPowerWatts || undefined,
    ftp: thresholds.ftp,
    hasRealPower: true,
    // Pace (running)
    avgPacePerKm,
    distanceKm: metrics.distanceKm || undefined,
    thresholdPacePerKm: thresholds.thresholdPacePerKm,
    // HR — athlete thresholds, NOT the session max
    avgHr: metrics.avgHr || undefined,
    hrRest: thresholds.hrRest,
    hrMax: thresholds.hrMax,
    lthr: thresholds.lthr,
    gender: thresholds.gender,
    // RPE
    rpe: metrics.rpe || undefined,
  });

  return { tss: Math.round(result.tss), type: result.type };
}
