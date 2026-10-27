'use client';

import React from 'react';
import { Sparkles, Trophy } from 'lucide-react';

interface GroundingFooterProps {
  completedTodayCount: number;
  totalTodayHabits: number;
  totalDaysConquered: number;
  onOpenLegal: (type: 'privacy' | 'terms' | 'support') => void;
}

export const GroundingFooter: React.FC<GroundingFooterProps> = ({
  completedTodayCount,
  totalTodayHabits,
  totalDaysConquered,
  onOpenLegal,
}) => {
  const percentage =
    totalTodayHabits > 0
      ? Math.round((completedTodayCount / totalTodayHabits) * 100)
      : 0;

  return (
    <footer
      className="w-full mt-12 pt-6 pb-8 border-t border-slate-200/60 dark:border-slate-800/60 text-slate-400 text-xs transition-colors duration-200"
      role="contentinfo"
    >
      <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* =========================================
            LEFT SECTION: Subtle Thin Today Progress Bar
           ========================================= */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex flex-col gap-1 w-full sm:w-48">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                <span>Today&apos;s Rhythm</span>
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {percentage}% ({completedTodayCount}/{totalTodayHabits})
              </span>
            </div>
            {/* Thin Aesthetic Progress Line */}
            <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-teal-400 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* =========================================
            CENTER SECTION: Minimal Text Links with Soft Hover
           ========================================= */}
        <nav
          className="flex items-center gap-6 text-[11px] text-gray-400 dark:text-slate-500 font-medium"
          aria-label="Footer links"
        >
          <button
            type="button"
            onClick={() => onOpenLegal('privacy')}
            className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none"
          >
            Privacy
          </button>
          <span className="text-slate-200 dark:text-slate-800 select-none">•</span>
          <button
            type="button"
            onClick={() => onOpenLegal('terms')}
            className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none"
          >
            Terms
          </button>
          <span className="text-slate-200 dark:text-slate-800 select-none">•</span>
          <button
            type="button"
            onClick={() => onOpenLegal('support')}
            className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none"
          >
            Support
          </button>
        </nav>

        {/* =========================================
            RIGHT SECTION: Quiet Lifetime Conquered Metric
           ========================================= */}
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          <Trophy className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
          <span>
            Total Days Conquered:{' '}
            <strong className="text-slate-700 dark:text-slate-300 font-bold ml-0.5">
              {totalDaysConquered}
            </strong>
          </span>
        </div>
      </div>
    </footer>
  );
};
