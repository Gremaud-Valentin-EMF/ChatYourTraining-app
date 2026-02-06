-- Add lactate threshold heart rate (LTHR)

ALTER TABLE public.physiological_data
  ADD COLUMN IF NOT EXISTS lthr INTEGER;
