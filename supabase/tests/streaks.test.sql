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
  update public.users set timezone = tz where id = t.u(n);
  update tracker.mode_history set mode = m where user_id = t.u(n);
  alter table public.users disable trigger users_record_mode_change;
  update public.users set mode = m where id = t.u(n);
  alter table public.users enable trigger users_record_mode_change;
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

-- Writing to habit_levels directly stamps the change with the real clock, but these
-- tests run on fixed dates. This makes a habit's current settings cover its whole life,
-- as settings saved when a habit is created do.
create function t.pin(n int) returns void language sql as $$
  select tracker.record_habit_version(t.h(n), '2000-01-01 12:00+00');
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
  (select settled_through from public.users where id = t.u(8)), '2026-11-05'::date,
  'moving west reopens a day whose window is open again in the new timezone'
);
select is(
  tracker.day_status(t.h(8), '2026-11-06', '2026-11-08 00:00+00'), 'pending',
  'and that day really can be back-logged'
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
select t.done(24, '2026-11-02', '2026-11-09');
select t.make_habit(43, 23, '2026-11-09');
select tracker.settle(t.u(23), '2026-11-11 00:00+00');
select is(tracker.grace_bank(t.u(23)), 1, 'a Grace Day is not spent when there is no streak to protect');

select t.make_user(24);
select t.make_habit(25, 24, '2026-11-02');
select t.make_habit(26, 24, '2026-11-02');
select t.done(25, '2026-11-02', '2026-11-08');
select t.done(26, '2026-11-02', '2026-11-08');
select tracker.settle(t.u(24), '2026-11-11 00:00+00');
select is(
  (select count(*)::int from public.grace_days where user_id = t.u(24) and spent_for_date is not null), 1,
  'two misses on one day with one Grace Day spend only that one'
);
select is(
  tracker.day_status(t.h(25), '2026-11-09', '2026-11-11 00:00+00') || '/' || tracker.day_status(t.h(26), '2026-11-09', '2026-11-11 00:00+00'),
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
select t.pin(34);
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

select t.make_user(39);
select t.make_habit(41, 39, '2026-11-02');
select t.done(41, '2026-11-02', '2026-11-08');
insert into tracker.mode_history (user_id, effective_from, mode) values (t.u(39), '2026-11-09', 'strict');
select tracker.settle(t.u(39), '2026-11-20 00:00+00');
select is(tracker.grace_bank(t.u(39)), 1, 'strict mode spends no Grace Days');
select is(tracker.day_status(t.h(41), '2026-11-09', '2026-11-20 00:00+00'), 'missed', 'so the miss stands');

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

-- Changing mode only affects days from then on.
select t.make_user(41);
select t.make_habit(44, 41, '2026-11-02');
select t.done(44, '2026-11-02', '2026-11-08');
select tracker.settle(t.u(41), '2026-11-10 00:00+00');
select is(tracker.grace_bank(t.u(41)), 1, 'grace mode earned a Grace Day');
insert into tracker.mode_history (user_id, effective_from, mode) values (t.u(41), '2026-11-12', 'strict');
select tracker.settle(t.u(41), '2026-11-11 00:00+00');
select is(
  tracker.day_status(t.h(44), '2026-11-09', '2026-11-11 00:00+00'), 'protected',
  'a later change to strict leaves earlier days under grace rules'
);

select t.make_user(42, 'UTC', 'strict');
select t.make_habit(45, 42, '2026-11-02');
select t.done(45, '2026-11-02', '2026-11-08');
insert into tracker.mode_history (user_id, effective_from, mode) values (t.u(42), '2026-11-09', 'grace');
select t.done(45, '2026-11-09', '2026-11-15');
select tracker.settle(t.u(42), '2026-11-17 00:00+00');
select is(tracker.grace_bank(t.u(42)), 1, 'days completed under strict earn nothing after moving to grace');

update public.users set mode = 'strict' where id = t.u(41);
select is(
  (select mode::text from tracker.mode_history where user_id = t.u(41) order by effective_from desc limit 1), 'strict',
  'changing the mode setting records a dated change'
);

-- ---------------------------------------------------------------------------
-- Repaired and protected days in the 7-day count
-- ---------------------------------------------------------------------------
select t.make_user(43);
select t.make_habit(46, 43, '2026-11-02');
select t.done(46, '2026-11-02', '2026-11-04');
select tracker.repair_habit(t.u(43), t.h(46), '2026-11-06', null, true, 'tap', t.noon(43, '2026-11-06'));
select t.done(46, '2026-11-07', '2026-11-08');
select tracker.settle(t.u(43), '2026-11-10 00:00+00');
select is(tracker.grace_bank(t.u(43)), 1, 'a repaired day counts toward the 7 days');

select t.make_user(44);
select t.make_habit(47, 44, '2026-11-02');
select t.done(47, '2026-11-02', '2026-11-08');
select t.done(47, '2026-11-10', '2026-11-15');
select tracker.settle(t.u(44), '2026-11-17 00:00+00');
select is(tracker.day_status(t.h(47), '2026-11-09', '2026-11-17 00:00+00'), 'protected', 'the miss was protected');
select is(tracker.grace_bank(t.u(44)), 0, 'a protected day resets the 7-day count: six more days earn nothing');
select t.done(47, '2026-11-16', '2026-11-16');
select tracker.settle(t.u(44), '2026-11-18 00:00+00');
select is(tracker.grace_bank(t.u(44)), 1, 'the seventh day after it earns one');

select t.make_user(45);
select t.make_habit(48, 45, '2026-10-01');
select t.done(48, '2026-10-01', '2026-10-28');
select tracker.settle(t.u(45), '2026-10-30 00:00+00');
select is(tracker.grace_bank(t.u(45)), 3, 'four weeks would earn four, but the bank is full at 3');
select is(
  (select count(*)::int from public.grace_days where user_id = t.u(45)), 3,
  'the extra one is discarded, not stored'
);

-- ---------------------------------------------------------------------------
-- Results are identical whenever they are read
-- ---------------------------------------------------------------------------
create function t.history(n int, habit int) returns void language plpgsql as $$
begin
  perform t.make_user(n);
  perform t.make_habit(habit, n, '2026-11-02');
  perform t.done(habit, '2026-11-02', '2026-11-08');
  perform t.done(habit, '2026-11-10', '2026-11-16');
  perform t.done(habit, '2026-11-19', '2026-11-30');
end $$;

create function t.result(n int, habit int, at timestamptz) returns text language sql stable as $$
  select concat_ws(' | ',
    (select coalesce(string_agg(tracker.day_status(t.h(habit), d::date, at), ',' order by d), '')
     from generate_series('2026-11-02'::date, '2026-11-30'::date, interval '1 day') d),
    t.streak(habit, '2026-11-30', at),
    t.longest(habit, '2026-11-30', at),
    tracker.grace_bank(t.u(n)),
    (select coalesce(string_agg(spent_for_date::text, ',' order by spent_for_date), '')
     from public.grace_days where user_id = t.u(n)),
    (select coalesce(string_agg(earned_at::text, ',' order by earned_at), '')
     from public.grace_days where user_id = t.u(n))
  );
$$;

-- The same history, read only at the end, read every day, and read out of order.
select t.history(46, 49);
select t.history(47, 50);
select t.history(48, 51);

select tracker.settle(t.u(46), '2026-12-03 00:00+00');

select tracker.settle(t.u(47), d)
from generate_series('2026-11-03 00:00+00'::timestamptz, '2026-12-03 00:00+00', interval '1 day') d;

select tracker.settle(t.u(48), '2026-12-03 00:00+00');
select tracker.settle(t.u(48), '2026-11-12 00:00+00');
select tracker.settle(t.u(48), '2026-12-03 00:00+00');

select is(
  t.result(47, 50, '2026-12-03 00:00+00'),
  t.result(46, 49, '2026-12-03 00:00+00'),
  'reading every day gives the same result as reading once at the end'
);
select is(
  t.result(48, 51, '2026-12-03 00:00+00'),
  t.result(46, 49, '2026-12-03 00:00+00'),
  'reading out of order gives the same result'
);

delete from public.grace_days where user_id = t.u(46);
update public.users set settled_fingerprint = null, settled_through = null where id = t.u(46);
select tracker.settle(t.u(46), '2026-12-03 00:00+00');
select is(
  t.result(46, 49, '2026-12-03 00:00+00'),
  t.result(48, 51, '2026-12-03 00:00+00'),
  'stored Grace Days can be deleted and rebuilt exactly from logs and settings'
);

-- A read before a mode change must not change the outcome of days before it.
select t.make_user(49);
select t.make_user(50);
select t.make_habit(52, 49, '2026-11-02');
select t.make_habit(53, 50, '2026-11-02');
select t.done(52, '2026-11-02', '2026-11-08');
select t.done(53, '2026-11-02', '2026-11-08');
select tracker.settle(t.u(49), '2026-11-11 00:00+00');
insert into tracker.mode_history (user_id, effective_from, mode) values
  (t.u(49), '2026-11-12', 'strict'),
  (t.u(50), '2026-11-12', 'strict');
select tracker.settle(t.u(49), '2026-11-15 00:00+00');
select tracker.settle(t.u(50), '2026-11-15 00:00+00');
select is(
  tracker.day_status(t.h(53), '2026-11-09', '2026-11-15 00:00+00'),
  tracker.day_status(t.h(52), '2026-11-09', '2026-11-15 00:00+00'),
  'a read before a mode change makes no difference to earlier days'
);

-- A repair attempt gets the same answer whether or not anything read first.
select t.make_user(51);
select t.make_user(52);
select t.make_habit(54, 51, '2026-10-26', '{1,4}');
select t.make_habit(55, 52, '2026-10-26', '{1,4}');
select t.done(54, '2026-10-26', '2026-11-29');
select t.done(55, '2026-10-26', '2026-11-29');
delete from public.habit_logs where habit_id in (t.h(54), t.h(55)) and date = '2026-11-30';
select tracker.settle(t.u(51), '2026-12-02 12:00+00');
select throws_like(
  $$ select tracker.repair_habit(t.u(51), t.h(54), '2026-12-03', null, true, 'tap', t.noon(51, '2026-12-03')) $$,
  '%no miss to repair%', 'a Grace Day covers the miss when something read first'
);
select throws_like(
  $$ select tracker.repair_habit(t.u(52), t.h(55), '2026-12-03', null, true, 'tap', t.noon(52, '2026-12-03')) $$,
  '%no miss to repair%', 'and it still does when nothing read first'
);

-- Unchanged data is not rebuilt.
select t.make_user(53);
select t.make_habit(56, 53, '2026-11-02');
select t.done(56, '2026-11-02', '2026-11-08');
select tracker.settle(t.u(53), '2026-11-10 00:00+00');
create temp table grace_ids on commit drop as select id from public.grace_days where user_id = t.u(53);
select tracker.settle(t.u(53), '2026-11-10 00:00+00');
select is(
  (select count(*)::int from public.grace_days g join grace_ids i using (id)), 1,
  'reading again with nothing changed does not rewrite Grace Days'
);
select t.done(56, '2026-11-09', '2026-11-09');
select tracker.settle(t.u(53), '2026-11-10 00:00+00');
select is(
  (select count(*)::int from public.grace_days g join grace_ids i using (id)), 1,
  'logging a day that is still open does not force a rebuild'
);

-- ---------------------------------------------------------------------------
-- Dated settings: a change never rewrites the past
-- ---------------------------------------------------------------------------
create function t.change(
  n int, from_day date,
  days smallint[] default null, goal numeric default null, new_levels jsonb default null
) returns void language sql as $$
  insert into tracker.habit_versions (habit_id, effective_from, schedule_days, target, unit, levels)
  select t.h(n), from_day, coalesce(days, v.schedule_days), coalesce(goal, v.target), v.unit, coalesce(new_levels, v.levels)
  from tracker.habit_versions v
  where v.habit_id = t.h(n) and v.effective_from <= from_day
  order by v.effective_from desc limit 1;
$$;

-- A daily habit becomes Mon/Thu mid-streak.
select t.make_user(70);
select t.make_habit(70, 70, '2026-11-02');
select t.done(70, '2026-11-02', '2026-11-08');
select t.change(70, '2026-11-09', '{1,4}');
select t.done(70, '2026-11-09', '2026-11-12');
select is(tracker.day_status(t.h(70), '2026-11-03', t.noon(70, '2026-11-20')), 'done', 'a Tuesday before the change stays a done day');
select is(tracker.day_status(t.h(70), '2026-11-10', t.noon(70, '2026-11-20')), 'unscheduled', 'a Tuesday after the change is unscheduled');
select is(t.streak(70, '2026-11-12', t.noon(70, '2026-11-13')), 9, 'the streak runs straight through a schedule change');

-- A Mon/Thu habit becomes daily mid-streak.
select t.make_user(71);
select t.make_habit(71, 71, '2026-11-02', '{1,4}');
select t.done(71, '2026-11-02', '2026-11-05');
select t.change(71, '2026-11-09', '{1,2,3,4,5,6,7}');
select t.done(71, '2026-11-09', '2026-11-10');
select is(tracker.day_status(t.h(71), '2026-11-03', t.noon(71, '2026-11-10')), 'unscheduled', 'making a habit daily does not turn past days into misses');
select is(t.streak(71, '2026-11-10', t.noon(71, '2026-11-10')), 4, 'and the streak survives the change');
select is(tracker.previous_scheduled_day(t.h(71), '2026-11-09'), '2026-11-05'::date, 'the day before the change follows the old schedule');

-- A long gap across a schedule change is still bridged.
select t.make_user(72);
select t.make_habit(72, 72, '2026-11-02', '{1}');
select t.change(72, '2026-11-03', '{7}');
select is(tracker.previous_scheduled_day(t.h(72), '2026-11-15'), '2026-11-08'::date, 'the new schedule is used from its first day');
select is(tracker.previous_scheduled_day(t.h(72), '2026-11-08'), '2026-11-02'::date, 'and a gap across the change is bridged');

-- Grace Days are rebuilt when the schedule history changes.
select t.make_user(73);
select t.make_habit(73, 73, '2026-11-02');
select t.done(73, '2026-11-02', '2026-11-08');
select tracker.settle(t.u(73), '2026-11-11 00:00+00');
select is(tracker.grace_bank(t.u(73)), 0, 'a Grace Day was spent on Monday''s miss');
select t.change(73, '2026-11-09', '{2,3,4,5,6,7}');
select tracker.settle(t.u(73), '2026-11-11 00:00+00');
select is(tracker.grace_bank(t.u(73)), 1, 'making Monday unscheduled from that date gives it back');

-- A target change mid-streak.
select t.make_user(74);
select t.make_habit(74, 74, '2026-11-02', '{1,2,3,4,5,6,7}', 'count', 10);
select t.done(74, '2026-11-02', '2026-11-07');
select t.change(74, '2026-11-09', null, 20);
select is(tracker.target_on(t.h(74), '2026-11-08'), 10::numeric, 'the old target applies before the change');
select is(tracker.target_on(t.h(74), '2026-11-09'), 20::numeric, 'the new target applies from the change');
select throws_like(
  $$ select tracker.repair_habit(t.u(74), t.h(74), '2026-11-09', 14, false, 'tap', t.noon(74, '2026-11-09')) $$,
  '%at least 15%', 'a repair uses the target of the missed day, not the new one'
);
select lives_ok(
  $$ select tracker.repair_habit(t.u(74), t.h(74), '2026-11-09', 15, false, 'tap', t.noon(74, '2026-11-09')) $$,
  'so 1.5x the old target is enough, even after the target rose'
);
select is(t.streak(74, '2026-11-09', t.noon(74, '2026-11-09')), 8, 'the streak carries through a target change');
select is(
  (select repair_amount from tracker.today_rows(t.u(74), t.noon(74, '2026-11-11')) where is_today),
  30::numeric,
  'a miss after the change uses the new target'
);

-- A Shrink level change.
select t.make_user(75);
select t.make_habit(75, 75, '2026-11-02', '{1,2,3,4,5,6,7}', 'count', 10);
update tracker.habit_versions set levels = '[{"level":"full","description":"Old full","target":10}]' where habit_id = t.h(75);
select t.change(75, '2026-11-09', null, null, '[{"level":"full","description":"New full","target":40}]');
select is(tracker.target_on(t.h(75), '2026-11-08'), 10::numeric, 'a level target stays dated too');
select is(
  (select levels -> 0 ->> 'description' from tracker.today_rows(t.u(75), t.noon(75, '2026-11-09')) where not is_today),
  'Old full',
  'yesterday shows the level as it was'
);
select is(
  (select levels -> 0 ->> 'description' from tracker.today_rows(t.u(75), t.noon(75, '2026-11-09')) where is_today),
  'New full',
  'today shows the new one'
);

-- The real change path.
select t.make_user(76);
select t.make_habit(76, 76, '2020-01-06', '{1}');
update public.habits set schedule_days = '{2}' where id = t.h(76);
select is(
  (select array_agg(schedule_days[1]::int order by effective_from) from tracker.habit_versions where habit_id = t.h(76)),
  array[1, 2],
  'editing a habit adds a dated version and keeps the old one'
);
select is(
  (select max(effective_from) from tracker.habit_versions where habit_id = t.h(76)),
  tracker.local_date(t.u(76), now()),
  'and the change takes effect today'
);
update public.habits set title = 'Renamed' where id = t.h(76);
select is(
  (select count(*)::int from tracker.habit_versions where habit_id = t.h(76)), 2,
  'a rename adds no version'
);

-- ---------------------------------------------------------------------------
-- What a miss shows
-- ---------------------------------------------------------------------------
select t.make_user(77);
select t.make_habit(77, 77, '2026-10-26', '{1,4}');
select t.done(77, '2026-10-26', '2026-10-29');
select is(tracker.repair_on(t.h(77), '2026-11-02', '2026-11-03 12:00+00'), null::date, 'nothing to repair while the window is open');
select is(tracker.repair_on(t.h(77), '2026-11-02', '2026-11-04 00:00+00'), '2026-11-05'::date, 'after it closes, the repair day is Thursday');
select is(
  (select repair_on from tracker.repair_rows(t.u(77), '2026-11-04 12:00+00')), '2026-11-05'::date,
  'and that is listed for the Today screen'
);
select is(
  (select count(*)::int from tracker.repair_rows(t.u(77), t.noon(77, '2026-11-05'))), 0,
  'on the repair day itself the normal card offers it'
);
select is(tracker.repair_on(t.h(77), '2026-11-02', '2026-11-07 00:00+00'), null::date, 'once the repair day''s window closes it just stays a miss');

select t.make_user(78);
select t.make_habit(78, 78, '2026-11-02');
select t.done(78, '2026-11-02', '2026-11-02');
select is(tracker.repair_on(t.h(78), '2026-11-04', '2026-11-06 00:30+00'), null::date, 'a second miss in a row has no repair day');

select t.make_user(79, 'UTC', 'strict');
select t.make_habit(79, 79, '2026-10-26', '{1,4}');
select t.done(79, '2026-10-26', '2026-10-29');
select is(tracker.repair_on(t.h(79), '2026-11-02', '2026-11-04 00:00+00'), null::date, 'strict mode offers no repair day');

-- ---------------------------------------------------------------------------
-- Habit limits
-- ---------------------------------------------------------------------------
create function t.make_many(n int, owner int, starts date, how_many int) returns void language plpgsql as $$
begin
  for i in 0..how_many - 1 loop
    perform t.make_habit(n + i, owner, starts);
  end loop;
end $$;

select t.make_user(85);
select lives_ok(
  $$ select tracker.create_habit(t.u(85), 'bbbbbbbb-0000-4000-8000-000000000085', ' Run ', 'boolean', null, null, '{1}', null, null, null, null, null,
    '[{"level":"full","description":"Run 5 km"},{"level":"minimum","description":"Run 1 km"}]', 'anytime', null, 'days', null, null, '2026-11-02 12:00+00') $$,
  'a habit can be created with its Shrink ladder'
);
select is((select title from public.habits h join public.identities i on i.id = h.identity_id where i.user_id = t.u(85)), 'Run', 'its name is tidied');
select is(
  (select count(distinct (v.schedule_days, v.target, v.unit, v.levels))::int from tracker.habit_versions v join public.habits h on h.id = v.habit_id join public.identities i on i.id = h.identity_id where i.user_id = t.u(85)),
  1, 'settings made on creation are one version, not a change'
);
select is(
  (select jsonb_array_length((tracker.version_on(h.id, '2020-01-01')).levels) from public.habits h join public.identities i on i.id = h.identity_id where i.user_id = t.u(85)),
  2, 'and that version holds the ladder'
);
select tracker.create_habit(t.u(85), 'bbbbbbbb-0000-4000-8000-000000000085', 'Read', 'boolean', null, null, '{1}', null, null, null, null, null,
  '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', 'anytime', null, 'days', null, null, '2026-11-02 12:00+00');
select tracker.create_habit(t.u(85), 'bbbbbbbb-0000-4000-8000-000000000085', 'Stretch', 'boolean', null, null, '{1}', null, null, null, null, null,
  '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', 'anytime', null, 'days', null, null, '2026-11-02 12:00+00');
select lives_ok(
  $$ select tracker.create_habit(t.u(85), 'bbbbbbbb-0000-4000-8000-000000000085', 'Habit ' || n, 'boolean', null, null, '{1}', null, null, null, null, null,
    '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', 'anytime', null, 'days', null, null, '2026-11-02 12:00+00')
     from generate_series(4, 12) n $$,
  'there is no habit limit: a 12th habit saves'
);
select is(
  (select count(*)::int from public.habits h join public.identities i on i.id = h.identity_id where i.user_id = t.u(85)),
  12, 'and all 12 are there'
);

-- The new settings: time of day, reminder, times per week and an end date.
select t.make_user(80);
select lives_ok(
  $$ select tracker.create_habit(t.u(80), 'bbbbbbbb-0000-4000-8000-000000000080', 'Lift80', 'boolean', null, null, '{1,2,3,4,5,6,7}', null, null, null, null, null,
    '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', 'morning', '07:30', 'per_week', 4::smallint, '2026-12-01', '2026-11-02 12:00+00') $$,
  'a times-per-week habit with a time of day, a reminder and an end date saves'
);
select is(
  (select (time_of_day, reminder_time, frequency, per_week, ends_on)::text from public.habits where title = 'Lift80'),
  '(morning,07:30:00,per_week,4,2026-12-01)', 'and keeps every setting'
);
select is(
  (select (v.time_of_day, v.frequency, v.per_week, v.ends_on)::text from tracker.habit_versions v join public.habits h on h.id = v.habit_id where h.title = 'Lift80' and v.effective_from = '-infinity'),
  '(morning,per_week,4,2026-12-01)', 'its first version holds them'
);
select throws_like(
  $$ select tracker.create_habit(t.u(80), 'bbbbbbbb-0000-4000-8000-000000000080', 'Daily', 'boolean', null, null, '{1}', null, null, null, null, null,
    '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', 'anytime', null, 'per_week', 7::smallint, null, '2026-11-02 12:00+00') $$,
  '%1 to 6 times a week%', '7 times a week is refused: that is every day'
);
select throws_like(
  $$ select tracker.create_habit(t.u(80), 'bbbbbbbb-0000-4000-8000-000000000080', 'Early', 'boolean', null, null, '{1}', null, null, null, null, null,
    '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', 'anytime', null, 'days', null, '2026-11-01', '2026-11-02 12:00+00') $$,
  '%before the habit starts%', 'an end before the start is refused'
);
select is(
  (select per_week from public.habits where id = tracker.create_habit(t.u(80), 'bbbbbbbb-0000-4000-8000-000000000080', 'Days', 'boolean', null, null, '{1}', null, null, null, null, null,
    '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', 'anytime', null, 'days', 3::smallint, null, '2026-11-02 12:00+00')),
  null::smallint, 'a specific-days habit keeps no times per week'
);

-- Changing them later is dated: past days keep what they had.
update public.habits set starts_on = '2020-01-06' where title = 'Lift80';
delete from tracker.habit_versions where habit_id = (select id from public.habits where title = 'Lift80') and effective_from <> '-infinity';
select tracker.update_habit(t.u(80), (select id from public.habits where title = 'Lift80'), '{"time_of_day":"evening","frequency":"days"}', '2026-11-10 12:00+00');
select is(
  (select (time_of_day, frequency, per_week)::text from public.habits where title = 'Lift80'),
  '(evening,days,)', 'switching to specific days clears times per week'
);
select is(
  (select (v.time_of_day, v.frequency, v.per_week)::text from tracker.habit_versions v join public.habits h on h.id = v.habit_id
   where h.title = 'Lift80' and v.effective_from = '-infinity'),
  '(morning,per_week,4)', 'and the earlier version still says morning, 4 times a week'
);
select is(
  (select (v.time_of_day, v.frequency)::text from tracker.habit_versions v join public.habits h on h.id = v.habit_id
   where h.title = 'Lift80' and v.effective_from = '2026-11-10'),
  '(evening,days)', 'the change applies from the day it was made'
);
select throws_like(
  $$ select tracker.update_habit(t.u(80), (select id from public.habits where title = 'Lift80'), '{"frequency":"per_week","per_week":0}', '2026-11-10 12:00+00') $$,
  '%1 to 6 times a week%', 'an edit is checked too'
);

-- One-time tips.
select set_config('request.jwt.claims', json_build_object('sub', t.u(80), 'role', 'authenticated')::text, true);
select public.mark_tip_seen('habit-tip');
select public.mark_tip_seen('habit-tip');
select is((select seen_tips from public.users where id = t.u(80)), '{habit-tip}'::text[], 'a tip is recorded once, however often it is marked');
select throws_like($$ select public.mark_tip_seen('Not a tip!') $$, '%Unknown tip%', 'a tip id must be plain');
select set_config('request.jwt.claims', '', true);

select t.make_user(86);
select throws_like(
  $$ select tracker.create_habit(t.u(86), 'bbbbbbbb-0000-4000-8000-000000000086', ' ', 'boolean', null, null, '{1}', null, null, null, null, null,
    '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', 'anytime', null, 'days', null, null, '2026-11-02 12:00+00') $$,
  '%Give the habit a name%', 'a habit needs a name'
);
select throws_like(
  $$ select tracker.create_habit(t.u(86), 'bbbbbbbb-0000-4000-8000-000000000086', 'Read', 'count', null, 'pages', '{1}', null, null, null, null, null,
    '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', 'anytime', null, 'days', null, null, '2026-11-02 12:00+00') $$,
  '%Set a target%', 'a count habit needs a target'
);
select throws_like(
  $$ select tracker.create_habit(t.u(86), 'bbbbbbbb-0000-4000-8000-000000000086', 'Read', 'boolean', null, null, '{}', null, null, null, null, null,
    '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', 'anytime', null, 'days', null, null, '2026-11-02 12:00+00') $$,
  '%at least one day%', 'a habit needs at least one day'
);
select throws_like(
  $$ select tracker.create_habit(t.u(86), 'bbbbbbbb-0000-4000-8000-000000000086', 'Read', 'boolean', null, null, '{1}', null, null, null, null, null,
    '[{"level":"full","description":"a"}]', 'anytime', null, 'days', null, null, '2026-11-02 12:00+00') $$,
  '%full version and a minimum%', 'a habit needs a minimum version'
);
select throws_like(
  $$ select tracker.create_habit(t.u(86), 'bbbbbbbb-0000-4000-8000-000000000001', 'Read', 'boolean', null, null, '{1}', null, null, null, null, null,
    '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', 'anytime', null, 'days', null, null, '2026-11-02 12:00+00') $$,
  '%Identity not found%', 'a habit cannot be added to another user''s identity'
);

select t.make_user(87);
select t.make_habit(97, 87, '2020-01-06', '{1}', 'count', 10);
insert into public.habit_levels (habit_id, level, description, target) values (t.h(97), 'full', 'Ten', 10), (t.h(97), 'minimum', 'One', 1);
select t.pin(97);
select tracker.update_habit(t.u(87), t.h(97), '{"title":"New name","target":20,"levels":[{"level":"full","description":"Twenty","target":20},{"level":"minimum","description":"Two","target":2}]}', now());
select is((select title from public.habits where id = t.h(97)), 'New name', 'a habit can be edited');
select is(tracker.target_on(t.h(97), tracker.local_date(t.u(87), now())), 20::numeric, 'the new target applies today');
select is(
  (select (tracker.version_on(t.h(97), '2020-01-06')).schedule_days), '{1}'::smallint[],
  'and the first version is untouched'
);

-- A missing field keeps its value, and an explicit null clears it.
select t.make_user(88);
select t.make_habit(98, 88, '2026-11-02', '{1,4}', 'count', 10);
insert into public.habit_levels (habit_id, level, description, target) values (t.h(98), 'full', 'Ten', 10), (t.h(98), 'minimum', 'One', 1);
select t.pin(98);
update public.habits set unit = 'pages', milestone_amount = 300, milestone_label = 'book', voice_aliases = '{book}' where id = t.h(98);
select tracker.update_habit(t.u(88), t.h(98), '{"title":"Renamed"}', now());
select is(
  (select unit || '/' || milestone_amount || '/' || milestone_label || '/' || voice_aliases[1] || '/' || target from public.habits where id = t.h(98)),
  'pages/300/book/book/10',
  'fields left out keep their values'
);
select tracker.update_habit(t.u(88), t.h(98), '{"unit":null}', now());
select is((select unit from public.habits where id = t.h(98)), null::text, 'an explicit null clears the unit');
select is((select milestone_label from public.habits where id = t.h(98)), 'book', 'and leaves everything else');
select tracker.update_habit(t.u(88), t.h(98), '{"milestone_amount":null,"milestone_label":null}', now());
select is((select milestone_amount from public.habits where id = t.h(98)), null::numeric, 'a milestone can be cleared');
select tracker.update_habit(t.u(88), t.h(98), '{"voice_aliases":null}', now());
select is((select voice_aliases from public.habits where id = t.h(98)), '{}'::text[], 'clearing voice names leaves an empty list');
select throws_like(
  $$ select tracker.update_habit(t.u(88), t.h(98), '{"milestone_amount":300}', now()) $$,
  '%amount and a name%', 'half a milestone is refused'
);
select throws_like(
  $$ select tracker.update_habit(t.u(88), t.h(98), '{"target":null}', now()) $$,
  '%Set a target%', 'a count habit cannot lose its target'
);
select throws_like(
  $$ select tracker.update_habit(t.u(88), t.h(98), '{"title":null}', now()) $$,
  '%Give the habit a name%', 'a habit cannot lose its name'
);
select throws_like(
  $$ select tracker.update_habit(t.u(88), t.h(98), '{"schedule_days":null}', now()) $$,
  '%at least one day%', 'a habit cannot lose its schedule'
);
select throws_like(
  $$ select tracker.update_habit(t.u(88), t.h(98), '{"levels":null}', now()) $$,
  '%full version and a minimum%', 'a habit cannot lose its ladder'
);

-- The Progress screen's days.
select t.make_user(91);
select t.make_habit(191, 91, '2026-10-05', '{1,4}', 'count', 10);
insert into public.habit_levels (habit_id, level, description, target) values (t.h(191), 'full', 'Ten', 10), (t.h(191), 'minimum', 'One', 1);
select t.pin(191);
select tracker.log_habit(t.u(91), t.h(191), '2026-10-05', 'minimum', 3, 'tap', t.noon(91, '2026-10-05'));
insert into tracker.habit_versions (habit_id, effective_from, schedule_days, target, unit, levels)
values (t.h(191), '2026-10-10', '{1,4}', 20, null, '[{"level":"full","description":"Twenty","target":20},{"level":"minimum","description":"Two","target":2}]');
select set_config('request.jwt.claims', json_build_object('sub', t.u(91), 'role', 'authenticated')::text, true);
select is(jsonb_array_length(public.get_habit_days('2026-10-05', '2026-10-12')), 3, 'only scheduled days come back');
select is((public.get_habit_days('2026-10-05', '2026-10-12') -> 0 ->> 'logged_hour')::int, 12, 'with the local hour it was logged');
select tracker.log_habit(t.u(91), t.h(191), '2026-10-08', 'full', 10, 'tap', t.noon(91, '2026-10-09'));
select is(public.get_habit_days('2026-10-05', '2026-10-12') -> 1 ->> 'logged_hour', null, 'a back-log has no hour, because it says nothing about when it was done');
select is(public.get_habit_days('2026-10-05', '2026-10-12') -> 0 ->> 'level_done', 'minimum', 'with the level done');
select is((public.get_habit_days('2026-10-05', '2026-10-12') -> 0 ->> 'amount')::numeric, 3::numeric, 'and the amount');
select is((public.get_habit_days('2026-10-05', '2026-10-12') -> 1 ->> 'target')::numeric, 10::numeric, 'with the target that applied before an edit');
select is((public.get_habit_days('2026-10-05', '2026-10-12') -> 2 ->> 'target')::numeric, 20::numeric, 'and the new one after it');
select is(public.get_habit_days('2026-09-01', '2026-09-05'), '[]'::jsonb, 'days before a habit started are left out');
select throws_like($$ select public.get_habit_days('2025-01-01', '2026-11-05') $$, '%too long%', 'a range is capped');
select set_config('request.jwt.claims', '', true);

-- A voice log is marked as AI-assisted.
select t.make_user(90);
select t.make_habit(190, 90, '2026-11-02');
select tracker.log_habit(t.u(90), t.h(190), '2026-11-03', 'full', null, 'voice', t.noon(90, '2026-11-03'));
select is(
  (select actor::text from public.activity_events where user_id = t.u(90) and kind = 'log_created'),
  'ai_assisted',
  'a voice log is recorded as AI-assisted'
);

-- An undo records who asked for it.
select tracker.log_habit(t.u(90), t.h(190), '2026-11-04', 'full', null, 'tap', t.noon(90, '2026-11-04'));
select set_config('tracker.undo_source', 'coach', true);
delete from public.habit_logs where habit_id = t.h(190) and date = '2026-11-04';
select set_config('tracker.undo_source', '', true);
select is(
  (select actor::text from public.activity_events where user_id = t.u(90) and kind = 'log_removed'),
  'ai_assisted',
  'a coach undo of a tapped log is AI-assisted'
);
select tracker.log_habit(t.u(90), t.h(190), '2026-11-05', 'full', null, 'tap', t.noon(90, '2026-11-05'));
delete from public.habit_logs where habit_id = t.h(190) and date = '2026-11-05';
select is(
  (select count(*)::int from public.activity_events where user_id = t.u(90) and kind = 'log_removed' and actor = 'user'),
  1,
  'an undo by tap stays the person''s own'
);

-- Moving a habit to another identity.
select t.make_user(89);
select t.make_habit(99, 89, '2026-11-02');
insert into public.habit_levels (habit_id, level, description) values (t.h(99), 'full', 'All'), (t.h(99), 'minimum', 'Some');
select t.pin(99);
select t.done(99, '2026-11-02', '2026-11-05');
insert into public.identities (id, user_id, name) values ('cccccccc-0000-4000-8000-000000000089', t.u(89), 'Second');
select tracker.settle(t.u(89), t.noon(89, '2026-11-05'));
create temp table before_move on commit drop as
  select t.streak(99, '2026-11-05', t.noon(89, '2026-11-05')) as streak,
    (select count(*) from public.habit_logs where habit_id = t.h(99)) as logs,
    (select count(*) from tracker.habit_versions where habit_id = t.h(99)) as versions;
select tracker.update_habit(t.u(89), t.h(99), '{"identity_id":"cccccccc-0000-4000-8000-000000000089"}', t.noon(89, '2026-11-05'));
select is((select name from public.identities i join public.habits h on h.identity_id = i.id where h.id = t.h(99)), 'Second', 'a habit can move to another identity');
select is((select count(*) from public.habit_logs where habit_id = t.h(99)), (select logs from before_move), 'it keeps all its logs');
select is(t.streak(99, '2026-11-05', t.noon(89, '2026-11-05')), (select streak from before_move), 'and its streak');
select is((tracker.version_on(t.h(99), '2026-11-03')).schedule_days, '{1,2,3,4,5,6,7}'::smallint[], 'and its dated settings');
select is(tracker.day_status(t.h(99), '2026-11-03', t.noon(89, '2026-11-05')), 'done', 'past days are unchanged');
select is(tracker.habit_owner(t.h(99)), t.u(89), 'it stays with the same owner');
select is(
  (select payload ->> 'to_identity' from public.activity_events where user_id = t.u(89) and kind = 'habit_moved'),
  'cccccccc-0000-4000-8000-000000000089',
  'the move is in the activity history'
);
select throws_like(
  $$ select tracker.update_habit(t.u(89), t.h(99), '{"identity_id":"bbbbbbbb-0000-4000-8000-000000000001"}', now()) $$,
  '%Identity not found%', 'a habit cannot move to another user''s identity'
);
select tracker.update_habit(t.u(89), t.h(99), '{"new_identity":{"name":" Third ","colour_token":"identity-4"}}', now());
select is(
  (select i.name || '/' || i.colour_token from public.identities i join public.habits h on h.identity_id = i.id where h.id = t.h(99)),
  'Third/identity-4',
  'a habit can move to a brand new identity'
);
select tracker.update_habit(t.u(89), t.h(99), '{"title":"Same place"}', now());
select is(
  (select count(*)::int from public.activity_events where user_id = t.u(89) and kind = 'habit_moved'), 2,
  'an edit that stays put records no move'
);

-- ---------------------------------------------------------------------------
-- Today
-- ---------------------------------------------------------------------------
select t.make_user(60, 'Asia/Kolkata');
select t.make_habit(60, 60, '2026-11-02');
select t.make_habit(61, 60, '2026-11-02', '{1,3}');
select t.make_habit(62, 60, '2026-11-02', '{2}');
insert into public.habit_levels (habit_id, level, description) values
  (t.h(60), 'full', 'Run 5 km'),
  (t.h(60), 'minimum', 'Run 1 km'),
  (t.h(60), 'setup', 'Put on shoes');
select t.pin(60);
select t.done(60, '2026-11-02', '2026-11-02', 'minimum');
select t.done(62, '2026-11-03', '2026-11-03');

-- 19:00 UTC on 3 Nov is already Wednesday 4 Nov in Kolkata.
select is(
  (select day from tracker.today_rows(t.u(60), '2026-11-03 19:00+00') where is_today limit 1),
  '2026-11-04'::date,
  'today follows the profile timezone'
);
select is(
  (select array_agg(habit_id::text order by title) from tracker.today_rows(t.u(60), '2026-11-03 19:00+00') where is_today),
  array[t.h(60)::text, t.h(61)::text],
  'only habits due today are listed'
);
select is(
  (select array_agg(habit_id::text order by title) from tracker.today_rows(t.u(60), '2026-11-03 19:00+00') where not is_today),
  array[t.h(60)::text],
  'yesterday lists only days that can still be back-logged'
);
select is(
  (select jsonb_array_length(levels) from tracker.today_rows(t.u(60), '2026-11-03 19:00+00') where is_today and habit_id = t.h(60)),
  3,
  'the Shrink ladder comes with the habit'
);
select is(
  (select levels -> 0 ->> 'level' from tracker.today_rows(t.u(60), '2026-11-03 19:00+00') where is_today and habit_id = t.h(60)),
  'full',
  'and is ordered from full to setup'
);
select is(
  (select level_done::text from tracker.today_rows(t.u(60), '2026-11-02 12:00+00') where is_today and habit_id = t.h(60)),
  'minimum',
  'the level already logged is returned'
);

select t.skip(61, '2026-11-04', 'Sick');
select is(
  (select skip_reason from tracker.today_rows(t.u(60), '2026-11-03 19:00+00') where is_today and habit_id = t.h(61)),
  'Sick',
  'the skip reason is returned'
);

select t.make_user(61);
select t.make_habit(63, 61, '2026-10-26', '{1,4}', 'count', 5);
select t.done(63, '2026-10-26', '2026-10-29');
select is(
  (select can_repair from tracker.today_rows(t.u(61), t.noon(61, '2026-11-05')) where is_today),
  true,
  'today offers a repair when the previous scheduled day was a miss'
);
select is(
  (select repair_amount from tracker.today_rows(t.u(61), t.noon(61, '2026-11-05')) where is_today),
  8::numeric,
  'and gives the amount it needs'
);
select t.make_user(62);
select t.make_habit(64, 62, '2026-11-02');
select t.done(64, '2026-11-02', '2026-11-02');
select is(
  (select can_repair from tracker.today_rows(t.u(62), t.noon(62, '2026-11-05')) where is_today),
  false,
  'no repair is offered after two misses in a row'
);
select t.make_user(63, 'UTC', 'strict');
select t.make_habit(65, 63, '2026-10-26', '{1,4}');
select t.done(65, '2026-10-26', '2026-10-29');
select is(
  (select can_repair from tracker.today_rows(t.u(63), t.noon(63, '2026-11-05')) where is_today),
  false,
  'no repair is offered in strict mode'
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
select is((select count(*)::int from public.get_today()), 1, 'and their Today list');
select lives_ok(
  $$ select public.create_habit(null, 'Second', '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', p_new_identity => '{"name":"Fresh","colour_token":"identity-3"}') $$,
  'a new identity and habit save in one call'
);
select is((select count(*)::int from public.identities where name = 'Fresh'), 1, 'and the identity exists');
select public.create_habit(null, 'Third', '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', p_new_identity => '{"name":"Fresher"}');
select throws_like(
  $$ select public.create_habit(null, 'Fourth', '[{"level":"full","description":"a"}]', p_new_identity => '{"name":"Stray"}') $$,
  '%full version and a minimum%', 'a refused habit says why'
);
select is((select count(*)::int from public.identities where name = 'Stray'), 0, 'and leaves no stray identity behind');
select throws_like(
  $$ select public.create_habit(null, 'X', '[{"level":"full","description":"a"},{"level":"minimum","description":"b"}]', p_new_identity => '{"name":"  "}') $$,
  '%Give the identity a name%', 'a new identity needs a name'
);
select throws_like(
  $$ select public.update_habit('aaaaaaaa-0000-4000-8000-000000000099', '{"title":"Hacked"}') $$,
  '%Habit not found%', 'clients cannot edit another user''s habit'
);
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
select throws_ok(
  $$ select * from public.get_today() $$,
  '42501', null, 'signed-out visitors cannot read Today'
);
reset role;


-- ---------------------------------------------------------------------------
-- Amounts add up through the day
-- ---------------------------------------------------------------------------
create function t.pages(n int, owner int) returns void language plpgsql as $$
begin
  perform t.make_habit(n, owner, '2026-11-02', '{1,2,3,4,5,6,7}', 'count', 10);
  update public.habits set unit = 'pages' where id = t.h(n);
  insert into public.habit_levels (habit_id, level, description, target)
  values (t.h(n), 'full', 'Ten pages', 10), (t.h(n), 'minimum', 'Two pages', 2);
  perform t.pin(n);
end $$;
create function t.add(n int, owner int, d date, amount numeric, unit text default null) returns jsonb language sql as
  $$ select tracker.add_amount(t.u(owner), t.h(n), d, amount, unit, 'voice', t.noon(owner, d)) $$;

select t.make_user(120);
select t.pages(400, 120);
select is((t.add(400, 120, '2026-11-02', 1) ->> 'status'), 'partial', '1 page of 10 is noted but not counted');
select is((select (status, amount)::text from public.habit_logs where habit_id = t.h(400)), '(partial,1)', 'with its amount kept');
select is(tracker.day_status(t.h(400), '2026-11-02', t.noon(120, '2026-11-02')), 'pending', 'so the day is still open');
select is((t.add(400, 120, '2026-11-02', 2) ->> 'level'), 'minimum', 'then 2 more is 3, which reaches the minimum');
select is(tracker.day_status(t.h(400), '2026-11-02', t.noon(120, '2026-11-02')), 'done', 'and counts');
select is(t.add(400, 120, '2026-11-02', 8) - 'repaired', '{"added": 8, "counted": true, "level": "full", "minimum": 2, "said_unit": null, "status": "done", "target": 10, "total": 11, "unit": "pages"}'::jsonb,
  '8 more is 11, done in full, and the reply says where it stands');
select is(t.add(400, 120, '2026-11-02', 2, 'lines') ->> 'counted', 'false', 'lines cannot count toward pages');
select is((select amount from public.habit_logs where habit_id = t.h(400)), 11::numeric, 'and nothing changed');
select tracker.remove_amount(t.u(120), t.h(400), '2026-11-02', 8, t.noon(120, '2026-11-02'));
select is((select (status, level_done, amount)::text from public.habit_logs where habit_id = t.h(400)), '(done,minimum,3)', 'undo takes back the last amount, and the level follows');
select tracker.remove_amount(t.u(120), t.h(400), '2026-11-02', 3, t.noon(120, '2026-11-02'));
select is((select count(*)::int from public.habit_logs where habit_id = t.h(400)), 0, 'and back to nothing, there is no log');

-- A tap raises the total to the level's target, and never lowers it.
select t.add(400, 120, '2026-11-03', 3);
select tracker.log_habit(t.u(120), t.h(400), '2026-11-03', 'full', 10, 'tap', t.noon(120, '2026-11-03'));
select is((select (level_done, amount)::text from public.habit_logs where habit_id = t.h(400) and date = '2026-11-03'), '(full,10)', 'a tap on full after 3 pages is 10');
select t.add(400, 120, '2026-11-04', 12);
select tracker.log_habit(t.u(120), t.h(400), '2026-11-04', 'minimum', 2, 'tap', t.noon(120, '2026-11-04'));
select is((select (level_done, amount)::text from public.habit_logs where habit_id = t.h(400) and date = '2026-11-04'), '(full,12)', 'a tap on minimum after 12 pages stays full at 12');

-- Below the minimum doesn't keep a streak.
select t.add(400, 120, '2026-11-05', 1);
select is(tracker.day_status(t.h(400), '2026-11-05', t.noon(120, '2026-11-07')), 'missed', 'a closed day below the minimum is a miss');
select is(t.streak(400, '2026-11-05', t.noon(120, '2026-11-07')), 0, 'and ends the streak');

-- Units convert.
select t.make_user(121);
select t.make_habit(401, 121, '2026-11-02', '{1,2,3,4,5,6,7}', 'count', 5);
update public.habits set unit = 'km' where id = t.h(401);
insert into public.habit_levels (habit_id, level, description, target) values (t.h(401), 'full', 'Run 5 km', 5), (t.h(401), 'minimum', 'Run 1 km', 1);
select t.pin(401);
select is((t.add(401, 121, '2026-11-02', 500, 'm') -> 'total')::numeric, 0.5, '500 m is 0.5 km');
select is((t.add(401, 121, '2026-11-02', 4500, 'metres') ->> 'status'), 'done', 'and 4500 metres more is 5 km, done');
select is(tracker.convert_amount(90, 'minutes', 'hours'), 1.5, 'minutes become hours');
select is(tracker.convert_amount(2, 'litre', 'ml'), 2000::numeric, 'litres become ml');
select is(tracker.convert_amount(2, 'glasses', 'litres'), null, 'glasses are not litres');
select is(tracker.convert_amount(3, null, 'pages'), 3::numeric, 'no unit is the habit''s own');

-- A habit with no minimum amount counts any amount as the minimum.
select t.make_user(122);
select t.make_habit(402, 122, '2026-11-02', '{1,2,3,4,5,6,7}', 'duration', 30);
update public.habits set unit = 'min' where id = t.h(402);
insert into public.habit_levels (habit_id, level, description, target) values (t.h(402), 'full', 'Thirty', 30), (t.h(402), 'minimum', 'A little', null);
select t.pin(402);
select is((t.add(402, 122, '2026-11-02', 5) ->> 'level'), 'minimum', 'any amount counts when the minimum has no amount');

-- The total repairs a miss at 1.5x the missed day's target.
select t.make_user(123);
select t.pages(403, 123);
select is((t.add(403, 123, '2026-11-03', 12) ->> 'repaired'), 'false', '12 pages after a miss is not yet 1.5x');
select is((t.add(403, 123, '2026-11-03', 3) ->> 'repaired'), 'true', '15 pages is, and repairs it');
select is((select status::text from public.habit_logs where habit_id = t.h(403) and date = '2026-11-02'), 'repaired', 'the missed day is repaired');
select tracker.remove_amount(t.u(123), t.h(403), '2026-11-03', 3, t.noon(123, '2026-11-03'));
select is((select count(*)::int from public.habit_logs where habit_id = t.h(403) and date = '2026-11-02'), 0, 'undoing below 1.5x takes the repair back');

-- The dated target applies to each day.
select t.make_user(124);
select t.pages(404, 124);
insert into tracker.habit_versions (habit_id, effective_from, schedule_days, target, unit, levels)
values (t.h(404), '2026-11-04', '{1,2,3,4,5,6,7}', 20, 'pages', '[{"level":"full","description":"Twenty","target":20},{"level":"minimum","description":"Four","target":4}]');
select is((t.add(404, 124, '2026-11-03', 10) ->> 'level'), 'full', 'before the change, 10 pages is full');
select is((t.add(404, 124, '2026-11-04', 10) ->> 'level'), 'minimum', 'after it, 10 pages is the minimum');

select throws_like($$ select t.add(1, 1, '2026-11-02', 3) $$, '%no amount%', 'a yes/no habit takes no amount');
select throws_like($$ select t.add(400, 120, '2026-11-06', 0) $$, '%above 0%', 'an amount must be above 0');


-- ---------------------------------------------------------------------------
-- Times per week. 2 Nov 2026 is a Monday.
-- ---------------------------------------------------------------------------
create function t.weekly(n int, owner int, starts date, times smallint default 4) returns void language plpgsql as $$
begin
  perform t.make_habit(n, owner, starts);
  update public.habits set frequency = 'per_week', per_week = times where id = t.h(n);
  insert into public.habit_levels (habit_id, level, description, target)
  values (t.h(n), 'full', 'Work out', null), (t.h(n), 'minimum', 'Stretch', null);
  perform t.pin(n);
end $$;
create function t.session(n int, owner int, d date, lvl public.habit_level default 'full') returns void language sql as
  $$ select tracker.log_habit(t.u(owner), t.h(n), d, lvl, null, 'tap', t.noon(owner, d)) $$;
create function t.week(n int, w date, at timestamptz) returns text language sql stable as
  $$ select tracker.week_status(t.h(n), w, at) $$;

select t.make_user(130);
select t.weekly(500, 130, '2026-11-02');
select is(tracker.is_scheduled(t.h(500), '2026-11-03'), false, 'a times-per-week habit is never due on a single day');
select is(tracker.day_status(t.h(500), '2026-11-03', t.noon(130, '2026-11-05')), 'unscheduled', 'so a day without a session is never a miss');
select t.session(500, 130, '2026-11-02');
select t.session(500, 130, '2026-11-03', 'minimum');
select is(
  (select (week_done, week_quota, week_days_left)::text from tracker.today_rows(t.u(130), t.noon(130, '2026-11-04')) where habit_id = t.h(500)),
  '(2,4,5)', 'Today shows 2 of 4, with 5 days left including today'
);
select is(t.week(500, '2026-11-02', t.noon(130, '2026-11-04')), 'pending', 'the week is still open');
select t.session(500, 130, '2026-11-04');
select t.session(500, 130, '2026-11-05');
select is(t.week(500, '2026-11-02', t.noon(130, '2026-11-05')), 'met', 'met early on Thursday, a minimum session counting');
select is(t.streak(500, '2026-11-05', t.noon(130, '2026-11-05')), 1, 'a 1-week streak');
select t.session(500, 130, '2026-11-07');
select is(tracker.week_sessions(t.h(500), '2026-11-02'), 5, 'an extra session is counted');
select t.session(500, 130, '2026-11-07', 'minimum');
select is(tracker.week_sessions(t.h(500), '2026-11-02'), 5, 'and two on one day count once');
select t.add(400, 120, '2026-11-02', 1);
select is(
  (select (status, week_done)::text from tracker.today_rows(t.u(130), t.noon(130, '2026-11-08')) where habit_id = t.h(500)),
  '(pending,5)', 'Sunday with no log of its own is open, with the week''s sessions'
);
select is((select count(*)::int from tracker.today_rows(t.u(130), t.noon(130, '2026-11-08')) where habit_id = t.h(500) and not is_today),
  0, 'and is never shown as yesterday');

-- A met week counts as 7 consistent days, so a weekly-only person earns a Grace Day.
select tracker.settle(t.u(130), t.noon(130, '2026-11-11'));
select is(tracker.grace_bank(t.u(130)), 1, 'a met week earns a Grace Day');
-- The next week ends at 2 of 4: the Grace Day covers it.
select t.session(500, 130, '2026-11-09');
select t.session(500, 130, '2026-11-10');
select tracker.settle(t.u(130), t.noon(130, '2026-11-18'));
select is(t.week(500, '2026-11-09', t.noon(130, '2026-11-18')), 'protected', 'a missed week is covered by a Grace Day');
select is(tracker.grace_bank(t.u(130)), 0, 'which is spent');
select is(t.streak(500, '2026-11-18', t.noon(130, '2026-11-18')), 1, 'and the streak in weeks survives');
select is(
  (select array_agg(tracker.day_status(t.h(500), d::date, t.noon(130, '2026-11-18'))::text order by d)
   from generate_series('2026-11-09'::date, '2026-11-15'::date, interval '1 day') d),
  array['done', 'done', 'unscheduled', 'unscheduled', 'unscheduled', 'unscheduled', 'protected'],
  'Progress sees the sessions, and Sunday, when 4 went out of reach, as protected'
);

-- No Grace Day: one extra session the next week repairs it.
select t.make_user(131);
select t.weekly(501, 131, '2026-11-02', 3::smallint);
select t.session(501, 131, '2026-11-02');
select is(t.week(501, '2026-11-02', t.noon(131, '2026-11-11')), 'missed', '1 of 3 is a missed week');
select is(t.streak(501, '2026-11-11', t.noon(131, '2026-11-11')), 0, 'and no streak');
select t.session(501, 131, '2026-11-09');
select t.session(501, 131, '2026-11-10');
select t.session(501, 131, '2026-11-11');
select is(t.week(501, '2026-11-02', t.noon(131, '2026-11-11')), 'missed', 'the quota alone the next week does not repair it');
select t.session(501, 131, '2026-11-12');
select is(t.week(501, '2026-11-02', t.noon(131, '2026-11-12')), 'repaired', 'one extra session on top of the quota does');
select is(t.streak(501, '2026-11-12', t.noon(131, '2026-11-12')), 2, 'a repaired week counts in the streak');
-- Two missed weeks in a row: the second can't be repaired.
select t.make_user(132);
select t.weekly(502, 132, '2026-11-02', 2::smallint);
select t.session(502, 132, '2026-11-16');
select t.session(502, 132, '2026-11-17');
select t.session(502, 132, '2026-11-18');
select is(t.week(502, '2026-11-09', t.noon(132, '2026-11-18')), 'missed', 'a second missed week in a row stays missed');

-- A week that starts part-way asks only as many as it has days.
select t.make_user(133);
select t.weekly(503, 133, '2026-11-06', 4::smallint);
select is(tracker.week_quota(t.h(503), '2026-11-02'), 3, 'starting on Friday, 4 a week asks 3 that week');
select is(tracker.week_quota(t.h(503), '2026-11-09'), 4, 'and 4 the week after');

-- Weeks run Monday to Sunday on the person's own dates, closing with Sunday's back-log.
select is(tracker.week_of('2026-11-08'), '2026-11-02'::date, 'Sunday belongs to the week before');
select is(tracker.week_of('2026-11-09'), '2026-11-09'::date, 'Monday starts a new one');
select t.make_user(134, 'Asia/Kolkata');
select t.weekly(504, 134, '2026-11-02', 1::smallint);
select is(t.week(504, '2026-11-02', '2026-11-09 12:00+00'), 'pending', 'in India, Monday afternoon still has Sunday to back-log');
select is(t.week(504, '2026-11-02', '2026-11-09 19:00+00'), 'missed', 'and after midnight on Tuesday, India time, the week is closed');
select t.make_user(135, 'America/Los_Angeles');
select t.weekly(505, 135, '2026-11-02', 1::smallint);
select is(t.week(505, '2026-11-02', '2026-11-09 19:00+00'), 'pending', 'while in Los Angeles it is still open');

-- Switching between specific days and times per week is dated.
select t.make_user(136);
select t.make_habit(506, 136, '2026-11-02');
select t.pin(506);
insert into tracker.habit_versions (habit_id, effective_from, schedule_days, target, unit, levels, frequency, per_week)
select habit_id, '2026-11-09', schedule_days, target, unit, levels, 'per_week', 3 from tracker.habit_versions where habit_id = t.h(506);
select is(tracker.is_scheduled(t.h(506), '2026-11-04'), true, 'before the switch it was due on its days');
select is(tracker.day_status(t.h(506), '2026-11-04', t.noon(136, '2026-11-20')), 'missed', 'and a day not done then stays a miss');
select is(tracker.weekly_on(t.h(506), '2026-11-10'), true, 'after it, it counts by the week');
select is(tracker.week_quota(t.h(506), '2026-11-09'), 3, 'with its new times per week');

-- ---------------------------------------------------------------------------
-- Ending a habit
-- ---------------------------------------------------------------------------
select t.make_user(137);
select t.make_habit(507, 137, '2026-11-02');
update public.habits set ends_on = '2026-11-04' where id = t.h(507);
insert into public.habit_levels (habit_id, level, description, target) values (t.h(507), 'full', 'Read', null), (t.h(507), 'minimum', 'A page', null);
select t.pin(507);
select t.done(507, '2026-11-02', '2026-11-04');
select is(tracker.is_scheduled(t.h(507), '2026-11-05'), false, 'after its end a habit is not due');
select is(tracker.day_status(t.h(507), '2026-11-06', t.noon(137, '2026-11-10')), 'unscheduled', 'and never missed');
select is(t.streak(507, '2026-11-10', t.noon(137, '2026-11-10')), 3, 'so its streak stands');
select is((select count(*)::int from tracker.today_rows(t.u(137), t.noon(137, '2026-11-05')) where habit_id = t.h(507)), 0, 'and it is gone from Today');
select throws_like(
  $$ select tracker.log_habit(t.u(137), t.h(507), '2026-11-05', 'full', null, 'tap', t.noon(137, '2026-11-05')) $$,
  '%has ended%', 'it cannot be logged after its end'
);
select set_config('request.jwt.claims', json_build_object('sub', t.u(137), 'role', 'authenticated')::text, true);
select is(
  (select (days_done, best_streak, restarted)::text from public.get_completed_habits() where habit_id = t.h(507)),
  '(3,3,f)', 'it is in Completed habits, with days done and its best streak'
);
select lives_ok($$ select public.restart_habit(t.h(507)) $$, 'it can be restarted');
select is(
  (select (h.starts_on = tracker.local_date(t.u(137), now()), h.ends_on - h.starts_on, h.title)::text
   from public.habits h where h.previous_run_id = t.h(507)),
  '(t,2,"Habit 507")', 'as a new run from today, the same length'
);
select is((select count(*)::int from public.habit_logs where habit_id = t.h(507)), 3, 'and the old run keeps its history');
select is((select restarted from public.get_completed_habits() where habit_id = t.h(507)), true, 'marked as restarted');
select throws_like($$ select public.restart_habit((select id from public.habits where previous_run_id = t.h(507))) $$,
  '%not ended%', 'a habit still running cannot be restarted');
select set_config('request.jwt.claims', '', true);

-- A weekly habit that ends part-way through a week asks only for its days.
select t.make_user(138);
select t.weekly(508, 138, '2026-11-02', 4::smallint);
update public.habits set ends_on = '2026-11-03' where id = t.h(508);
select t.pin(508);
select is(tracker.week_quota(t.h(508), '2026-11-02'), 2, 'ending on Tuesday, the week asks 2');


-- The chain of weeks.
select t.make_user(139);
select t.weekly(509, 139, '2026-11-02', 3::smallint);
select t.session(509, 139, '2026-11-02');
select is(tracker.week_repair_by(t.h(509), '2026-11-02', t.noon(139, '2026-11-11')), '2026-11-09'::date,
  'a missed week can be repaired the next week, while it is open');
select is(tracker.week_repair_by(t.h(509), '2026-11-02', t.noon(139, '2026-11-17')), null::date,
  'and not once the next week has closed');
select is(tracker.week_repair_by(t.h(501), '2026-11-02', t.noon(131, '2026-11-12')), null::date,
  'a repaired week has nothing left to repair');
select is(tracker.week_repair_by(t.h(502), '2026-11-09', t.noon(132, '2026-11-18')), null::date,
  'nor after two missed weeks in a row');
select set_config('request.jwt.claims', json_build_object('sub', t.u(130), 'role', 'authenticated')::text, true);
select is(
  (select (status, quota, sessions)::text from public.get_week_statuses('2026-11-02', '2026-11-08')),
  '(met,4,5)',
  'each week comes back with its status, quota and sessions'
);
select set_config('request.jwt.claims', '', true);


-- The order habits are dragged into.
select t.make_user(140);
select t.make_habit(510, 140, '2026-11-02');
select t.make_habit(511, 140, '2026-11-02');
select set_config('request.jwt.claims', json_build_object('sub', t.u(140), 'role', 'authenticated')::text, true);
select public.set_habit_order(array[t.h(511), t.h(510)]);
select is(
  (select array_agg(habit_id order by sort_order) from tracker.today_rows(t.u(140), t.noon(140, '2026-11-03')) where is_today),
  array[t.h(511), t.h(510)], 'Today returns habits with the order they were dragged into'
);
select throws_like($$ select public.set_habit_order(array[t.h(1)]) $$, '%not found%', 'only your own habits can be ordered');
select set_config('request.jwt.claims', '', true);


-- Analytics: the days and weeks behind every metric.
select is(jsonb_array_length(tracker.build_analytics(t.u(120), '2026-11-02', '2026-11-05', t.noon(120, '2026-11-07')) -> 'days'), 4,
  'every day a habit was due comes back');
select is(
  (select d ->> 'log_status' from jsonb_array_elements(tracker.build_analytics(t.u(120), '2026-11-02', '2026-11-05', t.noon(120, '2026-11-07')) -> 'days') d
   where d ->> 'date' = '2026-11-05'),
  'partial', 'a day below the minimum is marked as such'
);
select is(
  (select (d ->> 'status', (d ->> 'minimum')::numeric, (d ->> 'target')::numeric)::text
   from jsonb_array_elements(tracker.build_analytics(t.u(120), '2026-11-02', '2026-11-05', t.noon(120, '2026-11-07')) -> 'days') d
   where d ->> 'date' = '2026-11-05'),
  '(missed,2,10)', 'with its status, minimum and target that day'
);
select is(jsonb_array_length(tracker.build_analytics(t.u(130), '2026-11-02', '2026-11-15', t.noon(130, '2026-11-18')) -> 'weeks'), 2,
  'a times-per-week habit comes back by the week');
select tracker.settle(t.u(130), t.noon(130, '2026-11-18'));
select is(jsonb_array_length(tracker.build_analytics(t.u(130), '2026-11-02', '2026-11-15', t.noon(130, '2026-11-18')) -> 'grace_spent'), 1,
  'with the Grace Days spent in the range');
select set_config('request.jwt.claims', json_build_object('sub', t.u(120), 'role', 'authenticated')::text, true);
select lives_ok($$ select public.get_analytics('2026-11-02', '2026-11-05') $$, 'it can be read');
select is((select count(*)::int from tracker.analytics_cache where user_id = t.u(120)), 1, 'and is cached');
select is(public.get_analytics('2026-11-02', '2026-11-05'), (select payload from tracker.analytics_cache where user_id = t.u(120)),
  'and read back from the cache while nothing changed');
select throws_like($$ select public.get_analytics('2024-01-01', '2026-11-05') $$, '%too long%', 'a range is capped');
select set_config('request.jwt.claims', '', true);


-- The set-based day facts agree with day_status on every fixture day.
select is(
  (select count(*)::int
   from public.users u
   cross join lateral tracker.day_facts(u.id, '2026-09-01', '2026-12-31', '2026-11-20 12:00+00') f
   where not f.weekly
     and f.raw_status <> 'unscheduled'
     and tracker.day_status(f.habit_id, f.date, '2026-11-20 12:00+00') is distinct from (
       case
         when f.raw_status in ('missed', 'pending') and exists (
           select 1 from public.grace_days g where g.spent_on_habit = f.habit_id and g.spent_for_date = f.date
         ) then 'protected'
         else f.raw_status
       end
     )),
  0, 'the day facts agree with day_status for every habit on every day'
);
select cmp_ok(
  (select count(*)::int from public.users u cross join lateral tracker.day_facts(u.id, '2026-09-01', '2026-12-31', '2026-11-20 12:00+00') f
   where not f.weekly and f.raw_status <> 'unscheduled'),
  '>', 500, 'over enough fixture days to mean something'
);
select is(
  (select count(*)::int
   from public.users u
   cross join lateral tracker.day_facts(u.id, '2026-09-01', '2026-12-31', '2026-11-20 12:00+00') f
   where tracker.is_scheduled(f.habit_id, f.date) is distinct from (not f.weekly and f.raw_status <> 'unscheduled')),
  0, 'and on which days a habit is due'
);


-- Analytics streaks agree with the streak rules for every daily habit.
select is(
  (select count(*)::int
   from public.users u
   cross join lateral jsonb_array_elements(tracker.build_analytics(u.id, '2026-11-01', '2026-11-20', '2026-11-20 12:00+00') -> 'habits') h
   cross join lateral tracker.streak_stats((h ->> 'id')::uuid, '2026-11-20', '2026-11-20 12:00+00') s
   where h ->> 'frequency' = 'days'
     and ((h ->> 'current_streak')::int is distinct from s.current_streak
       or (h ->> 'longest_streak')::int is distinct from s.longest_streak)),
  0, 'analytics streaks agree with streak_stats'
);


-- The set-based weeks agree with week_status on every fixture week.
select is(
  (select count(*)::int
   from public.users u
   cross join lateral jsonb_array_elements(tracker.build_analytics(u.id, '2026-09-01', '2026-11-20', '2026-11-20 12:00+00') -> 'weeks') w
   where w ->> 'status' is distinct from tracker.week_status((w ->> 'habit_id')::uuid, (w ->> 'week_start')::date, '2026-11-20 12:00+00')
      or (w ->> 'quota')::int is distinct from tracker.week_quota((w ->> 'habit_id')::uuid, (w ->> 'week_start')::date)
      or (w ->> 'sessions')::int is distinct from tracker.week_sessions((w ->> 'habit_id')::uuid, (w ->> 'week_start')::date)),
  0, 'analytics weeks agree with week_status, its quota and its sessions'
);
select cmp_ok(
  (select count(*)::int from public.users u
   cross join lateral jsonb_array_elements(tracker.build_analytics(u.id, '2026-09-01', '2026-11-20', '2026-11-20 12:00+00') -> 'weeks') w),
  '>', 10, 'over enough fixture weeks to mean something'
);
select is(
  (select count(*)::int
   from public.users u
   cross join lateral jsonb_array_elements(tracker.build_analytics(u.id, '2026-11-01', '2026-11-20', '2026-11-20 12:00+00') -> 'habits') h
   cross join lateral tracker.week_streak_stats((h ->> 'id')::uuid, '2026-11-20', '2026-11-20 12:00+00') s
   where h ->> 'frequency' = 'per_week'
     and ((h ->> 'current_streak')::int is distinct from s.current_streak
       or (h ->> 'longest_streak')::int is distinct from s.longest_streak)),
  0, 'and week streaks agree with week_streak_stats'
);

select * from finish();
rollback;
