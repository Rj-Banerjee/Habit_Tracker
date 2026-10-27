'use client';

import React from 'react';
import { WeeklyBarsChart } from '../charts/WeeklyBarsChart';
import { Top10Leaderboard } from '../dashboard/Top10Leaderboard';
import { DayProgressPoint, WeekProgressStat, HabitStreakStat } from '../../types';

interface AnalyticsSectionProps {
  dailyPoints: DayProgressPoint[];
  weeklyProgress: WeekProgressStat[];
  top10Habits: HabitStreakStat[];
}

export const AnalyticsSection: React.FC<AnalyticsSectionProps> = ({
  dailyPoints,
  weeklyProgress,
  top10Habits,
}) => {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Insights &amp; Analytics
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Performance trends, completion cycles, and consistency records
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Left 2 cols: Weekly Progress Breakdown with Bars & Mini Donuts */}
        <div className="lg:col-span-2">
          <WeeklyBarsChart
            dailyPoints={dailyPoints}
            weeklyProgress={weeklyProgress}
          />
        </div>

        {/* Right 1 col: Top 10 Habits Leaderboard */}
        <div className="lg:col-span-1">
          <Top10Leaderboard top10={top10Habits} />
        </div>
      </div>
    </section>
  );
};
