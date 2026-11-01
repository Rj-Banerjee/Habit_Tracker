import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTrackerApi } from './api';

const rpc = vi.fn();
const api = createTrackerApi({ rpc } as unknown as SupabaseClient);

describe('createTrackerApi', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [], error: null });
  });

  it('logs through the rule-checked function', async () => {
    await api.logHabit('h1', '2026-11-01', 'minimum', 2);
    expect(rpc).toHaveBeenCalledWith('log_habit', {
      p_habit_id: 'h1',
      p_date: '2026-11-01',
      p_level: 'minimum',
      p_amount: 2,
    });
  });

  it('repairs a yes/no habit with the full and minimum versions', async () => {
    await api.repairHabit('h1', '2026-11-01', null);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_full_and_minimum: true, p_amount: null });
  });

  it('repairs a count habit with an amount', async () => {
    await api.repairHabit('h1', '2026-11-01', 8);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_full_and_minimum: false, p_amount: 8 });
  });

  it('applies defaults when creating a habit', async () => {
    await api.createHabit({ identityId: 'i1', title: 'Read', levels: [] });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_type: 'boolean',
      p_schedule_days: [1, 2, 3, 4, 5, 6, 7],
      p_voice_aliases: [],
    });
  });

  it('leaves out fields that are not being changed', async () => {
    await api.updateHabit('h1', { title: 'New' });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_title: 'New', p_target: null, p_levels: null });
  });

  it('turns a server refusal into an error with its message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'That day has not happened yet' } });
    await expect(api.logHabit('h1', '2030-01-01')).rejects.toThrow('That day has not happened yet');
  });

  it('unwraps the single allowance row', async () => {
    rpc.mockResolvedValue({ data: [{ allowed: 3, active: 2, can_add: true }], error: null });
    await expect(api.getHabitAllowance()).resolves.toEqual({ allowed: 3, active: 2, can_add: true });
  });
});
