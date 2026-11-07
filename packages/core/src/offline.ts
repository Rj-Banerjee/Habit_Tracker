import { HabitLevel, LogSource, TodayRow, TrackerApi } from './api';
import { levelTarget } from './todayModel';

// A queue saved before skips and repairs could wait has no kind, and is a log.
export type QueuedKind = 'log' | 'skip' | 'repair' | 'amount';

export interface QueuedLog {
  kind?: QueuedKind;
  habitId: string;
  date: string;
  level: HabitLevel;
  amount: number | null;
  source: LogSource;
  reason?: string;
  // For an added amount: the unit it was given in, if any.
  unit?: string | null;
}

export const OFFLINE_NOTE = "You're offline. Logs are saved here and will sync when you're back.";
export const droppedNote = (count: number) =>
  `${count === 1 ? "A log" : `${count} logs`} from while you were offline couldn't be saved.`;

// The latest word on a day wins, as it would online. Amounts add up instead, as they do
// online, until a log, skip or repair replaces the day.
export const addToQueue = (queue: QueuedLog[], log: QueuedLog) => [
  ...queue.filter(
    (item) =>
      item.habitId !== log.habitId ||
      item.date !== log.date ||
      (log.kind === 'amount' && item.kind !== 'skip')
  ),
  log,
];

export const removeFromQueue = (queue: QueuedLog[], habitId: string, date: string | null) =>
  queue.filter((item) => item.habitId !== habitId || (date !== null && item.date !== date));

// What the server hasn't seen yet still shows as it will once it has.
export function withQueued(rows: TodayRow[], queue: QueuedLog[]): TodayRow[] {
  return rows.map((row) => {
    const mine = queue.filter((log) => log.habitId === row.habit_id && log.date === row.day);
    const queued = mine.find((log) => log.kind !== 'amount');
    const added = mine.filter((log) => log.kind === 'amount').reduce((sum, log) => sum + (log.amount ?? 0), 0);
    if (!queued && added > 0) return withAmount(row, (row.amount ?? 0) + added);
    if (!queued) return row;
    if (queued.kind === 'skip') {
      return { ...row, status: 'skipped', level_done: null, amount: null, skip_reason: queued.reason ?? null };
    }
    return { ...row, status: 'done', level_done: queued.level, amount: queued.amount };
  });
}

// An estimate until the server says: in the habit's own unit, against today's levels.
function withAmount(row: TodayRow, total: number): TodayRow {
  const target = levelTarget(row, 'full');
  const minimum = levelTarget(row, 'minimum');
  if (target !== null && total >= target) return { ...row, status: 'done', level_done: 'full', amount: total };
  if (minimum === null || total >= minimum) return { ...row, status: 'done', level_done: 'minimum', amount: total };
  return { ...row, amount: total };
}

export interface FlushResult {
  remaining: QueuedLog[];
  // The server refused these, for example because the back-log window closed. Trying
  // again can't help, so they're dropped and the person is told.
  dropped: number;
}

type QueueApi = Pick<TrackerApi, 'logHabit' | 'skipHabit' | 'repairHabit' | 'addAmount'>;

const send = (api: QueueApi, item: QueuedLog) => {
  switch (item.kind) {
    case 'amount':
      return api.addAmount(item.habitId, item.date, item.amount ?? 0, item.unit ?? null, item.source);
    case 'skip':
      return api.skipHabit(item.habitId, item.date, item.reason ?? '', item.source);
    case 'repair':
      return api.repairHabit(item.habitId, item.date, item.amount);
    default:
      return api.logHabit(item.habitId, item.date, item.level, item.amount, item.source);
  }
};

export async function flushQueue(
  api: QueueApi,
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
