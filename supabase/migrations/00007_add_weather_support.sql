-- Add location columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS latitude double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS longitude double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz DEFAULT NULL;

-- Create weather cache table
CREATE TABLE IF NOT EXISTS weather_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  cache_type text NOT NULL CHECK (cache_type IN ('current', 'forecast')),
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_cache_lookup
  ON weather_cache (latitude, longitude, cache_type, expires_at);
