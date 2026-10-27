'use client';

import React from 'react';

interface DonutRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  centerMain?: string;
  centerSub?: string;
  subAbove?: boolean;
}

export const DonutRing: React.FC<DonutRingProps> = ({
  percentage,
  size = 100,
  strokeWidth = 10,
  color = '#3b82f6',
  trackColor = '#f1f5f9',
  centerMain,
  centerSub,
  subAbove = false,
}) => {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;
  const center = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center select-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          className="dark:opacity-20"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        {subAbove && centerSub && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 leading-tight">
            {centerSub}
          </span>
        )}
        {centerMain && (
          <span className="text-sm font-bold text-slate-800 dark:text-white leading-tight">
            {centerMain}
          </span>
        )}
        {!subAbove && centerSub && (
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 leading-tight mt-0.5">
            {centerSub}
          </span>
        )}
      </div>
    </div>
  );
};
