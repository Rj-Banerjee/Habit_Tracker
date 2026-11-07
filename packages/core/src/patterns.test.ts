import { describe, expect, it } from 'vitest';
import { ProgressDay, ProgressHabit, TodayRow } from './api';
import { addDays } from './dates';
import { habitPatterns, hourLabel, NudgeRecord, peakHour, planNudge, weakWeekday } from './patterns';

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

const day = (back: number, status: string, patch: Partial<ProgressDay> = {}): ProgressDay => ({
  habit_id: 'h1',
  date: addDays(TODAY, -back),
  status,
  level_done: status === 'done' ? 'full' : null,
  amount: null,
  target: null,
  logged_hour: status === 'done' ? 19 : null,
  ...patch,
});

// Done at 7pm most days, with some misses, so it's a habit worth a nudge.
const shaky = (id = 'h1') =>
  Array.from({ length: 12 }, (_, i) => day(i + 1, i % 3 === 0 ? 'missed' : 'done', { habit_id: id }));

const open = (id = 'h1') => ({ habit_id: id, is_today: true, status: 'pending' }) as TodayRow;

const plan = (patch: Partial<Parameters<typeof planNudge>[0]> = {}) =>
  planNudge({
    habits: [habit()],
    days: shaky(),
    rows: [open()],
    today: TODAY,
    nowMinutes: 9 * 60,
    history: [],
    ...patch,
  });

describe('peak hours', () => {
  it('reads the hour', () => {
    expect([0, 7, 12, 19].map(hourLabel)).toEqual(['12am', '7am', '12pm', '7pm']);
  });

  it('finds the most common hour', () => {
    const days = [...shaky(), day(20, 'done', { logged_hour: 8 })];
    expect(peakHour(days, 'h1')).toBe(19);
  });

  it('needs enough logs', () => {
    expect(peakHour([day(1, 'done'), day(2, 'done')], 'h1')).toBeNull();
  });

  it('ignores a back-log, which has no hour', () => {
    const days = Array.from({ length: 6 }, (_, i) => day(i + 1, 'done', { logged_hour: null }));
    expect(peakHour(days, 'h1')).toBeNull();
  });

  it('keeps habits apart', () => {
    expect(peakHour(shaky('h2'), 'h1')).toBeNull();
  });
});

describe('weakWeekday', () => {
  // Every Tuesday missed, everything else done, over 4 weeks.
  const tuesdays = Array.from({ length: 28 }, (_, i) => {
    const date = addDays(TODAY, -i - 1);
    const tuesday = new Date(`${date}T00:00:00Z`).getUTCDay() === 2;
    return day(i + 1, tuesday ? 'missed' : 'done');
  });

  it('finds a day that stands out', () => {
    expect(weakWeekday(tuesdays, 'h1')).toBe('Tuesdays');
  });

  it('stays quiet when no day stands out', () => {
    const steady = Array.from({ length: 28 }, (_, i) => day(i + 1, 'done'));
    expect(weakWeekday(steady, 'h1')).toBeNull();
  });

  it("doesn't hold an allowed skip against a day", () => {
    const skips = tuesdays.map((d) => (d.status === 'missed' ? { ...d, status: 'skipped' } : d));
    expect(weakWeekday(skips, 'h1')).toBeNull();
  });

  it('needs a few of that weekday', () => {
    expect(weakWeekday([day(1, 'missed'), day(2, 'done')], 'h1')).toBeNull();
  });
});

describe('habitPatterns', () => {
  it('says it in plain words', () => {
    expect(habitPatterns(shaky(), habit())[0]).toBe('You usually do Read around 7pm.');
  });

  it('says nothing without enough history', () => {
    expect(habitPatterns([], habit())).toEqual([]);
  });
});

describe('planNudge', () => {
  it('fires 30 minutes before their usual time', () => {
    expect(plan()).toMatchObject({ habitId: 'h1', date: TODAY, hour: 18, minute: 30 });
  });

  it('stays calm', () => {
    expect(plan()?.body).toBe('Read usually happens around 7pm. The small version counts.');
  });

  it('picks the habit most at risk', () => {
    const worse = Array.from({ length: 12 }, (_, i) =>
      day(i + 1, i % 2 === 0 ? 'missed' : 'done', { habit_id: 'h2', logged_hour: 8 })
    );
    const result = plan({
      habits: [habit(), habit({ id: 'h2', title: 'Run' })],
      days: [...shaky(), ...worse],
      rows: [open(), open('h2')],
      nowMinutes: 5 * 60,
    });
    expect(result?.habitId).toBe('h2');
  });

  it('leaves a steady habit alone', () => {
    const steady = Array.from({ length: 12 }, (_, i) => day(i + 1, 'done'));
    expect(plan({ days: steady })).toBeNull();
  });

  it("doesn't nudge a habit already logged today, and looks to tomorrow", () => {
    const logged = { ...open(), status: 'done' } as TodayRow;
    expect(plan({ rows: [logged] })?.date).toBe(addDays(TODAY, 1));
  });

  it('looks to tomorrow once the time has passed', () => {
    expect(plan({ nowMinutes: 20 * 60 })?.date).toBe(addDays(TODAY, 1));
  });

  it('skips a tomorrow the habit is not scheduled on', () => {
    expect(plan({ nowMinutes: 20 * 60, habits: [habit({ schedule_days: [1] })] })).toBeNull();
  });

  it("keeps away from the habit's own reminder", () => {
    expect(plan({ habits: [habit({ reminder_time: '19:00:00' })] })).toBeNull();
    expect(plan({ habits: [habit({ reminder_time: '07:00' })] })).not.toBeNull();
  });

  it("still nudges another habit when one has a reminder at that time", () => {
    const days = [...shaky('h1'), ...shaky('h2')];
    const habits = [habit({ reminder_time: '19:00' }), habit({ id: 'h2', title: 'Walk' })];
    expect(plan({ habits, days, rows: [open('h1'), open('h2')] })?.habitId).toBe('h2');
  });

  it('stops after 3 ignored nudges in a row', () => {
    const ignored: NudgeRecord[] = Array(3).fill({ habit_id: 'h1', outcome: 'ignored' });
    expect(plan({ history: ignored })).toBeNull();
  });

  it('keeps going if one of the latest helped', () => {
    const history: NudgeRecord[] = [
      { habit_id: 'h1', outcome: 'ignored' },
      { habit_id: 'h1', outcome: 'ignored' },
      { habit_id: 'h1', outcome: 'logged' },
      { habit_id: 'h1', outcome: 'ignored' },
    ];
    expect(plan({ history })).not.toBeNull();
  });

  it("isn't put off by another habit's history", () => {
    const history: NudgeRecord[] = Array(3).fill({ habit_id: 'h2', outcome: 'ignored' });
    expect(plan({ history })).not.toBeNull();
  });

  it('needs a known usual time', () => {
    expect(plan({ days: [day(1, 'missed'), day(2, 'done')] })).toBeNull();
  });
});
