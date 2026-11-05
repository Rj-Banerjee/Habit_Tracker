import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { holdNotifications, releaseNotifications } from './focusHold';
import {
  reminderMessage,
  restoreDailyReminder,
  sendTestReminder,
  setDailyReminder,
  showHeldNotifications,
} from './reminders';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', TIME_INTERVAL: 'timeInterval' },
}));

const api = Notifications as jest.Mocked<typeof Notifications>;
const onAndroid = Platform.OS === 'android';

describe('reminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    api.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
    api.requestPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
    api.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'daily-reminder' },
    ] as never);
    api.scheduleNotificationAsync.mockResolvedValue('id');
    api.setNotificationChannelAsync.mockReset();
  });

  it('replaces any earlier reminder with a daily one', async () => {
    await expect(setDailyReminder('07:30')).resolves.toEqual({ status: 'set' });
    expect(api.cancelScheduledNotificationAsync).toHaveBeenCalledWith('daily-reminder');
    expect(api.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ type: 'daily', hour: 7, minute: 30 }),
      })
    );
  });

  it('shows a reminder that fires with the app open', async () => {
    await setDailyReminder('07:30');
    const handler = api.setNotificationHandler.mock.calls[0][0];
    await expect(handler?.handleNotification({} as never)).resolves.toMatchObject({
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });

  it('holds a notification during Tunnel Vision and shows it after', async () => {
    await setDailyReminder('07:30');
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

  it('asks for permission when it has none', async () => {
    api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    await setDailyReminder('07:30');
    expect(api.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('makes the Android channel first, at high importance, so it pops up', async () => {
    await setDailyReminder('07:30');
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
    await expect(setDailyReminder('07:30')).resolves.toEqual({ status: 'set' });
    expect(api.requestPermissionsAsync).toHaveBeenCalled();
    const { trigger } = api.scheduleNotificationAsync.mock.calls[0][0];
    expect(trigger).toMatchObject({ hour: 7, minute: 30 });
    expect((trigger as { channelId?: string }).channelId).toBeUndefined();
  });

  it('sends a test even when the channel fails', async () => {
    api.setNotificationChannelAsync.mockRejectedValue(new Error('NullPointerException'));
    await expect(sendTestReminder()).resolves.toEqual({ status: 'set' });
  });

  it('uses its own channel when it can', async () => {
    await setDailyReminder('07:30');
    const { trigger } = api.scheduleNotificationAsync.mock.calls[0][0];
    expect((trigger as { channelId?: string }).channelId).toBe(
      onAndroid ? 'daily-reminder-high' : undefined
    );
  });

  it('schedules nothing when refused', async () => {
    api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    api.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    await expect(setDailyReminder('07:30')).resolves.toEqual({ status: 'denied' });
    expect(api.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("doesn't ask again once the phone won't show the prompt", async () => {
    api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    await expect(setDailyReminder('07:30')).resolves.toEqual({ status: 'blocked' });
    expect(api.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('cancels for no reminder, without asking for permission', async () => {
    await setDailyReminder(null);
    expect(api.cancelScheduledNotificationAsync).toHaveBeenCalledWith('daily-reminder');
    expect(api.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('never throws, and says what went wrong', async () => {
    api.scheduleNotificationAsync.mockRejectedValue(new Error('no native module'));
    await expect(setDailyReminder('07:30')).resolves.toEqual({
      status: 'unavailable',
      detail: 'no native module',
    });
  });

  it('leaves a scheduled nudge alone', async () => {
    await setDailyReminder('07:30');
    expect(api.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('nudge');
  });

  it('notices when the phone kept nothing', async () => {
    api.getAllScheduledNotificationsAsync.mockResolvedValue([] as never);
    await expect(setDailyReminder('07:30')).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('sends a test in a few seconds', async () => {
    await expect(sendTestReminder()).resolves.toEqual({ status: 'set' });
    expect(api.scheduleNotificationAsync.mock.calls[0][0].trigger).toMatchObject({
      type: 'timeInterval',
      seconds: 5,
    });
  });

  it('a test leaves the daily reminder in place', async () => {
    await sendTestReminder();
    expect(api.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  describe('on opening the app', () => {
    it('puts a missing reminder back', async () => {
      api.getAllScheduledNotificationsAsync.mockResolvedValue([] as never);
      await restoreDailyReminder('20:00:00'.slice(0, 5));
      expect(api.scheduleNotificationAsync).toHaveBeenCalled();
    });

    it('leaves one that is already there', async () => {
      await restoreDailyReminder('20:00');
      expect(api.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('never asks for permission', async () => {
      api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
      await restoreDailyReminder('20:00');
      expect(api.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('does nothing without a reminder', async () => {
      await restoreDailyReminder(null);
      expect(api.setNotificationHandler).not.toHaveBeenCalled();
    });
  });

  it('turns each result into something readable', () => {
    expect(reminderMessage({ status: 'set' })).toBeNull();
    expect(reminderMessage({ status: 'blocked' })).toContain('settings');
    expect(reminderMessage({ status: 'unavailable', detail: 'no module' })).toContain('no module');
  });
});
