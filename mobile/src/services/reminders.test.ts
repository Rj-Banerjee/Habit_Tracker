import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { setDailyReminder } from './reminders';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

const api = Notifications as jest.Mocked<typeof Notifications>;

describe('setDailyReminder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    api.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
  });

  it('replaces any earlier reminder with a daily one', async () => {
    await expect(setDailyReminder('07:30')).resolves.toBe('set');
    expect(api.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(api.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ type: 'daily', hour: 7, minute: 30 }),
      })
    );
  });

  it('asks for permission when it has none', async () => {
    api.getPermissionsAsync.mockResolvedValue({ granted: false } as never);
    await setDailyReminder('07:30');
    expect(api.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('schedules nothing without permission', async () => {
    api.getPermissionsAsync.mockResolvedValue({ granted: false } as never);
    api.requestPermissionsAsync.mockResolvedValue({ granted: false } as never);
    await expect(setDailyReminder('07:30')).resolves.toBe('denied');
    expect(api.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels for no reminder', async () => {
    await setDailyReminder(null);
    expect(api.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(api.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('creates the channel Android needs', async () => {
    await setDailyReminder('07:30');
    expect(api.setNotificationChannelAsync).toHaveBeenCalledTimes(Platform.OS === 'android' ? 1 : 0);
  });

  it('never throws, so it can never block anyone', async () => {
    api.scheduleNotificationAsync.mockRejectedValue(new Error('no native module'));
    await expect(setDailyReminder('07:30')).resolves.toBe('unavailable');
  });
});
