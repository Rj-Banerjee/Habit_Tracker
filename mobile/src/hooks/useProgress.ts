import { useCallback, useEffect, useState } from 'react';
import { addDays, localDate, ProgressDay, ProgressHabit } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

const YEAR_AND_A_WEEK = 371;

export function useProgress(active: boolean) {
  const [habits, setHabits] = useState<ProgressHabit[]>([]);
  const [days, setDays] = useState<ProgressDay[]>([]);
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

  return { habits, days, today, loading, loadFailed, load };
}
