'use client';

import React from 'react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useAuth } from '../../hooks/useAuth';

interface AppHeaderProps {
  todayFormatted: string;
  onOpenProfile: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ todayFormatted, onOpenProfile }) => {
  const { user } = useAuth();
  const initial = user?.email?.charAt(0).toUpperCase() ?? '?';

  return (
    <header className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Habit tracker</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">{todayFormatted}</p>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Open settings"
          className="w-9 h-9 rounded-full bg-slate-900 dark:bg-slate-700 text-white text-sm font-bold"
        >
          {initial}
        </button>
      </div>
    </header>
  );
};
