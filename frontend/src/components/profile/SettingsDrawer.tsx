'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { StreakMode } from '@habit-tracker/core';
import { tracker } from '../../services/tracker';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODE_HELP: Record<StreakMode, string> = {
  grace: 'Grace Days and Streak Repair are on.',
  strict: 'No Grace Days or Streak Repair. The 24-hour back-log is still allowed.',
};

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ isOpen, onClose }) => {
  const { user, signOut } = useAuth();
  const { error } = useToast();
  const [mode, setMode] = useState<StreakMode>('grace');

  useEffect(() => {
    if (isOpen) {
      tracker.getMode().then(setMode).catch(() => {});
    }
  }, [isOpen]);

  const changeMode = async (next: StreakMode) => {
    if (!user) return;
    const previous = mode;
    setMode(next);
    try {
      await tracker.setMode(user.id, next);
    } catch (err) {
      setMode(previous);
      error((err as Error).message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-slate-950/40" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label="Settings"
        className="fixed inset-y-0 right-0 w-full max-w-sm bg-white dark:bg-slate-900 p-6 flex flex-col gap-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings" className="p-2 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>

        <label className="flex flex-col gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
          Streak mode
          <select
            value={mode}
            onChange={(e) => changeMode(e.target.value as StreakMode)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
          >
            <option value="grace">Grace</option>
            <option value="strict">Strict</option>
          </select>
          <span className="font-normal text-slate-500 dark:text-slate-400">{MODE_HELP[mode]}</span>
        </label>

        <button
          type="button"
          onClick={() => {
            signOut();
            onClose();
          }}
          className="mt-auto py-2.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
        >
          Sign out
        </button>
      </aside>
    </div>
  );
};
