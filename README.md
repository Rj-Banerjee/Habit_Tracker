# 🌿 Aesthetic Monthly Habit Tracker

An elegant, pastel-themed Habit Tracking Web Application designed with the mindful, calming aesthetics of popular notion/bullet-journal spreadsheets.

---

## ✨ Features

- **Automatic Current Date Detection**: Automatically identifies today's date, displays it in the header, and highlights today's column with an amber accent so you know exactly what to log today.
- **1-Click Quick Log for Today**: A dedicated modal lets you review and tick all your habits for today in seconds.
- **Top Wave Mountain Chart**: Fluid SVG bezier area chart visualizing daily completion trends across the entire month.
- **Dynamic Weekly Bar Charts**: 5-week breakdown with custom pastel palettes (Soft Sky Blue, Blush Pink, Mint Teal, Golden Apricot, Periwinkle Blue) with daily completion percentage badges and counts.
- **Interactive Circular Donut Progress Rings**:
  - Top daily progress ring (`81.33%`, `466 / 573`).
  - Weekly individual rings (Week 1–5).
  - Weekly habits summary ring (`71.4%`).
  - Monthly milestone ring (`50%`).
- **Top 10 Habits of the Month Leaderboard**: Dynamic ranking table showing habit names, completion percentages, and celebratory milestone indicators (e.g., *"Over 100% on 2 habits — keep going! 🚀"*).
- **Daily Fresh Motivational Quotes & Curated Pictures**:
  - Deterministic 365-day rotation that refreshes automatically every midnight.
  - Curated wisdom from famous figures (Marcus Aurelius, James Clear, Maya Angelou, Seneca, Aristotle, Confucius, etc.).
  - Matching aesthetic photography that inspires focus and intentionality.
  - "Next Quote →" button to explore other daily inspirations anytime.
- **Full Habit Customization**:
  - Add, edit, or delete **Daily Habits** with customizable monthly target goals.
  - Add, toggle, or delete **Weekly Habits** across all 5 weeks.
  - Add, toggle, or delete **Monthly Habits**.
- **Lined Notebook Monthly Reflection & Progress Review**:
  - Ruled journal styling with elegant serif italic typography.
  - **"✨ Auto-Generate Review"** button that synthesizes your monthly statistics, best habits, streaks, and areas of growth into an insightful written summary.
  - Editable journal text that persists automatically.
- **Local Persistence & Data Portability**:
  - Real-time auto-save to `localStorage`.
  - Full JSON Data Backup & Restore (export/import).
  - One-click reset to the June 2026 screenshot demo template.
  - Print / PDF export stylesheet (`@media print`).

---

## 🚀 How to Run

You can run this application with any standard web browser:

### Option 1: Live Server in VS Code
Right-click `index.html` inside VS Code and select **"Open with Live Server"**.

### Option 2: Python HTTP Server
Run the following in terminal:
```bash
cd "Habit tracker"
python3 -m http.server 8000
```
Then visit [http://localhost:8000](http://localhost:8000) in your browser.

### Option 3: Double-Click
Simply double-click `index.html` in Finder or file explorer. (Note: ES Modules require a local server or browser flags due to CORS file protocol restrictions; Option 1 or 2 is recommended).
