import { useCallback, useEffect, useState } from 'react';
import { addDays, DayStatus, localDate, ProgressDay, ProgressHabit } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

const YEAR_AND_A_WEEK = 371;
// The chain only needs repair days for misses that are recent enough to repair.
const REPAIR_LOOKBACK = 30;

export function useProgress(active: boolean) {
  const [habits, setHabits] = useState<ProgressHabit[]>([]);
  const [days, setDays] = useState<ProgressDay[]>([]);
  const [statuses, setStatuses] = useState<DayStatus[]>([]);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(
    () =>
      tracker
        .getProfile()
        .then(async ({ timezone }) => {
          const now = localDate(timezone);
          const [list, history] = await Promise.all([
            tracker.listProgressHabits(),
            tracker.getHabitDays(addDays(now, -YEAR_AND_A_WEEK), now),
          ]);
          setHabits(list);
          setDays(history);
          // A chain still draws without repair days, just with closed gaps.
          tracker
            .getDayStatuses(addDays(now, -REPAIR_LOOKBACK), now)
            .then(setStatuses)
            .catch(() => {});
          setToday(now);
          setLoadFailed(false);
        })
        .catch(() => setLoadFailed(true))
        .finally(() => setLoading(false)),
    []
  );

  // Reloads each time the tab opens, so a log on Today shows up here.
  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  return { habits, days, statuses, today, loading, loadFailed, load };
}
