'use client';

import React from 'react';

interface CheckboxCellProps {
  habitId: string;
  dateKey: string;
  weekIndex: number;
  isCompleted: boolean;
  onToggle: (habitId: string, dateKey: string) => void;
  title?: string;
}

// 5-Week visual themes with explicit static class strings (for Tailwind static analysis)
// and precise hex colors for bulletproof inline-style rendering across all months & views.
export const WEEK_CHECKBOX_THEMES: Record<
  number,
  { bg: string; border: string; activeClass: string }
> = {
  1: {
    bg: '#2563eb', // Soft Sky Blue
    border: '#2563eb',
    activeClass: 'bg-blue-600 border-blue-600 text-white',
  },
  2: {
    bg: '#db2777', // Blush Pink
    border: '#db2777',
    activeClass: 'bg-pink-600 border-pink-600 text-white',
  },
  3: {
    bg: '#0d9488', // Mint Teal
    border: '#0d9488',
    activeClass: 'bg-teal-600 border-teal-600 text-white',
  },
  4: {
    bg: '#d97706', // Golden Apricot
    border: '#d97706',
    activeClass: 'bg-amber-600 border-amber-600 text-white',
  },
  5: {
    bg: '#4f46e5', // Periwinkle Blue / Indigo
    border: '#4f46e5',
    activeClass: 'bg-indigo-600 border-indigo-600 text-white',
  },
};

export const CheckboxCell: React.FC<CheckboxCellProps> = ({
  habitId,
  dateKey,
  weekIndex,
  isCompleted,
  onToggle,
  title,
}) => {
  const theme = WEEK_CHECKBOX_THEMES[weekIndex] || WEEK_CHECKBOX_THEMES[1];

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isCompleted}
      onClick={() => onToggle(habitId, dateKey)}
      title={title}
      className={`w-5 h-5 mx-auto rounded-md border transition-all duration-200 flex items-center justify-center select-none active:scale-90 ${
        isCompleted
          ? `${theme.activeClass} shadow-xs hover:brightness-110`
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 hover:border-slate-400 dark:hover:border-slate-500 hover:scale-105'
      }`}
      style={{
        backgroundColor: isCompleted ? theme.bg : undefined,
        borderColor: isCompleted ? theme.border : undefined,
      }}
      aria-label={title}
    >
      {isCompleted && (
        <svg
          viewBox="0 0 24 24"
          className="w-3.5 h-3.5 fill-current stroke-current stroke-1 animate-scaleIn text-white"
        >
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      )}
    </button>
  );
};
