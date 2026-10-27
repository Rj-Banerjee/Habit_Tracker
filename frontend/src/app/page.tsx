'use client';

import React, { useState } from 'react';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { TopToolbar } from '../components/dashboard/TopToolbar';
import { MotivationalCard } from '../components/dashboard/MotivationalCard';
import { MonthlyOverviewCard } from '../components/dashboard/MonthlyOverviewCard';
import { DailyMatrix } from '../components/matrix/DailyMatrix';
import { DailyMobileTodayView } from '../components/matrix/DailyMobileTodayView';
import { AnalyticsSection } from '../components/analytics/AnalyticsSection';
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
  // Default to June 2026 matching screenshot demo data, or current calendar
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
      <main className="min-h-screen bg-gray-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8 transition-colors duration-200">
        <div className="max-w-7xl mx-auto flex flex-col gap-6">
          {/* 1. Top Utility Toolbar */}
          <TopToolbar
            todayFormatted={today.formatted}
            onJumpToday={handleJumpToday}
            onOpenQuickLog={() => setIsQuickLogOpen(true)}
          />

          {/* 2. Top Two-Column Grid: Left 1/3 Quote, Right 2/3 Monthly Progress */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {/* Left Column (1/3 Width): Daily Motivation Quote & Picture */}
            <div className="lg:col-span-1">
              <MotivationalCard />
            </div>

            {/* Right Column (2/3 Width): High-Level Monthly Progress Metrics */}
            <div className="lg:col-span-2">
              <MonthlyOverviewCard
                year={selectedYear}
                month={selectedMonth}
                onYearChange={setSelectedYear}
                onMonthChange={setSelectedMonth}
                dailyProgress={analytics?.dailyProgress || []}
                overallPercentage={analytics?.overallPercentage || 0}
                totalCompletions={analytics?.totalMonthCompletions || 0}
                totalPossible={analytics?.totalPossibleCompletions || 1}
              />
            </div>
          </section>

          {/* 3. Daily Tracking Section (Responsive: Desktop Table vs Mobile Today View) */}
          <section>
            {habitsLoading ? (
              <Skeleton className="h-96 w-full rounded-2xl" />
            ) : (
              <>
                {/* Desktop & Tablet View (Hidden on mobile) */}
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

                {/* Mobile Crucial Today View (Visible only on < md screens) */}
                <DailyMobileTodayView
                  habits={dailyHabits}
                  calendar={calendar}
                  todayDateKey={today.dateKey}
                  isCompleted={isCompleted}
                  onToggle={toggleLog}
                  onAddHabit={() => addDailyHabit('New Habit', 30)}
                />
              </>
            )}
          </section>

          {/* 4. Dedicated Insights & Analytics Section (Top 10 + Weekly Bars) */}
          <AnalyticsSection
            dailyPoints={analytics?.dailyProgress || []}
            weeklyProgress={analytics?.weeklyProgress || []}
            top10Habits={analytics?.top10Habits || []}
          />

          {/* 5. Weekly Habits Section */}
          <WeeklyHabitsSection
            weeklyHabits={weeklyHabits}
            onToggleWeekly={toggleWeeklyHabit}
            onDeleteWeekly={deleteWeeklyHabit}
            onAddWeekly={addWeeklyHabit}
          />

          {/* 6. Monthly Milestones & Reflection Section (Two-Column Balanced Grid) */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Monthly Habits Milestone Card */}
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

        {/* 1-Click Quick Log for Today Modal */}
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
