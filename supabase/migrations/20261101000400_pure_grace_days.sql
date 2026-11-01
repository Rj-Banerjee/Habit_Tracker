-- Grace Days become a pure result of habit_logs and settings. grace_days is now
-- a stored copy of that result, so it's identical whenever it's read.

-- Mode changes are dated, so each day is judged by the mode in force on it.
create table tracker.mode_history (
  user_id uuid not null references public.users (id) on delete cascade,
  effective_from date not null,
  mode public.streak_mode not null,
  primary key (user_id, effective_from)
);

insert into tracker.mode_history (user_id, effective_from, mode)
select id, '-infinity', mode from public.users;

create function tracker.record_initial_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into tracker.mode_history (user_id, effective_from, mode)
  values (new.id, '-infinity', new.mode);
  return new;
end;
$$;

create trigger users_record_initial_mode
  after insert on public.users
  for each row execute function tracker.record_initial_mode();

create function tracker.record_mode_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into tracker.mode_history (user_id, effective_from, mode)
  values (new.id, tracker.local_date(new.id, now()), new.mode)
  on conflict (user_id, effective_from) do update set mode = excluded.mode;
  return new;
end;
$$;

create trigger users_record_mode_change
  after update of mode on public.users
  for each row
  when (old.mode is distinct from new.mode)
  execute function tracker.record_mode_change();

create function tracker.mode_on(p_user uuid, p_date date)
returns public.streak_mode
language sql
stable
set search_path = ''
as $$
  select mode
  from tracker.mode_history
  where user_id = p_user and effective_from <= p_date
  order by effective_from desc
  limit 1;
$$;

alter table public.users add column settled_fingerprint text;

-- Everything the result depends on, so an unchanged user can skip the rebuild.
-- Only closed days matter, so logging today doesn't force one.
create function tracker.settle_fingerprint(p_user uuid, p_last_closed date)
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
      select string_agg(
        concat_ws(':', h.id, h.starts_on, h.schedule_days, h.archived_at),
        ',' order by h.id
      )
      from public.habits h
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

-- Rebuilds Grace Days from the start, oldest day first. The order of reads and
-- the time of the last read play no part in the result.
create or replace function tracker.settle(p_user uuid, p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_day date;
  v_last_closed date;
  v_fingerprint text;
  v_habit uuid;
  v_grace_id uuid;
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

  select min(h.starts_on) into v_day
  from public.habits h
  join public.identities i on i.id = h.identity_id
  where i.user_id = p_user;

  while v_day is not null and v_day <= v_last_closed loop
    if tracker.mode_on(p_user, v_day) = 'grace' then
      for v_habit in select tracker.due_habits(p_user, v_day) loop
        if tracker.day_status(v_habit, v_day, p_now) = 'missed'
          and (tracker.streak_stats(v_habit, v_day - 1, p_now)).current_streak > 0
        then
          select id into v_grace_id
          from public.grace_days
          where user_id = p_user and spent_for_date is null
          order by earned_at, id
          limit 1;

          if v_grace_id is not null then
            update public.grace_days
            set spent_on_habit = v_habit, spent_for_date = v_day
            where id = v_grace_id;
          end if;
        end if;
      end loop;

      if tracker.day_outcome(p_user, v_day, p_now) = 'complete'
        and tracker.complete_run(p_user, v_day, p_now) % 7 = 0
        and tracker.grace_bank(p_user) < 3
      then
        insert into public.grace_days (user_id, earned_at)
        values (p_user, tracker.window_closes_at(p_user, v_day));
      end if;
    end if;

    v_day := v_day + 1;
  end loop;

  update public.users
  set settled_through = v_last_closed, settled_fingerprint = v_fingerprint
  where id = p_user;
end;
$$;

-- Repairs read the Grace Day result, so it has to be current first.
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
    v_required := ceil(tracker.full_target(p_habit) * 1.5);
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
