begin;
select no_plan();

-- Fixtures. 2 Nov 2026 is a Monday.
create schema t;

create function t.u(n int) returns uuid language sql immutable as
  $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function t.h(n int) returns uuid language sql immutable as
  $$ select ('aaaaaaaa-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

create function t.make_user(n int, tz text default 'UTC', m public.streak_mode default 'grace')
returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (t.u(n), 'u' || n || '@example.test');
  update public.users set timezone = tz, mode = m where id = t.u(n);
  insert into public.identities (id, user_id, name)
  values (('bbbbbbbb-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, t.u(n), 'Identity');
end $$;

create function t.make_habit(
  n int, owner int, starts date,
  days smallint[] default '{1,2,3,4,5,6,7}',
  kind public.habit_type default 'boolean',
  goal numeric default null
) returns void language sql as $$
  insert into public.habits (id, identity_id, title, starts_on, schedule_days, type, target)
  values (t.h(n), ('bbbbbbbb-0000-4000-8000-' || lpad(owner::text, 12, '0'))::uuid, 'Habit ' || n, starts, days, kind, goal);
$$;

-- Noon on a local date for that user.
create function t.noon(owner int, d date) returns timestamptz language sql stable as
  $$ select (d + time '12:00') at time zone (select timezone from public.users where id = t.u(owner)) $$;

create function t.done(n int, a date, b date, lvl public.habit_level default 'full')
returns void language sql as $$
  insert into public.habit_logs (habit_id, date, level_done, status)
  select t.h(n), g::date, lvl, 'done'
  from generate_series(a, b, interval '1 day') g
  where tracker.is_scheduled(t.h(n), g::date);
$$;

create function t.skip(n int, d date, why text default 'sick') returns void language sql as
  $$ insert into public.habit_logs (habit_id, date, status, skip_reason) values (t.h(n), d, 'skipped', why) $$;

create function t.streak(n int, through date, at timestamptz) returns int language sql stable as
  $$ select (tracker.streak_stats(t.h(n), through, at)).current_streak $$;
create function t.longest(n int, through date, at timestamptz) returns int language sql stable as
  $$ select (tracker.streak_stats(t.h(n), through, at)).longest_streak $$;

-- ---------------------------------------------------------------------------
-- What counts
-- ---------------------------------------------------------------------------
select t.make_user(1);
select t.make_habit(1, 1, '2026-11-02');
select t.done(1, '2026-11-02', '2026-11-02', 'full');
select t.done(1, '2026-11-03', '2026-11-03', 'minimum');
select t.done(1, '2026-11-04', '2026-11-04', 'setup');
select is(t.streak(1, '2026-11-04', t.noon(1, '2026-11-04')), 3, 'full, minimum and setup all count');
select is(
  (select array_agg(level_done::text order by date) from public.habit_logs where habit_id = t.h(1)),
  array['full', 'minimum', 'setup'],
  'the level is stored so Progress can show it'
);
select is(
  (tracker.day_status(t.h(1), '2026-11-05', t.noon(1, '2026-11-05'))), 'pending',
  'today with no log is pending, not missed'
);
select is(t.streak(1, '2026-11-05', t.noon(1, '2026-11-05')), 3, 'an unlogged today does not reset the streak');

select t.make_user(2);
select t.make_habit(2, 2, '2026-11-02', '{1,4}');
select t.done(2, '2026-11-02', '2026-11-12');
select is(t.streak(2, '2026-11-12', t.noon(2, '2026-11-12')), 4, 'unscheduled days are ignored');
select is(
  tracker.day_status(t.h(2), '2026-11-03', t.noon(2, '2026-11-12')), 'unscheduled',
  'a day off the schedule is unscheduled'
);

select t.make_user(3);
select t.make_habit(3, 3, '2026-10-28');
select t.done(3, '2026-10-28', '2026-11-03');
select is(t.streak(3, '2026-11-03', t.noon(3, '2026-11-03')), 7, 'a streak carries across a month boundary');
select is(
  tracker.day_status(t.h(3), '2026-10-20', t.noon(3, '2026-11-03')), 'unscheduled',
  'days before the habit started are not misses'
);

-- ---------------------------------------------------------------------------
-- Day boundary and back-log
-- ---------------------------------------------------------------------------
select t.make_user(4, 'Asia/Kolkata');
select t.make_habit(4, 4, '2026-11-01');
select is(
  tracker.local_date(t.u(4), '2026-11-01 19:00+00'), '2026-11-02'::date,
  'the day ends at local midnight, not UTC midnight'
);
select is(
  tracker.window_closes_at(t.u(4), '2026-11-02'), '2026-11-03 18:30+00'::timestamptz,
  'back-log closes 24 hours after the local midnight ending the day'
);
select lives_ok(
  $$ select tracker.log_habit(t.u(4), t.h(4), '2026-11-02', 'full', null, 'tap', '2026-11-03 18:29:59+00') $$,
  'back-logging one second before the window closes works'
);
select is(
  (select count(*)::int from public.habit_logs where habit_id = t.h(4) and date = '2026-11-02'), 1,
  'and the log is saved'
);
select throws_like(
  $$ select tracker.log_habit(t.u(4), t.h(4), '2026-11-02', 'minimum', null, 'tap', '2026-11-03 18:30:00+00') $$,
  '%back-log window%', 'back-logging at the moment the window closes is refused'
);
select throws_like(
  $$ select tracker.log_habit(t.u(4), t.h(4), '2026-11-05', 'full', null, 'tap', '2026-11-03 18:00:00+00') $$,
  '%not happened yet%', 'future days cannot be logged'
);
select is(
  tracker.day_status(t.h(4), '2026-11-01', '2026-11-02 18:29:59+00'), 'pending',
  'an empty day is not missed one second before its window closes'
);
select is(
  tracker.day_status(t.h(4), '2026-11-01', '2026-11-02 18:30:00+00'), 'missed',
  'it becomes missed the moment the window closes'
);
select is(
  (select count(*)::int from public.habit_logs where habit_id = t.h(4) and date = '2026-11-01'), 0,
  'missed is computed: no row is stored for it'
);

select t.make_user(5, 'America/New_York');
select is(
  tracker.window_closes_at(t.u(5), '2026-10-31'), '2026-11-02 04:00+00'::timestamptz,
  'autumn clock change: the window is still exactly 24 hours'
);
select is(
  tracker.window_closes_at(t.u(5), '2026-03-07'), '2026-03-09 05:00+00'::timestamptz,
  'spring clock change: the window is still exactly 24 hours'
);

-- ---------------------------------------------------------------------------
-- Timezone changes
-- ---------------------------------------------------------------------------
select t.make_user(6, 'Asia/Kolkata');
select t.make_habit(6, 6, '2026-11-01');
select t.done(6, '2026-11-01', '2026-11-01');
select tracker.log_habit(t.u(6), t.h(6), '2026-11-02', 'full', null, 'tap', '2026-11-02 03:30+00');
update public.users set timezone = 'America/Los_Angeles' where id = t.u(6);
select is(
  tracker.local_date(t.u(6), '2026-11-02 03:30+00'), '2026-11-01'::date,
  'moving west can put today behind the last log'
);
select is(t.streak(6, '2026-11-02', '2026-11-02 03:30+00'), 2, 'moving west keeps the streak');
select lives_ok(
  $$ select tracker.log_habit(t.u(6), t.h(6), '2026-11-02', 'minimum', null, 'tap', '2026-11-02 20:00+00') $$,
  'logging the same date again after moving west is allowed'
);
select is(
  (select count(*)::int from public.habit_logs where habit_id = t.h(6) and date = '2026-11-02'), 1,
  'and does not create a second row for that day'
);
select is(t.streak(6, '2026-11-02', '2026-11-02 20:00+00'), 2, 'and does not double-count the day');

select t.make_user(7, 'America/Los_Angeles');
select t.make_habit(7, 7, '2026-11-01');
select t.done(7, '2026-11-01', '2026-11-02');
update public.users set timezone = 'Asia/Tokyo' where id = t.u(7);
select is(
  tracker.day_status(t.h(7), '2026-11-03', '2026-11-03 16:00+00'), 'pending',
  'moving east: the new local day is open, even though it started hours ago'
);
select is(t.streak(7, '2026-11-04', '2026-11-03 16:00+00'), 2, 'moving east keeps the streak');

select t.make_user(8, 'Asia/Tokyo');
select t.make_habit(8, 8, '2026-11-01');
select t.done(8, '2026-11-01', '2026-11-05');
select tracker.settle(t.u(8), '2026-11-08 00:00+00');
select is(
  (select settled_through from public.users where id = t.u(8)), '2026-11-06'::date,
  'days are settled up to the last closed day'
);
update public.users set timezone = 'Pacific/Honolulu' where id = t.u(8);
select tracker.settle(t.u(8), '2026-11-08 00:00+00');
select is(
  (select settled_through from public.users where id = t.u(8)), '2026-11-06'::date,
  'moving west never rolls the settled date back'
);

-- ---------------------------------------------------------------------------
-- Skips
-- ---------------------------------------------------------------------------
select t.make_user(9);
select t.make_habit(9, 9, '2026-11-02');
select t.done(9, '2026-11-02', '2026-11-03');
select tracker.skip_habit(t.u(9), t.h(9), '2026-11-04', 'sick', 'tap', t.noon(9, '2026-11-04'));
select t.done(9, '2026-11-05', '2026-11-05');
select is(tracker.day_status(t.h(9), '2026-11-04', t.noon(9, '2026-11-20')), 'skipped', 'a skip shows as skipped');
select is(t.streak(9, '2026-11-05', t.noon(9, '2026-11-20')) , 3, 'a skip pauses: it neither breaks nor adds');
select throws_like(
  $$ select tracker.skip_habit(t.u(9), t.h(9), '2026-11-05', '   ', 'tap', t.noon(9, '2026-11-05')) $$,
  '%needs a reason%', 'a skip needs a reason'
);

select t.make_user(10);
select t.make_habit(10, 10, '2026-11-02');
select t.done(10, '2026-11-02', '2026-11-02');
select t.skip(10, '2026-11-03');
select t.skip(10, '2026-11-04');
select t.skip(10, '2026-11-05');
select is(tracker.day_status(t.h(10), '2026-11-04', t.noon(10, '2026-11-20')), 'skipped', 'a 2nd skip in 7 days is fine');
select is(tracker.day_status(t.h(10), '2026-11-05', t.noon(10, '2026-11-20')), 'missed', 'a 3rd skip in 7 days is a miss');
select is(t.streak(10, '2026-11-05', t.noon(10, '2026-11-20')), 0, 'and breaks the streak with no Grace Day');

select t.make_user(11);
select t.make_habit(11, 11, '2026-11-02');
select t.done(11, '2026-11-02', '2026-11-20');
delete from public.habit_logs where habit_id = t.h(11) and date in ('2026-11-03', '2026-11-04', '2026-11-11');
select t.skip(11, '2026-11-03');
select t.skip(11, '2026-11-04');
select t.skip(11, '2026-11-11');
select is(tracker.day_status(t.h(11), '2026-11-11', t.noon(11, '2026-11-25')), 'skipped', 'the 7-day skip limit is rolling');

-- ---------------------------------------------------------------------------
-- Grace Days: earning
-- ---------------------------------------------------------------------------
select t.make_user(12);
select t.make_habit(12, 12, '2026-11-02');
select t.done(12, '2026-11-02', '2026-11-07');
select tracker.settle(t.u(12), '2026-11-20 00:00+00');
select is(tracker.grace_bank(t.u(12)), 0, 'six complete days earn nothing');

select t.make_user(13);
select t.make_habit(13, 13, '2026-11-02');
select t.done(13, '2026-11-02', '2026-11-08');
select tracker.settle(t.u(13), '2026-11-10 00:00+00');
select is(tracker.grace_bank(t.u(13)), 1, 'seven complete days earn one Grace Day');

select t.make_user(14);
select t.make_habit(14, 14, '2026-11-02');
select t.done(14, '2026-11-02', '2026-11-04', 'setup');
select t.done(14, '2026-11-05', '2026-11-08', 'minimum');
select tracker.settle(t.u(14), '2026-11-10 00:00+00');
select is(tracker.grace_bank(t.u(14)), 1, 'any Shrink level counts toward earning');

select t.make_user(15);
select t.make_habit(15, 15, '2026-11-02', '{1,4}');
select t.done(15, '2026-11-02', '2026-11-23');
select tracker.settle(t.u(15), '2026-11-25 00:00+00');
select is(tracker.grace_bank(t.u(15)), 1, 'seven scheduled days are counted, not calendar days');

select t.make_user(16);
select t.make_habit(16, 16, '2026-11-02');
select t.done(16, '2026-11-02', '2026-11-07');
select t.skip(16, '2026-11-08');
select tracker.settle(t.u(16), '2026-11-10 00:00+00');
select is(tracker.grace_bank(t.u(16)), 0, 'a skip does not add to the 7-day count');
select t.done(16, '2026-11-09', '2026-11-09');
select tracker.settle(t.u(16), '2026-11-11 00:00+00');
select is(tracker.grace_bank(t.u(16)), 1, 'a skip does not reset the 7-day count either');

select t.make_user(17);
select t.make_habit(17, 17, '2026-11-02');
select t.done(17, '2026-11-02', '2026-11-07');
select t.done(17, '2026-11-09', '2026-11-14');
select tracker.settle(t.u(17), '2026-11-30 00:00+00');
select is(tracker.grace_bank(t.u(17)), 0, 'a miss resets the 7-day count');

select t.make_user(18);
select t.make_habit(18, 18, '2026-11-02');
select t.make_habit(19, 18, '2026-11-02');
select t.done(18, '2026-11-02', '2026-11-08');
select t.done(19, '2026-11-02', '2026-11-07');
select tracker.settle(t.u(18), '2026-11-20 00:00+00');
select is(tracker.grace_bank(t.u(18)), 0, 'every due habit must be completed on each of the 7 days');

select t.make_user(19);
select t.make_habit(20, 19, '2026-10-01');
select t.done(20, '2026-10-01', '2026-11-05');
select tracker.settle(t.u(19), '2026-11-07 00:00+00');
select is(tracker.grace_bank(t.u(19)), 3, 'the bank holds a maximum of 3');

select t.make_user(20);
select t.make_habit(21, 20, '2026-11-02');
select t.done(21, '2026-11-02', '2026-11-08');
select tracker.settle(t.u(20), '2026-11-10 00:00+00');
select tracker.settle(t.u(20), '2026-11-10 00:00+00');
select is(tracker.grace_bank(t.u(20)), 1, 'settling twice does not earn twice');

-- ---------------------------------------------------------------------------
-- Grace Days: spending
-- ---------------------------------------------------------------------------
select t.make_user(21);
select t.make_habit(22, 21, '2026-11-02');
select t.done(22, '2026-11-02', '2026-11-08');
select t.done(22, '2026-11-10', '2026-11-11');
select tracker.settle(t.u(21), '2026-11-20 00:00+00');
select is(tracker.grace_bank(t.u(21)), 0, 'the Grace Day is spent automatically on the first miss');
select is(
  (select spent_for_date from public.grace_days where user_id = t.u(21)), '2026-11-09'::date,
  'and is recorded against the missed day'
);
select is(tracker.day_status(t.h(22), '2026-11-09', '2026-11-20 00:00+00'), 'protected', 'a covered miss shows as protected, not done');
select is(t.streak(22, '2026-11-11', '2026-11-20 00:00+00'), 9, 'a protected day keeps the streak alive but adds nothing');

select t.make_user(22);
select t.make_habit(23, 22, '2026-11-02');
select t.done(23, '2026-11-02', '2026-11-08');
select t.done(23, '2026-11-11', '2026-11-11');
select tracker.settle(t.u(22), '2026-11-20 00:00+00');
select is(tracker.day_status(t.h(23), '2026-11-09', '2026-11-20 00:00+00'), 'protected', 'the first of two misses uses the only Grace Day');
select is(tracker.day_status(t.h(23), '2026-11-10', '2026-11-20 00:00+00'), 'missed', 'the second has nothing left to cover it');
select is(t.streak(23, '2026-11-11', '2026-11-20 00:00+00'), 1, 'so the streak breaks');

select t.make_user(23);
select t.make_habit(24, 23, '2026-11-02');
insert into public.grace_days (user_id) values (t.u(23));
select tracker.settle(t.u(23), '2026-11-04 00:00+00');
select is(tracker.grace_bank(t.u(23)), 1, 'a Grace Day is not spent when there is no streak to protect');

select t.make_user(24);
select t.make_habit(25, 24, '2026-11-02');
select t.make_habit(26, 24, '2026-11-02');
select t.done(25, '2026-11-02', '2026-11-02');
select t.done(26, '2026-11-02', '2026-11-02');
insert into public.grace_days (user_id) values (t.u(24));
select tracker.settle(t.u(24), '2026-11-05 00:00+00');
select is(
  (select count(*)::int from public.grace_days where user_id = t.u(24) and spent_for_date is not null), 1,
  'two misses on one day with one Grace Day spend only that one'
);
select is(
  tracker.day_status(t.h(25), '2026-11-03', '2026-11-05 00:00+00') || '/' || tracker.day_status(t.h(26), '2026-11-03', '2026-11-05 00:00+00'),
  'protected/missed', 'and it covers the older habit first'
);

-- A 3rd skip covered by a Grace Day.
select t.make_user(25);
select t.make_habit(27, 25, '2026-11-02');
select t.done(27, '2026-11-02', '2026-11-08');
select t.skip(27, '2026-11-09');
select t.skip(27, '2026-11-10');
select t.skip(27, '2026-11-11');
select t.done(27, '2026-11-12', '2026-11-12');
select tracker.settle(t.u(25), '2026-11-20 00:00+00');
select is(tracker.day_status(t.h(27), '2026-11-11', '2026-11-20 00:00+00'), 'protected', 'a Grace Day covers a 3rd skip');
select is(t.streak(27, '2026-11-12', '2026-11-20 00:00+00'), 8, 'and the streak survives it');

-- ---------------------------------------------------------------------------
-- Streak Repair
-- ---------------------------------------------------------------------------
-- A Mon/Thu habit repaired across the gap.
select t.make_user(26);
select t.make_habit(28, 26, '2026-10-26', '{1,4}');
select t.done(28, '2026-10-26', '2026-10-29');
select is(tracker.previous_scheduled_day(t.h(28), '2026-11-05'), '2026-11-02'::date, 'Thursday''s previous scheduled day is Monday');
select is(t.streak(28, '2026-11-02', t.noon(26, '2026-11-05')), 0, 'the Monday miss breaks the streak');
select lives_ok(
  $$ select tracker.repair_habit(t.u(26), t.h(28), '2026-11-05', null, true, 'tap', t.noon(26, '2026-11-05')) $$,
  'a Monday miss on a Mon/Thu habit can be repaired on Thursday'
);
select is(tracker.day_status(t.h(28), '2026-11-02', t.noon(26, '2026-11-05')), 'repaired', 'Monday now shows as repaired');
select is(t.streak(28, '2026-11-05', t.noon(26, '2026-11-05')), 4, 'a repaired day counts toward the streak');

-- Two misses in a row.
select t.make_user(27);
select t.make_habit(29, 27, '2026-11-02');
select t.done(29, '2026-11-02', '2026-11-02');
select throws_like(
  $$ select tracker.repair_habit(t.u(27), t.h(29), '2026-11-05', null, true, 'tap', t.noon(27, '2026-11-05')) $$,
  '%Two misses in a row%', 'two misses in a row cannot be repaired'
);
select is(
  (select count(*)::int from public.habit_logs where habit_id = t.h(29)), 1,
  'and a refused repair writes nothing'
);

-- Next scheduled day only, and only the most recent miss.
select t.make_user(28);
select t.make_habit(30, 28, '2026-10-26', '{1,4}');
select t.done(30, '2026-10-26', '2026-10-29');
select t.done(30, '2026-11-05', '2026-11-05');
select throws_like(
  $$ select tracker.repair_habit(t.u(28), t.h(30), '2026-11-09', null, true, 'tap', t.noon(28, '2026-11-09')) $$,
  '%no miss to repair%', 'a repair must be on the next scheduled day after the miss'
);

-- The normal back-log applies to the repair day.
select t.make_user(29);
select t.make_habit(31, 29, '2026-10-26', '{1,4}');
select t.done(31, '2026-10-26', '2026-10-29');
select lives_ok(
  $$ select tracker.repair_habit(t.u(29), t.h(31), '2026-11-05', null, true, 'tap', '2026-11-06 23:59:59+00') $$,
  'a repair can be back-logged until the repair day''s window closes'
);
select t.make_user(30);
select t.make_habit(32, 30, '2026-10-26', '{1,4}');
select t.done(32, '2026-10-26', '2026-10-29');
select throws_like(
  $$ select tracker.repair_habit(t.u(30), t.h(32), '2026-11-05', null, true, 'tap', '2026-11-07 00:00:00+00') $$,
  '%back-log window%', 'and not after it closes'
);

-- 1.5x target, rounded up.
select t.make_user(31);
select t.make_habit(33, 31, '2026-11-02', '{1,2,3,4,5,6,7}', 'count', 5);
select t.done(33, '2026-11-02', '2026-11-02');
select throws_like(
  $$ select tracker.repair_habit(t.u(31), t.h(33), '2026-11-04', 7, false, 'tap', t.noon(31, '2026-11-04')) $$,
  '%at least 8%', '1.5x a target of 5 rounds up to 8, so 7 is refused'
);
select lives_ok(
  $$ select tracker.repair_habit(t.u(31), t.h(33), '2026-11-04', 8, false, 'tap', t.noon(31, '2026-11-04')) $$,
  'and 8 is accepted'
);
select is(t.streak(33, '2026-11-04', t.noon(31, '2026-11-04')), 3, 'one repair fixes the one miss');

select t.make_user(32);
select t.make_habit(34, 32, '2026-11-02', '{1,2,3,4,5,6,7}', 'duration', 20);
insert into public.habit_levels (habit_id, level, description, target) values (t.h(34), 'full', 'Long run', 30);
select t.done(34, '2026-11-02', '2026-11-02');
select throws_like(
  $$ select tracker.repair_habit(t.u(32), t.h(34), '2026-11-04', 30, false, 'tap', t.noon(32, '2026-11-04')) $$,
  '%at least 45%', 'the full level''s target is used when it has one'
);

-- Yes/no habits.
select t.make_user(33);
select t.make_habit(35, 33, '2026-11-02');
select t.done(35, '2026-11-02', '2026-11-02');
select throws_like(
  $$ select tracker.repair_habit(t.u(33), t.h(35), '2026-11-04', null, false, 'tap', t.noon(33, '2026-11-04')) $$,
  '%full version plus the minimum%', 'a yes/no repair needs the full plus the minimum version'
);

-- Repair of a 3rd skip.
select t.make_user(34);
select t.make_habit(36, 34, '2026-11-02');
select t.done(36, '2026-11-02', '2026-11-02');
select t.skip(36, '2026-11-03');
select t.skip(36, '2026-11-04');
select t.skip(36, '2026-11-05');
select lives_ok(
  $$ select tracker.repair_habit(t.u(34), t.h(36), '2026-11-06', null, true, 'tap', t.noon(34, '2026-11-07')) $$,
  'a 3rd skip can be repaired'
);
select is(tracker.day_status(t.h(36), '2026-11-05', t.noon(34, '2026-11-07')), 'repaired', 'and it becomes a repaired day');

-- Repair and Grace Days together.
select t.make_user(35);
select t.make_habit(37, 35, '2026-11-02');
select t.done(37, '2026-11-02', '2026-11-08');
select tracker.settle(t.u(35), '2026-11-12 00:00+00');
select throws_like(
  $$ select tracker.repair_habit(t.u(35), t.h(37), '2026-11-10', null, true, 'tap', '2026-11-11 12:00+00') $$,
  '%no miss to repair%', 'a day already protected by a Grace Day has no miss to repair'
);

select t.make_user(36);
select t.make_habit(38, 36, '2026-11-02');
select t.done(38, '2026-11-02', '2026-11-08');
select tracker.settle(t.u(36), '2026-11-10 00:00+00');
select is(tracker.grace_bank(t.u(36)), 1, 'with the window still open, the Grace Day is unspent');
select tracker.repair_habit(t.u(36), t.h(38), '2026-11-10', null, true, 'tap', t.noon(36, '2026-11-10'));
select tracker.settle(t.u(36), '2026-11-12 00:00+00');
select is(tracker.grace_bank(t.u(36)), 1, 'a repair made first saves the Grace Day');

-- Undo.
select t.make_user(37);
select t.make_habit(39, 37, '2026-11-02');
select t.done(39, '2026-11-02', '2026-11-02');
select tracker.repair_habit(t.u(37), t.h(39), '2026-11-04', null, true, 'tap', t.noon(37, '2026-11-04'));
select tracker.undo_log(t.u(37), t.h(39), '2026-11-04', t.noon(37, '2026-11-04'));
select is(
  (select count(*)::int from public.habit_logs where habit_id = t.h(39)), 1,
  'undoing a repair also removes the repaired day'
);
select tracker.log_habit(t.u(37), t.h(39), '2026-11-04', 'full', null, 'tap', t.noon(37, '2026-11-04'));
select tracker.undo_log(t.u(37), t.h(39), '2026-11-04', t.noon(37, '2026-11-04'));
select is(
  (select count(*)::int from public.habit_logs where habit_id = t.h(39) and date = '2026-11-04'), 0,
  'undo removes an ordinary log'
);

-- ---------------------------------------------------------------------------
-- Modes
-- ---------------------------------------------------------------------------
select t.make_user(38, 'UTC', 'strict');
select t.make_habit(40, 38, '2026-11-02');
select t.done(40, '2026-11-02', '2026-11-08');
select tracker.settle(t.u(38), '2026-11-20 00:00+00');
select is(tracker.grace_bank(t.u(38)), 0, 'strict mode earns no Grace Days');

select t.make_user(39, 'UTC', 'strict');
select t.make_habit(41, 39, '2026-11-02');
select t.done(41, '2026-11-02', '2026-11-02');
insert into public.grace_days (user_id) values (t.u(39));
select tracker.settle(t.u(39), '2026-11-20 00:00+00');
select is(tracker.grace_bank(t.u(39)), 1, 'strict mode spends no Grace Days');
select is(tracker.day_status(t.h(41), '2026-11-03', '2026-11-20 00:00+00'), 'missed', 'so the miss stands');

select t.make_user(40, 'UTC', 'strict');
select t.make_habit(42, 40, '2026-11-02');
select t.done(42, '2026-11-02', '2026-11-02');
select throws_like(
  $$ select tracker.repair_habit(t.u(40), t.h(42), '2026-11-04', null, true, 'tap', t.noon(40, '2026-11-04')) $$,
  '%off in Strict mode%', 'strict mode has no Streak Repair'
);
select lives_ok(
  $$ select tracker.log_habit(t.u(40), t.h(42), '2026-11-03', 'full', null, 'tap', t.noon(40, '2026-11-04')) $$,
  'strict mode still allows the 24-hour back-log'
);

-- ---------------------------------------------------------------------------
-- Client access
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('33333333-3333-4333-8333-333333333333', 'client@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'other@example.test');
insert into public.identities (id, user_id, name) values
  ('c0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'Client'),
  ('d0000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'Other');
insert into public.habits (id, identity_id, title) values
  ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Mine'),
  ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Theirs');

select is(
  (select starts_on from public.habits where id = 'c0000000-0000-4000-8000-000000000002'),
  (now() at time zone 'UTC')::date,
  'a new habit starts on the owner''s local today'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}';

select lives_ok(
  $$ select public.log_habit('c0000000-0000-4000-8000-000000000002') $$,
  'a signed-in user can log through the API'
);
select is((select current_streak from public.get_streaks()), 1, 'and sees the streak');
select is((select count(*)::int from public.get_day_statuses(current_date, current_date)), 1, 'and day statuses');
select is(public.get_grace_bank(), 0, 'and their Grace Day bank');
select throws_ok(
  $$ insert into public.habit_logs (habit_id, date, level_done, status) values ('c0000000-0000-4000-8000-000000000002', '2020-01-01', 'full', 'done') $$,
  '42501', null, 'clients cannot write logs directly and skip the rules'
);
select throws_ok(
  $$ update public.habit_logs set date = '2020-01-01' $$,
  '42501', null, 'clients cannot edit logs directly'
);
select throws_ok(
  $$ delete from public.habit_logs $$,
  '42501', null, 'clients cannot delete logs directly'
);
select throws_ok(
  $$ select tracker.grace_bank('33333333-3333-4333-8333-333333333333') $$,
  '42501', null, 'clients cannot reach the private schema, or set the clock'
);
select throws_like(
  $$ select public.log_habit('d0000000-0000-4000-8000-000000000002') $$,
  '%Habit not found%', 'clients cannot log against another user''s habit'
);
select throws_like(
  $$ select public.repair_habit('d0000000-0000-4000-8000-000000000002') $$,
  '%Habit not found%', 'clients cannot repair another user''s habit'
);
select throws_like(
  $$ select public.undo_log('d0000000-0000-4000-8000-000000000002') $$,
  '%Habit not found%', 'clients cannot undo another user''s log'
);
reset role;

set local role anon;
select throws_ok(
  $$ select public.log_habit('c0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'signed-out visitors cannot call the API'
);
select throws_ok(
  $$ select * from public.get_streaks() $$,
  '42501', null, 'signed-out visitors cannot read streaks'
);
reset role;

select * from finish();
rollback;
