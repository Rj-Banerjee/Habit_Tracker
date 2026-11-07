import { addDays, dayName, shortDate } from './dates';
import {
  AnalyticsData,
  compareHeadlines,
  consistency,
  headline,
  percentLabel,
  Trend,
  weekBars,
  withinRange,
} from './metrics';

// The weekly report in the Sunday Review: the week's completion and the change from the
// week before, the strongest habit, the one that needs a little care, and the best day.
// Worked out from analytics for the two weeks, so it costs no AI call.

export interface ReportHabit {
  habitId: string;
  title: string;
  done: number;
  judged: number;
  rate: number;
  unit: 'day' | 'week';
}

export interface WeeklyReport {
  weekStart: string;
  completion: number | null;
  before: number | null;
  trend: Trend | null;
  strongest: ReportHabit | null;
  weakest: ReportHabit | null;
  bestDay: { date: string; done: number; due: number } | null;
  // The report, worded, for the Sunday Review.
  lines: string[];
  // One line for the card on Today.
  headline: string;
}

// The two weeks the report needs: this one and the one before.
export const reportRange = (weekStart: string) => ({ from: addDays(weekStart, -7), to: addDays(weekStart, 6) });

const CHANGE: Record<Trend, string> = { up: 'up from', down: 'down from', same: 'about the same as' };

const habitLine = (habit: ReportHabit) =>
  `${habit.title}, ${habit.done} of ${habit.judged} ${habit.unit}${habit.judged === 1 ? '' : 's'}`;

export function weeklyReport(data: AnalyticsData, weekStart: string): WeeklyReport {
  const week = withinRange(data, weekStart, addDays(weekStart, 6));
  const previous = withinRange(data, addDays(weekStart, -7), addDays(weekStart, -1));
  const now = headline(week);
  const then = headline(previous);
  const trend = compareHeadlines(now, then).completionRate.trend;

  const habits = data.habits
    .map((habit) => {
      const c = consistency(habit, week);
      return {
        habitId: habit.id,
        title: habit.title,
        done: c.full + c.minimum + c.repaired,
        judged: c.judged,
        rate: c.completionRate ?? 0,
        unit: c.unit,
      };
    })
    .filter((habit) => habit.judged > 0);
  const order = [...habits].sort((a, b) => b.rate - a.rate || b.done - a.done || a.title.localeCompare(b.title));
  const strongest = order[0] ?? null;
  // Only a habit that slipped needs care, and never the same one as the strongest.
  const lowest = order.at(-1);
  const weakest = lowest && lowest !== strongest && lowest.rate < 1 ? lowest : null;

  const days = weekBars(week).flatMap((w) => w.days).filter((day) => day.due > 0);
  const best = days.reduce<(typeof days)[number] | null>((top, day) => {
    if (!top) return day;
    const share = (d: typeof day) => (d.done - d.sessions) / d.due;
    return share(day) > share(top) || (share(day) === share(top) && day.done > top.done) ? day : top;
  }, null);
  const bestDay = best && best.done - best.sessions > 0 ? { date: best.date, done: best.done - best.sessions, due: best.due } : null;

  const completion = now.completionRate;
  const before = then.completionRate;
  const change = trend && before !== null ? `, ${CHANGE[trend]} ${percentLabel(before)} the week before` : '';
  const lines: string[] = [];
  if (completion !== null) lines.push(`${percentLabel(completion)} done this week${change}.`);
  if (strongest) lines.push(`Strongest: ${habitLine(strongest)}.`);
  if (weakest) lines.push(`Could use a little care: ${habitLine(weakest)}.`);
  if (bestDay) {
    const all = bestDay.done === bestDay.due;
    lines.push(
      `Best day: ${dayName(bestDay.date)} ${shortDate(bestDay.date)}, ${all ? 'everything done' : `${bestDay.done} of ${bestDay.due}`}.`
    );
  }

  return {
    weekStart,
    completion,
    before,
    trend,
    strongest,
    weakest,
    bestDay,
    lines,
    headline:
      completion === null
        ? 'Your week is ready to look back on.'
        : `${percentLabel(completion)} done this week${trend && before !== null ? `, ${CHANGE[trend]} ${percentLabel(before)}` : ''}. Ready to look back?`,
  };
}
