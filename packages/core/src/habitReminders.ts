import type { HabitFrequency } from './api';
import { addDays, isoWeekday } from './dates';
import { parseReminderTime } from './onboarding';

// Each habit reminds at its own time. Phones only let an app keep so many notifications
// waiting (iPhone keeps 64), so they're planned a week ahead and refreshed whenever the
// app opens or something is logged.

export interface ReminderHabit {
  id: string;
  title: string;
  reminder_time: string | null;
  schedule_days: number[];
  frequency?: HabitFrequency;
  starts_on?: string;
  ends_on?: string | null;
}

export interface PlannedReminder {
  habitId: string;
  title: string;
  date: string;
  hour: number;
  minute: number;
}

export const REMINDER_DAYS_AHEAD = 7;
// Leaves room under iPhone's 64 for the nudge and anything Tunnel Vision holds back.
export const MAX_PLANNED_REMINDERS = 56;

interface PlanInput {
  habits: ReminderHabit[];
  // Habits already done today, which don't need reminding.
  doneToday: ReadonlySet<string>;
  today: string;
  nowMinutes: number;
}

const dueOn = (habit: ReminderHabit, date: string) => {
  if (habit.starts_on && date < habit.starts_on) return false;
  if (habit.ends_on && date > habit.ends_on) return false;
  // A times-per-week habit can be done any day.
  return habit.frequency === 'per_week' || habit.schedule_days.includes(isoWeekday(date));
};

export function planHabitReminders({ habits, doneToday, today, nowMinutes }: PlanInput): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  for (let ahead = 0; ahead < REMINDER_DAYS_AHEAD; ahead++) {
    const date = addDays(today, ahead);
    for (const habit of habits) {
      const time = habit.reminder_time ? parseReminderTime(habit.reminder_time.slice(0, 5)) : null;
      if (!time || !dueOn(habit, date)) continue;
      if (ahead === 0 && (doneToday.has(habit.id) || time.hour * 60 + time.minute <= nowMinutes)) continue;
      planned.push({ habitId: habit.id, title: habit.title, date, hour: time.hour, minute: time.minute });
    }
  }
  return planned
    .sort((a, b) => a.date.localeCompare(b.date) || a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
    .slice(0, MAX_PLANNED_REMINDERS);
}

export const reminderId = (reminder: Pick<PlannedReminder, 'habitId' | 'date'>) =>
  `habit-reminder:${reminder.habitId}:${reminder.date}`;
export const isHabitReminderId = (id: string) => id.startsWith('habit-reminder:');
