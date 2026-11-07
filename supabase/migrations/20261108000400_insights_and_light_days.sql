-- AI insights for analytics (Pro), and lighter days. See "Insights (Pro)" in PLAN.md.
--
-- The nightly job in the AI service finds insights from the measured numbers, has the
-- model word them, and saves them here. The app reads them (Pro only), and can apply an
-- insight's one action, undo it, or dismiss it for 30 days.

-- ---------------------------------------------------------------------------
-- Lighter days: on these weekdays the habit's goal is its minimum. Dated, like every
-- other setting, so the past doesn't change.
-- ---------------------------------------------------------------------------

alter table public.habits
  add column light_days smallint[] not null default '{}'
    check (light_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]);

alter table tracker.habit_versions
  add column light_days smallint[] not null default '{}';

create or replace function tracker.record_habit_version(p_habit uuid, p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := tracker.habit_owner(p_habit);
  v_starts date;
  v_from date;
begin
  if v_owner is null then
    return;
  end if;

  select starts_on into v_starts from public.habits where id = p_habit;
  v_from := tracker.local_date(v_owner, p_now);
  if v_from <= v_starts then
    v_from := '-infinity';
  end if;

  insert into tracker.habit_versions (
    habit_id, effective_from, schedule_days, target, unit, levels,
    time_of_day, frequency, per_week, ends_on, light_days
  )
  select h.id, v_from, h.schedule_days, h.target, h.unit, tracker.current_levels(h.id),
         h.time_of_day, h.frequency, h.per_week, h.ends_on, h.light_days
  from public.habits h
  where h.id = p_habit
  on conflict (habit_id, effective_from) do update
  set schedule_days = excluded.schedule_days,
      target = excluded.target,
      unit = excluded.unit,
      levels = excluded.levels,
      time_of_day = excluded.time_of_day,
      frequency = excluded.frequency,
      per_week = excluded.per_week,
      ends_on = excluded.ends_on,
      light_days = excluded.light_days;
end;
$$;


create function tracker.light_on(p_habit uuid, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(extract(isodow from p_date)::smallint = any ((tracker.version_on(p_habit, p_date)).light_days), false);
$$;

-- The full-version target that applied on a day. On a lighter day that's the minimum.
create or replace function tracker.target_on(p_habit uuid, p_date date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when tracker.light_on(p_habit, p_date) and tracker.minimum_on(p_habit, p_date) is not null
    then tracker.minimum_on(p_habit, p_date)
    else coalesce(
      (
        select (level ->> 'target')::numeric
        from jsonb_array_elements((tracker.version_on(p_habit, p_date)).levels) as level
        where level ->> 'level' = 'full'
      ),
      (tracker.version_on(p_habit, p_date)).target
    )
  end;
$$;

create or replace function tracker.log_habit(
  p_user uuid,
  p_habit uuid,
  p_date date,
  p_level public.habit_level,
  p_amount numeric,
  p_source public.log_source,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_existing numeric;
  v_amount numeric;
  v_level public.habit_level := p_level;
begin
  perform tracker.assert_can_change_day(p_user, p_habit, p_date, p_now);

  select amount into v_existing
  from public.habit_logs
  where habit_id = p_habit and date = p_date and status in ('partial', 'done');

  v_amount := case when p_amount is null then v_existing else greatest(p_amount, coalesce(v_existing, 0)) end;
  -- A total that already reaches the full target stays full. "Just set up" is chosen
  -- on purpose, so it stands as it is.
  if v_amount is not null and p_level = 'minimum'
    and (select s.level from tracker.status_for_total(p_habit, p_date, v_amount) s) = 'full'
  then
    v_level := 'full';
  end if;
  -- On a lighter day the minimum is the day's goal, so doing it is the full version.
  if p_level = 'minimum' and tracker.light_on(p_habit, p_date) then
    v_level := 'full';
  end if;

  insert into public.habit_logs (habit_id, date, level_done, amount, status, source, logged_at)
  values (p_habit, p_date, v_level, v_amount, 'done', p_source, p_now)
  on conflict (habit_id, date) do update
  set level_done = excluded.level_done,
      amount = excluded.amount,
      status = 'done',
      skip_reason = null,
      source = excluded.source,
      logged_at = excluded.logged_at;
end;
$$;


create function tracker.set_light_days(p_user uuid, p_habit uuid, p_days smallint[], p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if tracker.habit_owner(p_habit) is distinct from p_user then
    raise exception 'Habit not found';
  end if;
  if not coalesce(p_days, '{}') <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] then
    raise exception 'Days are 1 (Monday) to 7 (Sunday)';
  end if;
  update public.habits
  set light_days = (select coalesce(array_agg(distinct d order by d), '{}') from unnest(p_days) as d)
  where id = p_habit;
  perform tracker.record_habit_version(p_habit, p_now);
end;
$$;

create function public.set_light_days(p_habit_id uuid, p_days smallint[])
returns void
language sql
security definer
set search_path = ''
as $$
  select tracker.set_light_days(tracker.current_user_id(), p_habit_id, p_days, now());
$$;

create or replace function tracker.day_facts(p_user uuid, p_from date, p_to date, p_now timestamptz)
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
      select v.schedule_days, v.target as version_target, v.levels, v.frequency, v.ends_on, v.per_week, v.light_days
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
    -- On a lighter day the minimum is the day's goal, as target_on says.
    case
      when extract(isodow from d.day)::smallint = any (d.light_days)
        and exists (select 1 from jsonb_array_elements(d.levels) as level
                    where level ->> 'level' = 'minimum' and level ->> 'target' is not null)
      then (select (level ->> 'target')::numeric from jsonb_array_elements(d.levels) as level where level ->> 'level' = 'minimum')
      else coalesce(
        (select (level ->> 'target')::numeric from jsonb_array_elements(d.levels) as level where level ->> 'level' = 'full'),
        d.version_target
      )
    end,
    (select (level ->> 'target')::numeric from jsonb_array_elements(d.levels) as level where level ->> 'level' = 'minimum'),
    d.created_at,
    d.archived_on,
    d.per_week
  from days d
  left join public.habit_logs l on l.habit_id = d.id and l.date = d.day;
$$;


create or replace function tracker.today_rows(p_user uuid, p_now timestamptz)
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


create or replace function tracker.analytics_fingerprint(p_user uuid, p_from date, p_to date, p_now timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select md5(concat_ws('|',
    p_from, p_to,
    tracker.local_date(p_user, p_now),
    (select concat_ws(':', count(*), max(occurred_at)) from public.activity_events where user_id = p_user),
    -- Every dated setting, so a second change on the same day (which rewrites that day's
    -- version) is seen too.
    (select md5(string_agg(v::text, ',' order by v.habit_id, v.effective_from))
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


-- ---------------------------------------------------------------------------
-- Insights
-- ---------------------------------------------------------------------------

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- Null for the Overview, or the habit it's about.
  habit_id uuid references public.habits (id) on delete cascade,
  kind text not null,
  -- The same finding keeps its key from night to night, for dismissing.
  key text not null,
  text text not null,
  numbers jsonb not null default '{}',
  -- The one action, or null for one that only informs (getting stronger).
  action jsonb,
  made_on date not null,
  applied_at timestamptz,
  -- What the action changed, so it can be undone.
  undo jsonb,
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, habit_id, key)
);

create index insights_habit_id_idx on public.insights (habit_id);

create table public.insight_dismissals (
  user_id uuid not null references public.users (id) on delete cascade,
  key text not null,
  until date not null,
  primary key (user_id, key)
);

alter table public.insights enable row level security;
alter table public.insight_dismissals enable row level security;

create policy insights_owner_read on public.insights
  for select to authenticated using (user_id = (select auth.uid()));
create policy insight_dismissals_owner_read on public.insight_dismissals
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.insights from anon;
revoke insert, update, delete on table public.insights from authenticated;
revoke all on table public.insight_dismissals from anon;
revoke insert, update, delete on table public.insight_dismissals from authenticated;

create function tracker.has_insights(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select plan <> 'free' from public.users where id = p_user), false);
$$;

-- The Overview's insights (no habit), or one habit's. Free gets none: the server says so,
-- not only the app.
create function public.get_insights(p_habit_id uuid default null)
returns table (
  id uuid,
  habit_id uuid,
  kind text,
  text text,
  numbers jsonb,
  action jsonb,
  applied_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.habit_id, i.kind, i.text, i.numbers, i.action, i.applied_at
  from public.insights i
  where i.user_id = tracker.current_user_id()
    and tracker.has_insights(i.user_id)
    and i.habit_id is not distinct from p_habit_id
    and not exists (
      select 1 from public.insight_dismissals d
      where d.user_id = i.user_id and d.key = i.key
        and d.until >= tracker.local_date(i.user_id, now())
    )
  order by i.created_at, i.id;
$$;

-- Not shown again for 30 days.
create function public.dismiss_insight(p_insight_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_key text;
begin
  select key into v_key from public.insights where id = p_insight_id and user_id = v_user;
  if v_key is null then
    raise exception 'Insight not found';
  end if;
  insert into public.insight_dismissals (user_id, key, until)
  values (v_user, v_key, tracker.local_date(v_user, now()) + 30)
  on conflict (user_id, key) do update set until = excluded.until;
  delete from public.insights where user_id = v_user and key = v_key;
end;
$$;

-- An insight's action: the change to make, and what it was before, for undo.
create function tracker.insight_change(p_habit public.habits, p_action jsonb)
returns table (changes jsonb, before jsonb)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_levels jsonb := tracker.current_levels(p_habit.id);
  v_target numeric;
begin
  case p_action ->> 'type'
    when 'move_time' then
      return query select jsonb_build_object('time_of_day', p_action ->> 'time_of_day'),
                          jsonb_build_object('time_of_day', p_habit.time_of_day);
    when 'add_reminder' then
      return query select jsonb_build_object('reminder_time', p_action ->> 'reminder_time'),
                          jsonb_build_object('reminder_time', p_habit.reminder_time);
    when 'switch_per_week' then
      return query select jsonb_build_object('frequency', 'per_week', 'per_week', (p_action ->> 'per_week')::smallint),
                          jsonb_build_object('frequency', p_habit.frequency, 'per_week', p_habit.per_week);
    when 'change_target' then
      v_target := (p_action ->> 'target')::numeric;
      return query select
        jsonb_build_object(
          'target', v_target,
          'levels', (
            select jsonb_agg(case when l ->> 'level' = 'full' then jsonb_set(l, '{target}', to_jsonb(v_target)) else l end)
            from jsonb_array_elements(v_levels) as l
          )
        ),
        jsonb_build_object('target', p_habit.target, 'levels', v_levels);
    when 'light_day' then
      return query select
        jsonb_build_object('light_days', (
          select to_jsonb(coalesce(array_agg(distinct d order by d), '{}'))
          from unnest(p_habit.light_days || (p_action ->> 'weekday')::smallint) as d
        )),
        jsonb_build_object('light_days', to_jsonb(p_habit.light_days));
    else
      raise exception 'Unknown action';
  end case;
end;
$$;

create function tracker.change_habit(p_user uuid, p_habit uuid, p_changes jsonb, p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_changes ? 'light_days' then
    perform tracker.set_light_days(
      p_user, p_habit,
      (select coalesce(array_agg(value::smallint), '{}') from jsonb_array_elements_text(p_changes -> 'light_days')),
      p_now
    );
  else
    perform tracker.update_habit(p_user, p_habit, p_changes, p_now);
  end if;
end;
$$;

-- Does the insight's one action, after the person confirms it. Recorded as AI-assisted.
create function public.apply_insight(p_insight_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_insight public.insights;
  v_habit public.habits;
  v_target uuid;
  v_change record;
begin
  select * into v_insight from public.insights where id = p_insight_id and user_id = v_user for update;
  if v_insight.id is null then
    raise exception 'Insight not found';
  end if;
  if not tracker.has_insights(v_user) then
    raise exception 'Available on Pro.';
  end if;
  -- An Overview insight names its habit in the action.
  v_target := coalesce((v_insight.action ->> 'habit_id')::uuid, v_insight.habit_id);
  if v_insight.action is null or v_target is null then
    raise exception 'This insight has nothing to do';
  end if;
  if v_insight.applied_at is not null then
    raise exception 'Already done';
  end if;

  select * into v_habit from public.habits where id = v_target;
  select * into v_change from tracker.insight_change(v_habit, v_insight.action);
  perform tracker.change_habit(v_user, v_target, v_change.changes, now());

  -- The same finding can show in the Overview and on the habit: both show it done.
  update public.insights set applied_at = now(), undo = v_change.before
  where user_id = v_user and key = v_insight.key;
  insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload, actor)
  values (
    v_user, now(), 'insight_applied', v_target,
    jsonb_build_object('insight', v_insight.kind, 'action', v_insight.action, 'before', v_change.before),
    'ai_assisted'
  );
end;
$$;

create function public.undo_insight(p_insight_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_insight public.insights;
begin
  select * into v_insight from public.insights where id = p_insight_id and user_id = v_user for update;
  if v_insight.id is null then
    raise exception 'Insight not found';
  end if;
  if v_insight.applied_at is null then
    raise exception 'Nothing to undo';
  end if;

  perform tracker.change_habit(
    v_user, coalesce((v_insight.action ->> 'habit_id')::uuid, v_insight.habit_id), v_insight.undo, now()
  );
  update public.insights set applied_at = null, undo = null where user_id = v_user and key = v_insight.key;
  insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload, actor)
  values (
    v_user, now(), 'insight_undone', coalesce((v_insight.action ->> 'habit_id')::uuid, v_insight.habit_id),
    jsonb_build_object('insight', v_insight.kind, 'restored', v_insight.undo),
    'user'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- For the nightly job (service role only)
-- ---------------------------------------------------------------------------

-- Everyone with an active habit, and their stored plan. The AI service decides who gets
-- insights (test accounts count as Pro), and clears them for anyone who doesn't.
create function public.job_insight_people()
returns table (user_id uuid, plan text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct u.id, u.plan::text
  from public.users u
  join public.identities i on i.user_id = u.id
  join public.habits h on h.identity_id = i.id
  where h.archived_at is null;
$$;

-- 90 days of analytics, each habit's minimum and lighter days, and what was dismissed.
create function public.job_insight_data(p_user uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := tracker.local_date(p_user, p_now);
begin
  perform tracker.settle(p_user, p_now);
  return jsonb_build_object(
    'analytics', tracker.build_analytics(p_user, v_today - 89, v_today, p_now),
    'setup', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'light_days', h.light_days,
        'minimum', (select target from public.habit_levels l where l.habit_id = h.id and l.level = 'minimum')
      ))
      from public.habits h join public.identities i on i.id = h.identity_id
      where i.user_id = p_user and h.archived_at is null
    ), '[]'),
    'dismissed', coalesce((
      select jsonb_agg(key) from public.insight_dismissals where user_id = p_user and until >= v_today
    ), '[]')
  );
end;
$$;

-- Replaces the person's insights with tonight's. An applied one stays for a week, so it
-- can still be undone, and isn't offered again meanwhile.
create function public.job_save_insights(p_user uuid, p_items jsonb, p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := tracker.local_date(p_user, p_now);
  v_saved int;
begin
  delete from public.insights
  where user_id = p_user and (applied_at is null or applied_at < p_now - interval '7 days');

  insert into public.insights (user_id, habit_id, kind, key, text, numbers, action, made_on)
  select p_user, (item ->> 'habit_id')::uuid, item ->> 'kind', item ->> 'key', item ->> 'text',
         coalesce(item -> 'numbers', '{}'), nullif(item -> 'action', 'null'::jsonb), v_today
  from jsonb_array_elements(coalesce(p_items, '[]')) as item
  -- Only the person's own habits.
  where item ->> 'habit_id' is null or tracker.habit_owner((item ->> 'habit_id')::uuid) = p_user
  on conflict (user_id, habit_id, key) do nothing;
  get diagnostics v_saved = row_count;
  return v_saved;
end;
$$;

revoke all on function tracker.light_on(uuid, date) from public, anon, authenticated;
revoke all on function tracker.set_light_days(uuid, uuid, smallint[], timestamptz) from public, anon, authenticated;
revoke all on function tracker.has_insights(uuid) from public, anon, authenticated;
revoke all on function tracker.insight_change(public.habits, jsonb) from public, anon, authenticated;
revoke all on function tracker.change_habit(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.set_light_days(uuid, smallint[]) from public, anon;
revoke all on function public.get_insights(uuid) from public, anon;
revoke all on function public.dismiss_insight(uuid) from public, anon;
revoke all on function public.apply_insight(uuid) from public, anon;
revoke all on function public.undo_insight(uuid) from public, anon;
revoke all on function public.job_insight_people() from public, anon, authenticated;
revoke all on function public.job_insight_data(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.job_save_insights(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.set_light_days(uuid, smallint[]) to authenticated;
grant execute on function public.get_insights(uuid) to authenticated;
grant execute on function public.dismiss_insight(uuid) to authenticated;
grant execute on function public.apply_insight(uuid) to authenticated;
grant execute on function public.undo_insight(uuid) to authenticated;
grant execute on function public.job_insight_people() to service_role;
grant execute on function public.job_insight_data(uuid, timestamptz) to service_role;
grant execute on function public.job_save_insights(uuid, jsonb, timestamptz) to service_role;

-- Nightly, after the patterns rebuild. Does nothing until the AI service is hosted.
select cron.schedule('ai-nightly-insights', '45 3 * * *', $$ select tracker.call_job('nightly-insights') $$);

-- Saved analytics don't know about lighter days yet.
truncate tracker.analytics_cache;
