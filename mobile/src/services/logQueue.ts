import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addToQueue,
  droppedNote,
  flushQueue,
  HabitLevel,
  isBacklog,
  isOfflineError,
  localDate,
  LogSource,
  QueuedLog,
  removeFromQueue,
  TodayRow,
  withQueued,
} from '@habit-tracker/core';
import { analytics } from './analytics';
import { tracker } from './tracker';

const QUEUE_KEY = 'queued-logs';
const ROWS_KEY = 'today-rows';

async function readQueue(): Promise<QueuedLog[]> {
  const saved = await AsyncStorage.getItem(QUEUE_KEY);
  return saved ? (JSON.parse(saved) as QueuedLog[]) : [];
}

const writeQueue = (queue: QueuedLog[]) => AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

// Tomorrow's Today can't be built from today's list, so a stale one is only for today.
const today = () => localDate(Intl.DateTimeFormat().resolvedOptions().timeZone);

export async function cachedToday(): Promise<TodayRow[]> {
  const saved = await AsyncStorage.getItem(ROWS_KEY);
  const rows = saved ? (JSON.parse(saved) as TodayRow[]) : [];
  return rows.some((row) => row.is_today && row.day === today()) ? rows : [];
}

// Sends what's waiting, then reads Today. Offline it falls back to the last list.
export async function loadToday(): Promise<{
  rows: TodayRow[];
  offline: boolean;
  note?: string;
}> {
  const { remaining, dropped } = await flushQueue(tracker, await readQueue(), isOfflineError);
  await writeQueue(remaining);
  const note = dropped > 0 ? droppedNote(dropped) : undefined;
  try {
    const rows = await tracker.getToday();
    await AsyncStorage.setItem(ROWS_KEY, JSON.stringify(rows));
    return { rows: withQueued(rows, remaining), offline: false, note };
  } catch (error) {
    if (!isOfflineError(error)) throw error;
    const rows = await cachedToday();
    if (rows.length === 0) throw error;
    return { rows: withQueued(rows, remaining), offline: true, note };
  }
}

// What every way of logging goes through, so they all behave the same with no connection.
export const offlineTracker = {
  logHabit: async (
    habitId: string,
    date: string | null,
    level: HabitLevel = 'full',
    amount: number | null = null,
    source: LogSource = 'tap'
  ) => {
    const backlog = isBacklog(date, today());
    try {
      const saved = await tracker.logHabit(habitId, date, level, amount, source);
      analytics.track('habit_logged', { source, level, backlog, offline: false });
      return saved;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      analytics.track('habit_logged', { source, level, backlog, offline: true });
      // A reminder tapped before the app has opened today has no list to get a date from.
      const day = date ?? today();
      await writeQueue(
        addToQueue(await readQueue(), {
          habitId,
          date: day,
          level,
          amount,
          source,
        })
      );
      return null;
    }
  },

  undoLog: async (habitId: string, date: string | null, source: LogSource = 'tap') => {
    const queue = await readQueue();
    const left = removeFromQueue(queue, habitId, date);
    if (left.length !== queue.length) {
      await writeQueue(left);
      analytics.track('habit_undone', { source, offline: true });
      return null;
    }
    const undone = await tracker.undoLog(habitId, date, source);
    analytics.track('habit_undone', { source, offline: false });
    return undone;
  },

  skipHabit: async (
    habitId: string,
    date: string | null,
    reason: string,
    source: LogSource = 'tap'
  ) => {
    try {
      const saved = await tracker.skipHabit(habitId, date, reason, source);
      analytics.track('habit_skipped', { source, offline: false });
      return saved;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      analytics.track('habit_skipped', { source, offline: true });
      const item = {
        kind: 'skip' as const,
        habitId,
        date: date ?? today(),
        level: 'full' as const,
        amount: null,
        source,
        reason,
      };
      await writeQueue(addToQueue(await readQueue(), item));
      return null;
    }
  },

  // The server only takes a repair on its repair day, so one that syncs later is refused
  // and the person is told, like any other log it can't take.
  repairHabit: async (habitId: string, date: string, amount: number | null) => {
    try {
      const saved = await tracker.repairHabit(habitId, date, amount);
      analytics.track('habit_repaired', { source: 'tap', offline: false });
      return saved;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      analytics.track('habit_repaired', { source: 'tap', offline: true });
      const item = {
        kind: 'repair' as const,
        habitId,
        date,
        level: 'full' as const,
        amount,
        source: 'tap' as const,
      };
      await writeQueue(addToQueue(await readQueue(), item));
      return null;
    }
  },

  getToday: async () => {
    const queue = await readQueue();
    try {
      return withQueued(await tracker.getToday(), queue);
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      return withQueued(await cachedToday(), queue);
    }
  },
};
