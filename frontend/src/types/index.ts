export interface User {
  id: string;
  email: string;
  createdAt?: string;
}

export interface DailyLog {
  id: string;
  habit_id: string;
  date: string; // YYYY-MM-DD
  is_completed: boolean;
  updated_at?: string;
}

export interface DailyHabit {
  id: string;
  user_id: string;
  title: string;
  goal_days: number;
  created_at: string;
  logs?: DailyLog[];
}

export interface WeeklyHabit {
  id: string;
  user_id: string;
  title: string;
  week_number: number; // 1 to 5
  month: number;
  year: number;
  is_completed: boolean;
  created_at?: string;
}

export interface MonthlyHabit {
  id: string;
  user_id: string;
  title: string;
  month: number;
  year: number;
  is_completed: boolean;
  created_at?: string;
}

export interface MonthlyReflection {
  id?: string;
  user_id?: string;
  month: number;
  year: number;
  content: string;
}

export interface DayProgressPoint {
  date: string;
  day: number;
  completedCount: number;
  totalHabits: number;
  percentage: number;
}

export interface HabitStreakStat {
  id: string;
  title: string;
  goalDays: number;
  completedDays: number;
  percentage: number;
  percentageFormatted: string;
  longestStreak: number;
  currentStreak: number;
}

export interface WeekProgressStat {
  weekNumber: number;
  completedCount: number;
  possibleCount: number;
  percentage: number;
}

export interface MonthAnalytics {
  month: number;
  year: number;
  totalHabits: number;
  totalMonthCompletions: number;
  totalPossibleCompletions: number;
  totalIncomplete: number;
  overallPercentage: number;
  dailyProgress: DayProgressPoint[];
  weeklyProgress: WeekProgressStat[];
  top10Habits: HabitStreakStat[];
  habitStats: HabitStreakStat[];
}

export interface DailyQuoteData {
  date: string;
  quote: string;
  author: string;
  imageUrl: string;
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
