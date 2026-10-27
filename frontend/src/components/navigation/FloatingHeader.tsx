'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Search,
  Sparkles,
  Command,
  Flame,
  Calendar
} from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { NotificationDropdown } from './NotificationDropdown';
import { useAuth } from '../../hooks/useAuth';

interface FloatingHeaderProps {
  todayFormatted: string;
  onOpenQuickLog: () => void;
  onOpenSearch: () => void;
  onOpenProfile: () => void;
  onJumpToday: () => void;
}

export const FloatingHeader: React.FC<FloatingHeaderProps> = ({
  todayFormatted,
  onOpenQuickLog,
  onOpenSearch,
  onOpenProfile,
  onJumpToday,
}) => {
  const { user } = useAuth();
  const [greeting, setGreeting] = useState<string>('Good morning');

  // Dynamic greeting based on current local time
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setGreeting('Good morning');
    } else if (hour < 18) {
      setGreeting('Good afternoon');
    } else {
      setGreeting('Good evening');
    }
  }, []);

  const userName = user?.email
    ? user.email.split('@')[0].split(/[._]/)[0]
    : 'Achiever';
  const capitalizedName = userName.charAt(0).toUpperCase() + userName.slice(1);
  const initialLetter = capitalizedName.charAt(0);

  return (
    <header
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-7xl rounded-full bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/40 dark:border-slate-800 shadow-lg shadow-black/5 dark:shadow-black/30 px-3.5 sm:px-5 py-2.5 transition-all duration-200"
      role="banner"
    >
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* =========================================
            LEFT SECTION: Minimalist Brand Logo & Dynamic Greeting
           ========================================= */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          {/* Minimalist Brand Logo Icon */}
          <div
            onClick={onJumpToday}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-teal-400 p-0.5 flex items-center justify-center cursor-pointer shadow-sm hover:scale-105 transition-transform"
            title="Habit Tracker - Go to Today"
          >
            <div className="w-full h-full bg-white dark:bg-slate-900 rounded-full flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          {/* Dynamic Greeting & User Name */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                {greeting},{' '}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent capitalize">
                  {capitalizedName}
                </span>
              </span>
            </div>
            <div className="hidden md:flex items-center gap-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{todayFormatted}</span>
            </div>
          </div>
        </div>

        {/* =========================================
            CENTER SECTION: Glowing Quick Log & Stylized Search Input Bar
           ========================================= */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Glowing Primary "Quick Log" Button */}
          <button
            type="button"
            onClick={onOpenQuickLog}
            className="relative group inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-bold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 shadow-md shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 select-none overflow-hidden"
            title="Open Today's Quick Log Modal"
          >
            <span className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            <span className="hidden xs:inline tracking-wide">Quick Log</span>
          </button>

          {/* Stylized Search Input Bar with "Cmd+K to jump anywhere" */}
          <div
            onClick={onOpenSearch}
            className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer transition-all duration-200 shadow-inner group"
            title="Press Cmd+K to search habits and jump anywhere"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium select-none truncate max-w-[150px] lg:max-w-[210px]">
              Search or jump anywhere...
            </span>
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-700 border border-slate-200/80 dark:border-slate-600 text-[10px] font-mono text-slate-500 dark:text-slate-300 shadow-xs">
              <Command className="w-2.5 h-2.5" />
              <span>K</span>
            </div>
          </div>
        </div>

        {/* =========================================
            RIGHT SECTION: Notification Bell, Theme Toggle & Avatar
           ========================================= */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Notification Bell Dropdown */}
          <NotificationDropdown />

          {/* Sun/Moon Light/Dark Mode Toggle */}
          <ThemeToggle />

          {/* High-Quality Circular User Avatar Button */}
          <button
            type="button"
            onClick={onOpenProfile}
            className="relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-bold text-xs shadow-sm hover:ring-2 hover:ring-blue-400 dark:hover:ring-blue-500 hover:scale-105 active:scale-95 transition-all select-none focus:outline-none"
            title="Open Profile & Settings"
            aria-label="User profile settings"
          >
            <span>{initialLetter}</span>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
          </button>
        </div>
      </div>
    </header>
  );
};
