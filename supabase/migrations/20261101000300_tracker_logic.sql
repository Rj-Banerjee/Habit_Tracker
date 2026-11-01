-- Tracker rules from the "Streak rules" section of PLAN.md.
--
-- The tracker schema is private. Its functions take the current time as a
-- parameter so tests can control it. Clients only reach the public wrappers at
-- the end of this file, which always use the real clock.

alter function public.is_valid_timezone(text) set search_path = '';

create schema tracker;
revoke all on schema tracker from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Days and time
-- ---------------------------------------------------------------------------

create function tracker.user_timezone(p_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select timezone from public.users where id = p_user;
$$;

create function tracker.local_date(p_user uuid, p_now timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_now at time zone tracker.user_timezone(p_user))::date;
$$;

-- A day can be back-logged until 24 hours after the midnight that ends it.
-- This is elapsed time, so it stays 24 hours across daylight-saving changes.
create function tracker.window_closes_at(p_user uuid, p_date date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_date + 1)::timestamp at time zone tracker.user_timezone(p_user))
    + interval '24 hours';
$$;

create function tracker.habit_owner(p_habit uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select i.user_id
  from public.habits h
  join public.identities i on i.id = h.identity_id
  where h.id = p_habit;
$$;

create function tracker.is_scheduled(p_habit uuid, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.habits h
    where h.id = p_habit
      and p_date >= h.starts_on
      and extract(isodow from p_date)::smallint = any (h.schedule_days)
  );
$$;

create function tracker.previous_scheduled_day(p_habit uuid, p_date date)
returns date
language sql
stable
set search_path = ''
as $$
  select offs.day
  from (select p_date - n as day from generate_series(1, 7) as n) as offs
  where tracker.is_scheduled(p_habit, offs.day)
  order by offs.day desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Status of one habit on one day. "Missed" is computed here and never stored.
-- ---------------------------------------------------------------------------

-- The third or later skip in any rolling 7 days counts as a miss.
create function tracker.skip_is_over_limit(p_habit uuid, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select count(*) >= 3
  from public.habit_logs
  where habit_id = p_habit
    and status = 'skipped'
    and date between p_date - 6 and p_date;
$$;

create function tracker.day_status(p_habit uuid, p_date date, p_now timestamptz)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_status public.log_status;
begin
  if not tracker.is_scheduled(p_habit, p_date) then
    return 'unscheduled';
  end if;

  select status into v_status
  from public.habit_logs
  where habit_id = p_habit and date = p_date;

  if v_status in ('done', 'repaired') then
    return v_status::text;
  end if;

  if v_status = 'skipped' and not tracker.skip_is_over_limit(p_habit, p_date) then
    return 'skipped';
  end if;

  if exists (
    select 1 from public.grace_days
    where spent_on_habit = p_habit and spent_for_date = p_date
  ) then
    return 'protected';
  end if;

  if p_now >= tracker.window_closes_at(tracker.habit_owner(p_habit), p_date) then
    return 'missed';
  end if;

  return 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- Streaks
-- ---------------------------------------------------------------------------

-- Done and repaired days add to the streak. A miss ends it. Skipped, protected,
-- pending and unscheduled days leave it unchanged.
create function tracker.streak_stats(
  p_habit uuid,
  p_through date,
  p_now timestamptz,
  out current_streak int,
  out longest_streak int
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start date;
  v_day date;
  v_status text;
begin
  current_streak := 0;
  longest_streak := 0;

  select starts_on into v_start from public.habits where id = p_habit;
  if v_start is null then
    return;
  end if;

  v_day := v_start;
  while v_day <= p_through loop
    v_status := tracker.day_status(p_habit, v_day, p_now);
    if v_status in ('done', 'repaired') then
      current_streak := current_streak + 1;
      longest_streak := greatest(longest_streak, current_streak);
    elsif v_status = 'missed' then
      current_streak := 0;
    end if;
    v_day := v_day + 1;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grace Days
-- ---------------------------------------------------------------------------

create function tracker.grace_bank(p_user uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int
  from public.grace_days
  where user_id = p_user and spent_for_date is null;
$$;

create function tracker.due_habits(p_user uuid, p_date date)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select h.id
  from public.habits h
  join public.identities i on i.id = h.identity_id
  where i.user_id = p_user
    and tracker.is_scheduled(h.id, p_date)
    and (
      h.archived_at is null
      or (h.archived_at at time zone tracker.user_timezone(p_user))::date > p_date
    )
  order by h.created_at, h.id;
$$;

-- 'complete': every due habit was done or repaired.
-- 'paused': a skip, with no miss. It neither adds to the run nor resets it.
-- 'broken': a miss, including a protected one, because that habit wasn't completed.
-- 'none': nothing was due, so the day is ignored.
create function tracker.day_outcome(p_user uuid, p_date date, p_now timestamptz)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_habit uuid;
  v_status text;
  v_any_due boolean := false;
  v_any_skip boolean := false;
begin
  for v_habit in select tracker.due_habits(p_user, p_date) loop
    v_any_due := true;
    v_status := tracker.day_status(v_habit, p_date, p_now);
    if v_status in ('missed', 'protected', 'pending') then
      return 'broken';
    elsif v_status = 'skipped' then
      v_any_skip := true;
    end if;
  end loop;

  if not v_any_due then
    return 'none';
  elsif v_any_skip then
    return 'paused';
  end if;
  return 'complete';
end;
$$;

-- Length of the run of complete days ending on p_date.
create function tracker.complete_run(p_user uuid, p_date date, p_now timestamptz)
returns int
language plpgsql
stable
set search_path = ''
as $$
declare
  v_first date;
  v_day date := p_date;
  v_outcome text;
  v_run int := 0;
begin
  select min(h.starts_on) into v_first
  from public.habits h
  join public.identities i on i.id = h.identity_id
  where i.user_id = p_user;

  while v_first is not null and v_day >= v_first loop
    v_outcome := tracker.day_outcome(p_user, v_day, p_now);
    if v_outcome = 'broken' then
      exit;
    elsif v_outcome = 'complete' then
      v_run := v_run + 1;
    end if;
    v_day := v_day - 1;
  end loop;

  return v_run;
end;
$$;

-- Applies each newly closed day once, oldest first, so outcomes are recorded in
-- order and survive later changes of timezone or mode.
create function tracker.settle(p_user uuid, p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_mode public.streak_mode;
  v_settled date;
  v_day date;
  v_last_closed date;
  v_habit uuid;
  v_grace_id uuid;
begin
  select mode, settled_through into v_mode, v_settled
  from public.users
  where id = p_user
  for update;

  if v_settled is null then
    select min(h.starts_on) - 1 into v_settled
    from public.habits h
    join public.identities i on i.id = h.identity_id
    where i.user_id = p_user;
  end if;

  if v_settled is null then
    return;
  end if;

  v_last_closed := tracker.local_date(p_user, p_now);
  while tracker.window_closes_at(p_user, v_last_closed) > p_now loop
    v_last_closed := v_last_closed - 1;
  end loop;

  v_day := v_settled + 1;
  while v_day <= v_last_closed loop
    if v_mode = 'grace' then
      for v_habit in select tracker.due_habits(p_user, v_day) loop
        if tracker.day_status(v_habit, v_day, p_now) = 'missed'
          and (tracker.streak_stats(v_habit, v_day - 1, p_now)).current_streak > 0
        then
          select id into v_grace_id
          from public.grace_days
          where user_id = p_user and spent_for_date is null
          order by earned_at, id
          limit 1;

          if v_grace_id is not null then
            update public.grace_days
            set spent_on_habit = v_habit, spent_for_date = v_day
            where id = v_grace_id;
          end if;
        end if;
      end loop;

      if tracker.day_outcome(p_user, v_day, p_now) = 'complete'
        and tracker.complete_run(p_user, v_day, p_now) % 7 = 0
        and tracker.grace_bank(p_user) < 3
      then
        insert into public.grace_days (user_id, earned_at)
        values (p_user, tracker.window_closes_at(p_user, v_day));
      end if;
    end if;

    v_day := v_day + 1;
  end loop;

  if v_last_closed > coalesce((select settled_through from public.users where id = p_user), v_settled) then
    update public.users set settled_through = v_last_closed where id = p_user;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Logging
-- ---------------------------------------------------------------------------

create function tracker.assert_can_change_day(
  p_user uuid,
  p_habit uuid,
  p_date date,
  p_now timestamptz
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if tracker.habit_owner(p_habit) is distinct from p_user then
    raise exception 'Habit not found';
  end if;
  if p_date > tracker.local_date(p_user, p_now) then
    raise exception 'That day has not happened yet';
  end if;
  if p_now >= tracker.window_closes_at(p_user, p_date) then
    raise exception 'The back-log window for that day has closed';
  end if;
  if not tracker.is_scheduled(p_habit, p_date) then
    raise exception 'That habit is not scheduled on that day';
  end if;
end;
$$;

create function tracker.full_target(p_habit uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select target from public.habit_levels where habit_id = p_habit and level = 'full'),
    (select target from public.habits where id = p_habit)
  );
$$;

create function tracker.log_habit(
  p_user uuid,
  p_habit uuid,
  p_date date,
  p_level public.habit_level,
  p_amount numeric,
  p_source public.log_source,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform tracker.assert_can_change_day(p_user, p_habit, p_date, p_now);

  insert into public.habit_logs (habit_id, date, level_done, amount, status, source, logged_at)
  values (p_habit, p_date, p_level, p_amount, 'done', p_source, p_now)
  on conflict (habit_id, date) do update
  set level_done = excluded.level_done,
      amount = excluded.amount,
      status = 'done',
      skip_reason = null,
      source = excluded.source,
      logged_at = excluded.logged_at;
end;
$$;

create function tracker.skip_habit(
  p_user uuid,
  p_habit uuid,
  p_date date,
  p_reason text,
  p_source public.log_source,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform tracker.assert_can_change_day(p_user, p_habit, p_date, p_now);

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A skip needs a reason';
  end if;

  insert into public.habit_logs (habit_id, date, status, skip_reason, source, logged_at)
  values (p_habit, p_date, 'skipped', btrim(p_reason), p_source, p_now)
  on conflict (habit_id, date) do update
  set level_done = null,
      amount = null,
      status = 'skipped',
      skip_reason = excluded.skip_reason,
      source = excluded.source,
      logged_at = excluded.logged_at;
end;
$$;

-- Removes a day's log. If that log was a repair, the repaired miss is restored too.
create function tracker.undo_log(p_user uuid, p_habit uuid, p_date date, p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_logged_at timestamptz;
  v_missed_day date;
begin
  perform tracker.assert_can_change_day(p_user, p_habit, p_date, p_now);

  delete from public.habit_logs
  where habit_id = p_habit and date = p_date
  returning logged_at into v_logged_at;

  v_missed_day := tracker.previous_scheduled_day(p_habit, p_date);
  delete from public.habit_logs
  where habit_id = p_habit
    and date = v_missed_day
    and status = 'repaired'
    and logged_at = v_logged_at;
end;
$$;

-- A miss the user can still act on. A day inside its back-log window counts,
-- because 'pending' only means nothing has been completed on it yet.
create function tracker.is_open_miss(p_habit uuid, p_date date, p_now timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select tracker.day_status(p_habit, p_date, p_now) in ('missed', 'pending');
$$;

-- Repairs the miss on the scheduled day before p_date, using extra work on p_date.
create function tracker.repair_habit(
  p_user uuid,
  p_habit uuid,
  p_date date,
  p_amount numeric,
  p_full_and_minimum boolean,
  p_source public.log_source,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_type public.habit_type;
  v_missed_day date;
  v_day_before date;
  v_required numeric;
begin
  perform tracker.assert_can_change_day(p_user, p_habit, p_date, p_now);

  if (select mode from public.users where id = p_user) = 'strict' then
    raise exception 'Streak Repair is off in Strict mode';
  end if;

  v_missed_day := tracker.previous_scheduled_day(p_habit, p_date);
  if v_missed_day is null or not tracker.is_open_miss(p_habit, v_missed_day, p_now) then
    raise exception 'There is no miss to repair on the previous scheduled day';
  end if;

  v_day_before := tracker.previous_scheduled_day(p_habit, v_missed_day);
  if v_day_before is not null and tracker.is_open_miss(p_habit, v_day_before, p_now) then
    raise exception 'Two misses in a row cannot be repaired';
  end if;

  select type into v_type from public.habits where id = p_habit;
  if v_type in ('count', 'duration') then
    v_required := ceil(tracker.full_target(p_habit) * 1.5);
    if coalesce(p_amount, 0) < v_required then
      raise exception 'A repair needs at least %', v_required;
    end if;
  elsif not coalesce(p_full_and_minimum, false) then
    raise exception 'A repair needs the full version plus the minimum version';
  end if;

  insert into public.habit_logs (habit_id, date, level_done, amount, status, source, logged_at)
  values (p_habit, p_date, 'full', p_amount, 'done', p_source, p_now)
  on conflict (habit_id, date) do update
  set level_done = 'full',
      amount = excluded.amount,
      status = 'done',
      skip_reason = null,
      source = excluded.source,
      logged_at = excluded.logged_at;

  insert into public.habit_logs (habit_id, date, status, source, logged_at)
  values (p_habit, v_missed_day, 'repaired', p_source, p_now)
  on conflict (habit_id, date) do update
  set status = 'repaired',
      level_done = null,
      amount = null,
      source = excluded.source,
      logged_at = excluded.logged_at;
end;
$$;

-- New habits start on the owner's local today unless told otherwise.
create function tracker.set_habit_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.starts_on is null then
    new.starts_on := tracker.local_date(
      (select user_id from public.identities where id = new.identity_id),
      now()
    );
  end if;
  return new;
end;
$$;

alter table public.habits alter column starts_on drop default;

create trigger habits_set_start
  before insert on public.habits
  for each row execute function tracker.set_habit_start();

-- ---------------------------------------------------------------------------
-- Client API. These use the signed-in user and the real clock.
-- ---------------------------------------------------------------------------

create function tracker.current_user_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create function public.log_habit(
  p_habit_id uuid,
  p_date date default null,
  p_level public.habit_level default 'full',
  p_amount numeric default null,
  p_source public.log_source default 'tap'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  perform tracker.log_habit(
    v_user, p_habit_id, coalesce(p_date, tracker.local_date(v_user, now())),
    p_level, p_amount, p_source, now()
  );
end;
$$;

create function public.skip_habit(
  p_habit_id uuid,
  p_reason text,
  p_date date default null,
  p_source public.log_source default 'tap'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  perform tracker.skip_habit(
    v_user, p_habit_id, coalesce(p_date, tracker.local_date(v_user, now())),
    p_reason, p_source, now()
  );
end;
$$;

create function public.undo_log(p_habit_id uuid, p_date date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  perform tracker.undo_log(
    v_user, p_habit_id, coalesce(p_date, tracker.local_date(v_user, now())), now()
  );
end;
$$;

create function public.repair_habit(
  p_habit_id uuid,
  p_date date default null,
  p_amount numeric default null,
  p_full_and_minimum boolean default false,
  p_source public.log_source default 'tap'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  perform tracker.repair_habit(
    v_user, p_habit_id, coalesce(p_date, tracker.local_date(v_user, now())),
    p_amount, p_full_and_minimum, p_source, now()
  );
end;
$$;

create function public.get_streaks()
returns table (
  habit_id uuid,
  current_streak int,
  longest_streak int,
  today_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_today date := tracker.local_date(v_user, now());
begin
  perform tracker.settle(v_user, now());

  return query
  select
    h.id,
    s.current_streak,
    s.longest_streak,
    tracker.day_status(h.id, v_today, now())
  from public.habits h
  join public.identities i on i.id = h.identity_id
  cross join lateral tracker.streak_stats(
    h.id,
    greatest(
      v_today,
      (select max(l.date) from public.habit_logs l where l.habit_id = h.id)
    ),
    now()
  ) s
  where i.user_id = v_user and h.archived_at is null;
end;
$$;

create function public.get_grace_bank()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  perform tracker.settle(v_user, now());
  return tracker.grace_bank(v_user);
end;
$$;

create function public.get_day_statuses(p_from date, p_to date)
returns table (habit_id uuid, date date, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  if p_to - p_from > 400 then
    raise exception 'Date range is too long';
  end if;

  perform tracker.settle(v_user, now());

  return query
  select h.id, d::date, tracker.day_status(h.id, d::date, now())
  from public.habits h
  join public.identities i on i.id = h.identity_id
  cross join generate_series(p_from, p_to, interval '1 day') as d
  where i.user_id = v_user and h.archived_at is null;
end;
$$;

-- All log changes go through the rules above.
revoke insert, update, delete on public.habit_logs from authenticated;

revoke all on function public.log_habit(uuid, date, public.habit_level, numeric, public.log_source) from public, anon;
revoke all on function public.skip_habit(uuid, text, date, public.log_source) from public, anon;
revoke all on function public.undo_log(uuid, date) from public, anon;
revoke all on function public.repair_habit(uuid, date, numeric, boolean, public.log_source) from public, anon;
revoke all on function public.get_streaks() from public, anon;
revoke all on function public.get_grace_bank() from public, anon;
revoke all on function public.get_day_statuses(date, date) from public, anon;

grant execute on function public.log_habit(uuid, date, public.habit_level, numeric, public.log_source) to authenticated;
grant execute on function public.skip_habit(uuid, text, date, public.log_source) to authenticated;
grant execute on function public.undo_log(uuid, date) to authenticated;
grant execute on function public.repair_habit(uuid, date, numeric, boolean, public.log_source) to authenticated;
grant execute on function public.get_streaks() to authenticated;
grant execute on function public.get_grace_bank() to authenticated;
grant execute on function public.get_day_statuses(date, date) to authenticated;
