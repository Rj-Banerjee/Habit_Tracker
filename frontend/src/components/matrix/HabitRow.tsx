'use client';

import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { CheckboxCell } from './CheckboxCell';
import { DailyHabit, DayCalendarInfo } from '../../types';

interface HabitRowProps {
  habit: DailyHabit;
  index: number;
  days: DayCalendarInfo[];
  todayDateKey: string;
  isCompleted: (habitId: string, dateKey: string) => boolean;
  onToggle: (habitId: string, dateKey: string) => void;
  onEdit: (habit: DailyHabit) => void;
  onDelete: (habitId: string) => void;
}

export const HabitRow: React.FC<HabitRowProps> = ({
  habit,
  index,
  days,
  todayDateKey,
  isCompleted,
  onToggle,
  onEdit,
  onDelete,
}) => {
  let completedCount = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  days.forEach((d) => {
    if (isCompleted(habit.id, d.dateKey)) {
      completedCount++;
      tempStreak++;
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
    } else {
      tempStreak = 0;
    }
  });

  const goal = habit.goal_days > 0 ? habit.goal_days : days.length;
  const pct = Math.round((completedCount / goal) * 100);
  const barWidth = Math.min(pct, 100);

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group">
      {/* Index */}
      <td className="text-center text-xs text-slate-400 dark:text-slate-500 py-3 font-medium">
        {index + 1}
      </td>

      {/* Habit Title & Inline Edit/Delete */}
      <td className="px-3 py-3 text-xs font-semibold text-slate-800 dark:text-slate-100 max-w-[210px]">
        <div className="flex items-center justify-between gap-1.5">
          <span className="truncate" title={habit.title}>
            {habit.title}
          </span>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(habit)}
              className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Edit habit"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={() => onDelete(habit.id)}
              className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              title="Delete habit"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </td>

      {/* Days Checkbox Cells (no harsh vertical borders) */}
      {days.map((d) => {
        const isToday = d.dateKey === todayDateKey;
        const done = isCompleted(habit.id, d.dateKey);

        return (
          <td
            key={d.dateKey}
            className={`py-2 px-1 text-center transition-colors ${
              isToday ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''
            }`}
          >
            <CheckboxCell
              habitId={habit.id}
              dateKey={d.dateKey}
              weekIndex={d.weekIndex}
              isCompleted={done}
              onToggle={onToggle}
              title={`${habit.title} - Day ${d.day}`}
            />
          </td>
        );
      })}

      {/* Target Goal */}
      <td className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 py-3">
        {goal}
      </td>

      {/* Percentage Progress Bar */}
      <td className="px-3 py-3 w-[100px]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 w-8 text-right">
            {pct}%
          </span>
          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-300"
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
      </td>

      {/* Count */}
      <td className="text-center text-xs font-bold text-slate-800 dark:text-slate-200 py-3">
        {completedCount} <span className="font-normal text-slate-400 dark:text-slate-500">/ {goal}</span>
      </td>

      {/* Longest Streak */}
      <td className="text-center text-xs font-bold text-amber-600 dark:text-amber-400 py-3">
        {longestStreak}
      </td>
    </tr>
  );
};
