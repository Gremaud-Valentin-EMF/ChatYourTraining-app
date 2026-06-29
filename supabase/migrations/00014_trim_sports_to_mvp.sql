-- Trim the `sports` table to the MVP set.
--
-- Context: the table had accumulated ~180 rows (a full activity taxonomy
-- imported ad-hoc, outside of migrations). The app only ships the 9 MVP sports
-- listed in the onboarding (DEFAULT_MVP_SPORTS). This migration:
--   1. guarantees the 9 MVP sports exist with their fixed onboarding UUIDs,
--      canonicalizing `walking`/`hiking` which had been created under random
--      UUIDs (existing references are repointed to the fixed UUIDs);
--   2. deletes every non-MVP sport that is NOT referenced by any data.
--
-- Non-MVP sports still referenced by real activities are intentionally KEPT
-- (the activities -> sports FK is RESTRICT, and we do not silently repoint real
-- activities to a different sport). Reassign those activities first if you want
-- to remove the remaining non-MVP rows.

-- 1. Ensure the MVP sports exist with their fixed UUIDs.
INSERT INTO public.sports (id, name, name_fr, icon, color) VALUES
  ('00000000-0000-0000-0000-000000000001', 'running', 'Course à pied', 'running', '#00d4aa'),
  ('00000000-0000-0000-0000-000000000002', 'cycling', 'Vélo', 'bike', '#3b82f6'),
  ('00000000-0000-0000-0000-000000000005', 'strength', 'Renforcement', 'dumbbell', '#f59e0b'),
  ('00000000-0000-0000-0000-000000000006', 'other', 'Autre', 'activity', '#6b7280'),
  ('00000000-0000-0000-0000-000000000009', 'alpine-skiing', 'Ski alpin', 'mountain-snow', '#0ea5e9'),
  ('00000000-0000-0000-0000-000000000010', 'cross-country-skiing', 'Ski de fond', 'wind', '#38bdf8'),
  ('00000000-0000-0000-0000-000000000011', 'mountain-biking', 'VTT', 'mountain', '#ea580c')
ON CONFLICT (name) DO NOTHING;

-- 1b. Canonicalize walking & hiking to their fixed onboarding UUIDs. They may
--     already exist under a random UUID, which holds the unique `name`; rename
--     it out of the way, insert the canonical row, repoint references.
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN SELECT * FROM (VALUES
    ('walking', '00000000-0000-0000-0000-000000000007'::uuid, 'Marche', 'footprints', '#84cc16'),
    ('hiking',  '00000000-0000-0000-0000-000000000008'::uuid, 'Randonnée', 'mountain', '#65a30d')
  ) AS t(slug, fid, fr, icon, color) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sports WHERE id = s.fid) THEN
      UPDATE public.sports SET name = '_old_' || name || '_' || left(id::text, 8)
        WHERE name = s.slug AND id <> s.fid;
      INSERT INTO public.sports (id, name, name_fr, icon, color)
        VALUES (s.fid, s.slug, s.fr, s.icon, s.color);
    END IF;
    UPDATE public.activities SET sport_id = s.fid
      WHERE sport_id IN (SELECT id FROM public.sports WHERE name LIKE '_old_' || s.slug || '%');
    UPDATE public.user_sports SET sport_id = s.fid
      WHERE sport_id IN (SELECT id FROM public.sports WHERE name LIKE '_old_' || s.slug || '%');
  END LOOP;
END $$;

-- 2. Delete non-MVP sports that nothing references.
DELETE FROM public.sports s
WHERE s.name NOT IN (
    'running', 'cycling', 'mountain-biking', 'walking', 'hiking',
    'alpine-skiing', 'cross-country-skiing', 'strength', 'other'
  )
  AND NOT EXISTS (SELECT 1 FROM public.activities a WHERE a.sport_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM public.user_sports u WHERE u.sport_id = s.id);
