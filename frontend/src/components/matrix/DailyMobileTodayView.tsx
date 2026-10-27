'use client';

import React, { useState } from 'react';
import { Plus, Check, Flame, ChevronLeft, ChevronRight } from 'lucide-react';
import { DailyHabit, MonthCalendar } from '../../types';
import { WEEK_CHECKBOX_THEMES } from './CheckboxCell';

interface DailyMobileTodayViewProps {
  habits: DailyHabit[];
  calendar: MonthCalendar;
  todayDateKey: string;
  isCompleted: (habitId: string, dateKey: string) => boolean;
  onToggle: (habitId: string, dateKey: string) => void;
  onAddHabit: () => void;
}

export const DailyMobileTodayView: React.FC<DailyMobileTodayViewProps> = ({
  habits,
  calendar,
  todayDateKey,
  isCompleted,
  onToggle,
  onAddHabit,
}) => {
  // Currently selected date in mobile carousel (defaults to todayDateKey or first day)
  const initialDate = calendar.days.some((d) => d.dateKey === todayDateKey)
    ? todayDateKey
    : calendar.days[0]?.dateKey || todayDateKey;

  const [selectedDateKey, setSelectedDateKey] = useState<string>(initialDate);

  const selectedDayInfo = calendar.days.find((d) => d.dateKey === selectedDateKey) || calendar.days[0];

  // Calculate day completion count
  const completedToday = habits.filter((h) => isCompleted(h.id, selectedDateKey)).length;
  const progressPct = habits.length > 0 ? Math.round((completedToday / habits.length) * 100) : 0;

  return (
    <div className="block md:hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm transition-colors duration-200">
      {/* Header & Add Habit */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Daily Habits
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {calendar.monthName} {calendar.year}
          </p>
        </div>
        <button
          onClick={onAddHabit}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </div>

      {/* Date Carousel Navigation */}
      <div className="py-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {calendar.days.map((d) => {
            const isSelected = d.dateKey === selectedDateKey;
            const isToday = d.dateKey === todayDateKey;
            const dayCompletedCount = habits.filter((h) => isCompleted(h.id, d.dateKey)).length;
            const hasActivity = dayCompletedCount > 0;

            return (
              <button
                key={d.dateKey}
                onClick={() => setSelectedDateKey(d.dateKey)}
                className={`flex flex-col items-center justify-center min-w-[42px] py-2 px-1 rounded-xl transition-all select-none shrink-0 ${
                  isSelected
                    ? 'bg-blue-600 text-white font-bold shadow-sm scale-105'
                    : isToday
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="text-[10px] font-medium leading-none opacity-80 uppercase">
                  {d.letter}
                </span>
                <span className="text-sm font-bold mt-1 leading-none">
                  {d.day}
                </span>
                {hasActivity && (
                  <span
                    className={`w-1 h-1 rounded-full mt-1.5 ${
                      isSelected ? 'bg-white' : 'bg-blue-500'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Date Summary Banner */}
      <div className="flex items-center justify-between p-3 my-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
        <div className="text-xs">
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {selectedDateKey === todayDateKey ? "Today's Log" : `Day ${selectedDayInfo?.day || ''}`}
          </span>
          <span className="text-slate-400 dark:text-slate-500 ml-1.5">
            ({completedToday} of {habits.length} done)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
            {progressPct}%
          </span>
        </div>
      </div>

      {/* Large Easy-to-Tap Habit Cards */}
      <div className="flex flex-col gap-2.5 mt-2">
        {habits.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-xs">
            No habits yet. Tap &quot;+ Add&quot; to create your first habit!
          </div>
        ) : (
          habits.map((habit) => {
            const done = isCompleted(habit.id, selectedDateKey);

            // Calculate active streak for this habit
            let streak = 0;
            for (let d = (selectedDayInfo?.day || 1); d >= 1; d--) {
              const pad = (n: number) => String(n).padStart(2, '0');
              const dStr = `${calendar.year}-${pad(calendar.month)}-${pad(d)}`;
              if (isCompleted(habit.id, dStr)) {
                streak++;
              } else {
                break;
              }
            }

            return (
              <div
                key={habit.id}
                onClick={() => onToggle(habit.id, selectedDateKey)}
                className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer active:scale-[0.99] select-none ${
                  done
                    ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 shadow-xs'
                    : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col gap-1 pr-3 flex-1 min-w-0">
                  <span
                    className={`text-sm font-semibold truncate ${
                      done
                        ? 'line-through text-slate-400 dark:text-slate-500'
                        : 'text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {habit.title}
                  </span>
                  <div className="flex items-center gap-2.5 text-[11px] text-slate-400 dark:text-slate-500">
                    <span>Goal: {habit.goal_days}d</span>
                    {streak > 0 && (
                      <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-semibold">
                        <Flame className="w-3 h-3 fill-current" />
                        {streak} streak
                      </span>
                    )}
                  </div>
                </div>

                {/* Big Touch-Target Checkbox with Week Theme */}
                {(() => {
                  const theme = WEEK_CHECKBOX_THEMES[selectedDayInfo?.weekIndex || 1] || WEEK_CHECKBOX_THEMES[1];
                  return (
                    <button
                      type="button"
                      aria-label={done ? 'Mark incomplete' : 'Mark completed'}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 shadow-xs border ${
                        done
                          ? `${theme.activeClass} scale-105 shadow-sm`
                          : 'bg-slate-100 dark:bg-slate-800 text-transparent border-slate-300 dark:border-slate-700'
                      }`}
                      style={{
                        backgroundColor: done ? theme.bg : undefined,
                        borderColor: done ? theme.border : undefined,
                      }}
                    >
                      <Check className={`w-5 h-5 transition-transform duration-200 text-white ${done ? 'scale-100' : 'scale-0'}`} />
                    </button>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
