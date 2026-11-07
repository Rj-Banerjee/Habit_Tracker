-- The streak chain for a times-per-week habit is a row of weeks. This gives each week's
-- status, and, for a missed week that can still be repaired, the week to repair it in.

-- A missed week can be repaired while the next week is still open, in Grace mode, unless
-- the week before was missed too.
create function tracker.week_repair_by(p_habit uuid, p_week date, p_now timestamptz)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := tracker.habit_owner(p_habit);
  v_next_last date := tracker.week_last_day(p_habit, p_week + 7);
begin
  if tracker.week_status(p_habit, p_week, p_now) <> 'missed'
    or v_next_last is null
    or p_now >= tracker.window_closes_at(v_user, v_next_last)
    or tracker.mode_on(v_user, v_next_last) <> 'grace'
  then
    return null;
  end if;
  if tracker.week_short(p_habit, p_week - 7, p_now)
    and not exists (
      select 1 from public.grace_days
      where spent_on_habit = p_habit
        and spent_for_date = tracker.week_last_day(p_habit, p_week - 7)
    )
  then
    return null;
  end if;
  return p_week + 7;
end;
$$;

create function public.get_week_statuses(p_from date, p_to date)
returns table (
  habit_id uuid,
  week_start date,
  status text,
  quota int,
  sessions int,
  repair_by date
)
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
  select
    h.id,
    w::date,
    tracker.week_status(h.id, w::date, now()),
    tracker.week_quota(h.id, w::date),
    tracker.week_sessions(h.id, w::date),
    tracker.week_repair_by(h.id, w::date, now())
  from public.habits h
  join public.identities i on i.id = h.identity_id
  cross join generate_series(
    tracker.week_of(greatest(p_from, h.starts_on)), tracker.week_of(p_to), interval '7 days'
  ) as w
  where i.user_id = v_user
    and h.archived_at is null
    and tracker.week_quota(h.id, w::date) > 0
  order by h.id, w;
end;
$$;

revoke all on function tracker.week_repair_by(uuid, date, timestamptz) from public, anon, authenticated;
revoke all on function public.get_week_statuses(date, date) from public, anon;
grant execute on function public.get_week_statuses(date, date) to authenticated;
