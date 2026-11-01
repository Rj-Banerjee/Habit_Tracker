-- Replaces the scaffold's tables with the data model in PLAN.md.
-- This deletes the demo data, and removes weekly and monthly habits until v2.

drop table if exists public.chat_messages;
drop table if exists public.coach_profiles;
drop table if exists public.daily_quote_cache;
drop table if exists public.monthly_reflections;
drop table if exists public.monthly_habits;
drop table if exists public.weekly_habits;
drop table if exists public.daily_logs;
drop table if exists public.daily_habits;
drop table if exists public.users;

create type public.coach_tone as enum ('gentle', 'direct', 'drill');
create type public.streak_mode as enum ('strict', 'grace');
create type public.habit_type as enum ('boolean', 'count', 'duration', 'quit');
create type public.habit_level as enum ('full', 'minimum', 'setup');
create type public.log_status as enum ('done', 'skipped', 'repaired');
create type public.log_source as enum ('tap', 'widget', 'notification', 'siri', 'voice', 'coach');
create type public.coach_event_kind as enum ('nudge', 'miss_review', 'letter', 'chat');

create function public.is_valid_timezone(tz text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

-- Timezone decides where "today" ends. settled_through is the last local date
-- whose Grace Day outcome has been recorded.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'UTC' check (public.is_valid_timezone(timezone)),
  wake_time time,
  tone public.coach_tone not null default 'gentle',
  mode public.streak_mode not null default 'grace',
  assistant_name text check (char_length(assistant_name) <= 50),
  settled_through date,
  created_at timestamptz not null default now()
);

create table public.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  colour_token text not null default 'identity-1',
  why_text text check (char_length(why_text) <= 2000),
  why_image_url text,
  created_at timestamptz not null default now()
);
create index identities_user_id_idx on public.identities (user_id);

-- schedule_days uses ISO weekdays: 1 is Monday and 7 is Sunday.
-- starts_on stops days before the habit existed from counting as misses.
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.identities (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  type public.habit_type not null default 'boolean',
  target numeric check (target > 0),
  unit text check (char_length(unit) <= 30),
  schedule_days smallint[] not null default '{1,2,3,4,5,6,7}'
    check (
      cardinality(schedule_days) > 0
      and schedule_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    ),
  window_start time,
  window_end time,
  voice_aliases text[] not null default '{}',
  starts_on date not null default current_date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (type not in ('count', 'duration') or target is not null)
);
create index habits_identity_id_idx on public.habits (identity_id);

-- The Shrink It ladder.
create table public.habit_levels (
  habit_id uuid not null references public.habits (id) on delete cascade,
  level public.habit_level not null,
  description text not null check (char_length(description) between 1 and 200),
  target numeric check (target > 0),
  primary key (habit_id, level)
);

-- One row per habit per day. "Missed" is never stored: it is computed from the
-- absence of a row once the back-log window closes.
create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  date date not null,
  level_done public.habit_level,
  amount numeric check (amount >= 0),
  status public.log_status not null,
  skip_reason text check (char_length(skip_reason) <= 200),
  source public.log_source not null default 'tap',
  logged_at timestamptz not null default now(),
  unique (habit_id, date),
  check (status <> 'done' or level_done is not null),
  check (status <> 'skipped' or (skip_reason is not null and char_length(btrim(skip_reason)) > 0))
);

create table public.grace_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  earned_at timestamptz not null default now(),
  spent_on_habit uuid references public.habits (id) on delete set null,
  spent_for_date date,
  unique (spent_on_habit, spent_for_date)
);
create index grace_days_user_id_idx on public.grace_days (user_id);

create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  week_start date not null,
  wins text[] not null default '{}' check (cardinality(wins) <= 3),
  month_note text check (char_length(month_note) <= 2000),
  mood_line text check (char_length(mood_line) <= 200),
  unique (user_id, week_start)
);

create table public.coach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind public.coach_event_kind not null,
  payload jsonb not null default '{}',
  sent_at timestamptz not null default now(),
  outcome text
);
create index coach_events_user_sent_idx on public.coach_events (user_id, sent_at desc);

-- Best hours, weak weekdays and common skip reasons, for the coach. The view
-- respects the reader's row-level security.
create view public.user_patterns
with (security_invoker = true)
as
select
  u.id as user_id,
  (
    select coalesce(jsonb_agg(h.hour order by h.logs desc, h.hour), '[]')
    from (
      select extract(hour from l.logged_at at time zone u.timezone)::int as hour, count(*) as logs
      from public.habit_logs l
      join public.habits hb on hb.id = l.habit_id
      join public.identities i on i.id = hb.identity_id
      where i.user_id = u.id and l.status = 'done'
      group by 1
      order by logs desc, hour
      limit 3
    ) h
  ) as best_hours,
  (
    select coalesce(jsonb_agg(w.weekday order by w.skips desc, w.weekday), '[]')
    from (
      select extract(isodow from l.date)::int as weekday, count(*) as skips
      from public.habit_logs l
      join public.habits hb on hb.id = l.habit_id
      join public.identities i on i.id = hb.identity_id
      where i.user_id = u.id and l.status = 'skipped'
      group by 1
      order by skips desc, weekday
      limit 2
    ) w
  ) as weak_weekdays,
  (
    select coalesce(jsonb_agg(r.reason order by r.uses desc, r.reason), '[]')
    from (
      select l.skip_reason as reason, count(*) as uses
      from public.habit_logs l
      join public.habits hb on hb.id = l.habit_id
      join public.identities i on i.id = hb.identity_id
      where i.user_id = u.id and l.status = 'skipped'
      group by 1
      order by uses desc, reason
      limit 3
    ) r
  ) as common_skip_reasons
from public.users u;

-- Every signed-up account gets a profile row.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := new.raw_user_meta_data ->> 'timezone';
begin
  insert into public.users (id, timezone)
  values (new.id, case when public.is_valid_timezone(tz) then tz else 'UTC' end);
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.users enable row level security;
alter table public.identities enable row level security;
alter table public.habits enable row level security;
alter table public.habit_levels enable row level security;
alter table public.habit_logs enable row level security;
alter table public.grace_days enable row level security;
alter table public.reflections enable row level security;
alter table public.coach_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- settled_through and id are not writable by clients.
grant select on public.users to authenticated;
grant update (timezone, wake_time, tone, mode, assistant_name) on public.users to authenticated;
grant select, insert, update, delete on public.identities to authenticated;
grant select, insert, update, delete on public.habits to authenticated;
grant select, insert, update, delete on public.habit_levels to authenticated;
grant select, insert, update, delete on public.habit_logs to authenticated;
grant select on public.grace_days to authenticated;
grant select, insert, update, delete on public.reflections to authenticated;
grant select on public.coach_events to authenticated;
grant select on public.user_patterns to authenticated;

create policy users_own on public.users
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy identities_own on public.identities
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy habits_own on public.habits
  for all to authenticated
  using (exists (
    select 1 from public.identities i
    where i.id = identity_id and i.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.identities i
    where i.id = identity_id and i.user_id = (select auth.uid())
  ));

create policy habit_levels_own on public.habit_levels
  for all to authenticated
  using (exists (
    select 1 from public.habits h
    join public.identities i on i.id = h.identity_id
    where h.id = habit_id and i.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.habits h
    join public.identities i on i.id = h.identity_id
    where h.id = habit_id and i.user_id = (select auth.uid())
  ));

create policy habit_logs_own on public.habit_logs
  for all to authenticated
  using (exists (
    select 1 from public.habits h
    join public.identities i on i.id = h.identity_id
    where h.id = habit_id and i.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.habits h
    join public.identities i on i.id = h.identity_id
    where h.id = habit_id and i.user_id = (select auth.uid())
  ));

create policy grace_days_own on public.grace_days
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy reflections_own on public.reflections
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy coach_events_own on public.coach_events
  for select to authenticated
  using (user_id = (select auth.uid()));
