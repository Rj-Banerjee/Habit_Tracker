import { describe, expect, it } from 'vitest';
import { ProgressDay, ProgressHabit } from './api';
import { addDays } from './dates';
import {
  clampRate,
  forecast,
  heatKind,
  heatmap,
  identityScores,
  scheduledDaysAhead,
  streakHistory,
  topHabits,
} from './progress';

const TODAY = '2026-11-02'; // a Monday

const habit = (patch: Partial<ProgressHabit> = {}): ProgressHabit => ({
  id: 'h1',
  identity_id: 'i1',
  title: 'Read',
  type: 'boolean',
  target: null,
  unit: null,
  schedule_days: [1, 2, 3, 4, 5, 6, 7],
  milestone_amount: null,
  milestone_label: null,
  identities: { name: 'The Reader', colour_token: 'identity-1' },
  ...patch,
});

const day = (date: string, status: string, patch: Partial<ProgressDay> = {}): ProgressDay => ({
  habit_id: 'h1',
  date,
  status,
  level_done: status === 'done' ? 'full' : null,
  amount: null,
  target: null,
  ...patch,
});

// Oldest first, ending yesterday.
const history = (statuses: string[], patch: Partial<ProgressDay> = {}) =>
  statuses.map((status, index) =>
    day(addDays(TODAY, index - statuses.length), status, patch)
  );

const repeat = (status: string, count: number) => Array<string>(count).fill(status);

describe('identityScores', () => {
  const score = (days: ProgressDay[], habits = [habit()]) => identityScores(habits, days, TODAY)[0];

  it('reads as days out of the days counted', () => {
    expect(score(history([...repeat('done', 23), ...repeat('missed', 7)])).label).toBe('23 of 30 days');
  });

  it('counts any Shrink level', () => {
    expect(score(history(['done'], { level_done: 'minimum' })).done).toBe(1);
  });

  it('counts repaired but not protected', () => {
    const result = score(history(['repaired', 'protected']));
    expect(result.done).toBe(1);
    expect(result.total).toBe(2);
  });

  it('needs every due habit in the identity on a day', () => {
    const second = habit({ id: 'h2', title: 'Run' });
    const days = [
      day('2026-11-01', 'done'),
      day('2026-11-01', 'missed', { habit_id: 'h2' }),
      day('2026-10-31', 'done'),
      day('2026-10-31', 'done', { habit_id: 'h2' }),
    ];
    expect(score(days, [habit(), second]).label).toBe('1 of 2 days');
  });

  it('leaves out days with nothing due', () => {
    expect(score([day('2026-11-01', 'done')]).total).toBe(1);
  });

  it("doesn't hold an unfinished today against them", () => {
    expect(score([day(TODAY, 'pending'), day('2026-11-01', 'done')]).label).toBe('1 of 1 day');
  });

  it("doesn't count today while any habit in it is still open", () => {
    const days = [
      day(TODAY, 'done'),
      day(TODAY, 'pending', { habit_id: 'h2' }),
      day('2026-11-01', 'done'),
    ];
    expect(score(days, [habit(), habit({ id: 'h2' })]).total).toBe(1);
  });

  it('counts today once everything in it is finished', () => {
    expect(score([day(TODAY, 'done'), day('2026-11-01', 'done')]).total).toBe(2);
  });

  it('stops at 30 days', () => {
    expect(score(history(repeat('done', 45))).total).toBe(30);
  });

  it('keeps identities separate', () => {
    const other = habit({
      id: 'h2',
      identity_id: 'i2',
      identities: { name: 'The Athlete', colour_token: 'identity-2' },
    });
    const days = [day('2026-11-01', 'done'), day('2026-11-01', 'missed', { habit_id: 'h2' })];
    const scores = identityScores([habit(), other], days, TODAY);
    expect(scores.map((s) => s.done)).toEqual([1, 0]);
  });
});

describe('heatmap', () => {
  it('tells every kind of day apart', () => {
    expect(heatKind(day(TODAY, 'done'))).toBe('done');
    expect(heatKind(day(TODAY, 'done', { level_done: 'minimum' }))).toBe('minimum');
    expect(heatKind(day(TODAY, 'done', { level_done: 'setup' }))).toBe('minimum');
    expect(heatKind(day(TODAY, 'repaired'))).toBe('repaired');
    expect(heatKind(day(TODAY, 'protected'))).toBe('protected');
    expect(heatKind(day(TODAY, 'skipped'))).toBe('skipped');
    expect(heatKind(day(TODAY, 'missed'))).toBe('missed');
    expect(heatKind(day(TODAY, 'pending'))).toBe('empty');
    expect(heatKind(undefined)).toBe('empty');
  });

  it('covers a year of whole weeks, Monday first', () => {
    const { weeks } = heatmap([], 'h1', TODAY);
    expect(weeks).toHaveLength(53);
    expect(new Date(`${weeks[0][0].date}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it('stops at today', () => {
    const { weeks } = heatmap([], 'h1', TODAY);
    expect(weeks[52]).toHaveLength(1);
    expect(weeks[52][0].date).toBe(TODAY);
  });

  it('places a day and counts it', () => {
    const { weeks, counts } = heatmap([day('2026-11-01', 'repaired')], 'h1', TODAY);
    expect(weeks[51][6]).toEqual({ date: '2026-11-01', kind: 'repaired' });
    expect(counts.repaired).toBe(1);
  });

  it('ignores other habits', () => {
    expect(heatmap([day('2026-11-01', 'done', { habit_id: 'h2' })], 'h1', TODAY).counts.done).toBe(0);
  });
});

describe('streakHistory', () => {
  it('ends a run at a miss and starts another', () => {
    const runs = streakHistory(history(['done', 'done', 'missed', 'done']), 'h1');
    expect(runs.map((run) => run.length)).toEqual([1, 2]);
    expect(runs[1].fracturedOn).toBe(addDays(TODAY, -2));
    expect(runs[0].fracturedOn).toBeNull();
  });

  it('keeps a run through a protected day and notes it', () => {
    const [run] = streakHistory(history(['done', 'protected', 'done']), 'h1');
    expect(run.length).toBe(2);
    expect(run.protectedDays).toEqual([addDays(TODAY, -2)]);
  });

  it('keeps a run through a repaired day, counts it, and notes it', () => {
    const [run] = streakHistory(history(['done', 'repaired', 'done']), 'h1');
    expect(run.length).toBe(3);
    expect(run.repairs).toEqual([addDays(TODAY, -2)]);
  });

  it('lets a skip pass without a change', () => {
    expect(streakHistory(history(['done', 'skipped', 'done']), 'h1')[0].length).toBe(2);
  });

  it('shows no run for a miss with nothing before it', () => {
    expect(streakHistory(history(['missed']), 'h1')).toEqual([]);
  });

  it('puts the latest first', () => {
    const runs = streakHistory(history(['done', 'missed', 'done', 'done']), 'h1');
    expect(runs[0].length).toBe(2);
  });
});

describe('topHabits', () => {
  const run = habit({ id: 'h2', title: 'Run' });

  it('ranks by this month', () => {
    const days = [
      day('2026-11-01', 'missed'),
      day('2026-11-01', 'done', { habit_id: 'h2' }),
      day('2026-10-31', 'done'),
    ];
    expect(topHabits([habit(), run], days, TODAY).map((h) => h.title)).toEqual(['Run', 'Read']);
  });

  it('breaks a tie by the number done', () => {
    const days = [
      day('2026-11-01', 'done'),
      day('2026-11-02', 'done'),
      day('2026-11-01', 'done', { habit_id: 'h2' }),
    ];
    expect(topHabits([run, habit()], days, TODAY)[0].title).toBe('Read');
  });

  it('leaves out habits with nothing due and shows three at most', () => {
    const extra = ['a', 'b', 'c', 'd'].map((id) => habit({ id, title: id }));
    const days = extra.slice(0, 4).map((h) => day('2026-11-01', 'done', { habit_id: h.id }));
    expect(topHabits([...extra, habit({ id: 'none' })], days, TODAY)).toHaveLength(3);
  });
});

describe('forecast', () => {
  const pages = habit({ type: 'count', target: 20, unit: 'pages' });

  it('needs a week of history', () => {
    expect(forecast(habit(), history(repeat('done', 6)), TODAY)).toBeNull();
  });

  it('counts completions for a yes or no habit', () => {
    const result = forecast(habit(), history(repeat('done', 30)), TODAY);
    expect(result?.completions).toBe(365);
    expect(result?.amount).toBeNull();
    expect(result?.sentence).toBe('About 365 times in a year.');
  });

  it('projects the average per scheduled day for a count habit', () => {
    const days = history([...repeat('done', 15), ...repeat('missed', 15)], { amount: 10 });
    days.forEach((d) => {
      if (d.status === 'missed') d.amount = null;
    });
    const result = forecast(pages, days, TODAY);
    expect(result?.actualRate).toBe(50);
    expect(result?.amount).toBe(1830);
  });

  it('uses the target that applied on each day', () => {
    const before = history(repeat('done', 30)).map((d, index) => ({
      ...d,
      target: index < 15 ? 10 : 30,
    }));
    expect(forecast(pages, before, TODAY)?.amount).toBe(7300);
  });

  it('counts a minimum log at what was actually done', () => {
    const days = history(repeat('done', 30), { level_done: 'minimum', amount: 2, target: 20 });
    expect(forecast(pages, days, TODAY)?.amount).toBe(730);
  });

  it('only reads the last 30 scheduled days', () => {
    const days = history([...repeat('missed', 60), ...repeat('done', 30)]);
    expect(forecast(habit(), days, TODAY)?.actualRate).toBe(100);
  });

  it('skips an unfinished today', () => {
    const days = [...history(repeat('done', 30)), day(TODAY, 'pending')];
    expect(forecast(habit(), days, TODAY)?.actualRate).toBe(100);
  });

  it('lets the slider change how often, not how much', () => {
    const days = history(repeat('done', 30), { amount: 10, target: 20 });
    expect(forecast(pages, days, TODAY, 50)?.amount).toBe(1830);
    expect(forecast(pages, days, TODAY, 100)?.amount).toBe(3650);
  });

  it('turns an amount into milestones', () => {
    const book = habit({
      type: 'count',
      target: 20,
      unit: 'pages',
      milestone_amount: 300,
      milestone_label: 'book',
    });
    const result = forecast(book, history(repeat('done', 30), { amount: 20 }), TODAY);
    expect(result?.milestones).toBe(24);
    expect(result?.sentence).toBe('About 7,300 pages in a year, or about 24 books.');
  });

  it('counts milestones from completions for a yes or no habit', () => {
    const race = habit({ milestone_amount: 100, milestone_label: 'run' });
    expect(forecast(race, history(repeat('done', 30)), TODAY)?.milestones).toBe(3);
  });

  it('starts the slider at their real rate, kept in range', () => {
    const days = history([...repeat('done', 6), ...repeat('missed', 24)]);
    expect(forecast(habit(), days, TODAY)?.actualRate).toBe(50);
    expect(clampRate(120)).toBe(100);
  });

  it('counts the days ahead from the schedule', () => {
    expect(scheduledDaysAhead([1, 2, 3, 4, 5, 6, 7], TODAY)).toBe(365);
    expect(scheduledDaysAhead([1], TODAY)).toBe(52);
  });

  it('handles nothing done at all', () => {
    expect(forecast(pages, history(repeat('missed', 30)), TODAY, 80)?.amount).toBe(5840);
  });
});
