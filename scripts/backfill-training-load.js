#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Backfill the `training_load` table for existing users (US-13).
 *
 * Recomputes each athlete's full CTL/ATL/TSB series from their completed
 * activities and stores it, so the dashboard can READ pre-computed values
 * instead of recalculating on the fly.
 *
 * The EMA logic mirrors src/lib/calculations/training-load.ts exactly
 * (ATL 7-day, CTL 42-day, TSB = previous-day CTL − ATL, initial values
 * estimated from the first window) so backfilled rows match what
 * recomputeAndStoreTrainingLoad() writes at runtime.
 *
 * Usage:
 *   node scripts/backfill-training-load.js            # all users with activities
 *   node scripts/backfill-training-load.js --user ID  # a single user
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env.local");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(ENV_PATH);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE env vars. Check .env.local");
  process.exit(1);
}

const ATL_TC = 7;
const CTL_TC = 42;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Mirror of computeTrainingLoadSeries in training-load.ts. */
function computeTrainingLoadSeries(tssData) {
  if (!tssData.length) return [];
  const sorted = [...tssData].sort((a, b) => a.date.localeCompare(b.date));
  const tssByDate = new Map();
  for (const e of sorted) {
    tssByDate.set(e.date, (tssByDate.get(e.date) || 0) + e.tss);
  }
  const uniq = [...tssByDate.keys()].sort();
  const startDate = new Date(uniq[0]);
  const lastDate = new Date(uniq[uniq.length - 1]);
  const endDate = new Date();
  const totalAvailableDays =
    Math.floor((lastDate.getTime() - startDate.getTime()) / DAY_MS) + 1;

  const computeInitial = (tc) => {
    if (totalAvailableDays <= 0) return 0;
    const windowDays = Math.min(tc, totalAvailableDays);
    const cursor = new Date(startDate);
    const windowEnd = new Date(startDate);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + windowDays - 1);
    let sum = 0;
    let days = 0;
    while (cursor <= windowEnd) {
      const ds = cursor.toISOString().split("T")[0];
      sum += tssByDate.get(ds) || 0;
      days += 1;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days === 0 ? 0 : sum / days;
  };

  let prevAtl = computeInitial(ATL_TC);
  let prevCtl = computeInitial(CTL_TC);
  const out = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    const ds = cur.toISOString().split("T")[0];
    const dailyTss = tssByDate.get(ds) || 0;
    const tsb = prevCtl - prevAtl;
    const atl = prevAtl + (dailyTss - prevAtl) / ATL_TC;
    const ctl = prevCtl + (dailyTss - prevCtl) / CTL_TC;
    out.push({
      date: ds,
      dailyTss,
      atl: Math.round(atl * 10) / 10,
      ctl: Math.round(ctl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
    });
    prevAtl = atl;
    prevCtl = ctl;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function backfillUser(supabase, userId) {
  const { data: activities, error } = await supabase
    .from("activities")
    .select("scheduled_date, completed_date, tss, status")
    .eq("user_id", userId);
  if (error) {
    console.error(`  user ${userId}: load failed — ${error.message}`);
    return 0;
  }

  const tssData = (activities || [])
    .filter((a) => a.status === "completed")
    .map((a) => {
      // completed_date is a timestamptz, scheduled_date a DATE — normalise to
      // YYYY-MM-DD so the daily series keys line up.
      const raw = a.completed_date || a.scheduled_date;
      return { date: raw ? raw.slice(0, 10) : null, tss: a.tss || 0 };
    })
    .filter((d) => Boolean(d.date));

  const series = computeTrainingLoadSeries(tssData);

  await supabase.from("training_load").delete().eq("user_id", userId);
  if (series.length === 0) return 0;

  // Dedupe by date (UNIQUE(user_id, date) requires a single row per date).
  const byDate = new Map();
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
  const rows = [...byDate.values()];
  const { error: insertError } = await supabase
    .from("training_load")
    .insert(rows);
  if (insertError) {
    console.error(`  user ${userId}: insert failed — ${insertError.message}`);
    return 0;
  }
  return rows.filter((r) => r.daily_tss > 0).length;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const userArgIdx = process.argv.indexOf("--user");
  let userIds = [];

  if (userArgIdx !== -1 && process.argv[userArgIdx + 1]) {
    userIds = [process.argv[userArgIdx + 1]];
  } else {
    const { data, error } = await supabase
      .from("activities")
      .select("user_id");
    if (error) {
      console.error("Failed to list users:", error.message);
      process.exit(1);
    }
    userIds = [...new Set((data || []).map((r) => r.user_id))];
  }

  console.log(`Backfilling training_load for ${userIds.length} user(s)...`);
  let total = 0;
  for (const uid of userIds) {
    const days = await backfillUser(supabase, uid);
    total += days;
    console.log(`  ${uid} → ${days} activity day(s)`);
  }
  console.log(`Done. ${total} activity day(s) across ${userIds.length} user(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
