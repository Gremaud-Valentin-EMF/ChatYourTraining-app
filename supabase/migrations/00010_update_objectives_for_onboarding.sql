-- Add family, status, target_date columns to objectives
-- Make event_date and event_type nullable (not all objective types require them)
ALTER TABLE objectives
  ADD COLUMN IF NOT EXISTS family TEXT NOT NULL DEFAULT 'competition',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS target_date DATE;

ALTER TABLE objectives
  ALTER COLUMN event_date DROP NOT NULL,
  ALTER COLUMN event_type DROP NOT NULL;

-- target_time is captured as free text in the UI (e.g. "1h45", "3h30"),
-- so store it as TEXT rather than INTERVAL to avoid parse errors.
ALTER TABLE objectives
  ALTER COLUMN target_time TYPE TEXT USING target_time::TEXT;
