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
    return <div className="h-20 flex items-center justify-center text-xs text-slate-400">No data</div>;
  }

  // Format data for Recharts, ensuring a gentle baseline
  const chartData = data.map((d) => ({
    ...d,
    displayPct: Math.max(d.percentage, 10), // aesthetic mountain baseline
  }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pastelBlueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stop-color="#bfdbfe" stopOpacity={0.85} />
              <stop offset="95%" stop-color="#eff6ff" stopOpacity={0.15} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" hide />
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as DayProgressPoint;
                return (
                  <div className="bg-slate-900 text-white text-[11px] px-2.5 py-1 rounded shadow-md pointer-events-none">
                    <p className="font-semibold">Day {item.day}</p>
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
            stroke="#93c5fd"
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
