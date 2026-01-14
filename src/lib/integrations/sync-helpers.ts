import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  IntegrationProvider,
  ActivityStatus,
  Json,
} from "@/types/database";

type DBClient = SupabaseClient<Database>;

export type SyncState = {
  lock?: {
    started_at: string;
    provider: IntegrationProvider;
  };
  last_error?: string;
  last_success_at?: string;
} & {
  [key: string]: Json | undefined;
};

const SYNC_LOCK_TTL_MS = 1000 * 60 * 5; // 5 minutes

export class SyncLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncLockError";
  }
}

export async function acquireSyncLock(
  supabase: DBClient,
  integrationId: string,
  provider: IntegrationProvider,
  currentState?: SyncState | null
) {
  const state: SyncState = { ...(currentState ?? {}) };
  const lock = state.lock;
  if (lock?.started_at) {
    const lockAge =
      Date.now() - new Date(lock.started_at).getTime();
    if (lockAge < SYNC_LOCK_TTL_MS) {
      throw new SyncLockError("Sync already running");
    }
  }

  state.lock = {
    started_at: new Date().toISOString(),
    provider,
  };

  await supabase
    .from("integrations")
    .update({ sync_errors: state as Json })
    .eq("id", integrationId);

  return state;
}

export async function releaseSyncLock(
  supabase: DBClient,
  integrationId: string,
  state: SyncState,
  {
    success,
    errorMessage,
  }: { success: boolean; errorMessage?: string }
) {
  const nextState: SyncState = { ...state };
  delete nextState.lock;

  if (success) {
    nextState.last_success_at = new Date().toISOString();
    delete nextState.last_error;
  } else if (errorMessage) {
    nextState.last_error = errorMessage;
  }

  await supabase
    .from("integrations")
    .update({ sync_errors: nextState as Json })
    .eq("id", integrationId);
}

export interface ImportedActivityData {
  title: string;
  description: string | null;
  scheduled_date: string;
  completed_date: string;
  status: ActivityStatus;
  actual_duration_minutes: number | null;
  actual_distance_km: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power_watts: number | null;
  tss: number | null;
  source: IntegrationProvider;
  external_id: string;
  raw_data: Json;
}

export async function matchPlannedWorkout(
  supabase: DBClient,
  params: {
    userId: string;
    sportId: string;
    scheduledDate: string;
    data: ImportedActivityData;
  }
) {
  const { userId, sportId, scheduledDate, data } = params;
  const targetDuration =
    data.actual_duration_minutes ?? 0;

  const { data: candidates } = await supabase
    .from("activities")
    .select("id, planned_duration_minutes, description")
    .eq("user_id", userId)
    .eq("sport_id", sportId)
    .eq("scheduled_date", scheduledDate)
    .in("status", ["planned", "in_progress"])
    .is("external_id", null)
    .order("planned_duration_minutes", { ascending: true });

  if (!candidates || candidates.length === 0) {
    return false;
  }

  let bestCandidate: { id: string; planned_duration_minutes: number | null } | null =
    null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const plannedDuration = candidate.planned_duration_minutes ?? targetDuration;
    const diff = Math.abs(
      (plannedDuration || 0) - (targetDuration || plannedDuration || 0)
    );
    const tolerance = Math.max(
      20,
      Math.round(Math.max(plannedDuration || 0, targetDuration || 0) * 0.35)
    );

    if (diff <= tolerance && diff < bestDiff) {
      bestCandidate = candidate;
      bestDiff = diff;
    }
  }

  if (!bestCandidate) {
    return false;
  }

  const updatePayload: Partial<ImportedActivityData> = {
    status: "completed",
    completed_date: data.completed_date,
    actual_duration_minutes: data.actual_duration_minutes,
    actual_distance_km: data.actual_distance_km,
    elevation_gain_m: data.elevation_gain_m,
    avg_hr: data.avg_hr,
    max_hr: data.max_hr,
    avg_power_watts: data.avg_power_watts,
    tss: data.tss,
    source: data.source,
    external_id: data.external_id,
    raw_data: data.raw_data,
  };

  if (data.description) {
    updatePayload.description = data.description;
  }

  const { error } = await supabase
    .from("activities")
    .update(updatePayload)
    .eq("id", bestCandidate.id);

  if (error) {
    console.error("Failed to update planned workout:", error);
    return false;
  }

  return true;
}
