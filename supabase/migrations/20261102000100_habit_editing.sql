-- Editing habits: a missing field keeps its value and an explicit null clears it,
-- a habit can move to another identity, and a new identity saves with its habit.

drop function public.update_habit(uuid, text, numeric, text, smallint[], time, time, text[], numeric, text, jsonb);
drop function tracker.update_habit(uuid, uuid, text, numeric, text, smallint[], time, time, text[], numeric, text, jsonb, timestamptz);
drop function public.create_habit(uuid, text, jsonb, public.habit_type, numeric, text, smallint[], time, time, text[], numeric, text);

-- An existing identity, or a new one created in the same transaction as the habit.
create function tracker.resolve_identity(p_user uuid, p_identity uuid, p_new jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_identity uuid;
  v_name text := btrim(coalesce(p_new ->> 'name', ''));
begin
  if p_new is null or jsonb_typeof(p_new) = 'null' then
    if not exists (select 1 from public.identities where id = p_identity and user_id = p_user) then
      raise exception 'Identity not found';
    end if;
    return p_identity;
  end if;

  if v_name = '' then
    raise exception 'Give the identity a name';
  end if;

  insert into public.identities (user_id, name, colour_token, why_text)
  values (
    p_user,
    v_name,
    coalesce(p_new ->> 'colour_token', 'identity-1'),
    nullif(btrim(coalesce(p_new ->> 'why_text', '')), '')
  )
  returning id into v_identity;

  return v_identity;
end;
$$;

-- p_changes holds only what should change. A field left out keeps its value, and
-- a field set to null is cleared.
create function tracker.update_habit(
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
      identity_id = v_identity
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

create function public.update_habit(p_habit_id uuid, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  perform tracker.update_habit(v_user, p_habit_id, p_changes, now());
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
  p_new_identity jsonb default null
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
    p_window_end, p_voice_aliases, p_milestone_amount, p_milestone_label, p_levels, now()
  );
end;
$$;

-- Matches the wording used across the apps.
create or replace function tracker.create_habit(
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
    raise exception 'You have reached your habit limit. 2 consistent weeks unlock 2 more.';
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

revoke all on function public.update_habit(uuid, jsonb) from public, anon;
revoke all on function public.create_habit(uuid, text, jsonb, public.habit_type, numeric, text, smallint[], time, time, text[], numeric, text, jsonb) from public, anon;

grant execute on function public.update_habit(uuid, jsonb) to authenticated;
grant execute on function public.create_habit(uuid, text, jsonb, public.habit_type, numeric, text, smallint[], time, time, text[], numeric, text, jsonb) to authenticated;
