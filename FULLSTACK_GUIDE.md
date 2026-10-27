
# 🚀 Full-Stack Enterprise Habit Tracking Dashboard

An enterprise-grade, full-stack habit tracking web application faithfully reproducing the aesthetic, pastel-themed monthly dashboard from your screenshots.

---

## 🏛️ System Architecture

```mermaid
flowchart LR
    subgraph Frontend ["Frontend (Next.js 14 App Router + Tailwind CSS)"]
        UI["Aesthetic Pastel Dashboard UI"]
        Recharts["Recharts: Area, Bar, Donut"]
        OptimisticHook["useOptimisticDailyLog Hook"]
        AuthHook["useAuth (Supabase Auth Client)"]
        ApiClient["ApiClient (Axios/Fetch + JWT Injector)"]
    end

    subgraph Backend ["Backend (Express + TypeScript Layered Architecture)"]
        AuthMiddleware["requireAuth (Supabase JWT Verifier)"]
        Controllers["Controllers (Habit, Analytics, Content, Reflection)"]
        Services["Services (Habit, Analytics, Quote, Cron)"]
        CronJob["Node-Cron (Midnight Cache Refresher)"]
        PrismaORM["Prisma Client"]
    end

    subgraph Database ["Supabase & Cloud Services"]
        PostgresDB[("PostgreSQL Database")]
        SupabaseAuth["Supabase Auth Service"]
        UnsplashAPI["Unsplash Photos API"]
    end

    UI --> OptimisticHook
    OptimisticHook --> ApiClient
    AuthHook --> SupabaseAuth
    ApiClient -->|Bearer JWT| AuthMiddleware
    AuthMiddleware --> Controllers
    Controllers --> Services
    Services --> PrismaORM
    PrismaORM --> PostgresDB
    CronJob --> Services
    Services -.->|Auto-fetch quotes/photos| UnsplashAPI
```

---

## 📂 Project Structure

```
Habit tracker/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma           # Prisma schema with all relations & unique constraints
│   │   └── seed.ts                 # Full database seeder with June 2026 reference data
│   ├── src/
│   │   ├── controllers/            # HTTP request/response handling
│   │   │   ├── habit.controller.ts
│   │   │   ├── analytics.controller.ts
│   │   │   ├── content.controller.ts
│   │   │   └── reflection.controller.ts
│   │   ├── middlewares/            # Auth, validation, centralized error handling
│   │   │   ├── auth.middleware.ts  # Supabase JWT token verification
│   │   │   ├── error.middleware.ts # Centralized error handler
│   │   │   └── validation.middleware.ts # Zod request schema validation
│   │   ├── models/
│   │   │   └── prisma.ts           # Singleton Prisma client instance
│   │   ├── routes/                 # Modular Express routers
│   │   │   ├── habit.routes.ts
│   │   │   ├── analytics.routes.ts
│   │   │   ├── content.routes.ts
│   │   │   ├── reflection.routes.ts
│   │   │   └── index.ts
│   │   ├── services/               # Business logic & integrations
│   │   │   ├── habit.service.ts
│   │   │   ├── analytics.service.ts
│   │   │   ├── quote.service.ts
│   │   │   ├── cron.service.ts     # Automated midnight cache refresher
│   │   │   └── reflection.service.ts
│   │   ├── types/                  # Express and DTO type declarations
│   │   ├── app.ts                  # Express application setup
│   │   └── server.ts               # Server entry point & graceful shutdown
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── app/                    # Next.js App Router
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx  # Login page
│   │   │   │   └── register/page.tsx # Registration page
│   │   │   ├── layout.tsx          # Root layout with Toast & Auth providers
│   │   │   ├── page.tsx            # Protected Dashboard page
│   │   │   └── globals.css         # Pastel themes, animations & lined paper styling
│   │   ├── components/
│   │   │   ├── auth/               # ProtectedRoute, LoginForm, RegisterForm
│   │   │   ├── charts/             # Recharts AreaChart, BarChart, DonutRing
│   │   │   ├── dashboard/          # Header, Toolbar, MotivationalCard, Top10Leaderboard
│   │   │   ├── matrix/             # DailyMatrix, HabitRow, CheckboxCell
│   │   │   ├── weekly/             # WeeklyHabitsSection, WeekColumn
│   │   │   ├── monthly/            # MonthlyHabitsSection
│   │   │   └── ui/                 # Button, Input, Modal, Toast, Skeleton
│   │   ├── hooks/                  # Custom React hooks (useAuth, useHabits, useOptimisticDailyLog)
│   │   ├── services/               # API client & Supabase client
│   │   ├── types/                  # TypeScript domain models
│   │   └── utils/                  # Date algorithms & color palettes
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── .env.local.example
│
└── package.json                    # Monorepo scripts
```

---

## 🗄️ Database Schema (Prisma)

The PostgreSQL database schema enforces the required relations and constraints:

- `Users`: `id` (UUID), `email`, `created_at`
- `DailyHabits`: `id`, `user_id`, `title`, `goal_days` (relation to `Users`)
- `DailyLogs`: `id`, `habit_id`, `date` (ISO `YYYY-MM-DD`), `is_completed`
  - **Constraint**: `@@unique([habit_id, date])` enforces only 1 log per habit per day.
- `WeeklyHabits`: `id`, `user_id`, `title`, `week_number` (1-5), `month`, `year`, `is_completed`
- `MonthlyHabits`: `id`, `user_id`, `title`, `month`, `year`, `is_completed`
- `MonthlyReflections`: `id`, `user_id`, `month`, `year`, `content` (relation to `Users`)
- `DailyQuoteCache`: `id`, `date`, `quote`, `author`, `image_url`

---

## ⚡ Quickstart Guide

### 1. Environment Setup

#### Backend (`backend/.env`):
```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# PostgreSQL Connection String (from Supabase Project Settings > Database)
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres?schema=public"

# Supabase Auth
SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

# Unsplash API (Optional for custom photo fetching)
UNSPLASH_ACCESS_KEY="your-unsplash-access-key"
```

#### Frontend (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL="http://localhost:5000/api"
NEXT_PUBLIC_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

---

### 2. Database Migration & Seeding

```bash
cd backend

# Generate Prisma Client
npx prisma generate

# Push schema directly to Supabase PostgreSQL
npx prisma db push

# Seed demo dataset (June 2026 data matching reference screenshots)
npx tsx prisma/seed.ts
```

---

### 3. Run the Development Servers

#### Terminal 1 (Backend API):
```bash
cd backend
npm run dev
# Server running at http://localhost:5000
```

#### Terminal 2 (Frontend Next.js):
```bash
cd frontend
npm run dev
# Dashboard running at http://localhost:3000
```

---

## 💎 Features Walkthrough

1. **Optimistic UI Updates**: Toggling any habit checkbox updates the UI in under 1ms, accompanied by smooth scaling animations, while synchronizing with the Supabase PostgreSQL backend in the background. If a network fault occurs, state is rolled back automatically with a toast notification.
2. **Current Date Auto-Focus**: On dashboard load, the matrix automatically scrolls to today's date column and highlights it with an amber badge.
3. **Recharts Visualizations**:
   - Mountain/Wave area chart dynamically graphs daily progress across the month.
   - 5-week grouped bar chart with daily badges and circular completion rings.
   - Recharts vertical bar chart for weekly checklist completion.
4. **Top 10 Habits Leaderboard**: Live ranking sorted by completion percentage, tracking longest streaks, and celebrating milestone goals.
5. **Automated Content Integration**: Built-in midnight cron service caches and rotates fresh daily quotes and aesthetic Unsplash photography without repeating.
6. **Monthly Review Synthesizer**: Generates a personalized performance reflection synthesizing completion rates, best habits, and streak accomplishments.
