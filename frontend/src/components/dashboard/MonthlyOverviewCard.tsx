'use client';

import React from 'react';
import { MONTH_NAMES } from '../../utils/dateUtils';
import { AreaProgressChart } from '../charts/AreaProgressChart';
import { DonutRing } from '../charts/DonutRing';
import { DayProgressPoint } from '../../types';
import { TrendingUp, CheckCircle, Target } from 'lucide-react';

interface MonthlyOverviewCardProps {
  year: number;
  month: number;
  onYearChange: (y: number) => void;
  onMonthChange: (m: number) => void;
  dailyProgress: DayProgressPoint[];
  overallPercentage: number;
  totalCompletions: number;
  totalPossible: number;
}

export const MonthlyOverviewCard: React.FC<MonthlyOverviewCardProps> = ({
  year,
  month,
  onYearChange,
  onMonthChange,
  dailyProgress,
  overallPercentage,
  totalCompletions,
  totalPossible,
}) => {
  const monthName = MONTH_NAMES[month - 1] || 'Month';
  const years = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

  return (
    <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between h-full transition-colors duration-200">
      {/* Top Header: Title & Month/Year Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {monthName}
            </h1>
            <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">
              {year}
            </span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
            Monthly Habit Overview
          </p>
        </div>

        {/* Date Selectors Pill */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700">
          <select
            value={month}
            onChange={(e) => onMonthChange(Number(e.target.value))}
            className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 outline-none cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
            aria-label="Select month"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => onYearChange(Number(e.target.value))}
            className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 outline-none cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
            aria-label="Select year"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Middle: Area Progress Trend Chart with ResponsiveContainer */}
      <div className="py-4">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
          <span className="font-medium flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
            Daily Habit Completion Trajectory
          </span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {dailyProgress.length} Days Tracked
          </span>
        </div>
        <div className="w-full h-24 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/30 p-2 border border-slate-100 dark:border-slate-800/80">
          <AreaProgressChart data={dailyProgress} height={80} />
        </div>
      </div>

      {/* Bottom: High-Level Progress Stats & Donut */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 items-center">
        {/* Metric 1: Overall Percentage */}
        <div className="flex items-center gap-3.5 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
          <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
              Daily Progress
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">
              {overallPercentage.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Metric 2: Completed / Total Habits */}
        <div className="flex items-center gap-3.5 p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
              Total Habits
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">
              {totalCompletions} <span className="text-sm font-normal text-slate-400">/ {totalPossible}</span>
            </div>
          </div>
        </div>

        {/* Metric 3: Donut Progress Ring */}
        <div className="flex items-center justify-center sm:justify-end">
          <DonutRing
            percentage={overallPercentage}
            size={90}
            strokeWidth={9}
            color="#3b82f6"
            trackColor="#e2e8f0"
            centerMain={`${Math.round(overallPercentage)}%`}
            centerSub="Monthly"
            subAbove={false}
          />
        </div>
      </div>
    </article>
  );
};
