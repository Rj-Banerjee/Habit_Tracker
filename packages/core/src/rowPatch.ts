import { HabitLevel, TodayRow } from './api';
import { levelTarget } from './todayModel';

// What a card shows the moment it's tapped, before the server has answered. Today and any
// other day of the strip use the same ones, so a tick looks the same wherever it happens.
export type RowPatch = Partial<
  Pick<TodayRow, 'status' | 'level_done' | 'amount' | 'current_streak' | 'time_of_day' | 'reminder_time'>
>;

export const loggedPatch = (row: TodayRow, level: HabitLevel): RowPatch => ({
  status: 'done',
  level_done: level,
  amount: levelTarget(row, level),
  current_streak: row.current_streak + 1,
});

export const undonePatch = (row: TodayRow): RowPatch => ({
  status: 'pending',
  level_done: null,
  amount: null,
  current_streak: Math.max(0, row.current_streak - 1),
});

export const skippedPatch = (): RowPatch => ({ status: 'skipped', level_done: null, amount: null });

export const repairedPatch = (row: TodayRow): RowPatch => ({
  status: 'done',
  level_done: 'full',
  amount: row.repair_amount,
});

export const rowKey = (row: Pick<TodayRow, 'habit_id' | 'day'>) => `${row.habit_id}|${row.day}`;

// The server's rows with the taps it hasn't caught up with yet laid back on top, so a
// read that started before a tap never undoes it on screen.
export function withPending(rows: TodayRow[], pending: ReadonlyMap<string, RowPatch>): TodayRow[] {
  if (pending.size === 0) return rows;
  return rows.map((r) => {
    const patch = pending.get(rowKey(r));
    return patch ? { ...r, ...patch } : r;
  });
}

// The fields a patch touched, as they were, to put back if the save fails.
export function revertOf(row: TodayRow, patch: RowPatch): RowPatch {
  const back: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) back[key] = row[key as keyof TodayRow];
  return back as RowPatch;
}

export const patchRow = (rows: TodayRow[], target: Pick<TodayRow, 'habit_id' | 'day'>, patch: RowPatch) =>
  rows.map((r) => (r.habit_id === target.habit_id && r.day === target.day ? { ...r, ...patch } : r));
