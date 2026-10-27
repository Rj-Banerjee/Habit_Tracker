'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
    <div className="grid grid-cols-[220px_1fr] gap-5 h-full">
      {/* 1. Monthly Habits Donut Card */}
      <article className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col">
        <div className="bg-pink-100/70 py-2 px-4 text-xs font-bold tracking-wider uppercase text-pink-900 border-b border-pink-200">
          MONTHLY HABITS
        </div>

        <div className="p-4 flex flex-col items-center justify-center flex-1">
          <DonutRing
            percentage={percentage}
            size={110}
            strokeWidth={11}
            color="#f472b6"
            trackColor="#fce7f3"
            centerMain={`${percentage}%`}
            centerSub={`${completed} / ${total} completed`}
          />
        </div>
      </article>

      {/* 2. Monthly Habits Checklist Card */}
      <article className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
        <div className="flex flex-col gap-2.5">
          {/* Progress Mini Bar Header */}
          <div className="flex items-center justify-between text-xs italic text-slate-500">
            <span>progress</span>
            <span className="font-bold text-pink-600 not-italic">{percentage}%</span>
          </div>

          <div className="w-full h-2.5 bg-pink-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-pink-500 rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Checklist rows */}
          <div className="flex flex-col gap-2 mt-2">
            {monthlyHabits.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 group text-xs cursor-pointer select-none"
              >
                <button
                  type="button"
                  onClick={() => onToggleMonthly(item.id)}
                  className={`w-4 h-4 rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${
                    item.is_completed
                      ? 'bg-pink-600 border-pink-600 text-white'
                      : 'bg-white border-slate-300 hover:border-slate-400'
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
                    item.is_completed ? 'line-through text-slate-400 italic' : 'text-slate-700'
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
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Add item button */}
        <div className="mt-3 pt-2 border-t border-slate-100">
          {isAdding ? (
            <form onSubmit={handleAddSubmit} className="flex gap-1.5">
              <input
                type="text"
                autoFocus
                placeholder="New monthly milestone..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full text-xs px-2.5 py-1 border border-slate-300 rounded outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-slate-900 text-white rounded text-xs font-semibold"
              >
                Add
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="w-full py-1 text-center text-xs text-slate-500 hover:text-slate-800 border border-dashed border-slate-200 hover:border-slate-300 rounded flex items-center justify-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Monthly Habit</span>
            </button>
          )}
        </div>
      </article>
    </div>
  );
};
