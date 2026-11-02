import { describe, expect, it, vi } from 'vitest';
import { TodayRow } from './api';
import { runNotificationAction } from './notificationActions';

const row = {
  habit_id: 'h1',
  is_today: true,
  day: '2026-11-03',
  target: 30,
  levels: [
    { level: 'full', description: 'All', target: 30 },
    { level: 'minimum', description: 'Some', target: 1 },
  ],
} as TodayRow;

const api = () => ({
  logHabit: vi.fn(async () => null),
  getToday: vi.fn(async () => [row]),
});

describe('runNotificationAction', () => {
  it('logs the full version from Done', async () => {
    const tracker = api();
    await expect(runNotificationAction(tracker, 'done', 'h1')).resolves.toBe(true);
    expect(tracker.logHabit).toHaveBeenCalledWith('h1', '2026-11-03', 'full', 30, 'notification');
  });

  it('logs the minimum from Smaller version', async () => {
    const tracker = api();
    await runNotificationAction(tracker, 'smaller', 'h1');
    expect(tracker.logHabit).toHaveBeenCalledWith('h1', '2026-11-03', 'minimum', 1, 'notification');
  });

  it('ignores a tap on the notification itself', async () => {
    const tracker = api();
    const tapped = 'expo.modules.notifications.actions.DEFAULT';
    await expect(runNotificationAction(tracker, tapped, 'h1')).resolves.toBe(false);
    expect(tracker.logHabit).not.toHaveBeenCalled();
  });

  it("leaves the date to the server for a habit that isn't on today", async () => {
    const tracker = api();
    await runNotificationAction(tracker, 'done', 'other');
    expect(tracker.logHabit).toHaveBeenCalledWith('other', null, 'full', null, 'notification');
  });
});
