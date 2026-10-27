'use client';

import React from 'react';
import { DonutRing } from '../charts/DonutRing';
import { WeekColumn } from './WeekColumn';
import { WeeklyHabitsRechart } from '../charts/WeeklyHabitsRechart';
import { WeeklyHabit } from '../../types';
import { CalendarRange } from 'lucide-react';

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
      week: `week ${w}`,
      weekNum: w,
      completed: done,
      total: list.length || 5,
    };
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarRange className="w-5 h-5 text-blue-500" />
            Weekly Habits
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Checklist targets grouped across all 5 calendar weeks
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_220px] gap-6 items-stretch">
        {/* 1. Left Summary Donut Card */}
        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-colors duration-200">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800 text-xs font-bold tracking-wider uppercase text-blue-900 dark:text-blue-300">
            Weekly Progress
          </div>

          <div className="py-4 flex flex-col items-center justify-center flex-1 gap-4">
            <DonutRing
              percentage={percentage}
              size={104}
              strokeWidth={10}
              color="#3b82f6"
              trackColor="#e2e8f0"
              centerMain={`${percentage.toFixed(1)}%`}
              centerSub="Overall"
            />

            <div className="w-full flex flex-col gap-1.5 text-xs border-t border-slate-100 dark:border-slate-800 pt-3">
              <div className="flex justify-between text-slate-500 dark:text-slate-400 italic">
                <span>Completed</span>
                <strong className="text-slate-800 dark:text-white not-italic">{completed}</strong>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400 italic">
                <span>Remaining</span>
                <strong className="text-slate-800 dark:text-white not-italic">{incomplete}</strong>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400 italic">
                <span>Total tasks</span>
                <strong className="text-slate-800 dark:text-white not-italic">{total}</strong>
              </div>
            </div>
          </div>
        </article>

        {/* 2. Center 5-Week Checklist Grid */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 transition-colors duration-200">
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
        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col transition-colors duration-200 overflow-hidden">
          <WeeklyHabitsRechart data={chartData} />
        </article>
      </div>
    </section>
  );
};
