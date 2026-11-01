'use client';

import React, { useState } from 'react';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { AppHeader } from '../components/navigation/AppHeader';
import { SettingsDrawer } from '../components/profile/SettingsDrawer';
import { DailyMatrix } from '../components/matrix/DailyMatrix';
import { DailyMobileTodayView } from '../components/matrix/DailyMobileTodayView';
import { Skeleton } from '../components/ui/Skeleton';
import { getMonthCalendar, getTodayInfo, MONTH_NAMES } from '../utils/dateUtils';
import { useHabits } from '../hooks/useHabits';
import { useOptimisticDailyLog } from '../hooks/useOptimisticDailyLog';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}

function Dashboard() {
  const today = getTodayInfo();
  const [selectedYear, setSelectedYear] = useState<number>(today.year);
  const [selectedMonth, setSelectedMonth] = useState<number>(today.month);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const calendar = getMonthCalendar(selectedYear, selectedMonth);
  const { habits, streaks, loading, loadFailed, refresh, refreshStreaks, addHabit, renameHabit, deleteHabit } =
    useHabits(selectedYear, selectedMonth);
  const { isCompleted, toggleLog } = useOptimisticDailyLog(habits, refreshStreaks);

  const shiftMonth = (delta: number) => {
    const next = new Date(selectedYear, selectedMonth - 1 + delta, 1);
    setSelectedYear(next.getFullYear());
    setSelectedMonth(next.getMonth() + 1);
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-slate-950 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <AppHeader todayFormatted={today.formatted} onOpenProfile={() => setIsSettingsOpen(true)} />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          >
            ‹
          </button>
          <span className="min-w-36 text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          >
            ›
          </button>
        </div>

        {loadFailed ? (
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300">
            <p>Your habits couldn&apos;t be loaded.</p>
            <button type="button" onClick={refresh} className="mt-3 font-semibold underline">
              Try again
            </button>
          </div>
        ) : loading ? (
          <Skeleton className="h-96 w-full rounded-2xl" />
        ) : (
          <>
            <DailyMatrix
              habits={habits}
              streaks={streaks}
              calendar={calendar}
              todayDateKey={today.dateKey}
              isCompleted={isCompleted}
              onToggle={toggleLog}
              onAddHabit={addHabit}
              onRenameHabit={renameHabit}
              onDeleteHabit={deleteHabit}
            />
            <DailyMobileTodayView
              habits={habits}
              streaks={streaks}
              calendar={calendar}
              todayDateKey={today.dateKey}
              isCompleted={isCompleted}
              onToggle={toggleLog}
              onAddHabit={() => addHabit('New habit', 'Two minutes of it')}
            />
          </>
        )}
      </div>

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </main>
  );
}
