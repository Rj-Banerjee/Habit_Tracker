import { ProgressDay, RepairRow, TodayRow } from './api';
import { addDays } from './dates';
import { cardStatus } from './todayModel';

export type StreakRule = 'grace' | 'repair' | 'skip' | 'backlog';

export const RULE_CARDS: Record<StreakRule, string> = {
  grace:
    'A Grace Day covered a missed day, so your streak is safe. You earn one for every 7 days in a row with everything done, and you can hold 3.',
  repair:
    'A missed day can be repaired. On the next scheduled day, do 1.5 times the target. For a yes/no habit, do the full version plus the minimum.',
  skip: 'A skip pauses your streak without breaking it. Each habit gets 2 skips in any 7 days.',
  backlog: 'Forgot to log yesterday? You have until 24 hours after midnight to add it.',
};

const GRACE_LOOKBACK_DAYS = 3;

// The days to read for a Grace Day, which leaves Today's list once its window closes.
export function graceWindow(rows: TodayRow[]): { from: string; to: string } | null {
  const today = rows.find((row) => row.is_today)?.day;
  return today ? { from: addDays(today, -GRACE_LOOKBACK_DAYS), to: today } : null;
}

// The first time each rule comes up, it's explained once. One card at a time, so Today
// stays calm: the rarest rule goes first, because it may not come up again soon.
export function ruleToExplain(
  rows: TodayRow[],
  repairs: RepairRow[],
  days: ProgressDay[],
  seen: StreakRule[]
): StreakRule | null {
  const happening: [StreakRule, boolean][] = [
    ['grace', days.some((day) => day.status === 'protected')],
    ['repair', repairs.length > 0 || rows.some((row) => row.can_repair)],
    ['skip', rows.some((row) => row.status === 'skipped')],
    ['backlog', rows.some((row) => cardStatus(row) === 'open')],
  ];
  return happening.find(([rule, now]) => now && !seen.includes(rule))?.[0] ?? null;
}
