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
        <p className="text-xs text-slate-500">
          Quickly log completions for today: <strong className="text-slate-800">{todayFormatted}</strong>
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
                  className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                    done
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className={`text-sm font-medium ${done ? 'line-through text-slate-500' : ''}`}>
                    {h.title}
                  </span>

                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                      done
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-slate-300'
                    }`}
                  >
                    {done && (
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current stroke-current">
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
