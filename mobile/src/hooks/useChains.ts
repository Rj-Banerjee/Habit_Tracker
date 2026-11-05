import { useEffect, useMemo, useState } from 'react';
import { addDays, Chain, DayStatus, habitChain, ProgressDay, TodayRow } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

// Enough days back to find 7 scheduled ones on a sparse schedule.
const LOOKBACK_DAYS = 27;

export interface HabitChain {
  habitId: string;
  chain: Chain;
}

// Each of today's habits with its last 7 scheduled days, reloaded whenever Today is.
export function useChains(rows: TodayRow[]) {
  const today = rows.find((row) => row.is_today)?.day ?? null;
  // Changes whenever a log does, so the chain follows the card.
  const key = rows.map((row) => `${row.habit_id}:${row.day}:${row.status}:${row.level_done}`).join('|');
  const [data, setData] = useState<{ days: ProgressDay[]; statuses: DayStatus[] } | null>(null);

  useEffect(() => {
    if (!today) return;
    let live = true;
    const from = addDays(today, -LOOKBACK_DAYS);
    Promise.resolve()
      .then(() => Promise.all([tracker.getHabitDays(from, today), tracker.getDayStatuses(from, today)]))
      .then(([days, statuses]) => live && setData({ days, statuses }))
      // A chain is extra: if it can't load, the cards still work without one.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [today, key]);

  const habitIds = useMemo(
    () => [...new Set(rows.filter((row) => row.is_today).map((row) => row.habit_id))],
    [rows]
  );

  const chains = useMemo<HabitChain[]>(
    () =>
      data && today
        ? habitIds.map((habitId) => ({
            habitId,
            chain: habitChain(habitId, data.days, today, undefined, data.statuses),
          }))
        : [],
    [data, today, habitIds]
  );

  return { chains, ready: data !== null, days: data?.days ?? [], statuses: data?.statuses ?? [] };
}
