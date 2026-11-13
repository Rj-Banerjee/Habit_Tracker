import { describe, expect, it } from 'vitest';
import { TodayRow } from './api';
import { loggedPatch, patchRow, revertOf, rowKey, undonePatch, withPending } from './rowPatch';

const row = (habit_id: string, patch: Partial<TodayRow> = {}): TodayRow => ({
  day: '2026-11-12',
  is_today: false,
  habit_id,
  identity_id: 'i1',
  identity_name: 'Reader',
  colour_token: 'identity-1',
  title: habit_id,
  habit_type: 'checkbox',
  target: null,
  unit: null,
  status: 'pending',
  level_done: null,
  amount: null,
  skip_reason: null,
  current_streak: 2,
  levels: [],
  can_repair: false,
  repair_amount: null,
  ...patch,
});

describe('row patches', () => {
  it('ticks and unticks with the streak following', () => {
    expect(loggedPatch(row('a'), 'full')).toMatchObject({ status: 'done', level_done: 'full', current_streak: 3 });
    expect(undonePatch(row('a', { current_streak: 0 }))).toMatchObject({ status: 'pending', current_streak: 0 });
  });

  it('lays taps still saving over what the server sent', () => {
    const rows = [row('a'), row('b'), row('a', { day: '2026-11-13' })];
    const pending = new Map([[rowKey(rows[0]), loggedPatch(rows[0], 'full')]]);
    const shown = withPending(rows, pending);
    expect(shown.map((r) => r.status)).toEqual(['done', 'pending', 'pending']);
    expect(withPending(rows, new Map())).toBe(rows);
  });

  it('puts back only the fields a patch changed', () => {
    const before = row('a', { status: 'pending', amount: 4 });
    const patch = loggedPatch(before, 'full');
    expect(revertOf(before, patch)).toEqual({ status: 'pending', level_done: null, amount: 4, current_streak: 2 });
    const after = patchRow([before], before, patch);
    expect(patchRow(after, before, revertOf(before, patch))[0]).toEqual(before);
  });
});
