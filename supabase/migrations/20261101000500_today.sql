-- Everything the Today screen needs in one call, so "today" always follows the
-- timezone on the profile rather than the device clock.

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
  repair_amount numeric
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
      h.target as habit_target,
      h.unit as habit_unit,
      tracker.day_status(h.id, days.d, p_now) as day_status,
      i.created_at as identity_created,
      h.created_at as habit_created,
      tracker.previous_scheduled_day(h.id, days.d) as previous_day
    from days
    join public.identities i on i.user_id = p_user
    join public.habits h on h.identity_id = i.id
    where h.archived_at is null
      and tracker.is_scheduled(h.id, days.d)
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
    r.habit_target,
    r.habit_unit,
    r.day_status,
    l.level_done,
    l.amount,
    l.skip_reason,
    (tracker.streak_stats(r.id, greatest(v_today, r.d), p_now)).current_streak,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('level', hl.level, 'description', hl.description, 'target', hl.target)
          order by hl.level
        )
        from public.habit_levels hl
        where hl.habit_id = r.id
      ),
      '[]'::jsonb
    ),
    r.day_status = 'pending'
      and r.previous_day is not null
      and tracker.mode_on(p_user, r.d) = 'grace'
      and tracker.is_open_miss(r.id, r.previous_day, p_now)
      and not coalesce(
        tracker.is_open_miss(r.id, tracker.previous_scheduled_day(r.id, r.previous_day), p_now),
        false
      ),
    case
      when r.type in ('count', 'duration') then ceil(tracker.full_target(r.id) * 1.5)
    end
  from rows r
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
  repair_amount numeric
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
