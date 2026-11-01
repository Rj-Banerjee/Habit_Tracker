begin;
select plan(13);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.test');

insert into public.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.test');

insert into public.daily_habits (id, user_id, title) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'A habit'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'B habit');

insert into public.daily_logs (id, habit_id, date, is_completed) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-11-01', true);

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

-- Signed-out visitors can't reach anything.
set local role anon;
select throws_ok('select * from public.daily_habits', '42501', null, 'anon cannot read habits');
select throws_ok('select * from public.daily_logs', '42501', null, 'anon cannot read logs');
select throws_ok('select * from public.users', '42501', null, 'anon cannot read users');
select throws_ok(
  $$insert into public.daily_habits (id, user_id, title) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'x')$$,
  '42501', null, 'anon cannot write habits'
);
reset role;

-- A signed-in user sees and changes only their own rows.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}';

select is((select count(*)::int from public.daily_habits), 1, 'user A sees one habit');
select is((select title from public.daily_habits), 'A habit', 'and it is their own');
select is((select count(*)::int from public.daily_logs), 0, 'user A sees no logs of user B');
select is((select count(*)::int from public.users), 1, 'user A sees only their own profile');

select throws_ok(
  $$insert into public.daily_habits (id, user_id, title) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'forged')$$,
  '42501', null, 'user A cannot create a habit for user B'
);
select throws_ok(
  $$insert into public.daily_logs (id, habit_id, date, is_completed) values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-11-02', true)$$,
  '42501', null, 'user A cannot log against user B''s habit'
);

delete from public.daily_habits where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
reset role;
select is(
  (select count(*)::int from public.daily_habits where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1,
  'user A cannot delete user B''s habit'
);

select * from finish();
rollback;
