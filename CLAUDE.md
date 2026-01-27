# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChatYourTraining is an AI-powered training coaching platform for endurance athletes (runners, cyclists, triathletes). It integrates with Strava and Whoop for automatic data sync and provides personalized training advice via AI chat.

**Tech Stack:** Next.js 14 (App Router) + React 18 + TypeScript + Supabase + Tailwind CSS

## Common Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run lint     # ESLint with Next.js + TypeScript rules
```

## Architecture

### Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth pages (login, register, onboarding)
│   ├── (dashboard)/       # Protected routes (dashboard, calendar, workouts, chat, etc.)
│   └── api/               # API routes (chat, sync, auth callbacks)
├── components/
│   ├── dashboard/         # Dashboard-specific components (charts, gauges)
│   └── ui/                # Reusable UI primitives (button, card, modal, etc.)
├── lib/
│   ├── supabase/          # Supabase clients (server.ts, client.ts, middleware.ts)
│   ├── openai/coach.ts    # AI coach system prompts & context builder
│   ├── integrations/      # Strava & Whoop OAuth + sync logic
│   └── calculations/      # Training load formulas (CTL/ATL/TSB)
└── types/database.ts      # Supabase-generated database types
```

### Key Architectural Patterns

**AI Coach ("Stateful Context, Stateless Model")**
See `src/lib/openai/coach.ts`. Before each AI message, the backend builds a complete JSON context (athlete profile, physiological status, training load, schedule) and injects it into the system prompt. Supports both OpenAI and Google Gemini with streaming responses.

**Training Load Calculations**
See `src/lib/calculations/training-load.ts`. Implements TrainingPeaks formulas:
- CTL (Chronic Training Load): 42-day exponential moving average
- ATL (Acute Training Load): 7-day exponential moving average
- TSB (Training Stress Balance): CTL - ATL (uses previous day's values)
- HrTSS: Heart rate-based training stress score

**Authentication Flow**
Supabase Auth with server-side session validation via middleware. Browser client in `lib/supabase/client.ts`, server client in `lib/supabase/server.ts`.

**Data Sync**
Strava and Whoop integrate via OAuth. Manual sync triggers via `/api/sync/*` endpoints. Duplicate prevention via sync logs. Automatic TSS calculation during activity import.

### API Routes

- `POST /api/chat` - Stream AI responses
- `GET /api/chat` - Fetch chat history by session
- `POST /api/plans/accept` - Accept AI-generated training plans
- `GET /api/auth/strava/callback` - Strava OAuth callback
- `POST /api/sync/strava` - Trigger Strava data sync
- `GET /api/auth/whoop/callback` - Whoop OAuth callback
- `POST /api/sync/whoop` - Trigger Whoop data sync

## Database

Supabase PostgreSQL with Row Level Security (RLS). Types auto-generated in `src/types/database.ts`.

**Key Tables:**
- `users`, `physiological_data`, `user_sports` - Athlete profiles
- `activities`, `daily_metrics`, `scheduled_activities` - Training data
- `training_load` - Pre-computed CTL/ATL/TSB values
- `chat_sessions`, `chat_messages` - AI conversation history
- `integration_credentials`, `sync_logs` - OAuth and sync state

## Environment Variables

**Required for development:**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_PROVIDER` ("openai" or "gemini")
- OpenAI: `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `OPENAI_MAX_OUTPUT_TOKENS`
- Gemini: `GOOGLE_GEMINI_API_KEY`, `GOOGLE_GEMINI_MODEL`, `GOOGLE_GEMINI_MAX_OUTPUT_TOKENS`
- Strava: `NEXT_PUBLIC_STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`
- Whoop: `NEXT_PUBLIC_WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI`

## Code Conventions

- **Localization:** UI and AI responses are in French
- **Imports:** Use `@/*` path alias for `src/*` directory
- **Styling:** Tailwind CSS with custom dark theme (see `tailwind.config.ts`)
- **Icons:** Lucide React library
- **Charts:** Recharts with custom wrapper in `components/ui/chart.tsx`

## Deployment

Vercel deployment with environment variables per environment (Preview/Production). OAuth redirect URIs must match the deployed domain.
