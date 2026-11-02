import { HabitLevel, RangeHabit } from './api';
import { HabitCardStatus } from './habitCardStatus';
import { IdentityToken } from './tokens';

// Dates are plain YYYY-MM-DD strings. Working in UTC keeps a day a day, whatever
// timezone the device is in.
const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const toKey = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const result = toUtc(date);
  result.setUTCDate(result.getUTCDate() + days);
  return toKey(result);
}

// Today in the timezone on the profile, which may differ from the device.
export function localDate(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Weeks start on Monday.
export function weekStart(date: string): string {
  const isoDay = toUtc(date).getUTCDay() || 7;
  return addDays(date, 1 - isoDay);
}

export const weekDates = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

export function monthDates(year: number, month: number): string[] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => addDays(first, i));
}

export function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

const format = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(toUtc(date));

export const monthLabel = (year: number, month: number) =>
  format(`${year}-${String(month).padStart(2, '0')}-01`, { month: 'long', year: 'numeric' });

export const dayName = (date: string) => format(date, { weekday: 'short' });
export const dayNumber = (date: string) => toUtc(date).getUTCDate();
export const dayLabel = (date: string) =>
  `${dayName(date)}, ${dayNumber(date)} ${format(date, { month: 'short' })}`;
export const shortDate = (date: string) => format(date, { day: 'numeric', month: 'short' });

export const weekLabel = (start: string) => `Week of ${format(start, { day: 'numeric', month: 'short' })}`;

// A grid cell's card state. Null means nothing to show: unscheduled or still to come.
export function dayCellStatus(
  status: string | undefined,
  level: HabitLevel | null | undefined,
  date: string,
  today: string
): HabitCardStatus | null {
  if (!status || status === 'unscheduled' || date > today) return null;
  switch (status) {
    case 'done':
      return level === 'full' || !level ? 'done' : 'doneMinimum';
    case 'pending':
      return date === today ? 'due' : 'open';
    default:
      return status as HabitCardStatus;
  }
}

// Today and yesterday can still change: yesterday's back-log window stays open
// until today ends. The server has the final word.
export const canChangeDay = (date: string, today: string) =>
  date >= addDays(today, -1) && date <= today;

// Whether a sideways-scrolling area has more to show on each side.
export function scrollEdges(offset: number, viewWidth: number, contentWidth: number) {
  return {
    before: offset > 1,
    after: offset + viewWidth < contentWidth - 1,
  };
}

export interface HabitGroup {
  identityId: string;
  name: string;
  colour: IdentityToken;
  habits: RangeHabit[];
}

export function groupHabits(habits: RangeHabit[]): HabitGroup[] {
  const groups = new Map<string, HabitGroup>();
  for (const habit of habits) {
    const group = groups.get(habit.identity_id);
    if (group) {
      group.habits.push(habit);
    } else {
      groups.set(habit.identity_id, {
        identityId: habit.identity_id,
        name: habit.identities.name,
        colour: habit.identities.colour_token,
        habits: [habit],
      });
    }
  }
  return [...groups.values()];
}

// "5 of 7 days" for the weekly review. Protected days don't count as done.
export function weekCompletion(statuses: Array<HabitCardStatus | null>): string {
  const scheduled = statuses.filter((status) => status !== null).length;
  const done = statuses.filter(
    (status) => status === 'done' || status === 'doneMinimum' || status === 'repaired'
  ).length;
  return `${done} of ${scheduled} ${scheduled === 1 ? 'day' : 'days'}`;
}
