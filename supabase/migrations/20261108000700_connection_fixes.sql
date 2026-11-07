-- Habit connections, part 3: explanations, answers and one-tap fixes. See "Habit
-- connections" in PLAN.md.
--
-- Every change the AI makes, from an insight, a connection's fix, the morning heads-up or
-- Autopilot, goes through tracker.apply_change: it's recorded in ai_changes (the "AI
-- changes" history) and activity_events, and can be undone.

-- ---------------------------------------------------------------------------
-- Two new kinds of fix
-- ---------------------------------------------------------------------------

-- "Use the minimum after a draining habit": on the day after any of these habits was
-- done, this habit's goal is its minimum. Dated, like lighter days.
alter table public.habits add column light_after uuid[] not null default '{}';
alter table tracker.habit_versions add column light_after uuid[] not null default '{}';

-- One day's goal made the minimum, by the heads-up or Autopilot. Not a setting.
create table public.day_overrides (
  habit_id uuid not null references public.habits (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, date)
);
alter table public.day_overrides enable row level security;
create policy day_overrides_owner_read on public.day_overrides
  for select to authenticated using (tracker.habit_owner(habit_id) = (select auth.uid()));
revoke all on table public.day_overrides from anon;
revoke insert, update, delete on table public.day_overrides from authenticated;
grant select on table public.day_overrides to authenticated;

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
    time_of_day, frequency, per_week, ends_on, light_days, light_after
  )
  select h.id, v_from, h.schedule_days, h.target, h.unit, tracker.current_levels(h.id),
         h.time_of_day, h.frequency, h.per_week, h.ends_on, h.light_days, h.light_after
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
      light_days = excluded.light_days,
      light_after = excluded.light_after;
end;
$$;

-- A lighter day: one of its lighter weekdays, a day made lighter on its own, or the day
-- after one of the habits it rests after.
create or replace function tracker.light_on(p_habit uuid, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(extract(isodow from p_date)::smallint = any (v.light_days), false)
    or exists (select 1 from public.day_overrides o where o.habit_id = p_habit and o.date = p_date)
    or (cardinality(v.light_after) > 0 and exists (
      select 1 from public.habit_logs l
      where l.habit_id = any (v.light_after) and l.date = p_date - 1 and l.status in ('done', 'repaired')
    ))
  from (select (tracker.version_on(p_habit, p_date)).*) as v;
$$;

-- Analytics sees the same lighter days: day_facts, with the three ways a day is lighter.
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
      select v.schedule_days, v.target as version_target, v.levels, v.frequency, v.ends_on, v.per_week,
             v.light_days, v.light_after
      from tracker.habit_versions v
      where v.habit_id = h.id and v.effective_from <= d::date
      order by v.effective_from desc
      limit 1
    ) as v
    where v.ends_on is null or d::date <= v.ends_on
  ),
  levels as (
    select d.*,
      (select (level ->> 'target')::numeric from jsonb_array_elements(d.levels) as level where level ->> 'level' = 'minimum') as minimum_target,
      coalesce(
        (select (level ->> 'target')::numeric from jsonb_array_elements(d.levels) as level where level ->> 'level' = 'full'),
        d.version_target
      ) as full_target,
      extract(isodow from d.day)::smallint = any (d.light_days)
        or exists (select 1 from public.day_overrides o where o.habit_id = d.id and o.date = d.day)
        or (cardinality(d.light_after) > 0 and exists (
          select 1 from public.habit_logs y
          where y.habit_id = any (d.light_after) and y.date = d.day - 1 and y.status in ('done', 'repaired')
        )) as light
    from days d
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
    case when d.light and d.minimum_target is not null then d.minimum_target else d.full_target end,
    d.minimum_target,
    d.created_at,
    d.archived_on,
    d.per_week
  from levels d
  left join public.habit_logs l on l.habit_id = d.id and l.date = d.day;
$$;

-- ---------------------------------------------------------------------------
-- Changes the AI makes, all in one place
-- ---------------------------------------------------------------------------

create table public.ai_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  habit_id uuid references public.habits (id) on delete cascade,
  -- Where it came from: an insight, a connection's fix, the heads-up, or Autopilot.
  source text not null check (source in ('insight', 'connection', 'heads_up', 'autopilot')),
  source_key text,
  action jsonb not null,
  -- What it was before, to undo.
  before jsonb not null,
  -- Approved with a tap (ai_assisted), or made by Autopilot (ai).
  actor public.activity_actor not null check (actor in ('ai_assisted', 'ai')),
  -- Why, in words, for the history and Autopilot's notice.
  reason text,
  applied_at timestamptz not null default now(),
  undone_at timestamptz,
  seen_at timestamptz
);
create index ai_changes_user_idx on public.ai_changes (user_id, applied_at desc);
create index ai_changes_habit_id_idx on public.ai_changes (habit_id);
alter table public.ai_changes enable row level security;
create policy ai_changes_owner_read on public.ai_changes
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.ai_changes from anon;
revoke insert, update, delete on table public.ai_changes from authenticated;
grant select on table public.ai_changes to authenticated;

-- What a fix changes, and what it was. The insight actions, plus a rest day, resting after
-- a habit, and moving to the top of its part of the day.
create or replace function tracker.insight_change(p_habit public.habits, p_action jsonb)
returns table (changes jsonb, before jsonb)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_levels jsonb := tracker.current_levels(p_habit.id);
  v_target numeric;
  v_days smallint[];
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
    when 'rest_day' then
      v_days := array(select d from unnest(p_habit.schedule_days) as d where d <> (p_action ->> 'weekday')::smallint order by d);
      if cardinality(v_days) = 0 then
        raise exception 'A habit needs at least one day';
      end if;
      return query select jsonb_build_object('schedule_days', to_jsonb(v_days)),
                          jsonb_build_object('schedule_days', to_jsonb(p_habit.schedule_days));
    when 'minimum_after' then
      return query select
        jsonb_build_object('light_after', (
          select to_jsonb(coalesce(array_agg(distinct d), '{}'))
          from unnest(p_habit.light_after || (p_action ->> 'after_habit_id')::uuid) as d
        )),
        jsonb_build_object('light_after', to_jsonb(p_habit.light_after));
    when 'move_first' then
      -- First in its part of the day; the others keep their order after it.
      return query select
        jsonb_build_object('sort_orders', (
          select jsonb_object_agg(id, n - 1)
          from (
            select h.id, row_number() over (order by h.id <> p_habit.id, h.sort_order nulls last, h.created_at) as n
            from public.habits h
            where h.identity_id in (select id from public.identities where user_id = tracker.habit_owner(p_habit.id))
              and h.time_of_day = p_habit.time_of_day and h.archived_at is null
          ) ordered
        )),
        jsonb_build_object('sort_orders', (
          select jsonb_object_agg(h.id, h.sort_order)
          from public.habits h
          where h.identity_id in (select id from public.identities where user_id = tracker.habit_owner(p_habit.id))
            and h.time_of_day = p_habit.time_of_day and h.archived_at is null
        ));
    else
      raise exception 'Unknown action';
  end case;
end;
$$;

create or replace function tracker.change_habit(p_user uuid, p_habit uuid, p_changes jsonb, p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if tracker.habit_owner(p_habit) is distinct from p_user then
    raise exception 'Habit not found';
  end if;
  if p_changes ? 'light_days' then
    perform tracker.set_light_days(
      p_user, p_habit,
      (select coalesce(array_agg(value::smallint), '{}') from jsonb_array_elements_text(p_changes -> 'light_days')),
      p_now
    );
  elsif p_changes ? 'light_after' then
    update public.habits
    set light_after = (
      select coalesce(array_agg(value::uuid), '{}')
      from jsonb_array_elements_text(p_changes -> 'light_after')
      where tracker.habit_owner(value::uuid) = p_user
    )
    where id = p_habit;
    perform tracker.record_habit_version(p_habit, p_now);
  elsif p_changes ? 'sort_orders' then
    update public.habits h
    set sort_order = (o.value #>> '{}')::int
    from jsonb_each(p_changes -> 'sort_orders') as o
    where h.id = o.key::uuid and tracker.habit_owner(h.id) = p_user;
  else
    perform tracker.update_habit(p_user, p_habit, p_changes, p_now);
  end if;
end;
$$;

-- Makes one change, records it, and returns its id for undo. Autopilot (actor 'ai') may
-- only make small changes that are easy to take back: the order, the time of day, or the
-- minimum for one day. Anything bigger always needs a person's tap.
create function tracker.apply_change(
  p_user uuid,
  p_habit uuid,
  p_action jsonb,
  p_actor public.activity_actor,
  p_source text,
  p_source_key text,
  p_reason text,
  p_now timestamptz
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_habit public.habits;
  v_change record;
  v_before jsonb;
  v_date date;
  v_id uuid;
begin
  if tracker.habit_owner(p_habit) is distinct from p_user then
    raise exception 'Habit not found';
  end if;
  if p_actor = 'ai' and p_action ->> 'type' not in ('move_time', 'move_first', 'light_today') then
    raise exception 'Autopilot can only make small changes';
  end if;

  if p_action ->> 'type' = 'light_today' then
    v_date := coalesce((p_action ->> 'date')::date, tracker.local_date(p_user, p_now));
    v_before := jsonb_build_object('light_today', v_date, 'existed',
      exists (select 1 from public.day_overrides where habit_id = p_habit and date = v_date));
    insert into public.day_overrides (habit_id, date) values (p_habit, v_date) on conflict do nothing;
  else
    select * into v_habit from public.habits where id = p_habit;
    select * into v_change from tracker.insight_change(v_habit, p_action);
    v_before := v_change.before;
    perform tracker.change_habit(p_user, p_habit, v_change.changes, p_now);
  end if;

  insert into public.ai_changes (user_id, habit_id, source, source_key, action, before, actor, reason, applied_at, seen_at)
  values (p_user, p_habit, p_source, p_source_key, p_action, v_before, p_actor, p_reason, p_now,
          case when p_actor = 'ai' then null else p_now end)
  returning id into v_id;

  insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload, actor)
  values (p_user, p_now, 'ai_change_applied', p_habit,
          jsonb_build_object('source', p_source, 'action', p_action, 'before', v_before, 'change_id', v_id), p_actor);
  return v_id;
end;
$$;

create function tracker.undo_change(p_user uuid, p_change uuid, p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_change public.ai_changes;
begin
  select * into v_change from public.ai_changes where id = p_change and user_id = p_user for update;
  if v_change.id is null then
    raise exception 'Change not found';
  end if;
  if v_change.undone_at is not null then
    raise exception 'Already undone';
  end if;

  if v_change.before ? 'light_today' then
    if not (v_change.before ->> 'existed')::boolean then
      delete from public.day_overrides where habit_id = v_change.habit_id and date = (v_change.before ->> 'light_today')::date;
    end if;
  else
    perform tracker.change_habit(p_user, v_change.habit_id, v_change.before, p_now);
  end if;

  update public.ai_changes set undone_at = p_now, seen_at = coalesce(seen_at, p_now) where id = p_change;
  insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload, actor)
  values (p_user, p_now, 'ai_change_undone', v_change.habit_id,
          jsonb_build_object('source', v_change.source, 'restored', v_change.before, 'change_id', p_change), 'user');
end;
$$;

-- Insights now make their changes the same way, so they're in the history too.
create or replace function public.apply_insight(p_insight_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_insight public.insights;
  v_target uuid;
  v_change uuid;
begin
  select * into v_insight from public.insights where id = p_insight_id and user_id = v_user for update;
  if v_insight.id is null then
    raise exception 'Insight not found';
  end if;
  if not tracker.has_insights(v_user) then
    raise exception 'Available on Pro.';
  end if;
  v_target := coalesce((v_insight.action ->> 'habit_id')::uuid, v_insight.habit_id);
  if v_insight.action is null or v_target is null then
    raise exception 'This insight has nothing to do';
  end if;
  if v_insight.applied_at is not null then
    raise exception 'Already done';
  end if;

  v_change := tracker.apply_change(v_user, v_target, v_insight.action - 'habit_id', 'ai_assisted', 'insight', v_insight.key, v_insight.text, now());
  update public.insights set applied_at = now(), undo = jsonb_build_object('change_id', v_change)
  where user_id = v_user and key = v_insight.key;
  insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload, actor)
  values (v_user, now(), 'insight_applied', v_target,
          jsonb_build_object('insight', v_insight.kind, 'action', v_insight.action, 'change_id', v_change), 'ai_assisted');
end;
$$;

create or replace function public.undo_insight(p_insight_id uuid)
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
  perform tracker.undo_change(v_user, (v_insight.undo ->> 'change_id')::uuid, now());
  update public.insights set applied_at = null, undo = null where user_id = v_user and key = v_insight.key;
  insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload, actor)
  values (v_user, now(), 'insight_undone', coalesce((v_insight.action ->> 'habit_id')::uuid, v_insight.habit_id),
          jsonb_build_object('insight', v_insight.kind, 'change_id', v_insight.undo ->> 'change_id'), 'user');
end;
$$;

-- The "AI changes" history, newest first.
create function public.get_ai_changes(p_limit int default 50)
returns table (
  id uuid,
  habit_id uuid,
  habit_title text,
  source text,
  action jsonb,
  actor public.activity_actor,
  reason text,
  applied_at timestamptz,
  undone_at timestamptz,
  seen_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.habit_id, h.title, c.source, c.action, c.actor, c.reason, c.applied_at, c.undone_at, c.seen_at
  from public.ai_changes c
  left join public.habits h on h.id = c.habit_id
  where c.user_id = tracker.current_user_id()
  order by c.applied_at desc, c.id
  limit least(greatest(p_limit, 1), 200);
$$;

create function public.undo_ai_change(p_change_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select tracker.undo_change(tracker.current_user_id(), p_change_id, now());
$$;

create function public.mark_ai_changes_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_changes set seen_at = now() where user_id = tracker.current_user_id() and seen_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Findings, explained, and what people say about them
-- ---------------------------------------------------------------------------

alter table public.findings
  add column explanation text,
  add column question text,
  -- 1-3 fixes, each {label, habit_id, action}.
  add column fixes jsonb not null default '[]';

create table public.finding_answers (
  user_id uuid not null references public.users (id) on delete cascade,
  key text not null,
  answer text not null check (answer in ('yes', 'no', 'not_sure')),
  answered_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.finding_answers enable row level security;
create policy finding_answers_owner_read on public.finding_answers
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.finding_answers from anon;
revoke insert, update, delete on table public.finding_answers from authenticated;
grant select on table public.finding_answers to authenticated;

-- A link they said "No" to stays hidden for 60 days.
create function tracker.hidden_finding(p_user uuid, p_key text, p_now timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.finding_answers a
    where a.user_id = p_user and a.key = p_key and a.answer = 'no' and a.answered_at > p_now - interval '60 days'
  );
$$;

-- The person's connections: Pro only, "Yes" ones first, "No" ones hidden for 60 days.
-- A habit's own, when given one.
create function public.get_connections(p_habit_id uuid default null)
returns table (
  id uuid,
  kind text,
  key text,
  subjects jsonb,
  direction text,
  effect numeric,
  sample int,
  confidence text,
  range_from date,
  range_to date,
  numbers jsonb,
  explanation text,
  question text,
  fixes jsonb,
  answer text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.kind, f.key, f.subjects, f.direction, f.effect, f.sample, f.confidence, f.range_from, f.range_to,
         f.numbers, f.explanation, f.question, f.fixes, a.answer
  from public.findings f
  left join public.finding_answers a on a.user_id = f.user_id and a.key = f.key
  where f.user_id = tracker.current_user_id()
    and tracker.has_insights(f.user_id)
    and not tracker.hidden_finding(f.user_id, f.key, now())
    and (p_habit_id is null or f.subjects @> jsonb_build_array(jsonb_build_object('id', p_habit_id)))
  order by a.answer = 'yes' desc nulls last, f.confidence = 'high' desc, f.p_value, f.id;
$$;

create function public.answer_finding(p_finding_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_key text;
begin
  select key into v_key from public.findings where id = p_finding_id and user_id = v_user;
  if v_key is null then
    raise exception 'Connection not found';
  end if;
  if p_answer not in ('yes', 'no', 'not_sure') then
    raise exception 'Answer yes, no or not sure';
  end if;
  insert into public.finding_answers (user_id, key, answer, answered_at)
  values (v_user, v_key, p_answer, now())
  on conflict (user_id, key) do update set answer = excluded.answer, answered_at = excluded.answered_at;
end;
$$;

-- One of a connection's fixes, after the person confirms it.
create function public.apply_connection_fix(p_finding_id uuid, p_fix int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_finding public.findings;
  v_fix jsonb;
begin
  select * into v_finding from public.findings where id = p_finding_id and user_id = v_user;
  if v_finding.id is null then
    raise exception 'Connection not found';
  end if;
  if not tracker.has_insights(v_user) then
    raise exception 'Available on Pro.';
  end if;
  v_fix := v_finding.fixes -> p_fix;
  if v_fix is null then
    raise exception 'No such fix';
  end if;
  return tracker.apply_change(
    v_user, (v_fix ->> 'habit_id')::uuid, v_fix -> 'action', 'ai_assisted', 'connection', v_finding.key,
    coalesce(v_finding.explanation, v_fix ->> 'label'), now()
  );
end;
$$;

-- What the engine reads, now with answers and each habit's fixes so far.
create or replace function public.job_connection_data(p_user uuid, p_now timestamptz default now())
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
    'checkins', coalesce((
      select jsonb_agg(jsonb_build_object('date', c.date, 'energy', c.energy, 'sleep_hours', c.sleep_hours, 'mood', c.mood) order by c.date)
      from public.checkins c
      where c.user_id = p_user and c.date between v_today - 90 and v_today
    ), '[]'),
    'changes', coalesce((
      select jsonb_agg(change order by change ->> 'date')
      from (
        select jsonb_build_object('habit_id', h.id, 'date', h.starts_on, 'kind', 'added') as change
        from public.habits h join public.identities i on i.id = h.identity_id
        where i.user_id = p_user and h.archived_at is null and h.starts_on > v_today - 90
        union all
        select jsonb_build_object(
          'habit_id', v.habit_id, 'date', v.effective_from, 'kind', 'target_raised',
          'from', v.previous_target, 'to', v.target
        )
        from (
          select v.habit_id, v.effective_from, v.target,
                 lag(v.target) over (partition by v.habit_id order by v.effective_from) as previous_target
          from tracker.habit_versions v
          join public.habits h on h.id = v.habit_id
          join public.identities i on i.id = h.identity_id
          where i.user_id = p_user
        ) v
        where v.effective_from > v_today - 90 and v.effective_from <> '-infinity'
          and v.previous_target is not null and v.target > v.previous_target * 1.2
      ) changes
    ), '[]'),
    'setup', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'schedule_days', h.schedule_days, 'light_days', h.light_days, 'light_after', h.light_after,
        'time_of_day', h.time_of_day, 'frequency', h.frequency,
        'minimum', (select target from public.habit_levels l where l.habit_id = h.id and l.level = 'minimum')
      ))
      from public.habits h join public.identities i on i.id = h.identity_id
      where i.user_id = p_user and h.archived_at is null
    ), '[]'),
    'hidden', coalesce((
      select jsonb_agg(a.key) from public.finding_answers a
      where a.user_id = p_user and a.answer = 'no' and a.answered_at > p_now - interval '60 days'
    ), '[]'),
    'confirmed', coalesce((
      select jsonb_agg(a.key) from public.finding_answers a where a.user_id = p_user and a.answer = 'yes'
    ), '[]')
  );
end;
$$;

create or replace function public.job_save_findings(p_user uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved int;
begin
  delete from public.findings where user_id = p_user;
  insert into public.findings (
    user_id, kind, key, subjects, direction, effect, sample, confidence, range_from, range_to, numbers, p_value,
    explanation, question, fixes
  )
  select p_user, item ->> 'kind', item ->> 'key', item -> 'subjects', item ->> 'direction',
         (item ->> 'effect')::numeric, (item ->> 'sample')::int, item ->> 'confidence',
         (item ->> 'range_from')::date, (item ->> 'range_to')::date,
         coalesce(item -> 'numbers', '{}'), (item ->> 'p_value')::numeric,
         item ->> 'explanation', item ->> 'question',
         -- Only fixes for the person's own habits.
         coalesce((
           select jsonb_agg(fix) from jsonb_array_elements(coalesce(item -> 'fixes', '[]')) as fix
           where tracker.habit_owner((fix ->> 'habit_id')::uuid) = p_user
         ), '[]')
  from jsonb_array_elements(coalesce(p_items, '[]')) as item
  where not exists (
    select 1 from jsonb_array_elements(item -> 'subjects') as s
    where s ->> 'type' = 'habit' and tracker.habit_owner((s ->> 'id')::uuid) is distinct from p_user
  );
  get diagnostics v_saved = row_count;
  return v_saved;
end;
$$;

revoke all on function tracker.apply_change(uuid, uuid, jsonb, public.activity_actor, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function tracker.undo_change(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function tracker.hidden_finding(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_ai_changes(int) from public, anon;
revoke all on function public.undo_ai_change(uuid) from public, anon;
revoke all on function public.mark_ai_changes_seen() from public, anon;
revoke all on function public.get_connections(uuid) from public, anon;
revoke all on function public.answer_finding(uuid, text) from public, anon;
revoke all on function public.apply_connection_fix(uuid, int) from public, anon;
grant execute on function public.get_ai_changes(int) to authenticated;
grant execute on function public.undo_ai_change(uuid) to authenticated;
grant execute on function public.mark_ai_changes_seen() to authenticated;
grant execute on function public.get_connections(uuid) to authenticated;
grant execute on function public.answer_finding(uuid, text) to authenticated;
grant execute on function public.apply_connection_fix(uuid, int) to authenticated;

-- Saved analytics don't know about the new lighter days.
truncate tracker.analytics_cache;
