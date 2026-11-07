-- Habits keep the order they're dragged into on Today. Not dated: it's only where a card
-- sits on screen, and says nothing about past days.

alter table public.habits add column sort_order int check (sort_order >= 0);

-- Sets the order of habits in one section, top first. Only the person's own habits.
create function public.set_habit_order(p_habit_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  if cardinality(p_habit_ids) > 200 then
    raise exception 'Too many habits';
  end if;
  if exists (
    select 1 from unnest(p_habit_ids) as id
    where tracker.habit_owner(id) is distinct from v_user
  ) then
    raise exception 'Habit not found';
  end if;
  update public.habits h
  set sort_order = o.n - 1
  from unnest(p_habit_ids) with ordinality as o(id, n)
  where h.id = o.id;
end;
$$;

revoke all on function public.set_habit_order(uuid[]) from public, anon;
grant execute on function public.set_habit_order(uuid[]) to authenticated;

-- Today returns each habit's place.
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
  ends_on date,
  sort_order int
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
    (r.version).ends_on,
    h.sort_order
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
  ends_on date,
  sort_order int
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


revoke all on function public.get_today() from public, anon;
grant execute on function public.get_today() to authenticated;
