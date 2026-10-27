'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, Calendar, CheckCircle2, User, Moon, Sun, Download, ArrowRight, X } from 'lucide-react';
import { DailyHabit } from '../../types';
import { useTheme } from '../../hooks/useTheme';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  habits: DailyHabit[];
  onOpenQuickLog: () => void;
  onJumpToday: () => void;
  onOpenProfile: () => void;
  onExportCSV: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  habits,
  onOpenQuickLog,
  onJumpToday,
  onOpenProfile,
  onExportCSV,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Global shortcut Cmd+K / Ctrl+K & Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Can be toggled from parent
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const quickActions = [
    {
      id: 'quick-log',
      title: 'Quick Log for Today',
      subtitle: 'Mark habits completed in 1-click',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      action: () => {
        onClose();
        onOpenQuickLog();
      },
    },
    {
      id: 'jump-today',
      title: 'Go to Today',
      subtitle: 'Scroll directly to today’s column',
      icon: <Calendar className="w-4 h-4 text-blue-500" />,
      action: () => {
        onClose();
        onJumpToday();
      },
    },
    {
      id: 'profile',
      title: 'Profile & Settings',
      subtitle: 'Edit core focus, strict mode & preferences',
      icon: <User className="w-4 h-4 text-purple-500" />,
      action: () => {
        onClose();
        onOpenProfile();
      },
    },
    {
      id: 'theme',
      title: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
      subtitle: 'Toggle dashboard appearance',
      icon: theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />,
      action: () => {
        toggleTheme();
        onClose();
      },
    },
    {
      id: 'export-csv',
      title: 'Export Habit Data (CSV)',
      subtitle: 'Download complete habit logs spreadsheet',
      icon: <Download className="w-4 h-4 text-indigo-500" />,
      action: () => {
        onClose();
        onExportCSV();
      },
    },
  ];

  const filteredHabits = query.trim()
    ? habits.filter((h) => h.title.toLowerCase().includes(query.toLowerCase()))
    : [];

  const filteredActions = query.trim()
    ? quickActions.filter((a) =>
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.subtitle.toLowerCase().includes(query.toLowerCase())
      )
    : quickActions;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
      <div
        className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search habits..."
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
          {/* Quick Actions Group */}
          {filteredActions.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Commands & Shortcuts
              </div>
              {filteredActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.action}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/60 shrink-0">
                      {action.icon}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {action.title}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {action.subtitle}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}

          {/* Habits Search Results */}
          {filteredHabits.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Habits ({filteredHabits.length})
              </div>
              {filteredHabits.map((habit) => (
                <div
                  key={habit.id}
                  onClick={() => {
                    onClose();
                    onOpenQuickLog();
                  }}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {habit.title}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                    Goal: {habit.goal_days}d
                  </span>
                </div>
              ))}
            </div>
          )}

          {filteredActions.length === 0 && filteredHabits.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-400">
              No matching commands or habits found for &quot;{query}&quot;
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 text-[11px] text-slate-400">
          <span>Navigate with arrows or mouse</span>
          <kbd className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono shadow-xs">
            ESC to close
          </kbd>
        </div>
      </div>
    </div>
  );
};
