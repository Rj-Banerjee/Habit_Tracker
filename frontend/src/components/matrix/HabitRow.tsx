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
  // Calculate completed count and longest streak locally
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
    <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors group">
      {/* Index */}
      <td className="text-center text-xs text-slate-400 py-2 border-r border-slate-100">
        {index + 1}
      </td>

      {/* Habit Title & Inline Actions */}
      <td className="px-3 py-2 text-xs font-medium text-slate-800 border-r border-slate-100 max-w-[210px]">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate" title={habit.title}>
            {habit.title}
          </span>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(habit)}
              className="p-0.5 text-slate-400 hover:text-blue-600 rounded"
              title="Edit habit"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={() => onDelete(habit.id)}
              className="p-0.5 text-slate-400 hover:text-rose-600 rounded"
              title="Delete habit"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </td>

      {/* Days Checkbox Cells */}
      {days.map((d) => {
        const isToday = d.dateKey === todayDateKey;
        const done = isCompleted(habit.id, d.dateKey);

        return (
          <td
            key={d.dateKey}
            className={`py-1 px-0.5 text-center border-r border-slate-100/70 ${
              isToday ? 'bg-amber-50/50' : ''
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

      {/* Goal */}
      <td className="text-center text-xs text-slate-600 font-medium py-2 border-r border-slate-100">
        {goal}
      </td>

      {/* Percentage Mini Bar */}
      <td className="px-2 py-2 border-r border-slate-100 w-[95px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-700 w-7 text-right">
            {pct}%
          </span>
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-300 rounded-full transition-all duration-300"
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
      </td>

      {/* Count */}
      <td className="text-center text-xs font-semibold text-slate-800 py-2 border-r border-slate-100">
        {completedCount} / {goal}
      </td>

      {/* Longest Streak */}
      <td className="text-center text-xs font-bold text-slate-800 py-2">
        {longestStreak}
      </td>
    </tr>
  );
};
