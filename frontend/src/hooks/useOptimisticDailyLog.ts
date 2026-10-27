'use client';

import { useState, useCallback, useEffect } from 'react';
import { habitService } from '../services/habitService';
import { useToast } from './useToast';
import { DailyHabit } from '../types';

export function useOptimisticDailyLog(initialHabits: DailyHabit[], onSyncSuccess?: () => void) {
  const [logMap, setLogMap] = useState<Record<string, boolean>>({});
  const { error } = useToast();

  // Populate log map whenever initialHabits updates
  useEffect(() => {
    const map: Record<string, boolean> = {};
    initialHabits.forEach((habit) => {
      habit.logs?.forEach((log) => {
        if (log.is_completed) {
          map[`${habit.id}_${log.date}`] = true;
        }
      });
    });
    setLogMap(map);
  }, [initialHabits]);

  const isCompleted = useCallback(
    (habitId: string, dateKey: string): boolean => {
      return !!logMap[`${habitId}_${dateKey}`];
    },
    [logMap]
  );

  const toggleLog = useCallback(
    async (habitId: string, dateKey: string) => {
      const key = `${habitId}_${dateKey}`;
      const previousValue = !!logMap[key];
      const nextValue = !previousValue;

      // 1. Optimistic UI update: Immediate local state toggle
      setLogMap((prev) => {
        const copy = { ...prev };
        if (nextValue) {
          copy[key] = true;
        } else {
          delete copy[key];
        }
        return copy;
      });

      // 2. Background sync to Supabase backend API
      try {
        await habitService.toggleDailyLog(habitId, dateKey, nextValue);
        if (onSyncSuccess) {
          onSyncSuccess();
        }
      } catch (err) {
        // Rollback state on network failure
        setLogMap((prev) => {
          const copy = { ...prev };
          if (previousValue) {
            copy[key] = true;
          } else {
            delete copy[key];
          }
          return copy;
        });
        error(`Sync failed for ${dateKey}: ${(err as Error).message}. Rolled back.`);
      }
    },
    [logMap, onSyncSuccess, error]
  );

  return {
    logMap,
    isCompleted,
    toggleLog,
  };
}
