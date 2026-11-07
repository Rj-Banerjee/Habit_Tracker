import { ProgressDay, ProgressHabit, TodayRow } from './api';
import { addDays } from './dates';
import { parseReminderTime } from './onboarding';
import { isLogged } from './todayModel';

const MIN_LOGS_FOR_A_PATTERN = 5;
const MIN_DAYS_FOR_A_WEEKDAY = 3;
const WEAK_GAP = 0.2;
const RISK_DAYS = 14;
// Above this a habit doesn't need help, and a nudge would only be noise.
const STEADY_RATE = 0.9;
export const IGNORED_NUDGES_LIMIT = 3;
const NUDGE_LEAD_MINUTES = 30;
const REMINDER_GAP_MINUTES = 60;
const MIN_LEAD_MINUTES = 10;

const WEEKDAY_NAMES = ['', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

const isDone = (day: ProgressDay) => day.status === 'done' || day.status === 'repaired';
const isoDay = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

export function hourLabel(hour: number): string {
  const twelve = hour % 12 || 12;
  return `${twelve}${hour < 12 ? 'am' : 'pm'}`;
}

// The hour a habit is most often done. Null until there's enough to go on.
export function peakHour(days: ProgressDay[], habitId: string): number | null {
  const hours = days
    .filter((day) => day.habit_id === habitId && isDone(day) && day.logged_hour != null)
    .map((day) => day.logged_hour as number);
  if (hours.length < MIN_LOGS_FOR_A_PATTERN) return null;

  const counts = new Map<number, number>();
  for (const hour of hours) counts.set(hour, (counts.get(hour) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

// A weekday only stands out if it's clearly below the habit's own average. Skips with a
// reason don't count against it, as with the identity score.
export function weakWeekday(days: ProgressDay[], habitId: string): string | null {
  const settled = days.filter(
    (day) => day.habit_id === habitId && day.status !== 'pending' && day.status !== 'skipped'
  );
  if (settled.length === 0) return null;
  const overall = settled.filter(isDone).length / settled.length;

  const perDay = new Map<number, ProgressDay[]>();
  for (const day of settled) {
    const weekday = isoDay(day.date);
    perDay.set(weekday, [...(perDay.get(weekday) ?? []), day]);
  }
  const rates = [...perDay]
    .filter(([, list]) => list.length >= MIN_DAYS_FOR_A_WEEKDAY)
    .map(([weekday, list]) => ({ weekday, rate: list.filter(isDone).length / list.length }))
    .sort((a, b) => a.rate - b.rate || a.weekday - b.weekday);

  const weakest = rates[0];
  return weakest && weakest.rate <= overall - WEAK_GAP ? WEEKDAY_NAMES[weakest.weekday] : null;
}

export function habitPatterns(days: ProgressDay[], habit: ProgressHabit): string[] {
  const peak = peakHour(days, habit.id);
  const weak = weakWeekday(days, habit.id);
  const lines: string[] = [];
  if (peak !== null) lines.push(`You usually do ${habit.title} around ${hourLabel(peak)}.`);
  if (weak) lines.push(`${weak} are harder for this one. A smaller version counts.`);
  return lines;
}

export interface NudgeRecord {
  habit_id: string;
  outcome: 'logged' | 'ignored';
}

export interface NudgePlan {
  habitId: string;
  title: string;
  date: string;
  hour: number;
  minute: number;
  body: string;
}

interface NudgeInput {
  habits: ProgressHabit[];
  days: ProgressDay[];
  rows: TodayRow[];
  today: string;
  // Minutes since midnight, in the person's day.
  nowMinutes: number;
  // Newest first.
  history: NudgeRecord[];
}

function completionRate(days: ProgressDay[], habitId: string, today: string) {
  const from = addDays(today, -RISK_DAYS);
  const recent = days.filter(
    (day) =>
      day.habit_id === habitId &&
      day.date >= from &&
      day.status !== 'pending' &&
      day.status !== 'skipped'
  );
  return recent.length ? recent.filter(isDone).length / recent.length : 1;
}

function ignoredInARow(history: NudgeRecord[], habitId: string) {
  let count = 0;
  for (const record of history) {
    if (record.habit_id !== habitId) continue;
    if (record.outcome === 'logged') break;
    count += 1;
  }
  return count;
}

const minutesOf = (time: string | null | undefined) => {
  const parsed = time ? parseReminderTime(time.slice(0, 5)) : null;
  return parsed ? parsed.hour * 60 + parsed.minute : null;
};

// At most one nudge a day, on top of each habit's own reminder. It goes to the habit most
// at risk, before the time they usually do it, and never close to that habit's reminder.
export function planNudge(input: NudgeInput): NudgePlan | null {
  const { habits, days, rows, today, nowMinutes, history } = input;

  const candidatesOn = (date: string) => {
    const due =
      date === today
        ? habits.filter((habit) =>
            rows.some((row) => row.habit_id === habit.id && row.is_today && !isLogged(row))
          )
        : habits.filter((habit) => habit.schedule_days.includes(isoDay(date)));

    return due.flatMap((habit) => {
      const peak = peakHour(days, habit.id);
      const rate = completionRate(days, habit.id, today);
      if (peak === null || rate >= STEADY_RATE) return [];
      if (ignoredInARow(history, habit.id) >= IGNORED_NUDGES_LIMIT) return [];

      const fire = peak * 60 - NUDGE_LEAD_MINUTES;
      if (fire < 0) return [];
      if (date === today && fire < nowMinutes + MIN_LEAD_MINUTES) return [];
      const reminderMinutes = minutesOf(habit.reminder_time);
      if (reminderMinutes !== null && Math.abs(fire - reminderMinutes) < REMINDER_GAP_MINUTES) {
        return [];
      }
      return [{ habit, peak, rate, fire }];
    });
  };

  for (const date of [today, addDays(today, 1)]) {
    const [best] = candidatesOn(date).sort((a, b) => a.rate - b.rate || a.fire - b.fire);
    if (best) {
      return {
        habitId: best.habit.id,
        title: best.habit.title,
        date,
        hour: Math.floor(best.fire / 60),
        minute: best.fire % 60,
        body: `${best.habit.title} usually happens around ${hourLabel(best.peak)}. The small version counts.`,
      };
    }
  }
  return null;
}
