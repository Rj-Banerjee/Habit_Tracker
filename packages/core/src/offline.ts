import { HabitLevel, LogSource, TodayRow, TrackerApi } from './api';

export interface QueuedLog {
  habitId: string;
  date: string;
  level: HabitLevel;
  amount: number | null;
  source: LogSource;
}

export const OFFLINE_NOTE = "You're offline. Logs are saved here and will sync when you're back.";
export const droppedNote = (count: number) =>
  `${count === 1 ? "A log" : `${count} logs`} from while you were offline couldn't be saved.`;

// The latest word on a day wins, as it would online.
export const addToQueue = (queue: QueuedLog[], log: QueuedLog) => [
  ...queue.filter((item) => item.habitId !== log.habitId || item.date !== log.date),
  log,
];

export const removeFromQueue = (queue: QueuedLog[], habitId: string, date: string | null) =>
  queue.filter((item) => item.habitId !== habitId || (date !== null && item.date !== date));

// Logs the server hasn't seen yet still show as done.
export function withQueued(rows: TodayRow[], queue: QueuedLog[]): TodayRow[] {
  return rows.map((row) => {
    const queued = queue.find((log) => log.habitId === row.habit_id && log.date === row.day);
    return queued
      ? { ...row, status: 'done', level_done: queued.level, amount: queued.amount }
      : row;
  });
}

export interface FlushResult {
  remaining: QueuedLog[];
  // The server refused these, for example because the back-log window closed. Trying
  // again can't help, so they're dropped and the person is told.
  dropped: number;
}

export async function flushQueue(
  api: Pick<TrackerApi, 'logHabit'>,
  queue: QueuedLog[],
  isOffline: (error: unknown) => boolean
): Promise<FlushResult> {
  let dropped = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const log = queue[index];
    try {
      await api.logHabit(log.habitId, log.date, log.level, log.amount, log.source);
    } catch (error) {
      if (isOffline(error)) return { remaining: queue.slice(index), dropped };
      dropped += 1;
    }
  }
  return { remaining: [], dropped };
}
