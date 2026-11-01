begin;
select plan(30);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'a@example.test', '{"timezone": "Asia/Kolkata"}'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.test', '{"timezone": "Not/AZone"}');

select is(
  (select timezone from public.users where id = '11111111-1111-4111-8111-111111111111'),
  'Asia/Kolkata',
  'sign-up creates a profile with the supplied timezone'
);
select is(
  (select timezone from public.users where id = '22222222-2222-4222-8222-222222222222'),
  'UTC',
  'an invalid timezone at sign-up falls back to UTC'
);
select is(
  (select mode::text from public.users where id = '11111111-1111-4111-8111-111111111111'),
  'grace',
  'grace is the default mode'
);

insert into public.identities (id, user_id, name) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'The Athlete'),
  ('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'The Reader');

insert into public.habits (id, identity_id, title) values
  ('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'A habit'),
  ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'B habit');

insert into public.habit_levels (habit_id, level, description) values
  ('b0000000-0000-4000-8000-000000000002', 'full', 'Read 20 pages');

insert into public.habit_logs (habit_id, date, level_done, status) values
  ('b0000000-0000-4000-8000-000000000002', '2026-11-01', 'full', 'done');

insert into public.reflections (user_id, week_start) values
  ('22222222-2222-4222-8222-222222222222', '2026-10-26');

insert into public.grace_days (user_id) values
  ('22222222-2222-4222-8222-222222222222');

insert into public.coach_events (user_id, kind) values
  ('22222222-2222-4222-8222-222222222222', 'nudge');

select ok(
  (select bool_and(rowsecurity) from pg_tables where schemaname = 'public'),
  'every public table has RLS on'
);
select is(
  (select count(*)::int from pg_tables t where schemaname = 'public'
   and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)),
  0,
  'every public table has a policy'
);
select hasnt_table('public', 'weekly_habits', 'weekly habits are gone');
select hasnt_table('public', 'monthly_habits', 'monthly habits are gone');
select hasnt_table('public', 'daily_logs', 'the scaffold logs table is gone');

select throws_ok(
  $$insert into public.habit_logs (habit_id, date, status) values ('a0000000-0000-4000-8000-000000000002', '2026-11-01', 'missed')$$,
  '22P02', null, 'missed is not a status that can be stored'
);
select throws_ok(
  $$insert into public.habit_logs (habit_id, date, status) values ('a0000000-0000-4000-8000-000000000002', '2026-11-01', 'skipped')$$,
  '23514', null, 'a skip needs a reason'
);
select throws_ok(
  $$insert into public.habit_logs (habit_id, date, status) values ('a0000000-0000-4000-8000-000000000002', '2026-11-01', 'done')$$,
  '23514', null, 'a done log needs a level'
);
select throws_ok(
  $$update public.users set timezone = 'Mars/Base' where id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'an invalid timezone is rejected'
);

-- Signed-out visitors can't reach anything.
set local role anon;
select throws_ok('select * from public.users', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.habits', '42501', null, 'anon cannot read habits');
select throws_ok('select * from public.habit_logs', '42501', null, 'anon cannot read logs');
select throws_ok('select * from public.grace_days', '42501', null, 'anon cannot read Grace Days');
select throws_ok('select * from public.user_patterns', '42501', null, 'anon cannot read patterns');
reset role;

-- A signed-in user sees and changes only their own rows.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}';

select is((select count(*)::int from public.users), 1, 'user A sees only their own profile');
select is((select title from public.habits), 'A habit', 'user A sees only their own habit');
select is((select count(*)::int from public.habit_levels), 0, 'user A sees no levels of user B');
select is((select count(*)::int from public.habit_logs), 0, 'user A sees no logs of user B');
select is((select count(*)::int from public.grace_days), 0, 'user A sees no Grace Days of user B');
select is((select count(*)::int from public.reflections), 0, 'user A sees no reflections of user B');
select is((select count(*)::int from public.coach_events), 0, 'user A sees no coach events of user B');
select is((select count(*)::int from public.user_patterns), 1, 'user A sees only their own patterns');

select throws_ok(
  $$insert into public.habits (identity_id, title) values ('b0000000-0000-4000-8000-000000000001', 'forged')$$,
  '42501', null, 'user A cannot add a habit to user B''s identity'
);
select throws_ok(
  $$insert into public.habit_logs (habit_id, date, level_done, status) values ('b0000000-0000-4000-8000-000000000002', '2026-11-02', 'full', 'done')$$,
  '42501', null, 'user A cannot write to user B''s logs'
);
select throws_ok(
  $$update public.users set settled_through = '2030-01-01' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'clients cannot move the settlement date'
);
select throws_ok(
  $$insert into public.grace_days (user_id) values ('11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'clients cannot grant themselves Grace Days'
);

delete from public.habits where id = 'b0000000-0000-4000-8000-000000000002';
reset role;
select is(
  (select count(*)::int from public.habits where id = 'b0000000-0000-4000-8000-000000000002'),
  1,
  'user A cannot delete user B''s habit'
);

select * from finish();
rollback;
