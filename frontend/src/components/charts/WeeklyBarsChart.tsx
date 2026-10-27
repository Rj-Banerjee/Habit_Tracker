'use client';

import React from 'react';
import { DonutRing } from './DonutRing';
import { WEEK_PALETTES } from '../../utils/colors';
import { DayProgressPoint, WeekProgressStat } from '../../types';

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
    <div className="grid grid-cols-5 gap-3 h-full">
      {weeks.map((wNum) => {
        const palette = WEEK_PALETTES[wNum];
        const weekInfo = weeklyProgress.find((w) => w.weekNumber === wNum) || {
          weekNumber: wNum,
          completedCount: 0,
          possibleCount: 0,
          percentage: 0,
        };

        // Filter daily points for this week
        const startDay = (wNum - 1) * 7 + 1;
        const endDay = wNum * 7;
        const daysInWeek = dailyPoints.filter((d) => d.day >= startDay && d.day <= endDay);

        return (
          <div
            key={wNum}
            className="flex flex-col items-center justify-between border-r last:border-r-0 border-dashed border-slate-200 px-1.5"
          >
            {/* Week Title */}
            <span className="font-serif italic text-sm font-semibold text-slate-600 mb-2">
              week {wNum}
            </span>

            {/* Daily Bars Row */}
            <div className="flex items-end justify-center gap-1 h-32 w-full px-1">
              {daysInWeek.map((d) => {
                const heightPct = Math.max(d.percentage, 8);
                return (
                  <div
                    key={d.day}
                    className="flex flex-col items-center flex-1 max-w-[20px] h-full justify-end group cursor-pointer"
                    title={`Day ${d.day}: ${d.completedCount}/${d.totalHabits} habits (${d.percentage}%)`}
                  >
                    <div className="w-full h-20 bg-slate-100 rounded-t overflow-hidden flex items-end">
                      <div
                        className="w-full rounded-t transition-all duration-300 group-hover:brightness-95"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: palette.primary,
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-semibold text-slate-500 mt-1">
                      {d.percentage}%
                    </span>
                    <span className="text-[10px] font-bold text-slate-700">
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
                size={86}
                strokeWidth={9}
                color={palette.primary}
                trackColor={palette.track}
                centerMain={`${weekInfo.percentage}%`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
