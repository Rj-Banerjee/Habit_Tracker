import type { HabitFrequency, HabitLevel, HabitType, LogSource, LogStatus, ProgressHabit, TimeOfDay } from './api';
import { addDays, dayName, isoWeekday, shortDate, weekLabel } from './dates';
import type { IdentityToken } from './tokens';

// Analytics, from the days and weeks the database works out (get_analytics). Every
// number here is plain arithmetic over those, so it's the same on every screen and in the
// AI's insights. See "Analytics" in PLAN.md.

export interface AnalyticsHabit {
  id: string;
  title: string;
  type: HabitType;
  unit: string | null;
  frequency: HabitFrequency;
  per_week: number | null;
  // Today's target and schedule, for the forecast.
  target: number | null;
  schedule_days: number[];
  identity_id: string;
  identity_name: string;
  colour_token: IdentityToken;
  starts_on: string;
  ends_on: string | null;
  reminder_time: string | null;
  time_of_day: TimeOfDay;
  milestone_amount: number | null;
  milestone_label: string | null;
  current_streak: number;
  longest_streak: number;
}

export interface AnalyticsDay {
  habit_id: string;
  date: string;
  // The day as the streak rules see it: done, repaired, skipped, protected, missed,
  // pending, or unscheduled for a times-per-week habit's quiet days.
  status: string;
  log_status: LogStatus | null;
  level_done: HabitLevel | null;
  amount: number | null;
  source: LogSource | null;
  skip_reason: string | null;
  target: number | null;
  minimum: number | null;
  // Minutes after local midnight it was logged, on the day itself only.
  logged_minute: number | null;
}

export interface AnalyticsWeek {
  habit_id: string;
  week_start: string;
  status: 'met' | 'pending' | 'missed' | 'protected' | 'repaired' | 'none';
  quota: number;
  sessions: number;
}

export interface AnalyticsData {
  from: string;
  to: string;
  today: string;
  habits: AnalyticsHabit[];
  days: AnalyticsDay[];
  weeks: AnalyticsWeek[];
  grace_spent: { habit_id: string; date: string }[];
}

// ---------------------------------------------------------------------------
// What each day was
// ---------------------------------------------------------------------------

export type DayKind = 'full' | 'minimum' | 'repaired' | 'protected' | 'skipped' | 'missed' | 'pending';

export function dayKind(day: AnalyticsDay): DayKind | null {
  switch (day.status) {
    case 'done':
      return day.level_done === 'full' ? 'full' : 'minimum';
    case 'repaired':
      return 'repaired';
    case 'protected':
      return 'protected';
    case 'skipped':
      return 'skipped';
    case 'missed':
      return 'missed';
    case 'pending':
      return 'pending';
    default:
      return null;
  }
}

const COMPLETED: DayKind[] = ['full', 'minimum', 'repaired'];
// A day is judged once it's settled and was owed: skipped and protected days weren't.
const JUDGED: DayKind[] = ['full', 'minimum', 'repaired', 'missed'];

export const isWeeklyHabit = (habit: AnalyticsHabit) => habit.frequency === 'per_week';

const daysOf = (data: AnalyticsData, habitId: string) => data.days.filter((day) => day.habit_id === habitId);
const weeksOf = (data: AnalyticsData, habitId: string) => data.weeks.filter((week) => week.habit_id === habitId);
const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

// ---------------------------------------------------------------------------
// Habit strength
// ---------------------------------------------------------------------------

// Each judged period moves it a little: full or repaired counts 1, minimum 0.8, a miss 0.
// A run of misses halves it in 13 scheduled days, or 4 weeks; it never drops to zero.
export const STRENGTH_DAY_FACTOR = 0.5 ** (1 / 13);
export const STRENGTH_WEEK_FACTOR = 0.5 ** (1 / 4);

const PERIOD_VALUE: Partial<Record<DayKind, number>> = { full: 1, repaired: 1, minimum: 0.8, missed: 0 };
const WEEK_VALUE: Partial<Record<AnalyticsWeek['status'], number>> = { met: 1, repaired: 1, missed: 0 };

export interface StrengthPoint {
  date: string;
  strength: number;
}

// The strength after each judged period, from 0 to 100.
export function strengthSeries(habit: AnalyticsHabit, data: AnalyticsData): StrengthPoint[] {
  const points: StrengthPoint[] = [];
  let score = 0;
  const step = (value: number | undefined, factor: number, date: string) => {
    if (value === undefined) return;
    score = score * factor + value * (1 - factor);
    points.push({ date, strength: Math.round(score * 100) });
  };
  if (isWeeklyHabit(habit)) {
    for (const week of weeksOf(data, habit.id)) step(WEEK_VALUE[week.status], STRENGTH_WEEK_FACTOR, week.week_start);
  } else {
    for (const day of daysOf(data, habit.id)) {
      const kind = dayKind(day);
      step(kind ? PERIOD_VALUE[kind] : undefined, STRENGTH_DAY_FACTOR, day.date);
    }
  }
  return points;
}

export const habitStrength = (habit: AnalyticsHabit, data: AnalyticsData) =>
  strengthSeries(habit, data).at(-1)?.strength ?? 0;

// ---------------------------------------------------------------------------
// Consistency
// ---------------------------------------------------------------------------

export interface Consistency {
  // Days, or weeks for a times-per-week habit.
  unit: 'day' | 'week';
  judged: number;
  full: number;
  minimum: number;
  repaired: number;
  protected: number;
  skipped: number;
  missed: number;
  // Days with something done but below the minimum: shown, never counted.
  partial: number;
  completionRate: number | null;
  fullRate: number | null;
  minimumRate: number | null;
  // Of the completed days, how many were the full version.
  fullShare: number | null;
  graceUsed: number;
  // Average scheduled days from a miss to the next completion.
  recoveryDays: number | null;
  skipReasons: { reason: string; count: number }[];
  currentStreak: number;
  bestStreak: number;
}

export function consistency(habit: AnalyticsHabit, data: AnalyticsData): Consistency {
  const graceUsed = data.grace_spent.filter((grace) => grace.habit_id === habit.id).length;
  const base = { graceUsed, currentStreak: habit.current_streak, bestStreak: habit.longest_streak };

  if (isWeeklyHabit(habit)) {
    const weeks = weeksOf(data, habit.id);
    const count = (status: AnalyticsWeek['status']) => weeks.filter((w) => w.status === status).length;
    const met = count('met');
    const repaired = count('repaired');
    const missed = count('missed');
    const judged = met + repaired + missed;
    return {
      ...base,
      unit: 'week',
      judged,
      full: met,
      minimum: 0,
      repaired,
      protected: count('protected'),
      skipped: 0,
      missed,
      partial: 0,
      completionRate: rate(met + repaired, judged),
      fullRate: rate(met, judged),
      minimumRate: rate(0, judged),
      fullShare: rate(met, met + repaired),
      recoveryDays: recovery(weeks.map((w) => (w.status === 'missed' ? 'missed' : w.status === 'met' || w.status === 'repaired' ? 'full' : null))),
      skipReasons: [],
    };
  }

  const days = daysOf(data, habit.id);
  const kinds = days.map(dayKind);
  const count = (kind: DayKind) => kinds.filter((k) => k === kind).length;
  const full = count('full');
  const minimum = count('minimum');
  const repaired = count('repaired');
  const missed = count('missed');
  const judged = kinds.filter((k) => k && JUDGED.includes(k)).length;
  const reasons = new Map<string, number>();
  for (const day of days) {
    if (dayKind(day) === 'skipped' && day.skip_reason) {
      reasons.set(day.skip_reason, (reasons.get(day.skip_reason) ?? 0) + 1);
    }
  }
  return {
    ...base,
    unit: 'day',
    judged,
    full,
    minimum,
    repaired,
    protected: count('protected'),
    skipped: count('skipped'),
    missed,
    partial: days.filter((day) => day.log_status === 'partial').length,
    completionRate: rate(full + minimum + repaired, judged),
    fullRate: rate(full, judged),
    minimumRate: rate(minimum, judged),
    fullShare: rate(full, full + minimum),
    recoveryDays: recovery(kinds),
    skipReasons: [...reasons]
      .map(([reason, n]) => ({ reason, count: n }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
      .slice(0, 3),
  };
}

// Periods from each miss to the next completion, averaged. A miss never recovered from in
// the range isn't counted, so a recent miss doesn't drag it down.
function recovery(kinds: (DayKind | null)[]): number | null {
  const gaps: number[] = [];
  let missedAt: number | null = null;
  kinds.forEach((kind, index) => {
    if (kind === 'missed' && missedAt === null) missedAt = index;
    else if (kind && COMPLETED.includes(kind) && missedAt !== null) {
      gaps.push(index - missedAt);
      missedAt = null;
    }
  });
  return gaps.length ? round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
}

// ---------------------------------------------------------------------------
// Volume, for count and duration habits
// ---------------------------------------------------------------------------

export interface Volume {
  unit: string | null;
  total: number;
  dailyAverage: number | null;
  weeklyAverage: number | null;
  // Judged days at or above the full target.
  targetHitRate: number | null;
  bestDay: { date: string; amount: number } | null;
  bestWeek: { weekStart: string; amount: number } | null;
  longestRun: number;
  milestones: number | null;
}

const weekStart = (date: string) => addDays(date, 1 - isoWeekday(date));

export function volume(habit: AnalyticsHabit, data: AnalyticsData): Volume | null {
  if (habit.type !== 'count' && habit.type !== 'duration') return null;
  const days = daysOf(data, habit.id);
  // Everything done counts toward the total, below the minimum too: that was real work.
  const amounts = days.filter((day) => (day.amount ?? 0) > 0);
  const total = round(amounts.reduce((sum, day) => sum + (day.amount ?? 0), 0), 2);
  const judged = days.filter((day) => {
    const kind = dayKind(day);
    return kind !== null && JUDGED.includes(kind);
  });
  const hit = judged.filter((day) => day.target !== null && (day.amount ?? 0) >= day.target).length;
  const byWeek = new Map<string, number>();
  for (const day of amounts) byWeek.set(weekStart(day.date), (byWeek.get(weekStart(day.date)) ?? 0) + (day.amount ?? 0));
  const best = amounts.reduce<AnalyticsDay | null>((a, b) => (!a || (b.amount ?? 0) > (a.amount ?? 0) ? b : a), null);
  const bestWeek = [...byWeek].reduce<[string, number] | null>((a, b) => (!a || b[1] > a[1] ? b : a), null);
  const span = Math.max(1, (Date.parse(`${data.to}T00:00:00Z`) - Date.parse(`${data.from}T00:00:00Z`)) / 86_400_000 + 1);
  return {
    unit: habit.unit,
    total,
    dailyAverage: judged.length ? round(total / judged.length) : null,
    weeklyAverage: round((total / span) * 7),
    targetHitRate: rate(hit, judged.length),
    bestDay: best ? { date: best.date, amount: best.amount ?? 0 } : null,
    bestWeek: bestWeek ? { weekStart: bestWeek[0], amount: round(bestWeek[1], 2) } : null,
    longestRun: habit.longest_streak,
    milestones: habit.milestone_amount ? Math.floor(total / habit.milestone_amount) : null,
  };
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

export interface Timing {
  // Completions logged in each hour of the day, on the day itself.
  byHour: number[];
  // For each weekday, Monday first: completed out of judged.
  byWeekday: { done: number; judged: number; rate: number | null }[];
  sources: Partial<Record<LogSource, number>>;
  // Average minutes from the reminder to the log, on days logged after it.
  reminderToDone: number | null;
}

export function timing(data: AnalyticsData, habitIds: string[] = data.habits.map((h) => h.id)): Timing {
  const wanted = new Set(habitIds);
  const habits = new Map(data.habits.map((h) => [h.id, h]));
  const byHour = Array.from({ length: 24 }, () => 0);
  const byWeekday = Array.from({ length: 7 }, () => ({ done: 0, judged: 0, rate: null as number | null }));
  const sources: Partial<Record<LogSource, number>> = {};
  const waits: number[] = [];

  for (const day of data.days) {
    const habit = habits.get(day.habit_id);
    if (!wanted.has(day.habit_id) || !habit) continue;
    const kind = dayKind(day);
    const completed = kind !== null && COMPLETED.includes(kind) && kind !== 'repaired';
    if (completed && day.logged_minute !== null) {
      byHour[Math.floor(day.logged_minute / 60)] += 1;
      const reminder = habit.reminder_time ? minutesOf(habit.reminder_time) : null;
      if (reminder !== null && day.logged_minute >= reminder) waits.push(day.logged_minute - reminder);
    }
    if (completed && day.source) sources[day.source] = (sources[day.source] ?? 0) + 1;
    // Weekdays only for habits due on days; a times-per-week habit has no due days.
    if (!isWeeklyHabit(habit) && kind !== null && JUDGED.includes(kind)) {
      const slot = byWeekday[isoWeekday(day.date) - 1];
      slot.judged += 1;
      if (COMPLETED.includes(kind)) slot.done += 1;
    }
  }
  for (const slot of byWeekday) slot.rate = rate(slot.done, slot.judged);
  return {
    byHour,
    byWeekday,
    sources,
    reminderToDone: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
  };
}

const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// ---------------------------------------------------------------------------
// Overview and comparisons
// ---------------------------------------------------------------------------

export interface Headline {
  completionRate: number | null;
  averageStrength: number | null;
  totalDone: number;
  bestActiveStreak: { habitId: string; title: string; streak: number; unit: 'day' | 'week' } | null;
}

// Strength is worked out over strengthData, which can start before the range, so a short
// range doesn't start every habit from zero.
export function headline(data: AnalyticsData, strengthData: AnalyticsData = data): Headline {
  let done = 0;
  let judged = 0;
  for (const habit of data.habits) {
    const c = consistency(habit, data);
    done += c.full + c.minimum + c.repaired;
    judged += c.judged;
  }
  const strengths = data.habits.map((h) => habitStrength(h, strengthData));
  const best = data.habits.reduce<AnalyticsHabit | null>(
    (a, b) => (b.current_streak > 0 && (!a || b.current_streak > a.current_streak) ? b : a),
    null
  );
  return {
    completionRate: rate(done, judged),
    averageStrength: strengths.length ? Math.round(strengths.reduce((a, b) => a + b, 0) / strengths.length) : null,
    totalDone: done,
    bestActiveStreak: best
      ? { habitId: best.id, title: best.title, streak: best.current_streak, unit: isWeeklyHabit(best) ? 'week' : 'day' }
      : null,
  };
}

export type Trend = 'up' | 'down' | 'same';

export interface Change {
  now: number | null;
  before: number | null;
  trend: Trend | null;
}

const change = (now: number | null, before: number | null, tolerance: number): Change => ({
  now,
  before,
  trend: now === null || before === null ? null : Math.abs(now - before) <= tolerance ? 'same' : now > before ? 'up' : 'down',
});

// This period against the one before it, card by card.
export function compareHeadlines(now: Headline, before: Headline) {
  return {
    completionRate: change(now.completionRate, before.completionRate, 0.01),
    averageStrength: change(now.averageStrength, before.averageStrength, 0.5),
    totalDone: change(now.totalDone, before.totalDone, 0),
  };
}

// The same length of time, just before the range.
export function previousRange(from: string, to: string): { from: string; to: string } {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

export interface Ranked {
  habitId: string;
  title: string;
  colourToken: IdentityToken;
  strength: number;
  completionRate: number | null;
}

// Strongest first, then by completion rate. Completion is for the range; strength comes
// from strengthData, which can start before it.
export function ranking(data: AnalyticsData, strengthData: AnalyticsData = data): Ranked[] {
  return data.habits
    .map((habit) => ({
      habitId: habit.id,
      title: habit.title,
      colourToken: habit.colour_token,
      strength: habitStrength(habit, strengthData),
      completionRate: consistency(habit, data).completionRate,
    }))
    .sort((a, b) => b.strength - a.strength || (b.completionRate ?? -1) - (a.completionRate ?? -1) || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------------
// Daily bars grouped by week
// ---------------------------------------------------------------------------

export interface DayBar {
  date: string;
  // Completions stacked by identity: full and minimum separately. A times-per-week
  // habit's sessions are in the stack but not in due.
  stacks: { identityId: string; colourToken: IdentityToken; full: number; minimum: number }[];
  done: number;
  due: number;
  // Of done, the times-per-week sessions, which count toward their week instead.
  sessions: number;
}

export interface WeekBars {
  weekStart: string;
  days: DayBar[];
  // The week's completion, for its donut.
  done: number;
  due: number;
}

export function weekBars(data: AnalyticsData): WeekBars[] {
  const habits = new Map(data.habits.map((h) => [h.id, h]));
  const bars = new Map<string, DayBar>();
  for (let date = data.from; date <= data.to; date = addDays(date, 1)) {
    bars.set(date, { date, stacks: [], done: 0, due: 0, sessions: 0 });
  }
  for (const day of data.days) {
    const habit = habits.get(day.habit_id);
    const bar = bars.get(day.date);
    if (!habit || !bar) continue;
    const kind = dayKind(day);
    if (!kind || !JUDGED.includes(kind)) continue;
    // A times-per-week habit's session shows on its day, but no day of it is due: its week
    // counts toward the donut below.
    if (!isWeeklyHabit(habit)) bar.due += 1;
    if (!COMPLETED.includes(kind)) continue;
    bar.done += 1;
    if (isWeeklyHabit(habit)) bar.sessions += 1;
    let stack = bar.stacks.find((s) => s.identityId === habit.identity_id);
    if (!stack) {
      stack = { identityId: habit.identity_id, colourToken: habit.colour_token, full: 0, minimum: 0 };
      bar.stacks.push(stack);
    }
    if (kind === 'minimum') stack.minimum += 1;
    else stack.full += 1;
  }
  const weeks = new Map<string, WeekBars>();
  for (const bar of bars.values()) {
    const start = weekStart(bar.date);
    const week = weeks.get(start) ?? { weekStart: start, days: [], done: 0, due: 0 };
    week.days.push(bar);
    week.done += bar.done - bar.sessions;
    week.due += bar.due;
    weeks.set(start, week);
  }
  // A times-per-week habit counts toward its week's donut by sessions against its quota.
  for (const week of data.weeks) {
    const bucket = weeks.get(week.week_start);
    if (!bucket || week.status === 'none' || week.status === 'pending' || week.status === 'protected') continue;
    bucket.due += week.quota;
    bucket.done += week.status === 'missed' ? Math.min(week.sessions, week.quota) : week.quota;
  }
  return [...weeks.values()];
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// What a bar says when tapped, and to a screen reader.
export function dayBarLabel(bar: DayBar): string {
  const date = `${dayName(bar.date)} ${shortDate(bar.date)}`;
  const minimum = bar.stacks.reduce((sum, stack) => sum + stack.minimum, 0);
  const parts: string[] = [];
  if (bar.due > 0) parts.push(`${bar.done - bar.sessions} of ${bar.due} done`);
  if (bar.sessions > 0) parts.push(plural(bar.sessions, 'weekly session'));
  if (parts.length === 0) return `${date}: nothing due`;
  return `${date}: ${parts.join(', ')}${minimum > 0 ? ` (${minimum} at the minimum)` : ''}`;
}

export function weekDonutLabel(week: WeekBars): string {
  if (week.due === 0) return `${weekLabel(week.weekStart)}: nothing due yet`;
  return `${weekLabel(week.weekStart)}: ${week.done} of ${week.due} done, ${percentLabel(week.done / week.due)}`;
}

// ---------------------------------------------------------------------------
// Habits that go together
// ---------------------------------------------------------------------------

export const PAIR_MIN_DAYS = 20;
export const PAIR_MIN_PHI = 0.4;

export interface HabitPair {
  a: string;
  b: string;
  days: number;
  phi: number;
  // When a was done, how often b was too.
  bWhenA: number;
}

// Pairs of daily habits whose completions go together. Only with enough days both were
// judged, and a clear link, so it never reports noise.
export function habitPairs(data: AnalyticsData): HabitPair[] {
  const daily = data.habits.filter((h) => !isWeeklyHabit(h));
  const done = new Map<string, Map<string, boolean>>();
  for (const habit of daily) {
    const own = new Map<string, boolean>();
    for (const day of daysOf(data, habit.id)) {
      const kind = dayKind(day);
      if (kind && JUDGED.includes(kind)) own.set(day.date, COMPLETED.includes(kind));
    }
    done.set(habit.id, own);
  }
  const pairs: HabitPair[] = [];
  for (let i = 0; i < daily.length; i++) {
    for (let j = i + 1; j < daily.length; j++) {
      const a = done.get(daily[i].id)!;
      const b = done.get(daily[j].id)!;
      let n11 = 0, n10 = 0, n01 = 0, n00 = 0; // prettier-ignore
      for (const [date, x] of a) {
        const y = b.get(date);
        if (y === undefined) continue;
        if (x && y) n11++;
        else if (x) n10++;
        else if (y) n01++;
        else n00++;
      }
      const n = n11 + n10 + n01 + n00;
      const denominator = Math.sqrt((n11 + n10) * (n01 + n00) * (n11 + n01) * (n10 + n00));
      if (n < PAIR_MIN_DAYS || denominator === 0) continue;
      const phi = (n11 * n00 - n10 * n01) / denominator;
      if (phi >= PAIR_MIN_PHI) {
        pairs.push({ a: daily[i].id, b: daily[j].id, days: n, phi: round(phi, 2), bWhenA: round(n11 / (n11 + n10), 2) });
      }
    }
  }
  return pairs.sort((x, y) => y.phi - x.phi);
}

// ---------------------------------------------------------------------------
// One habit, one range
// ---------------------------------------------------------------------------

// Only this habit's part of the data, so every metric above reads as that habit's.
export function forHabit(data: AnalyticsData, habitId: string): AnalyticsData {
  return {
    ...data,
    habits: data.habits.filter((h) => h.id === habitId),
    days: daysOf(data, habitId),
    weeks: weeksOf(data, habitId),
    grace_spent: data.grace_spent.filter((grace) => grace.habit_id === habitId),
  };
}

// Only the days and weeks within a range. Streaks are left as they are: they run over the
// whole history. A week is in the range if any of its days is.
export function withinRange(data: AnalyticsData, from: string, to: string): AnalyticsData {
  const start = from < data.from ? data.from : from;
  return {
    ...data,
    from: start,
    to,
    days: data.days.filter((day) => day.date >= start && day.date <= to),
    weeks: data.weeks.filter((week) => addDays(week.week_start, 6) >= start && week.week_start <= to),
    grace_spent: data.grace_spent.filter((grace) => grace.date >= start && grace.date <= to),
  };
}

// The strength line for a range. It's worked out over everything loaded, so a short range
// starts where the habit really was, not from zero.
export function strengthInRange(habit: AnalyticsHabit, data: AnalyticsData, from: string): StrengthPoint[] {
  const weekly = isWeeklyHabit(habit);
  return strengthSeries(habit, data).filter((point) => (weekly ? addDays(point.date, 6) : point.date) >= from);
}

export interface HourGrid {
  // Monday first, then each hour of the day: completions logged then.
  counts: number[][];
  max: number;
  total: number;
}

// When in the week and the day a habit gets done, from logs made on the day itself.
export function weekdayHourGrid(data: AnalyticsData, habitId: string): HourGrid {
  const counts = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let total = 0;
  for (const day of daysOf(data, habitId)) {
    const kind = dayKind(day);
    if (day.logged_minute === null || (kind !== 'full' && kind !== 'minimum')) continue;
    counts[isoWeekday(day.date) - 1][Math.floor(day.logged_minute / 60)] += 1;
    total += 1;
  }
  return { counts, max: Math.max(0, ...counts.flat()), total };
}

// For the Compound Forecaster, which works from Progress's shapes.
export const progressHabitOf = (habit: AnalyticsHabit): ProgressHabit => ({
  id: habit.id,
  identity_id: habit.identity_id,
  title: habit.title,
  type: habit.type,
  target: habit.target,
  unit: habit.unit,
  schedule_days: habit.schedule_days,
  milestone_amount: habit.milestone_amount,
  milestone_label: habit.milestone_label,
  reminder_time: habit.reminder_time,
  frequency: habit.frequency,
  per_week: habit.per_week,
  identities: { name: habit.identity_name, colour_token: habit.colour_token },
});

// A rate as a whole percentage, or a dash when nothing was judged.
export const percentLabel = (value: number | null) => (value === null ? '–' : `${Math.round(value * 100)}%`);

// ---------------------------------------------------------------------------
// The Overview
// ---------------------------------------------------------------------------

export interface OverviewPeriods {
  // What to load: at least a year, so strength has history, and the period before.
  load: { from: string; to: string };
  current: { from: string; to: string };
  // Null for all time, which has nothing before it.
  previous: { from: string; to: string } | null;
}

const YEAR_DAYS = 365;

export function overviewPeriods(range: AnalyticsRange, today: string, firstDay?: string): OverviewPeriods {
  const current = rangeDates(range, today, firstDay);
  const previous = range === 'all' ? null : previousRange(current.from, current.to);
  const yearAgo = addDays(today, 1 - YEAR_DAYS);
  const earliest = [current.from, previous?.from ?? current.from, yearAgo].sort()[0];
  return { load: { from: earliest, to: today }, current, previous };
}

export interface HeadlineCard {
  label: string;
  value: string;
  // Against the period before: up, down or the same, and what it was.
  trend: Trend | null;
  before: string | null;
  note?: string;
}

const ARROWS: Record<Trend, string> = { up: '↑', down: '↓', same: '→' };
export const trendArrow = (trend: Trend) => ARROWS[trend];

export function headlineCards(now: Headline, before: Headline | null): HeadlineCard[] {
  const compared = before ? compareHeadlines(now, before) : null;
  const best = now.bestActiveStreak;
  return [
    {
      label: 'Completion',
      value: percentLabel(now.completionRate),
      trend: compared?.completionRate.trend ?? null,
      before: before ? percentLabel(before.completionRate) : null,
    },
    {
      label: 'Average strength',
      value: now.averageStrength === null ? '–' : String(now.averageStrength),
      trend: compared?.averageStrength.trend ?? null,
      before: before?.averageStrength == null ? null : String(before.averageStrength),
      note: 'out of 100',
    },
    {
      label: 'Total done',
      value: now.totalDone.toLocaleString('en-IN'),
      trend: compared?.totalDone.trend ?? null,
      before: before ? before.totalDone.toLocaleString('en-IN') : null,
    },
    {
      label: 'Best active streak',
      value: best ? `${best.streak} ${best.unit}${best.streak === 1 ? '' : 's'}` : '–',
      trend: null,
      before: null,
      note: best?.title,
    },
  ];
}

// "Read and Meditate go together: when you do Read, you do Meditate 85% of the time."
export function pairLines(data: AnalyticsData): string[] {
  const titles = new Map(data.habits.map((h) => [h.id, h.title]));
  return habitPairs(data).map(
    (pair) =>
      `When you do ${titles.get(pair.a)}, you do ${titles.get(pair.b)} ${percentLabel(pair.bWhenA)} of the time (over ${pair.days} days).`
  );
}

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

export type AnalyticsRange = '7d' | '30d' | '90d' | '1y' | 'all';

export const RANGE_LABELS: Record<AnalyticsRange, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  '1y': '1 year',
  all: 'All time',
};

const RANGE_DAYS: Record<Exclude<AnalyticsRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
// The database takes up to about 2 years at once.
export const ALL_TIME_DAYS = 730;

export function rangeDates(range: AnalyticsRange, today: string, firstDay?: string): { from: string; to: string } {
  const days = range === 'all' ? ALL_TIME_DAYS : RANGE_DAYS[range];
  const from = addDays(today, 1 - days);
  return { from: range === 'all' && firstDay && firstDay > from ? firstDay : from, to: today };
}
