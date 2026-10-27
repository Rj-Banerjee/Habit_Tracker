'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { WEEK_PALETTES } from '../../utils/colors';
import { WeeklyHabit } from '../../types';

interface WeekColumnProps {
  weekNum: number;
  habits: WeeklyHabit[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (title: string, weekNum: number) => void;
}

export const WeekColumn: React.FC<WeekColumnProps> = ({
  weekNum,
  habits,
  onToggle,
  onDelete,
  onAdd,
}) => {
  const palette = WEEK_PALETTES[weekNum] || WEEK_PALETTES[1];
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAdd(newTitle.trim(), weekNum);
    setNewTitle('');
    setIsAdding(false);
  };

  const headerBgs: Record<number, string> = {
    1: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    2: 'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300',
    3: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300',
    4: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
    5: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300',
  };

  return (
    <div className="bg-slate-50/60 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col h-full transition-colors">
      {/* Header */}
      <div className={`py-1.5 px-3 font-serif italic text-xs font-semibold text-center ${headerBgs[weekNum] || 'bg-slate-100 text-slate-700'}`}>
        week {weekNum}
      </div>

      {/* Checklist items */}
      <div className="p-3 flex flex-col gap-2 flex-1 justify-between">
        <div className="flex flex-col gap-2">
          {habits.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-2 group text-xs cursor-pointer select-none"
            >
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                className={`w-4 h-4 mt-0.5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                  item.is_completed
                    ? `${palette.checkboxActive} text-white`
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
                onClick={() => onToggle(item.id)}
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
                onClick={() => onDelete(item.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 rounded transition-opacity"
                title="Delete item"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Add item button / input */}
        <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
          {isAdding ? (
            <form onSubmit={handleAddSubmit} className="flex gap-1">
              <input
                type="text"
                autoFocus
                placeholder="New habit..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="px-2 py-1 bg-slate-900 dark:bg-blue-600 text-white rounded-lg text-xs font-semibold"
              >
                Add
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="w-full py-1 text-center text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border border-dashed border-slate-200 dark:border-slate-700 hover:border-slate-300 rounded-lg flex items-center justify-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
