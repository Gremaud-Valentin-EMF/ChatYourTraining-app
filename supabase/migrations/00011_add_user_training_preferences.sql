-- Add training_availability (day/time slots JSONB) and training_goal to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS training_availability JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS training_goal TEXT DEFAULT NULL;
