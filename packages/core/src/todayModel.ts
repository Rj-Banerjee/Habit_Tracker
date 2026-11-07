import { CompletedHabit, HabitLevel, LevelOption, TimeOfDay, TodayRow } from './api';
import { partialDetail } from './amounts';
import { HabitCardStatus } from './habitCardStatus';

export interface IdentityGroup {
  identityId: string;
  name: string;
  rows: TodayRow[];
}

export const isWeekly = (row: TodayRow) => row.frequency === 'per_week';
export const weekMet = (row: TodayRow) =>
  isWeekly(row) && (row.week_quota ?? 0) > 0 && (row.week_done ?? 0) >= (row.week_quota ?? 0);

// "This week: 2 of 4", or done for the week. When the quota is still reachable but tight,
// a calm hint instead: "2 more this week, 3 days left".
export function weekLine(row: TodayRow): string | undefined {
  if (!isWeekly(row) || !row.week_quota) return undefined;
  const done = row.week_done ?? 0;
  if (done >= row.week_quota) return 'Done for this week';
  const needed = row.week_quota - done;
  const left = row.week_days_left ?? 0;
  if (left >= needed && left <= needed + 1) {
    return `${needed} more this week, ${left} ${left === 1 ? 'day' : 'days'} left`;
  }
  return `This week: ${done} of ${row.week_quota}`;
}

export const streakUnit = (row: TodayRow): 'day' | 'week' => (isWeekly(row) ? 'week' : 'day');

export function cardStatus(row: TodayRow): HabitCardStatus {
  // Met for the week, it shows as done until Monday; another session can still be logged.
  if (weekMet(row) && row.status !== 'done') return 'done';
  switch (row.status) {
    case 'done':
      return row.level_done === 'full' ? 'done' : 'doneMinimum';
    case 'repaired':
      return 'repaired';
    case 'skipped':
      return 'skipped';
    case 'protected':
      return 'protected';
    case 'missed':
      return 'missed';
    default:
      return row.is_today ? 'due' : 'open';
  }
}

export const isLogged = (row: TodayRow) => row.status === 'done' || row.status === 'repaired';

export function groupByIdentity(rows: TodayRow[]): IdentityGroup[] {
  const groups = new Map<string, IdentityGroup>();
  for (const row of rows) {
    const group = groups.get(row.identity_id);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(row.identity_id, {
        identityId: row.identity_id,
        name: row.identity_name,
        rows: [row],
      });
    }
  }
  return [...groups.values()];
}

export interface TimeGroup {
  time: TimeOfDay;
  name: string;
  rows: TodayRow[];
}

const TIME_ORDER: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];
const TIME_NAMES: Record<TimeOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  anytime: 'Anytime',
};

// Today's sections: Morning, Afternoon, Evening, then Anytime, each in reminder order with
// unreminded habits after. Empty sections are left out. Identity shows by colour instead.
export function groupByTimeOfDay(rows: TodayRow[]): TimeGroup[] {
  const minutes = (row: TodayRow) => {
    if (!row.reminder_time) return Number.POSITIVE_INFINITY;
    const [h, m] = row.reminder_time.split(':').map(Number);
    return h * 60 + m;
  };
  return TIME_ORDER.map((time) => ({
    time,
    name: TIME_NAMES[time],
    rows: rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => (row.time_of_day ?? 'anytime') === time)
      .sort((a, b) => minutes(a.row) - minutes(b.row) || a.index - b.index)
      .map(({ row }) => row),
  })).filter((group) => group.rows.length > 0);
}

export const timeOfDayName = (time: TimeOfDay) => TIME_NAMES[time];

export function levelTarget(row: TodayRow, level: HabitLevel): number | null {
  const option = row.levels.find((l) => l.level === level);
  return option?.target ?? (level === 'full' ? row.target : null);
}

// The ladder to show. A habit with no levels set still offers the full version.
export function levelOptions(row: TodayRow): LevelOption[] {
  if (row.levels.length > 0) return row.levels;
  return [{ level: 'full', description: row.title, target: row.target }];
}

export function cardDetail(row: TodayRow): string | undefined {
  const week = weekLine(row);
  if (week) return week;
  if (row.skip_reason) {
    return row.skip_reason;
  }
  if (row.level_done) {
    return row.levels.find((l) => l.level === row.level_done)?.description;
  }
  const partial = partialDetail(row);
  if (partial) return partial;
  if (row.can_repair) {
    return 'Repair available';
  }
  if (row.target !== null && row.unit) {
    return `${row.target} ${row.unit}`;
  }
  return undefined;
}

// The label for a closed miss that can still be repaired, such as "Repair on Thu".
export function repairOnLabel(date: string): string {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`)
  );
  return `Repair on ${weekday}`;
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPart(hour: number): DayPart {
  if (hour < 12) return 'morning';
  return hour < 18 ? 'afternoon' : 'evening';
}

// Mornings lead with what can still be caught up from yesterday.
export const showYesterdayFirst = (part: DayPart) => part === 'morning';

export function eveningNote(rows: TodayRow[]): string | null {
  const left = rows.filter((row) => cardStatus(row) === 'due').length;
  if (left === 0) return null;
  const count = left === 1 ? '1 habit left' : `${left} habits left`;
  return `${count} today. A smaller version still counts.`;
}

export function repairDescription(row: TodayRow): string {
  if (row.repair_amount !== null) {
    return row.unit ? `Do ${row.repair_amount} ${row.unit} today` : `Do ${row.repair_amount} today`;
  }
  return 'Do the full version, plus the minimum version again';
}

export function progressLabel(rows: TodayRow[]): string {
  if (rows.length === 0) return '';
  const done = rows.filter((row) => isLogged(row) || weekMet(row)).length;
  return done === rows.length ? 'All done for today' : `${done} of ${rows.length} done`;
}

const GREETINGS: Record<DayPart, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
};

export const greeting = (part: DayPart) => GREETINGS[part];

// For Completed habits and the one-time celebration: how the run went, calmly.
export function completedSummary(habit: CompletedHabit): string {
  const days = `${habit.days_done} ${habit.days_done === 1 ? 'day' : 'days'} done`;
  const unit = habit.frequency === 'per_week' ? 'week' : 'day';
  const best = habit.best_streak > 0 ? `, best streak ${habit.best_streak} ${habit.best_streak === 1 ? unit : `${unit}s`}` : '';
  const total =
    habit.total_amount !== null && habit.total_amount > 0
      ? `, ${Math.round(habit.total_amount * 100) / 100}${habit.unit ? ` ${habit.unit}` : ''} in all`
      : '';
  return `${days}${best}${total}.`;
}

export const celebrationTip = (habitId: string) => `ended:${habitId}`;

export const celebrationText = (habit: CompletedHabit) =>
  `You finished ${habit.title}. ${completedSummary(habit)} That's worth a moment.`;
