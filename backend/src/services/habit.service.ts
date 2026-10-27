import { prisma } from '../models/prisma';
import { AppError } from '../middlewares/error.middleware';
import {
  CreateDailyHabitDto,
  UpdateDailyHabitDto,
  ToggleDailyLogDto,
  CreateWeeklyHabitDto,
  CreateMonthlyHabitDto,
} from '../types';

export class HabitService {
  // ==========================================
  // DAILY HABITS & LOGS
  // ==========================================

  async getDailyHabits(userId: string) {
    return prisma.dailyHabits.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'asc' },
      include: {
        logs: true,
      },
    });
  }

  async getMonthMatrix(userId: string, year: number, month: number) {
    // Construct month date range string
    const pad = (n: number) => String(n).padStart(2, '0');
    const startPrefix = `${year}-${pad(month)}-`;

    const habits = await prisma.dailyHabits.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'asc' },
      include: {
        logs: {
          where: {
            date: {
              startsWith: startPrefix,
            },
          },
        },
      },
    });

    return habits;
  }

  async createDailyHabit(userId: string, dto: CreateDailyHabitDto) {
    return prisma.dailyHabits.create({
      data: {
        user_id: userId,
        title: dto.title,
        goal_days: dto.goalDays ?? 30,
      },
    });
  }

  async updateDailyHabit(userId: string, habitId: string, dto: UpdateDailyHabitDto) {
    const habit = await prisma.dailyHabits.findFirst({
      where: { id: habitId, user_id: userId },
    });

    if (!habit) {
      throw new AppError('Daily habit not found', 404);
    }

    return prisma.dailyHabits.update({
      where: { id: habitId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.goalDays !== undefined && { goal_days: dto.goalDays }),
      },
    });
  }

  async deleteDailyHabit(userId: string, habitId: string) {
    const habit = await prisma.dailyHabits.findFirst({
      where: { id: habitId, user_id: userId },
    });

    if (!habit) {
      throw new AppError('Daily habit not found', 404);
    }

    await prisma.dailyHabits.delete({
      where: { id: habitId },
    });

    return { success: true, message: 'Habit deleted successfully' };
  }

  /**
   * Toggles or sets completion status for a daily habit on a specific date.
   * Leverages Prisma upsert with unique composite index [habit_id, date].
   */
  async toggleDailyLog(userId: string, dto: ToggleDailyLogDto) {
    // Verify ownership
    const habit = await prisma.dailyHabits.findFirst({
      where: { id: dto.habitId, user_id: userId },
    });

    if (!habit) {
      throw new AppError('Daily habit not found or unauthorized', 404);
    }

    // Check existing log
    const existingLog = await prisma.dailyLogs.findUnique({
      where: {
        habit_id_date: {
          habit_id: dto.habitId,
          date: dto.date,
        },
      },
    });

    const nextStatus = dto.isCompleted !== undefined ? dto.isCompleted : !existingLog?.is_completed;

    const log = await prisma.dailyLogs.upsert({
      where: {
        habit_id_date: {
          habit_id: dto.habitId,
          date: dto.date,
        },
      },
      update: {
        is_completed: nextStatus,
      },
      create: {
        habit_id: dto.habitId,
        date: dto.date,
        is_completed: nextStatus,
      },
    });

    return log;
  }

  // ==========================================
  // WEEKLY HABITS
  // ==========================================

  async getWeeklyHabits(userId: string, year: number, month: number) {
    return prisma.weeklyHabits.findMany({
      where: {
        user_id: userId,
        year,
        month,
      },
      orderBy: [{ week_number: 'asc' }, { created_at: 'asc' }],
    });
  }

  async createWeeklyHabit(userId: string, dto: CreateWeeklyHabitDto) {
    return prisma.weeklyHabits.create({
      data: {
        user_id: userId,
        title: dto.title,
        week_number: dto.weekNumber,
        month: dto.month,
        year: dto.year,
        is_completed: false,
      },
    });
  }

  async toggleWeeklyHabit(userId: string, habitId: string) {
    const habit = await prisma.weeklyHabits.findFirst({
      where: { id: habitId, user_id: userId },
    });

    if (!habit) {
      throw new AppError('Weekly habit not found', 404);
    }

    return prisma.weeklyHabits.update({
      where: { id: habitId },
      data: {
        is_completed: !habit.is_completed,
      },
    });
  }

  async deleteWeeklyHabit(userId: string, habitId: string) {
    const habit = await prisma.weeklyHabits.findFirst({
      where: { id: habitId, user_id: userId },
    });

    if (!habit) {
      throw new AppError('Weekly habit not found', 404);
    }

    await prisma.weeklyHabits.delete({ where: { id: habitId } });
    return { success: true };
  }

  // ==========================================
  // MONTHLY HABITS
  // ==========================================

  async getMonthlyHabits(userId: string, year: number, month: number) {
    return prisma.monthlyHabits.findMany({
      where: {
        user_id: userId,
        year,
        month,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async createMonthlyHabit(userId: string, dto: CreateMonthlyHabitDto) {
    return prisma.monthlyHabits.create({
      data: {
        user_id: userId,
        title: dto.title,
        month: dto.month,
        year: dto.year,
        is_completed: false,
      },
    });
  }

  async toggleMonthlyHabit(userId: string, habitId: string) {
    const habit = await prisma.monthlyHabits.findFirst({
      where: { id: habitId, user_id: userId },
    });

    if (!habit) {
      throw new AppError('Monthly habit not found', 404);
    }

    return prisma.monthlyHabits.update({
      where: { id: habitId },
      data: {
        is_completed: !habit.is_completed,
      },
    });
  }

  async deleteMonthlyHabit(userId: string, habitId: string) {
    const habit = await prisma.monthlyHabits.findFirst({
      where: { id: habitId, user_id: userId },
    });

    if (!habit) {
      throw new AppError('Monthly habit not found', 404);
    }

    await prisma.monthlyHabits.delete({ where: { id: habitId } });
    return { success: true };
  }
}

export const habitService = new HabitService();
