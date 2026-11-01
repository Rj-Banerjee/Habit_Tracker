import { useCallback, useEffect, useState } from 'react';
import { HabitLevel, levelTarget, RepairRow, TodayRow } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

type Patch = Partial<Pick<TodayRow, 'status' | 'level_done' | 'amount' | 'current_streak'>>;

export function useToday() {
  const [rows, setRows] = useState<TodayRow[]>([]);
  const [repairs, setRepairs] = useState<RepairRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [today, repairable] = await Promise.all([tracker.getToday(), tracker.getRepairs()]);
      setRows(today);
      setRepairs(repairable);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Shows the change at once, then lets the server have the final word.
  const change = useCallback(
    async (row: TodayRow, patch: Patch, save: () => Promise<unknown>) => {
      const before = rows;
      setMessage(null);
      setRows((current) =>
        current.map((r) =>
          r.habit_id === row.habit_id && r.day === row.day ? { ...r, ...patch } : r
        )
      );
      try {
        await save();
        await refresh();
      } catch (err) {
        setRows(before);
        setMessage((err as Error).message);
      }
    },
    [rows, refresh]
  );

  const log = (row: TodayRow, level: HabitLevel) => {
    const amount = levelTarget(row, level);
    return change(
      row,
      { status: 'done', level_done: level, amount, current_streak: row.current_streak + 1 },
      () => tracker.logHabit(row.habit_id, row.day, level, amount)
    );
  };

  const undo = (row: TodayRow) =>
    change(
      row,
      { status: 'pending', level_done: null, amount: null, current_streak: Math.max(0, row.current_streak - 1) },
      () => tracker.undoLog(row.habit_id, row.day)
    );

  const skip = (row: TodayRow, reason: string) =>
    change(row, { status: 'skipped', level_done: null, amount: null }, () =>
      tracker.skipHabit(row.habit_id, row.day, reason)
    );

  const repair = (row: TodayRow) =>
    change(
      row,
      { status: 'done', level_done: 'full', amount: row.repair_amount },
      () => tracker.repairHabit(row.habit_id, row.day, row.repair_amount)
    );

  return { rows, repairs, loading, loadFailed, message, refresh, log, undo, skip, repair };
}
