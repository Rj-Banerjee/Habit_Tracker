import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addToQueue,
  droppedNote,
  flushQueue,
  HabitLevel,
  isOfflineError,
  localDate,
  LogSource,
  QueuedLog,
  removeFromQueue,
  TodayRow,
  withQueued,
} from '@habit-tracker/core';
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
export async function loadToday(): Promise<{ rows: TodayRow[]; offline: boolean; note?: string }> {
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
    try {
      return await tracker.logHabit(habitId, date, level, amount, source);
    } catch (error) {
      if (!isOfflineError(error) || !date) throw error;
      await writeQueue(addToQueue(await readQueue(), { habitId, date, level, amount, source }));
      return null;
    }
  },

  undoLog: async (habitId: string, date: string | null, source: LogSource = 'tap') => {
    const queue = await readQueue();
    const left = removeFromQueue(queue, habitId, date);
    if (left.length !== queue.length) {
      await writeQueue(left);
      return null;
    }
    return tracker.undoLog(habitId, date, source);
  },

  skipHabit: tracker.skipHabit,

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
