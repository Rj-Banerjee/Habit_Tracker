-- No habit limit, and the settings the new habit form saves: time of day, a reminder per
-- habit, specific days or times per week, and an end date. All but the reminder are
-- dated, like the schedule. Times per week and the end date are only stored here: the
-- rules that use them come in a later migration, so until then they change nothing.

-- ---------------------------------------------------------------------------
-- No habit limit
-- ---------------------------------------------------------------------------

drop function public.get_habit_allowance();
drop function tracker.habit_allowance(uuid, timestamptz);
drop function tracker.active_habits(uuid);

-- ---------------------------------------------------------------------------
-- New settings
-- ---------------------------------------------------------------------------

create type public.time_of_day as enum ('morning', 'afternoon', 'evening', 'anytime');
create type public.habit_frequency as enum ('days', 'per_week');

alter table public.habits
  add column time_of_day public.time_of_day not null default 'anytime',
  add column reminder_time time,
  add column frequency public.habit_frequency not null default 'days',
  add column per_week smallint check (per_week between 1 and 6),
  add column ends_on date,
  add column previous_run_id uuid references public.habits (id) on delete set null,
  add constraint habits_per_week_matches check ((frequency = 'per_week') = (per_week is not null)),
  add constraint habits_ends_after_start check (ends_on is null or ends_on >= starts_on);

create index habits_previous_run_id_idx on public.habits (previous_run_id);

alter table tracker.habit_versions
  add column time_of_day public.time_of_day not null default 'anytime',
  add column frequency public.habit_frequency not null default 'days',
  add column per_week smallint,
  add column ends_on date;

-- One-time tips and celebrations, so each shows once on every device.
alter table public.users add column seen_tips text[] not null default '{}';

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
    time_of_day, frequency, per_week, ends_on
  )
  select h.id, v_from, h.schedule_days, h.target, h.unit, tracker.current_levels(h.id),
         h.time_of_day, h.frequency, h.per_week, h.ends_on
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
      ends_on = excluded.ends_on;
end;
$$;

create or replace function tracker.habit_first_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into tracker.habit_versions (
    habit_id, effective_from, schedule_days, target, unit, levels,
    time_of_day, frequency, per_week, ends_on
  )
  values (
    new.id, '-infinity', new.schedule_days, new.target, new.unit, '[]',
    new.time_of_day, new.frequency, new.per_week, new.ends_on
  );
  return null;
end;
$$;

drop trigger habits_record_version on public.habits;
create trigger habits_record_version
  after update of schedule_days, target, unit, time_of_day, frequency, per_week, ends_on
  on public.habits
  for each row
  when (
    old.schedule_days is distinct from new.schedule_days
    or old.target is distinct from new.target
    or old.unit is distinct from new.unit
    or old.time_of_day is distinct from new.time_of_day
    or old.frequency is distinct from new.frequency
    or old.per_week is distinct from new.per_week
    or old.ends_on is distinct from new.ends_on
  )
  execute function tracker.habit_version_trigger();

-- Times per week goes from 1 to 6: 7 is every day, which is specific days.
create function tracker.assert_valid_frequency(
  p_frequency public.habit_frequency,
  p_per_week smallint,
  p_ends_on date,
  p_starts_on date
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_frequency = 'per_week' and (p_per_week is null or p_per_week not between 1 and 6) then
    raise exception 'Choose 1 to 6 times a week';
  end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'The end date is before the habit starts';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Creating and editing
-- ---------------------------------------------------------------------------

drop function public.create_habit(uuid, text, jsonb, public.habit_type, numeric, text, smallint[], time, time, text[], numeric, text, jsonb);
drop function tracker.create_habit(uuid, uuid, text, public.habit_type, numeric, text, smallint[], time, time, text[], numeric, text, jsonb, timestamptz);

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
  p_time_of_day public.time_of_day,
  p_reminder_time time,
  p_frequency public.habit_frequency,
  p_per_week smallint,
  p_ends_on date,
  p_now timestamptz
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_habit uuid;
  v_starts date := tracker.local_date(p_user, p_now);
  v_frequency public.habit_frequency := coalesce(p_frequency, 'days');
begin
  if not exists (select 1 from public.identities where id = p_identity and user_id = p_user) then
    raise exception 'Identity not found';
  end if;

  perform tracker.assert_valid_habit(p_type, p_title, p_target, p_schedule_days, p_levels);
  perform tracker.assert_valid_frequency(v_frequency, p_per_week, p_ends_on, v_starts);

  insert into public.habits (
    identity_id, title, type, target, unit, schedule_days, window_start, window_end,
    voice_aliases, milestone_amount, milestone_label, starts_on,
    time_of_day, reminder_time, frequency, per_week, ends_on
  )
  values (
    p_identity, btrim(p_title), p_type, p_target, p_unit, p_schedule_days, p_window_start,
    p_window_end, coalesce(p_voice_aliases, '{}'), p_milestone_amount, p_milestone_label,
    v_starts, coalesce(p_time_of_day, 'anytime'), p_reminder_time, v_frequency,
    case when v_frequency = 'per_week' then p_per_week end, p_ends_on
  )
  returning id into v_habit;

  perform tracker.replace_levels(v_habit, p_levels);
  perform tracker.record_habit_version(v_habit, p_now);
  return v_habit;
end;
$$;

-- p_new_identity creates the identity in this transaction, so a refused habit
-- leaves nothing behind.
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
  p_milestone_label text default null,
  p_new_identity jsonb default null,
  p_time_of_day public.time_of_day default 'anytime',
  p_reminder_time time default null,
  p_frequency public.habit_frequency default 'days',
  p_per_week smallint default null,
  p_ends_on date default null
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
    v_user,
    tracker.resolve_identity(v_user, p_identity_id, p_new_identity),
    p_title, p_type, p_target, p_unit, p_schedule_days, p_window_start,
    p_window_end, p_voice_aliases, p_milestone_amount, p_milestone_label, p_levels,
    p_time_of_day, p_reminder_time, p_frequency, p_per_week, p_ends_on, now()
  );
end;
$$;

-- p_changes holds only what should change. A field left out keeps its value, and
-- a field set to null is cleared.
create or replace function tracker.update_habit(
  p_user uuid,
  p_habit uuid,
  p_changes jsonb,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_habit public.habits;
  v_identity uuid;
  v_schedule smallint[];
  v_levels jsonb;
  v_title text;
  v_target numeric;
  v_unit text;
  v_amount numeric;
  v_label text;
  v_frequency public.habit_frequency;
  v_per_week smallint;
  v_ends_on date;
begin
  if tracker.habit_owner(p_habit) is distinct from p_user then
    raise exception 'Habit not found';
  end if;

  select * into v_habit from public.habits where id = p_habit;

  v_title := case when p_changes ? 'title' then p_changes ->> 'title' else v_habit.title end;
  v_target := case when p_changes ? 'target' then (p_changes ->> 'target')::numeric else v_habit.target end;
  v_unit := case when p_changes ? 'unit' then p_changes ->> 'unit' else v_habit.unit end;
  v_amount := case
    when p_changes ? 'milestone_amount' then (p_changes ->> 'milestone_amount')::numeric
    else v_habit.milestone_amount
  end;
  v_label := case
    when p_changes ? 'milestone_label' then p_changes ->> 'milestone_label'
    else v_habit.milestone_label
  end;
  v_frequency := case
    when p_changes ? 'frequency' then coalesce((p_changes ->> 'frequency')::public.habit_frequency, 'days')
    else v_habit.frequency
  end;
  v_per_week := case
    when p_changes ? 'per_week' then (p_changes ->> 'per_week')::smallint
    else v_habit.per_week
  end;
  if v_frequency = 'days' then
    v_per_week := null;
  end if;
  v_ends_on := case when p_changes ? 'ends_on' then (p_changes ->> 'ends_on')::date else v_habit.ends_on end;

  v_schedule := v_habit.schedule_days;
  if p_changes ? 'schedule_days' then
    select coalesce(array_agg(value::smallint), '{}')
    into v_schedule
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(p_changes -> 'schedule_days') = 'array' then p_changes -> 'schedule_days'
        else '[]'::jsonb
      end
    );
  end if;

  v_levels := tracker.current_levels(p_habit);
  if p_changes ? 'levels' then
    v_levels := case
      when jsonb_typeof(p_changes -> 'levels') = 'array' then p_changes -> 'levels'
      else '[]'::jsonb
    end;
  end if;

  perform tracker.assert_valid_habit(v_habit.type, v_title, v_target, v_schedule, v_levels);
  perform tracker.assert_valid_frequency(v_frequency, v_per_week, v_ends_on, v_habit.starts_on);

  if (v_amount is null) <> (v_label is null) then
    raise exception 'A milestone needs an amount and a name';
  end if;

  v_identity := v_habit.identity_id;
  if p_changes ? 'new_identity' then
    v_identity := tracker.resolve_identity(p_user, null, p_changes -> 'new_identity');
  elsif p_changes ? 'identity_id' then
    v_identity := tracker.resolve_identity(p_user, (p_changes ->> 'identity_id')::uuid, null);
  end if;

  update public.habits
  set title = btrim(v_title),
      target = v_target,
      unit = v_unit,
      schedule_days = v_schedule,
      window_start = case
        when p_changes ? 'window_start' then (p_changes ->> 'window_start')::time
        else window_start
      end,
      window_end = case
        when p_changes ? 'window_end' then (p_changes ->> 'window_end')::time
        else window_end
      end,
      voice_aliases = case
        when p_changes ? 'voice_aliases' then coalesce(
          (select array_agg(value) from jsonb_array_elements_text(
            case
              when jsonb_typeof(p_changes -> 'voice_aliases') = 'array' then p_changes -> 'voice_aliases'
              else '[]'::jsonb
            end
          )),
          '{}'
        )
        else voice_aliases
      end,
      milestone_amount = v_amount,
      milestone_label = v_label,
      identity_id = v_identity,
      time_of_day = case
        when p_changes ? 'time_of_day' then coalesce((p_changes ->> 'time_of_day')::public.time_of_day, 'anytime')
        else time_of_day
      end,
      reminder_time = case
        when p_changes ? 'reminder_time' then (p_changes ->> 'reminder_time')::time
        else reminder_time
      end,
      frequency = v_frequency,
      per_week = v_per_week,
      ends_on = v_ends_on
  where id = p_habit;

  if p_changes ? 'levels' then
    perform tracker.replace_levels(p_habit, v_levels);
  end if;

  perform tracker.record_habit_version(p_habit, p_now);

  if v_identity <> v_habit.identity_id then
    insert into public.activity_events (user_id, occurred_at, kind, subject_id, payload)
    values (
      p_user,
      p_now,
      'habit_moved',
      p_habit,
      jsonb_build_object('from_identity', v_habit.identity_id, 'to_identity', v_identity)
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- One-time tips
-- ---------------------------------------------------------------------------

create function public.mark_tip_seen(p_tip text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  if p_tip is null or p_tip !~ '^[a-z0-9:_-]{1,80}$' then
    raise exception 'Unknown tip';
  end if;
  update public.users
  set seen_tips = array_append(seen_tips, p_tip)
  where id = v_user and not (p_tip = any (seen_tips));
end;
$$;

revoke all on function public.create_habit(uuid, text, jsonb, public.habit_type, numeric, text, smallint[], time, time, text[], numeric, text, jsonb, public.time_of_day, time, public.habit_frequency, smallint, date) from public, anon;
revoke all on function public.mark_tip_seen(text) from public, anon;
revoke all on function tracker.assert_valid_frequency(public.habit_frequency, smallint, date, date) from public, anon, authenticated;

grant execute on function public.create_habit(uuid, text, jsonb, public.habit_type, numeric, text, smallint[], time, time, text[], numeric, text, jsonb, public.time_of_day, time, public.habit_frequency, smallint, date) to authenticated;
grant execute on function public.mark_tip_seen(text) to authenticated;
