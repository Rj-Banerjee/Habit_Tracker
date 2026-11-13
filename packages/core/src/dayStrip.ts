import { TimeOfDay, TodayRow } from './api';
import { addDays, isoWeekday } from './dates';
import { groupByTimeOfDay, TIMES_IN_ORDER } from './todayModel';

// The strip of days across the top of Today, and the time-of-day chips under it.

// How far the strip reaches, matching what get_day will load.
export const STRIP_DAYS_BACK = 7;
export const STRIP_DAYS_AHEAD = 7;

export interface StripDay {
  day: string;
  // "SUN".
  weekday: string;
  // 13.
  date: number;
  isToday: boolean;
  selected: boolean;
  // Within the week either side of today that get_day will load. The rest of the first
  // and last week is there to fill them out, dimmed.
  inReach: boolean;
}

const utc = (day: string) => new Date(`${day}T00:00:00Z`);
const format = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(utc(day));

export const inStrip = (today: string, day: string) =>
  day >= addDays(today, -STRIP_DAYS_BACK) && day <= addDays(today, STRIP_DAYS_AHEAD);

// Monday to Sunday, the weeks that hold a week either side of today: last week, this
// week and next week, oldest first, so swiping right goes back a week.
export function stripWeeks(today: string, selected: string): StripDay[][] {
  const first = addDays(today, -STRIP_DAYS_BACK);
  const monday = addDays(first, 1 - isoWeekday(first));
  const last = addDays(today, STRIP_DAYS_AHEAD);
  const weeks: StripDay[][] = [];
  for (let start = monday; start <= last; start = addDays(start, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(start, i);
        return {
          day,
          weekday: format(day, { weekday: 'short' }).toUpperCase(),
          date: utc(day).getUTCDate(),
          isToday: day === today,
          selected: day === selected,
          inReach: inStrip(today, day),
        };
      })
    );
  }
  return weeks;
}

// Which of the weeks holds a day, so the strip opens on it.
export const weekOf = (weeks: StripDay[][], day: string) =>
  Math.max(0, weeks.findIndex((week) => week.some((d) => d.day === day)));

// "TODAY" over "Thursday, Nov 13"; another day is "NOV 11" over "Tuesday".
export function dayHeading(today: string, selected: string): { title: string; subtitle: string } {
  const weekday = format(selected, { weekday: 'long' });
  const named: Record<string, string> = {
    [today]: 'Today',
    [addDays(today, -1)]: 'Yesterday',
    [addDays(today, 1)]: 'Tomorrow',
  };
  const short = format(selected, { month: 'short', day: 'numeric' });
  const name = named[selected];
  return name
    ? { title: name.toUpperCase(), subtitle: `${weekday}, ${short}` }
    : { title: short.toUpperCase(), subtitle: weekday };
}

// No chip for anytime: those habits are under ALL, with everything else.
export type TimeFilter = 'all' | Exclude<TimeOfDay, 'anytime'>;
export const TIME_FILTERS: TimeFilter[] = ['all', 'morning', 'afternoon', 'evening'];

export const timeFilterLabel = (filter: TimeFilter) => filter.toUpperCase();

// The cards under a chip, in the order Today has always used: by part of the day, then
// where each was dragged to, then by reminder.
export function filterByTime(rows: TodayRow[], filter: TimeFilter): TodayRow[] {
  return groupByTimeOfDay(rows)
    .filter((group) => filter === 'all' || group.time === filter)
    .flatMap((group) => group.rows);
}
