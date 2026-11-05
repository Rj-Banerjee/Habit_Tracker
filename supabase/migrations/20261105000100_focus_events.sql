-- Tunnel Vision writes focus.started, focus.completed and focus.stopped to the activity
-- history. Apps can only read activity_events, so this is the one way in, and it checks
-- the habit is the caller's own.

-- Far more than anyone focuses in a day, so a loop or a script can't flood the history.
create function tracker.focus_events_per_day()
returns int
language sql
immutable
set search_path = ''
as $$ select 200 $$;

create function tracker.record_focus(
  p_user uuid,
  p_habit uuid,
  p_kind text,
  p_planned_seconds int,
  p_elapsed_seconds int,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_kind not in ('focus.started', 'focus.completed', 'focus.stopped') then
    raise exception 'Unknown focus event';
  end if;

  if p_user is null or tracker.habit_owner(p_habit) is distinct from p_user then
    raise exception 'Habit not found';
  end if;

  if p_planned_seconds is null or p_planned_seconds < 60 or p_planned_seconds > 4 * 3600 then
    raise exception 'A focus session is between 1 minute and 4 hours';
  end if;

  if p_elapsed_seconds is not null
    and (p_elapsed_seconds < 0 or p_elapsed_seconds > p_planned_seconds + 3600)
  then
    raise exception 'That focus time does not fit the session';
  end if;

  if (
    select count(*) from public.activity_events
    where user_id = p_user
      and kind like 'focus.%'
      and occurred_at > p_now - interval '1 day'
  ) >= tracker.focus_events_per_day() then
    raise exception 'Too many focus sessions today';
  end if;

  insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload, source, actor)
  values (
    p_user,
    p_now,
    p_kind,
    p_habit,
    jsonb_strip_nulls(jsonb_build_object(
      'planned_seconds', p_planned_seconds,
      'elapsed_seconds', p_elapsed_seconds
    )),
    'tap',
    'user'
  );
end;
$$;

create function public.record_focus(
  p_habit_id uuid,
  p_kind text,
  p_planned_seconds int,
  p_elapsed_seconds int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tracker.record_focus(
    tracker.current_user_id(), p_habit_id, p_kind, p_planned_seconds, p_elapsed_seconds, now()
  );
end;
$$;

revoke all on function tracker.record_focus(uuid, uuid, text, int, int, timestamptz) from public, anon, authenticated;
revoke all on function tracker.focus_events_per_day() from public, anon, authenticated;
revoke all on function public.record_focus(uuid, text, int, int) from public, anon;
grant execute on function public.record_focus(uuid, text, int, int) to authenticated;
