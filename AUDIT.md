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

### Step 2 item 6: provider-agnostic AI service (1 Nov 2026)

**Changed**

- New FastAPI service in `backend/`, the only caller of an LLM. Everything goes through one interface in `app/llm/base.py`: streaming chat, tool calls and token counting. Gemini and Ollama adapters exist. Adding Anthropic is one adapter file and one registry line, and choosing a provider is `AI_PROVIDER` plus the model names in env.
- Models come from env: `gemini-3.5-flash-lite` for voice and nudges, `gemini-3.6-flash` for coach chat and letters. `gemini-3.8-flash`, the newer model, stalled past 45 seconds on this key, so it isn't the default.
- Rate limits: backoff with jitter inside an 8-second limit, per-user hourly limits, an optional service-wide throttle, and friendly messages. Daily quota errors aren't retried.
- On a free tier only `AI_TEST_USER_IDS` reach the provider, and the setting fails closed. `PLAN.md` records that production must use a paid tier with no training on user data.
- The service reads with the person's own token, so RLS applies. Voice returns intents and never writes.
- `packages/core` gains `createAiClient`. `docs/handoff/coach-and-voice.md` covers the screens, which aren't built.

**Checked**

- 64 service tests, core 144.
- Real Gemini with made-up data on local Supabase: chat streamed its first words in 3.6 seconds, nine voice phrases all parsed correctly in under 2.2 seconds each, and a prompt injection attempt produced no intents. A signed-out request got 401 and a non-test account got 403.

**Not checked:** a real Gemini 429. 30 concurrent calls all succeeded, so backoff is tested only against Google's documented error shapes. The Ollama adapter is tested against a fake server, because Ollama isn't installed here.

### Coach and voice screens (1 Nov 2026)

**Changed**

- Mobile gets Today and You tabs. You shows the email and signs out after a confirmation, and the rest of the tab is placeholders.
- Today gets coach cards, made on the device with no AI call, and a coach drawer with streaming replies and two chips: "Quick log my day" and "I feel burned out".
- Voice: a sheet with hold-to-talk, spoken and visual confirmation, an `ask_which` question when two habits match, an offer to add a habit when nothing matches, and a 10-second undo. Plain "undo" phrases are handled on the device, so undo works when the AI doesn't.
- New migration `20261102000200_ai_counters_and_coach_events.sql`. Rate-limit counters move to `tracker.ai_counters` and survive restarts. Chats go to `coach_events` with their source, turn count and outcome, never their words. Only the service's secret key can reach either. Voice logs are recorded as `ai_assisted`.
- `npm run ai` starts the service for a phone on the same Wi-Fi and writes `EXPO_PUBLIC_AI_URL` to `mobile/.env`.

**Checked**

- Typecheck, lint and the static build pass. Tests: core 172, web 26, mobile and UI 374, AI service 77, database 284.
- 23 browser checks on Expo web with local Supabase and real Gemini, using made-up data: hold-to-talk with a simulated microphone, the clarifying question, undo by banner and by voice, the coach, limits across a service restart, the service being down, sign out, and an account not on the test list.
- Live push followed the usual procedure. 19 checks with temporary users passed, and those users were deleted.

**Bugs the browser run found:** the coach drawer collapsed to nothing when opened from a voice question, because a safe-area provider measured itself mid-animation. The tab bar didn't expose its selected tab on web.

**Not checked:** hold-to-talk on a real phone. It needs a development build, because `expo-speech-recognition` isn't in Expo Go, and this Mac has no Xcode. Expo Go uses the text box and the keyboard's mic instead.

### Voice: mishearings and the development build (2 Nov 2026)

**Changed**

- `backend/app/speech_fix.py` matches words by sound (Double Metaphone) and spelling against command words and habit names, and reads Hindi script. It only suggests: "and" sounds exactly like "undo", so the model sees both versions and decides.
- The parser prompt says the text comes from speech recognition, and every call returns a confidence. The response carries `heard`, `corrected`, `confidence` and `level`. High acts, medium asks "Did you mean" with Yes and No, low shows what it heard to edit, and none is a plain no match. The app always shows what it heard.
- A statement can't reach the coach any more. The model did this however the prompt was worded, so `ask_coach` is now checked in code.
- Development build: `eas.json`, `expo-dev-client`, app identifiers, and recogniser hints with English and Hindi. See `docs/dev-build.md`.

**Checked**

- Accuracy 91% to 98% on 46 phrases, and wrong actions 4 to 0. See `docs/voice-accuracy.md`, including why 98% will drop on a fresh set.
- 118 service tests, 174 core, 402 mobile and UI. `expo-doctor` passes 20 of 20 checks.

**Not checked:** the development build itself, which needs your Expo login, and hold-to-talk on a real phone.

### Progress screen (2 Nov 2026)

**Changed**

- New migration `20261102000300_progress.sql` adds `get_habit_days`: one row per scheduled day with its status, level, amount and the target that applied that day. It returns one JSON value, because a year of rows would pass the API's 1,000-row limit.
- `packages/core/src/progress.ts` holds the identity score, yearly heatmap, streak history, top habits and the Compound Forecaster, all pure functions with tests.
- Mobile gets a Progress tab. Each kind of day has its own shape as well as colour, a miss is a quiet hollow ring, and there's no red. On wide screens the sections sit side by side.
- `backend/scripts/seed_test_history.py` replays 60 days through the real logging rules with a backdated clock, so its repairs and protected days are genuine. It refuses any address without `+test`.

**Decisions**

- The score covers the 30 days up to the last finished day, so an unfinished today can't count for or against anyone.
- A skipped day is due but not done, so it lowers the identity score. PLAN.md says "every due habit", and only days with nothing due are left out.
- The forecast slider changes how often, not how much: the amount per completed day stays the same.
- Forecasts need 7 settled days first.

**Checked**

- Typecheck, lint and the static build pass. Tests: core 211, web 26, mobile and UI 422, AI service 118, database 291.
- In a browser on seeded local data, light and dark at 390px and 1200px: no sideways scrolling, and the screenshots were viewed. A year of data loads in 0.07 seconds locally.
- Live push followed the usual procedure. 12 checks with temporary users passed, and those users were deleted. The +test account now has 60 days of history, including 10 repairs and 4 protected days, and no other account was touched.

### Phone test fixes (2 Nov 2026)

**Changed**

- Voice now tells three cases apart. Misheard: high acts and shows "Heard: … → understood as: …", medium asks, and only then can the text be edited. A clear command for a habit that doesn't exist offers Create it and Cancel. Something unrelated gets an example and no edit box.
- `undo_habit` undoes a named habit's log today. Skip and shrink by name are in the test set with typos.
- The coach acts. The service decides with the fast model, and the app runs the result through the same core functions as voice, using the person's own login, so it can't reach another account. Clear requests are done with an Undo chip, and unclear ones ask. These are recorded as `ai_assisted`, and `undo_log` now takes a source so a coach undo of a tapped log reads the same.
- You has Theme: System, Light, Dark. It applies at once, is remembered, and the Next site has it in Settings.
- An allowed skip no longer lowers the identity score. PLAN.md updated.

**Checked**

- Voice set 62 of 63, with 0 wrong actions. Tests: core 226, mobile and UI 462, AI service 133, database 293.
- 13 browser checks with real Gemini and made-up data, covering "undi the read", "I did yoga", "I bought a red car", the coach logging and undoing with `ai_assisted`, and theme persistence. The Next theme was checked on the built site.
- Live push followed the usual procedure.

### Onboarding (2 Nov 2026)

**Changed**

- A new account goes through four steps before Today: pick or write an identity, create up to 3 habits with a minimum version, choose a reminder time, then a calm explanation of the streak rules.
- Accounts that already have habits skip it, and if the check fails the app goes to Today, so nobody can be stuck at a welcome screen.
- The identity and habits save one at a time, and a retry carries on from where it stopped, so a failed save can't make duplicates.
- Reminders are real: a daily local notification through `expo-notifications`, which works in Expo Go. The module loads only when it's needed, and a failure never blocks anyone. You now has the same picker, so the time can be changed later. Web saves the time but sends nothing.
- `users` gains `onboarded_at` and `reminder_time`, and existing accounts with habits were marked as onboarded.

**Checked**

- Unit tests for every step and failure, and 8 browser checks with a new account, at 390px light and 1200px dark, with screenshots viewed.
- The migration was pushed with the phone test fixes, and owner-only access to these columns was verified live.

**Not checked:** a notification actually arriving on a phone.

### Reminder fix (2 Nov 2026)

**Reported:** no permission prompt and no notification on a real phone.

**Cause:** not confirmed, because Expo Go can't be run here. These faults were real, and all are fixed: every failure was swallowed and the screen ignored the result, the Android channel was created at default importance so it wouldn't pop up, and without a handler a reminder that fires with the app open isn't shown.

**Changed:** results now reach the screen with the real reason. You has **Send a test reminder**, which fires in about 5 seconds, and **Open phone settings** once the phone won't ask again. The handler and a missing reminder are restored when the app opens.

**Not checked:** a notification arriving on a real phone. This still needs the phone test.

### Miss review, Sunday Review, Future-Self letter and Why card (2 Nov 2026)

PLAN.md only names these, so the details below are decisions, not spec.

**Changed**

- Miss review: the coach card for a slip opens a sheet with the person's Why and four one-tap reasons, then the coach replies. `coach_events` keeps the reason as `miss_review`, not the words.
- Sunday Review: a finished week's numbers, three wins and a mood line, saved to `reflections`, the same table as the web weekly review. It opens from a Sunday card and from Progress. On any day but Sunday it shows the last finished week.
- Future-Self letter: one a week, from the person a year from now, using only their real data. It's kept in `coach_events`, unlike chats, so it can be read again.
- Why card: shown in the miss review, and editable in You.
- Gemini's thinking spends from the same budget as the reply, which cut a letter off after one sentence. The adapter now adds room on top, so a token limit means the words people read.

**Checked**

- 6 browser checks with real Gemini and made-up data, covering the miss review, the review and the letter surviving a reload. The screenshots were viewed. No migration was needed.

**Not built from Phase 2:** preemptive nudges, peak hours, per-user AI cost limits, and a Sunday push. `why_image_url` isn't used.

### Reminder cause found (2 Nov 2026)

A terminal screenshot from the phone test settled it. On Android in Expo Go, `setNotificationChannelAsync` is rejected with a NullPointerException, and it ran before the permission request, so the prompt and the schedule were never reached. A public report describes the same failure in Expo Go. A failed channel no longer stops anything: the reminder carries on without a channel id, and Android uses Expo's fallback channel. A development build gets the real high-importance channel.

### Peak hours, nudges and AI cost limits (2 Nov 2026)

**Changed**

- Peak hours and hard weekdays per habit show in Progress, and the coach now reads `user_patterns`, which nothing used before. `get_habit_days` adds the local hour of a same-day log.
- Preemptive nudges follow the rules now in PLAN.md. They're local notifications, cancelled if the habit is logged first, and You can turn them off. Text is written on the phone, so they use no AI. The daily reminder and a nudge have separate ids, so neither can cancel the other.
- A daily per-person allowance covers chat, voice and letters, estimated from text length so it works for any provider. It's checked before a call, and 0 turns it off. `AI_USER_DAILY_TOKENS` defaults to 100,000.

**Checked**

- Tests: core, mobile, AI service and database all pass. Progress was checked in a browser on seeded data.
- Live push followed the usual procedure, and the +test account's history was re-seeded so its logs have realistic hours.

**Not checked:** a nudge firing on a real phone. The allowance is an estimate and doesn't count Gemini's thinking.

**Phase 2 is now complete, apart from the gate:** "Coach nudges lead to a log more often than plain reminders" needs real use to measure, and plain reminders aren't recorded yet.

### Android widget (2 Nov 2026)

**Changed**

- `react-native-android-widget` adds a home-screen Today widget, offered for the lock screen on Android versions that support it. It shows progress and up to 4 habits, open ones first. A tap logs the full version or takes it back, with the app closed, as source `widget`. "Log by voice" opens straight to the voice sheet.
- The app redraws it after each change, and Android refreshes it about every 30 minutes. Offline it shows the last list and says so.
- The native module is only loaded outside Expo Go, because importing it there throws.
- A `preview` build profile bundles the code inside the APK, because a widget runs with the app closed.

**Checked:** unit tests and generating the Android project. **Not checked:** the widget on a real phone, which needs the build.

**Not built:** an iPhone widget, which needs the paid Apple account, and lock-screen notification actions.

**Blank widget, found on a real phone:** the layout used a React Fragment, which `react-native-android-widget` can't read, so the build threw in the background and nothing was drawn. The tests had replaced the library with a stand-in, so they couldn't see it. A new test builds every widget state with the library's real tree builder, and a failure now draws "Open the app to see your habits" rather than nothing.

**Phone testing over adb (Realme RMX2189, Android 11):** first real-device checks by the agent. Confirmed: the widget draws, a tap logs with source `widget` and undo works, about 2 seconds warm and 5.5 from a frozen app, and the voice button opens the sheet. Found and fixed: Today stayed stale after a widget log because it only loaded on start, widget rows moved after a tap so a second tap could hit another habit, and bottom sheets sat under Android's navigation bar. A tap now shows at once and then confirms.

### Offline logging and simple phrases (3 Nov 2026)

**Changed**

- With no connection, logs from taps, voice, the coach, the widget and notifications queue on the phone, show as done, and sync on the next load. Today falls back to its last list for the same day. A log the server refuses later, such as after the back-log window closes, is dropped and the person is told.
- Plain phrases like "done with Read" match exact habit names on the phone, with no AI call. Anything less exact still goes to the parser, and two habits with the same name are never guessed between.

**Not checked:** airplane mode on a real phone, because it would cut the wireless adb connection.

**Not queued:** skips and repairs, which still need a connection.

### Notification buttons from a closed app, voice tile and rule cards (3 Nov 2026)

**Fixed**

- Done and Smaller version did nothing when the app had been closed. Android gives a background task the data as a JSON string, and the handler only read the unpacked form, so it exited without a word. The earlier pass had come from the in-app listener, not the task. Both forms are now read, a tap reaches the log once when both paths get it, and a button with no habit leaves a warning.
- A reminder tapped offline, before the app had opened that day, was lost because it had no date. It now queues for today.

**Added**

- An Android Quick Settings tile, "Log by voice", which opens the voice sheet.
- A card on Today the first time each streak rule comes up: Grace Day, repair, skip and back-log. One shows at a time, once each, remembered per device.
- 154 held-out voice phrases, 217 in all. They're never tuned against.

**Voice score:** 150 of 154 held out (97%), and 212 of 217 (98%) overall. Three of the four misses acted without asking. The harmful one, "on do gym" logging instead of undoing, is fixed and now asks first. These phrases are typed, not recorded, so the Phase 3 gate still needs real speech. Details are in `docs/voice-accuracy.md`.

**Checked on the phone:** Smaller version with the app killed logged the minimum, source `notification`, in about 4 seconds. Done with the app alive in the background made one `log_habit` call and cleared the notification.

**Tile and rule cards on the phone:** a real tap on the tile started the closed app and opened the voice sheet. The Grace Day card showed, Got it brought up the next card, and the Grace Day card stayed gone after a restart. `cmd statusbar click-tile` did nothing on this phone, so it can't stand in for a tap. The phone test found the back-log card counting skipped and repaired days as forgotten, which is now fixed, with that fix covered by unit tests only.

**Not checked:** the tile from a locked phone.

**Notification cap:** the plan's limit of 2 a day holds, with one daily reminder and at most one nudge. A Sunday notification must replace one of those.

**Tunnel Vision isn't built.** `PLAN.md` names it with a focus timer but doesn't say what it does, so it needs a decision. (Decided and built on 5 Nov, below.)

### Phone builds reach the AI service, and Realtime sync (5 Nov 2026)

**Fixed**

- Coach and voice failed on the preview build with "Coach isn't available right now". Release builds block plain `http`, and the AI service on the laptop is plain `http`. A config plugin now allows `http` to the one `EXPO_PUBLIC_AI_URL` host and adds nothing when that URL is `https`. Checked on the phone: a typed phrase got the AI's reply.
- Holding the mic and saying nothing now says "I didn't hear anything" instead of going quiet. Checked on the phone.
- Four streak tests started failing on 5 Nov. Writing Shrink levels directly stamps a settings version with the real date, and those tests ask about 2 to 4 Nov. A test helper now makes those settings cover the habit's whole life. App code is unchanged, because `create_habit` always starts a habit on the day it's made.

**Added**

- Realtime sync. A log from any device shows on an open Today screen, the widget and the web grid without a reload. The apps listen to `activity_events`, not `habit_logs`: Realtime checks inserts against the owner-only policy but sends deletes without it, which would show other people a row id. A burst of changes reloads once.
- Migration `20261105000000_realtime_activity.sql` adds `activity_events` to the Realtime publication, with tests that it is the only public table there and keeps RLS on.

**Found while testing:** supabase-js hands Realtime the sign-in token without waiting, so a channel opened just after sign-in joined as nobody and heard nothing. The token is now set before joining. Refreshed tokens still reach Realtime through supabase-js.

**Checked live:** the migration pushed after the dry run listed only that file. Two temporary users were made: the first got one reload for its log, the second got none, and the second could read none of the first user's activity or habits with the publishable key. Both users were deleted. The security advisor shows nothing new.

**Checked on the phone:** with Today open on the phone, a log on the web grid ticked the habit on the phone without a reload.

### Offline skips and repairs (5 Nov 2026)

**Changed:** skips and repairs now queue on the phone with no connection, like logs. That covers Today, voice ("skip meditation, I'm sick") and the coach. A queued skip shows as skipped with its reason, and a queued repair shows as done. Each is sent with its own call when the connection is back, and one the server refuses is dropped with the same "couldn't be saved" note. A queue saved by an older build still sends as logs.

**Limit:** the server takes a repair only on its repair day and goes by its own clock, so a repair made offline that syncs the next day is refused, and the person is told.

**Not checked:** on the phone, because airplane mode cuts the wireless adb connection.

### Streak chain: fracture, weld and Grace Day moments (5 Nov 2026)

**Added**

- The streak chain: one node per scheduled day with the habit card's own marks, joined by links that crack, settle into a quiet gap, or carry the approved stitched seam. On each Today card (last 7 scheduled days), on a new habit detail screen (last 30, opened from the chain or the long-press sheet), and still on Progress (last 14). On Progress and the web grid, holding or hovering a seam says what the repair took, for example "Repaired on Thu with 45 pages".
- Fracture, weld and Grace Day moments, timed as in the brief. They're drawn with `react-native-svg` and moved by Reanimated 4 on the UI thread, one timeline per moment. Each plays once and is remembered on the phone. A fresh install marks everything already there as seen. A miss whose repair day has passed settles quietly. Several at once become one Welcome back card instead.
- Reduced motion only crossfades, in 150 ms. A tap, long press or opening the detail jumps a moment to its end. Sparks are skipped on phones under 3 GB of memory. Haptics: one light tap for a crack, a success haptic when a weld's halves meet, none for a Grace Day.
- A weld glow token per identity colour, tested to be brighter than its accent, in the same hue, and not red, in both themes. The crack uses the existing warm grey `hollow` token.
- A hidden Animation Playground in the design review build, with fracture, weld, protected and Welcome back buttons, 0.25x slow motion, reduced motion, dark and low-end toggles, and a frame-rate readout. The review build installs as its own app, "Habit Tracker Review", so it never replaces the real one.
- PLAN.md now records the streak moments, the Welcome back card, and "Coach" as the placeholder name.

**Fixed while testing:** the crack's even zigzag read as an arrow at chain size on the phone, and is now an uneven line. A past repaired day on the web grid was a disabled button, which can't be hovered, so it now stays hoverable while its taps do nothing.

**Frame rate on the Realme RMX2189 (2.7 GB, so low-end, sparks off):** measured on the UI thread with Reanimated's frame callback, over three rounds after the first: fracture 58 to 59 fps, weld 53 to 59 fps, Grace Day 53 to 60 fps, with 0 to 3 long frames each. The first fracture after launch ran at 30 fps while it warmed up. Android's own frame stats for one weld: 82 frames, 6 that missed their deadline, 1 missed vsync, median 16 ms and 90th percentile 20 ms. Its headline "janky" figure of 40% is mostly flagged as high input latency, which is how adb's injected taps show up, not slow drawing.

**Frame rate on a Samsung Galaxy F23 (SM-E236B, Android 14, 5.3 GB, sparks on):** three rounds on the UI thread: fracture 59 to 61 fps, weld 57 to 59 fps, Grace Day 61 fps, with 0 or 1 long frames and no missed vsync. Android's frame stats counted 3 to 8 frames per moment past their deadline.

**Not checked:** a fracture or weld on the real app from real data. The first open marked existing cracks as seen, as designed, so the next real miss or repair is the first chance. The habit detail and Progress chains on the phone. Reduced motion with the phone's own setting, rather than the playground toggle.

### Tunnel Vision (5 Nov 2026)

**Added**

- A Focus action on today's cards, in the long-press sheet, and as a screen-reader action on the card. Everything else fades out over 250 ms and only that habit stays, centred, with a timer. Reduced motion is a plain fade.
- The timer is the habit's duration target, in minutes or hours, or 25 minutes, and can be changed before starting. A big tabular countdown with Pause and Stop. It runs by the clock, so sleeping or leaving the app never loses time.
- Finishing logs the full version, with the card's check-off and haptic, unless it was already logged. Stopping early asks "Log the minimum version?" with Yes, No and Keep going.
- The screen stays on (`expo-keep-awake`). The app's own notifications are held while focusing and shown when it ends. Esc on a keyboard and Android's back button step out: before starting they close it, and while running they ask the stop question.
- Migration `20261105000100_focus_events.sql`: `record_focus` writes `focus.started`, `focus.completed` and `focus.stopped` to `activity_events`, with the planned and elapsed seconds. It checks the habit is the caller's, accepts only those three kinds, a session of 1 minute to 4 hours and a fitting elapsed time, and caps a day at 200 so nothing can flood the history. Apps still can't write `activity_events` directly.

**Checked live:** the dry run listed only that migration. With two temporary users, the owner's start and stop were saved and readable only by the owner. An unknown kind, a stranger's write, a signed-out call and a direct insert were all refused. Both users were deleted. The security advisor's only new line is `record_focus` in the expected group of app functions.

**Limit:** notifications are held only while the app is open, which it is during focus because the screen stays on. If the person switches away, Android shows them as usual.

**Not checked:** on a phone. It needs the next build, and the phone was locked.

### Tunnel Vision locks the phone, and asks before logging (5 Nov 2026)

**Changed, at the user's request**

- While a focus timer runs, the phone stays in Tunnel Vision. A local native module (`mobile/modules/focus-lock`) runs a foreground service that keeps the countdown in an ongoing notification, on the lock screen too, and brings the app back whenever another app comes to the front, with the app open or closed. Calls, the dialer, emergency calls, the keyboard and the permission screen always get through. It needs **usage access** and **display over other apps**, which the setup step asks for before Start is available.
- The timer no longer logs on its own. When it runs out it asks "Time's up. Is Read done?". Yes logs the full version. Not yet offers "Focus again?" for the same length.
- "Done my work" finishes early, by tapping it or saying it while holding the mic. It's matched on the phone, in English and Hindi, and "not done" phrases never count.
- A session kept going with the app closed comes back on open, from its notification, or when the lock brings the app forward. A saved session for a habit that isn't on Today unlocks the phone, rather than trap it.

**Why this way:** an app that isn't the device owner can't truly freeze Android. Screen pinning needs no permissions, but it's off by default on many phones, a button gesture undoes it, and it can't carry on with the app closed. Usage access plus display over other apps is how screen-time apps keep you in, and it works when the app is closed. Play needs a clear disclosure for both permissions before release.

**Builds:** the EAS free plan ran out of Android builds for the month, so builds are now made on this Mac with `eas build --local`, using the same signing key, so they install over the existing app without losing the sign-in. The Android SDK is at `/opt/homebrew/share/android-commandlinetools`, about 3 GB. A first build took 52 minutes; with a warm cache about 23.

**Checked on a Samsung Galaxy F23 (Android 14), with the review app's Tunnel Vision on a sample habit:**

- The setup step showed the permissions, and **Allow usage access** opened Android's usage-access page. Start stayed disabled until they were granted. For the test they were granted over adb, for the review app only.
- During a session, **Home** and opening **Settings** both bounced straight back to Tunnel Vision, and so did **Recents**, so the app can't be swiped away while focusing.
- The foreground service ran with the countdown notification: "Focusing on Sample habit" with a live countdown, public on the lock screen.
- With the phone locked, the time ran out: the service stopped itself, Tunnel Vision came to the front and asked "Time's up. Is Sample habit done?" without logging. Not yet led to "Focus again?", and Not now closed it. Afterwards Home worked normally, so the lock lifts.

**Fixed from that test**

- Android hid the countdown because the app had no notification permission. The setup step now asks for notifications too, with the other two.
- The countdown's channel was low importance, which some phones hide on the lock screen as silent. It's now normal importance with no sound or vibration, on a new channel id.
- "Start 1 minutes" and "Focus 1 more minutes" now say "minute".

**Not checked:** the lock-screen countdown shown on screen, since I don't screenshot a lock screen with other notifications on it. Saying "done my work" out loud. A phone restart mid-session: the service doesn't come back by itself after a reboot, but the app picks the session up the next time it opens.

### Android install steps and the iPhone plan (5 Nov 2026)

- `docs/install-android.md`: installing a test build, the widget, the voice tile and Tunnel Vision's two permissions, step by step.
- Siri, the iPhone widgets and an iPhone focus lock need the paid Apple account, and Apple's Screen Time entitlement for the lock. They aren't written, because untestable iOS code could break the first iPhone build. `PLAN.md` says how they'll be built.

### Scheduled jobs (5 Nov 2026)

**Added**

- Three jobs as FastAPI endpoints under `/jobs`, protected by a shared `JOB_SECRET` compared in constant time, and off when it's empty:
  - `nightly-patterns` rebuilds each person's `pattern_snapshots` row, which only its owner can read.
  - `sunday-letters` writes the Future-Self letter from 18:00 on Sunday in each person's own timezone, from their own Sunday Review. It writes one a week, and on a free tier only for test accounts.
  - `reminders-and-nudges` sends the daily reminder and the preemptive nudge by push, by PLAN.md's rules: at risk under 90% over 14 days, 30 minutes before the usual hour from 5 or more same-day logs, an hour from the reminder, not after 3 ignored, and at most one a day.
- Every job is safe to run twice: work is claimed in `tracker.job_runs` first, and a failure gives the claim back. All job functions are `service_role` only.
- `pg_cron` schedules call the service through `pg_net`, reading its URL and secret from Vault. Until they're stored, the schedules do nothing.
- `push_tokens` holds each phone's push token, owner-only. **Phones don't register a token yet:** that needs Firebase Cloud Messaging set up on the Expo project, which needs a Firebase account. Until then the job finds no phone, records nothing, and the phone's own local reminders and nudges carry on.
- `npm run jobs` runs all three once against the service on this Mac, or one with `npm run jobs -- sunday-letters`. It creates `JOB_SECRET` in `backend/.env` the first time.
- `docs/hosting-options.md` compares Cloud Run, Fly.io, Railway and Render from their current pricing, and recommends Cloud Run.

**Checked locally:** 35 new database tests and 15 new service tests. Postgres called a local service through `pg_net` from Vault's URL, got HTTP 200, and the snapshot it wrote was in the database.

**Checked live:** the dry run listed only the two job migrations. The three schedules are registered, Vault is empty so they do nothing, and both new tables have row-level security. With two temporary users, a push token could be saved only for oneself and read by nobody else, each person saw only their own pattern snapshot, and signed-in and signed-out callers were refused the job functions. Both users were deleted. The live rebuild during that check also wrote a pattern snapshot for each real account, which is what the nightly job does. The security advisor shows nothing new.

### Analytics, off until the beta (5 Nov 2026)

**Added**

- `packages/core/src/analytics.ts`: a catalogue of events and a wrapper. It covers every log, undo, skip and repair with its source, whether it was a back-log and whether it waited offline; each onboarding step, with how many habits were saved by then; coach messages and their outcomes; voice use, with speech or typed, the language and the outcome; Tunnel Vision's start, finish and stop; and app opens, with days since the first open, for retention.
- No personal data. Every property is a fixed choice, a capped number or a yes/no, and anything else is dropped, so a habit name, transcript, coach text or account id passed by mistake never leaves the phone. A test checks the catalogue has no free-text fields. People are counted under a random install id, never their account.
- Off by default. It switches on only with `EXPO_PUBLIC_ANALYTICS=on` and a PostHog project key, and while off it stores and sends nothing. A PostHog sender is ready; no account has been made.
- Logging is counted in one place, the offline-aware tracker, so taps, voice, the coach, the widget and notifications are all counted the same way.

### Plans foundations (5 Nov 2026)

**Added**

- PLAN.md has a **Plans** section (Free, Pro, Ultra, Enterprise; pricing not decided) and a launch checklist line on Apple and Google in-app purchase, with RevenueCat worth considering.
- **Entitlements:** `packages/core/src/entitlements.ts` maps each plan to its features. `users.plan` (migration `20261105000300`) defaults to `free`, and people can read but never change it. The AI service refuses chat, letters, voice parsing and scheduled letters and nudges without the feature, with a calm "Available on Pro." Its copy of the map is checked against the app's by a test. Screens ask `useEntitlements().can(feature)`, never a plan name. On Free, the coach button and card, the Sunday letter and nudges show or skip calmly, and voice logs simple phrases on the phone. The matcher now also understands amounts, like "read 20 pages". The `+test` account is on Pro, and AI test accounts count as Pro on the server.
- **Themes as data:** a theme is a data file checked by `validateTheme`: structure, hex colours, all 8 identities, sensible type sizes, https-only assets, and readable text in both modes. A broken one falls back to the default. Today's look is `themes/default.ts`, the old tokens are derived from it, and `ThemeProvider` takes a `theme`.
- **Game history:** `activity_events` now records `habit_created`, `habit_archived` and `habit_restored`, and every existing habit got its `habit_created` at its real creation time. Each log event also carries its identity. With the logs' level, status, amount, source, actor and time, plus repairs, moves and focus sessions, that's what XP and levels need. Grace Days aren't events, because they're recalculated from the logs.

**Checked live:** the dry run listed only that migration. Afterwards one account (the test account) was on Pro and four on Free, all 11 habits had a start event, signed-in users couldn't update `plan` but could update their settings, and the security advisor showed nothing new.

### Tunnel Vision pins the phone instead of bouncing back (5 Nov 2026)

**Changed, at the user's request:** pressing Home or opening another app used to close Tunnel Vision for a moment before it came back. Now the phone is **screen pinned** while a session runs. Android turns off Home and Recents itself and shows its own message, so the app never closes. A test on the Samsung over adb showed Home staying in the app while pinned, and also that Android keeps the notification shade closed while pinned.

- The app-blocking service and its two permissions (usage access, display over other apps) are gone. Only notifications are asked for.
- Unpinning with Android's held gesture counts as Stop. If pinning never takes hold within 8 seconds, the screen says so calmly, with **Pin again** and **Open pinning settings**.
- The countdown notification follows the user's sketch: the app name and arrow from Android, the habit and its target ("Read 20 pages"), a big countdown, and **Pause**, **Stop** and **Done**. Pause and Resume work from the notification without opening the app. Stop and Done open the app to ask or log. Tapping a button on the lock screen asks for an unlock first. While pinned the shade is closed, so the buttons are for when the phone isn't pinned. The user chose this.

**Checked in the real app on the Samsung Galaxy F23 (local build, Android 14):** Start pinned the screen at once; this phone didn't ask first, and showed Android's own "App is pinned" message with how to unpin. Home, Recents and opening Settings all left Habit Tracker in front, checked 0.3 seconds after Home, with no closing. The countdown notification used the custom collapsed and expanded layouts, titled "Read 30 pages", on the normal-importance channel, public on the lock screen. When the minute ran out, the screen asked "Time's up. Is Read done?" without logging, the phone was already unpinned and the service had stopped, and Home went to the launcher normally afterwards.

**Not checked:** how the notification looks, and its buttons, because I don't open the shade with other people's notifications on it. Unpinning with the held gesture, and the voice "done my work".

### Pause unpins, and the notification works from the lock screen (5 Nov 2026)

**Changed, at the user's request**

- Pause, Resume, Stop and Done in the focus notification now run in the background, on the lock screen too, without unlocking. Pause and Resume change the timer directly. Stop and Done are saved for the app, which picks them up within a quarter of a second: Done logs the habit, and Stop's "Log the minimum version?" waits in the app.
- Pause unpins, so other apps and the notification shade can be used. Resume pins again; on the Samsung that shows Samsung's own pin request first, then pins about 3 seconds later.

**Found on the Samsung:** Pause locked the phone. That's Samsung's own behaviour when any app unpins ("Lock phone when unpinning" in the Pin windows settings), and no app can change it. Tunnel Vision now notices when a pause locked the phone, checking for 4 seconds because the lock comes down slowly, and says once how to turn that setting off, with **Open settings** and **Got it**. Checked on the phone: after Pause the phone locked, and on waking, the hint was showing.

**Not checked:** tapping the notification's buttons on the lock screen. This Samsung didn't draw the app's notification views on its lock screen, so its lock-screen notifications appear to be set to icons or collapsed. To see the buttons there: Settings → Lock screen → Notifications → **Details** with **Show content** on, then pull the notification down to expand it.

### Resume pins again, Done confirms, no Stop in the notification (5 Nov 2026)

**Changed, at the user's request**

- **Resume from the notification** used to restart the timer in the background, where Android won't let an app pin, so other apps stayed open. It now opens a small invisible screen (`FocusResumeActivity`) that restarts the timer and brings Habit Tracker forward. The app sees the timer running and pins. Whenever the app comes back with the timer running and the phone unpinned, it pins again. A first try sent an app link instead, which Android didn't deliver to the already-running app ("its current task has been brought to the front"), so that approach was dropped.
- **Done from the notification** removes the countdown at once, shows "Your work is done. Read is logged. Nicely focused." for 5 seconds, and the app logs the habit. If the app was closed and the day has moved on, it's logged for the day the session was on.
- **Stop is gone from the notification.** It has the habit, the big countdown, and Pause or Resume, and Done. Stop stays in the app.

**Checked on the Samsung, in the real app:** Start pinned the phone, after Samsung's own "App is pinned" sheet with OK, which Samsung shows every time an app pins. Pause unpinned it and Home worked. In the shade, the expanded notification showed "Read 30 pages", the big paused time 04:51, and only **Resume** and **Done**. Tapping **Resume** brought the app back, Samsung's pin sheet appeared, and after OK the phone was pinned. Home and Settings then stayed in Habit Tracker, with the timer running.

**Not checked:** Done from the notification. Afterwards the app had no notifications and the timer service had stopped, which is what Done leaves, but the tap wasn't observed.

### Notification centred, and eleven standard themes (6 Nov 2026)

**Notification, at the user's request:** the expanded countdown looked pushed to the right. From Android 12 the notification body starts past the app icon but ends near the edge, so centred content sat right of the middle. The expanded layout now has a balancing end padding (`focus_balance_end`, 0 before Android 12). Measured on the Samsung over adb, reading only this app's views: with stock Android's 36dp the content still sat 14px right (One UI's inset is wider), so it's 46dp, which centres it there.

**Themes, the Free plan's "10+ normal themes, each customizable":**

- `packages/core/src/themes/standard.ts` has 11: Warm neutral (the default), Paper, Sage, Dusk, Sand, Blush, Slate, Lavender, Linen, Moss and Ink. Each tints the default's neutrals with its own hue at the same lightness, so text and accents stay exactly as readable, and pairs them with a typeface and corner shape. `tokens.test.ts` now holds every theme, in both modes, to the default's rules: contrast, the hollow dot, colour-blind separation, no red, and the weld glow.
- Customisation (`themeChoice.ts`): another bundled typeface (Figtree, Nunito, Lora, Atkinson Hyperlegible), and any identity's colour from 12 swatches (the 8 defaults plus Jade, Indigo, Orchid and Olive), each checked on every theme. `buildTheme` validates the result and falls back if anything fails; a saved choice that names something unknown is cleaned up.
- The choice is saved on the device (`theme-choice`), on the phone and on the web. It isn't synced between devices yet, which would need a column on `users`.
- `ThemePicker` (shared) sits under Theme on You and in web Settings: theme tiles drawn in each theme's own colours and typeface, typeface chips, and identity colours behind a button.
- Components took corner radii and text field styles from the default directly; they now take them from the theme, so a theme's shape shows.

**Checked:** core 1001, web 28 and mobile 846 tests pass, and lint has no errors. In Chrome, a saved Sage + Lora choice gave the login page Sage's canvas, Lora and Sage's rounder corners, and Ink in dark mode switched to Atkinson Hyperlegible.

**Checked on the Samsung, in the real app (local build):** the expanded notification's content now spans 204 to 876 px on a 1080 px screen, so it's centred. On You, all 11 theme tiles, the typeface chips and Change identity colours show; picking Blush recoloured the app and switched to Nunito at once. The phone was set back to System and Warm neutral afterwards, and the test sessions were stopped without logging.

**Not covered:** the Android home-screen widget keeps the default colours, since it's drawn outside the app. Colours other than the identity accents (the neutrals) change by picking a theme, not one by one.

### Voice: the spoken test and the phone matcher (6 Nov 2026)

The 200-phrase set already existed (217 typed phrases, 98% on 3 Nov). What PLAN.md's gate still needed is real speech, and the Free matcher had never been scored.

- **Phone matcher scored:** on all 220 typed phrases it acts on 14, all correctly, and never on half of a two-habit sentence. A test keeps it that way.
- **Typed re-run on today's model:** 150 of 153 held out (98%), the same three misses as on 3 Nov, so nothing has slipped.
- **Spoken test:** test builds have **Voice test (test builds only)** on You. It shows 206 phrases one at a time (138 held out, 68 new and never tuned against), records with the same recogniser, languages and word hints as the voice sheet, and sends what was heard to the AI service's new `/voice/samples`. That endpoint is off unless `VOICE_SAMPLES_PATH` is set, takes test accounts only, never calls a model, and keeps only phrase id, transcript and language, in a gitignored file. `voice_accuracy.py --spoken` scores the transcripts with the real parser. Steps are in `docs/voice-accuracy.md`.
- Preview builds turn the screen on with `EXPO_PUBLIC_VOICE_TEST=1`; other builds never show it.

**Checked:** core 1009, web 28, mobile 856 and backend 184 tests pass, and lint has no errors. On the Samsung, the new build's Voice test opened on "Read 15 pages", showing 0 of 206. The service on this Mac answers at the phone's address.

**Not done:** the recordings themselves, which need the user's voice. Until they're scored, the Phase 3 gate is passed on typed phrases only.

**Theme changes while testing:** I saw the theme change between my checks and suspected scrolling. Retested one swipe at a time: scrolling changes nothing. The user had been trying themes, as asked, and I had set their pick back to Warm neutral. It's now left as they chose it.

### Hindi voice stopped at once, and the first spoken scores (6 Nov 2026)

**Found by the user, from phrase 114 of the spoken test:** Hindi phrases stopped listening while the button was still held. The phone's log showed the cause: on-device recognition was asked for, and the Hindi pack isn't downloaded ("Failed to get language pack of required locale", `language-not-supported`). The app didn't listen for that error, so it looked like the button letting go. Real voice logging had the same problem with Hindi.

**Fix:** that error now switches to the phone's online recogniser while they're still holding, and the language skips on-device from then on (`mobile/src/voice/speech.ts`, with tests). Checked on the Samsung: the online recogniser started 0.2 seconds after the error, in Hindi, and listened for the whole hold.

**Spoken score so far (English and Hinglish, phrases 1 to 113):** 111 of 114 recordings right (97%), with 3 model outages rerun. The phone heard 85 of 114 word for word. The misses:

| Said | Heard | Result |
| --- | --- | --- |
| "I got through some of my novel" | the same | Shrink Read, as when typed |
| "aaj sirf thoda sa padha" | the same | Study instead of Read, without asking, as when typed |
| "tick off study" | "take off study" | **Undid Study, without asking.** New, and caused by the mishearing |

The new one matters most: a mishearing that reverses a log without asking. It's in the held-out set, so it isn't tuned against; it's the first thing to fix once the spoken run is complete.

### The full spoken test, and two voice rules (6 Nov 2026)

**All 206 phrases recorded** by the user on the Samsung. The phone heard 148 word for word. The parser got 200 of 206 (97%), including all 16 Hindi phrases. Four misses acted without asking.

**Fixes, both in `backend/app/voice.py` with tests:**

- An undo goes ahead without asking only when an undo word was said (undo, cancel, take back, remove, delete, wapas, hata and similar). Otherwise it asks first. This covers the miss where "tick off study" was heard as "take off study" and Study was undone.
- `log_amount` on a yes/no habit becomes a plain log. "ten minutes of meditation done" and "studied for two hours" now pass.

**Rescored with the live model** (the misses plus every undo phrase in all three sets, 69 phrases): both fixes work, and no plainly worded undo was held back. With the fixes the spoken score is **202 of 206 (98%)**. Two phrases still act wrongly without asking, and they do the same when typed:

- "I got through some of my novel" logs the small version of Read.
- "aaj sirf thoda sa padha" logs Study instead of Read.

Details are in `docs/voice-accuracy.md`.

### No habit limit, and the new habit settings (7 Nov 2026)

Part 1 of the habit form work. PLAN.md and `docs/handoff/habit-creation.md` were updated first.

- **Limit removed:** the 3-habit cap and the "2 consistent weeks" unlock are gone from the server (`habit_allowance`, `active_habits` and `get_habit_allowance` dropped), from core, from the form's At the limit state and from onboarding. After the 6th active habit, Today shows "Starting with a few makes them stick." once. It's remembered in the new `users.seen_tips`, so it shows once on every device, and it never blocks anything.
- **New settings, stored and dated:** `time_of_day`, `reminder_time`, `frequency` (specific days or times per week, 1 to 6), `per_week`, `ends_on` and `previous_run_id` on habits. Time of day, frequency, times per week and the end date are in `habit_versions`, so edits apply from today. `create_habit` and `update_habit` take them, and the API sends them. Nothing uses them yet: times per week and ending get their rules in a later part, and Today's sections come last.
- **Migration:** `20261107000000_open_habits_and_new_settings.sql`.
  - Locally, 358 SQL tests pass. The new ones cover no limit (12 habits), every new setting, the rule against 7 a week, an end before the start, switching frequency (dated), and tips.
  - The dry run against live listed only this migration, and the push applied it.
  - Live, with two temporary users who were then deleted, 13 checks passed: create with the new settings, read, edit, 8 habits saved, the allowance function gone, tip remembered, logging and Today working. Another user can't read or edit the habit; a user sees only their own profile; the publishable key alone reads no habits and can't mark tips.
  - `rls_auto_enable()` and the `ensure_rls` trigger are still on live, and RLS is on for every public table.
- **Tests:** core 1011, mobile 864 (including the Today tip and an onboarding test with no limit), web 28, backend 195. Lint is unchanged: 11 old warnings.
- **Existing data (part 6):** existing habits got "anytime" and "specific days". Assigning each one a real time of day, and parsing its minimum text, needs the habit library. That runs as a backfill once the library exists (part 4).

### The built-in habit library (7 Nov 2026)

Part 4 of the habit form work.

- **`packages/core/src/habitLibrary.json`** has 156 common habits, built from one table by `packages/core/scripts/build-habit-library.py`. Each has:
  - a name and English and Hinglish synonyms;
  - type, target and unit;
  - minimum (description and amount) and setup;
  - specific days or times per week, with a one-line reason;
  - time of day, identity and voice aliases.
  - The 30-day challenge also offers an end after 30 days, which is never switched on by itself.
- **`habitLibrary.ts`:**
  - `matchLibrary(name)` drops amounts, units and how-often words ("Run 20 km daily" is Run), then tries exact names and synonyms, then the longest synonym inside the name.
  - `suggestNames(text)` gives the live suggestions while typing.
- **`units.ts`:** units with what people type and say (Hindi too), conversions within distance, time and volume, and daily caps for suggestions. Sleep and fasting have their own caps: 10 and 16 hours.
- **Tests (202 new):**
  - Every entry is checked against the server's rules.
  - No target is above its cap, and intense exercise (run, workout, strength, HIIT, cycling, swimming, pull-ups, marathon) is 4 times a week or fewer.
  - No name belongs to two habits. Writing this check found 18 clashes, which were fixed.
  - 15 English and 10 Hinglish names match (`paani peena`, `kasrat`, `padhai`, `dhyan`, `kitab padhna`), and unknown names match nothing.
  - Unit conversion, and units that don't mix ("lines" for pages).
- **Moved:** the backfill of existing habits runs at the end of part 3, not here. It needs part 3's minimum decoding and its AI suggestions for Pro test users.
- **Tests:** core 1213, web 28. Core and mobile typecheck.

### The new habit form, per-habit reminders, and existing habits filled in (7 Nov 2026)

Part 3 of the habit form work, with part 6's backfill.

**Creating a habit** (`mobile/src/screens/HabitFormScreen.tsx`, `mobile/src/hooks/useHabitForm.ts`, `mobile/src/habits/`):
- **The form:**
  - Name, with live suggestion chips. "Run 20 km" saves as Run with a 20 km target, and the form says so.
  - Target, hidden for yes/no.
  - Days: Specific days, or Times per week from 1 to 6 (pressing past 6 switches to every day). Shown with the suggestion's reason.
  - Time of day, as four chips.
  - Minimum version, with its decoded amount as a chip to confirm or turn down.
  - End this habit: off by default; after N days or on a date. A "30-day challenge" offers 30 days but never turns it on.
- **"We set these up for you":** type and unit, identity, reminder, setup level and voice names. "Accept all", or tap a line to change it in a sheet. The identity is never asked for.
- **Suggestions follow the name** into every field the person hasn't changed. A time named in the habit wins ("Evening run" is in the evening).
- **Edit** keeps the same fields, with identity, full version, minimum target, setup, reminder, voice names and milestone under "More".
- **Core, `habitSetup.ts`:** `parseHabitName`, `parseAmount` (ranges use the lower number; "10,000" and "10k steps" work), `decodeMinimum` (converts units, and keeps other units as a description), `suggestSetup` (the library, then parsing) and `safetyCheck` (a gentler start with a calm note above the caps; intense exercise always keeps rest days). Also `fromAiSuggestion`, which checks every field the AI sends; `endsAfterDays`; and `reviewLines`.
- **Pro:**
  - The new `POST /habits/suggest` (`backend/app/habit_setup.py`) needs the new `ai.setup` entitlement and is rate-limited. The app asks it only for names the library doesn't know, after 3 letters and a 600 ms pause, with answers cached in the app and on the service.
  - The service checks and caps every field again. If there's no answer it says it's unavailable, and the app keeps its own values.
  - Free never sends a request: nothing is sent until the plan is known.
  - Saving never waits for the AI. Tests cover the AI being slow, down and refused.
- **Live model (Gemini free tier, made-up names):**
  - Answers took 1.6 to 8 seconds, and two of the first five timed out at 25 seconds.
  - So the under-1.5-second target holds for the library and parsing, which answer at once, but not for AI suggestions on the free tier. The form never waits for them.
  - "Run 60 km every day" came back as 3 km, 3 times a week, with a calm note.
  - Units are now normalised ("minutes" becomes "min"), and the prompt asks for no note unless the goal is risky.
  - Calligraphy was still put under an existing "The Reader" identity, so identity picking from existing identities is loose.

**Onboarding:** the identity step is gone. Steps are now habits, reminders, then the rules. Each first habit is set up from the library like the form, with its own identity, made once per name; the minimum is suggested when left blank. There's no limit on how many habits.

**Reminders:**
- Each habit reminds at its own time, planned a week ahead and capped at 56 (iPhone keeps 64).
- They're refreshed on opening the app and whenever Today changes, so a done habit stops reminding. They carry the habit's Done button.
- Times-per-week habits remind any day, and an ended habit stops.
- The old single daily reminder is cancelled when found. The You screen now explains the per-habit reminders and has "Turn on reminders"; onboarding has the same choice.
- A nudge never goes to a habit whose own reminder is within an hour, and still goes to another habit.

**Existing habits on live (part 6):**
- All 11 test habits matched the library, so none needed the AI.
- `backfillHabit` in core (tested) gave each a time of day, on the habit and all its versions. The one count habit's "2 pages" became a structured 2-page minimum, dated from today.
- No log was changed: 183 before and after.

**Tests:** core 1286, mobile 864 (form 81 per platform, onboarding 40, reminders 30, shared form 18), backend 210, web 28. Lint is unchanged: 11 old warnings.

### Smart partial logging (7 Nov 2026)

Part 5 of the habit form work.

- **Server** (migrations `20261107000100_partial_status.sql` and `20261107000200_partial_logging.sql`):
  - `add_amount` adds to the day's total. The status comes from that total against the day's dated minimum and target: `partial` below the minimum (noted, not counted), done at the minimum, done in full at the target.
  - Units convert through `tracker.units`, the same table as `units.ts`; a core test checks every word matches. A unit that can't convert logs nothing, and the reply says so.
  - When the total reaches 1.5x the missed day's target, the miss is repaired.
  - `remove_amount` undoes one added amount, and takes a repair back if the total drops below it.
  - A tap raises the total to its level's target and never lowers it; a tap on minimum stays full if the total already is.
  - Streaks, Grace Days and the identity score see a partial day as not done. The Forecaster counts its amount.
- **App:**
  - The long-press sheet has "Add an amount" ("3", "2-3 pages", "500 m").
  - The card shows "1 of 10 pages so far".
  - Every reply says where the day stands and what's left, e.g. "Read: 1 of 10 pages, 1 more for your minimum." or "That's below your minimum: lines can't count toward pages."
  - Voice and the coach go through `addAmount`, and undo takes back just that amount. Offline, amounts queue and add up.
  - The phone matcher handles ranges, "read 8 more" and convertible units. It leaves a unit of another kind ("read 20 minutes" for pages) to the parser.
- **Voice:** `log_amount` carries the unit as said. A new held-out set of 20 partial-logging phrases scored 19 of 20 with the live model. The miss was "more" given as a unit, which is now fixed and rescored (see `docs/voice-accuracy.md`).
- **Live:**
  - The dry run listed only the two migrations, and the push applied both.
  - 12 checks passed with temporary users, who were then deleted: 1 page partial, 3 the minimum, 2 lines not counted, 11 full, undo back to 3, a tap raising it to 10. Another user can't add to it or read its logs, the publishable key alone can't add amounts, and the units table isn't reachable.
- **Tests:** SQL 387 (32 new: accumulation, below the minimum, a miss, units, no-minimum habits, repair by total and its undo, dated targets). Core 1304, mobile 876, backend 216, web 28. Lint is unchanged.

### Times-per-week habits and ending a habit (7 Nov 2026)

Part W of the habit form work: migration `20261107000300_weekly_habits_and_ending.sql`.

- **Times per week:**
  - **Days:** a times-per-week habit is never due on a single day, so no day of it is ever a miss, and the day-based streak and Grace code never see it.
  - **Weeks:** Monday to Sunday on the person's own dates, closing with Sunday's 24-hour back-log. A week is met, pending, protected (by a Grace Day), repaired (one extra session the next week, unless the week before was missed too) or missed.
  - **Sessions:** a day done at any level, once a day at most; a day below the minimum isn't one.
  - **Part-weeks:** a week the habit starts or ends in part-way asks only as many as it has days.
  - **Streak:** counted in weeks.
  - **Grace Days:** a missed week takes one on its last day. A met week counts as 7 consistent days, so someone with only times-per-week habits still earns them. A repaired week keeps the run going; a missed one breaks it, and a covered one resets the count, as a protected day does. PLAN.md says so now.
  - **Progress:** sessions show as done. In a week that ended short, the days from when the quota went out of reach show its outcome; other days are left out, so nothing counts them. The Forecaster uses sessions a week, and the Sunday summary says "3 of 4 times".
  - **Switching:** moving between specific days and times per week is dated.
- **Today:** "This week: 2 of 4", or a calm "2 more this week, 3 days left" when it's tight, then "Done for this week" until Monday, when another session can still be logged.
  - The streak shows in weeks.
  - There's no day chain and nothing to skip.
  - Reminders go quiet for the rest of the week once the quota is met.
- **Ending:**
  - After its end a habit isn't due, is never missed, can't be logged and leaves Today; its reminders stop.
  - It's listed under Completed habits on the You screen with days done, best streak and total amount.
  - Today celebrates it once, remembered per habit on the server.
  - Restart makes a new run from today with the same settings and length, linked to the old one, whose history is kept. A running habit can't be restarted.
- **Live:**
  - The dry run listed only this migration, and the push applied it.
  - 10 checks passed with temporary users, who were then deleted. A 4-times-a-week Workout started on a Saturday showed "1 of 2", the part-week quota. Progress saw the session and streaks still worked. A habit ending today wasn't yet completed and couldn't be restarted. Another user couldn't restart it or see anything of it, and the publishable key alone got nothing.
- **Tests:**
  - SQL 431 (44 new: quota met early, met with minimum sessions, extra sessions, two sessions on one day, a Grace-covered week, a repaired week, two misses in a row, part-weeks, timezone week boundaries, switching frequency, ending, no misses after the end, restart keeping history).
  - Core 1313, mobile 888, backend 216, web 28. Lint is unchanged.
- **Known:** the SQL suite now takes 14 seconds, up from 7, because every day check also reads the habit's dated settings. Worth watching as data grows.

### Time of day on Today: started (7 Nov 2026)

Part 2 of the habit form work, partly done.

- **Done:**
  - Today is grouped into Morning, Afternoon, Evening and Anytime (`groupByTimeOfDay`), in reminder order, with empty sections hidden.
  - `useToday().moveTo` changes a habit's time of day, from today on. A reminder still at the old default moves with it.
  - The Pro suggestion logic, `timeOfDayMove`, works from peak hours, and a "Keep" is remembered.
  - The drag gesture component, `mobile/src/today/DragToMove.tsx`, is written but not yet wired into Today.
- **Not done yet:**
  - Wiring the drag into Today, with all four sections as drop targets while dragging.
  - "Move to…" in the long-press sheet.
  - The suggestion card on Today.
  - A preview build and the phone checklist.
- **Tests:** core 1317, mobile screens 492.

### Time of day on Today: finished (7 Nov 2026)

The rest of part 2.

- **Drag:**
  - Long-press a card and move it up or down to another part of the day (`mobile/src/today/DragToMove.tsx`).
  - While dragging, all four sections show, an empty one as "Move here", and the page doesn't scroll. Letting go drops the card into the section under the finger, or the nearest one.
  - A long press without moving still opens the sheet, and it closes when a drag starts.
- **"Move to…":** the long-press sheet has "Move to Morning" and the others, for anyone who can't drag.
- **Moves:** they're dated, from today. A reminder still at the old part's default moves to the new part's; one set by hand stays.
- **Pro suggestion:** "You usually do Run in the evening. Move it there?", with Move and Keep, from peak hours (5 or more same-day logs). It moves only on Move, and a Keep is remembered on the server. It isn't shown until the plan has loaded, so Free never sees it.
- **Lint fix:** the React Compiler gave up on Today when a drop callback read a ref, so the section views are kept in a stable Map instead.
- **Tests:** core 1318, mobile 896 (new: Move to, a reminder moving with it or staying, Move and Keep). The drag gesture itself needs real touches, so it's on the phone checklist.

### Streak animations for the new habits (8 Nov 2026)

The existing fracture, weld and Grace Day shimmer, extended to times-per-week habits, days below the minimum and habits that end. Chosen by the user from three options.

- **Times-per-week habits:** their chain is of weeks, each node a Monday (`buildWeekChain`, from the new `get_week_statuses`; migration `20261108000000_week_chain.sql`). A met week is done, a missed week cracks, a covered week shimmers, and a week repaired by an extra session the next week welds.
  - The same moments play, once each, through the same planner.
  - The words are in weeks: "Missed the week of 2 Nov · Repair next week", "How to repair: 5 sessions next week, one more than it asks", "Welded. 3-week streak.", "Repaired the next week with 5 sessions".
  - The chain is back on their Today card, on the habit detail (last 12 weeks, with streak and longest in weeks) and in Progress.
- **A day below the minimum:** its node carries a small accent dot, larger the further it got (10% to 90% of the target). Screen readers hear "partly done".
- **A habit that ends:** a new, calm "finish" moment: one soft light along the whole chain, then an end cap after the last node, 700 ms, with no haptic and a crossfade under reduced motion. The one-time celebration on Today now plays it on the habit's own chain, with "Finished. 24 days done." Ended chains keep the cap wherever they're drawn.
- **Animation Playground:** a Finish button, a partial day with a finished chain, and a chain of weeks in the gallery.
- **Live:** the dry run listed only this migration. 4 checks passed with temporary users, who were then deleted: this week with its session, nothing for another user, nothing with the publishable key alone, and the range capped.
- **Tests:** SQL 436, core 1328, mobile 906. Lint is unchanged.

### Tunnel Vision fitted to amounts (8 Nov 2026)

Chosen by the user from three options: fit the existing Tunnel Vision to the new habits.

- **A duration habit counts focused time:**
  - Finishing a focus adds the minutes focused to the day, in the habit's own unit (30 minutes is 0.5 for a habit in hours). A 25-minute focus on a 60-minute Study no longer logs the whole hour.
  - The reply says where the day stands, through the same progress line as other amounts.
  - The timer starts at what's left today: 25 minutes after 35 of 60 are done, or the whole target if it's done already.
  - Stopping early asks "Add the 12 minutes you focused?" instead of "Log the minimum version?".
- **Other habits are unchanged:** yes/no and count habits are logged as done, and a times-per-week habit logs a session.
- **Known:** a "Done" tapped in the notification while the app is closed, for a session whose habit is no longer on Today, still logs the habit as done rather than adding minutes. It's rare: the session has to outlive its day.
- **Tests:** core 1332 (focus helpers), mobile 914 (the timer starting at what's left, finishing, stopping early, hours). Lint is unchanged.

### Dragging habits on Today (8 Nov 2026)

Asked for by the user: no "Move to…" options in the long-press sheet. Instead, hold a card and drag it, while the other cards make room with a bouncy animation.

- **The drag:**
  - Hold a card, then move it up or down. It lifts slightly (3% larger, with a soft shadow) and follows the finger.
  - Every card and section title it passes slides out of the way on a soft, bouncy spring (`mobile/src/today/useDragBoard.ts`).
  - Letting go, it springs into its place, and the new section and order are saved.
  - Letting go without moving still opens the long-press sheet, and the page doesn't scroll while dragging.
- **Where it lands:** a pure function, `dragTarget` in `packages/core/src/dragOrder.ts`, works out the place and how far everything moves, and is tested on its own.
  - It can land between any two cards, or into another part of the day.
  - Habits keep the order they're dragged into (new `habits.sort_order` and `set_habit_order`; migration `20261108000100_habit_order.sql`), then go by reminder time.
  - Order isn't dated: it's only where a card sits.
- **Every part of the day is shown:** an empty one has a quiet line ("Nothing in the afternoon yet"), so there's always somewhere to drop. Showing them only during a drag would have made the cards jump away from the finger. PLAN.md says so now.
- **Without dragging:** the habit's edit screen still has its time-of-day chips.
- **Live:**
  - The dry run listed only this migration, and the push applied it.
  - 3 checks passed with temporary users, who were then deleted: an evening section kept the order it was given, another user couldn't reorder it, and the publishable key alone couldn't either.
- **Tests:** SQL 438, core 1340 (the drag math), mobile 920 (the drag board's springs and landing, no "Move to", empty sections). The gesture itself needs a real finger, so it's on the phone checklist.

### Analytics, part 1: the data and the metrics (8 Nov 2026)

The first part of the analytics section the user asked for: the numbers, with tests, before any screen. The design went into PLAN.md ("Analytics") first.

- **In the database** (`20261108000200_analytics.sql`):
  - `get_analytics(from, to)` returns every habit's days and weeks over a range, with streaks over the whole history and the Grace Days spent.
  - The result is cached (`tracker.analytics_cache`), keyed by a fingerprint of everything it depends on, including the date, so days that close are seen. Entries older than 2 days are cleared. Ranges over about two years are refused.
  - Times-per-week habits are judged by the week, all weeks at once. A test checks every fixture week against `week_status`, its quota and its sessions, and the streaks against `streak_stats` and `week_streak_stats`.
- **Faster Grace Days** (`20261108000150_faster_settle.sql`):
  - Building the first analytics for a year of 20 habits took 75 s, mostly in `settle`, which recounted each habit's history on every day.
  - `tracker.day_facts` now works out every habit's raw status over a range in one query, and `settle` walks the days once, keeping its counts. The rules are unchanged: a test checks `day_facts` against `day_status` on every fixture day, and every earlier Grace Day test still passes.
  - **Now:** a year of 20 habits loads cold in 0.83 s on the local database (Grace Days 0.58 s, analytics 0.21 s), and 9 ms from the cache. The target was under 1 s.
- **In core** (`packages/core/src/metrics.ts`): consistency (full and minimum rates, strength, streaks, repairs, Grace Days, recovery speed, skips and reasons), volume (totals, averages, target hit rate, personal bests, milestones), timing (by hour and weekday, log sources, reminder to completion), headline cards and the previous-period comparison, ranking, the weekly bars and helpful habit pairs.
  - Habit strength is `s = s·k + v·(1−k)`, as PLAN.md documents. Weekly habits count in weeks. Partial days are shown but never counted. Repaired and protected stay apart.
- **Test history** (`backend/scripts/seed_test_history.py`): now 120 days, still +test accounts only. It has good and bad weeks, Wednesdays that slip and aren't made up, one amount habit whose target is too high (it mostly reaches its minimum, rarely the target, and is sometimes short), times-per-week sessions, varied skip reasons and log sources.
  - A local run on a throwaway +test account: Wednesday was the weakest day for both daily habits (41% and 71%); the stretched Read reached its target 13 times in 120 days.
- **Live:**
  - The dry run listed only these two migrations, and the push applied them.
  - 8 checks passed with two temporary users, who were then deleted: a log was written; analytics read it back; the second read came from the cache; the other user's analytics had none of it, nor could they read the logs; the publishable key alone got neither; a too-long range was refused.
  - `rls_auto_enable` and the `ensure_rls` trigger are still there. The cache table is private like the other tracker tables: not exposed, no grants.
  - Each call took about 1 s from here (live is in eu-west-1), cached or not, so most of that time is the round trip.
- **Tests:** SQL 454, core 1368 (28 for the metrics), mobile 920, frontend 28, backend 216. There's no screen yet, so nothing changes on the phone.

### Analytics, part 2: Habit detail (8 Nov 2026)

Tapping a habit's chain, or "Streak and details" in the long-press sheet, opens the new Habit detail. It's simple and functional for now, as asked.

- **What's on it, top to bottom:**
  - A range picker: 7 days, 30 days (the default), 90 days, 1 year, all time.
  - Four tiles: strength (out of 100), completion with "25 of 29 days", current streak, best streak.
  - The strength line. Tap it for any day's value.
  - Day by day: a bar for each day, grouped by week, with a ring under each week. Full is the identity colour; minimum is the same colour, lighter; a day due but not done is a quiet baseline. Tap a bar or a ring for its numbers.
  - Consistency: full and minimum rates, full vs minimum, repaired, Grace Days used, back on track after a miss, skipped, below the minimum ("shown, not counted"), and the top skip reasons. A times-per-week habit shows weeks met, repaired, protected and missed instead.
  - Amounts, for count and duration habits: total, daily and weekly averages, target reached, best day, best week, milestones, and the Compound Forecaster.
  - When it gets done: completion by weekday as labelled bars, a weekday × hour heatmap (tap a square), how it's logged, and the time from reminder to done.
  - The year heatmap (now tappable here and on Progress), then the streak chain and past streaks.
- **How it loads:** one call fetches a year (cached on the server), so changing the range is instant. Strength is worked out over the whole year, so a 7-day range starts where the habit really was, not at zero. "All time" loads up to two years, only when chosen.
- **It opens from anywhere:** it needs only the habit's id, so the Overview's ranking can open it next. For that, analytics now returns each habit's target and schedule (migration `20261108000300_analytics_habit_settings.sql`, which also clears the cache).
- **Empty states teach:** "Strength grows a little with every day you log…", "Log on the day itself a few times, and your usual time shows up here."
- **No red anywhere:** every colour is a theme token or the habit's identity colour.
- **Not yet:** insights come in part 5, with the server-checked Pro entitlement.
- **Live:**
  - The dry run listed only this migration, and the push applied it.
  - 9 checks passed with temporary users, who were then deleted, including that each habit now comes with its target and schedule. Calls took about 0.23 s.
  - `rls_auto_enable` and `ensure_rls` are still there.
  - The +test account was filled with the 120-day history: 4 habits; Read is the one with the target set too high.
- **Tests:** SQL 455, core 1382 (the Habit detail wording, ranges, the hour grid, bar labels, weekly sessions in the bars), mobile 938 (the screen: ranges without reloading, all time, the weak weekday, amounts, weekly habits, empty states, errors), frontend 28, backend 216.

### Analytics, part 3: the Overview (8 Nov 2026)

The Progress tab is now the analytics Overview. Simple and functional, as asked.

- **What's on it:**
  - A range picker (7 days, 30 days by default, 90 days, 1 year, all time) and "Compare to previous period". All time has nothing before it, so it has no compare.
  - Four headline cards: completion, average strength, total done, best active streak. Each has an arrow (↑ ↓ →) against the same length of time just before. With compare on, each also says what it was ("was 72%"). A screen reader hears "up from 72% before".
  - Day by day: every habit's days stacked by identity colour, full and minimum apart, with a ring for each week. Tap for the numbers.
  - Habits ranked strongest first, with completion for the range. Tapping one opens its Habit detail; "Edit habit" there opens the habit form.
  - The identity score for the last 30 days, still from `getHabitDays`, so the agreed times-per-week rule is kept.
  - Habits that go together, worded ("When you do Read, you do Run 84% of the time (over 61 days)"), with a teaching empty state.
- **Moved to Habit detail:** the habit chips, heatmap, streak history, forecast and "Your pattern" lines. Habit detail already has all of them, and their tests moved with them.
- **Loading:** one call for a year (two years for 1 year and all time, since the period before needs it). It's the same cached year Habit detail uses. Strength in the cards and the ranking is worked out from all that history, so a 7-day range doesn't start every habit at zero.
- **Known:** a year of data for 20 habits is about 1.7 MB of JSON before compression. Compression in transit should shrink it a lot, but the payload could be slimmed later (shorter keys, or only the fields a screen needs). Opening Habit detail from the Overview asks for the same year again; the server answers from its cache.
- **Not yet:** insight cards come in part 5.
- **Tests:** core 1386 (periods to load, headline cards and trends, strength from history, pair wording, ranking from history), mobile 944 (the Overview: its tab, trends, compare, ranges, ranking opening Habit detail, identity score, pairs, errors, no habits; and the checks moved to Habit detail), frontend 28. No database change.

### Planned: Focus and Screen Time, and Habit connections (8 Nov 2026)

Two features the user asked to plan, written into PLAN.md:

- **Focus and Screen Time** (Pro, after v1; nothing built): phone usage linked to habits, Android first with Usage Access and an overlay (not AccessibilityService), iPhone later through the Screen Time API, with `screen.usage_daily` and `screen.limit_reached` events.
- **Habit connections** (built after Analytics): the daily check-in on every plan; a statistical pattern engine with its thresholds written down (21 days of data, at least 8 days on each side, a 20-point difference, Fisher or permutation tests with a Benjamini–Hochberg correction); AI explanations that may only use measured numbers; the heads-up on Today; the Habit map; Autopilot off by default; and the safety rules.
  - It shares the insight card, actions and Undo with the analytics insights, rather than being a second system.
  - The Habit map's green and amber are theme tokens, so there's still no red.
