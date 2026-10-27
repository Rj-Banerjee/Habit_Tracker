'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Target,
  Shield,
  Clock,
  Download,
  CalendarCheck,
  LogOut,
  Check,
  Sparkles,
  Zap
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { DailyHabit } from '../../types';

interface ProfileSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  habits: DailyHabit[];
  totalDaysConquered: number;
}

export const ProfileSettingsDrawer: React.FC<ProfileSettingsDrawerProps> = ({
  isOpen,
  onClose,
  habits,
  totalDaysConquered,
}) => {
  const { user, signOut } = useAuth();
  const { success, info } = useToast();

  // Core focus state stored in localStorage
  const [coreFocus, setCoreFocus] = useState<string>('Becoming a disciplined & high-performing builder');
  const [isFocusSaved, setIsFocusSaved] = useState<boolean>(false);

  // Settings toggles
  const [strictMode, setStrictMode] = useState<boolean>(false);
  const [graceMode, setGraceMode] = useState<boolean>(true);

  // Load saved preferences on mount
  useEffect(() => {
    try {
      const savedFocus = localStorage.getItem('habit_tracker_core_focus');
      if (savedFocus) setCoreFocus(savedFocus);

      const savedStrict = localStorage.getItem('habit_tracker_strict_mode');
      if (savedStrict !== null) setStrictMode(savedStrict === 'true');

      const savedGrace = localStorage.getItem('habit_tracker_grace_mode');
      if (savedGrace !== null) setGraceMode(savedGrace === 'true');
    } catch {
      // LocalStorage access fallback
    }
  }, []);

  const handleSaveFocus = () => {
    try {
      localStorage.setItem('habit_tracker_core_focus', coreFocus);
      setIsFocusSaved(true);
      success('Core Focus updated!');
      setTimeout(() => setIsFocusSaved(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleToggleStrict = () => {
    const next = !strictMode;
    setStrictMode(next);
    localStorage.setItem('habit_tracker_strict_mode', String(next));
    info(`Strict Mode ${next ? 'Enabled' : 'Disabled'}`);
  };

  const handleToggleGrace = () => {
    const next = !graceMode;
    setGraceMode(next);
    localStorage.setItem('habit_tracker_grace_mode', String(next));
    info(`Grace Mode ${next ? 'Enabled' : 'Disabled'}`);
  };

  // 1. Export Data (CSV)
  const handleExportCSV = () => {
    try {
      const headers = ['Habit ID', 'Habit Title', 'Goal Days', 'Total Logs Tracked', 'Logs Completed'];
      const rows = habits.map((h) => {
        const completedCount = h.logs?.filter((l) => l.is_completed).length || 0;
        const totalLogs = h.logs?.length || 0;
        return [
          `"${h.id}"`,
          `"${h.title.replace(/"/g, '""')}"`,
          h.goal_days,
          totalLogs,
          completedCount,
        ];
      });

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `habit-tracker-export-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      success('Habit data exported to CSV successfully!');
    } catch (err) {
      // fallback
    }
  };

  // 2. Sync Calendar (iCal .ics generator)
  const handleSyncCalendar = () => {
    try {
      const icsLines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Habit Tracker Enterprise//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
      ];

      habits.forEach((h, idx) => {
        const now = new Date();
        const startStr = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        icsLines.push('BEGIN:VEVENT');
        icsLines.push(`UID:habit-${h.id}@habittracker.app`);
        icsLines.push(`DTSTAMP:${startStr}`);
        icsLines.push(`DTSTART:${startStr}`);
        icsLines.push(`SUMMARY:Daily Habit: ${h.title}`);
        icsLines.push(`DESCRIPTION:Habit goal: ${h.goal_days} days. Keep your daily streak active!`);
        icsLines.push('RRULE:FREQ=DAILY');
        icsLines.push('END:VEVENT');
      });

      icsLines.push('END:VCALENDAR');

      const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `habit-schedule.ics`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      success('Calendar schedule synced (.ics downloaded)!');
    } catch {
      // fallback
    }
  };

  if (!isOpen) return null;

  const displayName = user?.email
    ? user.email.split('@')[0].replace(/[._]/g, ' ')
    : 'Habit Achiever';
  const displayEmail = user?.email || 'demo@habittracker.com';
  const initialLetter = displayName.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Darkened Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-slate-950/40 dark:bg-black/60 backdrop-blur-xs transition-opacity animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Panel from Right */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <aside
          className="w-screen max-w-md bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between overflow-y-auto animate-slideInRight"
          role="dialog"
          aria-label="Profile and Settings Panel"
        >
          {/* 1. Header */}
          <div>
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <User className="w-4 h-4" />
                </span>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Profile & System Settings
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 2. Identity Section */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                {/* Large Profile Picture / Avatar */}
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center font-bold text-2xl shadow-md shadow-blue-500/20 select-none">
                    {initialLetter}
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" title="Active status" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white capitalize truncate">
                    {displayName}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {displayEmail}
                  </p>
                  <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold border border-emerald-200 dark:border-emerald-800/60">
                    <Zap className="w-3 h-3 fill-current" />
                    <span>{totalDaysConquered} Completions Logged</span>
                  </div>
                </div>
              </div>

              {/* Editable "My Core Focus" */}
              <div className="mt-5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="core-focus-input"
                    className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                  >
                    <Target className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>My Core Focus</span>
                  </label>
                  {isFocusSaved && (
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-fadeIn">
                      <Check className="w-3 h-3" /> Saved
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    id="core-focus-input"
                    type="text"
                    value={coreFocus}
                    onChange={(e) => setCoreFocus(e.target.value)}
                    onBlur={handleSaveFocus}
                    placeholder="e.g. Becoming a marathon runner"
                    className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500 transition-colors shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={handleSaveFocus}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors shadow-xs shrink-0"
                  >
                    Save
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  This North Star intention anchors your daily habit consistency.
                </p>
              </div>
            </div>

            {/* 3. Settings Section (Aesthetic Toggle Switches) */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3.5">
                Tracking Rules & Automation
              </h4>

              <div className="flex flex-col gap-4">
                {/* Strict Mode Toggle */}
                <div className="flex items-start justify-between gap-4 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                  <div className="flex gap-3">
                    <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0">
                      <Shield className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Strict Mode
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        Breaks active streak at midnight if daily goals are incomplete.
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={strictMode}
                    onClick={handleToggleStrict}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      strictMode ? 'bg-amber-600' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        strictMode ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Grace Mode Toggle */}
                <div className="flex items-start justify-between gap-4 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                  <div className="flex gap-3">
                    <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shrink-0">
                      <Clock className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Grace Mode
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        Allows 24-hour back-logging for missed days without resetting streaks.
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={graceMode}
                    onClick={handleToggleGrace}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      graceMode ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        graceMode ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* 4. Actions Section (Export CSV & Calendar Sync) */}
            <div className="p-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3.5">
                Integrations & Backup
              </h4>

              <div className="grid grid-cols-2 gap-3">
                {/* Export Data (CSV) Button */}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-center group shadow-xs active:scale-95"
                >
                  <Download className="w-5 h-5 text-blue-600 dark:text-blue-400 mb-1.5 group-hover:-translate-y-0.5 transition-transform" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Export Data (CSV)
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    Download spreadsheet
                  </span>
                </button>

                {/* Sync Calendar Button */}
                <button
                  type="button"
                  onClick={handleSyncCalendar}
                  className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all text-center group shadow-xs active:scale-95"
                >
                  <CalendarCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mb-1.5 group-hover:-translate-y-0.5 transition-transform" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Sync Calendar
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    Apple / Google iCal (.ics)
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* 5. Footer Sign Out */}
          <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <button
              type="button"
              onClick={() => {
                signOut();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors shadow-xs"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out of Habit Tracker</span>
            </button>
            <p className="text-center text-[10px] text-slate-400 mt-2.5">
              Habit Tracker Enterprise v2.0 • Supabase PostgreSQL Session
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};
