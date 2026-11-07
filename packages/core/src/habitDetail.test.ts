import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { consistencyStats, DetailStat, headlineStats, skipReasonLines, timingStats, volumeStats, waitLabel } from './habitDetail';
import type { AnalyticsData, AnalyticsDay, AnalyticsHabit } from './metrics';

// 2 Nov 2026 is a Monday.
const FROM = '2026-11-02';

const habit = (patch: Partial<AnalyticsHabit> = {}): AnalyticsHabit => ({
  id: 'read',
  title: 'Read',
  type: 'count',
  unit: 'pages',
  frequency: 'days',
  per_week: null,
  target: 20,
  schedule_days: [1, 2, 3, 4, 5, 6, 7],
  identity_id: 'i1',
  identity_name: 'The Reader',
  colour_token: 'identity-1',
  starts_on: FROM,
  ends_on: null,
  reminder_time: '19:00:00',
  time_of_day: 'evening',
  milestone_amount: 300,
  milestone_label: 'book',
  current_streak: 3,
  longest_streak: 5,
  ...patch,
});

const day = (offset: number, status: string, patch: Partial<AnalyticsDay> = {}): AnalyticsDay => ({
  habit_id: 'read',
  date: addDays(FROM, offset),
  status,
  log_status: status === 'done' ? 'done' : status === 'skipped' ? 'skipped' : null,
  level_done: status === 'done' ? 'full' : null,
  amount: status === 'done' ? 20 : null,
  source: status === 'done' ? 'tap' : null,
  skip_reason: null,
  target: 20,
  minimum: 5,
  logged_minute: null,
  ...patch,
});

const data = (days: AnalyticsDay[], patch: Partial<AnalyticsData> = {}): AnalyticsData => ({
  from: FROM,
  to: addDays(FROM, 6),
  today: addDays(FROM, 6),
  habits: [habit()],
  days,
  weeks: [],
  grace_spent: [],
  ...patch,
});

const week = data([
  day(0, 'done', { logged_minute: 19 * 60 + 30 }),
  day(1, 'done', { level_done: 'minimum', amount: 6, source: 'voice', logged_minute: 20 * 60 }),
  day(2, 'missed', { log_status: 'partial', amount: 2 }),
  day(3, 'done', { amount: 300 }),
  day(4, 'skipped', { skip_reason: 'Busy day' }),
  day(5, 'skipped', { skip_reason: 'Busy day' }),
  day(6, 'pending'),
]);

const byLabel = (stats: DetailStat[]) => Object.fromEntries(stats.map((s) => [s.label, s]));

describe('Habit detail numbers', () => {
  it('heads the page with strength, completion and both streaks', () => {
    const top = byLabel(headlineStats(habit(), week, week));
    expect(top['Completion']).toMatchObject({ value: '75%', note: '3 of 4 days' });
    expect(top['Current streak'].value).toBe('3 days');
    expect(top['Best streak'].value).toBe('5 days');
    expect(Number(top['Strength'].value)).toBeGreaterThan(0);
  });

  it('keeps full, minimum and below-the-minimum apart', () => {
    const stats = byLabel(consistencyStats(habit(), week));
    expect(stats['Full']).toMatchObject({ value: '50%', note: '2 days' });
    expect(stats['Minimum']).toMatchObject({ value: '25%', note: '1 day' });
    expect(stats['Full vs minimum'].value).toBe('67% full');
    expect(stats['Below the minimum']).toMatchObject({ value: '1', note: 'shown, not counted' });
    expect(stats['Skipped'].value).toBe('2');
  });

  it('counts a times-per-week habit in weeks', () => {
    const weekly = habit({ frequency: 'per_week', per_week: 3 });
    const stats = byLabel(
      consistencyStats(
        weekly,
        data([], {
          habits: [weekly],
          weeks: [
            { habit_id: 'read', week_start: FROM, status: 'met', quota: 3, sessions: 3 },
            { habit_id: 'read', week_start: addDays(FROM, 7), status: 'missed', quota: 3, sessions: 1 },
          ],
        })
      )
    );
    expect(stats['Weeks met']).toMatchObject({ value: '1', note: 'of 2 weeks' });
    expect(stats['Missed'].value).toBe('1');
    expect(headlineStats(weekly, data([], { habits: [weekly] }), data([]))[2].value).toBe('3 weeks');
  });

  it('adds up amounts, bests and milestones', () => {
    const stats = byLabel(volumeStats(habit(), week)!);
    expect(stats['Total'].value).toBe('328 pages');
    expect(stats['Best day']).toMatchObject({ value: '300 pages', note: '5 Nov' });
    expect(stats['Best week'].note).toBe('Week of 2 Nov');
    expect(stats['Milestones'].value).toBe('1 book');
    expect(stats['Target reached'].value).toBe('50%');
  });

  it('has no amounts for a yes/no habit', () => {
    expect(volumeStats(habit({ type: 'boolean', unit: null }), week)).toBeNull();
  });

  it('says how it gets logged, and how long after the reminder', () => {
    const stats = byLabel(timingStats(habit(), week));
    expect(stats['Logged mostly by']).toMatchObject({ value: 'Tap', note: 'Tap 67% · Voice 33%' });
    expect(stats['Reminder to done']).toMatchObject({ value: '45 min', note: 'after the 19:00 reminder' });
    expect(timingStats(habit({ reminder_time: null }), week).map((s) => s.label)).toEqual(['Logged mostly by']);
  });

  it('words skip reasons and waits', () => {
    expect(skipReasonLines(habit(), week)).toEqual(['Busy day, 2 times']);
    expect(waitLabel(45)).toBe('45 min');
    expect(waitLabel(90)).toBe('1 h 30 min');
    expect(waitLabel(120)).toBe('2 h');
  });
});
