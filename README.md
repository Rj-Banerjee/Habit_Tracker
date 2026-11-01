# Habit Tracker

A mobile-first habit tracker that adapts instead of punishes. `PLAN.md` is the source of truth for features, data model and architecture. `AUDIT.md` records the audit and what has changed since.

## What's here

| Path | What it is |
| --- | --- |
| `frontend/` | Next.js web app, limited to the desktop grid and weekly review |
| `supabase/` | Database migrations and pgTAP tests |
| `backend/` | Local server env files only, for the FastAPI AI service to come |

## Setup

You need Node 20.9 or newer, Docker Desktop and the Supabase CLI.

```bash
supabase start

cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Set the URL and publishable key in `frontend/.env.local`. `supabase status` shows the local values. The app runs on http://localhost:3000.

## Checks

```bash
npm run lint
npm run typecheck
npm test
supabase test db
```

## Secrets

- Only `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` and `ANTHROPIC_API_KEY` are secret, and they stay server-side.
- Never put the secret key in Next.js or Expo code.
- Clients use `NEXT_PUBLIC_` or `EXPO_PUBLIC_` variables for the URL and publishable key.
