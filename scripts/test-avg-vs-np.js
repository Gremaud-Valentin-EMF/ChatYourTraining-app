#!/usr/bin/env node
/**
 * Test two NGP calculation methods against TrainingPeaks data:
 * 1. Coggan ^4 normalization (current approach)
 * 2. Simple average grade-adjusted speed (hypothesis: TP uses this for running)
 *
 * Tests all combinations of damping × method to find global optimum.
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Load env
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// --- CSV parser ---
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

// --- Minetti cost with parameterized dampening ---
function calculateMinettiCost(gradient, damping) {
  const i = Math.max(-0.3, Math.min(0.3, gradient));
  const cost = 155.4*Math.pow(i,5) - 30.4*Math.pow(i,4) - 43.3*Math.pow(i,3) + 46.3*Math.pow(i,2) + 19.5*i + 3.6;
  const rawFactor = cost / 3.6;
  return 1 + (rawFactor - 1) * damping;
}

// --- Compute grade-adjusted speeds from streams ---
function computeGapSpeeds(timeStream, distanceStream, altitudeStream, damping) {
  if (!timeStream?.length || !distanceStream?.length) return [];
  const length = Math.min(timeStream.length, distanceStream.length);
  const hasAltitude = altitudeStream && altitudeStream.length >= length;

  // Distance-based altitude smoothing ±50m
  let smoothedAlt;
  if (hasAltitude) {
    smoothedAlt = new Array(length);
    for (let si = 0; si < length; si++) {
      const centerDist = distanceStream[si];
      let sum = altitudeStream[si], count = 1;
      for (let sj = si-1; sj >= 0 && centerDist - distanceStream[sj] <= 50; sj--) { sum += altitudeStream[sj]; count++; }
      for (let sj = si+1; sj < length && distanceStream[sj] - centerDist <= 50; sj++) { sum += altitudeStream[sj]; count++; }
      smoothedAlt[si] = sum / count;
    }
  }

  const gapSpeeds = [];
  for (let i = 1; i < length; i++) {
    const dt = timeStream[i] - timeStream[i-1];
    const dd = distanceStream[i] - distanceStream[i-1];
    if (dt <= 0 || dd <= 0) continue;
    const speed = dd / dt;
    if (speed < 0.5 || speed > 8.0) continue;
    let grade = 0;
    if (smoothedAlt) {
      let lookback = i;
      while (lookback > 0 && distanceStream[i] - distanceStream[lookback] < 20) lookback--;
      const gradeDist = distanceStream[i] - distanceStream[lookback];
      if (gradeDist >= 20) grade = (smoothedAlt[i] - smoothedAlt[lookback]) / gradeDist;
    }
    const factor = calculateMinettiCost(grade, damping);
    const eqSpeed = speed * factor;
    if (Number.isFinite(eqSpeed) && eqSpeed > 0) gapSpeeds.push({ time: timeStream[i], speed: eqSpeed });
  }
  return gapSpeeds;
}

// --- Method 1: Coggan ^4 normalization (current) ---
function computeNGP_Coggan(gapSpeeds) {
  if (gapSpeeds.length === 0) return 0;
  if (gapSpeeds.length < 30) {
    const avg = gapSpeeds.reduce((s, g) => s + g.speed, 0) / gapSpeeds.length;
    return avg;
  }

  // 30s rolling average
  const rolling = [];
  for (let i = 0; i < gapSpeeds.length; i++) {
    const targetStart = gapSpeeds[i].time - 30;
    let startIdx = i;
    while (startIdx > 0 && gapSpeeds[startIdx-1].time >= targetStart) startIdx--;
    let sum = 0, count = 0;
    for (let j = startIdx; j <= i; j++) { sum += gapSpeeds[j].speed; count++; }
    if (count > 0) rolling.push(sum / count);
  }

  if (rolling.length === 0) return 0;
  // Cap outlier rolling averages at 2x median
  const sortedR = [...rolling].sort((a, b) => a - b);
  const medianR = sortedR[Math.floor(sortedR.length / 2)];
  const capR = medianR * 2;
  const cappedR = rolling.map(v => Math.min(v, capR));
  const mean4th = cappedR.reduce((s, v) => s + Math.pow(v, 4), 0) / cappedR.length;
  return Math.pow(mean4th, 0.25);
}

// --- Method 2: Simple average speed ---
function computeNGP_Average(gapSpeeds) {
  if (gapSpeeds.length === 0) return 0;
  return gapSpeeds.reduce((s, g) => s + g.speed, 0) / gapSpeeds.length;
}

// --- Method 3: Weighted average (time-weighted) ---
function computeNGP_WeightedAvg(gapSpeeds) {
  if (gapSpeeds.length === 0) return 0;
  let totalSpeed = 0, totalTime = 0;
  for (let i = 1; i < gapSpeeds.length; i++) {
    const dt = gapSpeeds[i].time - gapSpeeds[i-1].time;
    if (dt > 0 && dt < 30) { // ignore large gaps
      totalSpeed += gapSpeeds[i].speed * dt;
      totalTime += dt;
    }
  }
  if (totalTime === 0) return gapSpeeds.reduce((s, g) => s + g.speed, 0) / gapSpeeds.length;
  return totalSpeed / totalTime;
}

// --- Method 4: ^4 normalization but NO outlier cap ---
function computeNGP_Coggan_NoCap(gapSpeeds) {
  if (gapSpeeds.length === 0) return 0;
  if (gapSpeeds.length < 30) {
    return gapSpeeds.reduce((s, g) => s + g.speed, 0) / gapSpeeds.length;
  }
  const rolling = [];
  for (let i = 0; i < gapSpeeds.length; i++) {
    const targetStart = gapSpeeds[i].time - 30;
    let startIdx = i;
    while (startIdx > 0 && gapSpeeds[startIdx-1].time >= targetStart) startIdx--;
    let sum = 0, count = 0;
    for (let j = startIdx; j <= i; j++) { sum += gapSpeeds[j].speed; count++; }
    if (count > 0) rolling.push(sum / count);
  }
  if (rolling.length === 0) return 0;
  const mean4th = rolling.reduce((s, v) => s + Math.pow(v, 4), 0) / rolling.length;
  return Math.pow(mean4th, 0.25);
}

// --- Main ---
async function main() {
  // Load both TP exports
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

  console.log("Total unique TP running activities: " + tpRunsUnique.length + "\n");

  const {data: sports} = await supabase.from("sports").select("id, name");
  const sportMap = new Map(sports.map(s => [s.id, s.name]));

  const {data: activities} = await supabase
    .from("activities")
    .select("id, title, scheduled_date, sport_id, actual_duration_minutes, actual_distance_km, raw_data")
    .eq("source", "strava");

  const runActivities = activities.filter(a => {
    const sport = sportMap.get(a.sport_id);
    return sport === "running" || sport === "trail_running";
  });

  const activityIds = runActivities.map(a => a.id);
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

  // Match
  const matched = [];
  const usedApp = new Set();

  for (const tp of tpRunsUnique) {
    const tpDate = tp.WorkoutDay;
    const tpDist = (parseFloat(tp.DistanceInMeters) || 0) / 1000;
    const tpTss = parseFloat(tp.TSS);
    const tpIF = parseFloat(tp.IF) || 0;
    const tpDuration = (parseFloat(tp.TimeTotalInHours) || 0) * 3600;

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
      const streams = streamsByActivity.get(match.id) || {};
      const rawData = match.raw_data || {};
      const movingTime = rawData.moving_time || (match.actual_duration_minutes || 0) * 60;
      const distKm = match.actual_distance_km || 0;
      const avgPace = distKm > 0 ? movingTime / distKm : 0;

      matched.push({
        date: tpDate,
        title: tp.Title || match.title || "",
        tpTss, tpIF, tpDuration,
        movingTime, distKm, avgPace,
        timeStream: streams.time || null,
        distanceStream: streams.distance || null,
        altitudeStream: streams.altitude || null,
        hasStreams: !!(streams.time && streams.distance),
      });
    }
  }

  console.log("Matched: " + matched.filter(m => m.hasStreams).length + "/" + matched.length + " with streams\n");

  // Threshold pace
  const {data: userSports} = await supabase
    .from("user_sports")
    .select("threshold_pace_per_km, sports(name)")
    .eq("user_id", "c37c7234-3630-4ebc-a403-1d9256452021");

  const runSport = (userSports || []).find(s => s.sports?.name === "running" || s.sports?.name === "trail_running");
  const thresholdPace = runSport?.threshold_pace_per_km || 373;
  const ftpaceSpeed = 1000 / thresholdPace;
  console.log("Threshold pace: " + thresholdPace + " s/km (" + Math.floor(thresholdPace/60) + ":" + String(Math.round(thresholdPace%60)).padStart(2,"0") + "/km)\n");

  // Methods to test
  const methods = [
    { name: "Coggan ^4 (with cap)", fn: computeNGP_Coggan },
    { name: "Simple Average", fn: computeNGP_Average },
    { name: "Time-Weighted Avg", fn: computeNGP_WeightedAvg },
    { name: "Coggan ^4 (no cap)", fn: computeNGP_Coggan_NoCap },
  ];

  // Dampening values to test
  const dampingValues = [0.0, 0.05, 0.10, 0.15, 0.20, 0.30, 0.50, 0.75, 1.0];

  const allResults = [];

  for (const method of methods) {
    for (const damping of dampingValues) {
      let totalAbsDiff = 0;
      let totalSquaredDiff = 0;
      let count = 0;
      let within5 = 0;
      let within10 = 0;
      const actDiffs = [];

      for (const m of matched) {
        let ngpSpeed;

        if (m.hasStreams) {
          const gapSpeeds = computeGapSpeeds(m.timeStream, m.distanceStream, m.altitudeStream, damping);
          ngpSpeed = method.fn(gapSpeeds);
        }

        if (!ngpSpeed || ngpSpeed <= 0) {
          ngpSpeed = m.distKm > 0 ? (m.distKm * 1000) / m.movingTime : 0;
        }

        if (ngpSpeed <= 0) continue;

        const IF = ngpSpeed / ftpaceSpeed;
        const durationHours = m.movingTime / 3600;
        const rTss = Math.round(durationHours * IF * IF * 110);

        const diff = rTss - m.tpTss;
        const pctDiff = (diff / m.tpTss) * 100;
        const absPct = Math.abs(pctDiff);

        totalAbsDiff += absPct;
        totalSquaredDiff += pctDiff * pctDiff;
        count++;
        if (absPct <= 5) within5++;
        if (absPct <= 10) within10++;
        actDiffs.push({ date: m.date, title: m.title, tpTss: m.tpTss, appTss: rTss, pct: pctDiff.toFixed(1), tpIF: m.tpIF });
      }

      if (count > 0) {
        allResults.push({
          method: method.name,
          damping,
          avgAbsDiff: totalAbsDiff / count,
          rmse: Math.sqrt(totalSquaredDiff / count),
          within5,
          within10,
          count,
          actDiffs,
        });
      }
    }
  }

  // Sort by avg absolute diff
  allResults.sort((a, b) => a.avgAbsDiff - b.avgAbsDiff);

  // Show top 15
  console.log("=== TOP 15 COMBINATIONS ===\n");
  console.log("Rank  Method                   Damping  AvgAbsDiff   RMSE    Within5%     Within10%");
  console.log("-".repeat(90));
  for (let i = 0; i < Math.min(15, allResults.length); i++) {
    const r = allResults[i];
    console.log(
      String(i+1).padStart(3) + "   " +
      r.method.padEnd(24) + " " +
      r.damping.toFixed(2).padStart(5) + "   " +
      (r.avgAbsDiff.toFixed(1) + "%").padStart(8) + "   " +
      (r.rmse.toFixed(1) + "%").padStart(7) + "   " +
      (r.within5 + "/" + r.count + " (" + Math.round(r.within5/r.count*100) + "%)").padStart(12) + "  " +
      (r.within10 + "/" + r.count + " (" + Math.round(r.within10/r.count*100) + "%)").padStart(12)
    );
  }

  // Show per-activity breakdown for the best
  const best = allResults[0];
  console.log("\n=== BEST: " + best.method + " damping=" + best.damping.toFixed(2) + " ===");
  console.log("Avg absolute diff: " + best.avgAbsDiff.toFixed(1) + "%");
  console.log("RMSE: " + best.rmse.toFixed(1) + "%");
  console.log("Within 5%: " + best.within5 + "/" + best.count);
  console.log("Within 10%: " + best.within10 + "/" + best.count);

  console.log("\n" + "Date".padEnd(12) + "Title".padEnd(30) + "TP TSS".padStart(8) + "App TSS".padStart(9) + "Diff%".padStart(8) + "  TP IF".padStart(8));
  console.log("-".repeat(75));
  for (const a of best.actDiffs) {
    const warn = Math.abs(parseFloat(a.pct)) > 10 ? " !!" : " ok";
    console.log(
      a.date.padEnd(12) +
      (a.title || "").substring(0, 28).padEnd(30) +
      String(a.tpTss.toFixed(1)).padStart(8) +
      String(a.appTss).padStart(9) +
      (a.pct + "%").padStart(8) +
      ("  " + (a.tpIF || 0).toFixed(3)).padStart(8) +
      warn
    );
  }

  // Also show IF comparison for best method
  console.log("\n=== IF COMPARISON (best method) ===\n");
  console.log("Date".padEnd(12) + "TP IF".padStart(8) + "App IF".padStart(9) + "Diff%".padStart(8));
  console.log("-".repeat(37));
  for (const m of matched) {
    let ngpSpeed;
    if (m.hasStreams) {
      const gapSpeeds = computeGapSpeeds(m.timeStream, m.distanceStream, m.altitudeStream, best.damping);
      ngpSpeed = methods.find(mt => mt.name === best.method).fn(gapSpeeds);
    }
    if (!ngpSpeed || ngpSpeed <= 0) {
      ngpSpeed = m.distKm > 0 ? (m.distKm * 1000) / m.movingTime : 0;
    }
    const appIF = ngpSpeed / ftpaceSpeed;
    const tpIF = m.tpIF;
    if (tpIF > 0) {
      const ifDiff = ((appIF - tpIF) / tpIF * 100).toFixed(1);
      console.log(m.date.padEnd(12) + tpIF.toFixed(3).padStart(8) + appIF.toFixed(3).padStart(9) + (ifDiff + "%").padStart(8));
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
