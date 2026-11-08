import { useCallback, useEffect, useState } from 'react';
import { HeadsUp, Warning } from '@habit-tracker/core';
import { tracker } from '../services/tracker';
import { useEntitlements } from './useEntitlements';

interface Unseen {
  id: string;
  habit_title: string;
  reason: string;
}

// The heads-up, the weekly warning and what Autopilot did, for Today. All Pro, all
// optional: any failure just leaves them out.
export function useTodayAi(refresh: () => unknown) {
  const { can, ready } = useEntitlements();
  const allowed = ready && can('ai.insights');
  const [headsUp, setHeadsUp] = useState<HeadsUp | null>(null);
  const [warning, setWarning] = useState<Warning | null>(null);
  const [unseen, setUnseen] = useState<Unseen[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    const quietly = <T,>(read: () => Promise<T>, set: (value: T) => void) =>
      Promise.resolve()
        .then(read)
        .then(set)
        .catch(() => {});
    void quietly(() => tracker.getHeadsUp(), setHeadsUp);
    void quietly(() => tracker.getWarning(), setWarning);
    void quietly(() => tracker.getUnseenAiChanges(), (rows) => setUnseen(rows ?? []));
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const applyHeadsUp = async () => {
    if (!headsUp) return;
    setProblem(null);
    try {
      await tracker.applyHeadsUp(headsUp.finding_id);
      setHeadsUp(null);
      await refresh();
    } catch {
      setProblem("That didn't go through. Nothing was changed.");
    }
  };

  const dismissHeadsUp = () => {
    setHeadsUp(null);
    void Promise.resolve()
      .then(() => tracker.dismissHeadsUp())
      .catch(() => {});
  };

  const snoozeWarning = () => {
    setWarning(null);
    void Promise.resolve()
      .then(() => tracker.snoozeWarning())
      .catch(() => {});
  };

  const undoAutopilot = async (id: string) => {
    setProblem(null);
    try {
      await tracker.undoAiChange(id);
      setUnseen((rows) => rows.filter((row) => row.id !== id));
      await refresh();
    } catch {
      setProblem("That couldn't be undone. Try again from You, under AI changes.");
    }
  };

  const keepAutopilot = () => {
    setUnseen([]);
    void Promise.resolve()
      .then(() => tracker.markAiChangesSeen())
      .catch(() => {});
  };

  return {
    headsUp: allowed ? headsUp : null,
    warning: allowed ? warning : null,
    unseen: allowed ? unseen : [],
    problem,
    applyHeadsUp,
    dismissHeadsUp,
    snoozeWarning,
    undoAutopilot,
    keepAutopilot,
  };
}
