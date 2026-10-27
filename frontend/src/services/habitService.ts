import { ApiClient } from './api';
import { DailyHabit, DailyLog, WeeklyHabit, MonthlyHabit, MonthlyReflection } from '../types';

export const habitService = {
  // DAILY HABITS & LOGS
  async getDailyHabits(): Promise<DailyHabit[]> {
    return ApiClient.get<DailyHabit[]>('/habits/daily');
  },

  async getMonthMatrix(year: number, month: number): Promise<DailyHabit[]> {
    return ApiClient.get<DailyHabit[]>(`/habits/daily/matrix?year=${year}&month=${month}`);
  },

  async createDailyHabit(title: string, goalDays: number = 30): Promise<DailyHabit> {
    return ApiClient.post<DailyHabit>('/habits/daily', { title, goalDays });
  },

  async updateDailyHabit(id: string, title?: string, goalDays?: number): Promise<DailyHabit> {
    return ApiClient.patch<DailyHabit>(`/habits/daily/${id}`, { title, goalDays });
  },

  async deleteDailyHabit(id: string): Promise<{ success: boolean }> {
    return ApiClient.delete<{ success: boolean }>(`/habits/daily/${id}`);
  },

  async toggleDailyLog(habitId: string, date: string, isCompleted?: boolean): Promise<DailyLog> {
    return ApiClient.post<DailyLog>('/habits/daily/log', { habitId, date, isCompleted });
  },

  // WEEKLY HABITS
  async getWeeklyHabits(year: number, month: number): Promise<WeeklyHabit[]> {
    return ApiClient.get<WeeklyHabit[]>(`/habits/weekly?year=${year}&month=${month}`);
  },

  async createWeeklyHabit(title: string, weekNumber: number, month: number, year: number): Promise<WeeklyHabit> {
    return ApiClient.post<WeeklyHabit>('/habits/weekly', { title, weekNumber, month, year });
  },

  async toggleWeeklyHabit(id: string): Promise<WeeklyHabit> {
    return ApiClient.patch<WeeklyHabit>(`/habits/weekly/${id}/toggle`);
  },

  async deleteWeeklyHabit(id: string): Promise<{ success: boolean }> {
    return ApiClient.delete<{ success: boolean }>(`/habits/weekly/${id}`);
  },

  // MONTHLY HABITS
  async getMonthlyHabits(year: number, month: number): Promise<MonthlyHabit[]> {
    return ApiClient.get<MonthlyHabit[]>(`/habits/monthly?year=${year}&month=${month}`);
  },

  async createMonthlyHabit(title: string, month: number, year: number): Promise<MonthlyHabit> {
    return ApiClient.post<MonthlyHabit>('/habits/monthly', { title, month, year });
  },

  async toggleMonthlyHabit(id: string): Promise<MonthlyHabit> {
    return ApiClient.patch<MonthlyHabit>(`/habits/monthly/${id}/toggle`);
  },

  async deleteMonthlyHabit(id: string): Promise<{ success: boolean }> {
    return ApiClient.delete<{ success: boolean }>(`/habits/monthly/${id}`);
  },

  // REFLECTIONS
  async getReflection(year: number, month: number): Promise<MonthlyReflection | null> {
    return ApiClient.get<MonthlyReflection | null>(`/reflections?year=${year}&month=${month}`);
  },

  async saveReflection(month: number, year: number, content: string): Promise<MonthlyReflection> {
    return ApiClient.post<MonthlyReflection>('/reflections', { month, year, content });
  },

  async autoGenerateReflection(month: number, year: number): Promise<{ content: string }> {
    return ApiClient.post<{ content: string }>('/reflections/generate', { month, year });
  },
};
