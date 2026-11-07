import { describe, expect, it } from 'vitest';
import { RepairRow, TodayRow } from './api';
import { coachCard } from './coachCard';

const row = (title: string, status = 'pending') =>
  ({ habit_id: title, title, status, is_today: true, day: '2026-11-02' }) as TodayRow;
const repair = { habit_id: 'h1', title: 'Run' } as RepairRow;

describe('coachCard', () => {
  it('has nothing to say without habits', () => {
    expect(coachCard([], [], 'morning')).toBeNull();
  });

  it('puts a repair first', () => {
    expect(coachCard([row('Read')], [repair], 'morning')?.id).toBe('repair-h1');
  });

  it('suggests a first step', () => {
    expect(coachCard([row('Read')], [], 'morning')?.text).toContain('Read');
  });

  it('points to the small version in the evening', () => {
    expect(coachCard([row('Read', 'done'), row('Run')], [], 'evening')?.text).toBe(
      'Run is still open. The small version counts.'
    );
  });

  it('says so when everything is done', () => {
    expect(coachCard([row('Read', 'done')], [], 'morning')?.id).toBe('all-done');
  });

  it('opens a miss review for a slip', () => {
    expect(coachCard([row('Read')], [repair], 'morning')?.opens).toBe('miss');
  });

  it('offers the Sunday Review on a Sunday', () => {
    const sunday = { ...row('Read'), day: '2026-11-08' };
    expect(coachCard([sunday], [], 'evening')?.opens).toBe('sunday');
  });

  it("leads the Sunday card with the week's report once it has loaded", () => {
    const sunday = { ...row('Read'), day: '2026-11-08' };
    expect(coachCard([sunday], [], 'evening', '80% done this week. Ready to look back?')?.text).toBe(
      '80% done this week. Ready to look back?'
    );
    expect(coachCard([sunday], [], 'evening')?.text).toBe('Your week is ready to look back on.');
  });

  it('puts a slip ahead of the Sunday Review', () => {
    const sunday = { ...row('Read'), day: '2026-11-08' };
    expect(coachCard([sunday], [repair], 'evening')?.opens).toBe('miss');
  });

  it('never talks about failure', () => {
    const text = coachCard([], [repair], 'evening')?.text ?? '';
    expect(text).not.toMatch(/fail|broke|lost/i);
  });
});
