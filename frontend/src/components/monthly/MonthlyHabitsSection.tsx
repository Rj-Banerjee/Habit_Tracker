'use client';

import React, { useState } from 'react';
import { Plus, Trash2, CalendarCheck } from 'lucide-react';
import { DonutRing } from '../charts/DonutRing';
import { MonthlyHabit } from '../../types';

interface MonthlyHabitsSectionProps {
  monthlyHabits: MonthlyHabit[];
  onToggleMonthly: (id: string) => void;
  onDeleteMonthly: (id: string) => void;
  onAddMonthly: (title: string) => void;
}

export const MonthlyHabitsSection: React.FC<MonthlyHabitsSectionProps> = ({
  monthlyHabits,
  onToggleMonthly,
  onDeleteMonthly,
  onAddMonthly,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const total = monthlyHabits.length;
  const completed = monthlyHabits.filter((m) => m.is_completed).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddMonthly(newTitle.trim());
    setNewTitle('');
    setIsAdding(false);
  };

  return (
    <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between h-full transition-colors duration-200">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-pink-500" />
            <h3 className="font-bold text-sm tracking-wide text-slate-900 dark:text-white uppercase">
              Monthly Milestones
            </h3>
          </div>
          <span className="text-xs font-bold text-pink-600 dark:text-pink-400">
            {completed} of {total} done ({percentage}%)
          </span>
        </div>

        {/* Top Progress mini bar & Donut summary */}
        <div className="grid grid-cols-[1fr_80px] gap-4 items-center py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              <span>Goal Progress</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{percentage}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-pink-500 dark:bg-pink-400 rounded-full transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <DonutRing
              percentage={percentage}
              size={64}
              strokeWidth={7}
              color="#ec4899"
              trackColor="#fce7f3"
              centerMain={`${percentage}%`}
            />
          </div>
        </div>

        {/* Checklist rows */}
        <div className="flex flex-col gap-2.5 mt-3">
          {monthlyHabits.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2.5 group text-xs cursor-pointer select-none p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <button
                type="button"
                onClick={() => onToggleMonthly(item.id)}
                className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                  item.is_completed
                    ? 'bg-pink-600 border-pink-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-slate-400'
                }`}
              >
                {item.is_completed && (
                  <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-current">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
              </button>

              <span
                onClick={() => onToggleMonthly(item.id)}
                className={`flex-1 leading-snug ${
                  item.is_completed
                    ? 'line-through text-slate-400 dark:text-slate-500 italic'
                    : 'text-slate-700 dark:text-slate-200 font-medium'
                }`}
              >
                {item.title}
              </span>

              <button
                type="button"
                onClick={() => onDeleteMonthly(item.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 rounded transition-opacity"
                title="Delete item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add item button */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
        {isAdding ? (
          <form onSubmit={handleAddSubmit} className="flex gap-2">
            <input
              type="text"
              autoFocus
              placeholder="New monthly milestone..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:border-pink-500 text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-slate-900 dark:bg-pink-600 text-white rounded-xl text-xs font-semibold shrink-0"
            >
              Add
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="w-full py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border border-dashed border-slate-200 dark:border-slate-700 hover:border-slate-300 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Monthly Milestone</span>
          </button>
        )}
      </div>
    </article>
  );
};
