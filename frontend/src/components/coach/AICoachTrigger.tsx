'use client';

import React from 'react';
import { Sparkles, Bot, Flame } from 'lucide-react';

interface AICoachTriggerProps {
  onClick: () => void;
  isOpen: boolean;
  hasUnreadProactive?: boolean;
}

export const AICoachTrigger: React.FC<AICoachTriggerProps> = ({
  onClick,
  isOpen,
  hasUnreadProactive = false,
}) => {
  if (isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 group">
      {/* Outer ambient glow ring */}
      <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 opacity-70 blur-md group-hover:opacity-100 transition-all duration-300 animate-pulse pointer-events-none" />

      {/* Floating Glassmorphism Button */}
      <button
        onClick={onClick}
        aria-label="Open AI Habit Coach"
        className="relative flex items-center gap-3 px-5 py-3.5 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-white/60 dark:border-slate-800/80 shadow-2xl hover:shadow-indigo-500/20 text-slate-800 dark:text-slate-100 font-medium text-sm transition-all duration-200 hover:scale-105 active:scale-95 animate-breathe"
      >
        {/* Animated Icon Avatar */}
        <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-inner">
          <Sparkles className="w-4 h-4 animate-spin-slow" />
          {hasUnreadProactive && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
            </span>
          )}
        </div>

        {/* Button Label & Sub-pill */}
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-900 dark:text-white tracking-tight">AI Coach</span>
            <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60">
              Atomic
            </span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
            {hasUnreadProactive ? 'Proactive check-in ready' : 'Frictionless guidance'}
          </span>
        </div>

        {/* Right prompt arrow/flame indicator */}
        <div className="ml-1 pl-2 border-l border-slate-200 dark:border-slate-800 flex items-center text-amber-500 dark:text-amber-400">
          <Flame className="w-4 h-4 animate-bounce" />
        </div>
      </button>
    </div>
  );
};
