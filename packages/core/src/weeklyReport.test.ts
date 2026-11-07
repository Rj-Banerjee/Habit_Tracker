import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import type { AnalyticsData, AnalyticsDay, AnalyticsHabit } from './metrics';
import { reportRange, weeklyReport } from './weeklyReport';

// 2 Nov 2026 is a Monday; the report is for that week, with the week before it.
const WEEK = '2026-11-02';

const habit = (id: string, title: string, patch: Partial<AnalyticsHabit> = {}): AnalyticsHabit => ({
  id,
  title,
  type: 'boolean',
  unit: null,
  frequency: 'days',
  per_week: null,
  target: null,
  schedule_days: [1, 2, 3, 4, 5, 6, 7],
  identity_id: 'i1',
  identity_name: 'Me',
  colour_token: 'identity-1',
  starts_on: '2026-10-01',
  ends_on: null,
  reminder_time: null,
  time_of_day: 'anytime',
  milestone_amount: null,
  milestone_label: null,
  current_streak: 0,
  longest_streak: 0,
  ...patch,
});

const days = (id: string, from: string, statuses: string[]): AnalyticsDay[] =>
  statuses.map((status, i) => ({
    habit_id: id,
    date: addDays(from, i),
    status,
    log_status: status === 'done' ? 'done' : null,
    level_done: status === 'done' ? 'full' : null,
    amount: null,
    source: status === 'done' ? 'tap' : null,
    skip_reason: null,
    target: null,
    minimum: null,
    logged_minute: null,
  }));

const LAST_WEEK = addDays(WEEK, -7);
const data = (patch: Partial<AnalyticsData> = {}): AnalyticsData => ({
  ...reportRange(WEEK),
  today: addDays(WEEK, 6),
  habits: [habit('read', 'Read'), habit('run', 'Run')],
  days: [
    ...days('read', LAST_WEEK, ['done', 'missed', 'done', 'missed', 'done', 'missed', 'done']),
    ...days('run', LAST_WEEK, ['done', 'missed', 'missed', 'missed', 'done', 'missed', 'missed']),
    ...days('read', WEEK, ['done', 'done', 'done', 'done', 'done', 'done', 'done']),
    ...days('run', WEEK, ['done', 'missed', 'done', 'missed', 'done', 'missed', 'pending']),
  ],
  weeks: [],
  grace_spent: [],
  ...patch,
});

describe('the weekly report', () => {
  it('needs this week and the one before', () => {
    expect(reportRange(WEEK)).toEqual({ from: '2026-10-26', to: '2026-11-08' });
  });

  it("says the week's completion and the change from the week before", () => {
    const report = weeklyReport(data(), WEEK);
    // This week: 7 + 3 of 13 judged (Sunday's Run is still open). Before: 4 + 2 of 14.
    expect(report.completion).toBeCloseTo(10 / 13);
    expect(report.trend).toBe('up');
    expect(report.lines[0]).toBe('77% done this week, up from 43% the week before.');
    expect(report.headline).toBe('77% done this week, up from 43%. Ready to look back?');
  });

  it('names the strongest habit, and the one that could use care', () => {
    const report = weeklyReport(data(), WEEK);
    expect(report.lines).toContain('Strongest: Read, 7 of 7 days.');
    expect(report.lines).toContain('Could use a little care: Run, 3 of 6 days.');
  });

  it('finds the best day', () => {
    expect(weeklyReport(data(), WEEK).lines).toContain('Best day: Mon 2 Nov, everything done.');
  });

  it("doesn't single out a habit when everything was done", () => {
    const allDone = data({
      days: [...days('read', WEEK, Array(7).fill('done')), ...days('run', WEEK, Array(7).fill('done'))],
    });
    const report = weeklyReport(allDone, WEEK);
    expect(report.weakest).toBeNull();
    expect(report.lines[0]).toBe('100% done this week.');
  });

  it('counts a times-per-week habit by its week', () => {
    const gym = habit('gym', 'Gym', { frequency: 'per_week', per_week: 3 });
    const report = weeklyReport(
      data({
        habits: [gym],
        days: [],
        weeks: [{ habit_id: 'gym', week_start: WEEK, status: 'met', quota: 3, sessions: 4 }],
      }),
      WEEK
    );
    expect(report.lines).toContain('Strongest: Gym, 1 of 1 week.');
    expect(report.bestDay).toBeNull();
  });

  it('keeps the card calm when nothing was due', () => {
    const report = weeklyReport(data({ days: [] }), WEEK);
    expect(report.lines).toEqual([]);
    expect(report.headline).toBe('Your week is ready to look back on.');
  });
});
