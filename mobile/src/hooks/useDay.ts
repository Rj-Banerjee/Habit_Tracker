import { useCallback, useEffect, useState } from 'react';
import { TodayRow } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

// A day of the strip other than today: what was due, and how it went. Null loads nothing,
// since today comes from useToday with its live updates and offline queue.
export function useDay(day: string | null) {
  const [loaded, setLoaded] = useState<{ day: string; rows: TodayRow[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!day) return Promise.resolve();
    return Promise.resolve()
      .then(() => {
        setFailed(null);
        return tracker.getDay(day);
      })
      .then((rows) => setLoaded({ day, rows }))
      .catch(() => setFailed(day));
  }, [day]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Rows from another day never show while the next one loads.
  const rows = loaded && loaded.day === day ? loaded.rows : null;
  return {
    rows: rows ?? [],
    loading: day !== null && rows === null && failed !== day,
    failed: day !== null && failed === day,
    reload,
  };
}
