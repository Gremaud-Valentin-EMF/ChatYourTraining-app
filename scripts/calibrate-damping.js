#!/usr/bin/env node
/**
 * Calibrate the Minetti grade dampening factor by testing values from 0.0 to 1.0
 * against TrainingPeaks TSS data for running activities.
 *
 * Uses both TP exports and activity streams from Supabase.
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

// --- Compute NGP with given dampening ---
function computeNGP(timeStream, distanceStream, altitudeStream, damping) {
  if (!timeStream?.length || !distanceStream?.length) return 0;
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

  if (gapSpeeds.length < 30) {
    if (gapSpeeds.length === 0) return 0;
    const avg = gapSpeeds.reduce((s, g) => s + g.speed, 0) / gapSpeeds.length;
    return Math.round((1000 / avg) * 10) / 10;
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
  // Cap outlier rolling averages at 2× median
  const sortedR = [...rolling].sort((a, b) => a - b);
  const medianR = sortedR[Math.floor(sortedR.length / 2)];
  const capR = medianR * 2;
  const cappedR = rolling.map(v => Math.min(v, capR));
  const mean4th = cappedR.reduce((s, v) => s + Math.pow(v, 4), 0) / cappedR.length;
  const normSpeed = Math.pow(mean4th, 0.25);
  if (!Number.isFinite(normSpeed) || normSpeed <= 0) return 0;
  return Math.round((1000 / normSpeed) * 10) / 10;
}

// --- Main ---
async function main() {
  // Load both TP exports
  const csv1 = fs.readFileSync("/tmp/tp-export/workouts.csv", "utf-8");
  const csv2 = fs.readFileSync("/tmp/tp-export-new.csv", "utf-8");
  const tpAll = [...parseCSV(csv1), ...parseCSV(csv2)];

  // Only running activities with TSS
  const tpRuns = tpAll.filter(w => w.WorkoutType === "Run" && parseFloat(w.TSS) > 0);

  // Deduplicate by date+distance
  const seen = new Set();
  const tpRunsUnique = tpRuns.filter(w => {
    const key = w.WorkoutDay + "_" + (parseFloat(w.DistanceInMeters)||0).toFixed(0);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  console.log(`Total unique TP running activities: ${tpRunsUnique.length}\n`);

  // Get app activities + streams
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

  // Match TP runs to app activities
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
        movingTime,
        distKm,
        avgPace,
        timeStream: streams.time || null,
        distanceStream: streams.distance || null,
        altitudeStream: streams.altitude || null,
        hasStreams: !!(streams.time && streams.distance),
      });
    }
  }

  console.log(`Matched running activities with streams: ${matched.filter(m => m.hasStreams).length}/${matched.length}\n`);

  // Get user threshold pace
  const {data: userSports} = await supabase
    .from("user_sports")
    .select("threshold_pace_per_km, sports(name)")
    .eq("user_id", "c37c7234-3630-4ebc-a403-1d9256452021");

  const runSport = (userSports || []).find(s => s.sports?.name === "running" || s.sports?.name === "trail_running");
  const thresholdPace = runSport?.threshold_pace_per_km || 373;
  const ftpaceSpeed = 1000 / thresholdPace;

  console.log(`Threshold pace: ${thresholdPace} s/km (${Math.floor(thresholdPace/60)}:${String(Math.round(thresholdPace%60)).padStart(2,"0")}/km)\n`);

  // Test dampening values from 0.0 to 1.0
  const dampingValues = [];
  for (let d = 0; d <= 100; d += 5) dampingValues.push(d / 100);

  const results = [];

  for (const damping of dampingValues) {
    let totalAbsDiff = 0;
    let totalSquaredDiff = 0;
    let count = 0;
    let within5 = 0;
    let within10 = 0;
    const actDiffs = [];

    for (const m of matched) {
      let ngpPace;

      if (m.hasStreams) {
        ngpPace = computeNGP(m.timeStream, m.distanceStream, m.altitudeStream, damping);
      }

      if (!ngpPace || ngpPace <= 0) {
        ngpPace = m.avgPace; // fallback to avg pace
      }

      const ngpSpeed = 1000 / ngpPace;
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
      actDiffs.push({ date: m.date, tpTss: m.tpTss, appTss: rTss, pct: pctDiff.toFixed(1) });
    }

    results.push({
      damping,
      avgAbsDiff: totalAbsDiff / count,
      rmse: Math.sqrt(totalSquaredDiff / count),
      within5,
      within10,
      count,
      actDiffs,
    });
  }

  // Find optimal dampening
  results.sort((a, b) => a.avgAbsDiff - b.avgAbsDiff);
  const best = results[0];

  console.log("=== CALIBRATION RESULTS ===\n");
  console.log("Damping  AvgAbsDiff  RMSE    Within5%  Within10%");
  console.log("-".repeat(55));

  // Show all results sorted by damping
  const sortedByDamping = [...results].sort((a, b) => a.damping - b.damping);
  for (const r of sortedByDamping) {
    const marker = r.damping === best.damping ? " ← BEST" : "";
    console.log(
      `  ${r.damping.toFixed(2)}     ${r.avgAbsDiff.toFixed(1)}%     ${r.rmse.toFixed(1)}%    ${r.within5}/${r.count} (${Math.round(r.within5/r.count*100)}%)   ${r.within10}/${r.count} (${Math.round(r.within10/r.count*100)}%)${marker}`
    );
  }

  console.log(`\n=== OPTIMAL DAMPENING: ${best.damping.toFixed(2)} ===`);
  console.log(`  Avg absolute diff: ${best.avgAbsDiff.toFixed(1)}%`);
  console.log(`  RMSE: ${best.rmse.toFixed(1)}%`);
  console.log(`  Within 5%: ${best.within5}/${best.count} (${Math.round(best.within5/best.count*100)}%)`);
  console.log(`  Within 10%: ${best.within10}/${best.count} (${Math.round(best.within10/best.count*100)}%)`);

  // Show per-activity breakdown for the best dampening
  console.log(`\n=== PER-ACTIVITY BREAKDOWN (damping=${best.damping.toFixed(2)}) ===\n`);
  console.log("Date".padEnd(12) + "TP TSS".padStart(8) + "App TSS".padStart(9) + "Diff%".padStart(8));
  console.log("-".repeat(37));
  for (const a of best.actDiffs) {
    const warn = Math.abs(parseFloat(a.pct)) > 10 ? " ⚠️" : " ✅";
    console.log(a.date.padEnd(12) + String(a.tpTss.toFixed(1)).padStart(8) + String(a.appTss).padStart(9) + (a.pct + "%").padStart(8) + warn);
  }

  // Also test: what if we use NO grade adjustment (damping=0)?
  const noGrade = results.find(r => r.damping === 0);
  console.log(`\n--- For reference: NO grade adjustment (damping=0.00) ---`);
  console.log(`  Avg absolute diff: ${noGrade.avgAbsDiff.toFixed(1)}%`);
  console.log(`  Within 10%: ${noGrade.within10}/${noGrade.count}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
