'use client';

import React from 'react';
import { MONTH_NAMES } from '../../utils/dateUtils';
import { AreaProgressChart } from '../charts/AreaProgressChart';
import { DonutRing } from '../charts/DonutRing';
import { DayProgressPoint } from '../../types';

interface DashboardHeaderProps {
  year: number;
  month: number;
  onYearChange: (y: number) => void;
  onMonthChange: (m: number) => void;
  dailyProgress: DayProgressPoint[];
  overallPercentage: number;
  totalCompletions: number;
  totalPossible: number;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  year,
  month,
  onYearChange,
  onMonthChange,
  dailyProgress,
  overallPercentage,
  totalCompletions,
  totalPossible,
}) => {
  const monthName = MONTH_NAMES[month - 1] || 'Month';
  const years = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

  return (
    <section className="grid grid-cols-[200px_1fr_270px] gap-5 items-center px-6 py-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
      {/* Month Title & Date Pickers */}
      <div className="flex flex-col">
        <h1 className="font-serif italic text-4xl font-bold tracking-tight text-slate-800 leading-none">
          {monthName}
        </h1>
        <span className="text-[11px] font-bold tracking-[0.22em] text-slate-500 uppercase mt-1">
          HABIT TRACKER
        </span>

        {/* Date Pickers Box */}
        <div className="mt-3.5 bg-amber-100/70 border border-amber-200 rounded-md overflow-hidden text-xs">
          <div className="flex items-center justify-between px-2.5 py-1 border-b border-amber-200/60 font-semibold text-amber-900">
            <span className="text-[10px] tracking-wider uppercase">MONTH</span>
            <select
              value={month}
              onChange={(e) => onMonthChange(Number(e.target.value))}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer text-xs"
              aria-label="Select month"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between px-2.5 py-1 font-semibold text-amber-900">
            <span className="text-[10px] tracking-wider uppercase">YEAR</span>
            <select
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer text-xs"
              aria-label="Select year"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Center Wave Area Chart */}
      <div className="h-20 flex items-center overflow-hidden">
        <AreaProgressChart data={dailyProgress} height={80} />
      </div>

      {/* Daily Progress Donut Card */}
      <div className="flex items-center justify-between px-4 py-2 bg-rose-50/70 border border-rose-200/80 rounded-xl">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold tracking-widest uppercase text-rose-900">
            DAILY PROGRESS
          </span>
          <span className="text-2xl font-extrabold text-slate-900 leading-tight mt-0.5">
            {overallPercentage.toFixed(2)}%
          </span>
        </div>

        <div>
          <DonutRing
            percentage={overallPercentage}
            size={86}
            strokeWidth={9}
            color="#f472b6"
            trackColor="#fce7f3"
            centerMain={`${totalCompletions} / ${totalPossible}`}
            centerSub="HABITS"
            subAbove={true}
          />
        </div>
      </div>
    </section>
  );
};
