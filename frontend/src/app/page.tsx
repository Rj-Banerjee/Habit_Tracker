'use client';

import React, { useState } from 'react';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { TopToolbar } from '../components/dashboard/TopToolbar';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { MotivationalCard } from '../components/dashboard/MotivationalCard';
import { WeeklyBarsChart } from '../components/charts/WeeklyBarsChart';
import { Top10Leaderboard } from '../components/dashboard/Top10Leaderboard';
import { DailyMatrix } from '../components/matrix/DailyMatrix';
import { WeeklyHabitsSection } from '../components/weekly/WeeklyHabitsSection';
import { MonthlyHabitsSection } from '../components/monthly/MonthlyHabitsSection';
import { MonthlyReflectionCard } from '../components/dashboard/MonthlyReflectionCard';
import { QuickCheckModal } from '../components/dashboard/QuickCheckModal';
import { Skeleton } from '../components/ui/Skeleton';

import { getTodayInfo, getMonthCalendar } from '../utils/dateUtils';
import { useHabits } from '../hooks/useHabits';
import { useAnalytics } from '../hooks/useAnalytics';
import { useOptimisticDailyLog } from '../hooks/useOptimisticDailyLog';

export default function DashboardPage() {
  const today = getTodayInfo();
  // Default to June 2026 if matching screenshot demo or current year/month
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(6); // June
  const [isQuickLogOpen, setIsQuickLogOpen] = useState<boolean>(false);

  const calendar = getMonthCalendar(selectedYear, selectedMonth);

  const {
    dailyHabits,
    weeklyHabits,
    monthlyHabits,
    reflection,
    loading: habitsLoading,
    addDailyHabit,
    updateDailyHabit,
    deleteDailyHabit,
    addWeeklyHabit,
    toggleWeeklyHabit,
    deleteWeeklyHabit,
    addMonthlyHabit,
    toggleMonthlyHabit,
    deleteMonthlyHabit,
    saveReflection,
    autoGenerateReflection,
  } = useHabits(selectedYear, selectedMonth);

  const { analytics, refreshAnalytics } = useAnalytics(selectedYear, selectedMonth);

  const { isCompleted, toggleLog } = useOptimisticDailyLog(
    dailyHabits,
    refreshAnalytics
  );

  const handleJumpToday = () => {
    setSelectedYear(today.year);
    setSelectedMonth(today.month);
  };

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-[#fbfaf8] p-5 md:p-6 lg:p-7">
        <div className="max-w-[1540px] mx-auto flex flex-col gap-5">
          {/* 1. Top Utility Toolbar */}
          <TopToolbar
            todayFormatted={today.formatted}
            onJumpToday={handleJumpToday}
            onOpenQuickLog={() => setIsQuickLogOpen(true)}
          />

          {/* 2. Main Dashboard Header */}
          <DashboardHeader
            year={selectedYear}
            month={selectedMonth}
            onYearChange={setSelectedYear}
            onMonthChange={setSelectedMonth}
            dailyProgress={analytics?.dailyProgress || []}
            overallPercentage={analytics?.overallPercentage || 0}
            totalCompletions={analytics?.totalMonthCompletions || 0}
            totalPossible={analytics?.totalPossibleCompletions || 1}
          />

          {/* 3. Upper Grid: Motivational Card, Weekly Bars, Top 10 Habits */}
          <section className="grid grid-cols-[260px_1fr_330px] gap-5 items-stretch min-h-[380px]">
            {/* Left: Motivational Quote & Curated Picture Card */}
            <MotivationalCard />

            {/* Center: Weekly Bar Charts (Weeks 1 to 5) with percentages and donut rings */}
            <article className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-center">
              {habitsLoading ? (
                <div className="grid grid-cols-5 gap-3 h-full">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-64" />
                  ))}
                </div>
              ) : (
                <WeeklyBarsChart
                  dailyPoints={analytics?.dailyProgress || []}
                  weeklyProgress={analytics?.weeklyProgress || []}
                />
              )}
            </article>

            {/* Right: Top 10 Habits Leaderboard */}
            <Top10Leaderboard top10={analytics?.top10Habits || []} />
          </section>

          {/* 4. Daily Habits Matrix Section */}
          <section>
            {habitsLoading ? (
              <Skeleton className="h-96 w-full rounded-2xl" />
            ) : (
              <DailyMatrix
                habits={dailyHabits}
                calendar={calendar}
                todayDateKey={today.dateKey}
                isCompleted={isCompleted}
                onToggle={toggleLog}
                onAddHabit={addDailyHabit}
                onUpdateHabit={updateDailyHabit}
                onDeleteHabit={deleteDailyHabit}
              />
            )}
          </section>

          {/* 5. Weekly Habits Section */}
          <WeeklyHabitsSection
            weeklyHabits={weeklyHabits}
            onToggleWeekly={toggleWeeklyHabit}
            onDeleteWeekly={deleteWeeklyHabit}
            onAddWeekly={addWeeklyHabit}
          />

          {/* 6. Bottom Grid: Monthly Habits Checklist & Lined Reflection Journal */}
          <section className="grid grid-cols-[640px_1fr] gap-5 items-stretch">
            {/* Monthly Habits Section */}
            <MonthlyHabitsSection
              monthlyHabits={monthlyHabits}
              onToggleMonthly={toggleMonthlyHabit}
              onDeleteMonthly={deleteMonthlyHabit}
              onAddMonthly={addMonthlyHabit}
            />

            {/* Monthly Reflection Card */}
            <MonthlyReflectionCard
              initialContent={reflection?.content}
              onSave={(content) => saveReflection(content)}
              onAutoGenerate={autoGenerateReflection}
            />
          </section>
        </div>

        {/* Quick Log for Today Modal */}
        <QuickCheckModal
          isOpen={isQuickLogOpen}
          onClose={() => setIsQuickLogOpen(false)}
          todayFormatted={today.formatted}
          todayDateKey={today.dateKey}
          habits={dailyHabits}
          isCompleted={isCompleted}
          onToggle={toggleLog}
        />
      </main>
    </ProtectedRoute>
  );
}
