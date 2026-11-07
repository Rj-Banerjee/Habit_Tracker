import { useEffect, useState } from 'react';
import { addDays, localDate, ProgressDay, timeOfDayMove, TodayRow } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

const HISTORY_DAYS = 30;

// Pro: offers to move a habit to the part of the day it's actually done in, from peak
// hours. It moves only if they accept; a "Keep" is remembered on the server.
export function useTimeSuggestion(rows: TodayRow[], enabled: boolean) {
  const [days, setDays] = useState<ProgressDay[]>([]);
  const [kept, setKept] = useState<string[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const today = localDate(Intl.DateTimeFormat().resolvedOptions().timeZone);
    let current = true;
    Promise.resolve()
      .then(() => Promise.all([tracker.getHabitDays(addDays(today, -HISTORY_DAYS), today), tracker.getProfile()]))
      .then(([history, profile]) => {
        if (!current) return;
        setDays(history);
        setKept(profile.seen_tips ?? []);
      })
      // A suggestion isn't worth an error message.
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [enabled]);

  const move = enabled && kept !== null ? timeOfDayMove(rows, days, kept) : null;

  const keep = () => {
    if (!move) return;
    setKept((current) => [...(current ?? []), move.tip]);
    tracker.markTipSeen(move.tip).catch(() => {});
  };

  return { move, keep };
}
