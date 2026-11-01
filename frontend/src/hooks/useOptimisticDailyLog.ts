'use client';

import { useCallback, useEffect, useState } from 'react';
import { MonthHabit } from '@habit-tracker/core';
import { tracker } from '../services/tracker';
import { useToast } from './useToast';

export function useOptimisticDailyLog(habits: MonthHabit[], onSaved: () => void) {
  const [logMap, setLogMap] = useState<Record<string, boolean>>({});
  const { error } = useToast();

  useEffect(() => {
    const map: Record<string, boolean> = {};
    habits.forEach((habit) => {
      habit.habit_logs.forEach((log) => {
        if (log.status !== 'skipped') {
          map[`${habit.id}_${log.date}`] = true;
        }
      });
    });
    setLogMap(map);
  }, [habits]);

  const isCompleted = useCallback(
    (habitId: string, dateKey: string) => !!logMap[`${habitId}_${dateKey}`],
    [logMap]
  );

  const setKey = (key: string, value: boolean) => {
    setLogMap((prev) => {
      const copy = { ...prev };
      if (value) {
        copy[key] = true;
      } else {
        delete copy[key];
      }
      return copy;
    });
  };

  const toggleLog = useCallback(
    async (habitId: string, dateKey: string) => {
      const key = `${habitId}_${dateKey}`;
      const previous = !!logMap[key];
      setKey(key, !previous);

      try {
        if (previous) {
          await tracker.undoLog(habitId, dateKey);
        } else {
          await tracker.logHabit(habitId, dateKey);
        }
        onSaved();
      } catch (err) {
        setKey(key, previous);
        error(`Couldn't save ${dateKey}: ${(err as Error).message}`);
      }
    },
    [logMap, onSaved, error]
  );

  return { isCompleted, toggleLog };
}
