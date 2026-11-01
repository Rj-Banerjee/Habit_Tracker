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
  return {
    supabase: {
      from: (...args: unknown[]) => (chain().from as (...a: unknown[]) => unknown)(...args),
      rpc: async (...args: unknown[]) => {
        calls.push({ op: 'rpc', args });
        return { data: [], error: null };
      },
    },
  };
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

  it('logs through the rule-checked API', async () => {
    await trackerService.setLog('habit-1', '2026-11-01', true);
    expect(calls).toContainEqual({
      op: 'rpc',
      args: ['log_habit', { p_habit_id: 'habit-1', p_date: '2026-11-01' }],
    });
  });

  it('removes a log through the API, so missed stays computed', async () => {
    await trackerService.setLog('habit-1', '2026-11-01', false);
    expect(calls).toContainEqual({
      op: 'rpc',
      args: ['undo_log', { p_habit_id: 'habit-1', p_date: '2026-11-01' }],
    });
  });

  it('never writes habit_logs directly', async () => {
    await trackerService.setLog('habit-1', '2026-11-01', true);
    await trackerService.setLog('habit-1', '2026-11-01', false);
    expect(calls.map((c) => c.op)).not.toContain('upsert');
    expect(calls.map((c) => c.op)).not.toContain('delete');
  });
});
