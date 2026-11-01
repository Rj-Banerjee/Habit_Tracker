import { HabitLevel, LevelOption, TodayRow } from './api';
import { HabitCardStatus } from './habitCardStatus';

export interface IdentityGroup {
  identityId: string;
  name: string;
  rows: TodayRow[];
}

export function cardStatus(row: TodayRow): HabitCardStatus {
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
  if (row.skip_reason) {
    return row.skip_reason;
  }
  if (row.level_done) {
    return row.levels.find((l) => l.level === row.level_done)?.description;
  }
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
  const done = rows.filter(isLogged).length;
  return done === rows.length ? 'All done for today' : `${done} of ${rows.length} done`;
}

const GREETINGS: Record<DayPart, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
};

export const greeting = (part: DayPart) => GREETINGS[part];
