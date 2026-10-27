export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface ToggleDailyLogDto {
  habitId: string;
  date: string; // YYYY-MM-DD
  isCompleted?: boolean;
}

export interface CreateDailyHabitDto {
  title: string;
  goalDays?: number;
}

export interface UpdateDailyHabitDto {
  title?: string;
  goalDays?: number;
}

export interface CreateWeeklyHabitDto {
  title: string;
  weekNumber: number;
  month: number;
  year: number;
}

export interface CreateMonthlyHabitDto {
  title: string;
  month: number;
  year: number;
}

export interface SaveReflectionDto {
  month: number;
  year: number;
  content: string;
}
