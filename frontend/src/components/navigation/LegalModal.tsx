'use client';

import React from 'react';
import { X, ShieldCheck, FileText, HelpCircle, ExternalLink } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'privacy' | 'terms' | 'support' | null;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  onClose,
  type,
}) => {
  if (!isOpen || !type) return null;

  const contentMap = {
    privacy: {
      title: 'Privacy Policy',
      icon: <ShieldCheck className="w-5 h-5 text-emerald-500" />,
      body: (
        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            Your privacy is foundational to building positive habits. Habit Tracker stores your daily routines, streak metrics, and personal reflections securely in Supabase PostgreSQL with row-level security boundaries.
          </p>
          <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Data Ownership</h4>
          <p>
            You own 100% of your tracking data. We do not sell, rent, or monetize your personal habit logs, reflection journals, or completion histories.
          </p>
          <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Offline & Local Persistence</h4>
          <p>
            Your preferences, Core Focus intention, and UI states are saved locally on your client machine for instant, latency-free tracking.
          </p>
        </div>
      ),
    },
    terms: {
      title: 'Terms of Service',
      icon: <FileText className="w-5 h-5 text-blue-500" />,
      body: (
        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            Welcome to Habit Tracker Enterprise. By accessing or using our habit tracking dashboard, you agree to utilize the platform for self-improvement and productivity enhancement.
          </p>
          <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Acceptable Use</h4>
          <p>
            You may create, customize, and export your personal habit datasets. All automated cron jobs and quotes are provided for motivational encouragement.
          </p>
          <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Availability</h4>
          <p>
            We strive for 99.9% uptime backed by PostgreSQL clustering and automated health-check endpoints.
          </p>
        </div>
      ),
    },
    support: {
      title: 'Help & Support Desk',
      icon: <HelpCircle className="w-5 h-5 text-indigo-500" />,
      body: (
        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            Need help configuring daily habits, weekly milestone cycles, or syncing to external calendars?
          </p>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <h5 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Keyboard Shortcuts</h5>
            <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-400">
              <li><kbd className="px-1 py-0.5 rounded bg-white dark:bg-slate-900 border text-[10px]">Cmd + K</kbd> : Open Command Palette</li>
              <li><kbd className="px-1 py-0.5 rounded bg-white dark:bg-slate-900 border text-[10px]">ESC</kbd> : Close open modal or drawer</li>
            </ul>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            For support inquiries or bug reports, email <strong className="text-slate-800 dark:text-slate-200">support@habittracker.app</strong>.
          </p>
        </div>
      ),
    },
  };

  const current = contentMap[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 shrink-0">
              {current.icon}
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {current.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-96 overflow-y-auto">
          {current.body}
        </div>

        <div className="flex items-center justify-end p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
