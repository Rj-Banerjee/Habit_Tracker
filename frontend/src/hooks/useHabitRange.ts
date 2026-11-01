'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  dayCellStatus,
  DayStatus,
  HabitCardStatus,
  HabitLevel,
  RangeHabit,
} from '@habit-tracker/core';
import { tracker } from '../services/tracker';

const key = (habitId: string, date: string) => `${habitId}|${date}`;

export function useHabitRange(from: string, to: string, today: string | null) {
  const [habits, setHabits] = useState<RangeHabit[]>([]);
  const [days, setDays] = useState<DayStatus[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      Promise.all([
        tracker.listHabitsInRange(from, to),
        tracker.getDayStatuses(from, to),
        tracker.getStreaks(),
      ])
        .then(([loaded, statuses, streakRows]) => {
          setHabits(loaded);
          setDays(statuses);
          setStreaks(Object.fromEntries(streakRows.map((r) => [r.habit_id, r.current_streak])));
          setLoadFailed(false);
        })
        .catch(() => setLoadFailed(true))
        .finally(() => setLoading(false)),
    [from, to]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dayMap = useMemo(() => {
    const map = new Map<string, DayStatus>();
    for (const day of days) map.set(key(day.habit_id, day.date), day);
    return map;
  }, [days]);

  const levelMap = useMemo(() => {
    const map = new Map<string, HabitLevel | null>();
    for (const habit of habits) {
      for (const log of habit.habit_logs) map.set(key(habit.id, log.date), log.level_done);
    }
    return map;
  }, [habits]);

  const statusOf = useCallback(
    (habitId: string, date: string): HabitCardStatus | null =>
      today
        ? dayCellStatus(
            dayMap.get(key(habitId, date))?.status,
            levelMap.get(key(habitId, date)),
            date,
            today
          )
        : null,
    [dayMap, levelMap, today]
  );

  const repairOn = useCallback(
    (habitId: string, date: string) => dayMap.get(key(habitId, date))?.repair_on ?? null,
    [dayMap]
  );

  // Shows the change at once, and puts it back with a reason if the server refuses.
  const change = useCallback(
    async (
      habitId: string,
      date: string,
      nextStatus: string,
      level: HabitLevel | null,
      save: () => Promise<unknown>
    ) => {
      const before = days;
      setMessage(null);
      setDays((current) =>
        current.map((d) =>
          d.habit_id === habitId && d.date === date ? { ...d, status: nextStatus } : d
        )
      );
      setHabits((current) =>
        current.map((h) =>
          h.id === habitId
            ? {
                ...h,
                habit_logs: [
                  ...h.habit_logs.filter((l) => l.date !== date),
                  ...(level
                    ? [{ id: 'pending', habit_id: habitId, date, status: 'done' as const, level_done: level }]
                    : []),
                ],
              }
            : h
        )
      );
      try {
        await save();
      } catch (err) {
        setDays(before);
        setMessage((err as Error).message);
      }
      await refresh();
    },
    [days, refresh]
  );

  const log = (habitId: string, date: string, level: HabitLevel = 'full') =>
    change(habitId, date, 'done', level, () => tracker.logHabit(habitId, date, level));

  const undo = (habitId: string, date: string) =>
    change(habitId, date, 'pending', null, () => tracker.undoLog(habitId, date));

  const skip = (habitId: string, date: string, reason: string) =>
    change(habitId, date, 'skipped', null, () => tracker.skipHabit(habitId, date, reason));

  return {
    habits,
    streaks,
    loading,
    loadFailed,
    message,
    refresh,
    statusOf,
    repairOn,
    log,
    undo,
    skip,
  };
}
