'use client';

import React from 'react';
import { Calendar, CheckCircle2, Printer, LogOut } from 'lucide-react';
import { Button } from '../ui/Button';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useAuth } from '../../hooks/useAuth';

interface TopToolbarProps {
  todayFormatted: string;
  onJumpToday: () => void;
  onOpenQuickLog: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  todayFormatted,
  onJumpToday,
  onOpenQuickLog,
}) => {
  const { user, signOut } = useAuth();

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm transition-colors duration-200">
      {/* Today Pill & Navigation */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80">
          <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
          <span>Today: {todayFormatted}</span>
        </div>

        <Button
          onClick={onJumpToday}
          variant="secondary"
          size="sm"
          className="text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80"
        >
          <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Go to Today</span>
        </Button>

        <Button
          onClick={onOpenQuickLog}
          variant="primary"
          size="sm"
          className="text-xs bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-500 shadow-sm"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-300" />
          <span>Quick Log</span>
        </Button>
      </div>

      {/* Utilities, Dark Mode & User Profile */}
      <div className="flex items-center gap-2">
        <ThemeToggle />

        <Button
          onClick={() => window.print()}
          variant="secondary"
          size="sm"
          className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 hidden sm:inline-flex"
          title="Print or export to PDF"
        >
          <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span>Print</span>
        </Button>

        {user ? (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden md:inline truncate max-w-[160px]" title={user.email}>
              {user.email}
            </span>
            <Button
              onClick={() => signOut()}
              variant="ghost"
              size="sm"
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <a
            href="/login"
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline px-2 py-1"
          >
            Sign In
          </a>
        )}
      </div>
    </header>
  );
};
