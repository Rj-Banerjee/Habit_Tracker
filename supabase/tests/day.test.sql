begin;
select no_plan();

-- Any day of the week strip: get_day.
insert into auth.users (id, email) values
  ('77777777-7777-4777-8777-777777777777', 'strip@example.test'),
  ('88888888-8888-4888-8888-888888888888', 'other@example.test');
insert into public.identities (id, user_id, name) values
  ('f0000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', 'Reader');
insert into public.habits (id, identity_id, title, starts_on, schedule_days) values
  ('f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'Read',
   tracker.local_date('77777777-7777-4777-8777-777777777777', now()) - 10, '{1,2,3,4,5,6,7}');
insert into public.habit_levels (habit_id, level, description) values
  ('f0000000-0000-4000-8000-000000000002', 'full', 'A chapter');

create temp table d as
  select tracker.local_date('77777777-7777-4777-8777-777777777777', now()) as today;
grant select on d to authenticated;

select tracker.log_habit(
  '77777777-7777-4777-8777-777777777777', 'f0000000-0000-4000-8000-000000000002',
  (select today - 1 from d), 'full', null, 'tap', now()
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "77777777-7777-4777-8777-777777777777", "role": "authenticated"}';

select is(
  (select row(is_today, status, can_change)::text from public.get_day((select today from d))),
  '(t,pending,t)',
  'today: due, and can be logged'
);
select is(
  (select row(is_today, status, can_change)::text from public.get_day((select today - 1 from d))),
  '(f,done,t)',
  'yesterday: shows its log, and can still be changed in the back-log window'
);
select is(
  (select row(status, can_change)::text from public.get_day((select today - 5 from d))),
  '(missed,f)',
  'a week back: missed, and past its window'
);
select is(
  (select row(status, can_change)::text from public.get_day((select today + 2 from d))),
  '(pending,f)',
  'a day ahead: scheduled, but not loggable yet'
);
select throws_ok(
  $$ select * from public.get_day((select today - 8 from d)) $$,
  'Pick a day within a week of today'
);
select throws_ok(
  $$ select * from public.get_day((select today + 8 from d)) $$,
  'Pick a day within a week of today'
);
select is(
  (select count(*)::int from public.get_day((select today - 3 from d))),
  1,
  'one habit on a past day'
);
reset role;

-- Someone else's strip is empty.
set local role authenticated;
set local request.jwt.claims = '{"sub": "88888888-8888-4888-8888-888888888888", "role": "authenticated"}';
select is((select count(*)::int from public.get_day((select today - 1 from d))), 0, 'a stranger sees none of it');
reset role;

-- Signed out, it can't be called at all.
set local role anon;
select throws_like($$ select * from public.get_day(current_date) $$, '%permission denied%');
reset role;

select * from finish();
rollback;
