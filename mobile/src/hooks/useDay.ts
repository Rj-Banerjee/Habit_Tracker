import { useCallback, useEffect, useRef, useState } from 'react';
import { patchRow, revertOf, RowPatch, rowKey, TodayRow, withPending } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

// A day of the strip other than today: what was due, and how it went. Null loads nothing,
// since today comes from useToday with its live updates and offline queue.
export function useDay(day: string | null) {
  const [loaded, setLoaded] = useState<{ day: string; rows: TodayRow[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Taps still saving, laid over every read until the server has them.
  const pending = useRef(new Map<string, RowPatch>());
  // Only the newest read is shown, so a slow one can't land on top of a newer one.
  const reads = useRef(0);

  const reload = useCallback(() => {
    if (!day) return Promise.resolve();
    const read = ++reads.current;
    return Promise.resolve()
      .then(() => {
        setFailed(null);
        return tracker.getDay(day);
      })
      .then((rows) => {
        if (read === reads.current) setLoaded({ day, rows: withPending(rows, pending.current) });
      })
      .catch(() => {
        if (read === reads.current) setFailed(day);
      });
  }, [day]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // A tap on this day shows on its card at once. `saved` settles it: kept and re-read
  // when the save lands, put back if it didn't.
  const patch = useCallback(
    (row: TodayRow, change: RowPatch, saved: Promise<boolean>) => {
      const key = rowKey(row);
      const back = revertOf(row, change);
      pending.current.set(key, change);
      setLoaded((current) => (current && current.day === row.day ? { ...current, rows: patchRow(current.rows, row, change) } : current));
      void saved.then((ok) => {
        if (pending.current.get(key) !== change) return;
        pending.current.delete(key);
        if (!ok) {
          setLoaded((current) =>
            current && current.day === row.day ? { ...current, rows: patchRow(current.rows, row, back) } : current
          );
        }
        void reload();
      });
    },
    [reload]
  );

  // Rows from another day never show while the next one loads.
  const rows = loaded && loaded.day === day ? loaded.rows : null;
  return {
    rows: rows ?? [],
    loading: day !== null && rows === null && failed !== day,
    failed: day !== null && failed === day,
    reload,
    patch,
  };
}
