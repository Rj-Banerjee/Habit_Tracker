# 🌿 Habit Tracker Enterprise — Full-Stack Dashboard

An enterprise-grade, high-performance Habit Tracking Dashboard crafted with modern web standards, aesthetic card-based UI, comprehensive progress analytics, Supabase authentication, and PostgreSQL persistence.

---

## 🏗️ Architecture & Tech Stack

- **Frontend**: [Next.js 14](https://nextjs.org/) (App Router, TypeScript) + [Tailwind CSS](https://tailwindcss.com/)
  - Modular enterprise architecture (`/components`, `/hooks`, `/services`, `/utils`, `/types`)
  - Floating Glassmorphic Header with dynamic time-aware greetings and quick actions
  - Global Command Palette (`Cmd+K` / `Ctrl+K`)
  - Off-Canvas Profile & Settings Drawer (Strict Mode, Grace Mode, Core Focus intention, CSV/iCal export)
  - Interactive Daily Habits Matrix with snap-to-grid responsive layout and mobile Today view
  - Comprehensive Recharts data visualizations (Wave Mountain Area Chart, Weekly Bars, Donut Rings)
  - Minimalist Grounding Footer with today's rhythm bar and lifetime conquered counter
  - Full Light and Dark mode theme support

- **Backend**: [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) (TypeScript)
  - Layered architecture (`/controllers`, `/routes`, `/services`, `/models`, `/middlewares`)
  - Secured REST API with Supabase JWT Bearer token authentication
  - Centralized error handling and Zod request validation
  - Midnight automated Cron scheduler (`0 0 * * *`) caching fresh inspirational quotes and Unsplash photography
  - Direct connection to Supabase PostgreSQL on port 5001

- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL) + [Prisma ORM](https://www.prisma.io/)
  - Strict relational schema for users, daily habits, unique daily logs (`habit_id + date`), weekly milestones, monthly reflections, and daily quote cache
  - Supabase JWT session management with protected route middleware

---

## 🚀 Quick Start & Local Setup

### Prerequisites
- Node.js (v18.0.0 or higher)
- npm or yarn

### 1. Backend Setup
```bash
cd backend
npm install

# Push schema to Supabase PostgreSQL (if needed)
npx prisma db push

# Start the Express server
npm run dev
# Server listening on http://localhost:5001
```

### 2. Frontend Setup
```bash
cd frontend
npm install

# Start Next.js development server
npm run dev
# Dashboard accessible at http://localhost:3001
```

---

## ⌨️ Keyboard Shortcuts & Power Features

- `Cmd + K` (or `Ctrl + K`): Open Command Palette to search habits, switch themes, or export data.
- `ESC`: Instantly close open dialogs, command palette, or profile drawer.
- **Floating Header**: Dynamic greeting that adjusts to morning, afternoon, or evening based on your local time.
- **Off-Canvas Settings**:
  - **My Core Focus**: Anchor your daily habits with a personal North Star intention.
  - **Strict Mode**: Automatically breaks active streak if goals are incomplete at midnight.
  - **Grace Mode**: Allows 24-hour back-logging for missed days without resetting streaks.
  - **Export Data (CSV)**: Instantly generate and download a `.csv` spreadsheet of all habits and completion logs.
  - **Sync Calendar**: Export habit routines to Apple Calendar or Google Calendar via `.ics`.

---

## 📄 License
MIT License. Built for mindful productivity and consistent daily growth.
