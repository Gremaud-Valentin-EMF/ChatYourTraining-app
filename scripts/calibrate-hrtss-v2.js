#!/usr/bin/env node
/**
 * Calibrate hrTSS: test NHR/HRmax-based formulas with different K values
 * and floor adjustments to find optimal match against TP.
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

function calculateNHR(hrStream, timeStream) {
  if (!hrStream || hrStream.length < 30) {
    return hrStream ? hrStream.reduce((a, b) => a + b, 0) / hrStream.length : 0;
  }
  const rollingAverages = [];
  if (timeStream && timeStream.length === hrStream.length) {
    for (let i = 0; i < hrStream.length; i++) {
      const targetStart = timeStream[i] - 30;
      let startIdx = i;
      while (startIdx > 0 && timeStream[startIdx - 1] >= targetStart) startIdx--;
      let sum = 0, count = 0;
      for (let j = startIdx; j <= i; j++) { sum += hrStream[j]; count++; }
      if (count > 0) rollingAverages.push(sum / count);
    }
  } else {
    for (let i = 29; i < hrStream.length; i++) {
      let sum = 0;
      for (let j = i - 29; j <= i; j++) sum += hrStream[j];
      rollingAverages.push(sum / 30);
    }
  }
  if (rollingAverages.length === 0) return hrStream.reduce((a, b) => a + b, 0) / hrStream.length;
  const mean4th = rollingAverages.reduce((s, v) => s + Math.pow(v, 4), 0) / rollingAverages.length;
  return Math.pow(mean4th, 0.25);
}

async function main() {
  const csv1 = fs.readFileSync("/tmp/tp-export/workouts.csv", "utf-8");
  const csv2 = fs.readFileSync("/tmp/tp-export-new.csv", "utf-8");
  const tpAll = [...parseCSV(csv1), ...parseCSV(csv2)];

  const tpNonRun = tpAll.filter(w => parseFloat(w.TSS) > 0 && w.WorkoutType !== "Run");
  const seen = new Set();
  const tpUnique = tpNonRun.filter(w => {
    const key = w.WorkoutDay + "_" + w.WorkoutType + "_" + (parseFloat(w.DistanceInMeters)||0).toFixed(0);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  const {data: physioData} = await supabase.from("physiological_data")
    .select("hr_max, hr_rest, lthr").eq("user_id", "c37c7234-3630-4ebc-a403-1d9256452021").limit(1);

  const hrMax = physioData?.[0]?.hr_max || 195;
  const hrRest = physioData?.[0]?.hr_rest || 60;
  const lthr = physioData?.[0]?.lthr || 170;

  const {data: sports} = await supabase.from("sports").select("id, name");
  const sportMap = new Map(sports.map(s => [s.id, s.name]));

  const {data: activities} = await supabase
    .from("activities")
    .select("id, title, scheduled_date, sport_id, actual_duration_minutes, avg_hr, raw_data")
    .eq("source", "strava");

  const activityIds = activities.map(a => a.id);
  const {data: allStreams} = await supabase
    .from("activity_streams")
    .select("activity_id, data_type, values")
    .in("activity_id", activityIds);

  const streamsByActivity = new Map();
  if (allStreams) {
    for (const s of allStreams) {
      if (!streamsByActivity.has(s.activity_id)) streamsByActivity.set(s.activity_id, {});
      streamsByActivity.get(s.activity_id)[s.data_type] = s.values;
    }
  }

  const matched = [];
  const usedApp = new Set();

  for (const tp of tpUnique) {
    const tpDate = tp.WorkoutDay;
    const tpDist = (parseFloat(tp.DistanceInMeters) || 0) / 1000;
    const tpTss = parseFloat(tp.TSS);
    const tpIF = parseFloat(tp.IF) || 0;
    const tpDuration = (parseFloat(tp.TimeTotalInHours) || 0) * 3600;
    const tpAvgHR = parseInt(tp.HeartRateAverage) || 0;

    const match = activities.find(a => {
      if (usedApp.has(a.id)) return false;
      if (a.scheduled_date !== tpDate) return false;
      const sport = sportMap.get(a.sport_id);
      if (tp.WorkoutType === "Run") return false;
      if (tp.WorkoutType === "Strength" && sport !== "strength") return false;
      if (tp.WorkoutType === "XC-Ski" && sport !== "cross_country_skiing") return false;
      if (tpDist > 0 && a.actual_distance_km && Math.abs(tpDist - a.actual_distance_km) > 2) return false;
      return true;
    });

    if (match) {
      usedApp.add(match.id);
      const streams = streamsByActivity.get(match.id) || {};
      const rawData = match.raw_data || {};
      const elapsedTime = rawData.elapsed_time || rawData.moving_time || (match.actual_duration_minutes || 0) * 60;
      const avgHR = match.avg_hr || rawData.average_heartrate || tpAvgHR;

      // Skip if corrupt elapsed time (> 24h for non-endurance)
      if (elapsedTime > 86400) continue;

      let nhr = 0;
      if (streams.heartrate && streams.heartrate.length > 0) {
        nhr = calculateNHR(streams.heartrate, streams.time || null);
      }

      // Use best HR: NHR from stream if available, else avgHR
      const effectiveHR = nhr > 0 ? nhr : avgHR;

      if (effectiveHR <= 0 || tpTss <= 3) continue;

      matched.push({
        date: tpDate, type: tp.WorkoutType,
        title: match.title || tp.Title || "",
        tpTss, tpIF, tpDuration,
        avgHR, nhr: Math.round(nhr), effectiveHR: Math.round(effectiveHR),
        elapsedTime, hasStream: nhr > 0,
      });
    }
  }

  console.log("Matched activities (with HR, excluding corrupt): " + matched.length + "\n");
  console.log("User: HRmax=" + hrMax + " HRrest=" + hrRest + " LTHR=" + lthr + "\n");

  // Test multiple approaches
  const formulas = [];

  // A. NHR/HRmax based with various K
  for (const K of [80, 90, 100, 110, 120, 130, 140, 150]) {
    formulas.push({
      name: "effHR/HRmax K=" + K,
      calc: (m) => {
        const ifVal = m.effectiveHR / hrMax;
        return Math.round(ifVal * ifVal * (m.elapsedTime / 3600) * K);
      },
    });
  }

  // B. NHR/HRmax with floor + K
  for (const floor of [0.55, 0.58, 0.60]) {
    for (const K of [100, 110, 120]) {
      formulas.push({
        name: "max(" + floor + ",effHR/HRmax) K=" + K,
        calc: (m) => {
          const ifVal = Math.max(floor, m.effectiveHR / hrMax);
          return Math.round(ifVal * ifVal * (m.elapsedTime / 3600) * K);
        },
      });
    }
  }

  // C. Linear mapping of effHR/HRmax to TP-like IF
  // IF = a + b × (effHR/HRmax), then IF² × h × 110
  for (const [a, b] of [[0.20, 0.75], [0.25, 0.70], [0.30, 0.65], [0.15, 0.80]]) {
    formulas.push({
      name: "linear(" + a + "+" + b + "×r) ×110",
      calc: (m) => {
        const r = m.effectiveHR / hrMax;
        const ifVal = a + b * r;
        return Math.round(ifVal * ifVal * (m.elapsedTime / 3600) * 110);
      },
    });
  }

  // D. %HRR based (effHR-HRrest)/(HRmax-HRrest)
  for (const K of [100, 120, 140, 160, 180]) {
    formulas.push({
      name: "%HRR K=" + K,
      calc: (m) => {
        const hrr = (m.effectiveHR - hrRest) / (hrMax - hrRest);
        return Math.round(hrr * hrr * (m.elapsedTime / 3600) * K);
      },
    });
  }

  // E. TP's actual IF (reference)
  formulas.push({
    name: "TP IF² × h × 110 (ref)",
    calc: (m) => {
      if (!m.tpIF) return 0;
      return Math.round(m.tpIF * m.tpIF * (m.tpDuration / 3600) * 110);
    },
  });

  // Evaluate
  const results = [];
  for (const formula of formulas) {
    let totalAbsDiff = 0, totalSquaredDiff = 0, count = 0, within5 = 0, within10 = 0, within20 = 0;

    for (const m of matched) {
      const computed = formula.calc(m);
      if (computed <= 0) continue;
      const pctDiff = ((computed - m.tpTss) / m.tpTss) * 100;
      const absPct = Math.abs(pctDiff);
      totalAbsDiff += absPct;
      totalSquaredDiff += pctDiff * pctDiff;
      count++;
      if (absPct <= 5) within5++;
      if (absPct <= 10) within10++;
      if (absPct <= 20) within20++;
    }

    if (count > 0) {
      results.push({
        name: formula.name,
        avgAbsDiff: totalAbsDiff / count,
        rmse: Math.sqrt(totalSquaredDiff / count),
        within5, within10, within20, count,
        fn: formula.calc,
      });
    }
  }

  results.sort((a, b) => a.avgAbsDiff - b.avgAbsDiff);

  console.log("=== TOP 15 FORMULAS ===\n");
  console.log(
    "Rank".padStart(4) + "  " +
    "Formula".padEnd(34) +
    "AvgDiff".padStart(8) +
    "RMSE".padStart(8) +
    "W5%".padStart(13) +
    "W10%".padStart(13) +
    "W20%".padStart(13)
  );
  console.log("-".repeat(95));
  for (let i = 0; i < Math.min(15, results.length); i++) {
    const r = results[i];
    console.log(
      String(i + 1).padStart(4) + "  " +
      r.name.padEnd(34) +
      (r.avgAbsDiff.toFixed(1) + "%").padStart(8) +
      (r.rmse.toFixed(1) + "%").padStart(8) +
      (r.within5 + "/" + r.count + " (" + Math.round(r.within5/r.count*100) + "%)").padStart(13) +
      (r.within10 + "/" + r.count + " (" + Math.round(r.within10/r.count*100) + "%)").padStart(13) +
      (r.within20 + "/" + r.count + " (" + Math.round(r.within20/r.count*100) + "%)").padStart(13)
    );
  }

  // Show per-activity for best practical formula (not the TP ref)
  const bestPractical = results.find(r => !r.name.includes("TP IF"));
  if (bestPractical) {
    console.log("\n=== BEST PRACTICAL: " + bestPractical.name + " ===\n");
    console.log(
      "Date".padEnd(12) + "Type".padEnd(10) +
      "TP".padStart(6) + "Calc".padStart(6) + "Diff%".padStart(8) +
      " effHR".padStart(6) + " avgHR".padStart(6) + " NHR".padStart(6) +
      " TP IF".padStart(7) + " calcIF".padStart(7)
    );
    console.log("-".repeat(80));
    for (const m of matched) {
      const computed = bestPractical.fn(m);
      if (computed <= 0) continue;
      const pct = ((computed - m.tpTss) / m.tpTss * 100).toFixed(1);
      // Reverse-derive IF from our formula
      const h = m.elapsedTime / 3600;
      const derivedIF = h > 0 ? Math.sqrt(computed / (h * 110)).toFixed(3) : "N/A";
      const mark = Math.abs(parseFloat(pct)) > 20 ? " !!" : Math.abs(parseFloat(pct)) > 10 ? " ?" : " ok";
      console.log(
        m.date.padEnd(12) +
        m.type.substring(0, 8).padEnd(10) +
        m.tpTss.toFixed(0).padStart(6) +
        String(computed).padStart(6) +
        (pct + "%").padStart(8) +
        String(m.effectiveHR).padStart(6) +
        String(m.avgHR).padStart(6) +
        String(m.nhr || "N/A").padStart(6) +
        (m.tpIF ? m.tpIF.toFixed(3) : "N/A").padStart(7) +
        derivedIF.padStart(7) +
        mark
      );
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
