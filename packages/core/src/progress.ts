import { HabitLevel, HabitType, ProgressDay, ProgressHabit } from './api';
import { addDays, weekStart } from './dates';
import { IdentityToken } from './tokens';

const SCORE_DAYS = 30;
const FORECAST_DAYS = 30;
const FORECAST_AHEAD = 365;
const HEATMAP_WEEKS = 53;
// Below this, a forecast would be a guess.
const FORECAST_MIN_DAYS = 7;

export const FORECAST_RATE_MIN = 50;
export const FORECAST_RATE_MAX = 100;

const isDone = (day: ProgressDay) => day.status === 'done' || day.status === 'repaired';
// Today isn't over, so it can't count against anyone.
const isSettled = (day: ProgressDay) => day.status !== 'pending';

const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

const daysOf = (days: ProgressDay[], habitId: string) =>
  days.filter((day) => day.habit_id === habitId).sort(byDate);

export interface IdentityScore {
  identityId: string;
  name: string;
  colourToken: IdentityToken;
  done: number;
  total: number;
  label: string;
}

// Out of the last 30 days, the days every due habit in the identity was done at any
// level. Repaired counts, protected doesn't, and days with nothing due are left out. An
// allowed skip makes that habit not due. A 3rd skip in a week comes back as missed.
export function identityScores(
  habits: ProgressHabit[],
  days: ProgressDay[],
  today: string
): IdentityScore[] {
  const identities = new Map(habits.map((habit) => [habit.identity_id, habit.identities]));
  const owner = new Map(habits.map((habit) => [habit.id, habit.identity_id]));

  return [...identities].map(([identityId, identity]) => {
    const owned = days.filter((day) => owner.get(day.habit_id) === identityId);
    // A day counts once it's finished, otherwise the 30 run up to yesterday.
    const todays = owned.filter((day) => day.date === today);
    const end = todays.length > 0 && todays.every(isSettled) ? today : addDays(today, -1);
    const from = addDays(end, 1 - SCORE_DAYS);

    const perDate = new Map<string, boolean>();
    for (const day of owned) {
      if (day.date < from || day.date > end || day.status === 'skipped') continue;
      perDate.set(day.date, (perDate.get(day.date) ?? true) && isDone(day));
    }
    const done = [...perDate.values()].filter(Boolean).length;
    const total = perDate.size;
    return {
      identityId,
      name: identity.name,
      colourToken: identity.colour_token,
      done,
      total,
      label: `${done} of ${total} ${total === 1 ? 'day' : 'days'}`,
    };
  });
}

export type HeatKind =
  | 'done'
  | 'minimum'
  | 'repaired'
  | 'protected'
  | 'skipped'
  | 'missed'
  | 'empty';

export const HEAT_LABELS: Record<HeatKind, string> = {
  done: 'Done',
  minimum: 'Minimum',
  repaired: 'Repaired',
  protected: 'Protected',
  skipped: 'Skipped',
  missed: 'Not done',
  empty: 'Not due',
};

export function heatKind(day: ProgressDay | undefined): HeatKind {
  switch (day?.status) {
    case 'done':
      return day.level_done === 'full' ? 'done' : 'minimum';
    case 'repaired':
      return 'repaired';
    case 'protected':
      return 'protected';
    case 'skipped':
      return 'skipped';
    case 'missed':
      return 'missed';
    default:
      return 'empty';
  }
}

export interface HeatCell {
  date: string;
  kind: HeatKind;
}

export interface Heatmap {
  // One column per week, Monday first. Days after today aren't there.
  weeks: HeatCell[][];
  counts: Record<HeatKind, number>;
}

export function heatmap(days: ProgressDay[], habitId: string, today: string): Heatmap {
  const byDay = new Map(daysOf(days, habitId).map((day) => [day.date, day]));
  const counts = Object.fromEntries(
    (Object.keys(HEAT_LABELS) as HeatKind[]).map((kind) => [kind, 0])
  ) as Record<HeatKind, number>;
  const start = addDays(weekStart(today), -7 * (HEATMAP_WEEKS - 1));

  const weeks = Array.from({ length: HEATMAP_WEEKS }, (_, week) => {
    const cells: HeatCell[] = [];
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(start, week * 7 + day);
      if (date > today) break;
      const kind = heatKind(byDay.get(date));
      counts[kind] += 1;
      cells.push({ date, kind });
    }
    return cells;
  });
  return { weeks, counts };
}

export interface StreakRun {
  start: string;
  end: string;
  length: number;
  // The miss that ended it. Null means it's still going.
  fracturedOn: string | null;
  repairs: string[];
  protectedDays: string[];
}

// The same rules as the server: done and repaired add one, a miss ends the run, and
// everything else leaves it as it was.
export function streakHistory(days: ProgressDay[], habitId: string): StreakRun[] {
  const runs: StreakRun[] = [];
  let run: StreakRun | null = null;

  for (const day of daysOf(days, habitId)) {
    if (isDone(day)) {
      run ??= { start: day.date, end: day.date, length: 0, fracturedOn: null, repairs: [], protectedDays: [] };
      run.end = day.date;
      run.length += 1;
      if (day.status === 'repaired') run.repairs.push(day.date);
    } else if (day.status === 'protected') {
      run?.protectedDays.push(day.date);
    } else if (day.status === 'missed' && run) {
      run.fracturedOn = day.date;
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs.reverse();
}

export interface TopHabit {
  habitId: string;
  title: string;
  done: number;
  due: number;
  rate: number;
}

const TOP_COUNT = 3;

export function topHabits(
  habits: ProgressHabit[],
  days: ProgressDay[],
  today: string
): TopHabit[] {
  const month = today.slice(0, 7);
  return habits
    .map((habit) => {
      const inMonth = daysOf(days, habit.id).filter(
        (day) => day.date.startsWith(month) && day.date <= today && isSettled(day)
      );
      const done = inMonth.filter(isDone).length;
      return {
        habitId: habit.id,
        title: habit.title,
        done,
        due: inMonth.length,
        rate: inMonth.length ? done / inMonth.length : 0,
      };
    })
    .filter((habit) => habit.due > 0)
    .sort((a, b) => b.rate - a.rate || b.done - a.done || a.title.localeCompare(b.title))
    .slice(0, TOP_COUNT);
}

// ISO weekdays, Monday as 1, as schedules store them.
const isoDay = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

export function scheduledDaysAhead(schedule: number[], today: string, ahead = FORECAST_AHEAD) {
  let count = 0;
  for (let offset = 1; offset <= ahead; offset += 1) {
    if (schedule.includes(isoDay(addDays(today, offset)))) count += 1;
  }
  return count;
}

const usesAmount = (type: HabitType) => type === 'count' || type === 'duration';

// A log without an amount did that day's target, which is why the target is dated.
const amountOn = (day: ProgressDay, level: HabitLevel | null = day.level_done) =>
  day.amount ?? (level === 'full' || day.status === 'repaired' ? (day.target ?? 0) : 0);

export interface Forecast {
  habitId: string;
  // What the last 30 scheduled days add up to, from 50 to 100.
  actualRate: number;
  rate: number;
  scheduledAhead: number;
  completions: number;
  amount: number | null;
  unit: string | null;
  milestones: number | null;
  milestoneLabel: string | null;
  sentence: string;
}

const readable = (count: number) => count.toLocaleString('en-IN');

const plural = (count: number, label: string) => (count === 1 ? label : `${label}s`);

function forecastSentence(habit: ProgressHabit, forecast: Omit<Forecast, 'sentence'>) {
  const { amount, unit, completions, milestones, milestoneLabel } = forecast;
  const total =
    amount === null
      ? `${readable(completions)} ${plural(completions, 'time')}`
      : `${readable(amount)} ${unit ?? ''}`.trim();
  if (milestones !== null && milestoneLabel) {
    return `About ${total} in a year, or about ${milestones} ${plural(milestones, milestoneLabel)}.`;
  }
  return `About ${total} in a year.`;
}

export const clampRate = (rate: number) =>
  Math.min(FORECAST_RATE_MAX, Math.max(FORECAST_RATE_MIN, Math.round(rate)));

// With no rate, it projects what they've actually been doing. The slider passes one.
export function forecast(
  habit: ProgressHabit,
  days: ProgressDay[],
  today: string,
  rate?: number
): Forecast | null {
  const recent = daysOf(days, habit.id).filter(isSettled).slice(-FORECAST_DAYS);
  if (recent.length < FORECAST_MIN_DAYS) return null;

  const done = recent.filter(isDone);
  const actual = (done.length / recent.length) * 100;
  const chosen = rate ?? actual;
  const scheduledAhead = scheduledDaysAhead(habit.schedule_days, today);
  const completions = Math.round((scheduledAhead * chosen) / 100);

  // Per completed day, so moving the slider changes how often, not how much.
  const perCompletion = done.length
    ? done.reduce((sum, day) => sum + amountOn(day), 0) / done.length
    : (habit.target ?? 0);
  const amount = usesAmount(habit.type) ? Math.round(completions * perCompletion) : null;

  const base = amount ?? completions;
  const milestones =
    habit.milestone_amount && habit.milestone_label
      ? Math.floor(base / habit.milestone_amount)
      : null;

  const result = {
    habitId: habit.id,
    actualRate: clampRate(actual),
    rate: clampRate(chosen),
    scheduledAhead,
    completions,
    amount,
    unit: habit.unit,
    milestones,
    milestoneLabel: habit.milestone_label,
  };
  return { ...result, sentence: forecastSentence(habit, result) };
}
