import { addDays, localDate, TodayRow } from '@habit-tracker/core';
import { ai } from './ai';
import { cancelIfLogged, nudgesEnabled, setNudgesEnabled, syncNudge } from './nudges';
import { loadNotifications } from './reminders';
import { tracker } from './tracker';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => mockStore.get(key) ?? null,
  setItem: async (key: string, value: string) => void mockStore.set(key, value),
  removeItem: async (key: string) => void mockStore.delete(key),
}));
jest.mock('./ai', () => ({ ai: { nudgeOutcome: jest.fn(() => Promise.resolve()) } }));
jest.mock('./tracker', () => ({
  tracker: {
    getProfile: jest.fn(),
    listProgressHabits: jest.fn(),
    getHabitDays: jest.fn(),
    listNudgeHistory: jest.fn(),
  },
}));

const mockNotifications = {
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('nudge')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
};
jest.mock('./reminders', () => ({
  loadNotifications: jest.fn(() => mockNotifications),
  prepareChannel: jest.fn(() => Promise.resolve(undefined)),
}));

const api = tracker as jest.Mocked<typeof tracker>;
const today = localDate('Asia/Kolkata');
const row = { habit_id: 'h1', is_today: true, status: 'pending', day: today } as TodayRow;
const habit = {
  id: 'h1',
  title: 'Read',
  schedule_days: [1, 2, 3, 4, 5, 6, 7],
  identities: { name: 'R', colour_token: 'identity-1' },
};
const shaky = Array.from({ length: 12 }, (_, i) => ({
  habit_id: 'h1',
  date: addDays(today, -i - 1),
  status: i % 3 === 0 ? 'missed' : 'done',
  level_done: i % 3 === 0 ? null : 'full',
  amount: null,
  target: null,
  logged_hour: i % 3 === 0 ? null : 23,
}));

describe('nudges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockStore.clear();
    jest.useFakeTimers({ now: new Date(`${today}T04:00:00`), doNotFake: ['setTimeout', 'setImmediate', 'nextTick', 'queueMicrotask'] });
    api.getProfile.mockResolvedValue({ timezone: 'Asia/Kolkata', reminder_time: null } as never);
    api.listProgressHabits.mockResolvedValue([habit] as never);
    api.getHabitDays.mockResolvedValue(shaky as never);
    api.listNudgeHistory.mockResolvedValue([]);
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true });
  });

  afterEach(() => jest.useRealTimers());

  it('schedules one nudge, under its own name', async () => {
    await syncNudge([row]);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockNotifications.scheduleNotificationAsync.mock.calls[0]).toMatchObject([
      { identifier: 'nudge', trigger: { type: 'date' } },
    ]);
  });

  it("doesn't schedule a second while one is waiting", async () => {
    await syncNudge([row]);
    await syncNudge([row]);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('never asks for permission', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false });
    await syncNudge([row]);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does nothing when turned off', async () => {
    await setNudgesEnabled(false);
    expect(await nudgesEnabled()).toBe(false);
    await syncNudge([row]);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels one that is waiting when turned off', async () => {
    await syncNudge([row]);
    await setNudgesEnabled(false);
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('nudge');
  });

  it('cancels when the habit is logged first', async () => {
    await syncNudge([row]);
    await cancelIfLogged([{ ...row, status: 'done', level_done: 'full' }]);
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('nudge');
  });

  it('records that a nudge helped, the day after', async () => {
    mockStore.set(
      'pending-nudge',
      JSON.stringify({ habitId: 'h1', date: addDays(today, -1), hour: 18, minute: 30, title: 'Read', body: '' })
    );
    api.getHabitDays.mockResolvedValueOnce([{ habit_id: 'h1', status: 'done' }] as never);
    await syncNudge([row]);
    expect(ai.nudgeOutcome).toHaveBeenCalledWith('h1', addDays(today, -1), 'logged');
  });

  it('records that a nudge was ignored', async () => {
    mockStore.set(
      'pending-nudge',
      JSON.stringify({ habitId: 'h1', date: addDays(today, -1), hour: 18, minute: 30, title: 'Read', body: '' })
    );
    api.getHabitDays.mockResolvedValueOnce([{ habit_id: 'h1', status: 'missed' }] as never);
    await syncNudge([row]);
    expect(ai.nudgeOutcome).toHaveBeenCalledWith('h1', addDays(today, -1), 'ignored');
  });

  it('never throws, so it can never disturb Today', async () => {
    api.getProfile.mockRejectedValue(new Error('offline'));
    await expect(syncNudge([row])).resolves.toBeUndefined();
    (loadNotifications as jest.Mock).mockImplementationOnce(() => {
      throw new Error('no module');
    });
    await expect(cancelIfLogged([row])).resolves.toBeUndefined();
  });
});
