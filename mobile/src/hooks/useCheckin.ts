import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CheckinAnswer, CheckinState, showCheckin } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

// The last day the check-in popped up, so it slides up once a day at most.
export const CHECKIN_POPUP_KEY = 'checkin-popup-shown';

// Today's check-in: whether to pop it up, and saving or skipping it. Any failure just
// hides it: it's optional, and never in the way.
export function useCheckin() {
  const [state, setState] = useState<CheckinState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Undefined until read, so it never flashes up on a day it was already shown.
  const [shownOn, setShownOn] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    Promise.resolve()
      .then(() => AsyncStorage.getItem(CHECKIN_POPUP_KEY))
      .then((day) => setShownOn(day ?? null))
      .catch(() => setShownOn(null));
  }, []);

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

  const visible = showCheckin(state);

  // Once it has popped up and been closed, answered or not, it waits for tomorrow.
  const dismissPopup = () => {
    if (!state) return;
    setShownOn(state.today);
    void Promise.resolve()
      .then(() => AsyncStorage.setItem(CHECKIN_POPUP_KEY, state.today))
      .catch(() => {});
  };

  const save = async (answer: CheckinAnswer) => {
    setProblem(null);
    try {
      await tracker.saveCheckin(answer, 'tap');
      // A part answer (just energy) still counts: the pop-up doesn't come back for the rest.
      dismissPopup();
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

  const askToTurnOff = !!state?.ask_to_turn_off && state.time !== 'off';

  return {
    state,
    visible,
    // The turn-it-off question is asked on Today instead, never on top of it.
    popupDue: visible && !askToTurnOff && shownOn !== undefined && shownOn !== state?.today,
    dismissPopup,
    askToTurnOff,
    problem,
    save,
    skip,
    answerOffer,
    reload: load,
  };
}
