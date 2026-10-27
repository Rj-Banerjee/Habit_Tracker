'use client';

import React from 'react';
import { Modal } from '../ui/Modal';
import { DailyHabit } from '../../types';

interface QuickCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  todayFormatted: string;
  todayDateKey: string;
  habits: DailyHabit[];
  isCompleted: (habitId: string, dateKey: string) => boolean;
  onToggle: (habitId: string, dateKey: string) => void;
}

export const QuickCheckModal: React.FC<QuickCheckModalProps> = ({
  isOpen,
  onClose,
  todayFormatted,
  todayDateKey,
  habits,
  isCompleted,
  onToggle,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Today's Habit Checklist"
      maxWidth="max-w-lg"
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Quickly log completions for today: <strong className="text-slate-800 dark:text-white">{todayFormatted}</strong>
        </p>

        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
          {habits.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No habits added yet.</p>
          ) : (
            habits.map((h) => {
              const done = isCompleted(h.id, todayDateKey);
              return (
                <div
                  key={h.id}
                  onClick={() => onToggle(h.id, todayDateKey)}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all active:scale-[0.99] select-none ${
                    done
                      ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-100'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className={`text-sm font-semibold truncate pr-2 ${done ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                    {h.title}
                  </span>

                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                      done
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                    }`}
                    style={{
                      backgroundColor: done ? '#2563eb' : undefined,
                      borderColor: done ? '#2563eb' : undefined,
                    }}
                  >
                    {done && (
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current stroke-current">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
