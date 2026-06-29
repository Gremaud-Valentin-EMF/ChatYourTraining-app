# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChatYourTraining is an AI-powered training coaching platform for endurance athletes (runners, cyclists, triathletes). It integrates with Strava and Whoop for automatic data sync and provides personalized training advice via AI chat.

**Tech Stack:** Next.js 14 (App Router) + React 18 + TypeScript + Supabase + Tailwind CSS

## Common Commands

```bash
npm run dev                   # Start development server (localhost:3000)
npm run build                 # Production build (run before deploying)
npm run lint                  # ESLint with Next.js + TypeScript rules
npm run recalculate-tss       # Backfill TSS values for all activities (node script)
npm run backfill-training-load # Backfill the training_load table (CTL/ATL/TSB) for all users
npm run generate:icons        # Regenerate sport icon list from Lucide
```

There are no automated tests. Validate logic changes by running `npm run build` and checking the Vercel function logs. When `next dev` is already running, prefer `npx tsc --noEmit` + `npm run lint` for non-regression rather than `npm run build` (which conflicts with the running dev server).

## Architecture

### Directory Structure

```
src/
├── app/
│   ├── (auth)/            # login, register, onboarding (public routes)
│   ├── (dashboard)/       # calendar, chat, health, integrations, objectives,
│   │                      # profile, workouts/[id] (protected routes)
│   └── api/               # chat, sync/strava, sync/whoop, plans/accept,
│                          # auth/strava, auth/whoop, location, weather, admin
├── components/
│   ├── dashboard/         # Charts and gauges (CTL/ATL/TSB, power curves, etc.)
│   ├── workouts/          # Activity stream chart, RPE modal
│   ├── weather/           # Day badge and icon components
│   └── ui/                # Reusable primitives (button, card, modal, tabs, etc.)
├── lib/
│   ├── supabase/          # server.ts (RSC/API), client.ts (browser), middleware.ts
│   ├── openai/coach.ts    # AI coach: context builder + streaming for OpenAI & Gemini
│   ├── integrations/      # strava.ts, whoop.ts, weather.ts, sync-helpers.ts
│   ├── calculations/      # training-load.ts, persist-training-load.ts, manual-activity.ts
│   └── hooks/             # useGeolocation.ts, useWeatherForecast.ts
├── types/database.ts      # Supabase-generated DB types (do not hand-edit)
└── middleware.ts           # Session refresh via updateSession()
```

### Key Architectural Patterns

**AI Coach ("Stateful Context, Stateless Model")**
`src/lib/openai/coach.ts` builds a complete JSON snapshot (athlete profile, physiological status, training load, planned workouts, weather) and injects it into the system prompt on every request. `buildCoachContext(userId, timezone)` is called fresh on every `POST /api/chat`, so the model holds no state and always sees current data. The exact injected context is persisted to `chat_messages.context_snapshot` **before** the LLM call, so the snapshot survives even if the model errors. The route handler at `app/api/chat/route.ts` supports streaming for both OpenAI (`openai` SDK) and Google Gemini (SSE via `streamGenerateContent?alt=sse`), selected via the `AI_PROVIDER` env var. When a data source is not connected, the corresponding context fields are `null`/absent (never fabricated), and the prompt instructs the coach to flag the gap rather than invent values.

**TSS Calculation Pipeline**
`src/lib/calculations/training-load.ts` implements all five TrainingPeaks TSS types:
- `tss` – cycling power-based (Normalized Power vs FTP)
- `rTSS` – running (Normalized Graded Pace vs vVMA)
- `sTSS` – swimming (pace vs CSS)
- `hrTSS` – heart rate TRIMP with exponential sex-based weighting
- `rpe` – RPE-based via Friel's TSS-per-hour table

CTL (42-day EMA), ATL (7-day EMA), TSB (previous-day CTL − ATL). `interpretTSB(tsb)` is the single source of the TSB status label (used by both the dashboard and the coach context). During activity import the best available TSS type is computed automatically. The `recalculate-tss` script in `scripts/` can backfill all activities.

**Training Load Persistence (write-through)**
`training_load` is a materialized daily table read by the dashboard and the Santé (health) page — values are **read from the table, not recomputed on render**. `src/lib/calculations/persist-training-load.ts` exposes `recomputeAndStoreTrainingLoad(supabase, userId)` (accepts a server or browser client), which is invoked after any mutation that changes an activity's TSS/status/date: the Strava and Whoop sync routes, and the calendar / workouts / workouts/[id] pages. Use `npm run backfill-training-load` to populate the table for existing data.

**Authentication Flow**
`src/middleware.ts` calls `updateSession()` for every non-static route, refreshing the Supabase session server-side. Use `createClient()` from `lib/supabase/server.ts` in Server Components and API routes; use `lib/supabase/client.ts` in Client Components.

**Data Sync**
Strava and Whoop use OAuth token exchange stored in `integration_credentials`. Sync endpoints (`/api/sync/strava`, `/api/sync/whoop`) acquire a distributed lock via `sync-helpers.ts` to prevent duplicate runs. Each synced activity is matched against `scheduled_activities` by date/sport and linked automatically. Sync maps external workouts to `sports` rows by name, so a sport that is absent from the `sports` table will not map.

**Weather Integration**
`lib/integrations/weather.ts` provides forecast data injected into the AI context and rendered on the calendar. Client-side geolocation is abstracted via `lib/hooks/useGeolocation.ts` and `useWeatherForecast.ts`.

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/chat` | POST | Stream AI responses (OpenAI or Gemini) |
| `/api/chat` | GET | Fetch chat history by session ID |
| `/api/plans/accept` | POST | Persist AI-generated training plan to DB |
| `/api/sync/strava` | POST | Trigger full Strava activity sync |
| `/api/sync/whoop` | POST | Trigger Whoop metrics sync |
| `/api/auth/strava/callback` | GET | Strava OAuth callback |
| `/api/auth/whoop/callback` | GET | Whoop OAuth callback |
| `/api/location` | GET | Reverse-geocode user coordinates |
| `/api/weather` | GET | Fetch weather forecast |
| `/api/admin/backfill-tss` | POST | Admin-only TSS backfill |

## Database

Supabase PostgreSQL with Row Level Security (RLS). Types are auto-generated — update `src/types/database.ts` by running `supabase gen types typescript`. Schema migrations live in `supabase/migrations/` (sequential numbered SQL files).

**MVP sports:** the onboarding ships a fixed set of MVP sports seeded with fixed `00000000-…` UUIDs (`running`, `cycling`, `mountain-biking`, `walking`, `hiking`, `alpine-skiing`, `cross-country-skiing`, `strength`, `other`). `activities.sport_id` is `ON DELETE RESTRICT` while `user_sports.sport_id` is `ON DELETE CASCADE`, so non-MVP sports referenced by real activities cannot be deleted without first reassigning those activities.

**Key Tables:**
- `users`, `physiological_data`, `user_sports` – Athlete profiles and thresholds (FTP, vVMA, LTHR, CSS)
- `activities`, `daily_metrics`, `scheduled_activities` – Training data
- `training_load` – Materialized daily CTL/ATL/TSB (write-through; see persistence pattern above)
- `chat_sessions`, `chat_messages` – AI conversation history (`chat_messages.context_snapshot` stores the injected coach context)
- `integration_credentials`, `sync_logs` – OAuth tokens and sync state

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AI_PROVIDER                    # "openai" or "gemini"
OPENAI_API_KEY
OPENAI_CHAT_MODEL
OPENAI_MAX_OUTPUT_TOKENS
GOOGLE_GEMINI_API_KEY
GOOGLE_GEMINI_MODEL
GOOGLE_GEMINI_MAX_OUTPUT_TOKENS
NEXT_PUBLIC_STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
STRAVA_REDIRECT_URI
NEXT_PUBLIC_WHOOP_CLIENT_ID
WHOOP_CLIENT_SECRET
WHOOP_REDIRECT_URI
```

## Code Conventions

- **Language:** UI labels and AI responses are in French
- **Imports:** Use `@/*` path alias for `src/*`
- **Styling:** Tailwind CSS with a custom dark theme (`tailwind.config.ts`); use `clsx` + `tailwind-merge` for conditional classes
- **Icons:** Lucide React only
- **Charts:** Recharts wrapped by `components/ui/chart.tsx`
- **DB access in API routes:** always use the server Supabase client (`lib/supabase/server.ts`), never the browser client

## Deployment

Vercel with automatic Preview deployments on push. Build command: `next build`. OAuth redirect URIs must exactly match the deployed domain registered with Strava/Whoop. See `README.md` for the full Vercel deployment guide and the per-variable scope table (which secrets are `NEXT_PUBLIC_*` vs server-only).
