import { HabitLevel, LogSource, TodayRow, TrackerApi } from './api';

// A queue saved before skips and repairs could wait has no kind, and is a log.
export type QueuedKind = 'log' | 'skip' | 'repair';

export interface QueuedLog {
  kind?: QueuedKind;
  habitId: string;
  date: string;
  level: HabitLevel;
  amount: number | null;
  source: LogSource;
  reason?: string;
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

// What the server hasn't seen yet still shows as it will once it has.
export function withQueued(rows: TodayRow[], queue: QueuedLog[]): TodayRow[] {
  return rows.map((row) => {
    const queued = queue.find((log) => log.habitId === row.habit_id && log.date === row.day);
    if (!queued) return row;
    if (queued.kind === 'skip') {
      return { ...row, status: 'skipped', level_done: null, amount: null, skip_reason: queued.reason ?? null };
    }
    return { ...row, status: 'done', level_done: queued.level, amount: queued.amount };
  });
}

export interface FlushResult {
  remaining: QueuedLog[];
  // The server refused these, for example because the back-log window closed. Trying
  // again can't help, so they're dropped and the person is told.
  dropped: number;
}

const send = (api: Pick<TrackerApi, 'logHabit' | 'skipHabit' | 'repairHabit'>, item: QueuedLog) => {
  switch (item.kind) {
    case 'skip':
      return api.skipHabit(item.habitId, item.date, item.reason ?? '', item.source);
    case 'repair':
      return api.repairHabit(item.habitId, item.date, item.amount);
    default:
      return api.logHabit(item.habitId, item.date, item.level, item.amount, item.source);
  }
};

export async function flushQueue(
  api: Pick<TrackerApi, 'logHabit' | 'skipHabit' | 'repairHabit'>,
  queue: QueuedLog[],
  isOffline: (error: unknown) => boolean
): Promise<FlushResult> {
  let dropped = 0;
  for (let index = 0; index < queue.length; index += 1) {
    try {
      await send(api, queue[index]);
    } catch (error) {
      if (isOffline(error)) return { remaining: queue.slice(index), dropped };
      dropped += 1;
    }
  }
  return { remaining: [], dropped };
}
