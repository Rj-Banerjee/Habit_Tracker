'use client';

import React from 'react';
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
    <article className="flex flex-col p-4 bg-white border border-slate-200 rounded-2xl shadow-xs h-full">
      <div className="text-center font-bold text-xs tracking-widest uppercase text-slate-800 pb-2.5 border-b border-slate-100">
        TOP 10 HABITS
      </div>

      <div className="flex-1 overflow-y-auto mt-2">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-blue-50/70 border-b border-blue-100 text-blue-900 font-serif italic">
              <th className="py-1 px-2 text-center w-6">#</th>
              <th className="py-1 px-2 text-left">daily habit</th>
              <th className="py-1 px-2 text-right w-16">progress</th>
            </tr>
          </thead>
          <tbody>
            {top10.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-slate-400">
                  No habits tracked yet
                </td>
              </tr>
            ) : (
              top10.map((h, i) => (
                <tr
                  key={h.id}
                  className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors"
                >
                  <td className="py-1.5 px-2 text-center font-serif italic text-slate-400 text-[11px]">
                    {i + 1}
                  </td>
                  <td className="py-1.5 px-2 font-medium text-slate-700 truncate max-w-[150px]">
                    {h.title}
                  </td>
                  <td
                    className={`py-1.5 px-2 text-right font-bold ${
                      h.percentage >= 100 ? 'text-emerald-600' : 'text-slate-800'
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

      <div className="mt-3 p-2 text-center font-serif italic text-xs text-slate-800 bg-amber-50 rounded-lg border border-dashed border-amber-300">
        {milestoneMessage}
      </div>
    </article>
  );
};
