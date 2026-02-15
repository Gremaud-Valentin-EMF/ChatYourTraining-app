#!/usr/bin/env node
/**
 * Test which duration TP uses for rTSS: moving_time vs elapsed_time
 * Also tests the Time-Weighted Avg method with damping=0.75
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

function calculateMinettiCost(gradient, damping) {
  const i = Math.max(-0.3, Math.min(0.3, gradient));
  const cost = 155.4*Math.pow(i,5) - 30.4*Math.pow(i,4) - 43.3*Math.pow(i,3) + 46.3*Math.pow(i,2) + 19.5*i + 3.6;
  const rawFactor = cost / 3.6;
  return 1 + (rawFactor - 1) * damping;
}

function computeGapSpeeds(timeStream, distanceStream, altitudeStream, damping) {
  if (!timeStream?.length || !distanceStream?.length) return [];
  const length = Math.min(timeStream.length, distanceStream.length);
  const hasAltitude = altitudeStream && altitudeStream.length >= length;

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

function computeNGP_WeightedAvg(gapSpeeds) {
  if (gapSpeeds.length === 0) return 0;
  let totalSpeed = 0, totalTime = 0;
  for (let i = 1; i < gapSpeeds.length; i++) {
    const dt = gapSpeeds[i].time - gapSpeeds[i-1].time;
    if (dt > 0 && dt < 30) {
      totalSpeed += gapSpeeds[i].speed * dt;
      totalTime += dt;
    }
  }
  if (totalTime === 0) return gapSpeeds.reduce((s, g) => s + g.speed, 0) / gapSpeeds.length;
  return totalSpeed / totalTime;
}

function computeNGP_SimpleAvg(gapSpeeds) {
  if (gapSpeeds.length === 0) return 0;
  return gapSpeeds.reduce((s, g) => s + g.speed, 0) / gapSpeeds.length;
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
      const elapsedTime = rawData.elapsed_time || movingTime;

      matched.push({
        date: tpDate, title: tp.Title || match.title || "",
        tpTss, tpIF, tpDuration,
        movingTime, elapsedTime,
        distKm: match.actual_distance_km || 0,
        timeStream: streams.time || null,
        distanceStream: streams.distance || null,
        altitudeStream: streams.altitude || null,
        hasStreams: !!(streams.time && streams.distance),
      });
    }
  }

  const {data: userSports} = await supabase
    .from("user_sports")
    .select("threshold_pace_per_km, sports(name)")
    .eq("user_id", "c37c7234-3630-4ebc-a403-1d9256452021");

  const runSport = (userSports || []).find(s => s.sports?.name === "running" || s.sports?.name === "trail_running");
  const thresholdPace = runSport?.threshold_pace_per_km || 373;
  const ftpaceSpeed = 1000 / thresholdPace;

  console.log("Matched: " + matched.length + " running activities\n");
  console.log("Threshold pace: " + thresholdPace + " s/km\n");

  // Test combinations: method × damping × duration_type
  const configs = [
    { name: "TWAvg d=0.75 moving", method: computeNGP_WeightedAvg, damping: 0.75, useElapsed: false },
    { name: "TWAvg d=0.75 elapsed", method: computeNGP_WeightedAvg, damping: 0.75, useElapsed: true },
    { name: "TWAvg d=0.75 tpDur", method: computeNGP_WeightedAvg, damping: 0.75, useTpDur: true },
    { name: "SimpAvg d=0.50 moving", method: computeNGP_SimpleAvg, damping: 0.50, useElapsed: false },
    { name: "SimpAvg d=0.50 elapsed", method: computeNGP_SimpleAvg, damping: 0.50, useElapsed: true },
    { name: "SimpAvg d=0.50 tpDur", method: computeNGP_SimpleAvg, damping: 0.50, useTpDur: true },
    { name: "TWAvg d=1.00 elapsed", method: computeNGP_WeightedAvg, damping: 1.00, useElapsed: true },
    { name: "TWAvg d=0.50 elapsed", method: computeNGP_WeightedAvg, damping: 0.50, useElapsed: true },
  ];

  for (const cfg of configs) {
    let totalAbsDiff = 0, totalSquaredDiff = 0, count = 0, within5 = 0, within10 = 0;
    const details = [];

    for (const m of matched) {
      let ngpSpeed;
      if (m.hasStreams) {
        const gapSpeeds = computeGapSpeeds(m.timeStream, m.distanceStream, m.altitudeStream, cfg.damping);
        ngpSpeed = cfg.method(gapSpeeds);
      }
      if (!ngpSpeed || ngpSpeed <= 0) {
        ngpSpeed = m.distKm > 0 ? (m.distKm * 1000) / m.movingTime : 0;
      }
      if (ngpSpeed <= 0) continue;

      const IF = ngpSpeed / ftpaceSpeed;
      let duration;
      if (cfg.useTpDur) {
        duration = m.tpDuration;
      } else if (cfg.useElapsed) {
        duration = m.elapsedTime;
      } else {
        duration = m.movingTime;
      }
      const durationHours = duration / 3600;
      const rTss = Math.round(durationHours * IF * IF * 110);

      const pctDiff = ((rTss - m.tpTss) / m.tpTss) * 100;
      const absPct = Math.abs(pctDiff);
      totalAbsDiff += absPct;
      totalSquaredDiff += pctDiff * pctDiff;
      count++;
      if (absPct <= 5) within5++;
      if (absPct <= 10) within10++;
      details.push({ date: m.date, tpTss: m.tpTss, appTss: rTss, pct: pctDiff.toFixed(1), moving: m.movingTime, elapsed: m.elapsedTime, tpDur: m.tpDuration });
    }

    console.log("--- " + cfg.name + " ---");
    console.log("  AvgAbsDiff: " + (totalAbsDiff/count).toFixed(1) + "%  RMSE: " + Math.sqrt(totalSquaredDiff/count).toFixed(1) + "%  Within5%: " + within5 + "/" + count + " (" + Math.round(within5/count*100) + "%)  Within10%: " + within10 + "/" + count + " (" + Math.round(within10/count*100) + "%)");

    // Show outliers
    const outliers = details.filter(d => Math.abs(parseFloat(d.pct)) > 10);
    if (outliers.length > 0) {
      console.log("  Outliers (>10%): " + outliers.map(o => o.date + " " + o.pct + "% (mv=" + o.moving + " el=" + o.elapsed + " tp=" + o.tpDur.toFixed(0) + ")").join(", "));
    }
    console.log();
  }

  // Final detailed view: TWAvg d=0.75 with TP duration
  console.log("=== DETAILED: TWAvg d=0.75 using TP duration ===\n");
  console.log("Date".padEnd(12) + "TP TSS".padStart(8) + "AppTSS".padStart(8) + "Diff%".padStart(8) + "  MvTime".padStart(8) + " ElTime".padStart(8) + " TPTime".padStart(8));
  console.log("-".repeat(62));
  for (const m of matched) {
    let ngpSpeed;
    if (m.hasStreams) {
      const gapSpeeds = computeGapSpeeds(m.timeStream, m.distanceStream, m.altitudeStream, 0.75);
      ngpSpeed = computeNGP_WeightedAvg(gapSpeeds);
    }
    if (!ngpSpeed || ngpSpeed <= 0) ngpSpeed = m.distKm > 0 ? (m.distKm * 1000) / m.movingTime : 0;
    const IF = ngpSpeed / ftpaceSpeed;
    const rTss = Math.round((m.tpDuration / 3600) * IF * IF * 110);
    const pct = ((rTss - m.tpTss) / m.tpTss * 100).toFixed(1);
    const mark = Math.abs(parseFloat(pct)) > 10 ? " !!" : " ok";
    console.log(
      m.date.padEnd(12) +
      m.tpTss.toFixed(1).padStart(8) +
      String(rTss).padStart(8) +
      (pct + "%").padStart(8) +
      String(m.movingTime).padStart(8) +
      String(m.elapsedTime).padStart(8) +
      m.tpDuration.toFixed(0).padStart(8) +
      mark
    );
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
