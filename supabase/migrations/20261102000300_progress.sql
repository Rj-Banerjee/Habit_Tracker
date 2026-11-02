-- Everything the Progress screen reads, one row per scheduled day, with the target that
-- applied that day. It's a single JSON value so a year of habits fits under the API's
-- row limit.
create function public.get_habit_days(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  if p_to - p_from > 400 then
    raise exception 'Date range is too long';
  end if;

  return (
    select coalesce(jsonb_agg(day order by day ->> 'date'), '[]')
    from (
      select jsonb_build_object(
        'habit_id', h.id,
        'date', d::date,
        'status', tracker.day_status(h.id, d::date, now()),
        'level_done', l.level_done,
        'amount', l.amount,
        'target', tracker.target_on(h.id, d::date)
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

revoke all on function public.get_habit_days(date, date) from public, anon;
grant execute on function public.get_habit_days(date, date) to authenticated;
