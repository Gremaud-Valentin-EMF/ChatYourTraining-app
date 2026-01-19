-- Add sleep needed minutes column to daily metrics
ALTER TABLE public.daily_metrics
    ADD COLUMN IF NOT EXISTS sleep_needed_minutes INTEGER;
