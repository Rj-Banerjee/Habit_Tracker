import { describe, expect, it } from 'vitest';
import { RangeHabit } from './api';
import {
  addDays,
  canChangeDay,
  dayCellStatus,
  dayLabel,
  dayName,
  dayNumber,
  groupHabits,
  localDate,
  monthDates,
  monthLabel,
  scrollEdges,
  shiftMonth,
  weekCompletion,
  weekDates,
  weekLabel,
  weekStart,
} from './dates';

describe('dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('uses the profile timezone for today', () => {
    const moment = new Date('2026-11-01T19:00:00Z');
    expect(localDate('Asia/Kolkata', moment)).toBe('2026-11-02');
    expect(localDate('America/Los_Angeles', moment)).toBe('2026-11-01');
  });

  it.each([
    ['2026-11-02', '2026-11-02'],
    ['2026-11-04', '2026-11-02'],
    ['2026-11-08', '2026-11-02'],
    ['2026-11-01', '2026-10-26'],
  ])('finds the Monday of the week of %s', (date, monday) => {
    expect(weekStart(date)).toBe(monday);
  });

  it('lists a week', () => {
    const days = weekDates('2026-11-02');
    expect(days).toHaveLength(7);
    expect(days[6]).toBe('2026-11-08');
  });

  it('lists a month, including leap years', () => {
    expect(monthDates(2026, 2)).toHaveLength(28);
    expect(monthDates(2028, 2)).toHaveLength(29);
    expect(monthDates(2026, 11)[29]).toBe('2026-11-30');
  });

  it('steps across year boundaries', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('labels days and periods', () => {
    expect(monthLabel(2026, 11)).toBe('November 2026');
    expect(dayName('2026-11-02')).toBe('Mon');
    expect(dayNumber('2026-11-02')).toBe(2);
    expect(dayLabel('2026-11-02')).toBe('Mon, 2 Nov');
    expect(weekLabel('2026-11-02')).toBe('Week of 2 Nov');
  });
});

describe('dayCellStatus', () => {
  const today = '2026-11-10';

  it.each([
    [undefined, null, '2026-11-09', null],
    ['unscheduled', null, '2026-11-09', null],
    ['pending', null, '2026-11-11', null],
    ['pending', null, today, 'due'],
    ['pending', null, '2026-11-09', 'open'],
    ['done', 'full', '2026-11-09', 'done'],
    ['done', 'minimum', '2026-11-09', 'doneMinimum'],
    ['done', 'setup', '2026-11-09', 'doneMinimum'],
    ['skipped', null, '2026-11-09', 'skipped'],
    ['missed', null, '2026-11-08', 'missed'],
    ['repaired', null, '2026-11-08', 'repaired'],
    ['protected', null, '2026-11-08', 'protected'],
  ] as const)('maps %s at level %s on %s to %s', (status, level, date, expected) => {
    expect(dayCellStatus(status, level, date, today)).toBe(expected);
  });
});

describe('canChangeDay', () => {
  it.each([
    ['2026-11-10', true],
    ['2026-11-09', true],
    ['2026-11-08', false],
    ['2026-11-11', false],
  ])('on %s is %s', (date, expected) => {
    expect(canChangeDay(date, '2026-11-10')).toBe(expected);
  });
});

describe('scrollEdges', () => {
  it.each([
    ['everything fits', 0, 1200, 1116, false, false],
    ['at the start', 0, 976, 1116, false, true],
    ['in the middle', 70, 976, 1116, true, true],
    ['at the end', 140, 976, 1116, true, false],
  ])('%s', (_name, offset, view, content, before, after) => {
    expect(scrollEdges(offset, view, content)).toEqual({ before, after });
  });
});

describe('weekCompletion', () => {
  it('counts every logged state, and leaves out days not scheduled', () => {
    expect(weekCompletion(['done', 'doneMinimum', 'repaired', 'skipped', null, 'missed', null])).toBe(
      '3 of 5 days'
    );
  });

  it('does not count a protected day as done', () => {
    expect(weekCompletion(['protected'])).toBe('0 of 1 day');
  });
});

describe('groupHabits', () => {
  it('groups by identity', () => {
    const habit = (id: string, identity: string) =>
      ({
        id,
        identity_id: identity,
        title: id,
        identities: { name: identity, colour_token: 'identity-1' },
        habit_levels: [],
        habit_logs: [],
      }) as RangeHabit;
    const groups = groupHabits([habit('a', 'x'), habit('b', 'y'), habit('c', 'x')]);
    expect(groups.map((g) => g.habits.map((h) => h.id))).toEqual([['a', 'c'], ['b']]);
  });
});
