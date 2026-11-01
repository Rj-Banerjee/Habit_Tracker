'use client';

import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { CheckboxCell } from './CheckboxCell';
import { Habit, DayCalendarInfo } from '../../types';

interface HabitRowProps {
  habit: Habit;
  index: number;
  days: DayCalendarInfo[];
  todayDateKey: string;
  isCompleted: (habitId: string, dateKey: string) => boolean;
  onToggle: (habitId: string, dateKey: string) => void;
  onEdit: (habit: Habit) => void;
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

  const handleDelete = () => {
    if (window.confirm(`Delete "${habit.title}" and all of its logs?`)) {
      onDelete(habit.id);
    }
  };

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
              onClick={handleDelete}
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

      {/* Count */}
      <td className="text-center text-xs font-bold text-slate-800 dark:text-slate-200 py-3">
        {completedCount}
      </td>

      {/* Longest Streak */}
      <td className="text-center text-xs font-bold text-amber-600 dark:text-amber-400 py-3">
        {longestStreak}
      </td>
    </tr>
  );
};
