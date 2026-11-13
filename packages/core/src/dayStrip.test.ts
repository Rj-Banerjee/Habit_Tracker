import { describe, expect, it } from 'vitest';
import { TodayRow } from './api';
import { dayHeading, filterByTime, inStrip, stripWeeks, TIME_FILTERS, weekOf } from './dayStrip';

// A Friday.
const TODAY = '2026-11-13';

const row = (habit_id: string, patch: Partial<TodayRow> = {}): TodayRow => ({
  day: TODAY,
  is_today: true,
  habit_id,
  identity_id: 'i1',
  identity_name: 'Reader',
  colour_token: 'identity-1',
  title: habit_id,
  habit_type: 'boolean',
  target: null,
  unit: null,
  status: 'pending',
  level_done: null,
  amount: null,
  skip_reason: null,
  current_streak: 0,
  levels: [],
  can_repair: false,
  repair_amount: null,
  ...patch,
});

describe('stripWeeks', () => {
  it('is last week, this week and next week, Monday to Sunday', () => {
    const weeks = stripWeeks(TODAY, '2026-11-11');
    expect(weeks).toHaveLength(3);
    expect(weeks.map((w) => w.length)).toEqual([7, 7, 7]);
    expect(weeks.map((w) => w[0].day)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(weeks.every((w) => w[0].weekday === 'MON' && w[6].weekday === 'SUN')).toBe(true);
    expect(weeks[1][4]).toMatchObject({ day: TODAY, weekday: 'FRI', date: 13, isToday: true, selected: false });
    expect(weeks.flat().filter((d) => d.selected).map((d) => d.day)).toEqual(['2026-11-11']);
    expect(weekOf(weeks, '2026-11-11')).toBe(1);
    expect(weekOf(weeks, '2026-11-20')).toBe(2);
  });

  it('dims the days past a week either side', () => {
    const days = stripWeeks(TODAY, TODAY).flat();
    expect(days.filter((d) => !d.inReach).map((d) => d.day)).toEqual([
      '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-21', '2026-11-22',
    ]); // prettier-ignore
  });

  it('crosses a month and a year end', () => {
    expect(stripWeeks('2026-12-02', '2026-12-02')[0][0].day).toBe('2026-11-23');
    expect(stripWeeks('2026-12-31', '2026-12-31')[2].map((d) => d.date)).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });

  it('is still three weeks when today is a Monday or a Sunday', () => {
    expect(stripWeeks('2026-11-09', '2026-11-09')).toHaveLength(3);
    expect(stripWeeks('2026-11-15', '2026-11-15')).toHaveLength(3);
  });

  it('knows which days it can load', () => {
    expect(inStrip(TODAY, '2026-11-06')).toBe(true);
    expect(inStrip(TODAY, '2026-11-05')).toBe(false);
    expect(inStrip(TODAY, '2026-11-21')).toBe(false);
  });
});

describe('dayHeading', () => {
  it('names today, yesterday and tomorrow', () => {
    expect(dayHeading(TODAY, TODAY)).toEqual({ title: 'TODAY', subtitle: 'Friday, Nov 13' });
    expect(dayHeading(TODAY, '2026-11-12').title).toBe('YESTERDAY');
    expect(dayHeading(TODAY, '2026-11-14').title).toBe('TOMORROW');
  });

  it('dates any other day', () => {
    expect(dayHeading(TODAY, '2026-11-09')).toEqual({ title: 'NOV 9', subtitle: 'Monday' });
  });
});

describe('filterByTime', () => {
  const rows = [
    row('evening', { time_of_day: 'evening' }),
    row('loose'),
    row('late-morning', { time_of_day: 'morning', reminder_time: '09:00' }),
    row('early-morning', { time_of_day: 'morning', reminder_time: '06:30' }),
    row('lunch', { time_of_day: 'afternoon' }),
  ];

  it('shows everything in day order under ALL', () => {
    expect(filterByTime(rows, 'all').map((r) => r.habit_id)).toEqual([
      'early-morning',
      'late-morning',
      'lunch',
      'evening',
      'loose',
    ]);
  });

  it('keeps one part of the day, and an anytime habit only under all', () => {
    expect(filterByTime(rows, 'morning').map((r) => r.habit_id)).toEqual(['early-morning', 'late-morning']);
    expect(filterByTime(rows, 'all').map((r) => r.habit_id)).toContain('loose');
    expect(filterByTime([], 'evening')).toEqual([]);
  });

  it('has a chip for all, then each part of the day', () => {
    expect(TIME_FILTERS).toEqual(['all', 'morning', 'afternoon', 'evening']);
  });
});
