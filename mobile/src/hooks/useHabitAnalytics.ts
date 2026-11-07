import { useEffect, useState } from 'react';
import { addDays, AnalyticsData, DayStatus, rangeDates, WeekStatusRow } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

// A year is enough for every range but all time, and for the year heatmap and strength.
const YEAR = 365;
// Repair days are only needed for misses recent enough to repair.
const REPAIR_LOOKBACK = 30;
const CHAIN_WEEKS = 12;

interface Loaded {
  data: AnalyticsData;
  statuses: DayStatus[];
  weeks: WeekStatusRow[];
}

// One habit's analytics. It loads a year at once, so changing the range is instant; all
// time loads the rest only when it's asked for. The server keeps the result cached.
export function useHabitAnalytics(habitId: string, today: string, allTime: boolean) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  // The key of what's loaded, so a new request shows loading without an effect setting state.
  const [loadedKey, setLoadedKey] = useState('');
  const key = `${habitId}:${today}:${allTime ? 'all' : 'year'}`;

  useEffect(() => {
    let live = true;
    const from = allTime ? rangeDates('all', today).from : addDays(today, 1 - YEAR);
    Promise.all([
      tracker.getAnalytics(from, today),
      tracker.getDayStatuses(addDays(today, -REPAIR_LOOKBACK), today).catch(() => []),
    ])
      .then(async ([data, statuses]) => {
        const weekly = data.habits.find((h) => h.id === habitId)?.frequency === 'per_week';
        // A times-per-week chain needs the week it can still be repaired in.
        const weeks = weekly
          ? await tracker.getWeekStatuses(addDays(today, -7 * CHAIN_WEEKS), today).catch(() => [])
          : [];
        if (!live) return;
        setLoaded({ data, statuses, weeks });
        setFailed(false);
        setLoadedKey(key);
      })
      .catch(() => {
        if (!live) return;
        setFailed(true);
        setLoadedKey(key);
      });
    return () => {
      live = false;
    };
  }, [habitId, today, allTime, key]);

  // While all time loads, the year already loaded stays on screen.
  return { loaded, failed, loading: loadedKey !== key };
}
