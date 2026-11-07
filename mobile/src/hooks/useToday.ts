import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  amountFromText,
  HabitLevel,
  levelTarget,
  OFFLINE_NOTE,
  progressLine,
  RepairRow,
  TodayRow,
} from '@habit-tracker/core';
import { watchMyActivity } from '../services/live';
import { loadToday, offlineTracker } from '../services/logQueue';
import { tracker } from '../services/tracker';
import { refreshWidget } from '../services/widget';

type Patch = Partial<Pick<TodayRow, 'status' | 'level_done' | 'amount' | 'current_streak'>>;

export function useToday() {
  const [rows, setRows] = useState<TodayRow[]>([]);
  const [repairs, setRepairs] = useState<RepairRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(
    () =>
      loadToday()
        .then(async ({ rows: today, offline, note }) => {
          setRows(today);
          setLoadFailed(false);
          setOffline(offline);
          if (note) setMessage(note);
          if (!offline) {
            setRepairs(await tracker.getRepairs());
            void refreshWidget();
          }
        })
        .catch(() => setLoadFailed(true))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    void refresh();
    // A log from the widget or another device happens while this isn't looking.
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    // And while it's open, a log on the web or another phone shows straight away.
    const stopWatching = watchMyActivity(() => void refresh());
    return () => {
      listener.remove();
      stopWatching();
    };
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
      () => offlineTracker.logHabit(row.habit_id, row.day, level, amount)
    );
  };

  // "3", "2-3 pages" or "500 m", added to the day. The reply says where it stands.
  const addAmount = async (row: TodayRow, text: string): Promise<boolean> => {
    const parsed = amountFromText(text);
    if (!parsed) {
      setMessage('Enter an amount, like 3 or 2-3 pages.');
      return false;
    }
    let said: string | null = null;
    await change(row, { amount: (row.amount ?? 0) + parsed.amount }, async () => {
      const result = await offlineTracker.addAmount(row.habit_id, row.day, parsed.amount, parsed.unit);
      said = progressLine(result, row.title);
    });
    if (said) setMessage(said);
    return said !== null;
  };

  const undo = (row: TodayRow) =>
    change(
      row,
      { status: 'pending', level_done: null, amount: null, current_streak: Math.max(0, row.current_streak - 1) },
      () => offlineTracker.undoLog(row.habit_id, row.day)
    );

  const skip = (row: TodayRow, reason: string) =>
    change(row, { status: 'skipped', level_done: null, amount: null }, () =>
      offlineTracker.skipHabit(row.habit_id, row.day, reason)
    );

  const repair = (row: TodayRow) =>
    change(
      row,
      { status: 'done', level_done: 'full', amount: row.repair_amount },
      () => offlineTracker.repairHabit(row.habit_id, row.day, row.repair_amount)
    );

  return {
    rows,
    repairs,
    loading,
    loadFailed,
    message: message ?? (offline ? OFFLINE_NOTE : null),
    refresh,
    log,
    addAmount,
    undo,
    skip,
    repair,
  };
}
