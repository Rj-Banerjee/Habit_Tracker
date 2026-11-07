import { useCallback, useEffect, useRef, useState } from 'react';
import { HABIT_TIP, shouldShowHabitTip } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

// The one gentle tip past 6 habits. It's remembered on the server, so it shows once on
// every device. Rechecked when Today reloads, which happens after a habit is added,
// until it has been seen.
export function useHabitTip(reloaded: unknown) {
  const [show, setShow] = useState(false);
  const seen = useRef(false);

  useEffect(() => {
    if (seen.current) return;
    let current = true;
    Promise.resolve()
      .then(() => Promise.all([tracker.getProfile(), tracker.countActiveHabits()]))
      .then(([profile, active]) => {
        if (!current) return;
        if (profile.seen_tips?.includes(HABIT_TIP)) seen.current = true;
        setShow(shouldShowHabitTip(active, profile.seen_tips));
      })
      // A tip isn't worth an error message: say nothing.
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [reloaded]);

  const dismiss = useCallback(() => {
    seen.current = true;
    setShow(false);
    tracker.markTipSeen(HABIT_TIP).catch(() => {});
  }, []);

  return { show, dismiss };
}
