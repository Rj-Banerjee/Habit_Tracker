'use client';

import React from 'react';
import { Trophy, Flame } from 'lucide-react';
import { HabitStreakStat } from '../../types';

interface Top10LeaderboardProps {
  top10: HabitStreakStat[];
}

export const Top10Leaderboard: React.FC<Top10LeaderboardProps> = ({ top10 }) => {
  const over100Count = top10.filter((h) => h.percentage >= 100).length;

  let milestoneMessage = 'Keep up the great momentum! 🌟';
  if (over100Count > 0) {
    milestoneMessage = `Over 100% on ${over100Count} habit${
      over100Count > 1 ? 's' : ''
    } — keep going! 🚀`;
  } else if (top10.length > 0 && top10[0].percentage >= 80) {
    milestoneMessage = `Top habit is at ${top10[0].percentageFormatted} consistency! ✨`;
  }

  return (
    <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between h-full transition-colors duration-200">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-sm tracking-wide text-slate-900 dark:text-white uppercase">
              Top 10 Habits
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            Ranked by %
          </span>
        </div>

        <div className="overflow-y-auto mt-3 max-h-[300px]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 font-semibold">
                <th className="py-1.5 px-2 text-center w-7">#</th>
                <th className="py-1.5 px-2 text-left">Habit</th>
                <th className="py-1.5 px-2 text-center w-14">Streak</th>
                <th className="py-1.5 px-2 text-right w-16">Progress</th>
              </tr>
            </thead>
            <tbody>
              {top10.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-slate-400 dark:text-slate-500">
                    No habit logs recorded yet
                  </td>
                </tr>
              ) : (
                top10.map((h, i) => (
                  <tr
                    key={h.id}
                    className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2 px-2 text-center text-slate-400 dark:text-slate-500 text-[11px] font-medium">
                      {i + 1}
                    </td>
                    <td className="py-2 px-2 font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                      {h.title}
                    </td>
                    <td className="py-2 px-2 text-center text-[11px] font-bold text-amber-600 dark:text-amber-400">
                      {h.longestStreak > 0 ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Flame className="w-3 h-3 fill-current text-amber-500" />
                          {h.longestStreak}
                        </span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td
                      className={`py-2 px-2 text-right font-bold ${
                        h.percentage >= 100
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {h.percentageFormatted}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 p-3 text-center font-serif italic text-xs text-amber-900 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 rounded-xl border border-dashed border-amber-200 dark:border-amber-800">
        {milestoneMessage}
      </div>
    </article>
  );
};
