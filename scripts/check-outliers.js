const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT_DIR = "/Users/valentingremaud/Documents/Privé/dev/test-cursor-projects/ChatYourTraining-app";
const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.local'), 'utf-8');
for (const line of envContent.split('\n')) {
  const idx = line.indexOf('=');
  if (idx > 0) {
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!(k in process.env) || process.env[k] === undefined) process.env[k] = v;
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Also parse TP CSVs to compare durations
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

  const dates = ['2025-11-19', '2025-12-10', '2026-02-11'];

  const {data: sports} = await supabase.from('sports').select('id, name');
  const sportMap = new Map(sports.map(s => [s.id, s.name]));

  for (const d of dates) {
    console.log("=== " + d + " ===");

    // TP data
    const tpMatch = tpAll.filter(w => w.WorkoutDay === d && w.WorkoutType === "Run");
    for (const tp of tpMatch) {
      const tpDur = (parseFloat(tp.TimeTotalInHours) || 0) * 3600;
      console.log("  TP: TSS=" + tp.TSS + " IF=" + tp.IF + " duration=" + tpDur.toFixed(0) + "s dist=" + (parseFloat(tp.DistanceInMeters)/1000).toFixed(2) + "km");
    }

    // App data
    const {data: acts} = await supabase
      .from('activities')
      .select('id, title, scheduled_date, sport_id, actual_duration_minutes, actual_distance_km, raw_data')
      .eq('scheduled_date', d)
      .eq('source', 'strava');

    const runs = acts.filter(a => {
      const sport = sportMap.get(a.sport_id);
      return sport === 'running' || sport === 'trail_running';
    });

    for (const a of runs) {
      const rd = a.raw_data || {};
      console.log("  App: moving_time=" + rd.moving_time + "s elapsed=" + rd.elapsed_time + "s duration_min=" + a.actual_duration_minutes + " dist=" + a.actual_distance_km + "km type=" + rd.sport_type);

      // Check: what if we use TP duration instead?
      if (tpMatch.length > 0) {
        const tpDur = (parseFloat(tpMatch[0].TimeTotalInHours) || 0) * 3600;
        const appDur = rd.moving_time || (a.actual_duration_minutes * 60);
        console.log("  Duration diff: TP=" + tpDur.toFixed(0) + "s vs App=" + appDur + "s (ratio=" + (appDur/tpDur).toFixed(2) + ")");
      }
    }
    console.log();
  }
}
main().catch(e => console.error(e));
