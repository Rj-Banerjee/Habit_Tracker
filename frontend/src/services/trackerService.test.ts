import { describe, expect, it, vi, beforeEach } from 'vitest';

const calls: Array<{ op: string; args: unknown[] }> = [];

vi.mock('./supabase', () => {
  const chain = () => {
    const result = { data: [], error: null };
    const builder: Record<string, unknown> = {};
    for (const op of ['from', 'select', 'upsert', 'delete', 'eq', 'is', 'gte', 'lte', 'order']) {
      builder[op] = (...args: unknown[]) => {
        calls.push({ op, args });
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => void) => resolve(result);
    return builder;
  };
  return { supabase: { from: (...args: unknown[]) => (chain().from as (...a: unknown[]) => unknown)(...args) } };
});

import { trackerService } from './trackerService';

describe('trackerService', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('limits logs to the selected month, including short months', async () => {
    await trackerService.listHabits(2026, 2);
    expect(calls).toContainEqual({ op: 'gte', args: ['habit_logs.date', '2026-02-01'] });
    expect(calls).toContainEqual({ op: 'lte', args: ['habit_logs.date', '2026-02-28'] });
  });

  it('marks a day done as one row per habit per day', async () => {
    await trackerService.setLog('habit-1', '2026-11-01', true);
    expect(calls).toContainEqual({
      op: 'upsert',
      args: [
        { habit_id: 'habit-1', date: '2026-11-01', status: 'done', level_done: 'full' },
        { onConflict: 'habit_id,date' },
      ],
    });
  });

  it('removes the row when a day is unchecked, so missed stays computed', async () => {
    await trackerService.setLog('habit-1', '2026-11-01', false);
    expect(calls.map((c) => c.op)).toContain('delete');
    expect(calls).toContainEqual({ op: 'eq', args: ['date', '2026-11-01'] });
  });
});
