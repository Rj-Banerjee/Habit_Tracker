-- Dated habit settings, the activity history and server-side habit limits.

-- ---------------------------------------------------------------------------
-- Dated settings. A change never rewrites the past.
-- ---------------------------------------------------------------------------

create table tracker.habit_versions (
  habit_id uuid not null references public.habits (id) on delete cascade,
  effective_from date not null,
  schedule_days smallint[] not null,
  target numeric,
  unit text,
  levels jsonb not null default '[]',
  primary key (habit_id, effective_from)
);

create function tracker.current_levels(p_habit uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('level', level, 'description', description, 'target', target)
      order by level
    ),
    '[]'::jsonb
  )
  from public.habit_levels
  where habit_id = p_habit;
$$;

insert into tracker.habit_versions (habit_id, effective_from, schedule_days, target, unit, levels)
select id, '-infinity', schedule_days, target, unit, tracker.current_levels(id)
from public.habits;

-- Settings made on or before a habit's first day describe its whole life.
-- Later changes apply from today.
create function tracker.record_habit_version(p_habit uuid, p_now timestamptz)
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

  insert into tracker.habit_versions (habit_id, effective_from, schedule_days, target, unit, levels)
  select h.id, v_from, h.schedule_days, h.target, h.unit, tracker.current_levels(h.id)
  from public.habits h
  where h.id = p_habit
  on conflict (habit_id, effective_from) do update
  set schedule_days = excluded.schedule_days,
      target = excluded.target,
      unit = excluded.unit,
      levels = excluded.levels;
end;
$$;

create function tracker.habit_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tracker.record_habit_version(new.id, now());
  return null;
end;
$$;

create function tracker.habit_first_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into tracker.habit_versions (habit_id, effective_from, schedule_days, target, unit, levels)
  values (new.id, '-infinity', new.schedule_days, new.target, new.unit, '[]');
  return null;
end;
$$;

create trigger habits_first_version
  after insert on public.habits
  for each row execute function tracker.habit_first_version_trigger();

create trigger habits_record_version
  after update of schedule_days, target, unit on public.habits
  for each row
  when (
    old.schedule_days is distinct from new.schedule_days
    or old.target is distinct from new.target
    or old.unit is distinct from new.unit
  )
  execute function tracker.habit_version_trigger();

create function tracker.habit_levels_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tracker.record_habit_version(coalesce(new.habit_id, old.habit_id), now());
  return null;
end;
$$;

create trigger habit_levels_record_version
  after insert or update or delete on public.habit_levels
  for each row execute function tracker.habit_levels_version_trigger();

create function tracker.schedule_on(p_habit uuid, p_date date)
returns smallint[]
language sql
stable
set search_path = ''
as $$
  select schedule_days
  from tracker.habit_versions
  where habit_id = p_habit and effective_from <= p_date
  order by effective_from desc
  limit 1;
$$;

create or replace function tracker.is_scheduled(p_habit uuid, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.habits h
    where h.id = p_habit
      and p_date >= h.starts_on
      and extract(isodow from p_date)::smallint = any (tracker.schedule_on(p_habit, p_date))
  );
$$;

-- A schedule change can leave a gap longer than a week.
create or replace function tracker.previous_scheduled_day(p_habit uuid, p_date date)
returns date
language sql
stable
set search_path = ''
as $$
  select offs.day
  from (select p_date - n as day from generate_series(1, 14) as n) as offs
  where tracker.is_scheduled(p_habit, offs.day)
  order by offs.day desc
  limit 1;
$$;

create function tracker.next_scheduled_day(p_habit uuid, p_date date)
returns date
language sql
stable
set search_path = ''
as $$
  select offs.day
  from (select p_date + n as day from generate_series(1, 14) as n) as offs
  where tracker.is_scheduled(p_habit, offs.day)
  order by offs.day
  limit 1;
$$;

create function tracker.version_on(p_habit uuid, p_date date)
returns tracker.habit_versions
language sql
stable
set search_path = ''
as $$
  select *
  from tracker.habit_versions
  where habit_id = p_habit and effective_from <= p_date
  order by effective_from desc
  limit 1;
$$;

drop function tracker.full_target(uuid);

-- The full-version target that applied on a day.
create function tracker.target_on(p_habit uuid, p_date date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select (level ->> 'target')::numeric
      from jsonb_array_elements((tracker.version_on(p_habit, p_date)).levels) as level
      where level ->> 'level' = 'full'
    ),
    (tracker.version_on(p_habit, p_date)).target
  );
$$;

create or replace function tracker.settle_fingerprint(p_user uuid, p_last_closed date)
returns text
language sql
stable
set search_path = ''
as $$
  select md5(concat_ws('|',
    p_last_closed,
    (
      select string_agg(concat_ws(':', effective_from, mode), ',' order by effective_from)
      from tracker.mode_history
      where user_id = p_user
    ),
    (
      select string_agg(concat_ws(':', h.id, h.starts_on, h.archived_at), ',' order by h.id)
      from public.habits h
      join public.identities i on i.id = h.identity_id
      where i.user_id = p_user
    ),
    (
      select string_agg(
        concat_ws(':', v.habit_id, v.effective_from, v.schedule_days),
        ',' order by v.habit_id, v.effective_from
      )
      from tracker.habit_versions v
      join public.habits h on h.id = v.habit_id
      join public.identities i on i.id = h.identity_id
      where i.user_id = p_user
    ),
    (
      select string_agg(concat_ws(':', l.habit_id, l.date, l.status), ',' order by l.habit_id, l.date)
      from public.habit_logs l
      join public.habits h on h.id = l.habit_id
      join public.identities i on i.id = h.identity_id
      where i.user_id = p_user and l.date <= p_last_closed
    )
  ));
$$;

-- A repair uses the target that applied on the missed day.
create or replace function tracker.repair_habit(
  p_user uuid,
  p_habit uuid,
  p_date date,
  p_amount numeric,
  p_full_and_minimum boolean,
  p_source public.log_source,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_type public.habit_type;
  v_missed_day date;
  v_day_before date;
  v_required numeric;
begin
  perform tracker.assert_can_change_day(p_user, p_habit, p_date, p_now);
  perform tracker.settle(p_user, p_now);

  if tracker.mode_on(p_user, p_date) = 'strict' then
    raise exception 'Streak Repair is off in Strict mode';
  end if;

  v_missed_day := tracker.previous_scheduled_day(p_habit, p_date);
  if v_missed_day is null or not tracker.is_open_miss(p_habit, v_missed_day, p_now) then
    raise exception 'There is no miss to repair on the previous scheduled day';
  end if;

  v_day_before := tracker.previous_scheduled_day(p_habit, v_missed_day);
  if v_day_before is not null and tracker.is_open_miss(p_habit, v_day_before, p_now) then
    raise exception 'Two misses in a row cannot be repaired';
  end if;

  select type into v_type from public.habits where id = p_habit;
  if v_type in ('count', 'duration') then
    v_required := ceil(tracker.target_on(p_habit, v_missed_day) * 1.5);
    if coalesce(p_amount, 0) < v_required then
      raise exception 'A repair needs at least %', v_required;
    end if;
  elsif not coalesce(p_full_and_minimum, false) then
    raise exception 'A repair needs the full version plus the minimum version';
  end if;

  insert into public.habit_logs (habit_id, date, level_done, amount, status, source, logged_at)
  values (p_habit, p_date, 'full', p_amount, 'done', p_source, p_now)
  on conflict (habit_id, date) do update
  set level_done = 'full',
      amount = excluded.amount,
      status = 'done',
      skip_reason = null,
      source = excluded.source,
      logged_at = excluded.logged_at;

  insert into public.habit_logs (habit_id, date, status, source, logged_at)
  values (p_habit, v_missed_day, 'repaired', p_source, p_now)
  on conflict (habit_id, date) do update
  set status = 'repaired',
      level_done = null,
      amount = null,
      source = excluded.source,
      logged_at = excluded.logged_at;
end;
$$;

-- The day a closed miss can still be repaired, if any.
create function tracker.repair_on(p_habit uuid, p_date date, p_now timestamptz)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := tracker.habit_owner(p_habit);
  v_next date;
  v_before date;
begin
  if tracker.day_status(p_habit, p_date, p_now) <> 'missed' then
    return null;
  end if;

  v_next := tracker.next_scheduled_day(p_habit, p_date);
  if v_next is null
    or p_now >= tracker.window_closes_at(v_user, v_next)
    or tracker.mode_on(v_user, v_next) <> 'grace'
  then
    return null;
  end if;

  v_before := tracker.previous_scheduled_day(p_habit, p_date);
  if v_before is not null and tracker.is_open_miss(p_habit, v_before, p_now) then
    return null;
  end if;

  return v_next;
end;
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
      tracker.day_status(h.id, days.d, p_now) as day_status,
      i.created_at as identity_created,
      h.created_at as habit_created,
      tracker.previous_scheduled_day(h.id, days.d) as previous_day,
      tracker.version_on(h.id, days.d) as version
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
    (r.version).target,
    (r.version).unit,
    r.day_status,
    l.level_done,
    l.amount,
    l.skip_reason,
    (tracker.streak_stats(r.id, greatest(v_today, r.d), p_now)).current_streak,
    (r.version).levels,
    r.day_status = 'pending'
      and r.previous_day is not null
      and tracker.mode_on(p_user, r.d) = 'grace'
      and tracker.is_open_miss(r.id, r.previous_day, p_now)
      and not coalesce(
        tracker.is_open_miss(r.id, tracker.previous_scheduled_day(r.id, r.previous_day), p_now),
        false
      ),
    case
      when r.type in ('count', 'duration') and r.previous_day is not null
      then ceil(tracker.target_on(r.id, r.previous_day) * 1.5)
    end
  from rows r
  left join public.habit_logs l on l.habit_id = r.id and l.date = r.d
  -- Yesterday only appears while it can still be back-logged.
  where r.today or r.day_status = 'pending'
  order by r.today, r.identity_created, r.identity, r.habit_created, r.id;
end;
$$;

-- Closed misses that can still be repaired on a later day.
create function tracker.repair_rows(p_user uuid, p_now timestamptz)
returns table (
  habit_id uuid,
  identity_id uuid,
  identity_name text,
  colour_token text,
  title text,
  missed_on date,
  repair_on date,
  current_streak int
)
language sql
stable
set search_path = ''
as $$
  with today as (select tracker.local_date(p_user, p_now) as d),
  candidates as (
    select
      h.id,
      i.id as identity,
      i.name,
      i.colour_token as colour,
      h.title as habit_title,
      i.created_at as identity_created,
      h.created_at as habit_created,
      tracker.previous_scheduled_day(h.id, tracker.next_scheduled_day(h.id, today.d)) as missed
    from public.habits h
    join public.identities i on i.id = h.identity_id
    cross join today
    where i.user_id = p_user and h.archived_at is null
  )
  select
    c.id,
    c.identity,
    c.name,
    c.colour,
    c.habit_title,
    c.missed,
    tracker.repair_on(c.id, c.missed, p_now),
    (tracker.streak_stats(c.id, today.d, p_now)).current_streak
  from candidates c
  cross join today
  where c.missed is not null
    and tracker.repair_on(c.id, c.missed, p_now) > today.d
  order by c.identity_created, c.identity, c.habit_created, c.id;
$$;

create function public.get_repairs()
returns table (
  habit_id uuid,
  identity_id uuid,
  identity_name text,
  colour_token text,
  title text,
  missed_on date,
  repair_on date,
  current_streak int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  perform tracker.settle(v_user, now());
  return query select * from tracker.repair_rows(v_user, now());
end;
$$;

drop function public.get_day_statuses(date, date);

create function public.get_day_statuses(p_from date, p_to date)
returns table (habit_id uuid, date date, status text, repair_on date)
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
    d::date,
    tracker.day_status(h.id, d::date, now()),
    tracker.repair_on(h.id, d::date, now())
  from public.habits h
  join public.identities i on i.id = h.identity_id
  cross join generate_series(p_from, p_to, interval '1 day') as d
  where i.user_id = v_user and h.archived_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity history. Append-only, and written with the change it records.
-- ---------------------------------------------------------------------------

create type public.activity_actor as enum ('user', 'ai_assisted', 'ai');

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  kind text not null,
  subject_id uuid,
  payload jsonb not null default '{}',
  source public.log_source,
  actor public.activity_actor not null default 'user'
);
create index activity_events_user_time_idx on public.activity_events (user_id, occurred_at desc);

alter table public.activity_events enable row level security;

revoke all on public.activity_events from anon, authenticated;
grant select on public.activity_events to authenticated;

create policy activity_events_own on public.activity_events
  for select to authenticated
  using (user_id = (select auth.uid()));

create function tracker.record_log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.habit_logs := coalesce(new, old);
  v_owner uuid := tracker.habit_owner(v_row.habit_id);
begin
  -- A deleted habit takes its logs with it, and records that once.
  if v_owner is null then
    return null;
  end if;

  insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload, source, actor)
  values (
    v_owner,
    case when tg_op = 'DELETE' then now() else new.logged_at end,
    case tg_op
      when 'INSERT' then 'log_created'
      when 'UPDATE' then 'log_changed'
      else 'log_removed'
    end,
    v_row.habit_id,
    jsonb_strip_nulls(jsonb_build_object(
      'date', v_row.date,
      'status', v_row.status,
      'level', v_row.level_done,
      'amount', v_row.amount,
      'skip_reason', v_row.skip_reason,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'previous_level', case when tg_op = 'UPDATE' then old.level_done end
    )),
    v_row.source,
    case when v_row.source = 'coach' then 'ai_assisted' else 'user' end::public.activity_actor
  );
  return null;
end;
$$;

create trigger habit_logs_record_activity
  after insert or update or delete on public.habit_logs
  for each row execute function tracker.record_log_activity();

create function tracker.record_habit_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := tracker.habit_owner(old.id);
begin
  if v_owner is not null then
    insert into public.activity_events (user_id, kind, subject_id, payload)
    values (v_owner, 'habit_deleted', old.id, jsonb_build_object('title', old.title));
  end if;
  return old;
end;
$$;

create trigger habits_record_deleted
  before delete on public.habits
  for each row execute function tracker.record_habit_deleted();

-- Rows only go when their account does.
create function tracker.protect_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.users where id = old.user_id) then
    return old;
  end if;
  raise exception 'activity_events is append-only';
end;
$$;

create trigger activity_events_append_only
  before update or delete on public.activity_events
  for each row execute function tracker.protect_activity();

create trigger activity_events_no_truncate
  before truncate on public.activity_events
  for each statement execute function tracker.protect_activity();

-- ---------------------------------------------------------------------------
-- Habit limits and changes
-- ---------------------------------------------------------------------------

alter table public.habits
  add column milestone_amount numeric check (milestone_amount > 0),
  add column milestone_label text check (char_length(milestone_label) <= 40);

-- Start with 3. Each run of 14 consecutive days at 80% or better unlocks 2 more.
-- Days with nothing due neither count nor break a run.
create function tracker.habit_allowance(p_user uuid, p_now timestamptz)
returns int
language plpgsql
stable
set search_path = ''
as $$
declare
  v_day date;
  v_last_closed date := tracker.local_date(p_user, p_now);
  v_habit uuid;
  v_status text;
  v_due int;
  v_completed int;
  v_run int := 0;
  v_unlocks int := 0;
begin
  while tracker.window_closes_at(p_user, v_last_closed) > p_now loop
    v_last_closed := v_last_closed - 1;
  end loop;

  select min(h.starts_on) into v_day
  from public.habits h
  join public.identities i on i.id = h.identity_id
  where i.user_id = p_user;

  while v_day is not null and v_day <= v_last_closed loop
    v_due := 0;
    v_completed := 0;
    for v_habit in select tracker.due_habits(p_user, v_day) loop
      v_due := v_due + 1;
      v_status := tracker.day_status(v_habit, v_day, p_now);
      if v_status in ('done', 'repaired') then
        v_completed := v_completed + 1;
      end if;
    end loop;

    if v_due > 0 then
      if v_completed::numeric / v_due >= 0.8 then
        v_run := v_run + 1;
        if v_run % 14 = 0 then
          v_unlocks := v_unlocks + 1;
        end if;
      else
        v_run := 0;
      end if;
    end if;

    v_day := v_day + 1;
  end loop;

  return 3 + 2 * v_unlocks;
end;
$$;

create function tracker.active_habits(p_user uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int
  from public.habits h
  join public.identities i on i.id = h.identity_id
  where i.user_id = p_user and h.archived_at is null;
$$;

create function tracker.assert_valid_habit(
  p_type public.habit_type,
  p_title text,
  p_target numeric,
  p_schedule_days smallint[],
  p_levels jsonb
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'Give the habit a name';
  end if;
  if p_type in ('count', 'duration') and p_target is null then
    raise exception 'Set a target for this habit';
  end if;
  if p_schedule_days is null or cardinality(p_schedule_days) = 0 then
    raise exception 'Choose at least one day';
  end if;
  if not exists (select 1 from jsonb_array_elements(p_levels) l where l ->> 'level' = 'full')
    or not exists (select 1 from jsonb_array_elements(p_levels) l where l ->> 'level' = 'minimum')
  then
    raise exception 'A habit needs a full version and a minimum version';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_levels) l
    where btrim(coalesce(l ->> 'description', '')) = ''
  ) then
    raise exception 'Describe each version of the habit';
  end if;
end;
$$;

create function tracker.replace_levels(p_habit uuid, p_levels jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.habit_levels where habit_id = p_habit;
  insert into public.habit_levels (habit_id, level, description, target)
  select
    p_habit,
    (l ->> 'level')::public.habit_level,
    btrim(l ->> 'description'),
    (l ->> 'target')::numeric
  from jsonb_array_elements(p_levels) l;
end;
$$;

create function tracker.create_habit(
  p_user uuid,
  p_identity uuid,
  p_title text,
  p_type public.habit_type,
  p_target numeric,
  p_unit text,
  p_schedule_days smallint[],
  p_window_start time,
  p_window_end time,
  p_voice_aliases text[],
  p_milestone_amount numeric,
  p_milestone_label text,
  p_levels jsonb,
  p_now timestamptz
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_habit uuid;
begin
  if not exists (select 1 from public.identities where id = p_identity and user_id = p_user) then
    raise exception 'Identity not found';
  end if;

  perform tracker.assert_valid_habit(p_type, p_title, p_target, p_schedule_days, p_levels);

  if tracker.active_habits(p_user) >= tracker.habit_allowance(p_user, p_now) then
    raise exception 'You have reached your habit limit. 2 consistent weeks unlocks 2 more.';
  end if;

  insert into public.habits (
    identity_id, title, type, target, unit, schedule_days, window_start, window_end,
    voice_aliases, milestone_amount, milestone_label, starts_on
  )
  values (
    p_identity, btrim(p_title), p_type, p_target, p_unit, p_schedule_days, p_window_start,
    p_window_end, coalesce(p_voice_aliases, '{}'), p_milestone_amount, p_milestone_label,
    tracker.local_date(p_user, p_now)
  )
  returning id into v_habit;

  perform tracker.replace_levels(v_habit, p_levels);
  perform tracker.record_habit_version(v_habit, p_now);
  return v_habit;
end;
$$;

-- Null leaves a field unchanged. Changes apply from today.
create function tracker.update_habit(
  p_user uuid,
  p_habit uuid,
  p_title text,
  p_target numeric,
  p_unit text,
  p_schedule_days smallint[],
  p_window_start time,
  p_window_end time,
  p_voice_aliases text[],
  p_milestone_amount numeric,
  p_milestone_label text,
  p_levels jsonb,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_type public.habit_type;
  v_title text;
  v_target numeric;
  v_schedule smallint[];
begin
  if tracker.habit_owner(p_habit) is distinct from p_user then
    raise exception 'Habit not found';
  end if;

  select type, coalesce(p_title, title), coalesce(p_target, target),
    coalesce(p_schedule_days, schedule_days)
  into v_type, v_title, v_target, v_schedule
  from public.habits
  where id = p_habit;

  perform tracker.assert_valid_habit(
    v_type, v_title, v_target, v_schedule,
    coalesce(p_levels, tracker.current_levels(p_habit))
  );

  update public.habits
  set title = btrim(v_title),
      target = v_target,
      unit = coalesce(p_unit, unit),
      schedule_days = v_schedule,
      window_start = coalesce(p_window_start, window_start),
      window_end = coalesce(p_window_end, window_end),
      voice_aliases = coalesce(p_voice_aliases, voice_aliases),
      milestone_amount = coalesce(p_milestone_amount, milestone_amount),
      milestone_label = coalesce(p_milestone_label, milestone_label)
  where id = p_habit;

  if p_levels is not null then
    perform tracker.replace_levels(p_habit, p_levels);
  end if;

  perform tracker.record_habit_version(p_habit, p_now);
end;
$$;

create function public.get_habit_allowance()
returns table (allowed int, active int, can_add boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  return query
  select
    tracker.habit_allowance(v_user, now()),
    tracker.active_habits(v_user),
    tracker.active_habits(v_user) < tracker.habit_allowance(v_user, now());
end;
$$;

create function public.create_habit(
  p_identity_id uuid,
  p_title text,
  p_levels jsonb,
  p_type public.habit_type default 'boolean',
  p_target numeric default null,
  p_unit text default null,
  p_schedule_days smallint[] default '{1,2,3,4,5,6,7}',
  p_window_start time default null,
  p_window_end time default null,
  p_voice_aliases text[] default '{}',
  p_milestone_amount numeric default null,
  p_milestone_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  return tracker.create_habit(
    v_user, p_identity_id, p_title, p_type, p_target, p_unit, p_schedule_days, p_window_start,
    p_window_end, p_voice_aliases, p_milestone_amount, p_milestone_label, p_levels, now()
  );
end;
$$;

create function public.update_habit(
  p_habit_id uuid,
  p_title text default null,
  p_target numeric default null,
  p_unit text default null,
  p_schedule_days smallint[] default null,
  p_window_start time default null,
  p_window_end time default null,
  p_voice_aliases text[] default null,
  p_milestone_amount numeric default null,
  p_milestone_label text default null,
  p_levels jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  perform tracker.update_habit(
    v_user, p_habit_id, p_title, p_target, p_unit, p_schedule_days, p_window_start, p_window_end,
    p_voice_aliases, p_milestone_amount, p_milestone_label, p_levels, now()
  );
end;
$$;

create function public.archive_habit(p_habit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  if tracker.habit_owner(p_habit_id) is distinct from v_user then
    raise exception 'Habit not found';
  end if;
  update public.habits set archived_at = now() where id = p_habit_id and archived_at is null;
end;
$$;

-- Habit changes go through these functions, so the limit and history always apply.
revoke insert, update, delete on public.habits from authenticated;
revoke insert, update, delete on public.habit_levels from authenticated;

revoke all on function public.get_repairs() from public, anon;
revoke all on function public.get_day_statuses(date, date) from public, anon;
revoke all on function public.get_habit_allowance() from public, anon;
revoke all on function public.create_habit(uuid, text, jsonb, public.habit_type, numeric, text, smallint[], time, time, text[], numeric, text) from public, anon;
revoke all on function public.update_habit(uuid, text, numeric, text, smallint[], time, time, text[], numeric, text, jsonb) from public, anon;
revoke all on function public.archive_habit(uuid) from public, anon;

grant execute on function public.get_repairs() to authenticated;
grant execute on function public.get_day_statuses(date, date) to authenticated;
grant execute on function public.get_habit_allowance() to authenticated;
grant execute on function public.create_habit(uuid, text, jsonb, public.habit_type, numeric, text, smallint[], time, time, text[], numeric, text) to authenticated;
grant execute on function public.update_habit(uuid, text, numeric, text, smallint[], time, time, text[], numeric, text, jsonb) to authenticated;
grant execute on function public.archive_habit(uuid) to authenticated;
