import { describe, expect, it } from 'vitest';
import { TodayRow } from './api';
import { dayHeading, dayStrip, filterByTime, inStrip, TIME_FILTERS } from './dayStrip';

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
  habit_type: 'checkbox',
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

describe('dayStrip', () => {
  it('runs a week either side of today, with today and the pick marked', () => {
    const strip = dayStrip(TODAY, '2026-11-11');
    expect(strip).toHaveLength(15);
    expect(strip[0]).toMatchObject({ day: '2026-11-06', weekday: 'FRI', date: 6 });
    expect(strip[14]).toMatchObject({ day: '2026-11-20', date: 20 });
    expect(strip[7]).toMatchObject({ day: TODAY, weekday: 'FRI', date: 13, isToday: true, selected: false });
    expect(strip.filter((d) => d.selected).map((d) => d.day)).toEqual(['2026-11-11']);
  });

  it('crosses a month end', () => {
    expect(dayStrip('2026-12-02', '2026-12-02').slice(0, 3).map((d) => d.date)).toEqual([25, 26, 27]);
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

  it('keeps one part of the day, with no time counting as anytime', () => {
    expect(filterByTime(rows, 'morning').map((r) => r.habit_id)).toEqual(['early-morning', 'late-morning']);
    expect(filterByTime(rows, 'anytime').map((r) => r.habit_id)).toEqual(['loose']);
    expect(filterByTime([], 'evening')).toEqual([]);
  });

  it('has a chip for all, then each part of the day', () => {
    expect(TIME_FILTERS).toEqual(['all', 'morning', 'afternoon', 'evening', 'anytime']);
  });
});
