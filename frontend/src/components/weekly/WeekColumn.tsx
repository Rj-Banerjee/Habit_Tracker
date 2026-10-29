'use client';

import React, { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { WeeklyHabit } from '../../types';

interface WeekColumnProps {
  weekNum: number;
  habits: WeeklyHabit[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (title: string, weekNum: number) => void;
}

interface WeekTheme {
  name: string;
  gradientTop: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
  checkActive: string;
  progressBar: string;
  hoverBorder: string;
}

const WEEK_THEMES: Record<number, WeekTheme> = {
  1: {
    name: 'Week 1',
    gradientTop: 'from-blue-500 to-indigo-500',
    pillBg: 'bg-blue-50 dark:bg-blue-950/50',
    pillText: 'text-blue-600 dark:text-blue-400',
    pillBorder: 'border-blue-200 dark:border-blue-900/60',
    checkActive: 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/25',
    progressBar: 'bg-blue-500',
    hoverBorder: 'hover:border-blue-300 dark:hover:border-blue-800/80',
  },
  2: {
    name: 'Week 2',
    gradientTop: 'from-pink-500 to-rose-500',
    pillBg: 'bg-pink-50 dark:bg-pink-950/50',
    pillText: 'text-pink-600 dark:text-pink-400',
    pillBorder: 'border-pink-200 dark:border-pink-900/60',
    checkActive: 'bg-pink-600 border-pink-600 text-white shadow-sm shadow-pink-500/25',
    progressBar: 'bg-pink-500',
    hoverBorder: 'hover:border-pink-300 dark:hover:border-pink-800/80',
  },
  3: {
    name: 'Week 3',
    gradientTop: 'from-teal-500 to-emerald-500',
    pillBg: 'bg-teal-50 dark:bg-teal-950/50',
    pillText: 'text-teal-600 dark:text-teal-400',
    pillBorder: 'border-teal-200 dark:border-teal-900/60',
    checkActive: 'bg-teal-600 border-teal-600 text-white shadow-sm shadow-teal-500/25',
    progressBar: 'bg-teal-500',
    hoverBorder: 'hover:border-teal-300 dark:hover:border-teal-800/80',
  },
  4: {
    name: 'Week 4',
    gradientTop: 'from-amber-500 to-orange-500',
    pillBg: 'bg-amber-50 dark:bg-amber-950/50',
    pillText: 'text-amber-600 dark:text-amber-400',
    pillBorder: 'border-amber-200 dark:border-amber-900/60',
    checkActive: 'bg-amber-600 border-amber-600 text-white shadow-sm shadow-amber-500/25',
    progressBar: 'bg-amber-500',
    hoverBorder: 'hover:border-amber-300 dark:hover:border-amber-800/80',
  },
  5: {
    name: 'Week 5',
    gradientTop: 'from-indigo-500 to-violet-500',
    pillBg: 'bg-indigo-50 dark:bg-indigo-950/50',
    pillText: 'text-indigo-600 dark:text-indigo-400',
    pillBorder: 'border-indigo-200 dark:border-indigo-900/60',
    checkActive: 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-500/25',
    progressBar: 'bg-indigo-500',
    hoverBorder: 'hover:border-indigo-300 dark:hover:border-indigo-800/80',
  },
};

export const WeekColumn: React.FC<WeekColumnProps> = ({
  weekNum,
  habits,
  onToggle,
  onDelete,
  onAdd,
}) => {
  const theme = WEEK_THEMES[weekNum] || WEEK_THEMES[1];
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const completedCount = habits.filter((h) => h.is_completed).length;
  const totalCount = habits.length;
  const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isAllDone = totalCount > 0 && completedCount === totalCount;

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAdd(newTitle.trim(), weekNum);
    setNewTitle('');
    setIsAdding(false);
  };

  return (
    <div
      className={`relative flex flex-col h-full rounded-2xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 ${theme.hoverBorder} transition-all duration-200 shadow-sm hover:shadow-md overflow-hidden group/col`}
    >
      {/* Top accent gradient bar */}
      <div className={`h-1 w-full bg-gradient-to-r ${theme.gradientTop}`} />

      {/* Header */}
      <div className="p-3.5 pb-3 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center justify-between gap-1.5">
          <span
            className={`text-[11px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full border ${theme.pillBg} ${theme.pillText} ${theme.pillBorder}`}
          >
            Week {weekNum}
          </span>

          {isAllDone ? (
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded-full flex items-center gap-1">
              Done ✓
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>

        {/* Micro progress meter */}
        <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2.5">
          <div
            className={`h-full transition-all duration-300 rounded-full ${theme.progressBar}`}
            style={{ width: `${completionPercent}%` }}
          />
        </div>
      </div>

      {/* Habits List */}
      <div className="p-3 flex flex-col flex-1 justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          {habits.length === 0 ? (
            <div className="py-8 px-2 text-center flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-1 select-none">
              <span className="text-xs font-medium">No habits yet</span>
              <span className="text-[10px] text-slate-400/80 dark:text-slate-500/80">Add one below</span>
            </div>
          ) : (
            habits.map((item) => (
              <div
                key={item.id}
                onClick={() => onToggle(item.id)}
                className="group/item flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-100/70 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-200/50 dark:hover:border-slate-700/50 transition-all duration-150 cursor-pointer select-none"
              >
                {/* Custom Checkbox */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(item.id);
                  }}
                  className={`w-4 h-4 mt-0.5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                    item.is_completed
                      ? theme.checkActive
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-400'
                  }`}
                  aria-label={item.is_completed ? 'Mark incomplete' : 'Mark complete'}
                >
                  {item.is_completed && <Check className="w-2.5 h-2.5 stroke-[3] text-white" />}
                </button>

                {/* Habit Title */}
                <span
                  className={`flex-1 text-xs leading-snug transition-colors ${
                    item.is_completed
                      ? 'line-through text-slate-400 dark:text-slate-500 font-normal'
                      : 'text-slate-700 dark:text-slate-200 font-medium'
                  }`}
                >
                  {item.title}
                </span>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="opacity-0 group-hover/item:opacity-100 p-1 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all shrink-0"
                  title="Delete habit"
                  aria-label="Delete habit"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add Habit section */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
          {isAdding ? (
            <form onSubmit={handleAddSubmit} className="space-y-2 p-1.5 bg-white dark:bg-slate-800/90 rounded-xl border border-blue-500/30 dark:border-blue-500/40 shadow-sm">
              <input
                type="text"
                autoFocus
                placeholder="New habit..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsAdding(false);
                    setNewTitle('');
                  }
                }}
                className="w-full text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 dark:focus:border-blue-400 text-slate-900 dark:text-white placeholder:text-slate-400"
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setNewTitle('');
                  }}
                  className="px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-md text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  Add
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="w-full py-2 px-3 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 border border-dashed border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Habit</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};