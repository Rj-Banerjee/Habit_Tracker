'use client';

import { useCallback, useEffect, useState } from 'react';
import { trackerService } from '../services/trackerService';
import { Habit } from '../types';
import { useAuth } from './useAuth';
import { useToast } from './useToast';

export function useHabits(year: number, month: number) {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const refreshStreaks = useCallback(async () => {
    const rows = await trackerService.getStreaks();
    setStreaks(Object.fromEntries(rows.map((row) => [row.habit_id, row.current_streak])));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [loaded] = await Promise.all([trackerService.listHabits(year, month), refreshStreaks()]);
      setHabits(loaded);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [year, month, refreshStreaks]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addHabit = async (title: string) => {
    if (!user) return;
    try {
      await trackerService.createHabit(user.id, title);
      await refresh();
      success(`Added ${title}`);
    } catch (err) {
      error((err as Error).message);
    }
  };

  const renameHabit = async (id: string, title: string) => {
    try {
      await trackerService.renameHabit(id, title);
      await refresh();
    } catch (err) {
      error((err as Error).message);
    }
  };

  const deleteHabit = async (id: string) => {
    try {
      await trackerService.deleteHabit(id);
      setHabits((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      error((err as Error).message);
    }
  };

  return { habits, streaks, loading, loadFailed, refresh, refreshStreaks, addHabit, renameHabit, deleteHabit };
}
