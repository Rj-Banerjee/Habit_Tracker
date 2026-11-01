import { describe, expect, it } from 'vitest';
import { getMonthCalendar } from './dateUtils';

describe('getMonthCalendar', () => {
  it('uses the right number of days, including leap years', () => {
    expect(getMonthCalendar(2026, 11).daysInMonth).toBe(30);
    expect(getMonthCalendar(2026, 2).daysInMonth).toBe(28);
    expect(getMonthCalendar(2028, 2).daysInMonth).toBe(29);
  });

  it('builds zero-padded date keys', () => {
    const { days } = getMonthCalendar(2026, 3);
    expect(days[0].dateKey).toBe('2026-03-01');
    expect(days[30].dateKey).toBe('2026-03-31');
  });

  it('starts weekday letters on the correct day', () => {
    // 1 Nov 2026 is a Sunday.
    expect(getMonthCalendar(2026, 11).days[0].letter).toBe('S');
    // 2 Nov 2026 is a Monday.
    expect(getMonthCalendar(2026, 11).days[1].letter).toBe('M');
  });

  it('puts every day in exactly one week group', () => {
    const calendar = getMonthCalendar(2026, 12);
    const grouped = Object.values(calendar.weeks).flat();
    expect(grouped).toHaveLength(calendar.daysInMonth);
    expect(calendar.weeks[5].map((d) => d.day)).toEqual([29, 30, 31]);
  });
});
