import { prisma } from '../models/prisma';
import { SaveReflectionDto } from '../types';
import { analyticsService } from './analytics.service';

export class ReflectionService {
  async getReflection(userId: string, year: number, month: number) {
    let reflection = await prisma.monthlyReflections.findUnique({
      where: {
        user_id_month_year: {
          user_id: userId,
          month,
          year,
        },
      },
    });

    if (!reflection && userId !== '00000000-0000-0000-0000-000000000001') {
      reflection = await prisma.monthlyReflections.findUnique({
        where: {
          user_id_month_year: {
            user_id: '00000000-0000-0000-0000-000000000001',
            month,
            year,
          },
        },
      });
    }

    return reflection;
  }

  async saveReflection(userId: string, dto: SaveReflectionDto) {
    return prisma.monthlyReflections.upsert({
      where: {
        user_id_month_year: {
          user_id: userId,
          month: dto.month,
          year: dto.year,
        },
      },
      update: {
        content: dto.content,
      },
      create: {
        user_id: userId,
        month: dto.month,
        year: dto.year,
        content: dto.content,
      },
    });
  }

  async autoGenerateReflection(userId: string, year: number, month: number) {
    const analytics = await analyticsService.getMonthAnalytics(userId, year, month);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[month - 1] || `Month ${month}`;

    const topHabit = analytics.top10Habits[0] || { title: 'Daily Habits', percentageFormatted: '100%' };
    const over100Count = analytics.top10Habits.filter((h) => h.percentage >= 100).length;

    let bestWeekNum = 1;
    let bestWeekPct = 0;
    analytics.weeklyProgress.forEach((w) => {
      if (w.percentage > bestWeekPct) {
        bestWeekPct = w.percentage;
        bestWeekNum = w.weekNumber;
      }
    });

    const lines = [
      `This month of ${monthName} ${year}, I maintained a ${analytics.overallPercentage}% overall daily habit consistency.`,
      over100Count > 0
        ? `I exceeded 100% of my target goals on ${over100Count} habit${over100Count > 1 ? 's' : ''}, led by "${topHabit.title}" at ${topHabit.percentageFormatted}.`
        : `My standout habit was "${topHabit.title}" reaching ${topHabit.percentageFormatted} completion.`,
      `Week ${bestWeekNum} was my strongest period with ${bestWeekPct}% daily completion.`,
      `I showed up intentionally, noticed small details, and stayed consistent. Next month, I will bring even more playfulness and calm focus into my routine.`,
    ];

    const content = lines.join('\n');

    // Save auto-generated content
    await this.saveReflection(userId, { month, year, content });

    return { content };
  }
}

export const reflectionService = new ReflectionService();
