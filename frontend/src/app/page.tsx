'use client';

import React, { useState, useEffect } from 'react';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { FloatingHeader } from '../components/navigation/FloatingHeader';
import { CommandPaletteModal } from '../components/navigation/CommandPaletteModal';
import { ProfileSettingsDrawer } from '../components/profile/ProfileSettingsDrawer';
import { GroundingFooter } from '../components/navigation/GroundingFooter';
import { LegalModal } from '../components/navigation/LegalModal';
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
import { AICoachTrigger } from '../components/coach/AICoachTrigger';
import { AICoachDrawer } from '../components/coach/AICoachDrawer';
import { aiCoachService } from '../services/aiCoachService';

import { getTodayInfo, getMonthCalendar } from '../utils/dateUtils';
import { useHabits } from '../hooks/useHabits';
import { useAnalytics } from '../hooks/useAnalytics';
import { useOptimisticDailyLog } from '../hooks/useOptimisticDailyLog';
import { useToast } from '../hooks/useToast';

export default function DashboardPage() {
  const today = getTodayInfo();
  const { success } = useToast();

  // Selected calendar month/year
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(6); // June

  // Navigation & Modals state
  const [isQuickLogOpen, setIsQuickLogOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState<boolean>(false);
  const [isAICoachOpen, setIsAICoachOpen] = useState<boolean>(false);
  const [hasUnreadProactive, setHasUnreadProactive] = useState<boolean>(false);
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | 'support' | null>(null);

  // Check for proactive background check-in messages on mount
  useEffect(() => {
    aiCoachService
      .getChatHistory(6)
      .then((history) => {
        const lastMsg = history[history.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.metadata?.type === 'proactive_checkin') {
          setHasUnreadProactive(true);
        }
      })
      .catch(() => {});
  }, []);

  const calendar = getMonthCalendar(selectedYear, selectedMonth);

  const {
    dailyHabits,
    weeklyHabits,
    monthlyHabits,
    reflection,
    loading: habitsLoading,
    updateDailyHabitLog,
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
    refreshAnalytics,
    updateDailyHabitLog
  );

  // Jump directly to current calendar month & year
  const handleJumpToday = () => {
    setSelectedYear(today.year);
    setSelectedMonth(today.month);
  };

  // Global keyboard shortcut: Cmd+K / Ctrl+K to toggle Command Palette
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Calculate Today's completion stats for Footer
  const completedTodayCount = dailyHabits.filter((h) => isCompleted(h.id, today.dateKey)).length;
  const totalTodayHabits = dailyHabits.length;

  // Real-time State Syncing for AI Coach tool executions
  const handleAIHabitLogUpdated = (habitId: string, date: string, status: boolean) => {
    updateDailyHabitLog(habitId, date, status);
    refreshAnalytics();
  };

  const handleAIHabitTargetScaled = (habitId: string, newGoal: number) => {
    updateDailyHabit(habitId, undefined, newGoal);
    refreshAnalytics();
  };

  // Total Lifetime Days Conquered (sum of all completions across dataset)
  const totalDaysConquered =
    analytics?.totalMonthCompletions ||
    dailyHabits.reduce((acc, h) => acc + (h.logs?.filter((l) => l.is_completed).length || 0), 0);

  // Export CSV Handler for Command Palette
  const handleExportCSV = () => {
    try {
      const headers = ['Habit ID', 'Habit Title', 'Goal Days', 'Total Logs Tracked', 'Logs Completed'];
      const rows = dailyHabits.map((h) => {
        const completedCount = h.logs?.filter((l) => l.is_completed).length || 0;
        const totalLogs = h.logs?.length || 0;
        return [
          `"${h.id}"`,
          `"${h.title.replace(/"/g, '""')}"`,
          h.goal_days,
          totalLogs,
          completedCount,
        ];
      });

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `habit-tracker-export-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      success('Habit data exported to CSV successfully!');
    } catch {
      // fallback
    }
  };

  return (
    <ProtectedRoute>
      {/* 1. Floating Glassmorphism Header (Fixed top-4 centered pill) */}
      <FloatingHeader
        todayFormatted={today.formatted}
        onOpenQuickLog={() => setIsQuickLogOpen(true)}
        onOpenSearch={() => setIsCommandPaletteOpen(true)}
        onOpenProfile={() => setIsProfileDrawerOpen(true)}
        onJumpToday={handleJumpToday}
      />

      {/* Main Dashboard Container with top padding for floating header */}
      <main className="min-h-screen bg-gray-50 dark:bg-slate-950 pt-24 sm:pt-28 pb-6 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
        <div className="max-w-7xl mx-auto flex flex-col gap-6">
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

        {/* 7. Minimalist Grounding Footer */}
        <GroundingFooter
          completedTodayCount={completedTodayCount}
          totalTodayHabits={totalTodayHabits}
          totalDaysConquered={totalDaysConquered}
          onOpenLegal={(type) => setLegalModalType(type)}
        />

        {/* 8. 1-Click Quick Log for Today Modal */}
        <QuickCheckModal
          isOpen={isQuickLogOpen}
          onClose={() => setIsQuickLogOpen(false)}
          todayFormatted={today.formatted}
          todayDateKey={today.dateKey}
          habits={dailyHabits}
          isCompleted={isCompleted}
          onToggle={toggleLog}
        />

        {/* 9. Command Palette Modal (Cmd+K) */}
        <CommandPaletteModal
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          habits={dailyHabits}
          onOpenQuickLog={() => setIsQuickLogOpen(true)}
          onJumpToday={handleJumpToday}
          onOpenProfile={() => setIsProfileDrawerOpen(true)}
          onExportCSV={handleExportCSV}
          onOpenAICoach={() => {
            setIsAICoachOpen(true);
            setHasUnreadProactive(false);
          }}
        />

        {/* 10. Off-Canvas Profile & Settings Panel */}
        <ProfileSettingsDrawer
          isOpen={isProfileDrawerOpen}
          onClose={() => setIsProfileDrawerOpen(false)}
          habits={dailyHabits}
          totalDaysConquered={totalDaysConquered}
        />

        {/* 11. Minimal Legal / Info Modal for Footer Links */}
        <LegalModal
          isOpen={legalModalType !== null}
          onClose={() => setLegalModalType(null)}
          type={legalModalType}
        />

        {/* 12. Floating AI Coach Trigger Button */}
        <AICoachTrigger
          onClick={() => {
            setIsAICoachOpen(true);
            setHasUnreadProactive(false);
          }}
          isOpen={isAICoachOpen}
          hasUnreadProactive={hasUnreadProactive}
        />

        {/* 13. Conversational AI Coach Drawer */}
        <AICoachDrawer
          isOpen={isAICoachOpen}
          onClose={() => setIsAICoachOpen(false)}
          todayDateKey={today.dateKey}
          onHabitLogUpdated={handleAIHabitLogUpdated}
          onHabitTargetScaled={handleAIHabitTargetScaled}
          onRefreshAnalytics={refreshAnalytics}
        />
      </main>
    </ProtectedRoute>
  );
}
