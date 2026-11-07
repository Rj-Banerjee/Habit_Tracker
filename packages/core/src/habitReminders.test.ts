import { describe, expect, it } from 'vitest';
import { isHabitReminderId, MAX_PLANNED_REMINDERS, planHabitReminders, ReminderHabit, reminderId } from './habitReminders';

const TODAY = '2026-11-02'; // a Monday

const habit = (patch: Partial<ReminderHabit> = {}): ReminderHabit => ({
  id: 'h1',
  title: 'Read',
  reminder_time: '19:00:00',
  schedule_days: [1, 2, 3, 4, 5, 6, 7],
  ...patch,
});

const plan = (habits: ReminderHabit[], patch: { doneToday?: string[]; nowMinutes?: number } = {}) =>
  planHabitReminders({
    habits,
    doneToday: new Set(patch.doneToday ?? []),
    today: TODAY,
    nowMinutes: patch.nowMinutes ?? 9 * 60,
  });

describe('planHabitReminders', () => {
  it('reminds each habit at its own time, for a week', () => {
    const planned = plan([habit(), habit({ id: 'h2', title: 'Run', reminder_time: '07:30' })]);
    expect(planned).toHaveLength(13);
    expect(planned[0]).toEqual({ habitId: 'h1', title: 'Read', date: TODAY, hour: 19, minute: 0 });
    expect(planned[1]).toMatchObject({ habitId: 'h2', date: '2026-11-03', hour: 7, minute: 30 });
  });

  it('skips today once it is done, or once the time has passed', () => {
    expect(plan([habit()], { doneToday: ['h1'] })[0].date).toBe('2026-11-03');
    expect(plan([habit()], { nowMinutes: 20 * 60 })[0].date).toBe('2026-11-03');
  });

  it('only reminds on scheduled days', () => {
    expect(plan([habit({ schedule_days: [1, 4] })]).map((r) => r.date)).toEqual(['2026-11-02', '2026-11-05']);
  });

  it('reminds a times-per-week habit any day', () => {
    expect(plan([habit({ frequency: 'per_week', schedule_days: [1] })])).toHaveLength(7);
  });

  it('goes quiet for the rest of the week once a times-per-week quota is met', () => {
    const planned = planHabitReminders({
      habits: [habit({ frequency: 'per_week' })],
      doneToday: new Set(),
      metThisWeek: new Set(['h1']),
      today: '2026-11-05',
      nowMinutes: 9 * 60,
    });
    expect(planned.map((r) => r.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11']);
  });

  it('stops after the habit ends, and waits for it to start', () => {
    expect(plan([habit({ ends_on: '2026-11-03' })]).map((r) => r.date)).toEqual(['2026-11-02', '2026-11-03']);
    expect(plan([habit({ starts_on: '2026-11-07' })]).map((r) => r.date)).toEqual(['2026-11-07', '2026-11-08']);
  });

  it('sends nothing for a habit without a reminder', () => {
    expect(plan([habit({ reminder_time: null })])).toEqual([]);
  });

  it('keeps under what a phone holds', () => {
    const many = Array.from({ length: 20 }, (_, i) => habit({ id: `h${i}` }));
    expect(plan(many)).toHaveLength(MAX_PLANNED_REMINDERS);
  });

  it('names each one, so they can be replaced without touching anything else', () => {
    const id = reminderId({ habitId: 'h1', date: TODAY });
    expect(isHabitReminderId(id)).toBe(true);
    expect(isHabitReminderId('daily-reminder')).toBe(false);
  });
});
