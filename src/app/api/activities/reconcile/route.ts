import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Reconcile missed planned sessions → "skipped".
 *
 * A "planned" activity whose scheduled date has passed without being realized
 * (no matched import, no manual "réalisée") is marked as missed.
 *
 * Garde-fou n°1 — délai de grâce : a session on day D is only skipped once
 * day D+1 is over (i.e. today ≥ D+2), so a not-yet-synced same/previous-day
 * session is never prematurely flagged as missed.
 *
 * Garde-fou n°2 lives in sync-helpers.matchPlannedWorkout, which keeps
 * "skipped" sessions matchable so a late import revives them to "completed".
 *
 * Server-side sweep — can be driven by a cron, and is also called by the
 * calendar on load so missed sessions get reconciled without a scheduler.
 * See documentation/activity_creation/activity_creation_data.md.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Grace period: skip only sessions strictly older than yesterday.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 2);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("activities")
      .update({ status: "skipped" })
      .eq("user_id", user.id)
      .eq("status", "planned")
      .lte("scheduled_date", cutoffStr)
      .select("id");

    if (error) {
      console.error("Reconcile error:", error);
      return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
    }

    return NextResponse.json({ skipped: data?.length ?? 0 });
  } catch (error) {
    console.error("Reconcile error:", error);
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
  }
}
