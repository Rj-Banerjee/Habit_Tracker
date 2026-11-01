# Habit Tracker Audit

Audited 1 Nov 2026 against `PLAN.md` (last updated 1 Nov 2026). No application code was changed.

## Summary

The app builds and runs, but it is a different product from the one in `PLAN.md`. It is a monthly dashboard for a single demo user, while the plan describes a mobile-first tracker with identities, Shrink It levels and repairable streaks.

- **The most urgent problem:** the production database password is in a public GitHub repo. Rotate it before anything else.
- **Why the AI never worked:** no API key was ever set, and a keyword matcher hid that by imitating a coach. The code also calls a retired model.
- **Good news:** nothing needs preserving. `auth.users` is empty, and all data belongs to the demo user.
- **Blocked:** Step 2 items 3 and 4 need the product decisions listed in [Decisions needed](#decisions-needed-before-step-2).

## How this audit was done

- **Read in full:** `PLAN.md`, the docs, all backend source, and the main frontend logic (pages, hooks, services, coach, matrix, auth, profile).
- **Read with styling lines removed, some only in part:** weekly and monthly sections, command palette, footer, legal modal, charts, dashboard cards and the modal.
- **Searched, not read line by line:** the legacy vanilla app (`js/`, `css/`, `index.html`, apart from `js/streakCalc.js`), `FloatingHeader.tsx`, `DashboardHeader.tsx`, `TopToolbar.tsx`, `DonutRing.tsx`, `WeeklyHabitsRechart.tsx`, the small UI primitives, `globals.css` and the Tailwind config.
- **Run:** typecheck, Prisma validation, production build, `npm audit`, `npm outdated`, and both servers with placeholder credentials.
- **Queried read-only:** the live Supabase project (tables, advisors, grants, row counts).
- **Not done at the time of the audit:** browser testing and running against the real database. Both were done in Step 2 item 1, recorded in the [change log](#change-log).
- **Still not done:**
  - Calling the Claude API, because no key exists. Statements about API behaviour come from Anthropic's current docs.
  - Testing the leaked password.

---

## 1. What exists

### Framework and structure

Three separate apps share this repo, and none of them is the mobile app in `PLAN.md`.

| Path | What it is | Status |
| --- | --- | --- |
| `frontend/` | Next.js 14 App Router, Tailwind, Recharts | Active |
| `backend/` | Express 4, Prisma 5, node-cron | Active |
| `index.html`, `js/`, `css/` | Original vanilla JS app using `localStorage` | Abandoned, 11 tracked files |

There is no Expo app, FastAPI service, `supabase/` folder, test suite, CI, ESLint setup or deployment config.

### Dependencies (installed)

| Frontend | Version | | Backend | Version |
| --- | --- | --- | --- | --- |
| next | 14.2.35 | | express | 4.22.3 |
| react, react-dom | 18.3.1 | | @prisma/client, prisma | 5.22.0 |
| tailwindcss | 3.4.19 | | @supabase/supabase-js | 2.118.0 |
| recharts | 2.15.4 | | @anthropic-ai/sdk | 1.3.0 |
| lucide-react | 0.446.0 | | openai | 7.45.1 |
| @supabase/supabase-js | 2.118.0 | | @google/genai | 2.32.0 |
| tailwind-merge | 2.6.1 | | zod | 3.25.76 |
| clsx | 2.1.1 | | node-cron | 3.0.3 |
| typescript | 5.9.3 | | axios | 1.20.0 |
| | | | dotenv | 16.6.1 |
| | | | cors | 2.8.6 |
| | | | tsx | 4.23.15 |
| | | | typescript | 5.9.3 |

### Screens

- `/`: one long dashboard with a quote card, monthly overview, daily matrix, analytics, weekly habits, monthly milestones and a reflection.
- `/login`, `/register`: Supabase email and password forms. The login page also has a "Demo Mode" button.

### Database (live)

| Table | Rows | RLS | Policies |
| --- | --- | --- | --- |
| `users` | 1 (demo) | On | 0 |
| `daily_habits` | 19 | On | 0 |
| `daily_logs` | 528 | On | 0 |
| `weekly_habits` | 21 | On | 0 |
| `monthly_habits` | 4 | On | 0 |
| `monthly_reflections` | 2 | On | 0 |
| `daily_quote_cache` | 2 | On | 0 |
| `coach_profiles` | 1 | On | 0 |
| `chat_messages` | 8 | On | 0 |

- `auth.users` has **0 rows**, so no real account exists. Every row belongs to the demo user.
- `seed.ts` creates 466 logs. The other 62 are test clicks: every log row was last touched between 27 and 29 Oct.
- There are **no migrations**. The schema was applied with `prisma db push`.
- `pg_cron` is not enabled.

### API routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/health` | No | Health check |
| `GET /api/content/quote` | No | Daily quote |
| `POST /api/content/quote/refresh` | **No** | Rewrites the shared quote cache |
| `GET, POST /api/habits/daily`, `PATCH, DELETE /:id` | Yes | Daily habits |
| `GET /api/habits/daily/matrix` | Yes | Month grid |
| `POST /api/habits/daily/log` | Yes | Log or toggle a day |
| `GET, POST /api/habits/weekly`, `PATCH /:id/toggle`, `DELETE /:id` | Yes | Weekly checklist |
| `GET, POST /api/habits/monthly`, `PATCH /:id/toggle`, `DELETE /:id` | Yes | Monthly checklist |
| `GET /api/analytics/month` | Yes | Month stats |
| `GET, POST /api/reflections`, `POST /generate` | Yes | Reflections |
| `GET, POST, DELETE /api/ai/chat`, `POST /chat/stream` | Yes | Coach chat |
| `GET, PATCH /api/ai/profile` | Yes | Coach settings |
| `POST /api/ai/proactive-check` | Yes, any user | Writes messages for **all** users |

### Environment variables

| Variable | Used by | In `backend/.env` or `.env.local` | In example file |
| --- | --- | --- | --- |
| `PORT`, `NODE_ENV`, `FRONTEND_URL` | Backend | Set | Yes |
| `DATABASE_URL` | Prisma | Set | Yes |
| `DIRECT_URL` | Prisma | Set | **No**, and the schema requires it |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Backend | Set | Yes |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Backend | **Empty** | **No** |
| `GEMINI_API_KEY` | Backend | **Absent** | **No** |
| `UNSPLASH_ACCESS_KEY` | Backend | Absent (optional) | Yes |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | Set | Yes |

---

## 2. Does it build and run?

**Yes.** There are no build errors and no compiler warnings.

| Check | Result |
| --- | --- |
| Backend `tsc --noEmit` | Pass (exit 0) |
| `prisma validate` | Pass |
| Backend boot (placeholder env) | Pass. `/api/health` returns 200 and unauthenticated habit requests return 401 |
| Frontend `next build` | Pass, on a scratchpad copy |
| Frontend `next start` | `/`, `/login` and `/register` return 200; an unknown route returns 404 |

### Problems that don't stop the build

- **No lint or tests:** `npm run lint` calls `next lint`, but ESLint is not installed. There are no tests at all.
- **Stale date:** the dashboard always opens on June 2026 (`frontend/src/app/page.tsx:35-36`).
- **Port docs disagree:** `package.json` uses 3000, `PROJECT_MEMORY.md` says 3001, and the backend falls back to 5000, which macOS AirPlay occupies.
- **Backend failure looks like an empty account:** load errors become empty lists (`frontend/src/hooks/useHabits.ts:20-23`).
- **Noisy logs:** an ordinary 401 prints a full stack trace. In development, API error responses also include the stack (`backend/src/middlewares/error.middleware.ts:40-47`).
- **Dead code:** `DashboardHeader.tsx` and `TopToolbar.tsx` are never imported. `backend/src/services/aiCoach.service.ts` only re-exports another file. `analyticsService.ts` contains a duplicate `contentService`.

---

## 3. Outdated, deprecated or insecure dependencies

Checked against the npm and PyPI registries and `npm audit` on 1 Nov 2026.

### Vulnerabilities

| Package | Severity | Issue | Fix |
| --- | --- | --- | --- |
| next 14.2.35 | **Critical** | Many advisories, including unauthenticated remote code execution in image optimization, SSRF and cache poisoning | next 16.4.3 (breaking) |
| postcss (inside next) | High | XSS and file disclosure | Comes with the next upgrade |
| zod 3.25.76 | High | Memory exhaustion on oversized input | zod 4.6.7 (breaking) |
| node-cron 3.0.3 and uuid | Moderate | Buffer bounds check | node-cron 4.6.0 (breaking), or remove it |

Totals: frontend 2 (1 critical, 1 high), backend 3 (1 high, 2 moderate).

### Version gap

| Package | Installed | Latest | Action |
| --- | --- | --- | --- |
| next | 14.2.35 | 16.4.3 | Upgrade |
| react | 18.3.1 | 19.3.1 | Upgrade with next |
| tailwindcss | 3.4.19 | 4.3.3 | Upgrade with the UI rebuild |
| recharts | 2.15.4 | 3.10.1 | Replace or upgrade in the UI rebuild |
| lucide-react | 0.446.0 | 1.66.0 | Upgrade |
| typescript | 5.9.3 | 7.0.2 | Hold until tooling supports it |
| prisma | 5.22.0 | 7.10.1 stable | **Don't upgrade.** Remove with Express |
| express | 4.22.3 | 5.3.0 | **Don't upgrade.** Remove |
| openai | 7.45.1 | 7.47.0 | **Remove.** The plan uses Claude only |
| @google/genai | 2.32.0 | 2.32.0 | **Remove.** Imported but never called |

`npm outdated` lists prisma 8.0.0-rc.29 as latest, which is a release candidate, so 7.10.1 is shown above.

### Target stack (current versions)

expo 58.0.22, react-native 0.88.1, fastapi 0.162.0, uvicorn 0.54.0, anthropic (Python) 2.3.0.

### Deprecated APIs

- Model `claude-3-5-sonnet-20241022` was retired on 28 Oct 2025.
- `next lint` was removed in newer Next.js versions, so linting needs its own ESLint setup. Confirm this during the upgrade.

---

## 4. Security problems

| # | Severity | Problem | Where |
| --- | --- | --- | --- |
| 1 | **Critical** | Production database password in plaintext in a **public** repo | `PROJECT_MEMORY.md:69-74`, commit `acd22d7` |
| 2 | **Critical** | Next.js remote code execution advisories | `frontend/package.json` |
| 3 | **Critical** | Dev auth bypass: a fixed token signs anyone in as the demo user when `NODE_ENV=development`, and clients send it automatically | `auth.middleware.ts:17`, `frontend/src/services/api.ts:22`, `aiCoachService.ts:47` |
| 4 | **High** | Partial service role key committed | `PROJECT_MEMORY.md:68` |
| 5 | **High** | Hardcoded demo user fallback: any signed-in user can edit or delete demo records, and new users see demo data | 25 places in 6 files, e.g. `habit.service.ts:88-132` |
| 6 | **High** | CORS accepts every origin with credentials. Confirmed with `Origin: https://evil.example` | `backend/src/app.ts:25` |
| 7 | **High** | Any user can trigger coach messages for every user | `aiCoach.routes.ts:71` |
| 8 | **High** | Unauthenticated write to the shared quote cache | `content.routes.ts:8` |
| 9 | **High** | No policies on any table, and the backend bypasses RLS | See below |
| 10 | **Medium** | `anon` and `authenticated` hold full table grants, including `TRUNCATE`, which RLS doesn't cover | Live `daily_logs`; other tables to confirm |
| 11 | **Medium** | No rate limits. `limit` on chat history is uncapped, and `currentDate` is not validated | `aiCoach.controller.ts:13`, `aiCoach.routes.ts:28` |
| 12 | **Medium** | Log dates accept any date, including far past or future | `habit.routes.ts:51` |
| 13 | **Medium** | The model could write logs for any date through tool calls, with only an ownership check | `aiCoachService.ts:525-531` |
| 14 | **Low** | Six-character minimum password | `RegisterForm.tsx` |
| 15 | **Low** | Stack traces in API errors in development | `error.middleware.ts:40-47` |
| 16 | **Low** | Supabase flags `rls_auto_enable()` as callable by `anon`. It is an event-trigger function that can't be called directly, so the risk is low, but revoke it | Live database |

### What these mean together

- **The password defeats RLS.** Anyone holding it connects as a privileged role. Rotation is the only fix, and removing it from the repo doesn't undo the exposure. I can't tell whether it has been used.
- **RLS is on but protects nothing on the real path.** With zero policies, direct client access is blocked, which is safe but useless. All real traffic goes through Prisma, which bypasses RLS. So `PLAN.md`'s design, with clients talking to Supabase directly, needs policies on every table first.
- **The login wall doesn't work.** `useAuth.tsx:28,32` substitutes a demo user when there is no session. Confirmed in a browser: a fresh session with no login opens the dashboard, and every API call succeeds with the dev token.
- **Exposure today is limited.** There are no real users and no deployment config in the repo, so items 3 and 5-8 aren't known to be reachable on the internet. They must be fixed before any real user or deployment.

### Not problems

- `.env` and `.env.local` are gitignored and were never committed.
- The publishable Supabase key in the docs is safe to expose.
- AI keys were never in client code.
- The service key is used server-side only.
- The demo password text in `LoginForm.tsx:38-44` is not a real credential, because no such account exists.

---

## 5. Why the AI features failed

There was no single cause. Fixing one would only have exposed the next.

1. **No keys were ever set.** `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are empty, and `GEMINI_API_KEY` is absent, so no client is created (`backend/src/services/aiCoachService.ts:56-66`). **No real AI call has ever been made.**
2. **A fake engine hid that.** With no client, `processConversation` falls through to `executeDynamicConversationalEngine` (`:428`, `:696-880`). This is a keyword matcher that fills in canned replies and shows them as coach responses. So it looked like a bad AI, not a missing key.
3. **The model name is retired.** With a key, `claude-3-5-sonnet-20241022` (`:509`, `:548`) would fail.
4. **Errors are swallowed.** The `catch` at `:405` logs a warning and falls through to the fake engine, so a failure would also look like a bland reply.
5. **The first message has the wrong role.** The drawer's welcome message (`AICoachDrawer.tsx:108`) is sent as `messages[0]` with role `assistant`, but the first message must be from the user. It's also filtered and resent on each turn (`aiCoachService.ts:495-502`).
6. **The streaming is fake.** The whole reply is generated first, then split into words with a 20 ms delay (`aiCoach.controller.ts:91-108`).
7. **History is backwards.** `getChatHistory` returns the **oldest** messages (`aiCoachService.ts:250-254`), so long chats lose recent context. The unread check at `page.tsx:49` has the same problem.
8. **The context is thin.** The prompt only sees today's completion list, with no recent logs or patterns.
9. **There's no real degraded mode.** Provider fallback (Anthropic, OpenAI, keyword matcher) means the app imitates AI instead of saying it's unavailable. The frontend also retries with the full history on stream failure, which can repeat tool actions (`AICoachDrawer.tsx:208-232`).

### Ruled out

- **Wrong SDK:** `@anthropic-ai/sdk` 1.3.0 is the latest.
- **Client-side calls:** all calls were server-side.
- **Missing backend:** it exists, but `PLAN.md` wants it in FastAPI.

### Live data risk

The fake engine changes data on keyword matches:

- Any message containing "downscale" cuts every habit's goal by 30% (`:771-786`). This has already happened: the first demo habit's goal is 7, and the seed set it to 30.
- A message containing "done" or "did" plus any 4+ letter word from a habit title marks that habit complete (`:818-833`). So an ordinary sentence can log a habit by accident.

---

## 6. Gap analysis against PLAN.md

**Legend:** Done = meets the plan. Partial = usable base. Missing = absent. Wrong = exists but conflicts with the plan.

**Result:** of the 69 items below, 0 are Done, 8 are Partial, 42 are Missing and 19 are Wrong.

### Tracking

| v1 feature | Status | Notes and references |
| --- | --- | --- |
| Today screen | Wrong | Dashboard comes first. Mobile day view is below the charts (`page.tsx`, `DailyMobileTodayView.tsx`) |
| Identities | Missing | Only a single `target_identity` string (`schema.prisma:115`) |
| Yes/no habits | Partial | `daily_logs.is_completed` (`schema.prisma:43`) |
| Count, duration and quit habits | Missing | Boolean only |
| Tap logging | Partial | `useOptimisticDailyLog.ts`; works, with rollback |
| Long-press and swipe logging | Missing | No gesture handling anywhere |
| Shrink It ladder | Missing | Closest is "Emergency Downscale", which is a different idea |
| Evening back-log | Missing | No evening state |
| 3-habit onboarding cap | Missing | No onboarding, no cap (`habit.service.ts:78`) |

### Streaks

| v1 feature | Status | Notes and references |
| --- | --- | --- |
| Computed from logs | Partial | Computed, not stored, but with the bugs below (`analytics.service.ts:106-138`) |
| Streaks across months | Wrong | Resets on the 1st, because only one month's logs are read |
| In-progress today | Wrong | Current streak shows 0 until today is logged (`analytics.service.ts:131-138`) |
| Fractured chain view | Missing | |
| Grace Day bank | Wrong | Toggle saved in `localStorage`, and nothing reads it (`ProfileSettingsDrawer.tsx:42-84`) |
| 24-hour back-log | Wrong | The UI promises it, but any date is accepted (`habit.routes.ts:51`) |
| 1.5x Streak Repair | Missing | |

### Progress

| v1 feature | Status | Notes and references |
| --- | --- | --- |
| Identity score | Missing | |
| Yearly heatmap | Missing | |
| Streak history | Missing | |
| Compound Forecaster | Missing | |
| Top habits | Partial | Month only, styled as a leaderboard with a trophy (`Top10Leaderboard.tsx`) |
| Desktop 31-day grid | Partial | Good base (`DailyMatrix.tsx`, `HabitRow.tsx`), but boolean only, coloured by week, with 20px cells |

### AI coach

| v1 feature | Status | Notes and references |
| --- | --- | --- |
| Coach chat | Wrong | Section 5 |
| Coach cards on Today | Missing | |
| Miss review | Missing | |
| Preemptive nudges | Wrong | Fixed-time canned messages at 12:00 and 21:00 server time, stored but never pushed (`aiCoachService.ts:268-324`) |
| Peak hours | Missing | Logs have no completion time, only `updated_at` |
| Sunday Review | Wrong | Monthly template that overwrites the saved reflection (`reflection.service.ts:53-88`) |
| Future-Self letter | Missing | |
| "Why" card | Missing | |
| `user_patterns` view | Missing | |
| Per-user AI cost limits | Missing | |

### Voice, reminders and focus

| v1 feature | Status | Notes and references |
| --- | --- | --- |
| Siri via App Intents | Missing | Needs the mobile app |
| In-app voice and wake word | Missing | |
| Android voice tile and widget | Missing | |
| Intent parser | Missing | |
| 10-second undo | Missing | |
| Offline queue | Missing | |
| Smart reminders, max 2 per day | Missing | `NotificationDropdown.tsx` shows **made-up hardcoded notifications** |
| Home and lock-screen widgets | Missing | |
| Tunnel Vision and focus timer | Missing | |

### Data model

| PLAN.md table | Status | Current equivalent |
| --- | --- | --- |
| `users` | Partial | Has id and email. Lacks timezone, wake_time, tone, mode, assistant_name |
| `identities` | Missing | |
| `habits` | Wrong | `daily_habits` has `goal_days`, a monthly target that doesn't exist in the plan. No identity, type, target, unit, schedule or aliases |
| `habit_levels` | Missing | |
| `habit_logs` | Wrong | `daily_logs` has one boolean, and `date` is stored as text. No level, amount, status, reason, source or `logged_at` |
| `grace_days` | Missing | |
| `reflections` | Wrong | `monthly_reflections` is monthly free text. The plan needs weekly wins and a mood line |
| `coach_events` | Wrong | `chat_messages` and `coach_profiles` cover chat only |

### Design principles

| Rule | Status | Notes |
| --- | --- | --- |
| Warm neutrals, no pure white or black | Wrong | Slate and blue, with `bg-white` used 60 times |
| Light and dark designed together | Partial | Both exist, built with `dark:` overrides rather than tokens |
| Tabular numerals | Missing | 0 uses |
| Three text sizes | Wrong | Many ad hoc sizes, down to 9px |
| 8 identity colours | Wrong | Colours mean the **week of the month** (`CheckboxCell.tsx:23-43`, `colors.ts`) |
| Six card states | Missing | Only done and not done |
| No shame states, hollow dots | Missing | Missed days are just blank. Red is **not** used for misses, only for delete buttons, errors and accents, in 13 files |
| No glassmorphism | Wrong | `backdrop-blur` in 11 files, plus 11 gradients and glowing, pulsing elements |
| 48px touch targets | Wrong | 20px checkbox (`CheckboxCell.tsx:64`), 36px mobile checkbox |
| Check-off under 400 ms | Partial | 200 ms transition, but no haptics |
| Calm by default | Wrong | Seven dashboard sections, loud language ("conquered") and spinning or bouncing icons (`AICoachTrigger.tsx`) |

### Infrastructure

| Item | Status | Notes |
| --- | --- | --- |
| Expo mobile app | Missing | |
| FastAPI AI service | Missing | |
| Realtime sync | Missing | No subscriptions |
| Supabase cron | Missing | node-cron on the Express server; `pg_cron` off |
| Push (Expo Notifications) | Missing | |
| PostHog with log `source` | Missing | |
| Streak unit tests | Missing | |
| 200-phrase voice test set | Missing | |
| Privacy policy | Wrong | Placeholder claiming "99.9% uptime backed by PostgreSQL clustering", which isn't true (`LegalModal.tsx:53`), and it doesn't cover voice or AI |

### Built, but outside v1

| Feature | Plan says | Action |
| --- | --- | --- |
| Weekly habits, monthly milestones | v2 | Remove from v1 screens |
| Daily quote and photo card, Unsplash | Not in plan | Remove |
| Calendar `.ics` export | Not in plan | Remove |
| CSV export | v2, and the privacy policy needs data export | Keep the idea, rebuild later |
| Cmd+K palette | Not in plan | Possibly keep on desktop |

### Other bugs found

- Deleting a habit has no confirmation and removes all its logs (`HabitRow.tsx:71`).
- The reflection box saves on every keystroke, with a success toast each time (`MonthlyReflectionCard.tsx`).
- "Total Days Conquered" is a monthly count labelled as lifetime (`page.tsx:123`).
- Charts raise low values to 8-10%, so a 0% day looks non-zero (`AreaProgressChart.tsx`, `WeeklyBarsChart.tsx`).
- **Timezones:** 9 uses of `toISOString().split('T')[0]` use the UTC date. For someone in India, the server thinks it's "yesterday" until 05:30 local time. Cron jobs use server time.
- Weeks are month chunks (days 1-7, 8-14 and so on), not calendar weeks (`dateUtils.ts:52-57`).

---

## 7. Stack mismatch

`PLAN.md` wants: React Native + Expo mobile, Next.js web, Supabase with streak rules in SQL, a FastAPI AI service, and the Claude API.

Effort is a rough estimate for one developer and covers the scope in Step 2, not all of v1.

| Layer | Current | Recommendation | Effort | Why |
| --- | --- | --- | --- | --- |
| Mobile | None | **Restart:** new Expo app | 2-3 weeks for Today and logging | Nothing to adapt. The plan needs native Siri, widget and tile code, so use development builds, not Expo Go |
| Web | Next 14 dashboard | **Keep and adapt:** upgrade to 16, then shrink to the desktop grid and weekly review | 1 week | The scaffold and auth wiring are sound. The product role changes |
| Data and auth | Supabase with no migrations | **Keep and adapt:** adopt `supabase/migrations`, add RLS policies | 2-3 days | Right platform. With no real data, this is simple |
| API layer | Express + Prisma | **Migrate gradually, then remove** | 1 week | The plan has clients talking to Supabase directly. No Express in the architecture. Don't spend time on Express 5 or Prisma 7 |
| Streak logic | Spread across `analytics.service.ts`, `HabitRow.tsx`, `DailyMobileTodayView.tsx` | **Restart** as SQL functions, per the plan | 1-1.5 weeks | One source of truth. Needs a SQL test setup |
| AI | Express with a keyword matcher | **Restart:** FastAPI | 1-1.5 weeks | Nothing reusable except the idea of tool calling |
| Scheduled jobs | node-cron | **Restart:** Supabase cron and FastAPI workers | Part of AI work | Per the plan |
| Legacy vanilla app | Root `js/`, `css/`, `index.html` | **Delete** | Under 1 day | `streakCalc.js` has the same month-bound bug, so nothing is worth keeping |

### Worth keeping

- The Supabase project and email auth wiring
- `@@unique([habit_id, date])`, which matches "one row per habit per day"
- The idea of storing the user's local date, not a timestamp (but as `date` type, not text)
- `useOptimisticDailyLog.ts`'s optimistic update and rollback pattern
- `DailyMatrix.tsx` as the base for the desktop grid
- Zod request validation, as a pattern for the new boundaries

### AI model choice

`PLAN.md` asks for a small model for voice and nudges, and a larger one for chat and letters.

| Use | Model | Notes |
| --- | --- | --- |
| Coach chat, letters | `claude-opus-5-5` | Set effort explicitly (default is `medium`). Enable refusal fallbacks |
| Voice parsing, nudges | `claude-haiku-5-5` | Use `auto` tool choice with `strict: true`, or structured outputs. Server-side refusal fallback isn't available on Haiku |

---

## 8. Prioritized fix list

### Blocking

1. **You:** rotate the database password and service role key. Update `backend/.env`.
2. Remove secrets from `PROJECT_MEMORY.md`. Rewriting git history is optional once rotated.
3. **You:** answer the [decisions below](#decisions-needed-before-step-2).
4. Add ESLint and test runners.
5. Fix `.env.example` files and the port docs.
6. Add a real Anthropic API key in the AI service only.

### Security

1. Upgrade to Next 16 and React 19.
2. Remove the dev token and every demo fallback.
3. Lock CORS to an allowlist.
4. Add auth to `/content/quote/refresh`, and remove `/ai/proactive-check` as a user route.
5. Write RLS policies for every table, before any client connects directly.
6. Revoke unnecessary `anon` and `authenticated` grants, and `rls_auto_enable()` execution.
7. Update or remove zod and node-cron. Prefer removal with Express.
8. Add per-user rate limits and input size limits.
9. Remove the keyword engine **first**, since it can change data.

### Data model

1. Baseline the schema into `supabase/migrations`.
2. Create the eight `PLAN.md` tables and the `user_patterns` view.
3. Link `users` to `auth.users`. The demo row has no auth account and can't be linked.
4. Use real `date` columns and enums.
5. Remove or archive `weekly_habits`, `monthly_habits`, `daily_quote_cache`, `coach_profiles` and `chat_messages`.

### Core tracker logic

1. User-local "today", from `users.timezone`.
2. Logging with level, amount, status, source and skip reason.
3. Streaks across months, with today counted as in progress.
4. Shrink levels, Grace Days, 24-hour back-log and 1.5x Repair, once decided.
5. Tests for back-log, Grace Days, repairs, timezone changes and daylight saving.

### UI/UX

1. Design tokens and base components first.
2. Today screen, habit card with all six states, Shrink sheet, swipe to skip.
3. Identity grouping, one accent per identity, hollow dots.
4. Tabular numerals, 48px targets, check-off under 400 ms with a haptic tick.
5. Rebuild the desktop grid on tokens. Remove glass, gradients, fake notifications and v2 sections.

### AI

1. FastAPI service as the only holder of the Anthropic key, verifying Supabase JWTs.
2. Coach chat with real streaming and context from habits and recent logs.
3. Voice intent parser with the six tools and `voice_aliases`.
4. Per-user rate limits.
5. Clear "coach unavailable" states, so the tracker works without AI.

---

## Decisions needed before Step 2

`PLAN.md` names these rules but doesn't define them. Items 1-5 block Step 2 items 3 and 4. I've given a recommendation for each, but they're product decisions.

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | **Grace Days:** how are they earned, what is the cap, and are they spent automatically or by the user? | 1 earned per 7 consistent days, cap 3, spent automatically for the protected habit |
| 2 | **1.5x Streak Repair:** 1.5x of what, and within what window? Can a yes/no habit be repaired? | Within 24-48 hours of a miss, do 1.5x the target. For yes/no habits, do it plus the minimum version. Once per missed day |
| 3 | **Mode:** what do `strict` and `grace` change? Does strict turn off Grace Days and repair? | Strict: no Grace Days, back-log only. Grace: everything on |
| 4 | **What counts for a streak?** Do `minimum` and `setup` levels count? Does `skipped`? Do unscheduled days break it? | All three levels count. Skipped pauses without breaking. Unscheduled days are ignored |
| 5 | **Day boundary:** does a day end at local midnight? Does 24-hour back-log mean 24 hours after the day ends? Is `missed` stored, or derived from no row? | Local midnight, plus 24 hours after that. Derive `missed`, and store only real events |
| 6 | **Which client gets the Step 5 UI first?** The brief says rebuild the UI. The plan is mobile-first. | Build Today in Expo first, and limit Next.js to the desktop grid and weekly review |
| 7 | **Demo data:** delete it? | Yes. It's seed data and test clicks |
| 8 | **Weekly and monthly habits:** remove now or keep hidden? | Remove the tables and UI. Rebuild properly in v2 |

### Also worth knowing

- **Step 2 doesn't cover all of v1.** Onboarding, habit creation, Progress, reminders, widgets, Siri, in-app voice capture, offline queue and most coach features aren't in the Step 2 list. These need a later plan.
- **The eight tables have small gaps.** There's nowhere for push tokens, a habit archive flag or offline idempotency keys. `undo_last` also needs a way to find the last action. I'd add these during the migration and record them in `PLAN.md`.
- **Streak rules in SQL vs offline logging.** The app can't compute a confirmed streak while offline. The reply "12-day streak" would need a local estimate or to wait for sync.
- **"Consistent" is undefined** for unlocking more than 3 habits after 2 weeks.
- **Open in `PLAN.md`, not blocking Step 2:** app and assistant name, team size, pricing, and Hindi voice support.

---

## Change log

### Step 2 item 1: build and dependencies (1 Nov 2026)

**Changed**

- Frontend: upgraded to Next 16.4.3, React 19.3.1 and lucide-react 1.66.0. Added ESLint with a flat config, because `next lint` no longer exists, and Vitest.
- Backend: removed `openai` and `@google/genai` and their code. Upgraded zod to 4, node-cron to 4 and axios to 1.21. Added Vitest and Supertest. Express and Prisma stay on their current versions because they are being removed.
- Fixed the 15 `any` lint errors and 21 unused-variable warnings.
- Deleted the legacy vanilla app and the empty `assets/` folder.
- Standardised on port 5001 for the API and 3000 for the web app. Updated the docs and example env files.
- Added root `lint`, `test` and `typecheck` scripts.

**Results**

| Check | Before | After |
| --- | --- | --- |
| Backend `npm audit` | 1 high, 2 moderate | 0 |
| Frontend `npm audit`, production | 1 critical, 1 high | 0 |
| Frontend `npm audit`, including dev tools | 1 critical, 1 high | 16 moderate |
| Typecheck, both apps | Pass | Pass |
| Frontend lint | Not runnable | 0 errors, 11 warnings |
| Tests | None | 11 passing (7 backend, 4 frontend) |
| Production builds, both apps | Pass | Pass |

**Run in a real browser, against the real database**

- Dashboard, habit grid, charts and quote card all render at desktop and phone widths, and every API call returned 200.
- Checkbox toggling works: 4 clicks produced 4 saved changes and ended on the original state. An earlier run showed one out-of-step result that did not reproduce. It happened during the first dev compile, but the cause wasn't confirmed.
- One 404 appeared in the browser console on the first desktop load only. The source wasn't identified, and it did not repeat.

**Known and accepted for now**

- The 16 moderate advisories are one `minimatch` denial-of-service issue inside ESLint's dev dependencies. They don't ship to users, and `npm audit fix --force` would downgrade ESLint to version 4.
- `react-hooks/set-state-in-effect` and `react-hooks/purity` are warnings until Step 5 replaces those screens.
- Tailwind 3, recharts 2 and tailwind-merge 2 stay until the UI rebuild.
- The backend has no ESLint, because Express is being removed.
- Saving a log took over 1.5 seconds in dev. The instant checkbox update hides this. Recheck it when clients talk to Supabase directly.
- The first browser run left one demo log unchecked (1 June, "Review class notes"). It goes away with the demo data in item 3.

**Decided in `PLAN.md`**

- Decisions 1-8 from this audit are final and recorded in the Streak rules section of `PLAN.md`. "Missed" was also removed from the stored `habit_logs` statuses.

### Step 2 item 2: security (1 Nov 2026)

**Changed**

- **Env vars:** the backend reads `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `DATABASE_URL`. The web app reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Both refuse to start without them. A test fails if client source mentions a server-only secret.
- **Env files:** `.gitignore` now covers every `.env` variant except `.env.example`. `backend/.env.example` and `frontend/.env.example` hold placeholders only.
- **Secrets in docs:** removed from `PROJECT_MEMORY.md`, which is now marked as historical.
- **Auth:** removed the development token, every demo user fallback and the Demo Mode button. Signed-out visitors go to `/login`.
- **Keyword coach:** deleted. The coach now says it's unavailable and changes no data. It no longer retries, which could have repeated tool actions.
- **API:** CORS allowlist, 300 requests per minute per IP, 100 KB body limit, no stack traces in responses, capped chat input and history, real date validation, auth on the quote refresh route. The route that wrote messages for all users is gone.
- **Accounts:** 8-character password minimum in the form and local Supabase config. The hosted project's own setting still needs checking.
- **Database:** added `supabase/` with a baseline migration and an access migration containing RLS policies for all 9 tables, and removal of default `anon` grants.

**Bugs found while testing, and fixed**

- New users got a 409 on first load, because parallel requests raced to create the same `users` row.
- Oversized or malformed JSON was reported as a 500 instead of a 4xx.
- Chat history returned the oldest messages instead of the newest.
- The dashboard opened on June 2026 instead of the current month.

**Results**

| Check | Result |
| --- | --- |
| RLS tests, local Postgres | 13 of 13 passing |
| Tests | 21 passing (15 backend, 6 frontend) |
| Typecheck, builds, production `npm audit` | Pass, 0 vulnerabilities |
| Lint | 0 errors, 11 warnings |

**Run in a real browser against local Supabase, with real signups**

- A signed-out visit ends at `/login`, with no API calls.
- The old dev token gets a 401. A foreign origin gets no CORS access.
- Sign-up works, a new account starts empty, and the app opens on the current month.
- A saved log survives a reload.
- A second user can't see the first user's habit.
- Sign-out survives a reload.
- The coach shows "unavailable", stores nothing and changes nothing.

**Git history**

Only commit `acd22d7`, in `PROJECT_MEMORY.md`, ever held credentials:

| Value | Exposed | Status |
| --- | --- | --- |
| Database password | In full | Reset by the owner |
| Service role key | Partly (26 characters) | Replaced by the owner |
| Publishable key | In full | Public by design |

No Anthropic, OpenAI or Google keys, JWTs, or `.env` files appear anywhere in history. History has not been rewritten, and the commit is public.

**Applied to the live database**

- Compared the baseline with a live schema dump. All tables, columns, constraints, indexes and foreign keys match. The live-only items (RLS enabled, `rls_auto_enable()`, `ensure_rls` and its grants) were accepted by the owner and are listed at the top of the baseline migration.
- The dry run listed one migration, `20261101000100_lock_down_access.sql`, which was then pushed.
- The Supabase security advisor now reports no issues.
- All 26 live checks passed, using two temporary users that were then deleted:
  - Sign-in works with the new keys, and the backend reads and writes.
  - The publishable key alone is blocked from all 9 tables.
  - A signed-in user sees no other user's rows and can't create rows for them.
- The owner set the hosted password minimum to 8.

**Known and accepted for now**

- React reports a hydration attribute mismatch in dev. The source wasn't identified.
- `/login` logs one 404 for a resource when loaded. The source wasn't identified.
- The rate limit is per IP. Per-user AI limits come with the FastAPI service.

### Step 2 item 3: data model (1 Nov 2026)

**Changed**

- New migration `20261101000200_core_schema.sql` replaces the scaffold tables with `PLAN.md`'s eight tables and the `user_patterns` view, and deletes the demo data.
- Every table has row-level security from the start. Clients can't write `grace_days`, `coach_events` or `settled_through`.
- A database trigger creates a profile for each new account. Invalid timezones fall back to UTC.
- "Missed" can't be stored: it isn't in the `habit_logs` status type.
- Removed Express, Prisma and `FULLSTACK_GUIDE.md`. The web app now talks to Supabase directly, as in `PLAN.md`. `backend/` holds only local env files until the AI service arrives.
- Reduced the web app to the 31-day grid, the temporary phone day view and settings. Removed weekly and monthly habits, the quote card, charts, fake notifications, the coach drawer, the placeholder legal text and the Cmd+K palette. The coach returns in item 6.
- Streak mode now saves to the profile instead of `localStorage`.
- Deleting a habit now asks for confirmation.

**Additions to `PLAN.md`'s model**

| Column | Why |
| --- | --- |
| `habits.starts_on` | Days before a habit existed must not count as misses |
| `habits.archived_at` | Removing a habit from Today shouldn't delete its history |
| `habits.window_start`, `window_end` | `PLAN.md`'s schedule time window, as columns |
| `users.settled_through` | Records which days have had their Grace Day outcome applied |

**Still missing from the model, for later items**

- Push tokens, needed for reminders.
- Offline idempotency keys, needed for the offline queue.
- Rate-limit and AI cost tracking, for item 6.

**Applied to the live database**

- The local reset and tests passed, and the dry run listed one migration, `20261101000200_core_schema.sql`, which was then pushed.
- All 25 live checks passed, using temporary users that were then deleted. Client reads and writes work, and the publishable key can't read other users' rows.
- The advisor raised one new warning, a missing `search_path` on `is_valid_timezone`, fixed in the next migration.

### Step 2 item 4: core tracker logic (1 Nov 2026)

**Changed**

- New migration `20261101000300_tracker_logic.sql` puts every rule from `PLAN.md`'s Streak rules section into SQL, in a private `tracker` schema.
- Those functions take the current time as a parameter, so tests can control it. Clients only reach thin wrappers that use the real clock: `log_habit`, `skip_habit`, `undo_log`, `repair_habit`, `get_streaks`, `get_grace_bank` and `get_day_statuses`.
- Clients can no longer write `habit_logs` directly, so nothing can skip the rules.
- "Today" and the back-log window use the timezone on the profile. The window is exactly 24 elapsed hours, including across clock changes.
- The web app logs through the API, and shows the streak computed in SQL. Streaks now cross month boundaries, and an unlogged today no longer shows 0.

**Results**

| Check | Result |
| --- | --- |
| Streak rule tests | 98 of 98 passing |
| Access tests | 30 of 30 passing |
| Frontend tests | 10 passing |
| Typecheck, build, production `npm audit` | Pass, 0 vulnerabilities |
| Lint | 0 errors, 3 warnings |

The tests cover every rule, plus each requested case: a Mon/Thu habit repaired across the gap, two misses in a row, a 3rd skip covered by a Grace Day, back-logging one second before the window closes and refused at the moment it closes, and timezone changes in both directions.

**Decisions made where the rules were silent**

| Case | What the code does |
| --- | --- |
| A protected day during the 7-day Grace Day count | Resets the count, because the habit wasn't completed and only skips are defined as pausing it |
| Bank already at 3 when a Grace Day is earned | The new one is discarded |
| A day with more misses than Grace Days | Covers the oldest habit first |
| A miss with no streak running | Spends no Grace Day, because nothing would break |
| A repair made before the missed day's window closes | Allowed, and it saves the Grace Day that would otherwise be spent |
| Changing mode | Applies to days settled from then on, and doesn't rewrite the past |
| A count or duration repair | Uses the full level's target if it has one, otherwise the habit's target |
| A repair on a `quit` habit | Uses the yes/no rule |

**How Grace Days get applied**

Superseded by the pure rebuild below. There is no nightly job yet, because `pg_cron` isn't enabled until reminders are built. A nudge or widget that reads `grace_days` without going through these functions could see out-of-date state.

**Applied to the live database**

- The local reset and 128 tests passed, and the dry run listed one migration, `20261101000300_tracker_logic.sql`, which was then pushed.
- All 23 live checks passed, using temporary users that were then deleted:
  - Logging, streaks, the Grace Day bank and day statuses work through the API.
  - Future dates, dates past the window and skips without a reason are refused.
  - Direct writes to `habit_logs` are refused.
  - A second user can't touch the first user's habit, and the publishable key alone is blocked.
  - The private `tracker` schema can't be reached, so clients can't fake the clock.
- The `is_valid_timezone` warning is fixed. The advisor now reports 7 warnings, one for each client API function. These are expected: signed-in users are meant to call them, and each checks ownership itself.

### Item 4 addendum: pure Grace Days (1 Nov 2026)

**Why this changed:** the first version recorded Grace Day outcomes the first time a day was settled, so results could depend on when a read happened. A read before a mode change, or before a repair, could give a different outcome from the same history.

**Changed**

- New migration `20261101000400_pure_grace_days.sql` rebuilds Grace Days from the first day whenever logs or settings change. `grace_days` is now a stored copy of that result.
- Mode changes are stored with dates in `tracker.mode_history`, so each day is judged by the mode in force on it.
- A repair brings Grace Days up to date before deciding, so its answer doesn't depend on whether anything read first.
- Changing timezone can reopen a day if its window is open again in the new timezone. Its Grace Day outcome then waits until that window closes.
- `PLAN.md` now has the final rules on repaired and protected days, plus the definitions for habit unlocks, identity score and the Compound Forecaster.

**Results**

- 147 database tests passing. New tests prove the same history gives the same result when read once, daily or out of order, and that stored Grace Days can be deleted and rebuilt exactly.
- With a year of logs across 5 habits, a rebuild takes about 0.85 seconds and an unchanged read about 2 ms. Rebuilds happen about once a day or after a repair, not on every log.

**Known gap**

Editing a habit's schedule currently applies to its whole history, because schedules aren't dated. Changing Mon/Thu to daily would turn past unscheduled days into misses. This needs fixing before the habit editing screen ships.

**Applied to the live database**

- The local tests passed, and the dry run listed one migration, which was then pushed.
- All 25 live checks passed using temporary users that were then deleted, including a mode change followed by a streak read.

### Step 2 item 5: design system, in progress (1 Nov 2026)

**Changed**

- Added the Expo app in `mobile/` on SDK 58. Expo Doctor passes all 20 checks.
- Added design tokens, light and dark themes, `Text`, `StatusMark` and `HabitCard`, plus a design review screen.
- The typeface is Figtree. It was chosen after checking the font file: its tabular feature makes every digit the same width, and DM Sans has no such feature.
- `HabitCard` has the six states in `PLAN.md`, plus `protected`, which the Streak rules require.

**Enforced by tests**

| Rule | Check |
| --- | --- |
| No pure white or black | Every token, both themes |
| No red | Hue check on accents and neutrals |
| Readable text | At least 7:1 for text and 4.5:1 for muted text, on every surface |
| 8 identity accents | At least 4.5:1 on surfaces, in both themes |
| Colour-blind safe | Every pair stays apart under protanopia, deuteranopia and tritanopia, using the Machado 2009 matrices |
| 48px touch targets | `HabitCard` minimum height |
| Check-off under 400 ms | 260 ms, with a haptic tick when a habit becomes logged |
| Reduced motion | The animation is skipped when the system asks |

**Results**

- 51 mobile tests passing, and typecheck passes.
- Run in Chrome through Expo web, at desktop and phone widths, with no console errors. Tapping logs a card, and tabular digits measure identical widths.
- Not yet run on a real phone or simulator. This Mac has no Xcode, so haptics and native rendering are unconfirmed.

**Known and accepted for now**

- 12 moderate `npm audit` advisories in `mobile/`, all one `minimatch` issue in Expo's tooling. The suggested fix would downgrade Expo to SDK 53.
- No ESLint in `mobile/` yet.

**Web error fixed**

- **Cause:** `StatusMark` passed the native-only `accessible={false}` prop to `<Svg>`. On web it reached the DOM element, and React rejects a boolean on an unknown attribute. React only logs this in development, and earlier checks used the production export and native test presets, so neither saw it.
- **Not the cause:** `npx expo install --check` reports every package up to date.
- **Fix:** removed the prop. `motion.useNativeDriver` now turns the native driver off on web, which removes the warning.
- **Tests:** added a web test project with a real DOM. It draws every state in both themes and fails on any `console.error`. The tests for both issues failed before the fix and pass after it.
- **Result:** 149 tests pass across the iOS, Android and web presets. The dev server logs 0 errors and 0 warnings. Native screens are not yet confirmed on a device.

### Step 2 item 5: Today screen (1 Nov 2026)

**Changed**

- New migration `20261101000500_today.sql` adds `get_today()`, which returns due habits, levels, streaks, yesterday's open days and repair availability. "Today" always follows the profile timezone.
- Added the Today screen, grouped by identity, plus sign-in, the Shrink sheet and the skip sheet.
- One tap logs the full version, and another undoes it. A long press opens the Shrink sheet, which also offers Repair when the server allows it. A left swipe opens the skip reasons.
- Skip is also in the Shrink sheet and is a screen-reader action, so swiping is never the only way.
- Mornings lead with yesterday's open days. Evenings add a gentle note about what's left.
- A failed log rolls back and shows the reason. A failed load offers a retry instead of an empty list.
- Streak rules stay in SQL. The app holds no streak logic.

**Results**

- 160 database tests and 243 app tests passing, across the iOS, Android and web presets. Typecheck passes.
- Run through the Expo dev server in Chrome at phone width, against local Supabase, with real sign-up: 0 console errors and 0 server warnings across tap, undo, long press, swipe, skip and back-log.
- Viewing the real screens found three issues that tests had missed, all fixed: open days from yesterday said "Due today", skipped cards hid the reason, and there was no real evening state.

**Not yet confirmed**

- A real phone. Haptics, native swipe feel and Modal behaviour are untested.
- The evening note and morning order were tested with a fake clock, not at those real times.

**Not built yet**

- Habit creation and onboarding, so a new account only sees the empty state. These are the planned hand-off screens.
- Rebuilding the Next.js grid and weekly review on the design tokens.
- Tapping a repair requires no count entry: it logs the required amount.

**Applied to the live database**

- The local tests passed, and the dry run listed one migration, `20261101000500_today.sql`, which was then pushed.
- All live checks passed, using temporary users that were then deleted. `get_today` follows the profile timezone, shows nothing of other users, and is blocked for the publishable key alone.

**Sign-up bug fixed**

With `Confirm email` on, sign-up succeeds without a session, and the sign-in screen showed nothing, so repeat presses sent more emails until Supabase's email limit was reached. The screen now says to check email and moves to sign in, and common auth errors are explained in plain words. Local Supabase has confirmation off, which is why local testing never showed this.

### Shared core, dated settings and activity history (1 Nov 2026)

**Phone test:** in Expo Go, sign-in worked and the evening and empty states showed. Haptics and swipe are still unconfirmed, because no habits exist yet.

**Database**

- New migration `20261102000000_dated_settings_and_activity.sql`.
- Schedules, targets and Shrink levels are stored by date in `tracker.habit_versions`. Past days keep the settings they had, and Streak Repair uses the target from the missed day.
- `activity_events` is append-only. A trigger writes it in the same transaction as every `habit_logs` change, so a failed change leaves no event. Even privileged roles can't edit it. Rows go only when the account does.
- Habit changes now go through `create_habit`, `update_habit` and `archive_habit`, so limits and history always apply. Clients can't write `habits` or `habit_levels` directly.
- The server enforces the 3-habit cap and the 2 consistent weeks rule.
- Added `get_repairs`, and `repair_on` in `get_day_statuses`, for "Repair on Thu".
- Added `habits.milestone_amount` and `milestone_label` for the Forecaster.

**Decision made where the rule was silent:** days with nothing due neither count toward nor break a run of 2 consistent weeks.

**Shared code**

- The repo is now an npm workspace, with one copy of React across both apps.
- `packages/core` holds types, Supabase API functions, form logic, Today logic and design tokens. The AI client joins it in item 6.
- `packages/ui` holds components for React Native and the web, with hover, focus rings, right click for long press, layout sizes and keyboard shortcuts.
- `packages/web-shims` lets the web build use the shared components.
- Haptics stay in the Expo app, so shared code has no native dependency.

**Static web app**

The Next.js app builds to plain files in `frontend/out/` with `output: 'export'`. A shared `HabitCard` was confirmed rendering from a static build.

**What needs a server**

| Feature | Needs | Notes |
| --- | --- | --- |
| Sign-in, habits, logs, streaks | Supabase | Reached from the client, so it works in a packaged desktop app |
| AI coach and voice parsing | FastAPI service | Holds the Anthropic key, so it can never ship in the app |
| Push notifications | Server-side sending | Mobile only for now |
| Nightly jobs | Supabase cron and FastAPI workers | Not built yet |
| Next.js routes, middleware, image optimisation | None used | Static export rules these out, and none are needed |
| Secure desktop sign-in storage | Decide with the desktop app | The web client stores the session in browser storage |

**Miss labels:** a past open day shows "Not logged yet", and a closed miss shows "Repair on Thu" or "Not done". "Protected" is a state in `PLAN.md`.

**Habit creation:** form logic, form components and API functions are built, and the spec is in `docs/handoff/habit-creation.md`.

**Results**

| Check | Result |
| --- | --- |
| Database tests | 248 passing, including a new privacy suite |
| Core tests | 95 passing |
| Mobile and shared UI tests | 158 passing across iOS, Android and web presets |
| Web tests | 6 passing |
| Typecheck and static build | Pass |
| Mobile in Chrome | 0 errors and 0 warnings across all gestures |
| Web in Chrome | Sign-up, create, log, undo, archive and sign-out work |

**Known and accepted for now**

- 12 moderate production `npm audit` advisories, all `glob` and `minimatch` in Expo's tooling.
- The web dev server still logs a hydration warning, to be checked in the Next.js rebuild.
- With a repair offered while yesterday is still open, logging yesterday normally is usually the better choice, but both are allowed.

**Applied to the live database**

- The local tests passed, and the dry run listed one migration, `20261102000000_dated_settings_and_activity.sql`, which was then pushed.
- All 37 live checks passed, using temporary users that were then deleted. They covered the habit API, the 3-habit cap, activity events and strangers being blocked.
- The advisor reports 13 expected warnings, one for each client API function, plus one setting to turn on: leaked password protection in Supabase Auth.

**Decisions recorded**

- Days with nothing due are neutral in 2 consistent weeks, as built.
- The beta launch checklist in `PLAN.md` now covers Confirm email, leaked password protection and a custom email provider. On 1 Nov 2026 the Supabase advisor still reported leaked password protection as off.

### Step 2 item 5: Next.js rebuild (1 Nov 2026)

**Hydration warning**

- **Cause:** the old `Input` component generated field IDs with `Math.random()`, so the server and browser disagreed.
- **Fix:** that component is gone. The web app now renders entirely in the browser, because it depends on the session, colour scheme and date, none of which exist in a static build. The warning no longer appears.

**Changed**

- Rebuilt the web app on `packages/core` and `packages/ui`, and removed Tailwind, the old components and the `/register` route. Sign-in is now a shared form, used by mobile and web.
- **31-day grid:** habits grouped by identity, with the same state marks as the phone. Click logs and undoes. Right click or long press opens levels and skip with a reason. Misses show "Repair on Thu" where that applies. Keys: `[` and `]` change month, `T` returns to this month.
- **Weekly review:** each habit's week at a glance, three wins, a mood line and a note, saved to `reflections`. Protected days don't count as done. Earlier weeks can be opened.
- The app shell has `G` and `W` shortcuts, and settings for streak mode and sign-out.
- Narrow windows show today's cards, because the grid needs the width.
- The two React rules relaxed for the old screens are errors again, and lint now reports no problems.

**Touch targets:** grid cells are 48px on touch screens and 36px with a mouse. The owner approved this exception, and it's recorded in `PLAN.md`. All 31 days fit at 1440 wide. Narrower windows and touch screens scroll, with "Earlier days" and "Later days" buttons shown when days are out of view. Every other control keeps the 48px minimum.

**Results**

| Check | Result |
| --- | --- |
| Core tests | 120 passing |
| Web tests in a real DOM | 21 passing, failing on any console error |
| Mobile and shared UI tests | 158 passing |
| Database tests | 248 passing |
| Lint | 0 errors, 0 warnings |
| Static build in Chrome | Sign-up, log, undo, right click, skip, keyboard, review, reload and sign-out all work |

**Not done:** weekly review is a form for now. Its coach summary comes with the Sunday Review in item 6.

**Grid review fixes**

- Added "Earlier days" and "Later days" buttons when days are out of view. A fade was considered, but the design avoids gradients.
- Keyboard focus now uses a token colour instead of the browser's blue, and clicking leaves no ring.
- Days past the back-log window are now inactive in the grid, instead of looking clickable and being refused by the server.

### Step 2 item 5: habit creation merged (1 Nov 2026)

**Changed**

- Merged `feature/habit-creation`, resolving `mobile/App.tsx` as its notes describe.
- New migration `20261102000100_habit_editing.sql`. `update_habit` now takes a jsonb of changes: a missing field keeps its value and an explicit null clears it. A habit can move to an existing or new identity, keeps its logs, streak and dated settings, and the move is written to `activity_events`. `create_habit` can create an identity in the same transaction, so a refused habit leaves nothing behind. The server's wording is now "2 consistent weeks unlock 2 more."
- Core: `habitLimitMessage` matches the server, offline errors read in plain words, and `FIELD_LIMITS`, `usesTarget` and the identity name check moved in. `createIdentity` is removed.
- Mobile: the form moves habits, sends null when a field is cleared, and handles the keyboard on Android as well as iPhone. Today's props are required. `app.json` now follows the system theme.
- Root `npm run lint` covers `mobile/` with the same strict hooks rules as the web app.

**Checked**

- Typecheck and lint pass. Tests: core 139, web 26, mobile and UI 310, database 274.
- 43 browser checks on Expo web against a local database, including the form's own save on a backdated habit, and the remaining states at 390px dark, 1200px dark and 390px light.
- Live push followed the usual procedure. 23 checks with temporary users passed, those users were deleted, and both real accounts are untouched.

**Phone test:** the owner ran the full test list on their phone against the live database on 1 Nov 2026, including the keyboard, and reported everything working.

