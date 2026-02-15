#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Compare TSS values between our app and TrainingPeaks export
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Load env
const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env.local");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
loadEnvFile(ENV_PATH);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Parse CSV (simple parser for this format)
function parseCSV(content) {
  const lines = content.split("\n").filter((l) => l.trim());
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function formatPace(secondsPerKm) {
  if (!secondsPerKm || secondsPerKm <= 0) return "N/A";
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${String(secs).padStart(2, "0")}/km`;
}

async function main() {
  // Read TP export
  const csvPath = path.join(
    ROOT_DIR,
    "supabase",
    "WorkoutExport-Gremaud-Valentin-2025-07-02-2026-01-10.zip"
  );

  // Use the already extracted CSV
  const csvContent = fs.readFileSync("/tmp/tp-export/workouts.csv", "utf-8");
  const tpWorkouts = parseCSV(csvContent);

  console.log(`\nTrainingPeaks export: ${tpWorkouts.length} workouts\n`);

  // Get user c37c7234 activities from DB
  const { data: activities, error } = await supabase
    .from("activities")
    .select("id, title, scheduled_date, actual_duration_minutes, actual_distance_km, tss, avg_hr, max_hr, avg_power_watts, sport_id, raw_data, source")
    .eq("source", "strava")
    .order("scheduled_date", { ascending: true });

  if (error) {
    console.error("Error fetching activities:", error.message);
    process.exit(1);
  }

  // Get sport names
  const { data: sports } = await supabase.from("sports").select("id, name");
  const sportMap = new Map(sports?.map((s) => [s.id, s.name]) || []);

  console.log(`App activities: ${activities.length}\n`);

  // Map TP workout types to our sport types
  const tpTypeMap = {
    Run: "running",
    Bike: "cycling",
    MTB: "cycling",
    Strength: "strength",
    Walk: "walking",
    Other: "other",
    "XC-Ski": "cross_country_skiing",
  };

  // Match activities by date and type
  const comparisons = [];
  const unmatched_tp = [];
  const unmatched_app = [...activities];

  for (const tp of tpWorkouts) {
    const tpDate = tp.WorkoutDay;
    const tpType = tpTypeMap[tp.WorkoutType] || tp.WorkoutType;
    const tpTss = parseFloat(tp.TSS) || 0;
    const tpIF = parseFloat(tp.IF) || 0;
    const tpDistance = parseFloat(tp.DistanceInMeters) || 0;
    const tpDuration = parseFloat(tp.TimeTotalInHours) || 0;
    const tpHRavg = parseFloat(tp.HeartRateAverage) || 0;
    const tpHRmax = parseFloat(tp.HeartRateMax) || 0;
    const tpPower = parseFloat(tp.PowerAverage) || 0;
    const tpVelocity = parseFloat(tp.VelocityAverage) || 0;

    // Find matching app activity
    const matchIdx = unmatched_app.findIndex((a) => {
      const appDate = a.scheduled_date;
      const appSport = sportMap.get(a.sport_id) || "";
      const dateMatch = appDate === tpDate;

      // Fuzzy sport match
      let sportMatch = false;
      if (tpType === "running" && (appSport === "running" || appSport === "trail_running")) sportMatch = true;
      if (tpType === "cycling" && (appSport === "cycling" || appSport === "spin" || appSport === "mountain_biking")) sportMatch = true;
      if (tpType === "strength" && appSport === "strength") sportMatch = true;
      if (tpType === "walking" && (appSport === "walking" || appSport === "hiking")) sportMatch = true;
      if (tpType === "other" && (appSport === "other" || appSport === "walking" || appSport === "hiking")) sportMatch = true;
      if (tpType === "cross_country_skiing" && appSport === "cross_country_skiing") sportMatch = true;

      // Also match by distance proximity if same date has multiple activities
      const distMatch = tpDistance > 0 && a.actual_distance_km
        ? Math.abs(tpDistance / 1000 - a.actual_distance_km) < 1
        : true;

      return dateMatch && sportMatch && distMatch;
    });

    if (matchIdx >= 0) {
      const app = unmatched_app.splice(matchIdx, 1)[0];
      const appSport = sportMap.get(app.sport_id) || "";
      const appTss = app.tss || 0;
      const diff = appTss - tpTss;
      const pct = tpTss > 0 ? ((diff / tpTss) * 100).toFixed(1) : "N/A";

      comparisons.push({
        date: tpDate,
        title: tp.Title,
        tpType: tp.WorkoutType,
        appSport,
        tpTss: tpTss.toFixed(1),
        appTss,
        diff: diff.toFixed(1),
        pct,
        tpIF: tpIF.toFixed(2),
        tpDuration: (tpDuration * 60).toFixed(0) + "min",
        tpDistance: (tpDistance / 1000).toFixed(1) + "km",
        appDistance: (app.actual_distance_km || 0).toFixed(1) + "km",
        tpHRavg,
        appHRavg: app.avg_hr || 0,
        tpPower,
        appPower: app.avg_power_watts || 0,
      });
    } else {
      unmatched_tp.push({
        date: tpDate,
        title: tp.Title,
        type: tp.WorkoutType,
        tss: tpTss.toFixed(1),
        duration: (tpDuration * 60).toFixed(0) + "min",
      });
    }
  }

  // === OUTPUT ===

  // 1. Running comparison (most important for rTSS fix)
  console.log("=".repeat(130));
  console.log("RUNNING ACTIVITIES COMPARISON (TP vs App)");
  console.log("=".repeat(130));
  console.log(
    "Date".padEnd(12) +
    "Title".padEnd(20) +
    "TP TSS".padStart(8) +
    "App TSS".padStart(9) +
    "Diff".padStart(8) +
    "Diff%".padStart(8) +
    "TP IF".padStart(7) +
    "Duration".padStart(9) +
    "TP Dist".padStart(9) +
    "App Dist".padStart(9) +
    "TP HR".padStart(7) +
    "App HR".padStart(8)
  );
  console.log("-".repeat(130));

  const runComparisons = comparisons.filter(
    (c) => c.tpType === "Run"
  );
  let runTotalTP = 0, runTotalApp = 0;
  for (const c of runComparisons) {
    runTotalTP += parseFloat(c.tpTss);
    runTotalApp += c.appTss;
    const diffColor = Math.abs(parseFloat(c.pct)) > 10 ? " ⚠️" : "";
    console.log(
      c.date.padEnd(12) +
      c.title.substring(0, 19).padEnd(20) +
      c.tpTss.padStart(8) +
      String(c.appTss).padStart(9) +
      c.diff.padStart(8) +
      (c.pct + "%").padStart(8) +
      c.tpIF.padStart(7) +
      c.tpDuration.padStart(9) +
      c.tpDistance.padStart(9) +
      c.appDistance.padStart(9) +
      String(c.tpHRavg).padStart(7) +
      String(c.appHRavg).padStart(8) +
      diffColor
    );
  }
  console.log("-".repeat(130));
  console.log(
    "TOTAL".padEnd(12) +
    "".padEnd(20) +
    runTotalTP.toFixed(1).padStart(8) +
    String(runTotalApp).padStart(9) +
    (runTotalApp - runTotalTP).toFixed(1).padStart(8) +
    ((((runTotalApp - runTotalTP) / runTotalTP) * 100).toFixed(1) + "%").padStart(8)
  );

  // 2. Cycling comparison
  console.log("\n" + "=".repeat(130));
  console.log("CYCLING ACTIVITIES COMPARISON (TP vs App)");
  console.log("=".repeat(130));
  console.log(
    "Date".padEnd(12) +
    "Title".padEnd(20) +
    "TP TSS".padStart(8) +
    "App TSS".padStart(9) +
    "Diff".padStart(8) +
    "Diff%".padStart(8) +
    "TP IF".padStart(7) +
    "Duration".padStart(9) +
    "TP Power".padStart(9) +
    "App Power".padStart(10) +
    "TP HR".padStart(7) +
    "App HR".padStart(8)
  );
  console.log("-".repeat(130));

  const bikeComparisons = comparisons.filter(
    (c) => c.tpType === "Bike" || c.tpType === "MTB"
  );
  let bikeTotalTP = 0, bikeTotalApp = 0;
  for (const c of bikeComparisons) {
    bikeTotalTP += parseFloat(c.tpTss);
    bikeTotalApp += c.appTss;
    const diffColor = Math.abs(parseFloat(c.pct)) > 10 ? " ⚠️" : "";
    console.log(
      c.date.padEnd(12) +
      c.title.substring(0, 19).padEnd(20) +
      c.tpTss.padStart(8) +
      String(c.appTss).padStart(9) +
      c.diff.padStart(8) +
      (c.pct + "%").padStart(8) +
      c.tpIF.padStart(7) +
      c.tpDuration.padStart(9) +
      String(c.tpPower).padStart(9) +
      String(c.appPower).padStart(10) +
      String(c.tpHRavg).padStart(7) +
      String(c.appHRavg).padStart(8) +
      diffColor
    );
  }
  console.log("-".repeat(130));
  console.log(
    "TOTAL".padEnd(12) +
    "".padEnd(20) +
    bikeTotalTP.toFixed(1).padStart(8) +
    String(bikeTotalApp).padStart(9) +
    (bikeTotalApp - bikeTotalTP).toFixed(1).padStart(8) +
    ((((bikeTotalApp - bikeTotalTP) / bikeTotalTP) * 100).toFixed(1) + "%").padStart(8)
  );

  // 3. Other activities
  console.log("\n" + "=".repeat(130));
  console.log("OTHER ACTIVITIES COMPARISON (TP vs App)");
  console.log("=".repeat(130));
  const otherComparisons = comparisons.filter(
    (c) => c.tpType !== "Run" && c.tpType !== "Bike" && c.tpType !== "MTB"
  );
  let otherTotalTP = 0, otherTotalApp = 0;
  for (const c of otherComparisons) {
    otherTotalTP += parseFloat(c.tpTss);
    otherTotalApp += c.appTss;
    console.log(
      `${c.date.padEnd(12)}${c.title.substring(0, 19).padEnd(20)}${c.tpTss.padStart(8)}${String(c.appTss).padStart(9)}${c.diff.padStart(8)}${(c.pct + "%").padStart(8)}  [${c.tpType}/${c.appSport}]`
    );
  }

  // 4. Summary stats
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`Matched activities: ${comparisons.length}/${tpWorkouts.length}`);
  console.log(`Unmatched TP: ${unmatched_tp.length}`);
  console.log(`Unmatched App: ${unmatched_app.length}`);

  // Stats per category
  for (const [label, items] of [
    ["Running", runComparisons],
    ["Cycling", bikeComparisons],
    ["Other", otherComparisons],
  ]) {
    if (items.length === 0) continue;
    const diffs = items.map((c) => parseFloat(c.pct)).filter((p) => !isNaN(p));
    const absDiffs = diffs.map(Math.abs);
    const avgAbsDiff = absDiffs.reduce((a, b) => a + b, 0) / absDiffs.length;
    const maxAbsDiff = Math.max(...absDiffs);
    const within5 = absDiffs.filter((d) => d <= 5).length;
    const within10 = absDiffs.filter((d) => d <= 10).length;
    console.log(`\n${label} (${items.length} activities):`);
    console.log(`  Avg absolute diff: ${avgAbsDiff.toFixed(1)}%`);
    console.log(`  Max absolute diff: ${maxAbsDiff.toFixed(1)}%`);
    console.log(`  Within 5%: ${within5}/${diffs.length} (${((within5/diffs.length)*100).toFixed(0)}%)`);
    console.log(`  Within 10%: ${within10}/${diffs.length} (${((within10/diffs.length)*100).toFixed(0)}%)`);
  }

  // 5. Unmatched TP workouts
  if (unmatched_tp.length > 0) {
    console.log("\n" + "=".repeat(80));
    console.log("UNMATCHED TP WORKOUTS (not found in app)");
    console.log("=".repeat(80));
    for (const u of unmatched_tp) {
      console.log(`  ${u.date} - ${u.title} (${u.type}) - TSS=${u.tss} - ${u.duration}`);
    }
  }
}

main().then(() => process.exit(0));
