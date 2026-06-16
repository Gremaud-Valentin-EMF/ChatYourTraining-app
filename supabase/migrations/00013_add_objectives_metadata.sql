-- Add a JSONB metadata column to objectives for storing adaptive fields
-- (distance, elevation, count, weight, pace, power, event_name) that vary
-- by objective type. Using JSONB avoids a combinatorial explosion of nullable
-- columns and keeps the schema stable as new objective types are added.
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
