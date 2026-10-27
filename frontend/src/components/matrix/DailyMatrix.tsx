'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { HabitRow } from './HabitRow';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { DailyHabit, MonthCalendar } from '../../types';

interface DailyMatrixProps {
  habits: DailyHabit[];
  calendar: MonthCalendar;
  todayDateKey: string;
  isCompleted: (habitId: string, dateKey: string) => boolean;
  onToggle: (habitId: string, dateKey: string) => void;
  onAddHabit: (title: string, goalDays: number) => Promise<any>;
  onUpdateHabit: (id: string, title?: string, goalDays?: number) => Promise<any>;
  onDeleteHabit: (id: string) => Promise<any>;
}

export const DailyMatrix: React.FC<DailyMatrixProps> = ({
  habits,
  calendar,
  todayDateKey,
  isCompleted,
  onToggle,
  onAddHabit,
  onUpdateHabit,
  onDeleteHabit,
}) => {
  const todayThRef = useRef<HTMLTableHeaderCellElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<DailyHabit | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formGoal, setFormGoal] = useState('30');

  // Auto-focus current date on load
  useEffect(() => {
    if (todayThRef.current && scrollContainerRef.current) {
      setTimeout(() => {
        todayThRef.current?.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        });
      }, 350);
    }
  }, [calendar.year, calendar.month]);

  const handleOpenAdd = () => {
    setFormTitle('');
    setFormGoal('30');
    setIsAddModalOpen(true);
  };

  const handleSaveAdd = async () => {
    if (!formTitle.trim()) return;
    await onAddHabit(formTitle.trim(), Number(formGoal) || 30);
    setIsAddModalOpen(false);
  };

  const handleOpenEdit = (habit: DailyHabit) => {
    setSelectedHabit(habit);
    setFormTitle(habit.title);
    setFormGoal(String(habit.goal_days));
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedHabit || !formTitle.trim()) return;
    await onUpdateHabit(selectedHabit.id, formTitle.trim(), Number(formGoal) || 30);
    setIsEditModalOpen(false);
  };

  return (
    <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors duration-200">
      {/* Table Header Action Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Daily Habits Matrix
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track daily completions across {calendar.monthName} {calendar.year}
          </p>
        </div>

        <Button
          onClick={handleOpenAdd}
          variant="primary"
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white gap-1.5 text-xs py-1.5 px-3 rounded-xl shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Habit</span>
        </Button>
      </div>

      {/* Responsive Horizontal Scroll Container (Smooth scroll for tablet) */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto w-full scroll-smooth"
      >
        <table className="w-full border-collapse text-left min-w-[1100px]">
          {/* Table Headers */}
          <thead>
            {/* Week Groups Row */}
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th rowSpan={2} className="w-8 text-center text-xs text-slate-400 dark:text-slate-500 font-semibold py-2">
                #
              </th>
              <th rowSpan={2} className="w-[200px] px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 py-2">
                Habit
              </th>

              {/* 5 Weeks Group Columns */}
              {[1, 2, 3, 4, 5].map((wIndex) => {
                const daysInWeek = calendar.weeks[wIndex] || [];
                if (daysInWeek.length === 0) return null;

                const bgPills: Record<number, string> = {
                  1: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40',
                  2: 'text-pink-700 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40',
                  3: 'text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40',
                  4: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40',
                  5: 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40',
                };

                return (
                  <th
                    key={wIndex}
                    colSpan={daysInWeek.length}
                    className="text-center font-serif italic text-xs font-semibold py-1.5 px-1"
                  >
                    <span className={`inline-block w-full py-0.5 rounded-lg text-center ${bgPills[wIndex] || 'bg-slate-100 text-slate-700'}`}>
                      week {wIndex}
                    </span>
                  </th>
                );
              })}

              <th rowSpan={2} className="w-12 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 py-2">
                Goal
              </th>
              <th rowSpan={2} className="w-[100px] text-center text-xs font-semibold text-slate-700 dark:text-slate-300 py-2">
                Progress
              </th>
              <th rowSpan={2} className="w-16 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 py-2">
                Count
              </th>
              <th rowSpan={2} className="w-20 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 py-2" title="Longest active streak in days">
                Streak
              </th>
            </tr>

            {/* Days Columns Row (Day Letter & Number) */}
            <tr className="border-b border-slate-100 dark:border-slate-800">
              {calendar.days.map((d) => {
                const isToday = d.dateKey === todayDateKey;
                return (
                  <th
                    key={d.dateKey}
                    ref={isToday ? todayThRef : null}
                    className={`w-[26px] py-1 text-center transition-colors ${
                      isToday ? 'bg-amber-50 dark:bg-amber-950/30 rounded-t-lg' : ''
                    }`}
                    title={`Day ${d.day} (${d.letter})`}
                  >
                    <div className="text-[9px] text-slate-400 dark:text-slate-500 font-medium leading-none">
                      {d.letter}
                    </div>
                    <div
                      className={`text-[10px] font-bold leading-tight mt-0.5 ${
                        isToday
                          ? 'bg-amber-500 text-white rounded px-1 inline-block'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {d.day}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {habits.length === 0 ? (
              <tr>
                <td
                  colSpan={6 + calendar.days.length}
                  className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm"
                >
                  No daily habits configured for this month. Click &quot;+ Add Habit&quot; above to start!
                </td>
              </tr>
            ) : (
              habits.map((habit, index) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  index={index}
                  days={calendar.days}
                  todayDateKey={todayDateKey}
                  isCompleted={isCompleted}
                  onToggle={onToggle}
                  onEdit={handleOpenEdit}
                  onDelete={onDeleteHabit}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Habit Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Daily Habit"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveAdd}>
              Save Habit
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Habit Title"
            placeholder="e.g. Meditate for 10 minutes"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            autoFocus
          />
          <Input
            label="Monthly Target Days"
            type="number"
            min={1}
            max={31}
            value={formGoal}
            onChange={(e) => setFormGoal(e.target.value)}
            helperText="Number of days in the month you aim to complete this habit."
          />
        </div>
      </Modal>

      {/* Edit Habit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Daily Habit"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveEdit}>
              Update Habit
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Habit Title"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />
          <Input
            label="Monthly Target Days"
            type="number"
            min={1}
            max={31}
            value={formGoal}
            onChange={(e) => setFormGoal(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
};
