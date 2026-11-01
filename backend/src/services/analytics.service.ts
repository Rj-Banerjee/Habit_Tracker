import { prisma } from '../models/prisma';

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

export class AnalyticsService {
  async getMonthAnalytics(userId: string, year: number, month: number) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthPrefix = `${year}-${pad(month)}-`;

    // Fetch user daily habits and logs for this month
    const habits = await prisma.dailyHabits.findMany({
      where: { user_id: userId },
      include: {
        logs: {
          where: {
            date: { startsWith: monthPrefix },
            is_completed: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    const totalHabits = habits.length;

    // 1. Calculate Day-by-Day Aggregated Progress (for Recharts Area Chart)
    const dailyProgress: DayProgressPoint[] = [];
    const logDateSetByHabit: Record<string, Set<string>> = {};

    habits.forEach((h) => {
      logDateSetByHabit[h.id] = new Set(h.logs.map((l) => l.date));
    });

    let totalMonthCompletions = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${pad(month)}-${pad(day)}`;
      let completedOnDay = 0;

      habits.forEach((h) => {
        if (logDateSetByHabit[h.id]?.has(dateStr)) {
          completedOnDay++;
        }
      });

      totalMonthCompletions += completedOnDay;
      const pct = totalHabits > 0 ? Math.round((completedOnDay / totalHabits) * 100) : 0;

      dailyProgress.push({
        date: dateStr,
        day,
        completedCount: completedOnDay,
        totalHabits,
        percentage: pct,
      });
    }

    const totalPossibleCompletions = daysInMonth * totalHabits;
    const totalIncomplete = Math.max(0, totalPossibleCompletions - totalMonthCompletions);
    const overallPercentage =
      totalPossibleCompletions > 0
        ? Number(((totalMonthCompletions / totalPossibleCompletions) * 100).toFixed(2))
        : 0;

    // 2. Calculate Streaks & Completion Percentages for Each Habit
    const habitStats: HabitStreakStat[] = habits.map((habit) => {
      const completedDates = logDateSetByHabit[habit.id] || new Set();
      let longestStreak = 0;
      let tempStreak = 0;
      let currentStreak = 0;

      // Iterate chronologically through the month
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${pad(month)}-${pad(day)}`;
        if (completedDates.has(dateStr)) {
          tempStreak++;
          if (tempStreak > longestStreak) {
            longestStreak = tempStreak;
          }
        } else {
          tempStreak = 0;
        }
      }

      // Check current streak up to today or month end
      const now = new Date();
      const currentDay = (now.getFullYear() === year && now.getMonth() + 1 === month)
        ? now.getDate()
        : daysInMonth;

      for (let d = currentDay; d >= 1; d--) {
        const dStr = `${year}-${pad(month)}-${pad(d)}`;
        if (completedDates.has(dStr)) {
          currentStreak++;
        } else {
          break;
        }
      }

      const goal = habit.goal_days > 0 ? habit.goal_days : daysInMonth;
      const completedCount = completedDates.size;
      const pct = goal > 0 ? (completedCount / goal) * 100 : 0;

      return {
        id: habit.id,
        title: habit.title,
        goalDays: goal,
        completedDays: completedCount,
        percentage: Number(pct.toFixed(1)),
        percentageFormatted: `${pct.toFixed(1)}%`,
        longestStreak,
        currentStreak,
      };
    });

    // 3. Top 10 Habits Sorted by Completion Percentage
    const top10Habits = [...habitStats]
      .sort((a, b) => b.percentage - a.percentage || b.completedDays - a.completedDays)
      .slice(0, 10);

    // 4. Weekly Breakdown (Weeks 1 to 5)
    const weeklyProgress: WeekProgressStat[] = [1, 2, 3, 4, 5].map((w) => {
      const startDay = (w - 1) * 7 + 1;
      const endDay = Math.min(w * 7, daysInMonth);

      if (startDay > daysInMonth) {
        return { weekNumber: w, completedCount: 0, possibleCount: 0, percentage: 0 };
      }

      const weekDaysCount = endDay - startDay + 1;
      const possible = weekDaysCount * totalHabits;
      let completedInWeek = 0;

      for (let d = startDay; d <= endDay; d++) {
        const dStr = `${year}-${pad(month)}-${pad(d)}`;
        habits.forEach((h) => {
          if (logDateSetByHabit[h.id]?.has(dStr)) {
            completedInWeek++;
          }
        });
      }

      const pct = possible > 0 ? Math.round((completedInWeek / possible) * 100) : 0;

      return {
        weekNumber: w,
        completedCount: completedInWeek,
        possibleCount: possible,
        percentage: pct,
      };
    });

    return {
      month,
      year,
      totalHabits,
      totalMonthCompletions,
      totalPossibleCompletions,
      totalIncomplete,
      overallPercentage,
      dailyProgress,
      weeklyProgress,
      top10Habits,
      habitStats,
    };
  }
}

export const analyticsService = new AnalyticsService();
