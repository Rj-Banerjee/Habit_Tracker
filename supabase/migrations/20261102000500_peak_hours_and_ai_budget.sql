-- Adds the local hour each log was made, for peak hours. A back-log says when someone
-- caught up rather than when they did the habit, so it's left out.
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
        and tracker.is_scheduled(h.id, d::date)
    ) as days
  );
end;
$$;

-- Adds to a running total for the window and returns it, so the AI service can see how
-- much of someone's daily allowance is gone. A amount of 0 just reads it.
create function public.ai_spend(p_scope text, p_amount int, p_seconds int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  v_used int;
begin
  insert into tracker.ai_counters (scope, bucket, used)
  values (p_scope, v_bucket, greatest(p_amount, 0))
  on conflict (scope, bucket) do update
    set used = tracker.ai_counters.used + greatest(p_amount, 0)
  returning used into v_used;
  return v_used;
end;
$$;

revoke all on function public.ai_spend(text, int, int) from public, anon, authenticated;
grant execute on function public.ai_spend(text, int, int) to service_role;
