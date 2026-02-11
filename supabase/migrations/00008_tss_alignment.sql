-- Migration: Add TSS alignment fields to support all 5 TrainingPeaks TSS types
-- Date: 2026-02-11

-- 1. Add threshold_pace_per_km to user_sports for rTSS (Running TSS) calculation
ALTER TABLE user_sports
  ADD COLUMN threshold_pace_per_km double precision DEFAULT NULL;
-- Stored in seconds/km (e.g., 300 = 5:00/km threshold pace)

-- 2. Add tss_type to activities to track which TSS calculation method was used
ALTER TABLE activities
  ADD COLUMN tss_type text DEFAULT NULL
  CHECK (tss_type IN ('tss', 'rtss', 'stss', 'hrtss', 'rpe', 'estimated'));
-- Allows UI to display TSS reliability badges and helps with analytics

-- 3. Add gender to users for gender-specific hrTSS calculation (k constant)
-- First check if column already exists (some implementations may have it)
-- If it doesn't exist, this adds it
DO $$
BEGIN
  BEGIN
    ALTER TABLE users
      ADD COLUMN gender text DEFAULT NULL
      CHECK (gender IN ('male', 'female'));
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;
END $$;
-- k=1.92 for male, k=1.67 for female in TRIMP formula
