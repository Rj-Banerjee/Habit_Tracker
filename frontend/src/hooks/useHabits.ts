'use client';

import { useCallback, useEffect, useState } from 'react';
import { MonthHabit } from '@habit-tracker/core';
import { tracker } from '../services/tracker';
import { useAuth } from './useAuth';
import { useToast } from './useToast';

export function useHabits(year: number, month: number) {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [habits, setHabits] = useState<MonthHabit[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const refreshStreaks = useCallback(async () => {
    const rows = await tracker.getStreaks();
    setStreaks(Object.fromEntries(rows.map((row) => [row.habit_id, row.current_streak])));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [loaded] = await Promise.all([tracker.listMonthHabits(year, month), refreshStreaks()]);
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

  const addHabit = async (title: string, minimum: string) => {
    if (!user) return;
    try {
      const identities = await tracker.listIdentities();
      const identity = identities[0] ?? (await tracker.createIdentity(user.id, 'Me', 'identity-1'));
      await tracker.createHabit({
        identityId: identity.id,
        title,
        levels: [
          { level: 'full', description: title, target: null },
          { level: 'minimum', description: minimum, target: null },
        ],
      });
      await refresh();
      success(`Added ${title}`);
    } catch (err) {
      error((err as Error).message);
    }
  };

  const renameHabit = async (id: string, title: string) => {
    try {
      await tracker.updateHabit(id, { title });
      await refresh();
    } catch (err) {
      error((err as Error).message);
    }
  };

  const deleteHabit = async (id: string) => {
    try {
      await tracker.archiveHabit(id);
      setHabits((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      error((err as Error).message);
    }
  };

  return { habits, streaks, loading, loadFailed, refresh, refreshStreaks, addHabit, renameHabit, deleteHabit };
}
