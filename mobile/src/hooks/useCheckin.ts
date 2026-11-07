import { useCallback, useEffect, useState } from 'react';
import { CheckinAnswer, CheckinState, showCheckin } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

// Today's check-in: whether to show the card, and saving or skipping it. Any failure just
// hides the card: it's optional, and never in the way.
export function useCheckin() {
  const [state, setState] = useState<CheckinState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.resolve()
        .then(() => tracker.getCheckinState())
        .then(setState)
        .catch(() => setState(null)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (answer: CheckinAnswer) => {
    setProblem(null);
    try {
      await tracker.saveCheckin(answer, 'tap');
      await load();
    } catch {
      setProblem("That didn't save. Try again, or skip it for today.");
    }
  };

  const skip = async () => {
    // Hidden at once; the server remembers it for the day.
    setState((current) => (current ? { ...current, skipped_today: true } : current));
    await Promise.resolve()
      .then(() => tracker.skipCheckin())
      .catch(() => {});
  };

  const answerOffer = async (keep: boolean) => {
    setState((current) => (current ? { ...current, ask_to_turn_off: false, time: keep ? current.time : 'off' } : current));
    await Promise.resolve()
      .then(() => tracker.answerCheckinOffer(keep))
      .catch(() => {});
  };

  return {
    state,
    visible: showCheckin(state),
    askToTurnOff: !!state?.ask_to_turn_off && state.time !== 'off',
    problem,
    save,
    skip,
    answerOffer,
    reload: load,
  };
}
