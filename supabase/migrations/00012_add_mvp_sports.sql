-- Seed missing MVP sports and allow the "discovery" level on user_sports.

-- 1. Add the MVP sports not present in the initial seed (fixed UUIDs so the
--    onboarding client can reference them deterministically).
INSERT INTO public.sports (id, name, name_fr, icon, color) VALUES
    ('00000000-0000-0000-0000-000000000007', 'walking', 'Marche', 'footprints', '#84cc16'),
    ('00000000-0000-0000-0000-000000000008', 'hiking', 'Randonnée', 'mountain', '#65a30d'),
    ('00000000-0000-0000-0000-000000000009', 'alpine-skiing', 'Ski alpin', 'mountain-snow', '#0ea5e9'),
    ('00000000-0000-0000-0000-000000000010', 'cross-country-skiing', 'Ski de fond', 'wind', '#38bdf8'),
    ('00000000-0000-0000-0000-000000000011', 'mountain-biking', 'VTT', 'mountain', '#ea580c')
ON CONFLICT (name) DO NOTHING;

-- 2. Align cycling French label with the MVP wording ("Vélo" instead of "Cyclisme").
UPDATE public.sports SET name_fr = 'Vélo' WHERE name = 'cycling';

-- 3. Allow the new "discovery" level in user_sports (initial CHECK only allowed
--    beginner/intermediate/advanced/elite).
ALTER TABLE public.user_sports DROP CONSTRAINT IF EXISTS user_sports_level_check;
ALTER TABLE public.user_sports
  ADD CONSTRAINT user_sports_level_check
  CHECK (level IN ('discovery', 'beginner', 'intermediate', 'advanced', 'elite'));
