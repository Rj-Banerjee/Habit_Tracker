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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<DailyHabit | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formGoal, setFormGoal] = useState('30');

  // Auto-focus current date on load
  useEffect(() => {
    if (todayThRef.current) {
      setTimeout(() => {
        todayThRef.current?.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        });
      }, 300);
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
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
      {/* Table Header Action Bar */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-blue-100/70 border-b border-blue-200/80">
        <span className="text-xs font-extrabold tracking-wider text-blue-900 uppercase">
          DAILY HABITS
        </span>
        <Button
          onClick={handleOpenAdd}
          variant="primary"
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white gap-1 text-xs py-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Habit</span>
        </Button>
      </div>

      {/* Responsive Horizontal Scroll Container */}
      <div className="overflow-x-auto w-full">
        <table className="w-full border-collapse text-left min-w-[1240px]">
          {/* Table Headers */}
          <thead>
            {/* Week Groups Row */}
            <tr className="border-b border-slate-200">
              <th rowSpan={2} className="w-8 text-center text-xs text-slate-400 font-semibold py-1.5 border-r border-slate-200 bg-slate-50/50">
                #
              </th>
              <th rowSpan={2} className="w-[210px] px-3 text-xs font-semibold text-slate-700 py-1.5 border-r border-slate-200 bg-slate-50/50">
                daily habit
              </th>

              {/* 5 Weeks Group Columns */}
              {[1, 2, 3, 4, 5].map((wIndex) => {
                const daysInWeek = calendar.weeks[wIndex] || [];
                if (daysInWeek.length === 0) return null;

                const bgClasses: Record<number, string> = {
                  1: 'bg-blue-100/80 text-blue-900',
                  2: 'bg-pink-100/80 text-pink-900',
                  3: 'bg-teal-100/80 text-teal-900',
                  4: 'bg-amber-100/80 text-amber-900',
                  5: 'bg-blue-100/80 text-blue-900',
                };

                return (
                  <th
                    key={wIndex}
                    colSpan={daysInWeek.length}
                    className={`text-center font-serif italic text-xs font-semibold py-1 border-r border-slate-200 ${
                      bgClasses[wIndex] || 'bg-slate-100'
                    }`}
                  >
                    week {wIndex}
                  </th>
                );
              })}

              <th rowSpan={2} className="w-12 text-center text-xs font-semibold text-slate-700 py-1.5 border-r border-slate-200 bg-slate-50/50">
                goal
              </th>
              <th rowSpan={2} className="w-[95px] text-center text-xs font-semibold text-slate-700 py-1.5 border-r border-slate-200 bg-slate-50/50">
                percentage
              </th>
              <th rowSpan={2} className="w-16 text-center text-xs font-semibold text-slate-700 py-1.5 border-r border-slate-200 bg-slate-50/50">
                count
              </th>
              <th rowSpan={2} className="w-24 text-center text-xs font-semibold text-slate-700 py-1.5 bg-slate-50/50" title="Longest active streak in days">
                longest streak
              </th>
            </tr>

            {/* Days Columns Row (Day Letter & Number) */}
            <tr className="border-b border-slate-200 bg-white">
              {calendar.days.map((d) => {
                const isToday = d.dateKey === todayDateKey;
                return (
                  <th
                    key={d.dateKey}
                    ref={isToday ? todayThRef : null}
                    className={`w-[26px] py-1 text-center border-r border-slate-100 transition-colors ${
                      isToday ? 'bg-amber-100/70 border-x-2 border-amber-400' : ''
                    }`}
                    title={`Day ${d.day} (${d.letter})`}
                  >
                    <div className="text-[10px] text-slate-400 font-medium leading-none">
                      {d.letter}
                    </div>
                    <div
                      className={`text-[11px] font-bold leading-tight mt-0.5 ${
                        isToday
                          ? 'bg-amber-500 text-white rounded px-1 inline-block'
                          : 'text-slate-700'
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
                  className="py-12 text-center text-slate-400 text-sm"
                >
                  No daily habits configured for this month. Click "+ Add Habit" to start!
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
