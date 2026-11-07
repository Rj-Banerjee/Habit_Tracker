import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { localDate, NUDGE_CATEGORY } from '@habit-tracker/core';
import { holdNotifications, releaseNotifications } from './focusHold';
import { reminderMessage, sendTestReminder, showHeldNotifications, syncHabitReminders } from './reminders';
import { tracker } from './tracker';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
}));

jest.mock('./tracker', () => ({
  tracker: { listReminderHabits: jest.fn(), getToday: jest.fn() },
}));

const api = Notifications as jest.Mocked<typeof Notifications>;
const habits = tracker as jest.Mocked<typeof tracker>;
const onAndroid = Platform.OS === 'android';
const today = () => localDate(Intl.DateTimeFormat().resolvedOptions().timeZone);

const read = {
  id: 'h1',
  title: 'Read',
  reminder_time: '23:59:00',
  schedule_days: [1, 2, 3, 4, 5, 6, 7],
  frequency: 'days' as const,
  starts_on: '2020-01-01',
  ends_on: null,
};

describe('reminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    api.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
    api.requestPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
    api.getAllScheduledNotificationsAsync.mockResolvedValue([] as never);
    habits.listReminderHabits.mockResolvedValue([read]);
    habits.getToday.mockResolvedValue([]);
    api.scheduleNotificationAsync.mockResolvedValue('id');
    api.setNotificationChannelAsync.mockReset();
  });

  it('reminds each habit at its own time, a week ahead, as a habit notification', async () => {
    await expect(syncHabitReminders()).resolves.toEqual({ status: 'set' });
    expect(api.scheduleNotificationAsync).toHaveBeenCalledTimes(7);
    const [first] = api.scheduleNotificationAsync.mock.calls[0];
    expect(first).toMatchObject({
      identifier: `habit-reminder:h1:${today()}`,
      content: { title: 'Read', categoryIdentifier: NUDGE_CATEGORY, data: { habitId: 'h1' } },
      trigger: { type: 'date' },
    });
    const fires = (first.trigger as { date: Date }).date;
    expect([fires.getHours(), fires.getMinutes()]).toEqual([23, 59]);
  });

  it('replaces the old daily reminder and its own earlier ones, and nothing else', async () => {
    api.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'daily-reminder' },
      { identifier: 'habit-reminder:h9:2026-01-01' },
      { identifier: 'nudge' },
    ] as never);
    await syncHabitReminders();
    expect(api.cancelScheduledNotificationAsync).toHaveBeenCalledWith('daily-reminder');
    expect(api.cancelScheduledNotificationAsync).toHaveBeenCalledWith('habit-reminder:h9:2026-01-01');
    expect(api.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('nudge');
  });

  it("doesn't remind today about a habit already done", async () => {
    habits.getToday.mockResolvedValue([{ habit_id: 'h1', is_today: true, status: 'done' }] as never);
    await syncHabitReminders();
    expect(api.scheduleNotificationAsync).toHaveBeenCalledTimes(6);
  });

  it('only asks for permission when told to', async () => {
    api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    await expect(syncHabitReminders()).resolves.toEqual({ status: 'denied' });
    expect(api.requestPermissionsAsync).not.toHaveBeenCalled();
    await syncHabitReminders({ ask: true });
    expect(api.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('shows a reminder that fires with the app open', async () => {
    await syncHabitReminders({ ask: true });
    const handler = api.setNotificationHandler.mock.calls[0][0];
    await expect(handler?.handleNotification({} as never)).resolves.toMatchObject({
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });

  it('holds a notification during Tunnel Vision and shows it after', async () => {
    await syncHabitReminders({ ask: true });
    const handler = api.setNotificationHandler.mock.calls[0][0];
    holdNotifications();
    const content = { title: 'Time for Read', body: 'A small version counts.', data: { habitId: 'h1' }, categoryIdentifier: 'nudge' };
    await expect(
      handler?.handleNotification({ request: { content } } as never)
    ).resolves.toMatchObject({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false });
    const held = releaseNotifications();
    expect(held).toEqual([content]);
    api.scheduleNotificationAsync.mockClear();
    await showHeldNotifications(held);
    expect(api.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ content }));
  });

  it('makes the Android channel first, at high importance, so it pops up', async () => {
    await syncHabitReminders({ ask: true });
    if (!onAndroid) {
      expect(api.setNotificationChannelAsync).not.toHaveBeenCalled();
      return;
    }
    expect(api.setNotificationChannelAsync.mock.calls[0][1]).toMatchObject({ importance: 4 });
    expect(api.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(
      api.getPermissionsAsync.mock.invocationCallOrder[0]
    );
  });

  it('carries on when the channel fails, as it does in Expo Go on Android', async () => {
    api.setNotificationChannelAsync.mockRejectedValue(new Error('NullPointerException'));
    api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    await expect(syncHabitReminders({ ask: true })).resolves.toEqual({ status: 'set' });
    expect(api.requestPermissionsAsync).toHaveBeenCalled();
    const { trigger } = api.scheduleNotificationAsync.mock.calls[0][0];
    expect((trigger as { channelId?: string }).channelId).toBeUndefined();
  });

  it('sends a test even when the channel fails', async () => {
    api.setNotificationChannelAsync.mockRejectedValue(new Error('NullPointerException'));
    await expect(sendTestReminder()).resolves.toEqual({ status: 'set' });
  });

  it('uses its own channel when it can', async () => {
    await syncHabitReminders({ ask: true });
    const { trigger } = api.scheduleNotificationAsync.mock.calls[0][0];
    expect((trigger as { channelId?: string }).channelId).toBe(
      onAndroid ? 'daily-reminder-high' : undefined
    );
  });

  it('schedules nothing when refused', async () => {
    api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    api.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    await expect(syncHabitReminders({ ask: true })).resolves.toEqual({ status: 'denied' });
    expect(api.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("doesn't ask again once the phone won't show the prompt", async () => {
    api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    await expect(syncHabitReminders({ ask: true })).resolves.toEqual({ status: 'blocked' });
    expect(api.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('never throws, and says what went wrong', async () => {
    api.scheduleNotificationAsync.mockRejectedValue(new Error('no native module'));
    await expect(syncHabitReminders({ ask: true })).resolves.toEqual({
      status: 'unavailable',
      detail: 'no native module',
    });
  });

  it('sends a test in a few seconds', async () => {
    await expect(sendTestReminder()).resolves.toEqual({ status: 'set' });
    expect(api.scheduleNotificationAsync.mock.calls[0][0].trigger).toMatchObject({
      type: 'timeInterval',
      seconds: 5,
    });
  });

  it('turns each result into something readable', () => {
    expect(reminderMessage({ status: 'set' })).toBeNull();
    expect(reminderMessage({ status: 'blocked' })).toContain('settings');
    expect(reminderMessage({ status: 'unavailable', detail: 'no module' })).toContain('no module');
  });
});
