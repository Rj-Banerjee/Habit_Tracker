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
    <div className="w-full h-full flex flex-col">
      <div className="bg-pink-100/70 py-1.5 px-3 text-center text-[11px] font-bold tracking-wider uppercase text-pink-900 border-b border-pink-200">
        WEEKLY PROGRESS
      </div>

      <div className="flex-1 p-3">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: '#64748b', fontStyle: 'italic' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 5]}
              ticks={[0, 1, 2, 3, 4, 5]}
              tick={{ fontSize: 10, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-slate-900 text-white text-[11px] px-2.5 py-1 rounded shadow pointer-events-none">
                      <p className="font-semibold">{item.week}</p>
                      <p className="text-slate-300">
                        {item.completed} of {item.total} completed
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="completed" radius={[3, 3, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.week}
                  fill={WEEK_PALETTES[entry.weekNum]?.primary || '#93c5fd'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
