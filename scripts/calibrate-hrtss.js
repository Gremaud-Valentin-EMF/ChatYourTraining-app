#!/usr/bin/env node
/**
 * Calibrate hrTSS formula against TrainingPeaks.
 * Tests multiple IF formulas × multipliers to find the best match.
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

// NHR calculation (Coggan ^4 on HR stream)
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

// TRIMP calculation (current)
function calculateTRIMP(hrStream, timeStream, avgHr, hrRest, hrMax, durationSeconds) {
  const coeff = { base: 0.64, k: 1.92 };
  let trimp = 0;
  if (hrStream && hrStream.length > 0) {
    const useTS = timeStream && timeStream.length === hrStream.length && timeStream.length > 1;
    if (useTS) {
      for (let i = 0; i < hrStream.length; i++) {
        let dt = 0;
        if (i === 0) dt = (timeStream[1] - timeStream[0]) / 2 / 60;
        else if (i === hrStream.length - 1) dt = (timeStream[i] - timeStream[i - 1]) / 2 / 60;
        else dt = ((timeStream[i] - timeStream[i - 1]) + (timeStream[Math.min(i + 1, timeStream.length - 1)] - timeStream[i])) / 2 / 60;
        const hrr = Math.max(0, Math.min(1, (hrStream[i] - hrRest) / (hrMax - hrRest)));
        trimp += dt * hrr * coeff.base * Math.exp(coeff.k * hrr);
      }
    } else {
      const dtMin = durationSeconds / hrStream.length / 60;
      for (const hr of hrStream) {
        const hrr = Math.max(0, Math.min(1, (hr - hrRest) / (hrMax - hrRest)));
        trimp += dtMin * hrr * coeff.base * Math.exp(coeff.k * hrr);
      }
    }
  } else if (avgHr) {
    const dtMin = durationSeconds / 60;
    const hrr = Math.max(0, Math.min(1, (avgHr - hrRest) / (hrMax - hrRest)));
    trimp = dtMin * hrr * coeff.base * Math.exp(coeff.k * hrr);
  }
  return trimp;
}

async function main() {
  const csv1 = fs.readFileSync("/tmp/tp-export/workouts.csv", "utf-8");
  const csv2 = fs.readFileSync("/tmp/tp-export-new.csv", "utf-8");
  const tpAll = [...parseCSV(csv1), ...parseCSV(csv2)];

  // All TP activities with TSS (non-running, since running uses rTSS)
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

  console.log("User physio: HRmax=" + hrMax + " HRrest=" + hrRest + " LTHR=" + lthr + "\n");

  const {data: sports} = await supabase.from("sports").select("id, name");
  const sportMap = new Map(sports.map(s => [s.id, s.name]));

  const {data: activities} = await supabase
    .from("activities")
    .select("id, title, scheduled_date, sport_id, actual_duration_minutes, actual_distance_km, avg_hr, tss, raw_data")
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

  // Match TP activities to app activities
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
      if (tp.WorkoutType === "Run") return false; // skip running
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

      // Calculate NHR from stream
      let nhr = 0;
      if (streams.heartrate && streams.heartrate.length > 0) {
        nhr = calculateNHR(streams.heartrate, streams.time || null);
      }

      // Calculate TRIMP from stream
      const trimp = calculateTRIMP(
        streams.heartrate || null, streams.time || null,
        avgHR, hrRest, hrMax, elapsedTime
      );
      const lthrr = (lthr - hrRest) / (hrMax - hrRest);
      const trimpThreshold = 60 * lthrr * 0.64 * Math.exp(1.92 * lthrr);

      matched.push({
        date: tpDate,
        type: tp.WorkoutType,
        title: match.title || tp.Title || "",
        tpTss, tpIF, tpDuration,
        tpAvgHR, avgHR,
        elapsedTime,
        nhr: Math.round(nhr),
        hasStream: !!(streams.heartrate && streams.heartrate.length > 0),
        trimp, trimpThreshold,
      });
    }
  }

  // Filter to only activities with HR data
  const withHR = matched.filter(m => m.avgHR > 0 && m.tpTss > 3);
  console.log("Matched non-running activities with HR: " + withHR.length + "/" + matched.length + "\n");

  // Test formulas
  const formulas = [
    {
      name: "TRIMP (current)",
      calc: (m) => Math.round((m.trimp / m.trimpThreshold) * 100),
    },
    {
      name: "avgHR/LTHR ^2 × h × 100",
      calc: (m) => {
        const ifVal = m.avgHR / lthr;
        return Math.round(ifVal * ifVal * (m.elapsedTime / 3600) * 100);
      },
    },
    {
      name: "avgHR/LTHR ^2 × h × 110",
      calc: (m) => {
        const ifVal = m.avgHR / lthr;
        return Math.round(ifVal * ifVal * (m.elapsedTime / 3600) * 110);
      },
    },
    {
      name: "%HRR ^2 × h × 100",
      calc: (m) => {
        const hrr = (m.avgHR - hrRest) / (lthr - hrRest);
        return Math.round(hrr * hrr * (m.elapsedTime / 3600) * 100);
      },
    },
    {
      name: "NHR/LTHR ^2 × h × 100",
      calc: (m) => {
        if (!m.nhr) return 0;
        const ifVal = m.nhr / lthr;
        return Math.round(ifVal * ifVal * (m.elapsedTime / 3600) * 100);
      },
    },
    {
      name: "NHR/LTHR ^2 × h × 110",
      calc: (m) => {
        if (!m.nhr) return 0;
        const ifVal = m.nhr / lthr;
        return Math.round(ifVal * ifVal * (m.elapsedTime / 3600) * 110);
      },
    },
    {
      name: "avgHR/HRmax ^2 × h × 100",
      calc: (m) => {
        const ifVal = m.avgHR / hrMax;
        return Math.round(ifVal * ifVal * (m.elapsedTime / 3600) * 100);
      },
    },
    {
      name: "TRIMP × 1.4",
      calc: (m) => Math.round((m.trimp / m.trimpThreshold) * 100 * 1.4),
    },
    {
      name: "TP IF ^2 × h × 110",
      calc: (m) => {
        if (!m.tpIF) return 0;
        return Math.round(m.tpIF * m.tpIF * (m.tpDuration / 3600) * 110);
      },
    },
  ];

  // Evaluate each formula
  const results = [];
  for (const formula of formulas) {
    let totalAbsDiff = 0, totalSquaredDiff = 0, count = 0, within5 = 0, within10 = 0, within20 = 0;

    for (const m of withHR) {
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

  console.log("=== FORMULA COMPARISON ===\n");
  console.log(
    "Rank".padStart(4) + "  " +
    "Formula".padEnd(30) +
    "AvgDiff".padStart(8) +
    "RMSE".padStart(8) +
    "W5%".padStart(12) +
    "W10%".padStart(12) +
    "W20%".padStart(12) +
    "Count".padStart(6)
  );
  console.log("-".repeat(92));
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(
      String(i + 1).padStart(4) + "  " +
      r.name.padEnd(30) +
      (r.avgAbsDiff.toFixed(1) + "%").padStart(8) +
      (r.rmse.toFixed(1) + "%").padStart(8) +
      (r.within5 + "/" + r.count + " (" + Math.round(r.within5/r.count*100) + "%)").padStart(12) +
      (r.within10 + "/" + r.count + " (" + Math.round(r.within10/r.count*100) + "%)").padStart(12) +
      (r.within20 + "/" + r.count + " (" + Math.round(r.within20/r.count*100) + "%)").padStart(12) +
      String(r.count).padStart(6)
    );
  }

  // Show per-activity breakdown for the best
  const best = results[0];
  console.log("\n=== BEST: " + best.name + " ===\n");
  console.log(
    "Date".padEnd(12) + "Type".padEnd(10) + "Title".padEnd(22) +
    "TP".padStart(6) + "Calc".padStart(6) + "Diff%".padStart(8) +
    " avgHR".padStart(6) + " NHR".padStart(6) + " TP IF".padStart(7) +
    " dur(s)".padStart(8)
  );
  console.log("-".repeat(92));
  for (const m of withHR) {
    const computed = best.fn(m);
    if (computed <= 0) continue;
    const pct = ((computed - m.tpTss) / m.tpTss * 100).toFixed(1);
    const mark = Math.abs(parseFloat(pct)) > 20 ? " !!" : Math.abs(parseFloat(pct)) > 10 ? " ?" : " ok";
    console.log(
      m.date.padEnd(12) +
      m.type.substring(0, 8).padEnd(10) +
      (m.title || "").substring(0, 20).padEnd(22) +
      m.tpTss.toFixed(0).padStart(6) +
      String(computed).padStart(6) +
      (pct + "%").padStart(8) +
      String(m.avgHR).padStart(6) +
      String(m.nhr || "N/A").padStart(6) +
      (m.tpIF ? m.tpIF.toFixed(3) : "N/A").padStart(7) +
      String(m.elapsedTime).padStart(8) +
      mark
    );
  }

  // Reverse-engineer TP's IF
  console.log("\n=== TP IF REVERSE-ENGINEERING ===\n");
  console.log(
    "Date".padEnd(12) + "TP IF".padStart(7) +
    " avg/LTHR".padStart(9) + " %HRR".padStart(7) +
    " avg/HRmax".padStart(10) + " NHR/LTHR".padStart(10) +
    " avgHR".padStart(7) + " NHR".padStart(6)
  );
  console.log("-".repeat(75));
  for (const m of withHR.filter(m => m.tpIF > 0)) {
    const avgOverLTHR = (m.avgHR / lthr).toFixed(3);
    const hrrPct = ((m.avgHR - hrRest) / (lthr - hrRest)).toFixed(3);
    const avgOverMax = (m.avgHR / hrMax).toFixed(3);
    const nhrOverLTHR = m.nhr ? (m.nhr / lthr).toFixed(3) : "N/A";
    console.log(
      m.date.padEnd(12) +
      m.tpIF.toFixed(3).padStart(7) +
      avgOverLTHR.padStart(9) +
      hrrPct.padStart(7) +
      avgOverMax.padStart(10) +
      nhrOverLTHR.padStart(10) +
      String(m.avgHR).padStart(7) +
      String(m.nhr || "N/A").padStart(6)
    );
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
