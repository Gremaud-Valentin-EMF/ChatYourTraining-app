-- US-25: chat session archiving.
-- The `is_archived` flag is referenced by the app (and present on the hosted DB)
-- but was missing from the initial schema SQL. Add it idempotently so the repo
-- schema matches the TypeScript types and live database.

ALTER TABLE public.chat_sessions
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Helpful for the sidebar query (active sessions, most recent first).
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_active
    ON public.chat_sessions (user_id, is_archived, updated_at DESC);
