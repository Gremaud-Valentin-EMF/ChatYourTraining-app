#!/usr/bin/env node
/**
 * Detailed hrTSS analysis: compare our TRIMP-based hrTSS against TrainingPeaks
 * for all non-running activities (strength, XC skiing, walking, etc.)
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

// TRIMP calculation (mirrors training-load.ts)
const TRIMP_COEFFICIENTS = {
  male: { base: 0.64, k: 1.92 },
  female: { base: 0.86, k: 1.67 },
};

function calculateHrTSS_detailed(params) {
  const { hrStream, timeStream, avgHr, hrRest, hrMax, lthr, durationSeconds, gender = "male" } = params;
  if (!durationSeconds || !hrMax || !lthr || hrMax <= hrRest || (!hrStream && !avgHr)) return { hrTss: 0 };

  const coeff = TRIMP_COEFFICIENTS[gender];
  const lthrr = Math.max(0, Math.min(1, (lthr - hrRest) / (hrMax - hrRest)));
  const trimpThreshold = 60 * lthrr * coeff.base * Math.exp(coeff.k * lthrr);

  let trimp = 0;
  let totalDtMinutes = 0;
  let avgHRR = 0;

  if (hrStream && hrStream.length > 0) {
    const useTimeStream = timeStream && timeStream.length === hrStream.length && timeStream.length > 1 &&
      timeStream[0] >= 0 && timeStream[timeStream.length - 1] > timeStream[0];

    if (useTimeStream) {
      for (let i = 0; i < hrStream.length; i++) {
        let dt = 0;
        if (i === 0) {
          dt = (timeStream[1] - timeStream[0]) / 2 / 60;
        } else if (i === hrStream.length - 1) {
          dt = (timeStream[i] - timeStream[i - 1]) / 2 / 60;
        } else {
          const dtBefore = timeStream[i] - timeStream[i - 1];
          const dtAfter = (i + 1 < timeStream.length ? timeStream[i + 1] : timeStream[i]) - timeStream[i];
          dt = (dtBefore + dtAfter) / 2 / 60;
        }
        const hr = hrStream[i];
        const hrr = Math.max(0, Math.min(1, (hr - hrRest) / (hrMax - hrRest)));
        trimp += dt * hrr * coeff.base * Math.exp(coeff.k * hrr);
        totalDtMinutes += dt;
        avgHRR += hrr * dt;
      }
      if (totalDtMinutes > 0) avgHRR /= totalDtMinutes;
    } else {
      const dtMinutes = durationSeconds / hrStream.length / 60;
      for (const hr of hrStream) {
        const hrr = Math.max(0, Math.min(1, (hr - hrRest) / (hrMax - hrRest)));
        trimp += dtMinutes * hrr * coeff.base * Math.exp(coeff.k * hrr);
        totalDtMinutes += dtMinutes;
        avgHRR += hrr;
      }
      avgHRR /= hrStream.length;
    }
  } else if (avgHr) {
    const durationMinutes = durationSeconds / 60;
    const hrr = Math.max(0, Math.min(1, (avgHr - hrRest) / (hrMax - hrRest)));
    trimp = durationMinutes * hrr * coeff.base * Math.exp(coeff.k * hrr);
    totalDtMinutes = durationMinutes;
    avgHRR = hrr;
  }

  const hrTss = (trimp / trimpThreshold) * 100;

  return {
    hrTss: Math.round(hrTss),
    trimp: trimp.toFixed(1),
    trimpThreshold: trimpThreshold.toFixed(1),
    totalDtMinutes: totalDtMinutes.toFixed(1),
    avgHRR: avgHRR.toFixed(3),
    lthrr: lthrr.toFixed(3),
    streamLen: hrStream ? hrStream.length : 0,
  };
}

async function main() {
  // Load TP exports
  const csv1 = fs.readFileSync("/tmp/tp-export/workouts.csv", "utf-8");
  const csv2 = fs.readFileSync("/tmp/tp-export-new.csv", "utf-8");
  const tpAll = [...parseCSV(csv1), ...parseCSV(csv2)];

  // All TP activities with TSS (non-running)
  const tpNonRun = tpAll.filter(w => parseFloat(w.TSS) > 0 && w.WorkoutType !== "Run");
  // Also include running for reference
  const tpRun = tpAll.filter(w => parseFloat(w.TSS) > 0 && w.WorkoutType === "Run");

  // Deduplicate
  const seen = new Set();
  const tpUnique = [...tpNonRun, ...tpRun].filter(w => {
    const key = w.WorkoutDay + "_" + w.WorkoutType + "_" + (parseFloat(w.DistanceInMeters)||0).toFixed(0);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  // Get user physio
  const {data: physioData} = await supabase
    .from("physiological_data")
    .select("hr_max, hr_rest, lthr")
    .eq("user_id", "c37c7234-3630-4ebc-a403-1d9256452021")
    .limit(1);

  const hrMax = physioData?.[0]?.hr_max || 195;
  const hrRest = physioData?.[0]?.hr_rest || 60;
  const lthr = physioData?.[0]?.lthr || Math.round(hrMax * 0.85);

  console.log("User physio: HRmax=" + hrMax + " HRrest=" + hrRest + " LTHR=" + lthr + "\n");

  // Get app activities
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

  // Match and analyze
  const usedApp = new Set();
  const results = [];

  for (const tp of tpUnique) {
    const tpDate = tp.WorkoutDay;
    const tpDist = (parseFloat(tp.DistanceInMeters) || 0) / 1000;
    const tpTss = parseFloat(tp.TSS);
    const tpIF = parseFloat(tp.IF) || 0;
    const tpDuration = (parseFloat(tp.TimeTotalInHours) || 0) * 3600;
    const tpAvgHR = parseInt(tp.HeartRateAverage) || 0;
    const tpMaxHR = parseInt(tp.HeartRateMax) || 0;

    const match = activities.find(a => {
      if (usedApp.has(a.id)) return false;
      if (a.scheduled_date !== tpDate) return false;
      if (tpDist > 0 && a.actual_distance_km) {
        if (Math.abs(tpDist - a.actual_distance_km) > 2) return false;
      }
      // Match by type roughly
      const sport = sportMap.get(a.sport_id);
      if (tp.WorkoutType === "Run" && sport !== "running" && sport !== "trail_running") return false;
      if (tp.WorkoutType === "Strength" && sport !== "strength") return false;
      if (tp.WorkoutType === "XC-Ski" && sport !== "cross_country_skiing") return false;
      return true;
    });

    if (match) {
      usedApp.add(match.id);
      const streams = streamsByActivity.get(match.id) || {};
      const rawData = match.raw_data || {};
      const movingTime = rawData.moving_time || (match.actual_duration_minutes || 0) * 60;
      const elapsedTime = rawData.elapsed_time || movingTime;
      const sport = sportMap.get(match.sport_id);

      // Calculate hrTSS with detailed breakdown
      const hrResult = calculateHrTSS_detailed({
        hrStream: streams.heartrate || null,
        timeStream: streams.time || null,
        avgHr: match.avg_hr || rawData.average_heartrate || null,
        hrRest, hrMax, lthr,
        durationSeconds: elapsedTime,
        gender: "male",
      });

      results.push({
        date: tpDate,
        type: tp.WorkoutType,
        sport,
        title: match.title || tp.Title || "",
        tpTss, tpIF, tpDuration, tpAvgHR, tpMaxHR,
        appTss: match.tss,
        hrTss: hrResult.hrTss,
        movingTime, elapsedTime,
        appAvgHR: match.avg_hr,
        ...hrResult,
      });
    }
  }

  // Display non-running activities
  console.log("=== NON-RUNNING ACTIVITIES (hrTSS candidates) ===\n");
  console.log(
    "Date".padEnd(12) +
    "Type".padEnd(12) +
    "Title".padEnd(22) +
    "TP TSS".padStart(7) +
    "DB TSS".padStart(7) +
    "hrTSS".padStart(7) +
    "Ratio".padStart(7) +
    " TP IF".padStart(7) +
    " AvgHR".padStart(7) +
    " TRIMP".padStart(8) +
    " TrThr".padStart(7) +
    " AvgHRR".padStart(8) +
    " LTHRR".padStart(7) +
    " Dur(s)".padStart(8)
  );
  console.log("-".repeat(130));

  const nonRun = results.filter(r => r.type !== "Run");
  for (const r of nonRun) {
    const ratio = r.hrTss > 0 ? (r.tpTss / r.hrTss).toFixed(1) : "N/A";
    console.log(
      r.date.padEnd(12) +
      r.type.padEnd(12) +
      (r.title || "").substring(0, 20).padEnd(22) +
      r.tpTss.toFixed(1).padStart(7) +
      String(r.appTss).padStart(7) +
      String(r.hrTss).padStart(7) +
      String(ratio).padStart(7) +
      (r.tpIF ? r.tpIF.toFixed(2) : "N/A").padStart(7) +
      String(r.appAvgHR || r.tpAvgHR || "N/A").padStart(7) +
      String(r.trimp || "0").padStart(8) +
      String(r.trimpThreshold || "0").padStart(7) +
      String(r.avgHRR || "0").padStart(8) +
      String(r.lthrr || "0").padStart(7) +
      String(r.elapsedTime || 0).padStart(8)
    );
  }

  // Stats
  const withHrTss = nonRun.filter(r => r.hrTss > 0);
  if (withHrTss.length > 0) {
    const ratios = withHrTss.map(r => r.tpTss / r.hrTss);
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const medianRatio = [...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)];
    console.log("\n--- Stats (non-running with hrTSS > 0) ---");
    console.log("Count: " + withHrTss.length);
    console.log("Avg TP/hrTSS ratio: " + avgRatio.toFixed(2));
    console.log("Median TP/hrTSS ratio: " + medianRatio.toFixed(2));
    console.log("Ratios: " + ratios.map(r => r.toFixed(1)).join(", "));
  }

  // Also show running for reference
  console.log("\n=== RUNNING ACTIVITIES (rTSS, for reference) ===\n");
  const run = results.filter(r => r.type === "Run");
  for (const r of run) {
    const ratio = r.hrTss > 0 ? (r.tpTss / r.hrTss).toFixed(1) : "N/A";
    console.log(
      r.date.padEnd(12) +
      "TP=" + r.tpTss.toFixed(0).padStart(4) +
      " DB=" + String(r.appTss).padStart(4) +
      " hrTSS=" + String(r.hrTss).padStart(4) +
      " ratio=" + ratio.padStart(5) +
      " avgHR=" + String(r.appAvgHR || "").padStart(4)
    );
  }

  // TP's hrTSS formula analysis
  console.log("\n=== TP hrTSS FORMULA REVERSE-ENGINEERING ===\n");
  console.log("TP uses: hrTSS = IF^2 * hours * 100");
  console.log("where IF = avgHR / LTHR (heart rate intensity factor)\n");

  for (const r of nonRun) {
    if (r.tpIF > 0 && r.tpDuration > 0) {
      const tpHours = r.tpDuration / 3600;
      const expectedTss = Math.round(r.tpIF * r.tpIF * tpHours * 100);
      const hrIF = r.tpAvgHR > 0 ? (r.tpAvgHR / lthr).toFixed(3) : "?";
      const hrIF_calc = r.tpAvgHR > 0 ? r.tpAvgHR / lthr : 0;
      const hrIFtss = hrIF_calc > 0 ? Math.round(hrIF_calc * hrIF_calc * tpHours * 100) : 0;
      console.log(
        r.date.padEnd(12) +
        r.type.padEnd(12) +
        "TP TSS=" + r.tpTss.toFixed(0).padStart(4) +
        " IF²*h*100=" + String(expectedTss).padStart(4) +
        " TP IF=" + r.tpIF.toFixed(3).padStart(6) +
        " avgHR/LTHR=" + hrIF.padStart(6) +
        " hrIF²*h*100=" + String(hrIFtss).padStart(4) +
        " TP avgHR=" + String(r.tpAvgHR).padStart(4) +
        " dur=" + tpHours.toFixed(2) + "h"
      );
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
