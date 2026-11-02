import { describe, expect, it } from 'vitest';
import { ProgressDay, RepairRow, TodayRow } from './api';
import { graceWindow, ruleToExplain } from './ruleCards';

const row = (patch: Partial<TodayRow> = {}) =>
  ({ day: '2026-11-03', is_today: true, status: 'pending', can_repair: false, ...patch }) as TodayRow;
const protectedDay = { status: 'protected' } as ProgressDay;
const repair = {} as RepairRow;

describe('ruleToExplain', () => {
  it('stays quiet on an ordinary day', () => {
    expect(ruleToExplain([row()], [], [], [])).toBeNull();
  });

  it('explains each rule when it first comes up', () => {
    expect(ruleToExplain([row()], [], [protectedDay], [])).toBe('grace');
    expect(ruleToExplain([row()], [repair], [], [])).toBe('repair');
    expect(ruleToExplain([row({ can_repair: true })], [], [], [])).toBe('repair');
    expect(ruleToExplain([row({ status: 'skipped' })], [], [], [])).toBe('skip');
    expect(ruleToExplain([row({ is_today: false })], [], [], [])).toBe('backlog');
  });

  it('never explains a rule twice', () => {
    expect(ruleToExplain([row({ status: 'skipped' })], [], [], ['skip'])).toBeNull();
  });

  it('shows one card, then the next once that one is seen', () => {
    const rows = [row({ status: 'skipped' })];
    expect(ruleToExplain(rows, [repair], [protectedDay], [])).toBe('grace');
    expect(ruleToExplain(rows, [repair], [protectedDay], ['grace'])).toBe('repair');
    expect(ruleToExplain(rows, [repair], [protectedDay], ['grace', 'repair'])).toBe('skip');
  });

  it("doesn't explain the back-log for a day already logged", () => {
    expect(ruleToExplain([row({ is_today: false, status: 'done' })], [], [], [])).toBeNull();
  });
});

describe('graceWindow', () => {
  it('looks back from today', () => {
    expect(graceWindow([row()])).toEqual({ from: '2026-10-31', to: '2026-11-03' });
  });

  it('needs a today to look back from', () => {
    expect(graceWindow([])).toBeNull();
  });
});
