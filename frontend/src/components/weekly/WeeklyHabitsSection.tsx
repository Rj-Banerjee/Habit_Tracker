'use client';

import React from 'react';
import { DonutRing } from '../charts/DonutRing';
import { WeekColumn } from './WeekColumn';
import { WeeklyHabitsRechart } from '../charts/WeeklyHabitsRechart';
import { WeeklyHabit } from '../../types';

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
    <section className="grid grid-cols-[220px_1fr_220px] gap-5 items-stretch">
      {/* 1. Left Summary Donut Card */}
      <article className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col">
        <div className="bg-blue-100/70 py-2 px-4 text-xs font-bold tracking-wider uppercase text-blue-900 border-b border-blue-200">
          WEEKLY HABITS
        </div>

        <div className="p-4 flex flex-col items-center justify-center flex-1 gap-4">
          <DonutRing
            percentage={percentage}
            size={110}
            strokeWidth={11}
            color="#93c5fd"
            trackColor="#dbeafe"
            centerMain={`${percentage.toFixed(1)}%`}
            centerSub="weekly progress"
          />

          <div className="w-full flex flex-col gap-1.5 text-xs border-t border-slate-100 pt-3">
            <div className="flex justify-between text-slate-500 italic">
              <span>% completed</span>
              <strong className="text-slate-800 not-italic">{percentage.toFixed(1)}%</strong>
            </div>
            <div className="flex justify-between text-slate-500 italic">
              <span>completed</span>
              <strong className="text-slate-800 not-italic">{completed}</strong>
            </div>
            <div className="flex justify-between text-slate-500 italic">
              <span>incomplete</span>
              <strong className="text-slate-800 not-italic">{incomplete}</strong>
            </div>
            <div className="flex justify-between text-slate-500 italic">
              <span>total habits</span>
              <strong className="text-slate-800 not-italic">{total}</strong>
            </div>
          </div>
        </div>
      </article>

      {/* 2. Center 5-Week Checklist Grid */}
      <div className="grid grid-cols-5 gap-3">
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
      <article className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col">
        <WeeklyHabitsRechart data={chartData} />
      </article>
    </section>
  );
};
