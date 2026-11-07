-- Analytics: every habit's days and weeks over a range, worked out once in the database
-- and cached, so the app only adds them up. See "Analytics" in PLAN.md.

create table tracker.analytics_cache (
  user_id uuid not null references public.users (id) on delete cascade,
  range_from date not null,
  range_to date not null,
  fingerprint text not null,
  payload jsonb not null,
  built_at timestamptz not null default now(),
  primary key (user_id, range_from, range_to)
);

-- Everything the result depends on: a change to any of it rebuilds. The date is in it
-- because days close as time passes, turning pending into missed.
create function tracker.analytics_fingerprint(p_user uuid, p_from date, p_to date, p_now timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select md5(concat_ws('|',
    p_from, p_to,
    tracker.local_date(p_user, p_now),
    (select concat_ws(':', count(*), max(occurred_at)) from public.activity_events where user_id = p_user),
    (select concat_ws(':', count(*), max(v.effective_from))
       from tracker.habit_versions v
       join public.habits h on h.id = v.habit_id
       join public.identities i on i.id = h.identity_id
       where i.user_id = p_user),
    (select concat_ws(':', count(*), string_agg(concat_ws(':', spent_on_habit, spent_for_date), ',' order by id))
       from public.grace_days where user_id = p_user),
    (select string_agg(concat_ws(':', h.id, h.title, h.archived_at, h.ends_on, h.reminder_time, i.name, i.colour_token), ',' order by h.id)
       from public.habits h join public.identities i on i.id = h.identity_id where i.user_id = p_user)
  ));
$$;

create function tracker.build_analytics(p_user uuid, p_from date, p_to date, p_now timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with tz as (select tracker.user_timezone(p_user) as zone),
  mine as (
    select h.*, i.name as identity_name, i.colour_token
    from public.habits h
    join public.identities i on i.id = h.identity_id
    where i.user_id = p_user and h.archived_at is null
  ),
  -- Every day from each habit's start, so streaks see the whole history. Grace Days
  -- turn a miss into protected, as day_status does.
  facts as (
    select f.*,
      case
        when f.raw_status in ('missed', 'pending') and exists (
          select 1 from public.grace_days g where g.spent_on_habit = f.habit_id and g.spent_for_date = f.date
        ) then 'protected'
        else f.raw_status
      end as status
    from tracker.day_facts(
      p_user,
      coalesce((select min(starts_on) from mine), p_from),
      least(p_to, tracker.local_date(p_user, p_now)),
      p_now
    ) f
    where f.archived_on is null
  ),
  -- Streaks over days: a miss starts a new run; done and repaired add to it.
  runs as (
    select habit_id, date, status,
      count(*) filter (where status = 'missed') over (partition by habit_id order by date) as run
    from facts
    where not weekly and status <> 'unscheduled'
  ),
  run_lengths as (
    select habit_id, run, count(*) filter (where status in ('done', 'repaired')) as length, max(date) as last_day
    from runs
    group by habit_id, run
  ),
  streaks as (
    select habit_id,
      max(length) as longest,
      (array_agg(length order by run desc))[1] as current
    from run_lengths
    group by habit_id
  ),
  -- Times-per-week habits, judged by the week as week_status does, all weeks at once.
  week_base as (
    select habit_id, tracker.week_of(date) as week,
      least((array_agg(per_week order by date))[1], count(*))::int as quota,
      count(*) filter (where log_status = 'done')::int as sessions,
      max(date) as last_day
    from facts
    where weekly
    group by habit_id, tracker.week_of(date)
  ),
  week_closed as (
    select b.*,
      p_now >= ((b.last_day + 1)::timestamp at time zone (select zone from tz)) + interval '24 hours' as closed,
      exists (
        select 1 from public.grace_days g where g.spent_on_habit = b.habit_id and g.spent_for_date = b.last_day
      ) as covered
    from week_base b
  ),
  week_status as (
    select c.*,
      case
        when c.quota = 0 then 'none'
        when c.sessions >= c.quota then 'met'
        when not c.closed then 'pending'
        when c.covered then 'protected'
        when n.quota > 0
          and tracker.mode_on(p_user, n.last_day) = 'grace'
          and n.sessions >= n.quota + 1
          and not coalesce(p.quota > 0 and p.sessions < p.quota and p.closed and not p.covered, false)
          then 'repaired'
        else 'missed'
      end as status
    from week_closed c
    left join week_closed n on n.habit_id = c.habit_id and n.week = c.week + 7
    left join week_closed p on p.habit_id = c.habit_id and p.week = c.week - 7
  ),
  week_runs as (
    select habit_id, week, status,
      count(*) filter (where status = 'missed') over (partition by habit_id order by week) as run
    from week_status
  ),
  week_streaks as (
    select habit_id, max(length) as longest, (array_agg(length order by run desc))[1] as current
    from (
      select habit_id, run, count(*) filter (where status in ('met', 'repaired')) as length
      from week_runs group by habit_id, run
    ) r
    group by habit_id
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'today', tracker.local_date(p_user, p_now),
    'habits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'title', h.title, 'type', h.type, 'unit', h.unit,
        'frequency', h.frequency, 'per_week', h.per_week,
        'identity_id', h.identity_id, 'identity_name', h.identity_name, 'colour_token', h.colour_token,
        'starts_on', h.starts_on, 'ends_on', h.ends_on, 'reminder_time', h.reminder_time,
        'time_of_day', h.time_of_day, 'milestone_amount', h.milestone_amount, 'milestone_label', h.milestone_label,
        -- Streaks run across the whole history, not just the range.
        'current_streak', coalesce(case when h.frequency = 'per_week' then w.current else s.current end, 0),
        'longest_streak', coalesce(case when h.frequency = 'per_week' then w.longest else s.longest end, 0)
      ) order by h.created_at, h.id)
      from mine h
      left join streaks s on s.habit_id = h.id
      left join week_streaks w on w.habit_id = h.id
    ), '[]'),
    -- Every day in the range a habit was due, or did something.
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'habit_id', f.habit_id, 'date', f.date, 'status', f.status, 'log_status', f.log_status,
        'level_done', f.level_done, 'amount', f.amount, 'source', f.source, 'skip_reason', f.skip_reason,
        'target', f.target, 'minimum', f.minimum,
        -- When it was logged, only if on the day itself: a back-log says when they caught up.
        'logged_minute', case when (f.logged_at at time zone (select zone from tz))::date = f.date
          then extract(hour from f.logged_at at time zone (select zone from tz))::int * 60
             + extract(minute from f.logged_at at time zone (select zone from tz))::int
        end
      ) order by f.habit_id, f.date)
      from facts f
      where f.date >= p_from and (f.status <> 'unscheduled' or f.log_status is not null)
    ), '[]'),
    -- A times-per-week habit is measured in weeks.
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'habit_id', habit_id, 'week_start', week, 'status', status, 'quota', quota, 'sessions', sessions
      ) order by habit_id, week)
      from week_status
      where week + 6 >= p_from and quota > 0
    ), '[]'),
    'grace_spent', coalesce((
      select jsonb_agg(jsonb_build_object('habit_id', spent_on_habit, 'date', spent_for_date) order by spent_for_date)
      from public.grace_days
      where user_id = p_user and spent_for_date between p_from and p_to
    ), '[]')
  );
$$;

-- Ranges of up to about 2 years. Rebuilt only when something it depends on changed.
create function public.get_analytics(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_fingerprint text;
  v_cached tracker.analytics_cache;
  v_payload jsonb;
begin
  if p_to < p_from or p_to - p_from > 800 then
    raise exception 'Date range is too long';
  end if;

  perform tracker.settle(v_user, now());
  v_fingerprint := tracker.analytics_fingerprint(v_user, p_from, p_to, now());

  select * into v_cached
  from tracker.analytics_cache
  where user_id = v_user and range_from = p_from and range_to = p_to;
  if v_cached.fingerprint = v_fingerprint then
    return v_cached.payload;
  end if;

  v_payload := tracker.build_analytics(v_user, p_from, p_to, now());
  -- Ranges move with the date, so old ones are cleared as new ones are made.
  delete from tracker.analytics_cache where user_id = v_user and built_at < now() - interval '2 days';
  insert into tracker.analytics_cache (user_id, range_from, range_to, fingerprint, payload)
  values (v_user, p_from, p_to, v_fingerprint, v_payload)
  on conflict (user_id, range_from, range_to) do update
  set fingerprint = excluded.fingerprint, payload = excluded.payload, built_at = now();
  return v_payload;
end;
$$;

revoke all on table tracker.analytics_cache from public, anon, authenticated;
revoke all on function public.get_analytics(date, date) from public, anon;
grant execute on function public.get_analytics(date, date) to authenticated;
