-- Times-per-week habits and ending a habit. See "Times per week" and "Ending a habit"
-- in PLAN.md. A times-per-week habit is never due on a single day, so the day rules
-- (daily streaks, misses, Grace Days per day) never see it; its weeks are judged here.

-- ---------------------------------------------------------------------------
-- When a habit is running, and how it's counted
-- ---------------------------------------------------------------------------

-- Started, and not past an end date. The end date is dated like the schedule.
create function tracker.active_on(p_habit uuid, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.habits h where h.id = p_habit and p_date >= h.starts_on)
    and coalesce(p_date <= (tracker.version_on(p_habit, p_date)).ends_on, true);
$$;

create function tracker.weekly_on(p_habit uuid, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select tracker.active_on(p_habit, p_date)
    and (tracker.version_on(p_habit, p_date)).frequency = 'per_week';
$$;

-- Due on a day: a specific-days habit, running, on one of its days.
create or replace function tracker.is_scheduled(p_habit uuid, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select tracker.active_on(p_habit, p_date)
    and coalesce((tracker.version_on(p_habit, p_date)).frequency = 'days', true)
    and extract(isodow from p_date)::smallint = any (tracker.schedule_on(p_habit, p_date));
$$;

-- A times-per-week habit can be logged on any day it's running.
create or replace function tracker.assert_can_change_day(
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
  if not (tracker.is_scheduled(p_habit, p_date) or tracker.weekly_on(p_habit, p_date)) then
    if not tracker.active_on(p_habit, p_date) then
      raise exception 'That habit has ended';
    end if;
    raise exception 'That habit is not scheduled on that day';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Weeks: Monday to Sunday, on the person's own dates
-- ---------------------------------------------------------------------------

create function tracker.week_of(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_date - (extract(isodow from p_date)::int - 1);
$$;

-- The days of a week the habit counts in times per week.
create function tracker.week_days(p_habit uuid, p_week date)
returns setof date
language sql
stable
set search_path = ''
as $$
  select d::date
  from generate_series(p_week, p_week + 6, interval '1 day') as d
  where tracker.weekly_on(p_habit, d::date)
  order by d;
$$;

-- Its times per week, dated from its first day that week. A week the habit starts or
-- ends in part-way asks only as many as it has days.
create function tracker.week_quota(p_habit uuid, p_week date)
returns int
language sql
stable
set search_path = ''
as $$
  with days as (select d from tracker.week_days(p_habit, p_week) as d)
  select case
    when (select count(*) from days) = 0 then 0
    else least(
      (tracker.version_on(p_habit, (select min(d) from days))).per_week,
      (select count(*) from days)::int
    )
  end;
$$;

-- One session a day at most: a day done at any level. Below the minimum isn't a session.
create function tracker.week_sessions(p_habit uuid, p_week date)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int
  from public.habit_logs l
  where l.habit_id = p_habit
    and l.status = 'done'
    and l.date in (select tracker.week_days(p_habit, p_week));
$$;

create function tracker.week_last_day(p_habit uuid, p_week date)
returns date
language sql
stable
set search_path = ''
as $$
  select max(d) from tracker.week_days(p_habit, p_week) as d;
$$;

-- Missed, ignoring Grace Days and repairs: closed and short of the quota.
create function tracker.week_short(p_habit uuid, p_week date, p_now timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select tracker.week_quota(p_habit, p_week) > 0
    and tracker.week_sessions(p_habit, p_week) < tracker.week_quota(p_habit, p_week)
    and p_now >= tracker.window_closes_at(
      tracker.habit_owner(p_habit), tracker.week_last_day(p_habit, p_week)
    );
$$;

-- 'none' (not counted that week), 'met', 'pending' (still open), 'protected' (a Grace
-- Day covered it), 'repaired' (one extra session the next week) or 'missed'.
create function tracker.week_status(p_habit uuid, p_week date, p_now timestamptz)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := tracker.habit_owner(p_habit);
  v_quota int := tracker.week_quota(p_habit, p_week);
  v_next int;
begin
  if v_quota = 0 then
    return 'none';
  end if;
  if tracker.week_sessions(p_habit, p_week) >= v_quota then
    return 'met';
  end if;
  if p_now < tracker.window_closes_at(v_user, tracker.week_last_day(p_habit, p_week)) then
    return 'pending';
  end if;
  if exists (
    select 1 from public.grace_days
    where spent_on_habit = p_habit and spent_for_date = tracker.week_last_day(p_habit, p_week)
  ) then
    return 'protected';
  end if;

  -- One extra session the next week repairs it, unless the week before was missed too.
  v_next := tracker.week_quota(p_habit, p_week + 7);
  if v_next > 0
    and tracker.mode_on(v_user, tracker.week_last_day(p_habit, p_week + 7)) = 'grace'
    and tracker.week_sessions(p_habit, p_week + 7) >= v_next + 1
    and not (
      tracker.week_short(p_habit, p_week - 7, p_now)
      and not exists (
        select 1 from public.grace_days
        where spent_on_habit = p_habit
          and spent_for_date = tracker.week_last_day(p_habit, p_week - 7)
      )
    )
  then
    return 'repaired';
  end if;
  return 'missed';
end;
$$;

-- The first day of a week on which the quota could no longer be met.
create function tracker.week_out_of_reach(p_habit uuid, p_week date)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_quota int := tracker.week_quota(p_habit, p_week);
  v_day date;
  v_before int := 0;
  v_left int;
begin
  v_left := (select count(*) from tracker.week_days(p_habit, p_week));
  for v_day in select d from tracker.week_days(p_habit, p_week) as d loop
    if v_before + v_left < v_quota then
      return v_day;
    end if;
    if exists (
      select 1 from public.habit_logs
      where habit_id = p_habit and date = v_day and status = 'done'
    ) then
      v_before := v_before + 1;
    end if;
    v_left := v_left - 1;
  end loop;
  return null;
end;
$$;

-- How a times-per-week habit's day looks in Progress: a session is done, and in a week
-- that ended short, the days after the quota went out of reach carry its outcome. Other
-- days are 'unscheduled', which nothing counts.
create function tracker.weekly_day_status(p_habit uuid, p_date date, p_now timestamptz)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_log public.log_status;
  v_week date := tracker.week_of(p_date);
  v_status text;
  v_from date;
begin
  select status into v_log from public.habit_logs where habit_id = p_habit and date = p_date;
  if v_log = 'done' then
    return 'done';
  elsif v_log = 'skipped' then
    return 'skipped';
  end if;
  v_status := tracker.week_status(p_habit, v_week, p_now);
  if v_status in ('missed', 'protected', 'repaired') then
    v_from := tracker.week_out_of_reach(p_habit, v_week);
    if v_from is not null and p_date >= v_from then
      return v_status;
    end if;
  end if;
  return 'unscheduled';
end;
$$;

create or replace function tracker.day_status(p_habit uuid, p_date date, p_now timestamptz)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_status public.log_status;
begin
  if tracker.weekly_on(p_habit, p_date) then
    return tracker.weekly_day_status(p_habit, p_date, p_now);
  end if;
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
-- Streaks, counted in weeks for a times-per-week habit
-- ---------------------------------------------------------------------------

create function tracker.week_streak_stats(
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
  v_week date;
  v_status text;
begin
  current_streak := 0;
  longest_streak := 0;
  select tracker.week_of(starts_on) into v_week from public.habits where id = p_habit;
  while v_week is not null and v_week <= tracker.week_of(p_through) loop
    v_status := tracker.week_status(p_habit, v_week, p_now);
    if v_status in ('met', 'repaired') then
      current_streak := current_streak + 1;
      longest_streak := greatest(longest_streak, current_streak);
    elsif v_status = 'missed' then
      current_streak := 0;
    end if;
    v_week := v_week + 7;
  end loop;
end;
$$;

-- Done and repaired days add to the streak. A miss ends it. Skipped, protected,
-- pending and unscheduled days leave it unchanged. A habit counted in times per week on
-- the last day has its streak in weeks.
create or replace function tracker.streak_stats(
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

  if (tracker.version_on(p_habit, greatest(p_through, v_start))).frequency = 'per_week' then
    select s.current_streak, s.longest_streak into current_streak, longest_streak
    from tracker.week_streak_stats(p_habit, p_through, p_now) s;
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
-- Grace Days: a times-per-week habit's days are neutral, and its week is judged on
-- its last day. A met week counts as 7 consistent days; a missed one breaks the run.
-- ---------------------------------------------------------------------------

-- The habits whose week ends on this day.
create function tracker.weeks_ending(p_user uuid, p_date date)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select h.id
  from public.habits h
  join public.identities i on i.id = h.identity_id
  where i.user_id = p_user
    and tracker.weekly_on(h.id, p_date)
    and tracker.week_last_day(h.id, tracker.week_of(p_date)) = p_date
    and (
      h.archived_at is null
      or (h.archived_at at time zone tracker.user_timezone(p_user))::date > p_date
    )
  order by h.created_at, h.id;
$$;

-- 'complete', 'paused', 'broken' and 'none' as before, for the day's due habits, plus
-- 'week': nothing was due that day, but a week was met, which counts 7 days.
create or replace function tracker.day_outcome(p_user uuid, p_date date, p_now timestamptz)
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
  v_any_week boolean := false;
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

  for v_habit in select tracker.weeks_ending(p_user, p_date) loop
    v_status := tracker.week_status(v_habit, tracker.week_of(p_date), p_now);
    if v_status in ('missed', 'protected', 'pending') then
      return 'broken';
    elsif v_status in ('met', 'repaired') then
      v_any_week := true;
    end if;
  end loop;

  if not v_any_due then
    return case when v_any_week then 'week' else 'none' end;
  elsif v_any_skip then
    return 'paused';
  end if;
  return 'complete';
end;
$$;

create function tracker.outcome_days(p_outcome text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_outcome when 'complete' then 1 when 'week' then 7 else 0 end;
$$;

-- Consistent days in the run ending on p_date.
create or replace function tracker.complete_run(p_user uuid, p_date date, p_now timestamptz)
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
    end if;
    v_run := v_run + tracker.outcome_days(v_outcome);
    v_day := v_day - 1;
  end loop;

  return v_run;
end;
$$;

create or replace function tracker.settle_fingerprint(p_user uuid, p_last_closed date)
returns text
language sql
stable
set search_path = ''
as $$
  select md5(concat_ws('|',
    p_last_closed,
    (
      select string_agg(concat_ws(':', effective_from, mode), ',' order by effective_from)
      from tracker.mode_history
      where user_id = p_user
    ),
    (
      select string_agg(concat_ws(':', h.id, h.starts_on, h.archived_at), ',' order by h.id)
      from public.habits h
      join public.identities i on i.id = h.identity_id
      where i.user_id = p_user
    ),
    (
      select string_agg(
        concat_ws(':', v.habit_id, v.effective_from, v.schedule_days, v.frequency, v.per_week, v.ends_on),
        ',' order by v.habit_id, v.effective_from
      )
      from tracker.habit_versions v
      join public.habits h on h.id = v.habit_id
      join public.identities i on i.id = h.identity_id
      where i.user_id = p_user
    ),
    (
      select string_agg(concat_ws(':', l.habit_id, l.date, l.status), ',' order by l.habit_id, l.date)
      from public.habit_logs l
      join public.habits h on h.id = l.habit_id
      join public.identities i on i.id = h.identity_id
      where i.user_id = p_user
        and (
          l.date <= p_last_closed
          -- Next week's sessions can repair a missed week, so a times-per-week habit's
          -- logs count a week ahead. Logging a daily habit today still changes nothing.
          or (l.date <= p_last_closed + 7 and tracker.weekly_on(l.habit_id, l.date))
        )
    )
  ));
$$;

-- Rebuilds Grace Days from the start, oldest day first. A missed week is covered on its
-- last day, like a missed day. The fingerprint looks a week past the last closed day,
-- because next week's sessions can repair a missed week.
create or replace function tracker.settle(p_user uuid, p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_day date;
  v_last_closed date;
  v_fingerprint text;
  v_habit uuid;
  v_grace_id uuid;
  v_outcome text;
  v_run int;
begin
  perform 1 from public.users where id = p_user for update;

  v_last_closed := tracker.local_date(p_user, p_now);
  while tracker.window_closes_at(p_user, v_last_closed) > p_now loop
    v_last_closed := v_last_closed - 1;
  end loop;

  v_fingerprint := tracker.settle_fingerprint(p_user, v_last_closed);
  if v_fingerprint is not distinct from (
    select settled_fingerprint from public.users where id = p_user
  ) then
    return;
  end if;

  delete from public.grace_days where user_id = p_user;

  select min(h.starts_on) into v_day
  from public.habits h
  join public.identities i on i.id = h.identity_id
  where i.user_id = p_user;

  while v_day is not null and v_day <= v_last_closed loop
    if tracker.mode_on(p_user, v_day) = 'grace' then
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

      for v_habit in select tracker.weeks_ending(p_user, v_day) loop
        if tracker.week_status(v_habit, tracker.week_of(v_day), p_now) = 'missed'
          and (tracker.week_streak_stats(v_habit, tracker.week_of(v_day) - 1, p_now)).current_streak > 0
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

      v_outcome := tracker.day_outcome(p_user, v_day, p_now);
      if v_outcome in ('complete', 'week') then
        v_run := tracker.complete_run(p_user, v_day, p_now);
        if v_run / 7 > (v_run - tracker.outcome_days(v_outcome)) / 7
          and tracker.grace_bank(p_user) < 3
        then
          insert into public.grace_days (user_id, earned_at)
          values (p_user, tracker.window_closes_at(p_user, v_day));
        end if;
      end if;
    end if;

    v_day := v_day + 1;
  end loop;

  update public.users
  set settled_through = v_last_closed, settled_fingerprint = v_fingerprint
  where id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Today: a times-per-week habit shows every day it's running, with its week
-- ---------------------------------------------------------------------------

drop function public.get_today();
drop function tracker.today_rows(uuid, timestamptz);

create function tracker.today_rows(p_user uuid, p_now timestamptz)
returns table (
  day date,
  is_today boolean,
  habit_id uuid,
  identity_id uuid,
  identity_name text,
  colour_token text,
  title text,
  habit_type public.habit_type,
  target numeric,
  unit text,
  status text,
  level_done public.habit_level,
  amount numeric,
  skip_reason text,
  current_streak int,
  levels jsonb,
  can_repair boolean,
  repair_amount numeric,
  time_of_day public.time_of_day,
  reminder_time time,
  frequency public.habit_frequency,
  week_done int,
  week_quota int,
  week_days_left int,
  ends_on date
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := tracker.local_date(p_user, p_now);
begin
  return query
  with days as (
    select v_today as d, true as today
    union all
    select v_today - 1, false
  ),
  rows as (
    select
      days.d,
      days.today,
      h.id,
      i.id as identity,
      i.name,
      i.colour_token as colour,
      h.title as habit_title,
      h.type,
      tracker.weekly_on(h.id, days.d) as weekly,
      tracker.day_status(h.id, days.d, p_now) as day_status,
      i.created_at as identity_created,
      h.created_at as habit_created,
      tracker.previous_scheduled_day(h.id, days.d) as previous_day,
      tracker.version_on(h.id, days.d) as version
    from days
    join public.identities i on i.user_id = p_user
    join public.habits h on h.identity_id = i.id
    where h.archived_at is null
      and (
        tracker.is_scheduled(h.id, days.d)
        -- A times-per-week habit is on Today every day it runs, but never as yesterday:
        -- no single day of it is ever owed.
        or (days.today and tracker.weekly_on(h.id, days.d))
      )
  )
  select
    r.d,
    r.today,
    r.id,
    r.identity,
    r.name,
    r.colour,
    r.habit_title,
    r.type,
    (r.version).target,
    (r.version).unit,
    case
      when not r.weekly then r.day_status
      when l.status = 'done' then 'done'
      when l.status = 'skipped' then 'skipped'
      else 'pending'
    end,
    l.level_done,
    l.amount,
    l.skip_reason,
    (tracker.streak_stats(r.id, greatest(v_today, r.d), p_now)).current_streak,
    (r.version).levels,
    not r.weekly
      and r.day_status = 'pending'
      and r.previous_day is not null
      and tracker.mode_on(p_user, r.d) = 'grace'
      and tracker.is_open_miss(r.id, r.previous_day, p_now)
      and not coalesce(
        tracker.is_open_miss(r.id, tracker.previous_scheduled_day(r.id, r.previous_day), p_now),
        false
      ),
    case
      when not r.weekly and r.type in ('count', 'duration') and r.previous_day is not null
      then ceil(tracker.target_on(r.id, r.previous_day) * 1.5)
    end,
    h.time_of_day,
    h.reminder_time,
    (r.version).frequency,
    case when r.weekly then tracker.week_sessions(r.id, tracker.week_of(r.d)) end,
    case when r.weekly then tracker.week_quota(r.id, tracker.week_of(r.d)) end,
    -- Days a session can still happen this week, today included unless it's done.
    case when r.weekly then (
      select count(*)::int from tracker.week_days(r.id, tracker.week_of(r.d)) as wd
      where wd > r.d or (wd = r.d and coalesce(l.status, 'partial') <> 'done')
    ) end,
    (r.version).ends_on
  from rows r
  join public.habits h on h.id = r.id
  left join public.habit_logs l on l.habit_id = r.id and l.date = r.d
  -- Yesterday only appears while it can still be back-logged.
  where r.today or r.day_status = 'pending'
  order by r.today, r.identity_created, r.identity, r.habit_created, r.id;
end;
$$;

create function public.get_today()
returns table (
  day date,
  is_today boolean,
  habit_id uuid,
  identity_id uuid,
  identity_name text,
  colour_token text,
  title text,
  habit_type public.habit_type,
  target numeric,
  unit text,
  status text,
  level_done public.habit_level,
  amount numeric,
  skip_reason text,
  current_streak int,
  levels jsonb,
  can_repair boolean,
  repair_amount numeric,
  time_of_day public.time_of_day,
  reminder_time time,
  frequency public.habit_frequency,
  week_done int,
  week_quota int,
  week_days_left int,
  ends_on date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  perform tracker.settle(v_user, now());
  return query select * from tracker.today_rows(v_user, now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Progress: a times-per-week habit's sessions, and the days a missed week was lost on
-- ---------------------------------------------------------------------------

create or replace function public.get_habit_days(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_timezone text;
begin
  if p_to - p_from > 400 then
    raise exception 'Date range is too long';
  end if;

  select timezone into v_timezone from public.users where id = v_user;

  return (
    select coalesce(jsonb_agg(day order by day ->> 'date'), '[]')
    from (
      select jsonb_build_object(
        'habit_id', h.id,
        'date', d::date,
        'status', tracker.day_status(h.id, d::date, now()),
        'level_done', l.level_done,
        'amount', l.amount,
        'target', tracker.target_on(h.id, d::date),
        'logged_hour', case
          when (l.logged_at at time zone v_timezone)::date = d::date
            then extract(hour from l.logged_at at time zone v_timezone)::int
        end
      ) as day
      from public.habits h
      join public.identities i on i.id = h.identity_id
      cross join generate_series(greatest(p_from, h.starts_on), p_to, interval '1 day') as d
      left join public.habit_logs l on l.habit_id = h.id and l.date = d::date
      where i.user_id = v_user
        and h.archived_at is null
        and (
          tracker.is_scheduled(h.id, d::date)
          or (
            tracker.weekly_on(h.id, d::date)
            and tracker.day_status(h.id, d::date, now()) <> 'unscheduled'
          )
        )
    ) as days
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Ending a habit
-- ---------------------------------------------------------------------------

-- Habits that have run their course, with a short summary of how they went.
create function public.get_completed_habits()
returns table (
  habit_id uuid,
  title text,
  identity_name text,
  colour_token text,
  starts_on date,
  ends_on date,
  frequency public.habit_frequency,
  days_done int,
  best_streak int,
  total_amount numeric,
  unit text,
  restarted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_today date := tracker.local_date(v_user, now());
begin
  return query
  select
    h.id,
    h.title,
    i.name,
    i.colour_token,
    h.starts_on,
    h.ends_on,
    h.frequency,
    (select count(*)::int from public.habit_logs l
      where l.habit_id = h.id and l.status in ('done', 'repaired')),
    (tracker.streak_stats(h.id, h.ends_on, now())).longest_streak,
    (select sum(l.amount) from public.habit_logs l
      where l.habit_id = h.id and l.status in ('done', 'partial')),
    h.unit,
    exists (select 1 from public.habits n where n.previous_run_id = h.id)
  from public.habits h
  join public.identities i on i.id = h.identity_id
  where i.user_id = v_user
    and h.archived_at is null
    and h.ends_on is not null
    and h.ends_on < v_today
  order by h.ends_on desc, h.id;
end;
$$;

-- A new run of an ended habit, from today, with the same settings and the same length.
-- The old run keeps its history and stays in Completed habits.
create function tracker.restart_habit(p_user uuid, p_habit uuid, p_now timestamptz)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_old public.habits;
  v_today date := tracker.local_date(p_user, p_now);
  v_new uuid;
begin
  if tracker.habit_owner(p_habit) is distinct from p_user then
    raise exception 'Habit not found';
  end if;
  select * into v_old from public.habits where id = p_habit;
  if v_old.ends_on is null or v_old.ends_on >= v_today then
    raise exception 'That habit has not ended yet';
  end if;

  v_new := tracker.create_habit(
    p_user, v_old.identity_id, v_old.title, v_old.type, v_old.target, v_old.unit,
    v_old.schedule_days, v_old.window_start, v_old.window_end, v_old.voice_aliases,
    v_old.milestone_amount, v_old.milestone_label, tracker.current_levels(p_habit),
    v_old.time_of_day, v_old.reminder_time, v_old.frequency, v_old.per_week,
    v_today + (v_old.ends_on - v_old.starts_on), p_now
  );
  update public.habits set previous_run_id = p_habit where id = v_new;
  return v_new;
end;
$$;

create function public.restart_habit(p_habit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return tracker.restart_habit(tracker.current_user_id(), p_habit_id, now());
end;
$$;

revoke all on function public.get_today() from public, anon;
revoke all on function public.get_completed_habits() from public, anon;
revoke all on function public.restart_habit(uuid) from public, anon;
grant execute on function public.get_today() to authenticated;
grant execute on function public.get_completed_habits() to authenticated;
grant execute on function public.restart_habit(uuid) to authenticated;
