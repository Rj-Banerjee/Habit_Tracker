begin;
select no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-1111-4111-8111-111111111111', 'plans@example.test');
insert into public.identities (id, user_id, name) values
  ('aaaaaaaa-2222-4222-8222-222222222222', 'aaaaaaaa-1111-4111-8111-111111111111', 'Reader');

-- ---------------------------------------------------------------------------
-- Plans: everyone starts on Free, and only the server can change it
-- ---------------------------------------------------------------------------
select is(
  (select plan::text from public.users where id = 'aaaaaaaa-1111-4111-8111-111111111111'),
  'free', 'a new account is on Free'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-1111-4111-8111-111111111111", "role": "authenticated"}';
select is(
  (select plan::text from public.users where id = 'aaaaaaaa-1111-4111-8111-111111111111'),
  'free', 'people can read their own plan'
);
select throws_ok(
  $$ update public.users set plan = 'pro' where id = 'aaaaaaaa-1111-4111-8111-111111111111' $$,
  '42501', null, 'but can never give themselves Pro'
);
select lives_ok(
  $$ update public.users set tone = 'direct' where id = 'aaaaaaaa-1111-4111-8111-111111111111' $$,
  'while the settings they own still change'
);
reset role;

-- ---------------------------------------------------------------------------
-- The history a game layer replays
-- ---------------------------------------------------------------------------
insert into public.habits (id, identity_id, title, type, target, unit) values
  ('aaaaaaaa-3333-4333-8333-333333333333', 'aaaaaaaa-2222-4222-8222-222222222222', 'Read', 'count', 20, 'pages');
select is(
  (select payload ->> 'identity_id' from public.activity_events
    where kind = 'habit_created' and subject_id = 'aaaaaaaa-3333-4333-8333-333333333333'),
  'aaaaaaaa-2222-4222-8222-222222222222', 'a new habit records when it began, and in which identity'
);
select is(
  (select payload ->> 'type' from public.activity_events
    where kind = 'habit_created' and subject_id = 'aaaaaaaa-3333-4333-8333-333333333333'),
  'count', 'and what kind of habit it is'
);

select tracker.log_habit(
  'aaaaaaaa-1111-4111-8111-111111111111', 'aaaaaaaa-3333-4333-8333-333333333333',
  tracker.local_date('aaaaaaaa-1111-4111-8111-111111111111', now()), 'minimum', 5, 'voice', now()
);
select is(
  (select payload ->> 'identity_id' || '/' || (payload ->> 'level') || '/' || actor
     from public.activity_events where kind = 'log_created' and subject_id = 'aaaaaaaa-3333-4333-8333-333333333333'),
  'aaaaaaaa-2222-4222-8222-222222222222/minimum/ai_assisted',
  'each log records its identity, Shrink level and who did it'
);

update public.habits set archived_at = now() where id = 'aaaaaaaa-3333-4333-8333-333333333333';
update public.habits set archived_at = null where id = 'aaaaaaaa-3333-4333-8333-333333333333';
select is(
  (select array_agg(kind order by kind) from public.activity_events
    where subject_id = 'aaaaaaaa-3333-4333-8333-333333333333' and kind like 'habit_%'),
  array['habit_archived', 'habit_created', 'habit_restored'],
  'archiving and restoring are recorded'
);
update public.habits set title = 'Read more' where id = 'aaaaaaaa-3333-4333-8333-333333333333';
select is(
  (select count(*)::int from public.activity_events
    where subject_id = 'aaaaaaaa-3333-4333-8333-333333333333' and kind like 'habit_%'),
  3, 'a rename adds nothing'
);

select * from finish();
rollback;
