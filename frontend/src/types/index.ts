export interface User {
  id: string;
  email: string;
}

export type LogStatus = 'done' | 'skipped' | 'repaired';
export type StreakMode = 'strict' | 'grace';

export interface HabitLog {
  id: string;
  habit_id: string;
  date: string; // YYYY-MM-DD, the user's local date
  status: LogStatus;
}

export interface Habit {
  id: string;
  identity_id: string;
  title: string;
  schedule_days: number[]; // ISO weekdays: 1 is Monday, 7 is Sunday
  habit_logs: HabitLog[];
}

export interface DayCalendarInfo {
  day: number;
  letter: string;
  dateKey: string;
  weekIndex: number;
}

export interface MonthCalendar {
  year: number;
  month: number;
  monthName: string;
  daysInMonth: number;
  days: DayCalendarInfo[];
  weeks: Record<number, DayCalendarInfo[]>;
}
