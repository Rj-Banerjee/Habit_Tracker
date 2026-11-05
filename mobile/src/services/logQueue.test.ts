import { localDate, OFFLINE_MESSAGE, TodayRow } from '@habit-tracker/core';
import { cachedToday, loadToday, offlineTracker } from './logQueue';
import { tracker } from './tracker';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => mockStore.get(key) ?? null,
  setItem: async (key: string, value: string) => void mockStore.set(key, value),
}));
jest.mock('./tracker', () => ({
  tracker: {
    getToday: jest.fn(),
    logHabit: jest.fn(),
    undoLog: jest.fn(),
    skipHabit: jest.fn(),
    repairHabit: jest.fn(),
  },
}));

const api = tracker as jest.Mocked<typeof tracker>;
const today = localDate(Intl.DateTimeFormat().resolvedOptions().timeZone);
const row = { habit_id: 'h1', day: today, is_today: true, status: 'pending' } as TodayRow;
const offline = new Error(OFFLINE_MESSAGE);

describe('offline logging', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockStore.clear();
    api.getToday.mockResolvedValue([row]);
    api.logHabit.mockResolvedValue(null as never);
    api.undoLog.mockResolvedValue(null as never);
    api.skipHabit.mockResolvedValue(null as never);
    api.repairHabit.mockResolvedValue(null as never);
  });

  it('logs straight through when online', async () => {
    await offlineTracker.logHabit('h1', today);
    expect(api.logHabit).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockStore.get('queued-logs') ?? '[]')).toEqual([]);
  });

  it('queues when offline, without complaining', async () => {
    api.logHabit.mockRejectedValue(offline);
    await expect(offlineTracker.logHabit('h1', today, 'full', 5, 'widget')).resolves.toBeNull();
    expect(JSON.parse(mockStore.get('queued-logs') as string)[0]).toMatchObject({
      habitId: 'h1',
      amount: 5,
      source: 'widget',
    });
  });

  it('queues for today when a reminder has no date to give', async () => {
    api.logHabit.mockRejectedValue(offline);
    await expect(offlineTracker.logHabit('h1', null)).resolves.toBeNull();
    expect(JSON.parse(mockStore.get('queued-logs') as string)[0]).toMatchObject({ date: today });
  });

  it('still shows a rule the server refused', async () => {
    api.logHabit.mockRejectedValue(new Error('That day has not happened yet'));
    await expect(offlineTracker.logHabit('h1', today)).rejects.toThrow('not happened');
  });

  it('shows a queued log as done, even after reloading the list', async () => {
    await loadToday();
    api.logHabit.mockRejectedValue(offline);
    await offlineTracker.logHabit('h1', today);
    api.getToday.mockRejectedValue(offline);
    const { rows, offline: isOffline } = await loadToday();
    expect(isOffline).toBe(true);
    expect(rows[0].status).toBe('done');
  });

  it('sends the queue when back online, once', async () => {
    api.logHabit.mockRejectedValueOnce(offline);
    await offlineTracker.logHabit('h1', today);
    await loadToday();
    expect(api.logHabit).toHaveBeenCalledTimes(2);
    await loadToday();
    expect(api.logHabit).toHaveBeenCalledTimes(2);
  });

  it('says when a queued log could not be saved', async () => {
    api.logHabit.mockRejectedValueOnce(offline);
    await offlineTracker.logHabit('h1', today);
    api.logHabit.mockRejectedValueOnce(new Error('The back-log window for that day has closed'));
    expect((await loadToday()).note).toContain('could');
  });

  it('undoes a queued log without calling the server', async () => {
    api.logHabit.mockRejectedValueOnce(offline);
    await offlineTracker.logHabit('h1', today);
    await offlineTracker.undoLog('h1', today);
    expect(api.undoLog).not.toHaveBeenCalled();
    await loadToday();
    expect(api.logHabit).toHaveBeenCalledTimes(1);
  });

  it('undoes a saved log on the server', async () => {
    await offlineTracker.undoLog('h1', today, 'coach');
    expect(api.undoLog).toHaveBeenCalledWith('h1', today, 'coach');
  });

  it('fails plainly with nothing to show', async () => {
    api.getToday.mockRejectedValue(offline);
    await expect(loadToday()).rejects.toThrow();
  });

  it("won't show yesterday's list as today", async () => {
    mockStore.set('today-rows', JSON.stringify([{ ...row, day: '2020-01-01' }]));
    await expect(cachedToday()).resolves.toEqual([]);
  });

  it('queues a skip offline, shows it as skipped, and sends it with its reason later', async () => {
    await loadToday();
    api.skipHabit.mockRejectedValue(offline);
    await expect(offlineTracker.skipHabit('h1', today, 'sick', 'voice')).resolves.toBeNull();
    api.getToday.mockRejectedValueOnce(offline);
    const { rows } = await loadToday();
    expect(rows[0]).toMatchObject({ status: 'skipped', skip_reason: 'sick' });
    api.skipHabit.mockReset().mockResolvedValue(null as never);
    await loadToday();
    expect(api.skipHabit).toHaveBeenCalledWith('h1', today, 'sick', 'voice');
  });

  it('still shows a skip the server refused while online', async () => {
    api.skipHabit.mockRejectedValue(new Error('You have used both skips this week'));
    await expect(offlineTracker.skipHabit('h1', today, 'sick')).rejects.toThrow('both skips');
  });

  it('queues a repair offline and sends it later', async () => {
    api.repairHabit.mockRejectedValueOnce(offline);
    await offlineTracker.repairHabit('h1', '2026-11-02', 8);
    await loadToday();
    expect(api.repairHabit).toHaveBeenLastCalledWith('h1', '2026-11-02', 8);
  });

  it('says so when a queued repair comes in after its day', async () => {
    api.repairHabit.mockRejectedValueOnce(offline);
    await offlineTracker.repairHabit('h1', '2026-11-02', 8);
    api.repairHabit.mockRejectedValueOnce(new Error('This day can no longer be repaired'));
    expect((await loadToday()).note).toContain("couldn't be saved");
  });
});
