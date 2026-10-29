'use client';

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import { WEEK_PALETTES } from '../../utils/colors';

interface WeeklyHabitsRechartProps {
  data: { week: string; weekNum: number; completed: number; total: number }[];
}

export const WeeklyHabitsRechart: React.FC<WeeklyHabitsRechartProps> = ({ data }) => {
  return (
    <div className="w-full h-full flex flex-col p-5 justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-slate-200">
          Weekly Breakdown
        </span>
        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
          Completed Tasks
        </span>
      </div>

      <div className="flex-1 pt-3 min-h-[160px]">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 'dataMax + 1']}
              allowDecimals={false}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white text-[11px] px-3 py-2 rounded-xl shadow-lg border border-slate-700/60 pointer-events-none">
                      <p className="font-bold text-slate-100">{item.week}</p>
                      <p className="text-slate-300 mt-0.5">
                        <span className="text-blue-400 font-semibold">{item.completed}</span> of {item.total} completed
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="completed" radius={[6, 6, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.week}
                  fill={WEEK_PALETTES[entry.weekNum]?.color || '#3b82f6'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};