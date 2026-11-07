import { useCallback, useEffect, useState } from 'react';
import { addDays, AnalyticsData, AnalyticsRange, localDate, overviewPeriods, ProgressDay } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

// The identity score covers the last 30 days, with the weekly-habit rules getHabitDays has.
const IDENTITY_DAYS = 31;

interface Loaded {
  today: string;
  data: AnalyticsData;
  identityDays: ProgressDay[];
}

// Everything the Overview shows, for a range and the period before it. A year or more is
// loaded at once, so most range changes need nothing new; the server caches each load.
export function useOverview(active: boolean, range: AnalyticsRange) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const long = range === '1y' || range === 'all';

  const load = useCallback(
    () =>
      tracker
        .getProfile()
        .then(async ({ timezone }) => {
          const today = localDate(timezone);
          const { from, to } = overviewPeriods(long ? 'all' : '90d', today).load;
          const [data, identityDays] = await Promise.all([
            tracker.getAnalytics(from, to),
            tracker.getHabitDays(addDays(today, -IDENTITY_DAYS), today).catch(() => []),
          ]);
          setLoaded({ today, data, identityDays });
          setFailed(false);
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false)),
    [long]
  );

  // Reloads each time the tab opens, so a log on Today shows up here. The server answers
  // from its cache unless something changed.
  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  return { loaded, loading, failed, load };
}
