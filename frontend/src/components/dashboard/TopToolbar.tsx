'use client';

import React from 'react';
import { Calendar, CheckCircle2, Printer, LogOut } from 'lucide-react';
import { Button } from '../ui/Button';
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
    <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-white border border-slate-200 rounded-xl shadow-xs">
      {/* Today Pill & Quick Nav */}
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
          <span>Today: {todayFormatted}</span>
        </div>

        <Button
          onClick={onJumpToday}
          variant="secondary"
          size="sm"
          className="text-xs text-slate-700"
        >
          <Calendar className="w-3.5 h-3.5 text-blue-600" />
          <span>Go to Today</span>
        </Button>

        <Button
          onClick={onOpenQuickLog}
          variant="primary"
          size="sm"
          className="text-xs bg-slate-900 text-white hover:bg-slate-800"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Quick Log for Today</span>
        </Button>
      </div>

      {/* Utilities & User Status */}
      <div className="flex items-center gap-2">
        <Button
          onClick={() => window.print()}
          variant="secondary"
          size="sm"
          className="text-xs text-slate-600"
          title="Print or export to PDF"
        >
          <Printer className="w-3.5 h-3.5 text-slate-500" />
          <span>Print / PDF</span>
        </Button>

        {user ? (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <span className="text-xs text-slate-500 hidden sm:inline" title={user.email}>
              {user.email}
            </span>
            <Button
              onClick={() => signOut()}
              variant="ghost"
              size="sm"
              className="text-xs text-slate-500 hover:text-rose-600"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <a
            href="/login"
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 px-2 py-1"
          >
            Sign In
          </a>
        )}
      </div>
    </header>
  );
};
