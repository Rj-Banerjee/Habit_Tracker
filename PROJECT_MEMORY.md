# 🧠 Habit Tracker Enterprise — Project Memory & Technical Log

This document serves as the permanent system memory and technical blueprint for the **Habit Tracker Enterprise** application. It captures all architectural decisions, database schemas, credentials configurations, resolved issues, and UI/UX systems implemented across development sessions.

---

## 🏛️ System Architecture Overview

```
                                      ┌─────────────────────────────────────┐
                                      │        Client Browser (Desktop/     │
                                      │              Tablet/Mobile)         │
                                      └──────────────────┬──────────────────┘
                                                         │
                                    HTTP / WebSocket     │   Next.js 14 (App Router)
                                   (Port 3001)           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND LAYER (Next.js 14 + TypeScript + Tailwind CSS)                                │
│                                                                                        │
│  - Floating Glassmorphism Header (pill-shaped, fixed top-4, time-aware greeting)       │
│  - Command Palette (Cmd+K modal for rapid jump, habit search, quick actions)           │
│  - Daily Habits Matrix (31-day table with week 1-5 color-coded checkboxes)             │
│  - Daily Mobile Today View (date carousel navigation + touch-target check cards)       │
│  - Recharts Visualizations (Area Mountain Chart, Weekly Bars, Donut Rings)             │
│  - Off-Canvas Profile & Settings Drawer (slide-in panel with Core Focus & rules)       │
│  - Grounding Footer (Today's rhythm progress bar + lifetime conquered counter)         │
│  - Client State Synchronization (Optimistic UI with useOptimisticDailyLog & useHabits) │
└────────────────────────────────────────────────┬───────────────────────────────────────┘
                                                 │
                          REST API JSON Calls    │   Bearer JWT / dev-mock-token
                         (Port 5001: /api/*)     ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ BACKEND LAYER (Node.js + Express + TypeScript)                                         │
│                                                                                        │
│  - Layered Architecture: Controllers, Routes, Services, Middlewares, Models            │
│  - Port: 5001 (configured in backend/.env; port 5000 avoided due to macOS AirPlay)     │
│  - Auth Middleware: Validates Supabase JWTs & supports demo account fallback           │
│  - Services: HabitService, AnalyticsService, QuoteService, CronService                 │
│  - Automated Cron: Midnight scheduler (0 0 * * *) caching Unsplash photo & quote       │
└────────────────────────────────────────────────┬───────────────────────────────────────┘
                                                 │
                                Prisma ORM       │   Direct PostgreSQL 5432
                                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ DATABASE & AUTH LAYER (Supabase + PostgreSQL)                                          │
│                                                                                        │
│  - Hosted Database: db.cxscegvtawxdvibllczl.supabase.co:5432                           │
│  - Tables: users, daily_habits, daily_logs, weekly_habits, monthly_habits,             │
│            monthly_reflections, daily_quote_cache                                      │
│  - Authentication: Supabase Auth (JWT session management)                              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚙️ Ports & Environment Configurations

### 1. Port Allocation
- **Backend API Server**: Runs on `http://localhost:5001`
  - *Note*: Port 5000 is occupied by macOS Monterey/Ventura/Sonoma AirPlay Receiver (`AirTunes`). The backend was deliberately assigned port 5001.
- **Frontend Next.js Server**: Runs on `http://localhost:3001`

### 2. Backend Environment (`backend/.env`)
```env
PORT=5001
NODE_ENV=development
SUPABASE_URL=https://cxscegvtawxdvibllczl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_mXkPj0zH9e3V2wT5...
DATABASE_URL="postgresql://postgres:Habit%40Tracker%4026@db.cxscegvtawxdvibllczl.supabase.co:5432/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres:Habit%40Tracker%4026@db.cxscegvtawxdvibllczl.supabase.co:5432/postgres?sslmode=require"
```
> [!IMPORTANT]
> **Database Password Encoding**:
> The Supabase database password is `Habit@Tracker@26`. Because it contains `@` characters, they must be URL-encoded as `%40` (`Habit%40Tracker%4026`) in the Prisma connection URI to prevent URI parsing errors. Direct connection host is port `5432` at `db.cxscegvtawxdvibllczl.supabase.co`.

### 3. Frontend Environment (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL="http://localhost:5001/api"
NEXT_PUBLIC_SUPABASE_URL="https://cxscegvtawxdvibllczl.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_oQCmzhlt8VQsFZ3Q2e5Ydg_PcnWrWah"
```

---

## 🗄️ Database Schema (Prisma PostgreSQL)

- **`users`**:
  - `id`: UUID (Primary Key)
  - `email`: String (Unique)
  - `created_at`: Timestamp
  - *Demo User*: `id = '00000000-0000-0000-0000-000000000001'`, `email = 'demo@habittracker.com'`
- **`daily_habits`**:
  - `id`: UUID (Primary Key)
  - `user_id`: Foreign Key (`users.id`)
  - `title`: String
  - `goal_days`: Integer (Default: 30)
  - `created_at`: Timestamp
- **`daily_logs`**:
  - `id`: UUID (Primary Key)
  - `habit_id`: Foreign Key (`daily_habits.id`)
  - `date`: String in ISO format `"YYYY-MM-DD"` (avoids timezone drift)
  - `is_completed`: Boolean (Default: false)
  - `updated_at`: Timestamp
  - `@@unique([habit_id, date])` (Enforces unique log per habit per date)
- **`weekly_habits`**:
  - `id`: UUID (Primary Key)
  - `user_id`: Foreign Key
  - `title`: String
  - `week_number`: Integer (1 to 5)
  - `month`: Integer (1 to 12)
  - `year`: Integer
  - `is_completed`: Boolean
- **`monthly_habits`**:
  - `id`: UUID (Primary Key)
  - `user_id`: Foreign Key
  - `title`: String
  - `month`: Integer, `year`: Integer
  - `is_completed`: Boolean
- **`monthly_reflections`**:
  - `id`: UUID (Primary Key)
  - `user_id`: Foreign Key
  - `month`: Integer, `year`: Integer
  - `content`: Text (Lined journal reflections)
- **`daily_quote_cache`**:
  - `id`: UUID (Primary Key)
  - `date`: String (Unique `"YYYY-MM-DD"`)
  - `quote`: Text, `author`: String, `image_url`: Text
- **`coach_profiles`**:
  - `id`: UUID (Primary Key)
  - `user_id`: Foreign Key (`users.id`, Unique)
  - `coaching_style`: String (Default: `'EMPATHETIC_FIRM'`)
  - `target_identity`: String? (Default: `'High-performing & disciplined builder'`)
  - `behavioral_tags`: Text Array (Default: `['atomic-habits', 'frictionless-downshifting', 'identity-based']`)
  - `created_at`, `updated_at`: Timestamps
- **`chat_messages`**:
  - `id`: UUID (Primary Key)
  - `user_id`: Foreign Key (`users.id`)
  - `role`: String (`user` | `assistant` | `system`)
  - `content`: Text
  - `metadata`: JSON (contains `toolsExecuted`, `type`, `slot`, etc.)
  - `created_at`: Timestamp (Indexed on `[user_id, created_at]`)

---

## 🎨 UI/UX Component Architecture

### 1. Floating Glassmorphism Header (`FloatingHeader.tsx`)
- **Positioning**: `fixed top-4 left-1/2 -translate-x-1/2 z-50`
- **Dimensions**: `w-[95%] max-w-7xl rounded-full`
- **Glassmorphism**: `bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/40 dark:border-slate-800`
- **Dynamic Greeting**: Time-aware (`Good morning` before 12:00, `Good afternoon` 12:00–18:00, `Good evening` after 18:00) with user's name.
- **Center Action**: Glowing gradient Quick Log button with pulse animation.
- **Search Bar**: Keyboard-shortcut badge (`Cmd+K`) triggering the Command Palette.
- **Right Utilities**: Notification bell with unread indicator, Theme toggle (Sun/Moon), and circular avatar.

### 2. Command Palette Modal (`CommandPaletteModal.tsx`)
- Accessible globally via `Cmd+K` or `Ctrl+K`.
- Features instant fuzzy filtering across quick actions (Quick Log, Jump to Today, Switch Theme, Profile, Export CSV) and all active daily habits.

### 3. Off-Canvas Profile & Settings Drawer (`ProfileSettingsDrawer.tsx`)
- Slides from the right edge with backdrop overlay.
- **Identity**: Displays user name, avatar, and an editable "My Core Focus" input persisted to `localStorage`.
- **Rules & Automation**:
  - *Strict Mode*: Breaks streak at midnight if goals are incomplete.
  - *Grace Mode*: Allows 24-hour back-logging for missed days without penalizing streaks.
- **Integrations**: Functional "Export Data (CSV)" download and "Sync Calendar" (.ics export).

### 4. Minimalist Grounding Footer (`GroundingFooter.tsx`)
- Sits at the bottom of the layout without cluttering data tables.
- **Left**: Subtle thin progress bar with today's completion percentage and completed ratio.
- **Center**: Minimal text links (`Privacy`, `Terms`, `Support`) opening `LegalModal.tsx`.
- **Right**: "Total Days Conquered: [X]" counter celebrating lifetime habit completions.

### 5. Checkbox Dual-Layer Theme System (`CheckboxCell.tsx`)
To prevent Tailwind build-time CSS purging on dynamic classes, checkboxes use:
1. Static Tailwind class strings:
   - Week 1: `bg-blue-600 border-blue-600 text-white`
   - Week 2: `bg-pink-600 border-pink-600 text-white`
   - Week 3: `bg-teal-600 border-teal-600 text-white`
   - Week 4: `bg-amber-600 border-amber-600 text-white`
   - Week 5: `bg-indigo-600 border-indigo-600 text-white`
2. Explicit inline style fallback:
   - `backgroundColor: isCompleted ? theme.bg : undefined`
   - `borderColor: isCompleted ? theme.border : undefined`
   (Hex values: `#2563eb`, `#db2777`, `#0d9488`, `#d97706`, `#4f46e5`).

### 6. Floating AI Coach Trigger (`AICoachTrigger.tsx`)
- **Positioning**: `fixed bottom-6 right-6 z-40`
- **Glassmorphism Base**: `bg-white/80 backdrop-blur-md dark:bg-slate-900/80 border border-white/60 dark:border-slate-800/80 shadow-2xl`
- **Breathing Animation**: Keyframe pulse & subtle breathe (`animate-breathe`, `animate-pulse`) with gradient glow ring.
- **Micro-Pills**: Displays "AI Coach", "Atomic" badge, and proactive check-in alert status.

### 7. Conversational AI Coach Drawer (`AICoachDrawer.tsx`)
- Off-canvas right panel (`rounded-l-3xl`, soft shadows, pastel/slate palette).
- **RAG Architecture & Behavioral System**: Integrates James Clear's "Atomic Habits" principles with strict enforcement of **Frictionless Downshifting** when fatigue/burnout is expressed.
- **Action Chips**: `["Quick Log My Day", "I'm Feeling Burned Out", "Review My Week", "Emergency Downscale"]`.
- **Real-Time Streaming**: Server-Sent Events (SSE) streaming with auto-scrolling message bubbles.
- **Optimistic State Syncing**: Intercepts AI tool executions (`toggleHabitLog`, `scaleHabitTarget`) to update the habit matrix and charts immediately without page reload.


---

## 🛠️ Key Solved Issues & Bug Fixes

1. **Checkbox Colors Not Rendering for Weeks 3 & 4**:
   - *Cause*: Tailwind CSS was not statically parsing dynamic template strings `${palette.checkboxActive}`, and `./src/utils` was not in `tailwind.config.js`. Classes `bg-teal-600` and `bg-amber-600` were never compiled into CSS.
   - *Fix*: Added safelist to `tailwind.config.js`, included `./src/utils`, and added explicit inline style fallbacks in `CheckboxCell.tsx`.
2. **State Overwrite on Checkbox Toggling**:
   - *Cause*: `useOptimisticDailyLog` tracked toggles in local state, but the underlying `dailyHabits` in `useHabits` did not have its internal `logs` updated. On month switch or re-render, stale habits reset the log map.
   - *Fix*: Added `updateDailyHabitLog` callback to synchronize the habit logs array immediately on click.
3. **Multi-User & Multi-Month Backend Flexibility**:
   - *Cause*: Habits seeded under demo user (`00000000-0000-0000-0000-000000000001`) threw 404 unauthorized errors when toggled by authenticated Supabase accounts.
   - *Fix*: Added demo fallback matching in `habit.service.ts` (`toggleDailyLog`, `getMonthMatrix`) and `analytics.service.ts` (`getMonthAnalytics`).
4. **Port 5000 AirPlay Conflict**:
   - *Cause*: macOS AirPlay Receiver occupies port 5000.
   - *Fix*: Re-routed Express backend to port `5001` and updated `frontend/.env.local`.

---

## 🚀 How to Run the Project

### Start Backend
```bash
cd "Habit tracker/backend"
npm run dev
# Running on http://localhost:5001
```

### Start Frontend
```bash
cd "Habit tracker/frontend"
npm run dev
# Running on http://localhost:3001
```

### Git Repository
- Remote URL: `https://github.com/Rj-Banerjee/Habit_Tracker.git`
- Branch: `main`
- Latest commit: `003b16e` (Features all modern navigation and architecture upgrades)
