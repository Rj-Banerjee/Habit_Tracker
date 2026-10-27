'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { DayProgressPoint } from '../../types';

interface AreaProgressChartProps {
  data: DayProgressPoint[];
  height?: number;
}

export const AreaProgressChart: React.FC<AreaProgressChartProps> = ({
  data,
  height = 80,
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-20 flex items-center justify-center text-xs text-slate-400">
        No tracking points yet
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    displayPct: Math.max(d.percentage, 10),
  }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pastelBlueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" hide />
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as DayProgressPoint;
                return (
                  <div className="bg-slate-900 dark:bg-slate-800 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-md border border-slate-700 pointer-events-none">
                    <p className="font-bold">Day {item.day}</p>
                    <p className="text-slate-300">
                      {item.completedCount}/{item.totalHabits} habits ({item.percentage}%)
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="displayPct"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#pastelBlueGrad)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
