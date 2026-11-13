-- Any day of the week strip on Today, not only today and yesterday: what was due, how it
-- went, and whether it can still be changed. Up to 7 days back and 7 ahead.

create function tracker.day_rows(p_user uuid, p_day date, p_now timestamptz)
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
  ends_on date,
  sort_order int,
  can_change boolean
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
    select p_day as d, p_day = v_today as today
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
        -- A times-per-week habit shows every day it runs.
        or tracker.weekly_on(h.id, days.d)
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
    -- The day's target: the minimum on a lighter day.
    tracker.target_on(r.id, r.d),
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
    (tracker.streak_stats(r.id, v_today, p_now)).current_streak,
    (r.version).levels,
    r.today
      and not r.weekly
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
    (r.version).ends_on,
    h.sort_order,
    -- The same rule logging uses (tracker.assert_can_change_day): not a day still to
    -- come, and not once its back-log window has closed.
    r.d <= v_today and p_now < tracker.window_closes_at(p_user, r.d)
  from rows r
  join public.habits h on h.id = r.id
  left join public.habit_logs l on l.habit_id = r.id and l.date = r.d
  order by r.identity_created, r.identity, r.habit_created, r.id;
end;
$$;


create function public.get_day(p_day date)
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
  ends_on date,
  sort_order int,
  can_change boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_today date := tracker.local_date(v_user, now());
begin
  if p_day is null or p_day < v_today - 7 or p_day > v_today + 7 then
    raise exception 'Pick a day within a week of today';
  end if;
  perform tracker.settle(v_user, now());
  return query select * from tracker.day_rows(v_user, p_day, now());
end;
$$;


revoke all on function public.get_day(date) from public, anon;
grant execute on function public.get_day(date) to authenticated;
