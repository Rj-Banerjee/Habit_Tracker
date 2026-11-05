import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LIVE_SETTLE_MS, watchActivity } from './live';

function fakeClient(userId: string | null = 'u1') {
  let handler: (() => void) | null = null;
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, callback: () => void) => {
      handler = callback;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: userId ? { user: { id: userId }, access_token: 'token-1' } : null },
      })),
    },
    realtime: { setAuth: vi.fn(async () => {}) },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
  };
  return {
    client: client as unknown as SupabaseClient,
    raw: client,
    channel,
    fire: () => handler?.(),
  };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('watchActivity', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("listens only to the signed-in person's new activity", async () => {
    const { client, raw, channel } = fakeClient();
    watchActivity(client, vi.fn());
    await flush();
    expect(raw.channel).toHaveBeenCalledWith('activity:u1');
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'activity_events', filter: 'user_id=eq.u1' },
      expect.any(Function)
    );
    expect(channel.subscribe).toHaveBeenCalled();
  });

  it("joins with the person's token, so row-level security lets their events through", async () => {
    const { client, raw } = fakeClient();
    watchActivity(client, vi.fn());
    await flush();
    expect(raw.realtime.setAuth).toHaveBeenCalledWith('token-1');
    expect(raw.realtime.setAuth.mock.invocationCallOrder[0]).toBeLessThan(
      raw.channel.mock.invocationCallOrder[0]
    );
  });

  it('reloads once for a burst of changes', async () => {
    const { client, fire } = fakeClient();
    const onChange = vi.fn();
    watchActivity(client, onChange);
    await flush();
    fire();
    fire();
    fire();
    expect(onChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LIVE_SETTLE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does nothing when signed out', async () => {
    const { client, raw } = fakeClient(null);
    watchActivity(client, vi.fn());
    await flush();
    expect(raw.channel).not.toHaveBeenCalled();
  });

  it('stops listening, and drops a reload that was waiting', async () => {
    const { client, raw, fire } = fakeClient();
    const onChange = vi.fn();
    const stop = watchActivity(client, onChange);
    await flush();
    fire();
    stop();
    await vi.advanceTimersByTimeAsync(LIVE_SETTLE_MS);
    expect(onChange).not.toHaveBeenCalled();
    expect(raw.removeChannel).toHaveBeenCalled();
  });

  it('never subscribes if stopped before the session loads', async () => {
    const { client, raw } = fakeClient();
    const stop = watchActivity(client, vi.fn());
    stop();
    await flush();
    expect(raw.channel).not.toHaveBeenCalled();
  });
});
