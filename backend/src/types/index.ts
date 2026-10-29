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

// AI Coach Types
export type AIChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessageDto {
  id: string;
  userId: string;
  role: AIChatRole;
  content: string;
  metadata?: Record<string, any> | null;
  createdAt: string | Date;
}

export interface CoachProfileDto {
  id?: string;
  userId: string;
  coachingStyle: string;
  targetIdentity?: string | null;
  behavioralTags: string[];
}

export interface SendMessageDto {
  message?: string;
  messages?: Array<{ role: AIChatRole; content: string }>;
  currentDate?: string;
}

export interface ToolExecutionRecord {
  tool: 'getDailyHabits' | 'toggleHabitLog' | 'scaleHabitTarget';
  args: Record<string, any>;
  result: Record<string, any>;
}

