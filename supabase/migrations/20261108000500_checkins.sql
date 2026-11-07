-- The daily check-in: energy, sleep and mood, on every plan and optional. Private to its
-- owner, never shared with groups or teams. See "Habit connections" in PLAN.md.

create table public.checkins (
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  energy smallint check (energy between 1 and 5),
  sleep_hours numeric(3, 1) check (sleep_hours between 0 and 16),
  mood smallint check (mood between 1 and 5),
  -- A wearable can fill the same fields later.
  source text not null default 'tap' check (source in ('tap', 'voice', 'wearable')),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.checkins enable row level security;
create policy checkins_owner_read on public.checkins
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.checkins from anon;
revoke insert, update, delete on table public.checkins from authenticated;
grant select on table public.checkins to authenticated;

-- When the card shows: from the start of the day, from 5pm, or never.
create type public.checkin_time as enum ('morning', 'evening', 'off');

alter table public.users
  add column checkin_time public.checkin_time not null default 'morning',
  -- Days skipped in a row, and the last one, so 3 in a row can ask once to turn it off.
  add column checkin_skips smallint not null default 0,
  add column checkin_skipped_on date,
  add column checkin_offer_answered boolean not null default false;

-- Saves what was given and keeps the rest, so "slept 6 hours" then "energy low" make one
-- day's check-in. Today, or yesterday for a late evening one.
create function tracker.save_checkin(
  p_user uuid,
  p_date date,
  p_energy smallint,
  p_sleep numeric,
  p_mood smallint,
  p_source text,
  p_now timestamptz
)
returns public.checkins
language plpgsql
set search_path = ''
as $$
declare
  v_today date := tracker.local_date(p_user, p_now);
  v_day date := coalesce(p_date, v_today);
  v_row public.checkins;
begin
  if v_day not in (v_today, v_today - 1) then
    raise exception 'A check-in is for today or yesterday';
  end if;
  if p_energy is null and p_sleep is null and p_mood is null then
    raise exception 'Nothing to save';
  end if;
  if p_energy not between 1 and 5 or p_mood not between 1 and 5 then
    raise exception 'Energy and mood go from 1 to 5';
  end if;
  if p_sleep not between 0 and 16 then
    raise exception 'Sleep is between 0 and 16 hours';
  end if;

  insert into public.checkins (user_id, date, energy, sleep_hours, mood, source, updated_at)
  values (p_user, v_day, p_energy, round(p_sleep * 2) / 2, p_mood, coalesce(p_source, 'tap'), p_now)
  on conflict (user_id, date) do update
  set energy = coalesce(excluded.energy, public.checkins.energy),
      sleep_hours = coalesce(excluded.sleep_hours, public.checkins.sleep_hours),
      mood = coalesce(excluded.mood, public.checkins.mood),
      source = excluded.source,
      updated_at = excluded.updated_at
  returning * into v_row;

  update public.users set checkin_skips = 0 where id = p_user;

  insert into public.activity_events (user_id, occurred_at, kind, payload, actor)
  values (
    p_user, p_now, 'checkin.daily',
    jsonb_strip_nulls(jsonb_build_object(
      'date', v_row.date, 'energy', v_row.energy, 'sleep_hours', v_row.sleep_hours,
      'mood', v_row.mood, 'source', v_row.source
    )),
    case when p_source = 'voice' then 'ai_assisted' else 'user' end::public.activity_actor
  );
  return v_row;
end;
$$;

create function public.save_checkin(
  p_energy smallint default null,
  p_sleep numeric default null,
  p_mood smallint default null,
  p_source text default 'tap',
  p_date date default null
)
returns public.checkins
language sql
security definer
set search_path = ''
as $$
  select tracker.save_checkin(tracker.current_user_id(), p_date, p_energy, p_sleep, p_mood, p_source, now());
$$;

-- "Skip for today". Counts days skipped in a row.
create function tracker.skip_checkin(p_user uuid, p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_today date := tracker.local_date(p_user, p_now);
begin
  update public.users
  set checkin_skips = case
        when checkin_skipped_on = v_today then checkin_skips
        when checkin_skipped_on = v_today - 1 then checkin_skips + 1
        else 1
      end,
      checkin_skipped_on = v_today
  where id = p_user;
end;
$$;

create function public.skip_checkin()
returns void
language sql
security definer
set search_path = ''
as $$
  select tracker.skip_checkin(tracker.current_user_id(), now());
$$;

-- Everything the card needs: the setting, today's check-in, and whether to ask once
-- about turning it off.
create function tracker.checkin_state(p_user uuid, p_now timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'time', u.checkin_time,
    'today', tracker.local_date(p_user, p_now),
    'hour', extract(hour from p_now at time zone u.timezone)::int,
    'checkin', (
      select to_jsonb(c) - 'user_id' from public.checkins c
      where c.user_id = p_user and c.date = tracker.local_date(p_user, p_now)
    ),
    'skipped_today', u.checkin_skipped_on = tracker.local_date(p_user, p_now),
    'ask_to_turn_off', u.checkin_skips >= 3 and not u.checkin_offer_answered
  )
  from public.users u
  where u.id = p_user;
$$;

create function public.get_checkin_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select tracker.checkin_state(tracker.current_user_id(), now());
$$;

create function public.set_checkin_time(p_time public.checkin_time)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.users
  set checkin_time = p_time, checkin_offer_answered = true, checkin_skips = 0
  where id = tracker.current_user_id();
$$;

-- The answer to "turn off the check-in?": asked only once either way.
create function public.answer_checkin_offer(p_keep boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.users
  set checkin_offer_answered = true,
      checkin_skips = 0,
      checkin_time = case when p_keep then checkin_time else 'off' end
  where id = tracker.current_user_id();
$$;

-- The activity log stays append-only, with one exception: people can delete their own
-- check-ins, which are personal, and their events go with them.
create or replace function tracker.protect_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.users where id = old.user_id) then
    return old;
  end if;
  if tg_op = 'DELETE' and old.kind = 'checkin.daily'
    and current_setting('tracker.deleting_checkins', true) = old.user_id::text
  then
    return old;
  end if;
  raise exception 'activity_events is append-only';
end;
$$;

-- People can delete every check-in they've made, and its events.
create function public.delete_checkins()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := tracker.current_user_id();
  v_count int;
begin
  delete from public.checkins where user_id = v_user;
  get diagnostics v_count = row_count;
  -- Only for this person, only check-in events, only in this transaction.
  perform set_config('tracker.deleting_checkins', v_user::text, true);
  delete from public.activity_events where user_id = v_user and kind = 'checkin.daily';
  perform set_config('tracker.deleting_checkins', '', true);
  return v_count;
end;
$$;

revoke all on function tracker.save_checkin(uuid, date, smallint, numeric, smallint, text, timestamptz) from public, anon, authenticated;
revoke all on function tracker.skip_checkin(uuid, timestamptz) from public, anon, authenticated;
revoke all on function tracker.checkin_state(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.save_checkin(smallint, numeric, smallint, text, date) from public, anon;
revoke all on function public.skip_checkin() from public, anon;
revoke all on function public.get_checkin_state() from public, anon;
revoke all on function public.set_checkin_time(public.checkin_time) from public, anon;
revoke all on function public.answer_checkin_offer(boolean) from public, anon;
revoke all on function public.delete_checkins() from public, anon;
grant execute on function public.save_checkin(smallint, numeric, smallint, text, date) to authenticated;
grant execute on function public.skip_checkin() to authenticated;
grant execute on function public.get_checkin_state() to authenticated;
grant execute on function public.set_checkin_time(public.checkin_time) to authenticated;
grant execute on function public.answer_checkin_offer(boolean) to authenticated;
grant execute on function public.delete_checkins() to authenticated;
