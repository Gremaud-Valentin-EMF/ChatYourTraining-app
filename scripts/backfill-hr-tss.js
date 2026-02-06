#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE env vars. Check .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DEFAULT_LTHR = 170;

function calculateNormalizedHeartRate(hrData) {
  if (!Array.isArray(hrData) || hrData.length < 30) {
    if (hrData && hrData.length > 0) {
      return Math.round(hrData.reduce((a, b) => a + b, 0) / hrData.length);
    }
    return 0;
  }

  const rollingAverages = [];
  for (let i = 29; i < hrData.length; i += 1) {
    let sum = 0;
    for (let j = i - 29; j <= i; j += 1) {
      sum += hrData[j];
    }
    rollingAverages.push(sum / 30);
  }

  const fourthPowers = rollingAverages.map((hr) => Math.pow(hr, 4));
  const meanFourthPower =
    fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length;

  return Math.round(Math.pow(meanFourthPower, 0.25));
}

function calculateHrTSS(movingTimeSeconds, avgHr, lthr) {
  if (!movingTimeSeconds || !avgHr || !lthr || lthr === 0) {
    return 0;
  }
  const intensityFactor = avgHr / lthr;
  const durationInHours = movingTimeSeconds / 3600;
  const hrTss = durationInHours * intensityFactor * intensityFactor * 100;
  return Math.round(hrTss);
}

function calculateRunningRTSS(durationMinutes, distanceKm, thresholdPace = 5.5) {
  if (!distanceKm || distanceKm <= 0.3 || !durationMinutes) return 0;
  const actualPace = durationMinutes / distanceKm;
  const intensityFactor = Math.min(
    1.5,
    Math.max(0.5, thresholdPace / actualPace)
  );
  const rtss = (durationMinutes / 60) * Math.pow(intensityFactor, 2) * 100;
  return Math.round(rtss);
}

const MINETTI_COEFFICIENTS = {
  a: 155.4,
  b: -30.4,
  c: -43.3,
  d: 46.3,
  e: 19.5,
  f: 3.6,
};

function calculateEnergyCost(grade) {
  const g = Math.max(-0.3, Math.min(0.3, grade));
  const { a, b, c, d, e, f } = MINETTI_COEFFICIENTS;
  return (
    a * Math.pow(g, 5) +
    b * Math.pow(g, 4) +
    c * Math.pow(g, 3) +
    d * Math.pow(g, 2) +
    e * g +
    f
  );
}

function calculateNormalizedGradedPace(timeStream, distanceStream, altitudeStream) {
  if (!timeStream || !distanceStream) return 0;
  const length = Math.min(timeStream.length, distanceStream.length);
  const hasAltitude = altitudeStream && altitudeStream.length >= length;
  const gapSpeeds = [];

  for (let i = 1; i < length; i += 1) {
    const dt = timeStream[i] - timeStream[i - 1];
    const dd = distanceStream[i] - distanceStream[i - 1];
    if (dt <= 0 || dd <= 0) continue;
    const speed = dd / dt;
    let grade = 0;
    if (hasAltitude) {
      const de = altitudeStream[i] - altitudeStream[i - 1];
      grade = dd > 0 ? de / dd : 0;
    }
    const cost = calculateEnergyCost(grade);
    const equivalentSpeed = speed * (cost / 3.6);
    if (Number.isFinite(equivalentSpeed) && equivalentSpeed > 0) {
      gapSpeeds.push(equivalentSpeed);
    }
  }

  if (gapSpeeds.length < 30) {
    if (gapSpeeds.length === 0) return 0;
    const avgSpeed = gapSpeeds.reduce((a, b) => a + b, 0) / gapSpeeds.length;
    return Math.round((1000 / avgSpeed) * 10) / 10;
  }

  const rollingAverages = [];
  for (let i = 29; i < gapSpeeds.length; i += 1) {
    let sum = 0;
    for (let j = i - 29; j <= i; j += 1) {
      sum += gapSpeeds[j];
    }
    rollingAverages.push(sum / 30);
  }

  const fourthPowers = rollingAverages.map((s) => Math.pow(s, 4));
  const meanFourthPower =
    fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length;
  const normalizedSpeed = Math.pow(meanFourthPower, 0.25);
  if (!Number.isFinite(normalizedSpeed) || normalizedSpeed <= 0) return 0;
  return Math.round((1000 / normalizedSpeed) * 10) / 10;
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseStreamArray(value) {
  if (!Array.isArray(value)) return null;
  const numeric = value
    .map((item) => (typeof item === "number" ? item : Number(item)))
    .filter((item) => Number.isFinite(item));
  return numeric.length > 0 ? numeric : null;
}

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");

async function getUserLthr(cache, userId) {
  if (cache.has(userId)) return cache.get(userId);
  const { data, error } = await supabase
    .from("physiological_data")
    .select("lthr, hr_max")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn(`Could not fetch physio for user ${userId}:`, error.message);
    cache.set(userId, DEFAULT_LTHR);
    return DEFAULT_LTHR;
  }
  const lthr = toNumber(data?.lthr);
  const hrMax = toNumber(data?.hr_max);
  const resolved =
    lthr && lthr > 0
      ? Math.round(lthr)
      : hrMax && hrMax > 0
      ? Math.round(hrMax * 0.7)
      : DEFAULT_LTHR;
  cache.set(userId, resolved);
  return resolved;
}

async function fetchActivities(offset, limit) {
  const { data, error } = await supabase
    .from("activities")
    .select("id, user_id, avg_hr, actual_duration_minutes, raw_data, source")
    .eq("source", "strava")
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch activities: ${error.message}`);
  }
  return data || [];
}

async function fetchStreamsByActivity(activityIds) {
  if (activityIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("activity_streams")
    .select("activity_id, data_type, values")
    .in("activity_id", activityIds);
  if (error) {
    throw new Error(`Failed to fetch streams: ${error.message}`);
  }

  const map = new Map();
  for (const row of data || []) {
    const values = parseStreamArray(row.values);
    if (!values) continue;
    const entry = map.get(row.activity_id) || {};
    entry[row.data_type] = values;
    map.set(row.activity_id, entry);
  }
  return map;
}

async function run() {
  const pageSize = 200;
  let offset = 0;
  let updated = 0;
  let processed = 0;
  const lthrCache = new Map();

  while (true) {
    const activities = await fetchActivities(offset, pageSize);
    if (activities.length === 0) break;

    const ids = activities.map((activity) => activity.id);
    const streamMap = await fetchStreamsByActivity(ids);

    for (const activity of activities) {
      processed += 1;
      const raw = activity.raw_data || {};
      const sportType =
        (raw && typeof raw === "object" && (raw.sport_type || raw.type)) || "";
      const isRunning =
        sportType === "Run" || sportType === "Trail Run" || sportType === "Run";
      const streams = streamMap.get(activity.id) || {};
      const hrStream =
        streams.heartrate || parseStreamArray(raw?._streams?.heartrate);
      const timeStream =
        streams.time || parseStreamArray(raw?._streams?.time);
      const distanceStream =
        streams.distance || parseStreamArray(raw?.distance_stream);
      const altitudeStream =
        streams.altitude || parseStreamArray(raw?.altitude_stream);

      const avgHr =
        toNumber(activity.avg_hr) ??
        toNumber(raw.average_heartrate) ??
        toNumber(raw.avg_hr);
      const movingTimeSeconds =
        toNumber(raw.elapsed_time) ??
        toNumber(raw.moving_time) ??
        (toNumber(activity.actual_duration_minutes)
          ? Math.round(toNumber(activity.actual_duration_minutes) * 60)
          : null);

      const runningDurationMinutes =
        toNumber(raw.moving_time) ??
        toNumber(raw.elapsed_time) ??
        toNumber(activity.actual_duration_minutes);
      const distanceKm =
        toNumber(raw.distance) !== null
          ? toNumber(raw.distance) / 1000
          : null;

      if (!avgHr || !movingTimeSeconds) continue;

      const lthr = await getUserLthr(lthrCache, activity.user_id);
      const normalizedHr = hrStream
        ? calculateNormalizedHeartRate(hrStream)
        : avgHr;

      let computedTss = 0;
      let normalizedPaceSeconds = 0;
      if (isRunning && runningDurationMinutes && distanceKm) {
        normalizedPaceSeconds =
          timeStream && distanceStream
            ? calculateNormalizedGradedPace(
                timeStream,
                distanceStream,
                altitudeStream || undefined
              )
            : 0;
        const normalizedPaceMinutes =
          normalizedPaceSeconds && normalizedPaceSeconds > 0
            ? normalizedPaceSeconds / 60
            : null;
        const thresholdPace = 5.5;
        if (normalizedPaceMinutes) {
          const intensityFactor = Math.min(
            1.5,
            Math.max(0.5, thresholdPace / normalizedPaceMinutes)
          );
          computedTss = Math.round(
            (runningDurationMinutes / 60) * Math.pow(intensityFactor, 2) * 100
          );
        } else {
          computedTss = calculateRunningRTSS(
            runningDurationMinutes,
            distanceKm
          );
        }
      }
      if (!computedTss) {
        computedTss = calculateHrTSS(movingTimeSeconds, normalizedHr, lthr);
      }
      if (!computedTss) continue;

      const updatedRaw =
        raw && typeof raw === "object"
          ? {
              ...raw,
              _calculated: {
                ...(raw._calculated || {}),
                normalized_hr: normalizedHr,
                normalized_pace: normalizedPaceSeconds || raw?._calculated?.normalized_pace || null,
              },
            }
          : raw;

      if (isDryRun) {
        console.log(
          `[dry-run] ${activity.id} -> TSS ${computedTss} (NHR ${normalizedHr})`
        );
        updated += 1;
        continue;
      }

      const { error } = await supabase
        .from("activities")
        .update({ tss: computedTss, raw_data: updatedRaw })
        .eq("id", activity.id);

      if (error) {
        console.warn(`Failed to update ${activity.id}:`, error.message);
        continue;
      }
      updated += 1;
    }

    offset += pageSize;
  }

  console.log(`Backfill complete. Processed ${processed}, updated ${updated}.`);
}

run().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
