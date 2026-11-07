import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import {
  AnalyticsData,
  AnalyticsDay,
  AnalyticsHabit,
  AnalyticsWeek,
  compareHeadlines,
  consistency,
  dayBarLabel,
  dayKind,
  forHabit,
  habitPairs,
  habitStrength,
  headline,
  PAIR_MIN_DAYS,
  percentLabel,
  previousRange,
  progressHabitOf,
  rangeDates,
  ranking,
  strengthInRange,
  strengthSeries,
  timing,
  volume,
  weekBars,
  weekDonutLabel,
  weekdayHourGrid,
  withinRange,
} from './metrics';

// 2 Nov 2026 is a Monday.
const FROM = '2026-11-02';

const habit = (patch: Partial<AnalyticsHabit> = {}): AnalyticsHabit => ({
  id: 'read',
  title: 'Read',
  type: 'boolean',
  unit: null,
  frequency: 'days',
  per_week: null,
  target: null,
  schedule_days: [1, 2, 3, 4, 5, 6, 7],
  identity_id: 'i1',
  identity_name: 'The Reader',
  colour_token: 'identity-1',
  starts_on: FROM,
  ends_on: null,
  reminder_time: null,
  time_of_day: 'evening',
  milestone_amount: null,
  milestone_label: null,
  current_streak: 0,
  longest_streak: 0,
  ...patch,
});

const day = (date: string, status: string, patch: Partial<AnalyticsDay> = {}): AnalyticsDay => ({
  habit_id: 'read',
  date,
  status,
  log_status: status === 'done' ? 'done' : status === 'skipped' ? 'skipped' : status === 'repaired' ? 'repaired' : null,
  level_done: status === 'done' ? 'full' : null,
  amount: null,
  source: status === 'done' ? 'tap' : null,
  skip_reason: null,
  target: null,
  minimum: null,
  logged_minute: null,
  ...patch,
});

// One status a day from FROM, in order.
const run = (statuses: string[], patch: Partial<AnalyticsDay> = {}) =>
  statuses.map((status, i) => day(addDays(FROM, i), status, patch));

const data = (patch: Partial<AnalyticsData> = {}): AnalyticsData => ({
  from: FROM,
  to: addDays(FROM, 13),
  today: addDays(FROM, 13),
  habits: [habit()],
  days: [],
  weeks: [],
  grace_spent: [],
  ...patch,
});

describe('dayKind', () => {
  it('reads each day the way the streak rules do', () => {
    expect(dayKind(day(FROM, 'done'))).toBe('full');
    expect(dayKind(day(FROM, 'done', { level_done: 'minimum' }))).toBe('minimum');
    expect(dayKind(day(FROM, 'done', { level_done: 'setup' }))).toBe('minimum');
    expect(dayKind(day(FROM, 'repaired'))).toBe('repaired');
    expect(dayKind(day(FROM, 'protected'))).toBe('protected');
    expect(dayKind(day(FROM, 'missed', { log_status: 'partial', amount: 1 }))).toBe('missed');
    expect(dayKind(day(FROM, 'unscheduled'))).toBeNull();
  });
});

describe('habit strength', () => {
  it('rises with each completion and never resets to zero on a miss', () => {
    const points = strengthSeries(habit(), data({ days: run(['done', 'done', 'done', 'missed']) }));
    expect(points.map((p) => p.strength)).toEqual([5, 10, 15, 14]);
  });

  it('counts the minimum a little less than full', () => {
    const full = habitStrength(habit(), data({ days: run(Array(10).fill('done')) }));
    const minimum = habitStrength(habit(), data({ days: run(Array(10).fill('done'), { level_done: 'minimum' }) }));
    expect(minimum).toBeLessThan(full);
    expect(minimum).toBeGreaterThan(0);
  });

  it('leaves skipped, protected and pending days alone', () => {
    const points = strengthSeries(habit(), data({ days: run(['done', 'skipped', 'protected', 'pending']) }));
    expect(points).toHaveLength(1);
  });

  it('halves after 13 missed scheduled days', () => {
    const long = run([...Array(200).fill('done'), ...Array(13).fill('missed')]);
    const series = strengthSeries(habit(), data({ days: long }));
    expect(series[199].strength).toBe(100);
    expect(series.at(-1)!.strength).toBe(50);
  });

  it('counts a times-per-week habit by the week', () => {
    const weekly = habit({ frequency: 'per_week', per_week: 3 });
    const weeks: AnalyticsWeek[] = [
      { habit_id: 'read', week_start: FROM, status: 'met', quota: 3, sessions: 3 },
      { habit_id: 'read', week_start: addDays(FROM, 7), status: 'missed', quota: 3, sessions: 1 },
    ];
    expect(strengthSeries(weekly, data({ habits: [weekly], weeks })).map((p) => p.strength)).toEqual([16, 13]);
  });
});

describe('consistency', () => {
  const days = [
    ...run(['done', 'done', 'missed', 'done', 'done', 'skipped', 'protected']),
    day(addDays(FROM, 7), 'done', { level_done: 'minimum' }),
    day(addDays(FROM, 8), 'repaired'),
    day(addDays(FROM, 9), 'missed', { log_status: 'partial', amount: 1 }),
    day(addDays(FROM, 10), 'missed'),
    day(addDays(FROM, 11), 'done'),
    day(addDays(FROM, 12), 'skipped', { skip_reason: 'Sick' }),
    day(addDays(FROM, 13), 'pending'),
  ];
  const result = consistency(habit({ current_streak: 1, longest_streak: 4 }), data({ days, grace_spent: [{ habit_id: 'read', date: addDays(FROM, 6) }] }));

  it('rates completion from judged days only, full and minimum apart', () => {
    expect(result).toMatchObject({ judged: 10, full: 5, minimum: 1, repaired: 1, missed: 3, protected: 1, skipped: 2 });
    expect(result.completionRate).toBe(0.7);
    expect(result.fullRate).toBe(0.5);
    expect(result.minimumRate).toBe(0.1);
    expect(result.fullShare).toBeCloseTo(5 / 6);
  });

  it('shows days below the minimum without counting them', () => {
    expect(result.partial).toBe(1);
  });

  it('counts Grace Days, skips and their reasons, and the streaks', () => {
    expect(result.graceUsed).toBe(1);
    expect(result.skipReasons).toEqual([{ reason: 'Sick', count: 1 }]);
    expect(result.currentStreak).toBe(1);
    expect(result.bestStreak).toBe(4);
  });

  it('measures how quickly a miss is followed by a completion', () => {
    // Day 2 missed, back on day 3 (1); days 9 and 10 missed, back on day 11 (2).
    expect(result.recoveryDays).toBe(1.5);
  });

  it('counts a times-per-week habit in weeks', () => {
    const weekly = habit({ frequency: 'per_week', per_week: 4 });
    const weeks: AnalyticsWeek[] = [
      { habit_id: 'read', week_start: FROM, status: 'met', quota: 4, sessions: 5 },
      { habit_id: 'read', week_start: addDays(FROM, 7), status: 'protected', quota: 4, sessions: 2 },
      { habit_id: 'read', week_start: addDays(FROM, 14), status: 'repaired', quota: 4, sessions: 3 },
      { habit_id: 'read', week_start: addDays(FROM, 21), status: 'missed', quota: 4, sessions: 1 },
      { habit_id: 'read', week_start: addDays(FROM, 28), status: 'pending', quota: 4, sessions: 1 },
    ];
    expect(consistency(weekly, data({ habits: [weekly], weeks }))).toMatchObject({
      unit: 'week',
      judged: 3,
      full: 1,
      repaired: 1,
      protected: 1,
      missed: 1,
      completionRate: 2 / 3,
    });
  });
});

describe('volume', () => {
  const pages = habit({ type: 'count', unit: 'pages', longest_streak: 6, milestone_amount: 300 });
  // The target went from 10 to 20 on day 3: each day keeps its own.
  const days = [
    day(FROM, 'done', { amount: 12, target: 10 }),
    day(addDays(FROM, 1), 'done', { amount: 8, target: 10, level_done: 'minimum' }),
    day(addDays(FROM, 2), 'done', { amount: 20, target: 20 }),
    day(addDays(FROM, 3), 'missed', { log_status: 'partial', amount: 1, target: 20 }),
    day(addDays(FROM, 9), 'done', { amount: 25, target: 20 }),
  ];
  const result = volume(pages, data({ habits: [pages], days }))!;

  it('adds up everything done, days below the minimum included', () => {
    expect(result.total).toBe(66);
    expect(result.dailyAverage).toBe(13.2);
    expect(result.weeklyAverage).toBe(33);
  });

  it('hits the target against the target of each day', () => {
    expect(result.targetHitRate).toBe(0.6);
  });

  it('finds the best day and week, the longest run and milestones', () => {
    expect(result.bestDay).toEqual({ date: addDays(FROM, 9), amount: 25 });
    expect(result.bestWeek).toEqual({ weekStart: FROM, amount: 41 });
    expect(result.longestRun).toBe(6);
    expect(result.milestones).toBe(0);
  });

  it('is only for amounts', () => {
    expect(volume(habit(), data())).toBeNull();
  });
});

describe('timing', () => {
  const remind = habit({ reminder_time: '19:00:00' });
  const days = [
    day(FROM, 'done', { logged_minute: 19 * 60 + 30, source: 'voice' }),
    day(addDays(FROM, 1), 'done', { logged_minute: 20 * 60 + 10, source: 'tap' }),
    day(addDays(FROM, 2), 'missed'),
    day(addDays(FROM, 7), 'done', { logged_minute: 7 * 60, source: 'widget' }),
    day(addDays(FROM, 8), 'done', { logged_minute: null, source: 'tap' }),
  ];
  const result = timing(data({ habits: [remind], days }));

  it('counts completions by the hour they were logged, on the day itself', () => {
    expect(result.byHour[19]).toBe(1);
    expect(result.byHour[20]).toBe(1);
    expect(result.byHour[7]).toBe(1);
    expect(result.byHour.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('rates each weekday', () => {
    expect(result.byWeekday[0]).toEqual({ done: 2, judged: 2, rate: 1 });
    expect(result.byWeekday[2]).toEqual({ done: 0, judged: 1, rate: 0 });
  });

  it('says where logs came from, and how long after the reminder', () => {
    expect(result.sources).toEqual({ voice: 1, tap: 2, widget: 1 });
    // 30 and 70 minutes after 7pm; the 7am log was before it.
    expect(result.reminderToDone).toBe(50);
  });
});

describe('the overview', () => {
  const run2 = habit({ id: 'run', title: 'Run', identity_id: 'i2', colour_token: 'identity-2', current_streak: 5 });
  const both = data({
    habits: [habit({ current_streak: 3 }), run2],
    days: [
      ...run(['done', 'missed', 'done']),
      ...run(['done', 'done', 'done'], { habit_id: 'run', level_done: 'minimum' }),
    ],
  });

  it('sums up the headline cards', () => {
    expect(headline(both)).toMatchObject({
      completionRate: 5 / 6,
      totalDone: 5,
      bestActiveStreak: { habitId: 'run', title: 'Run', streak: 5, unit: 'day' },
    });
  });

  it('compares with the period before', () => {
    const now = headline(both);
    const before = { ...now, completionRate: 0.5, totalDone: 5 };
    expect(compareHeadlines(now, before)).toMatchObject({
      completionRate: { trend: 'up' },
      totalDone: { trend: 'same' },
    });
    expect(previousRange('2026-11-02', '2026-11-08')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });

  it('ranks habits by strength', () => {
    // Run's three minimum days build more strength than Read's done, miss, done.
    expect(ranking(both).map((r) => [r.habitId, r.strength])).toEqual([['run', 12], ['read', 10]]);
  });

  it('stacks each day by identity, full and minimum apart, with a donut a week', () => {
    const weeks = weekBars(both);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].days[0]).toMatchObject({ done: 2, due: 2 });
    expect(weeks[0].days[0].stacks).toEqual([
      { identityId: 'i1', colourToken: 'identity-1', full: 1, minimum: 0 },
      { identityId: 'i2', colourToken: 'identity-2', full: 0, minimum: 1 },
    ]);
    expect(weeks[0].days[1]).toMatchObject({ done: 1, due: 2 });
    expect(weeks[0]).toMatchObject({ done: 5, due: 6 });
  });

  it('counts a times-per-week habit toward its week by sessions', () => {
    const weekly = habit({ id: 'gym', frequency: 'per_week', per_week: 3 });
    const weeks = weekBars(
      data({
        habits: [weekly],
        days: run(['done', 'unscheduled', 'unscheduled', 'unscheduled', 'unscheduled', 'unscheduled', 'unscheduled', 'done'], {
          habit_id: 'gym',
        }),
        weeks: [
          { habit_id: 'gym', week_start: FROM, status: 'missed', quota: 3, sessions: 1 },
          { habit_id: 'gym', week_start: addDays(FROM, 7), status: 'met', quota: 3, sessions: 5 },
        ],
      })
    );
    expect(weeks.map((w) => [w.done, w.due])).toEqual([[1, 3], [3, 3]]);
    // Its sessions show as bars on their days, without making the day due.
    expect(weeks[0].days[0]).toMatchObject({ done: 1, due: 0, sessions: 1 });
    expect(weeks[0].days[0].stacks[0]).toMatchObject({ full: 1, minimum: 0 });
  });
});

describe('habit pairs', () => {
  const pair = (together: boolean[]) =>
    data({
      to: addDays(FROM, together.length - 1),
      habits: [habit(), habit({ id: 'walk', title: 'Walk' })],
      days: together.flatMap((same, i) => {
        const read = i % 2 === 0 ? 'done' : 'missed';
        const walk = same ? read : read === 'done' ? 'missed' : 'done';
        return [day(addDays(FROM, i), read), day(addDays(FROM, i), walk, { habit_id: 'walk' })];
      }),
    });

  it('reports habits that go together, with how often', () => {
    const pairs = habitPairs(pair(Array(PAIR_MIN_DAYS).fill(true)));
    expect(pairs).toEqual([{ a: 'read', b: 'walk', days: 20, phi: 1, bWhenA: 1 }]);
  });

  it('never reports a pair from too few days', () => {
    expect(habitPairs(pair(Array(PAIR_MIN_DAYS - 1).fill(true)))).toEqual([]);
  });

  it('never reports a weak link', () => {
    expect(habitPairs(pair(Array.from({ length: 30 }, (_, i) => i % 3 === 0)))).toEqual([]);
  });
});

describe('ranges', () => {
  it('counts back from today, with all time starting at the first habit', () => {
    expect(rangeDates('7d', '2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(rangeDates('all', '2026-11-08', '2026-09-01')).toEqual({ from: '2026-09-01', to: '2026-11-08' });
  });
});

describe('ended habits', () => {
  it('are measured up to their end, with nothing after it', () => {
    const ended = habit({ ends_on: addDays(FROM, 2), longest_streak: 3 });
    expect(consistency(ended, data({ habits: [ended], days: run(['done', 'done', 'done']) }))).toMatchObject({
      judged: 3,
      completionRate: 1,
      bestStreak: 3,
    });
  });
});

describe('one habit, one range', () => {
  const two = data({
    habits: [habit(), habit({ id: 'run', title: 'Run' })],
    days: [...run(['done', 'missed', 'done']), ...run(['done', 'done'], { habit_id: 'run' })],
    grace_spent: [{ habit_id: 'run', date: FROM }],
  });

  it('keeps only that habit', () => {
    const read = forHabit(two, 'read');
    expect(read.habits.map((h) => h.id)).toEqual(['read']);
    expect(read.days).toHaveLength(3);
    expect(read.grace_spent).toEqual([]);
  });

  it('keeps only the days and weeks in a range', () => {
    const weekly = data({
      days: run(['done', 'missed', 'done']),
      weeks: [
        { habit_id: 'read', week_start: FROM, status: 'met', quota: 3, sessions: 3 },
        { habit_id: 'read', week_start: addDays(FROM, 7), status: 'missed', quota: 3, sessions: 1 },
      ],
    });
    const later = withinRange(weekly, addDays(FROM, 1), addDays(FROM, 2));
    expect(later.days.map((d) => d.status)).toEqual(['missed', 'done']);
    expect(later.weeks.map((w) => w.week_start)).toEqual([FROM]);
    expect(later.from).toBe(addDays(FROM, 1));
    // Never earlier than what was loaded.
    expect(withinRange(weekly, addDays(FROM, -30), FROM).from).toBe(FROM);
  });

  it("starts a short range's strength line where the habit really was", () => {
    const history = data({ days: run(Array.from({ length: 10 }, () => 'done')) });
    const line = strengthInRange(habit(), history, addDays(FROM, 8));
    expect(line).toHaveLength(2);
    expect(line[0].strength).toBeGreaterThan(30);
    expect(line[0].strength).toBe(strengthSeries(habit(), history)[8].strength);
  });

  it('counts when in the week and the day it gets done', () => {
    const grid = weekdayHourGrid(
      data({
        days: [
          day(FROM, 'done', { logged_minute: 7 * 60 + 30 }),
          day(addDays(FROM, 7), 'done', { logged_minute: 7 * 60 }),
          day(addDays(FROM, 1), 'done', { level_done: 'minimum', logged_minute: 21 * 60 }),
          // A back-log has no time, and a repair is when they caught up: neither counts.
          day(addDays(FROM, 2), 'done', { logged_minute: null }),
          day(addDays(FROM, 3), 'repaired', { logged_minute: 9 * 60 }),
        ],
      }),
      'read'
    );
    expect(grid.counts[0][7]).toBe(2);
    expect(grid.counts[1][21]).toBe(1);
    expect(grid.total).toBe(3);
    expect(grid.max).toBe(2);
  });

  it('hands the forecast the shape it works from', () => {
    const shaped = progressHabitOf(habit({ type: 'count', target: 20, unit: 'pages', schedule_days: [1, 3] }));
    expect(shaped).toMatchObject({ id: 'read', target: 20, schedule_days: [1, 3], identities: { name: 'The Reader' } });
  });

  it('writes rates as whole percentages, and a dash for none', () => {
    expect(percentLabel(0.726)).toBe('73%');
    expect(percentLabel(null)).toBe('–');
  });
});

describe('bar and donut labels', () => {
  it('say what each day and week was', () => {
    const bar = { date: FROM, stacks: [{ identityId: 'i1', colourToken: 'identity-1' as const, full: 1, minimum: 1 }], done: 2, due: 3, sessions: 0 };
    expect(dayBarLabel(bar)).toBe('Mon 2 Nov: 2 of 3 done (1 at the minimum)');
    expect(dayBarLabel({ ...bar, stacks: [], done: 1, due: 0, sessions: 1 })).toBe('Mon 2 Nov: 1 weekly session');
    expect(dayBarLabel({ ...bar, stacks: [], done: 0, due: 0 })).toBe('Mon 2 Nov: nothing due');
    expect(weekDonutLabel({ weekStart: FROM, days: [], done: 5, due: 7 })).toBe('Week of 2 Nov: 5 of 7 done, 71%');
    expect(weekDonutLabel({ weekStart: FROM, days: [], done: 0, due: 0 })).toBe('Week of 2 Nov: nothing due yet');
  });
});
