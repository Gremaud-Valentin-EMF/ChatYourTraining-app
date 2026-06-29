/**
 * Persistence layer for daily training load (US-13).
 *
 * Recomputes the athlete's full CTL/ATL/TSB series from their activities and
 * stores it in the `training_load` table so the dashboard can READ pre-computed
 * values instead of recalculating on every render (AC4 — affichage < 2 s, lu
 * depuis `training_load`).
 *
 * Call this after any mutation that changes a completed activity's TSS, status
 * or date: Strava/Whoop import, manual creation, edit (TSS/RPE override) and
 * deletion. Accepts either the server or the browser Supabase client (RLS
 * policy "Users can manage own training load" allows the owner to upsert).
 */
import { computeTrainingLoadSeries } from "./training-load";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function recomputeAndStoreTrainingLoad(
  supabase: any,
  userId: string
): Promise<{ activityDays: number }> {
  // 1. Load every activity that could contribute to training load.
  const { data: activities, error } = await supabase
    .from("activities")
    .select("scheduled_date, completed_date, tss, status")
    .eq("user_id", userId);

  if (error) {
    console.error(
      "[training_load] failed to load activities:",
      error.message
    );
    return { activityDays: 0 };
  }

  // 2. Build the daily TSS series — only completed activities count, dated on
  //    their realized day (completed_date) when available.
  const tssData = (activities || [])
    .filter((a: any) => a.status === "completed")
    .map((a: any) => {
      // completed_date is a timestamptz, scheduled_date a DATE — normalise both
      // to YYYY-MM-DD so the daily series keys line up.
      const raw = (a.completed_date || a.scheduled_date) as string | null;
      return { date: raw ? raw.slice(0, 10) : null, tss: a.tss || 0 };
    })
    .filter((d: { date: string | null }): d is { date: string; tss: number } =>
      Boolean(d.date)
    );

  // 3. Compute the full CTL/ATL/TSB series.
  const series = computeTrainingLoadSeries(tssData);

  // 4a. No activity → clear any stale rows for this user.
  if (series.length === 0) {
    await supabase.from("training_load").delete().eq("user_id", userId);
    return { activityDays: 0 };
  }

  // 4b. Replace the user's stored series. Delete-then-insert keeps the table
  //     exactly in sync even when the date range shrinks (e.g. the earliest
  //     activity was deleted), which a plain upsert would not.
  // Dedupe by date (defensive — a single row per date is required by the
  // UNIQUE(user_id, date) constraint).
  const byDate = new Map<string, Record<string, unknown>>();
  for (const d of series) {
    byDate.set(d.date, {
      user_id: userId,
      date: d.date,
      daily_tss: Math.round(d.dailyTss),
      atl: d.atl,
      ctl: d.ctl,
      tsb: d.tsb,
    });
  }
  const rows = Array.from(byDate.values());

  await supabase.from("training_load").delete().eq("user_id", userId);
  const { error: insertError } = await supabase
    .from("training_load")
    .insert(rows);

  if (insertError) {
    console.error("[training_load] insert failed:", insertError.message);
  }

  return {
    activityDays: rows.filter((r) => (r.daily_tss as number) > 0).length,
  };
}
