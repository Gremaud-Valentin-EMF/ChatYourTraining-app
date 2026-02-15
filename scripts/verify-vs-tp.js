#!/usr/bin/env node
/**
 * Final verification: compare recalculated DB values against TP exports
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ROOT_DIR = path.resolve(__dirname, "..");
const envContent = fs.readFileSync(path.join(ROOT_DIR, ".env.local"), "utf-8");
for (const line of envContent.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) {
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function parseCSVLine(line) {
  const result = []; let current = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else current += ch;
  }
  result.push(current); return result;
}
function parseCSV(content) {
  const lines = content.split("\n").filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => row[h] = vals[i] || "");
    return row;
  });
}

async function main() {
  const csv1 = fs.readFileSync("/tmp/tp-export/workouts.csv", "utf-8");
  const csv2 = fs.readFileSync("/tmp/tp-export-new.csv", "utf-8");
  const tpAll = [...parseCSV(csv1), ...parseCSV(csv2)];

  const tpRuns = tpAll.filter(w => w.WorkoutType === "Run" && parseFloat(w.TSS) > 0);
  const seen = new Set();
  const tpRunsUnique = tpRuns.filter(w => {
    const key = w.WorkoutDay + "_" + (parseFloat(w.DistanceInMeters)||0).toFixed(0);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  const {data: sports} = await supabase.from("sports").select("id, name");
  const sportMap = new Map(sports.map(s => [s.id, s.name]));

  const {data: activities} = await supabase
    .from("activities")
    .select("id, title, scheduled_date, sport_id, actual_distance_km, tss, raw_data")
    .eq("source", "strava");

  const runActivities = activities.filter(a => {
    const sport = sportMap.get(a.sport_id);
    return sport === "running" || sport === "trail_running";
  });

  let totalAbsDiff = 0, count = 0, within5 = 0, within10 = 0, totalSquaredDiff = 0;
  const results = [];
  const usedApp = new Set();

  for (const tp of tpRunsUnique) {
    const tpDate = tp.WorkoutDay;
    const tpDist = (parseFloat(tp.DistanceInMeters) || 0) / 1000;
    const tpTss = parseFloat(tp.TSS);

    const match = runActivities.find(a => {
      if (usedApp.has(a.id)) return false;
      if (a.scheduled_date !== tpDate) return false;
      if (tpDist > 0 && a.actual_distance_km) {
        if (Math.abs(tpDist - a.actual_distance_km) > 1) return false;
      }
      return true;
    });

    if (match) {
      usedApp.add(match.id);
      const appTss = match.tss || 0;
      const pctDiff = ((appTss - tpTss) / tpTss) * 100;
      const absPct = Math.abs(pctDiff);
      totalAbsDiff += absPct;
      totalSquaredDiff += pctDiff * pctDiff;
      count++;
      if (absPct <= 5) within5++;
      if (absPct <= 10) within10++;
      results.push({ date: tpDate, title: match.title, tpTss, appTss, pct: pctDiff.toFixed(1) });
    }
  }

  console.log("=== FINAL VERIFICATION: App DB vs TrainingPeaks ===\n");
  console.log("Date".padEnd(12) + "Title".padEnd(25) + "TP TSS".padStart(8) + "App TSS".padStart(9) + "Diff%".padStart(8));
  console.log("-".repeat(62));
  for (const r of results) {
    const mark = Math.abs(parseFloat(r.pct)) > 10 ? " !!" : " ok";
    console.log(
      r.date.padEnd(12) +
      (r.title || "").substring(0, 23).padEnd(25) +
      r.tpTss.toFixed(1).padStart(8) +
      String(r.appTss).padStart(9) +
      (r.pct + "%").padStart(8) +
      mark
    );
  }

  console.log("\n=== SUMMARY ===");
  console.log("Avg absolute diff: " + (totalAbsDiff / count).toFixed(1) + "%");
  console.log("RMSE: " + Math.sqrt(totalSquaredDiff / count).toFixed(1) + "%");
  console.log("Within 5%: " + within5 + "/" + count + " (" + Math.round(within5/count*100) + "%)");
  console.log("Within 10%: " + within10 + "/" + count + " (" + Math.round(within10/count*100) + "%)");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
