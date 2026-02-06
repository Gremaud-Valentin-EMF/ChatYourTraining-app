-- Add activity stream storage for high-resolution workout data

CREATE TYPE activity_stream_type AS ENUM (
  'time',
  'heartrate',
  'power',
  'cadence',
  'speed'
);

CREATE TABLE IF NOT EXISTS public.activity_streams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  data_type activity_stream_type NOT NULL,
  values DOUBLE PRECISION[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id, data_type)
);

CREATE INDEX idx_activity_streams_activity ON public.activity_streams(activity_id);

ALTER TABLE public.activity_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity streams" ON public.activity_streams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.activities a
      WHERE a.id = activity_streams.activity_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own activity streams" ON public.activity_streams
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.activities a
      WHERE a.id = activity_streams.activity_id
      AND a.user_id = auth.uid()
    )
  );
