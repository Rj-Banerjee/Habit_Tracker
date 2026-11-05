import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  graceWindow,
  ProgressDay,
  RepairRow,
  ruleToExplain,
  StreakRule,
  TodayRow,
} from '@habit-tracker/core';
import { tracker } from '../services/tracker';

const SEEN_KEY = 'seen-rules';
const ALL_RULES: StreakRule[] = ['grace', 'repair', 'skip', 'backlog'];

export function useRuleCard(rows: TodayRow[], repairs: RepairRow[], loading: boolean) {
  const [seen, setSeen] = useState<StreakRule[] | null>(null);
  const [days, setDays] = useState<ProgressDay[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((saved) => setSeen(saved ? (JSON.parse(saved) as StreakRule[]) : []))
      // If it can't remember, it could repeat forever, so it says nothing.
      .catch(() => setSeen(ALL_RULES));
  }, []);

  const needsGrace = seen !== null && !seen.includes('grace');
  const window = needsGrace ? graceWindow(rows) : null;
  const from = window?.from;
  const to = window?.to;

  useEffect(() => {
    if (!from || !to) return;
    Promise.resolve()
      .then(() => tracker.getHabitDays(from, to))
      .then(setDays)
      .catch(() => {});
  }, [from, to]);

  const rule = seen && !loading ? ruleToExplain(rows, repairs, days, seen) : null;

  const dismiss = useCallback(() => {
    if (!rule || !seen) return;
    const next = [...seen, rule];
    setSeen(next);
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next)).catch(() => {});
  }, [rule, seen]);

  return { rule, dismiss };
}
