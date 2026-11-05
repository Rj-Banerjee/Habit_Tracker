import type { SupabaseClient } from '@supabase/supabase-js';

// Waits this long after a change, so one sentence that undoes three habits reloads once.
export const LIVE_SETTLE_MS = 400;

// Calls onChange whenever a log changes on any device: the widget, a notification, voice
// or the web. It listens to activity_events rather than habit_logs, because every log
// change writes one there, and inserts are filtered by row-level security where deletes
// aren't. Returns a function that stops listening.
export function watchActivity(client: SupabaseClient, onChange: () => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let channel: ReturnType<SupabaseClient['channel']> | null = null;

  const settle = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!stopped) onChange();
    }, LIVE_SETTLE_MS);
  };

  void client.auth.getSession().then(async ({ data }) => {
    const session = data.session;
    if (stopped || !session) return;
    const userId = session.user.id;
    // supabase-js hands Realtime the token without waiting, so a channel opened right
    // after sign-in can join as nobody and hear nothing. Refreshes still flow through it.
    await client.realtime.setAuth(session.access_token);
    if (stopped) return;
    channel = client
      .channel(`activity:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_events',
          filter: `user_id=eq.${userId}`,
        },
        settle
      )
      .subscribe();
  });

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (channel) void client.removeChannel(channel);
  };
}
