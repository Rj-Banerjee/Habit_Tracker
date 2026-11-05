begin;
select no_plan();

insert into auth.users (id, email) values
  ('55555555-5555-4555-8555-555555555555', 'owner@example.test'),
  ('66666666-6666-4666-8666-666666666666', 'stranger@example.test');

insert into public.identities (id, user_id, name) values
  ('e0000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555', 'Owner');
insert into public.habits (id, identity_id, title) values
  ('e0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'Private habit');
insert into public.habit_levels (habit_id, level, description) values
  ('e0000000-0000-4000-8000-000000000002', 'full', 'Secret');
insert into public.reflections (user_id, week_start, month_note) values
  ('55555555-5555-4555-8555-555555555555', '2026-10-26', 'Private note');
insert into public.coach_events (user_id, kind) values
  ('55555555-5555-4555-8555-555555555555', 'chat');
insert into public.grace_days (user_id) values
  ('55555555-5555-4555-8555-555555555555');

select tracker.log_habit(
  '55555555-5555-4555-8555-555555555555', 'e0000000-0000-4000-8000-000000000002',
  tracker.local_date('55555555-5555-4555-8555-555555555555', now()), 'full', null, 'tap', now()
);

-- ---------------------------------------------------------------------------
-- The database's own rules, for every table that exists now or is added later
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(array_agg(tablename::text order by tablename), '{}') from pg_tables
   where schemaname = 'public' and not rowsecurity),
  '{}'::text[],
  'every public table has RLS on'
);
select is(
  (select coalesce(array_agg(c.relname::text), '{}')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and has_table_privilege('anon', c.oid, 'select')),
  '{}'::text[],
  'signed-out visitors can read no table'
);
select is(
  (select coalesce(array_agg(tablename::text || '.' || policyname::text), '{}') from pg_policies
   where schemaname = 'public' and not (roles = '{authenticated}')),
  '{}'::text[],
  'every policy applies only to signed-in users'
);
select is(
  (select coalesce(array_agg(tablename::text || '.' || policyname::text), '{}') from pg_policies
   where schemaname = 'public' and (qual = 'true' or qual is null)),
  '{}'::text[],
  'no policy lets everyone read a table'
);
select is(
  (select coalesce(array_agg(c.relname::text), '{}')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce(c.reloptions::text[] @> array['security_invoker=true'], false)),
  '{}'::text[],
  'every view respects the reader''s RLS'
);
select ok(
  not has_schema_privilege('authenticated', 'tracker', 'usage')
    and not has_schema_privilege('anon', 'tracker', 'usage'),
  'clients cannot reach the private schema'
);

-- ---------------------------------------------------------------------------
-- A stranger sees none of the owner's personal data
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "66666666-6666-4666-8666-666666666666", "role": "authenticated"}';

select is((select count(*)::int from public.identities), 0, 'a stranger reads no identities');
select is((select count(*)::int from public.habits), 0, 'a stranger reads no habits');
select is((select count(*)::int from public.habit_levels), 0, 'a stranger reads no Shrink levels');
select is((select count(*)::int from public.habit_logs), 0, 'a stranger reads no logs');
select is((select count(*)::int from public.activity_events), 0, 'a stranger reads no activity events');
select is((select count(*)::int from public.reflections), 0, 'a stranger reads no reflections');
select is((select count(*)::int from public.coach_events), 0, 'a stranger reads no coach events');
select is((select count(*)::int from public.grace_days), 0, 'a stranger reads no Grace Days');
select is((select count(*)::int from public.users where id = '55555555-5555-4555-8555-555555555555'), 0, 'a stranger reads no profile');
select is((select count(*)::int from public.user_patterns where user_id = '55555555-5555-4555-8555-555555555555'), 0, 'a stranger reads no patterns');
select is((select count(*)::int from public.get_today()), 0, 'a stranger gets nothing from Today');
select is((select count(*)::int from public.get_streaks()), 0, 'a stranger gets no streaks');
select is((select count(*)::int from public.get_repairs()), 0, 'a stranger gets no repairs');
reset role;

-- The owner, by contrast, can read all of it.
set local role authenticated;
set local request.jwt.claims = '{"sub": "55555555-5555-4555-8555-555555555555", "role": "authenticated"}';
select is((select count(*)::int from public.habits), 1, 'the owner reads their habit');
select is((select count(*)::int from public.habit_logs), 1, 'and their log');
select is((select count(*)::int from public.activity_events), 1, 'and their activity event');
select is((select count(*)::int from public.reflections), 1, 'and their reflection');
select is((select count(*)::int from public.coach_events), 1, 'and their coach event');
reset role;

-- ---------------------------------------------------------------------------
-- Activity history
-- ---------------------------------------------------------------------------
select is(
  (select kind || '/' || (payload ->> 'status') || '/' || (payload ->> 'level') || '/' || source || '/' || actor
   from public.activity_events where user_id = '55555555-5555-4555-8555-555555555555'),
  'log_created/done/full/tap/user',
  'a log records what happened, where it came from and who did it'
);

select tracker.log_habit(
  '55555555-5555-4555-8555-555555555555', 'e0000000-0000-4000-8000-000000000002',
  tracker.local_date('55555555-5555-4555-8555-555555555555', now()), 'minimum', null, 'coach', now()
);
select is(
  (select kind || '/' || (payload ->> 'previous_level') || '/' || actor from public.activity_events
   where user_id = '55555555-5555-4555-8555-555555555555' and kind = 'log_changed'),
  'log_changed/full/ai_assisted',
  'a change records what it replaced, and a coach log is marked as AI assisted'
);

select tracker.undo_log(
  '55555555-5555-4555-8555-555555555555', 'e0000000-0000-4000-8000-000000000002',
  tracker.local_date('55555555-5555-4555-8555-555555555555', now()), now()
);
select is(
  (select count(*)::int from public.activity_events
   where user_id = '55555555-5555-4555-8555-555555555555' and kind = 'log_removed'),
  1, 'removing a log is recorded too'
);

-- Same transaction: if the log fails, no event survives.
create function pg_temp.failed_write() returns int language plpgsql as $$
declare
  n int;
begin
  begin
    perform tracker.log_habit(
      '55555555-5555-4555-8555-555555555555', 'e0000000-0000-4000-8000-000000000002',
      tracker.local_date('55555555-5555-4555-8555-555555555555', now()), 'setup', null, 'tap', now()
    );
    raise exception 'force a rollback';
  exception when others then
    null;
  end;
  select count(*)::int into n from public.activity_events
  where user_id = '55555555-5555-4555-8555-555555555555' and payload ->> 'level' = 'setup';
  return n;
end $$;
select is(pg_temp.failed_write(), 0, 'an event is written in the same transaction as its log');

select throws_like(
  $$ update public.activity_events set kind = 'tampered' $$,
  '%append-only%', 'activity events cannot be edited, even by the owner role'
);
select throws_like(
  $$ delete from public.activity_events $$,
  '%append-only%', 'activity events cannot be deleted'
);
select throws_like(
  $$ truncate public.activity_events $$,
  '%append-only%', 'activity events cannot be truncated'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "55555555-5555-4555-8555-555555555555", "role": "authenticated"}';
select throws_ok($$ insert into public.activity_events (user_id, kind) values ('55555555-5555-4555-8555-555555555555', 'forged') $$, '42501', null, 'clients cannot write activity events');
select throws_ok($$ update public.activity_events set kind = 'x' $$, '42501', null, 'clients cannot edit activity events');
select throws_ok($$ delete from public.activity_events $$, '42501', null, 'clients cannot delete activity events');
reset role;

delete from public.habits where id = 'e0000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.activity_events
   where user_id = '55555555-5555-4555-8555-555555555555' and kind = 'habit_deleted'),
  1, 'deleting a habit is recorded once'
);

-- ---------------------------------------------------------------------------
-- Tunnel Vision's focus events
-- ---------------------------------------------------------------------------
insert into public.habits (id, identity_id, title) values
  ('e0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000001', 'Focus habit');

set local role authenticated;
set local request.jwt.claims = '{"sub": "66666666-6666-4666-8666-666666666666", "role": "authenticated"}';
select throws_ok(
  $$ select public.record_focus('e0000000-0000-4000-8000-000000000009', 'focus.started', 1500) $$,
  'Habit not found',
  'a stranger cannot write focus events on someone else''s habit'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "55555555-5555-4555-8555-555555555555", "role": "authenticated"}';
select lives_ok(
  $$ select public.record_focus('e0000000-0000-4000-8000-000000000009', 'focus.started', 1500) $$,
  'the owner starts a focus session'
);
select lives_ok(
  $$ select public.record_focus('e0000000-0000-4000-8000-000000000009', 'focus.stopped', 1500, 600) $$,
  'and stops it early'
);
select is(
  (select string_agg(kind || ':' || (payload ->> 'planned_seconds') || ':' || coalesce(payload ->> 'elapsed_seconds', '-'), ',' order by occurred_at, kind)
     from public.activity_events where kind like 'focus.%'),
  'focus.started:1500:-,focus.stopped:1500:600',
  'both are in the owner''s activity history'
);
select throws_ok(
  $$ select public.record_focus('e0000000-0000-4000-8000-000000000009', 'focus.hacked', 1500) $$,
  'Unknown focus event',
  'only the three focus events are accepted'
);
select throws_ok(
  $$ select public.record_focus('e0000000-0000-4000-8000-000000000009', 'focus.started', 30) $$,
  'A focus session is between 1 minute and 4 hours',
  'a session has a sensible length'
);
select throws_ok(
  $$ select public.record_focus('e0000000-0000-4000-8000-000000000009', 'focus.completed', 1500, 99999) $$,
  'That focus time does not fit the session',
  'and a sensible elapsed time'
);
select throws_ok(
  $$ insert into public.activity_events (user_id, kind) values ('55555555-5555-4555-8555-555555555555', 'focus.started') $$,
  '42501', null,
  'the app still cannot write activity events directly'
);
reset role;

select throws_ok(
  $$ select tracker.record_focus('55555555-5555-4555-8555-555555555555', 'e0000000-0000-4000-8000-000000000009', 'focus.started', 1500, null, now())
     from generate_series(1, 200) $$,
  'Too many focus sessions today',
  'a script cannot flood the history'
);

set local role anon;
select throws_ok(
  $$ select public.record_focus('e0000000-0000-4000-8000-000000000009', 'focus.started', 1500) $$,
  '42501', null,
  'signed out, focus events are refused'
);
reset role;

-- An account's history goes with the account.
delete from auth.users where id = '55555555-5555-4555-8555-555555555555';
select is(
  (select count(*)::int from public.activity_events where user_id = '55555555-5555-4555-8555-555555555555'),
  0, 'deleting an account removes its activity history'
);

-- ---------------------------------------------------------------------------
-- Realtime sends only the activity history, never the tables behind it
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(array_agg(tablename::text order by tablename), '{}')
     from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'),
  array['activity_events'],
  'activity_events is the only public table sent over Realtime'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.activity_events'::regclass),
  true,
  'what Realtime sends is still checked by row-level security'
);

select * from finish();
rollback;
