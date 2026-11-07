-- Faster Grace Days, and the base for analytics. The rules are the same.
--
-- The old settle asked day_status about each habit on each day, and recounted the run of
-- consistent days and each habit's streak from the very start on every day, so a year of
-- history for 20 habits took over a minute. Now one set-based query works out every
-- habit's raw status over the range, and settle walks the days once, keeping its counts.

-- Each habit's days over a range, as the day rules see them before Grace Days: done,
-- repaired, skipped (within the allowance), missed or pending, or unscheduled. A
-- times-per-week habit's days are 'done', 'skipped' or 'unscheduled': its weeks are
-- judged on their own. A test checks this against day_status on every fixture day.
create function tracker.day_facts(p_user uuid, p_from date, p_to date, p_now timestamptz)
returns table (
  habit_id uuid,
  date date,
  weekly boolean,
  raw_status text,
  log_status public.log_status,
  level_done public.habit_level,
  amount numeric,
  source public.log_source,
  skip_reason text,
  logged_at timestamptz,
  target numeric,
  minimum numeric,
  habit_created timestamptz,
  archived_on date,
  per_week smallint
)
language sql
stable
set search_path = ''
as $$
  with tz as (select tracker.user_timezone(p_user) as zone),
  mine as (
    select h.id, h.starts_on, h.created_at,
           (h.archived_at at time zone (select zone from tz))::date as archived_on
    from public.habits h
    join public.identities i on i.id = h.identity_id
    where i.user_id = p_user
  ),
  days as (
    select h.id, h.created_at, h.archived_on, d::date as day, v.*
    from mine h
    cross join generate_series(greatest(p_from, h.starts_on), p_to, interval '1 day') as d
    cross join lateral (
      select v.schedule_days, v.target as version_target, v.levels, v.frequency, v.ends_on, v.per_week
      from tracker.habit_versions v
      where v.habit_id = h.id and v.effective_from <= d::date
      order by v.effective_from desc
      limit 1
    ) as v
    where v.ends_on is null or d::date <= v.ends_on
  )
  select
    d.id,
    d.day,
    d.frequency = 'per_week',
    case
      when d.frequency = 'per_week' then
        case l.status when 'done' then 'done' when 'skipped' then 'skipped' else 'unscheduled' end
      when not (extract(isodow from d.day)::smallint = any (d.schedule_days)) then 'unscheduled'
      when l.status in ('done', 'repaired') then l.status::text
      when l.status = 'skipped' and (
        select count(*) from public.habit_logs s
        where s.habit_id = d.id and s.status = 'skipped' and s.date between d.day - 6 and d.day
      ) < 3 then 'skipped'
      when p_now >= ((d.day + 1)::timestamp at time zone (select zone from tz)) + interval '24 hours' then 'missed'
      else 'pending'
    end,
    l.status,
    l.level_done,
    l.amount,
    l.source,
    l.skip_reason,
    l.logged_at,
    coalesce(
      (select (level ->> 'target')::numeric from jsonb_array_elements(d.levels) as level where level ->> 'level' = 'full'),
      d.version_target
    ),
    (select (level ->> 'target')::numeric from jsonb_array_elements(d.levels) as level where level ->> 'level' = 'minimum'),
    d.created_at,
    d.archived_on,
    d.per_week
  from days d
  left join public.habit_logs l on l.habit_id = d.id and l.date = d.day;
$$;

create or replace function tracker.settle(p_user uuid, p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_first date;
  v_last_closed date;
  v_fingerprint text;
  v_day date;
  v_fact record;
  v_habit uuid;
  v_grace_id uuid;
  v_status text;
  v_week text;
  v_grace boolean;
  -- Consistent days in the current run, for earning Grace Days.
  v_run int := 0;
  v_weight int;
  v_any_due boolean;
  v_any_skip boolean;
  v_any_week boolean;
  v_broken boolean;
  -- Each habit's streak so far, by habit id: in days, and in weeks.
  v_streaks jsonb := '{}';
  v_week_streaks jsonb := '{}';
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

  select min(h.starts_on) into v_first
  from public.habits h
  join public.identities i on i.id = h.identity_id
  where i.user_id = p_user;
  if v_first is null or v_first > v_last_closed then
    update public.users
    set settled_through = v_last_closed, settled_fingerprint = v_fingerprint
    where id = p_user;
    return;
  end if;

  -- Every closed day's raw statuses, and the day each habit's weeks end, worked out once.
  create temporary table if not exists settle_facts (
    habit_id uuid, date date, weekly boolean, raw_status text, habit_created timestamptz, archived_on date
  ) on commit drop;
  truncate settle_facts;
  insert into settle_facts
  select f.habit_id, f.date, f.weekly, f.raw_status, f.habit_created, f.archived_on
  from tracker.day_facts(p_user, v_first, v_last_closed, p_now) f
  where f.archived_on is null or f.archived_on > f.date;

  create temporary table if not exists settle_week_ends (habit_id uuid, date date, habit_created timestamptz) on commit drop;
  truncate settle_week_ends;
  insert into settle_week_ends
  select f.habit_id, max(f.date), min(f.habit_created)
  from settle_facts f
  where f.weekly
  group by f.habit_id, tracker.week_of(f.date);

  v_day := v_first;
  while v_day <= v_last_closed loop
    v_grace := tracker.mode_on(p_user, v_day) = 'grace';
    v_any_due := false;
    v_any_skip := false;
    v_any_week := false;
    v_broken := false;

    -- Habits due on days: spend a Grace Day on a miss that would break a streak.
    for v_fact in
      select f.habit_id, f.raw_status
      from settle_facts f
      where f.date = v_day and not f.weekly and f.raw_status <> 'unscheduled'
      order by f.habit_created, f.habit_id
    loop
      v_habit := v_fact.habit_id;
      v_any_due := true;
      v_status := v_fact.raw_status;
      if v_grace and v_status = 'missed' and coalesce((v_streaks ->> v_habit::text)::int, 0) > 0 then
        select id into v_grace_id
        from public.grace_days
        where user_id = p_user and spent_for_date is null
        order by earned_at, id
        limit 1;
        if v_grace_id is not null then
          update public.grace_days
          set spent_on_habit = v_habit, spent_for_date = v_day
          where id = v_grace_id;
          v_status := 'protected';
        end if;
      end if;

      if v_status in ('done', 'repaired') then
        v_streaks := jsonb_set(v_streaks, array[v_habit::text], to_jsonb(coalesce((v_streaks ->> v_habit::text)::int, 0) + 1));
      elsif v_status = 'missed' then
        v_streaks := jsonb_set(v_streaks, array[v_habit::text], to_jsonb(0));
      end if;

      if v_status in ('missed', 'protected', 'pending') then
        v_broken := true;
      elsif v_status = 'skipped' then
        v_any_skip := true;
      end if;
    end loop;

    -- Times-per-week habits whose week ends today are judged by the week.
    for v_habit in
      select e.habit_id from settle_week_ends e where e.date = v_day order by e.habit_created, e.habit_id
    loop
      v_week := tracker.week_status(v_habit, tracker.week_of(v_day), p_now);
      if v_grace and v_week = 'missed' and coalesce((v_week_streaks ->> v_habit::text)::int, 0) > 0 then
        select id into v_grace_id
        from public.grace_days
        where user_id = p_user and spent_for_date is null
        order by earned_at, id
        limit 1;
        if v_grace_id is not null then
          update public.grace_days
          set spent_on_habit = v_habit, spent_for_date = v_day
          where id = v_grace_id;
          v_week := 'protected';
        end if;
      end if;

      if v_week in ('met', 'repaired') then
        v_week_streaks := jsonb_set(v_week_streaks, array[v_habit::text], to_jsonb(coalesce((v_week_streaks ->> v_habit::text)::int, 0) + 1));
        v_any_week := true;
      elsif v_week = 'missed' then
        v_week_streaks := jsonb_set(v_week_streaks, array[v_habit::text], to_jsonb(0));
      end if;

      if v_week in ('missed', 'protected', 'pending') then
        v_broken := true;
      end if;
    end loop;

    -- The run of consistent days, as day_outcome and complete_run count it.
    if v_broken then
      v_run := 0;
      v_weight := 0;
    elsif not v_any_due then
      v_weight := case when v_any_week then 7 else 0 end;
    elsif v_any_skip then
      v_weight := 0;
    else
      v_weight := 1;
    end if;
    v_run := v_run + v_weight;

    if v_grace and v_weight > 0
      and v_run / 7 > (v_run - v_weight) / 7
      and tracker.grace_bank(p_user) < 3
    then
      insert into public.grace_days (user_id, earned_at)
      values (p_user, tracker.window_closes_at(p_user, v_day));
    end if;

    v_day := v_day + 1;
  end loop;

  update public.users
  set settled_through = v_last_closed, settled_fingerprint = v_fingerprint
  where id = p_user;
end;
$$;

revoke all on function tracker.day_facts(uuid, date, date, timestamptz) from public, anon, authenticated;
