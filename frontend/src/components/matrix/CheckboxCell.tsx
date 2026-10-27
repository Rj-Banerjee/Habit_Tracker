'use client';

import React from 'react';
import { WEEK_PALETTES } from '../../utils/colors';

interface CheckboxCellProps {
  habitId: string;
  dateKey: string;
  weekIndex: number;
  isCompleted: boolean;
  onToggle: (habitId: string, dateKey: string) => void;
  title?: string;
}

export const CheckboxCell: React.FC<CheckboxCellProps> = ({
  habitId,
  dateKey,
  weekIndex,
  isCompleted,
  onToggle,
  title,
}) => {
  const palette = WEEK_PALETTES[weekIndex] || WEEK_PALETTES[1];

  return (
    <button
      type="button"
      onClick={() => onToggle(habitId, dateKey)}
      title={title}
      className={`w-5 h-5 mx-auto rounded-md transition-all duration-200 flex items-center justify-center select-none active:scale-90 ${
        isCompleted
          ? `${palette.checkboxActive} text-white shadow-xs`
          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 hover:scale-105'
      }`}
      aria-label={title}
    >
      {isCompleted && (
        <svg
          viewBox="0 0 24 24"
          className="w-3.5 h-3.5 fill-current stroke-current stroke-1 animate-scaleIn"
        >
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      )}
    </button>
  );
};
