'use client';

import { useCallback, useEffect, useState } from 'react';
import { trackerService } from '../services/trackerService';
import { useToast } from './useToast';
import { Habit } from '../types';

export function useOptimisticDailyLog(habits: Habit[]) {
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
        await trackerService.setLog(habitId, dateKey, !previous);
      } catch (err) {
        setKey(key, previous);
        error(`Couldn't save ${dateKey}: ${(err as Error).message}`);
      }
    },
    [logMap, error]
  );

  return { isCompleted, toggleLog };
}
