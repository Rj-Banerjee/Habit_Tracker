import { useCallback, useEffect, useState } from 'react';
import { celebrationTip, CompletedHabit } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

// Habits that have run their course. Each gets one calm celebration, remembered on the
// server so it shows once on every device, and can be restarted as a new run.
export function useCompletedHabits(reloaded?: unknown) {
  const [habits, setHabits] = useState<CompletedHabit[]>([]);
  const [seen, setSeen] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.resolve()
        .then(() => Promise.all([tracker.listCompletedHabits(), tracker.getProfile()]))
        .then(([list, profile]) => {
          setHabits(list);
          setSeen(profile.seen_tips ?? []);
        })
        // Nothing to celebrate is better than an error about it.
        .catch(() => {}),
    []
  );

  useEffect(() => {
    void load();
  }, [load, reloaded]);

  const celebrate =
    seen === null
      ? null
      : (habits.find((habit) => !habit.restarted && !seen.includes(celebrationTip(habit.habit_id))) ?? null);

  const dismiss = (habit: CompletedHabit) => {
    const tip = celebrationTip(habit.habit_id);
    setSeen((current) => [...(current ?? []), tip]);
    tracker.markTipSeen(tip).catch(() => {});
  };

  const restart = async (habit: CompletedHabit) => {
    setProblem(null);
    try {
      await tracker.restartHabit(habit.habit_id);
      await load();
      return true;
    } catch (err) {
      setProblem((err as Error).message);
      return false;
    }
  };

  return { habits, celebrate, dismiss, restart, problem };
}
