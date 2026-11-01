# Habit Tracker

A mobile-first habit tracker that adapts instead of punishes. `PLAN.md` is the source of truth for features, data model and architecture. `AUDIT.md` records the audit and what has changed since.

## What's here

| Path | What it is |
| --- | --- |
| `mobile/` | Expo app for iPhone and Android |
| `frontend/` | Next.js web app, built as static files, limited to the desktop grid and weekly review |
| `packages/core` | Shared types, API functions, form logic and design tokens |
| `packages/ui` | Shared components for React Native and the web |
| `packages/web-shims` | Lets the web build use the shared components |
| `supabase/` | Database migrations and pgTAP tests |
| `docs/handoff/` | Specs for screens built with another tool |
| `backend/` | Local server env files only, for the FastAPI AI service to come |

## Setup

You need Node 20.9 or newer, Docker Desktop and the Supabase CLI.

```bash
npm install
supabase start
cp mobile/.env.example mobile/.env
cp frontend/.env.example frontend/.env.local
```

Set the URL and publishable key in both files. `supabase status` shows the local values.

```bash
npm run mobile    # Expo
npm run dev       # web app on http://localhost:3000
```

## Checks

```bash
npm run typecheck
npm run lint
npm test
supabase test db
```

## AI service

`backend/` holds the FastAPI service. See `docs/handoff/coach-and-voice.md` to run it, and `backend/.env.example` for the settings. Run its tests with `npm run test:ai`.

## Secrets

- Only `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` and `ANTHROPIC_API_KEY` are secret, and they stay server-side.
- Never put the secret key in Next.js or Expo code.
- Clients use `NEXT_PUBLIC_` or `EXPO_PUBLIC_` variables for the URL and publishable key.
