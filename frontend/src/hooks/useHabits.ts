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
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setHabits(await trackerService.listHabits(year, month));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

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

  return { habits, loading, loadFailed, refresh, addHabit, renameHabit, deleteHabit };
}
