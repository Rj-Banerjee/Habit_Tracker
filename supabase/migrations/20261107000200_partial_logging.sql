-- Amounts add up through the day, and the day's status comes from its total against
-- that day's dated minimum and target, from any source. See "Amounts" in PLAN.md.

-- ---------------------------------------------------------------------------
-- Units, the same as packages/core/src/units.ts (a test keeps them in step)
-- ---------------------------------------------------------------------------

create table tracker.units (
  word text primary key,
  name text not null,
  family text not null check (family in ('distance', 'time', 'volume', 'count')),
  scale numeric not null
);

insert into tracker.units (word, name, family, scale) values
  ('km', 'km', 'distance', 1000),
  ('kms', 'km', 'distance', 1000),
  ('kilometre', 'km', 'distance', 1000),
  ('kilometres', 'km', 'distance', 1000),
  ('kilometer', 'km', 'distance', 1000),
  ('kilometers', 'km', 'distance', 1000),
  ('k', 'km', 'distance', 1000),
  ('m', 'm', 'distance', 1),
  ('metre', 'm', 'distance', 1),
  ('metres', 'm', 'distance', 1),
  ('meter', 'm', 'distance', 1),
  ('meters', 'm', 'distance', 1),
  ('mtr', 'm', 'distance', 1),
  ('mtrs', 'm', 'distance', 1),
  ('miles', 'miles', 'distance', 1609.344),
  ('mile', 'miles', 'distance', 1609.344),
  ('mi', 'miles', 'distance', 1609.344),
  ('min', 'min', 'time', 1),
  ('mins', 'min', 'time', 1),
  ('minute', 'min', 'time', 1),
  ('minutes', 'min', 'time', 1),
  ('minat', 'min', 'time', 1),
  ('minute ka', 'min', 'time', 1),
  ('hours', 'hours', 'time', 60),
  ('hour', 'hours', 'time', 60),
  ('hr', 'hours', 'time', 60),
  ('hrs', 'hours', 'time', 60),
  ('h', 'hours', 'time', 60),
  ('ghanta', 'hours', 'time', 60),
  ('ghante', 'hours', 'time', 60),
  ('sec', 'sec', 'time', 0.016666666666666666),
  ('secs', 'sec', 'time', 0.016666666666666666),
  ('second', 'sec', 'time', 0.016666666666666666),
  ('seconds', 'sec', 'time', 0.016666666666666666),
  ('s', 'sec', 'time', 0.016666666666666666),
  ('ml', 'ml', 'volume', 1),
  ('millilitre', 'ml', 'volume', 1),
  ('millilitres', 'ml', 'volume', 1),
  ('milliliter', 'ml', 'volume', 1),
  ('milliliters', 'ml', 'volume', 1),
  ('litres', 'litres', 'volume', 1000),
  ('l', 'litres', 'volume', 1000),
  ('litre', 'litres', 'volume', 1000),
  ('liter', 'litres', 'volume', 1000),
  ('liters', 'litres', 'volume', 1000),
  ('ltr', 'litres', 'volume', 1000),
  ('ltrs', 'litres', 'volume', 1000),
  ('glasses', 'glasses', 'count', 1),
  ('glass', 'glasses', 'count', 1),
  ('glas', 'glasses', 'count', 1),
  ('gilass', 'glasses', 'count', 1),
  ('pages', 'pages', 'count', 1),
  ('page', 'pages', 'count', 1),
  ('pg', 'pages', 'count', 1),
  ('pgs', 'pages', 'count', 1),
  ('panne', 'pages', 'count', 1),
  ('panna', 'pages', 'count', 1),
  ('steps', 'steps', 'count', 1),
  ('step', 'steps', 'count', 1),
  ('kadam', 'steps', 'count', 1),
  ('reps', 'reps', 'count', 1),
  ('rep', 'reps', 'count', 1),
  ('repetition', 'reps', 'count', 1),
  ('repetitions', 'reps', 'count', 1),
  ('times', 'reps', 'count', 1),
  ('push-ups', 'push-ups', 'count', 1),
  ('push-up', 'push-ups', 'count', 1),
  ('pushup', 'push-ups', 'count', 1),
  ('pushups', 'push-ups', 'count', 1),
  ('push up', 'push-ups', 'count', 1),
  ('push ups', 'push-ups', 'count', 1),
  ('squats', 'squats', 'count', 1),
  ('squat', 'squats', 'count', 1),
  ('words', 'words', 'count', 1),
  ('word', 'words', 'count', 1),
  ('shabd', 'words', 'count', 1),
  ('lines', 'lines', 'count', 1),
  ('line', 'lines', 'count', 1),
  ('chapters', 'chapters', 'count', 1),
  ('chapter', 'chapters', 'count', 1),
  ('problems', 'problems', 'count', 1),
  ('problem', 'problems', 'count', 1),
  ('question', 'problems', 'count', 1),
  ('questions', 'problems', 'count', 1),
  ('sawal', 'problems', 'count', 1),
  ('flashcards', 'flashcards', 'count', 1),
  ('flashcard', 'flashcards', 'count', 1),
  ('card', 'flashcards', 'count', 1),
  ('cards', 'flashcards', 'count', 1),
  ('lessons', 'lessons', 'count', 1),
  ('lesson', 'lessons', 'count', 1),
  ('servings', 'servings', 'count', 1),
  ('serving', 'servings', 'count', 1),
  ('portion', 'servings', 'count', 1),
  ('portions', 'servings', 'count', 1),
  ('fruits', 'fruits', 'count', 1),
  ('fruit', 'fruits', 'count', 1),
  ('phal', 'fruits', 'count', 1),
  ('rounds', 'rounds', 'count', 1),
  ('round', 'rounds', 'count', 1),
  ('mala', 'rounds', 'count', 1),
  ('items', 'items', 'count', 1),
  ('item', 'items', 'count', 1),
  ('things', 'items', 'count', 1),
  ('cheezein', 'items', 'count', 1),
  ('tasks', 'tasks', 'count', 1),
  ('task', 'tasks', 'count', 1),
  ('emails', 'emails', 'count', 1),
  ('email', 'emails', 'count', 1),
  ('mail', 'emails', 'count', 1),
  ('mails', 'emails', 'count', 1),
  ('calls', 'calls', 'count', 1),
  ('call', 'calls', 'count', 1),
  ('pomodoros', 'pomodoros', 'count', 1),
  ('pomodoro', 'pomodoros', 'count', 1),
  ('sun salutations', 'sun salutations', 'count', 1),
  ('sun salutation', 'sun salutations', 'count', 1),
  ('surya namaskar', 'sun salutations', 'count', 1),
  ('surya namaskars', 'sun salutations', 'count', 1),
  ('cigarettes', 'cigarettes', 'count', 1),
  ('cigarette', 'cigarettes', 'count', 1),
  ('cig', 'cigarettes', 'count', 1),
  ('cigs', 'cigarettes', 'count', 1),
  ('cups', 'cups', 'count', 1),
  ('cup', 'cups', 'count', 1)
;

-- An amount in one unit, in another, or null when they can't be compared. No unit, on
-- either side, means the habit's own.
create function tracker.convert_amount(p_amount numeric, p_from text, p_to text)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_from tracker.units;
  v_to tracker.units;
begin
  if p_from is null or btrim(p_from) = '' or p_to is null or btrim(p_to) = '' then
    return p_amount;
  end if;
  select * into v_from from tracker.units where word = lower(btrim(p_from));
  select * into v_to from tracker.units where word = lower(btrim(p_to));
  if v_from.word is null or v_to.word is null then
    return case when lower(btrim(p_from)) = lower(btrim(p_to)) then p_amount end;
  end if;
  if v_from.name = v_to.name then
    return p_amount;
  end if;
  if v_from.family <> v_to.family or v_from.family = 'count' then
    return null;
  end if;
  return round(p_amount * v_from.scale / v_to.scale, 3);
end;
$$;

-- The minimum's amount on a day, from that day's settings.
create function tracker.minimum_on(p_habit uuid, p_date date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select (level ->> 'target')::numeric
  from jsonb_array_elements((tracker.version_on(p_habit, p_date)).levels) as level
  where level ->> 'level' = 'minimum';
$$;

-- ---------------------------------------------------------------------------
-- The day's status from its total
-- ---------------------------------------------------------------------------

-- Below the minimum is noted but not counted. A habit with no minimum amount counts
-- any amount as the minimum.
create function tracker.status_for_total(p_habit uuid, p_date date, p_total numeric)
returns table (status public.log_status, level public.habit_level)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_target numeric := tracker.target_on(p_habit, p_date);
  v_minimum numeric := tracker.minimum_on(p_habit, p_date);
begin
  if v_target is not null and p_total >= v_target then
    return query select 'done'::public.log_status, 'full'::public.habit_level;
  elsif p_total > 0 and (v_minimum is null or p_total >= v_minimum) then
    return query select 'done'::public.log_status, 'minimum'::public.habit_level;
  else
    return query select 'partial'::public.log_status, null::public.habit_level;
  end if;
end;
$$;

-- When the day's total reaches 1.5x the missed day's target, the miss is repaired, the
-- same way repair_habit does it, with the same time so undo takes both back.
create function tracker.repair_by_total(
  p_user uuid,
  p_habit uuid,
  p_date date,
  p_total numeric,
  p_source public.log_source,
  p_now timestamptz
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_missed_day date := tracker.previous_scheduled_day(p_habit, p_date);
  v_day_before date;
begin
  if v_missed_day is null or tracker.mode_on(p_user, p_date) <> 'grace' then
    return false;
  end if;
  if not tracker.is_open_miss(p_habit, v_missed_day, p_now) then
    return false;
  end if;
  v_day_before := tracker.previous_scheduled_day(p_habit, v_missed_day);
  if v_day_before is not null and tracker.is_open_miss(p_habit, v_day_before, p_now) then
    return false;
  end if;
  if p_total < ceil(tracker.target_on(p_habit, v_missed_day) * 1.5) then
    return false;
  end if;

  insert into public.habit_logs (habit_id, date, status, source, logged_at)
  values (p_habit, v_missed_day, 'repaired', p_source, p_now)
  on conflict (habit_id, date) do update
  set status = 'repaired',
      level_done = null,
      amount = null,
      source = excluded.source,
      logged_at = excluded.logged_at;
  return true;
end;
$$;

-- Adds an amount to the day. An amount in a unit that can't count toward the habit's
-- logs nothing and says so. Returns where the day stands.
create function tracker.add_amount(
  p_user uuid,
  p_habit uuid,
  p_date date,
  p_amount numeric,
  p_unit text,
  p_source public.log_source,
  p_now timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_type public.habit_type;
  v_unit text := (tracker.version_on(p_habit, p_date)).unit;
  v_added numeric;
  v_log public.habit_logs;
  v_total numeric;
  v_status public.log_status;
  v_level public.habit_level;
  v_repaired boolean := false;
begin
  perform tracker.assert_can_change_day(p_user, p_habit, p_date, p_now);
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount above 0';
  end if;

  select type into v_type from public.habits where id = p_habit;
  if v_type not in ('count', 'duration') then
    raise exception 'This habit has no amount';
  end if;

  select * into v_log from public.habit_logs where habit_id = p_habit and date = p_date;
  v_added := tracker.convert_amount(p_amount, p_unit, v_unit);
  v_total := case when v_log.status in ('partial', 'done') then coalesce(v_log.amount, 0) else 0 end;

  if v_added is null then
    return jsonb_build_object(
      'counted', false, 'added', 0, 'total', v_total, 'unit', v_unit, 'said_unit', p_unit,
      'minimum', tracker.minimum_on(p_habit, p_date), 'target', tracker.target_on(p_habit, p_date),
      'status', coalesce(v_log.status::text, 'none'), 'level', v_log.level_done, 'repaired', false
    );
  end if;
  if v_log.status = 'repaired' then
    raise exception 'That day was repaired';
  end if;

  v_total := v_total + v_added;
  select s.status, s.level into v_status, v_level from tracker.status_for_total(p_habit, p_date, v_total) s;
  if v_status = 'done' then
    v_repaired := tracker.repair_by_total(p_user, p_habit, p_date, v_total, p_source, p_now);
  end if;

  insert into public.habit_logs (habit_id, date, level_done, amount, status, source, logged_at)
  values (p_habit, p_date, v_level, v_total, v_status, p_source, p_now)
  on conflict (habit_id, date) do update
  set level_done = excluded.level_done,
      amount = excluded.amount,
      status = excluded.status,
      skip_reason = null,
      source = excluded.source,
      logged_at = excluded.logged_at;

  return jsonb_build_object(
    'counted', true, 'added', v_added, 'total', v_total, 'unit', v_unit, 'said_unit', p_unit,
    'minimum', tracker.minimum_on(p_habit, p_date), 'target', tracker.target_on(p_habit, p_date),
    'status', v_status, 'level', v_level, 'repaired', v_repaired
  );
end;
$$;

-- Undo of one added amount: the day's total goes back down and its status follows. A
-- day back at zero has no log at all, as before it was logged.
create function tracker.remove_amount(
  p_user uuid,
  p_habit uuid,
  p_date date,
  p_amount numeric,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_log public.habit_logs;
  v_total numeric;
  v_status public.log_status;
  v_level public.habit_level;
begin
  perform tracker.assert_can_change_day(p_user, p_habit, p_date, p_now);
  select * into v_log from public.habit_logs where habit_id = p_habit and date = p_date;
  if v_log.habit_id is null or v_log.status not in ('partial', 'done') then
    return;
  end if;

  v_total := coalesce(v_log.amount, 0) - coalesce(p_amount, 0);
  if v_total <= 0 then
    perform tracker.undo_log(p_user, p_habit, p_date, p_now);
    return;
  end if;

  select s.status, s.level into v_status, v_level from tracker.status_for_total(p_habit, p_date, v_total) s;
  update public.habit_logs
  set amount = v_total, status = v_status, level_done = v_level
  where habit_id = p_habit and date = p_date;
  -- Below 1.5x now, so a repair made by this total no longer stands.
  if v_status <> 'done' or v_total < coalesce(
    ceil(tracker.target_on(p_habit, tracker.previous_scheduled_day(p_habit, p_date)) * 1.5), 0
  ) then
    delete from public.habit_logs
    where habit_id = p_habit
      and date = tracker.previous_scheduled_day(p_habit, p_date)
      and status = 'repaired'
      and logged_at = v_log.logged_at;
  end if;
end;
$$;

-- A tap logs a level. For an amount habit it raises the day's total to that level's
-- target, never lowers it, so "read 3 pages" then a tap on full is 10, not 3.
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

create function public.add_amount(
  p_habit_id uuid,
  p_amount numeric,
  p_unit text default null,
  p_date date default null,
  p_source public.log_source default 'tap'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  return tracker.add_amount(
    v_user, p_habit_id, coalesce(p_date, tracker.local_date(v_user, now())),
    p_amount, nullif(btrim(coalesce(p_unit, '')), ''), p_source, now()
  );
end;
$$;

create function public.remove_amount(p_habit_id uuid, p_amount numeric, p_date date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
begin
  perform tracker.remove_amount(
    v_user, p_habit_id, coalesce(p_date, tracker.local_date(v_user, now())), p_amount, now()
  );
end;
$$;

revoke all on table tracker.units from public, anon, authenticated;
revoke all on function public.add_amount(uuid, numeric, text, date, public.log_source) from public, anon;
revoke all on function public.remove_amount(uuid, numeric, date) from public, anon;
grant execute on function public.add_amount(uuid, numeric, text, date, public.log_source) to authenticated;
grant execute on function public.remove_amount(uuid, numeric, date) to authenticated;
