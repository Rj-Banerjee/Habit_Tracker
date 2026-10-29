'use client';

import React from 'react';
import { DonutRing } from '../charts/DonutRing';
import { WeekColumn } from './WeekColumn';
import { WeeklyHabitsRechart } from '../charts/WeeklyHabitsRechart';
import { WeeklyHabit } from '../../types';
import { CalendarRange, CheckCircle2 } from 'lucide-react';

interface WeeklyHabitsSectionProps {
  weeklyHabits: WeeklyHabit[];
  onToggleWeekly: (id: string) => void;
  onDeleteWeekly: (id: string) => void;
  onAddWeekly: (title: string, weekNum: number) => void;
}

export const WeeklyHabitsSection: React.FC<WeeklyHabitsSectionProps> = ({
  weeklyHabits,
  onToggleWeekly,
  onDeleteWeekly,
  onAddWeekly,
}) => {
  const total = weeklyHabits.length;
  const completed = weeklyHabits.filter((w) => w.is_completed).length;
  const incomplete = total - completed;
  const percentage = total > 0 ? (completed / total) * 100 : 0;

  // Chart data for 5 weeks
  const chartData = [1, 2, 3, 4, 5].map((w) => {
    const list = weeklyHabits.filter((h) => h.week_number === w);
    const done = list.filter((h) => h.is_completed).length;
    return {
      week: `Week ${w}`,
      weekNum: w,
      completed: done,
      total: list.length || 1,
    };
  });

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarRange className="w-5 h-5 text-blue-500" />
            Weekly Habits
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Checklist targets grouped across all 5 calendar weeks
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 text-xs font-semibold text-blue-600 dark:text-blue-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {completed} of {total} done ({Math.round(percentage)}%)
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr_230px] gap-5 items-stretch">
        {/* 1. Left Summary Donut Card */}
        <article className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-colors duration-200">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-slate-200">
              Overview
            </span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
              {Math.round(percentage)}%
            </span>
          </div>

          <div className="py-4 flex flex-col items-center justify-center flex-1 gap-4">
            <DonutRing
              percentage={percentage}
              size={104}
              strokeWidth={10}
              color="#3b82f6"
              trackColor="#e2e8f0"
              centerMain={`${Math.round(percentage)}%`}
              centerSub="Done"
            />

            <div className="w-full flex flex-col gap-2 text-xs border-t border-slate-100 dark:border-slate-800 pt-3">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>Completed</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{completed}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>Remaining</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{incomplete}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>Total tasks</span>
                <span className="font-semibold text-slate-800 dark:text-white">{total}</span>
              </div>
            </div>
          </div>
        </article>

        {/* 2. Center 5-Week Checklist Grid */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 transition-colors duration-200">
          {[1, 2, 3, 4, 5].map((w) => (
            <WeekColumn
              key={w}
              weekNum={w}
              habits={weeklyHabits.filter((h) => h.week_number === w)}
              onToggle={onToggleWeekly}
              onDelete={onDeleteWeekly}
              onAdd={onAddWeekly}
            />
          ))}
        </div>

        {/* 3. Right Recharts Vertical Bar Chart */}
        <article className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col transition-colors duration-200 overflow-hidden">
          <WeeklyHabitsRechart data={chartData} />
        </article>
      </div>
    </section>
  );
};