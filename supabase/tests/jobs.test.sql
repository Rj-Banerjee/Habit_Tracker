begin;
select no_plan();

-- One person in Kolkata (UTC+5:30) with two daily habits.
insert into auth.users (id, email) values
  ('77777777-7777-4777-8777-777777777777', 'jobs@example.test'),
  ('88888888-8888-4888-8888-888888888888', 'other@example.test');
update public.users set timezone = 'Asia/Kolkata', tone = 'direct' where id = '77777777-7777-4777-8777-777777777777';

insert into public.identities (id, user_id, name, why_text) values
  ('f0000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', 'Reader', 'To think better');
insert into public.habits (id, identity_id, title, starts_on) values
  ('f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'Read', '2026-10-01'),
  ('f0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001', 'Stretch', '2026-10-01');

-- ---------------------------------------------------------------------------
-- Only the AI service can run the job functions
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.job_due_nudges(timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.job_letter_context(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.job_claim(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.job_push_tokens(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.job_due_nudges(timestamptz)', 'execute'),
  'job functions are for the service role only'
);
select ok(
  not has_function_privilege('authenticated', 'tracker.call_job(text)', 'execute'),
  'and so is calling a job'
);

-- ---------------------------------------------------------------------------
-- Claims make a job safe to run twice
-- ---------------------------------------------------------------------------
select is(public.job_claim('letters', 'u1:2026-11-02'), true, 'the first run claims the work');
select is(public.job_claim('letters', 'u1:2026-11-02'), false, 'a repeat run skips it');
select public.job_release('letters', 'u1:2026-11-02');
select is(public.job_claim('letters', 'u1:2026-11-02'), true, 'a failed run gives the claim back');

-- ---------------------------------------------------------------------------
-- Nightly patterns
-- ---------------------------------------------------------------------------
insert into public.habit_logs (habit_id, date, status, level_done, logged_at) values
  ('f0000000-0000-4000-8000-000000000002', '2026-10-20', 'done', 'full', '2026-10-20 19:10+05:30');
select ok(public.job_rebuild_patterns('2026-11-08 22:00+00') >= 2, 'every person gets a snapshot');
select public.job_rebuild_patterns('2026-11-08 22:00+00');
select is(
  (select count(*)::int from public.pattern_snapshots where user_id = '77777777-7777-4777-8777-777777777777'),
  1, 'running it again replaces, never duplicates'
);
select is(
  (select best_hours from public.pattern_snapshots where user_id = '77777777-7777-4777-8777-777777777777'),
  '[19]'::jsonb, 'with the best hour in their own time'
);
select is(
  (select computed_on from public.pattern_snapshots where user_id = '77777777-7777-4777-8777-777777777777'),
  '2026-11-09'::date, 'dated by their own calendar'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "88888888-8888-4888-8888-888888888888", "role": "authenticated"}';
select is(
  (select count(*)::int from public.pattern_snapshots where user_id = '77777777-7777-4777-8777-777777777777'),
  0, 'nobody else can read a snapshot'
);
reset role;

-- ---------------------------------------------------------------------------
-- Sunday letters, by each person's clock
-- ---------------------------------------------------------------------------
-- 13:00 UTC on Sunday 8 Nov is 18:30 in Kolkata.
select is(
  (select week_start from public.job_letter_candidates('2026-11-08 13:00+00', 18)
    where user_id = '77777777-7777-4777-8777-777777777777'),
  '2026-11-02'::date, 'Sunday evening in their timezone: due a letter for the week that began Monday'
);
select is(
  (select count(*)::int from public.job_letter_candidates('2026-11-08 04:00+00', 18)
    where user_id = '77777777-7777-4777-8777-777777777777'),
  0, 'not on Sunday morning'
);
select is(
  (select count(*)::int from public.job_letter_candidates('2026-11-07 13:00+00', 18)
    where user_id = '77777777-7777-4777-8777-777777777777'),
  0, 'not on Saturday'
);
insert into public.reflections (user_id, week_start, wins, mood_line) values
  ('77777777-7777-4777-8777-777777777777', '2026-11-02', '{"Read every day"}', 'Calm');
select is(
  (select public.job_letter_context('77777777-7777-4777-8777-777777777777', '2026-11-02')
     -> 'wins' ->> 0),
  'Read every day', 'the letter is written from their own Sunday Review'
);
select is(
  (select public.job_letter_context('77777777-7777-4777-8777-777777777777', '2026-11-02') ->> 'tone'),
  'direct', 'in their chosen tone'
);
select is(
  (select jsonb_array_length(public.job_letter_context('77777777-7777-4777-8777-777777777777', '2026-11-02') -> 'identities')),
  1, 'with their identities'
);
insert into public.coach_events (user_id, kind, payload, outcome) values
  ('77777777-7777-4777-8777-777777777777', 'letter', '{"week_start": "2026-11-02"}', 'written');
select is(
  (select count(*)::int from public.job_letter_candidates('2026-11-08 14:00+00', 18)
    where user_id = '77777777-7777-4777-8777-777777777777'),
  0, 'one letter a week, however often the job runs'
);

-- ---------------------------------------------------------------------------
-- The daily reminder
-- ---------------------------------------------------------------------------
update public.users set reminder_time = '07:30' where id = '77777777-7777-4777-8777-777777777777';
-- 02:05 UTC is 07:35 in Kolkata.
select is(
  (select local_day from public.job_due_reminders('2026-11-10 02:05+00')
    where user_id = '77777777-7777-4777-8777-777777777777'),
  '2026-11-10'::date, 'due in its 15-minute window'
);
select is(
  (select count(*)::int from public.job_due_reminders('2026-11-10 02:20+00')
    where user_id = '77777777-7777-4777-8777-777777777777'),
  0, 'not after it'
);
insert into public.habit_logs (habit_id, date, status, level_done, logged_at) values
  ('f0000000-0000-4000-8000-000000000002', '2026-11-11', 'done', 'full', '2026-11-11 06:00+05:30'),
  ('f0000000-0000-4000-8000-000000000003', '2026-11-11', 'done', 'full', '2026-11-11 06:00+05:30');
select is(
  (select count(*)::int from public.job_due_reminders('2026-11-11 02:05+00')
    where user_id = '77777777-7777-4777-8777-777777777777'),
  0, 'not when everything is already done'
);
insert into public.coach_events (user_id, kind, payload, outcome) values
  ('77777777-7777-4777-8777-777777777777', 'reminder', '{"date": "2026-11-10"}', 'sent');
select is(
  (select count(*)::int from public.job_due_reminders('2026-11-10 02:10+00')
    where user_id = '77777777-7777-4777-8777-777777777777'),
  0, 'and only once a day'
);

-- ---------------------------------------------------------------------------
-- Preemptive nudges
-- ---------------------------------------------------------------------------
-- Read: done at about 19:10 on most days in the last two weeks, missed on some.
delete from public.habit_logs where habit_id = 'f0000000-0000-4000-8000-000000000002';
insert into public.habit_logs (habit_id, date, status, level_done, logged_at)
select 'f0000000-0000-4000-8000-000000000002', d::date, 'done', 'full', (d::date + time '19:10') at time zone 'Asia/Kolkata'
from generate_series('2026-10-27'::date, '2026-11-11'::date, interval '1 day') d
where extract(day from d)::int % 4 <> 0;
-- Stretch: done every day, so it's never at risk.
insert into public.habit_logs (habit_id, date, status, level_done, logged_at)
select 'f0000000-0000-4000-8000-000000000003', d::date, 'done', 'full', (d::date + time '07:00') at time zone 'Asia/Kolkata'
from generate_series('2026-10-27'::date, '2026-11-10'::date, interval '1 day') d;

-- 13:05 UTC on 12 Nov is 18:35 in Kolkata: 25 minutes before Read's usual 19:00 hour.
select is(
  (select title from public.job_due_nudges('2026-11-12 13:05+00')
    where user_id = '77777777-7777-4777-8777-777777777777'),
  'Read', 'nudges the habit at risk, 30 minutes before its usual time'
);
select ok(
  (select rate from public.job_due_nudges('2026-11-12 13:05+00')
    where user_id = '77777777-7777-4777-8777-777777777777') < 0.9,
  'because it is under 90% over the last 14 days'
);
select is(
  (select usual_hour from public.job_due_nudges('2026-11-12 13:05+00')
    where user_id = '77777777-7777-4777-8777-777777777777'),
  19, 'and says when it usually happens'
);
select is(
  (select count(*)::int from public.job_due_nudges('2026-11-12 12:30+00')
    where user_id = '77777777-7777-4777-8777-777777777777'),
  0, 'not too early'
);
update public.users set reminder_time = '18:00' where id = '77777777-7777-4777-8777-777777777777';
select is(
  (select count(*)::int from public.job_due_nudges('2026-11-12 13:05+00')
    where user_id = '77777777-7777-4777-8777-777777777777'),
  0, 'not within an hour of the daily reminder'
);
update public.users set reminder_time = '07:30' where id = '77777777-7777-4777-8777-777777777777';

insert into public.coach_events (user_id, kind, payload, outcome, sent_at)
select '77777777-7777-4777-8777-777777777777', 'nudge',
       jsonb_build_object('habit_id', 'f0000000-0000-4000-8000-000000000002', 'date', d::date),
       'ignored', d
from generate_series('2026-11-01'::timestamptz, '2026-11-03'::timestamptz, interval '1 day') d;
select is(
  (select count(*)::int from public.job_due_nudges('2026-11-12 13:05+00')
    where user_id = '77777777-7777-4777-8777-777777777777'),
  0, 'not after 3 ignored in a row'
);
insert into public.coach_events (user_id, kind, payload, outcome, sent_at) values
  ('77777777-7777-4777-8777-777777777777', 'nudge',
   '{"habit_id": "f0000000-0000-4000-8000-000000000002", "date": "2026-11-04"}', 'logged', '2026-11-04');
select is(
  (select title from public.job_due_nudges('2026-11-12 13:05+00')
    where user_id = '77777777-7777-4777-8777-777777777777'),
  'Read', 'and back once one helps'
);
insert into public.coach_events (user_id, kind, payload, outcome) values
  ('77777777-7777-4777-8777-777777777777', 'nudge',
   '{"habit_id": "f0000000-0000-4000-8000-000000000002", "date": "2026-11-12"}', 'sent');
select is(
  (select count(*)::int from public.job_due_nudges('2026-11-12 13:10+00')
    where user_id = '77777777-7777-4777-8777-777777777777'),
  0, 'at most one a day'
);

-- ---------------------------------------------------------------------------
-- Push tokens are each person's own
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "77777777-7777-4777-8777-777777777777", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.push_tokens (token, user_id, platform) values ('ExponentPushToken[abc]', '77777777-7777-4777-8777-777777777777', 'android') $$,
  'a phone saves its own push token'
);
select throws_ok(
  $$ insert into public.push_tokens (token, user_id, platform) values ('ExponentPushToken[evil]', '88888888-8888-4888-8888-888888888888', 'android') $$,
  '42501', null, 'but never one for someone else'
);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "88888888-8888-4888-8888-888888888888", "role": "authenticated"}';
select is((select count(*)::int from public.push_tokens), 0, 'and nobody else can read it');
reset role;
select is(
  (select array_agg(t) from public.job_push_tokens('77777777-7777-4777-8777-777777777777') t),
  array['ExponentPushToken[abc]'], 'the service finds it to send a push'
);

-- ---------------------------------------------------------------------------
-- The schedules
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(jobname order by jobname) from cron.job where jobname like 'ai-%'),
  array['ai-nightly-insights', 'ai-nightly-patterns', 'ai-reminders-and-nudges', 'ai-sunday-letters'],
  'all four jobs are scheduled'
);
select is(tracker.call_job('nightly-patterns'), null, 'and they do nothing until the AI service is hosted');

select * from finish();
rollback;
