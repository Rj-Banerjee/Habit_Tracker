import type { LogSource } from './api';
import { shortDate, weekLabel } from './dates';
import { AnalyticsData, AnalyticsHabit, consistency, habitStrength, percentLabel, timing, volume } from './metrics';

// The numbers on Habit detail, worded. Each is a tile: a value, a label and a short note.

export interface DetailStat {
  label: string;
  value: string;
  note?: string;
}

const count = (n: number, word: string) => `${n.toLocaleString('en-IN')} ${word}${n === 1 ? '' : 's'}`;
const amount = (n: number, unit: string | null) => `${n.toLocaleString('en-IN')}${unit ? ` ${unit}` : ''}`;

const SOURCE_NAMES: Record<LogSource, string> = {
  tap: 'Tap',
  voice: 'Voice',
  coach: 'Coach',
  widget: 'Widget',
  notification: 'Notification',
};

export function waitLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

// The four at the top: how strong it is, how often, and the streaks.
export function headlineStats(habit: AnalyticsHabit, data: AnalyticsData, strengthData: AnalyticsData): DetailStat[] {
  const c = consistency(habit, data);
  const done = c.full + c.minimum + c.repaired;
  return [
    { label: 'Strength', value: String(habitStrength(habit, strengthData)), note: 'out of 100' },
    { label: 'Completion', value: percentLabel(c.completionRate), note: `${done} of ${count(c.judged, c.unit)}` },
    { label: 'Current streak', value: count(c.currentStreak, c.unit) },
    { label: 'Best streak', value: count(Math.max(c.bestStreak, c.currentStreak), c.unit) },
  ];
}

export function consistencyStats(habit: AnalyticsHabit, data: AnalyticsData): DetailStat[] {
  const c = consistency(habit, data);
  if (c.unit === 'week') {
    return [
      { label: 'Weeks met', value: String(c.full), note: `of ${count(c.judged, 'week')}` },
      { label: 'Repaired', value: String(c.repaired), note: 'with an extra session the next week' },
      { label: 'Protected', value: String(c.protected), note: count(c.graceUsed, 'Grace Day') },
      { label: 'Missed', value: String(c.missed) },
    ];
  }
  const stats: DetailStat[] = [
    { label: 'Full', value: percentLabel(c.fullRate), note: count(c.full, 'day') },
    { label: 'Minimum', value: percentLabel(c.minimumRate), note: count(c.minimum, 'day') },
    { label: 'Full vs minimum', value: c.fullShare === null ? '–' : `${percentLabel(c.fullShare)} full`, note: 'of days done' },
    { label: 'Repaired', value: String(c.repaired), note: 'days made up the next day' },
    { label: 'Grace Days used', value: String(c.graceUsed), note: 'days kept safe' },
    {
      label: 'Back on track',
      value: c.recoveryDays === null ? '–' : count(c.recoveryDays, 'day'),
      note: 'on average, from a miss',
    },
    { label: 'Skipped', value: String(c.skipped) },
  ];
  if (c.partial > 0) {
    stats.push({ label: 'Below the minimum', value: String(c.partial), note: 'shown, not counted' });
  }
  return stats;
}

export function volumeStats(habit: AnalyticsHabit, data: AnalyticsData): DetailStat[] | null {
  const v = volume(habit, data);
  if (!v) return null;
  const stats: DetailStat[] = [
    { label: 'Total', value: amount(v.total, v.unit) },
    { label: 'Daily average', value: v.dailyAverage === null ? '–' : amount(v.dailyAverage, v.unit), note: 'on days due' },
    { label: 'Weekly average', value: v.weeklyAverage === null ? '–' : amount(v.weeklyAverage, v.unit) },
    { label: 'Target reached', value: percentLabel(v.targetHitRate), note: 'of days due' },
  ];
  if (v.bestDay) stats.push({ label: 'Best day', value: amount(v.bestDay.amount, v.unit), note: shortDate(v.bestDay.date) });
  if (v.bestWeek) {
    stats.push({ label: 'Best week', value: amount(v.bestWeek.amount, v.unit), note: weekLabel(v.bestWeek.weekStart) });
  }
  if (v.milestones !== null && habit.milestone_label) {
    stats.push({ label: 'Milestones', value: count(v.milestones, habit.milestone_label) });
  }
  return stats;
}

export function timingStats(habit: AnalyticsHabit, data: AnalyticsData): DetailStat[] {
  const t = timing(data, [habit.id]);
  const sources = (Object.entries(t.sources) as [LogSource, number][]).sort((a, b) => b[1] - a[1]);
  const total = sources.reduce((sum, [, n]) => sum + n, 0);
  const stats: DetailStat[] = [];
  if (sources.length) {
    const [top] = sources[0];
    stats.push({
      label: 'Logged mostly by',
      value: SOURCE_NAMES[top],
      note: sources.map(([source, k]) => `${SOURCE_NAMES[source]} ${percentLabel(k / total)}`).join(' · '),
    });
  }
  if (habit.reminder_time) {
    stats.push({
      label: 'Reminder to done',
      value: t.reminderToDone === null ? '–' : waitLabel(t.reminderToDone),
      note: `after the ${habit.reminder_time.slice(0, 5)} reminder`,
    });
  }
  return stats;
}

// Top skip reasons, worded: "Busy day, 4 times".
export const skipReasonLines = (habit: AnalyticsHabit, data: AnalyticsData) =>
  consistency(habit, data).skipReasons.map(({ reason, count: n }) => `${reason}, ${n === 1 ? 'once' : `${n} times`}`);
