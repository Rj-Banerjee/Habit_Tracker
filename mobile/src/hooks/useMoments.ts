import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Moment, momentKey, planMoments } from '@habit-tracker/core';
import { HabitChain } from './useChains';

const SEEN_KEY = 'seen-chain-moments';

// undefined while loading, null on a fresh install, so history never plays.
type Seen = Set<string> | null | undefined;

export interface PlayingMoment {
  moment: Moment;
  // Once finished it stays on screen in its end state, with its caption.
  finished: boolean;
  interrupted: boolean;
}

// Decides which fracture, weld or Grace Day moment to play, once each, and remembers it.
export function useMoments(chains: HabitChain[], ready: boolean) {
  const [seen, setSeen] = useState<Seen>(undefined);
  const seenRef = useRef<Set<string> | null>(null);
  const [playing, setPlaying] = useState<Record<string, PlayingMoment>>({});
  const [welcomeBack, setWelcomeBack] = useState<Moment[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((saved) => setSeen(saved ? new Set(JSON.parse(saved) as string[]) : null))
      // If it can't remember, it could replay forever, so it plays nothing.
      .catch(() => setSeen(null));
  }, []);

  const remember = useCallback((keys: string[]) => {
    // The first look always saves, even with nothing in it, so it's only first once.
    if (keys.length === 0 && seenRef.current !== null) return;
    const next = new Set([...(seenRef.current ?? []), ...keys]);
    seenRef.current = next;
    setSeen(next);
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...next])).catch(() => {});
  }, []);

  useEffect(() => {
    if (seen === undefined || !ready) return;
    // The ref holds what remember() has added since the state was read.
    const plan = planMoments(chains, seenRef.current ?? seen);
    // Marked as seen as soon as it starts, so it never plays twice.
    remember([...plan.quiet, ...plan.play.map(momentKey)]);
    if (plan.play.length > 0) {
      setPlaying((current) => {
        const next = { ...current };
        for (const moment of plan.play) {
          next[moment.habitId] = { moment, finished: false, interrupted: false };
        }
        return next;
      });
    }
    if (plan.welcomeBack.length > 0) setWelcomeBack(plan.welcomeBack);
    // Re-planned only when the chains change, not when `seen` is updated by remember().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chains, ready, seen === undefined]);

  const finish = useCallback((habitId: string) => {
    setPlaying((current) =>
      current[habitId] ? { ...current, [habitId]: { ...current[habitId], finished: true } } : current
    );
  }, []);

  // A tap or a log mid-way jumps the moment to its end.
  const interrupt = useCallback((habitId: string) => {
    setPlaying((current) =>
      current[habitId] && !current[habitId].finished
        ? { ...current, [habitId]: { ...current[habitId], interrupted: true } }
        : current
    );
  }, []);

  const dismissWelcomeBack = useCallback(() => {
    remember(welcomeBack.map(momentKey));
    setWelcomeBack([]);
  }, [remember, welcomeBack]);

  return { playing, welcomeBack, finish, interrupt, dismissWelcomeBack };
}
