'use client';

import React from 'react';
import { DonutRing } from './DonutRing';
import { WEEK_PALETTES } from '../../utils/colors';
import { DayProgressPoint, WeekProgressStat } from '../../types';
import { BarChart3 } from 'lucide-react';

interface WeeklyBarsChartProps {
  dailyPoints: DayProgressPoint[];
  weeklyProgress: WeekProgressStat[];
}

export const WeeklyBarsChart: React.FC<WeeklyBarsChartProps> = ({
  dailyPoints,
  weeklyProgress,
}) => {
  const weeks = [1, 2, 3, 4, 5];

  return (
    <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between h-full transition-colors duration-200">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-500" />
          <h3 className="font-bold text-sm tracking-wide text-slate-900 dark:text-white uppercase">
            Weekly Breakdown
          </h3>
        </div>
        <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          5-Week Completion Cycles
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:gap-3 flex-1 items-stretch">
        {weeks.map((wNum) => {
          const palette = WEEK_PALETTES[wNum];
          const weekInfo = weeklyProgress.find((w) => w.weekNumber === wNum) || {
            weekNumber: wNum,
            completedCount: 0,
            possibleCount: 0,
            percentage: 0,
          };

          const startDay = (wNum - 1) * 7 + 1;
          const endDay = wNum * 7;
          const daysInWeek = dailyPoints.filter((d) => d.day >= startDay && d.day <= endDay);

          return (
            <div
              key={wNum}
              className="flex flex-col items-center justify-between border-r last:border-r-0 border-dashed border-slate-200 dark:border-slate-800 px-1"
            >
              <span className="font-serif italic text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                week {wNum}
              </span>

              {/* Day bars */}
              <div className="flex items-end justify-center gap-1 h-28 w-full px-0.5">
                {daysInWeek.map((d) => {
                  const heightPct = Math.max(d.percentage, 8);
                  return (
                    <div
                      key={d.day}
                      className="flex flex-col items-center flex-1 max-w-[18px] h-full justify-end group cursor-pointer"
                      title={`Day ${d.day}: ${d.completedCount}/${d.totalHabits} (${d.percentage}%)`}
                    >
                      <div className="w-full h-16 bg-slate-100 dark:bg-slate-800 rounded-t overflow-hidden flex items-end">
                        <div
                          className="w-full rounded-t transition-all duration-300 group-hover:brightness-110"
                          style={{
                            height: `${heightPct}%`,
                            backgroundColor: palette.primary,
                          }}
                        />
                      </div>
                      <span className="text-[8px] font-semibold text-slate-400 dark:text-slate-500 mt-1">
                        {d.percentage}%
                      </span>
                      <span className="text-[9px] font-bold text-slate-700 dark:text-slate-300">
                        {d.completedCount}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Circular Donut Ring for Week */}
              <div className="mt-3 flex items-center justify-center">
                <DonutRing
                  percentage={weekInfo.percentage}
                  size={76}
                  strokeWidth={8}
                  color={palette.primary}
                  trackColor="#e2e8f0"
                  centerMain={`${weekInfo.percentage}%`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
};
