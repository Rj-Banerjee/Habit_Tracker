-- Scheduled jobs: the nightly patterns rebuild, Sunday's Future-Self letters, and server
-- reminders and nudges. pg_cron fires them, pg_net calls the AI service's /jobs endpoints
-- with a shared secret, and the service does the work through the service_role-only
-- functions below. Every job is safe to run twice.
--
-- Until the AI service is hosted, the URL and secret aren't in Vault and the schedules do
-- nothing. See docs/hosting-options.md.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Claims: the first run to claim a key does the work, any repeat skips it.
-- ---------------------------------------------------------------------------

create table tracker.job_runs (
  job text not null,
  run_key text not null,
  claimed_at timestamptz not null default now(),
  primary key (job, run_key)
);

create function public.job_claim(p_job text, p_run_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into tracker.job_runs (job, run_key) values (p_job, p_run_key)
  on conflict do nothing;
  return found;
end;
$$;

-- A job that failed gives its claim back, so the next run can try again.
create function public.job_release(p_job text, p_run_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from tracker.job_runs where job = p_job and run_key = p_run_key;
$$;

-- ---------------------------------------------------------------------------
-- Nightly patterns, for the coach to read as context.
-- ---------------------------------------------------------------------------

create table public.pattern_snapshots (
  user_id uuid primary key references public.users (id) on delete cascade,
  computed_on date not null,
  best_hours jsonb not null default '[]',
  weak_weekdays jsonb not null default '[]',
  common_skip_reasons jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

alter table public.pattern_snapshots enable row level security;
revoke all on public.pattern_snapshots from anon, authenticated;
grant select on public.pattern_snapshots to authenticated;

create policy pattern_snapshots_own on public.pattern_snapshots
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Replaces each person's snapshot with today's. Running it twice gives the same rows.
create function public.job_rebuild_patterns(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.pattern_snapshots (user_id, computed_on, best_hours, weak_weekdays, common_skip_reasons, updated_at)
  select p.user_id, tracker.local_date(p.user_id, p_now), p.best_hours, p.weak_weekdays, p.common_skip_reasons, p_now
  from public.user_patterns p
  on conflict (user_id) do update
  set computed_on = excluded.computed_on,
      best_hours = excluded.best_hours,
      weak_weekdays = excluded.weak_weekdays,
      common_skip_reasons = excluded.common_skip_reasons,
      updated_at = excluded.updated_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sunday's Future-Self letter: who is due one, and what to write it from.
-- ---------------------------------------------------------------------------

-- People for whom it's Sunday evening and this week's letter isn't written yet.
create function public.job_letter_candidates(p_now timestamptz default now(), p_hour int default 18)
returns table (user_id uuid, week_start date)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, (date_trunc('week', x.local_day))::date
  from public.users u
  cross join lateral (
    select (p_now at time zone u.timezone) as local_time,
           (p_now at time zone u.timezone)::date as local_day
  ) x
  where extract(isodow from x.local_day) = 7
    and extract(hour from x.local_time) >= p_hour
    and not exists (
      select 1 from public.coach_events c
      where c.user_id = u.id
        and c.kind = 'letter'
        and c.payload ->> 'week_start' = (date_trunc('week', x.local_day))::date::text
    );
$$;

-- The same things the in-app letter reads, for one person.
create function public.job_letter_context(p_user uuid, p_week_start date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tone', (select tone from public.users where id = p_user),
    'identities', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.name, 'why_text', i.why_text) order by i.name)
      from public.identities i where i.user_id = p_user
    ), '[]'),
    'logs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', l.date, 'status', l.status, 'level_done', l.level_done, 'amount', l.amount,
        'skip_reason', l.skip_reason, 'habits', jsonb_build_object('title', h.title)
      ) order by l.date desc)
      from public.habit_logs l
      join public.habits h on h.id = l.habit_id
      join public.identities i on i.id = h.identity_id
      where i.user_id = p_user and l.date >= p_week_start - 7
    ), '[]'),
    'wins', coalesce((
      select to_jsonb(r.wins) from public.reflections r
      where r.user_id = p_user and r.week_start = p_week_start
    ), '[]'),
    'mood', (
      select r.mood_line from public.reflections r
      where r.user_id = p_user and r.week_start = p_week_start
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Reminders and nudges, sent by push from the server.
-- ---------------------------------------------------------------------------

create table public.push_tokens (
  token text primary key check (char_length(token) <= 300),
  user_id uuid not null references public.users (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;

create policy push_tokens_own on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The daily reminder for anyone whose reminder time falls in this 15-minute window, with
-- something still open today. The 2-a-day cap counts it as one of the two.
create function public.job_due_reminders(p_now timestamptz default now())
returns table (user_id uuid, local_day date)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, x.local_day
  from public.users u
  cross join lateral (
    select (p_now at time zone u.timezone)::time as local_time,
           (p_now at time zone u.timezone)::date as local_day
  ) x
  where u.reminder_time is not null
    and x.local_time >= u.reminder_time
    and x.local_time < u.reminder_time + interval '15 minutes'
    and exists (
      select 1 from public.habits h
      join public.identities i on i.id = h.identity_id
      where i.user_id = u.id and h.archived_at is null
        and tracker.is_scheduled(h.id, x.local_day)
        and tracker.day_status(h.id, x.local_day, p_now) = 'pending'
    )
    and not exists (
      select 1 from public.coach_events c
      where c.user_id = u.id and c.kind = 'reminder' and c.payload ->> 'date' = x.local_day::text
    );
$$;

-- The preemptive nudge, by PLAN.md's rules: at most one a day, for the habit most at risk
-- (under 90% over the last 14 days), 30 minutes before its usual time from 5 or more
-- same-day logs, at least an hour from the reminder, not after 3 ignored in a row, and
-- only while it's still open.
create function public.job_due_nudges(p_now timestamptz default now())
returns table (user_id uuid, habit_id uuid, title text, local_day date, rate numeric, usual_hour int)
language sql
stable
security definer
set search_path = ''
as $$
  with local as (
    select u.id as user_id, u.timezone, u.reminder_time,
           (p_now at time zone u.timezone)::time as local_time,
           (p_now at time zone u.timezone)::date as local_day
    from public.users u
  ),
  open_today as (
    select l.user_id, l.reminder_time, l.local_time, l.local_day, l.timezone, h.id as habit_id, h.title
    from local l
    join public.identities i on i.user_id = l.user_id
    join public.habits h on h.identity_id = i.id and h.archived_at is null
    where tracker.is_scheduled(h.id, l.local_day)
      and tracker.day_status(h.id, l.local_day, p_now) = 'pending'
      and not exists (
        select 1 from public.coach_events c
        where c.user_id = l.user_id and c.kind = 'nudge' and c.payload ->> 'date' = l.local_day::text
      )
  ),
  scored as (
    select o.*,
      (
        select count(*) filter (where s.status in ('done', 'repaired'))::numeric
               / nullif(count(*) filter (where s.status not in ('unscheduled', 'skipped', 'pending')), 0)
        from generate_series(o.local_day - 14, o.local_day - 1, interval '1 day') d
        cross join lateral (select tracker.day_status(o.habit_id, d::date, p_now) as status) s
      ) as rate,
      (
        select mode() within group (order by extract(hour from g.logged_at at time zone o.timezone))
        from public.habit_logs g
        where g.habit_id = o.habit_id and g.status = 'done'
          and (g.logged_at at time zone o.timezone)::date = g.date
          and g.date >= o.local_day - 30
        having count(*) >= 5
      ) as usual_hour,
      (
        select bool_and(c.outcome = 'ignored') and count(*) = 3
        from (
          select c.outcome from public.coach_events c
          where c.user_id = o.user_id and c.kind = 'nudge' and c.payload ->> 'habit_id' = o.habit_id::text
            and c.outcome in ('logged', 'ignored')
          order by c.sent_at desc limit 3
        ) c
      ) as tuned_out
    from open_today o
  ),
  due as (
    select s.*, make_time(s.usual_hour::int, 0, 0) - interval '30 minutes' as nudge_at
    from scored s
    where s.rate is not null and s.rate < 0.9
      and s.usual_hour is not null
      and coalesce(s.tuned_out, false) = false
  )
  select distinct on (d.user_id) d.user_id, d.habit_id, d.title, d.local_day, round(d.rate, 3), d.usual_hour::int
  from due d
  where d.local_time >= d.nudge_at
    and d.local_time < d.nudge_at + interval '15 minutes'
    and (d.reminder_time is null
         or abs(extract(epoch from (d.nudge_at - d.reminder_time))) >= 3600)
  order by d.user_id, d.rate, d.title;
$$;

-- What a push needs, for one person.
create function public.job_push_tokens(p_user uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select token from public.push_tokens where user_id = p_user;
$$;

-- Only the AI service, with the secret key, can run any of these.
revoke all on function public.job_claim(text, text) from public, anon, authenticated;
revoke all on function public.job_release(text, text) from public, anon, authenticated;
revoke all on function public.job_rebuild_patterns(timestamptz) from public, anon, authenticated;
revoke all on function public.job_letter_candidates(timestamptz, int) from public, anon, authenticated;
revoke all on function public.job_letter_context(uuid, date) from public, anon, authenticated;
revoke all on function public.job_due_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.job_due_nudges(timestamptz) from public, anon, authenticated;
revoke all on function public.job_push_tokens(uuid) from public, anon, authenticated;
grant execute on function public.job_claim(text, text) to service_role;
grant execute on function public.job_release(text, text) to service_role;
grant execute on function public.job_rebuild_patterns(timestamptz) to service_role;
grant execute on function public.job_letter_candidates(timestamptz, int) to service_role;
grant execute on function public.job_letter_context(uuid, date) to service_role;
grant execute on function public.job_due_reminders(timestamptz) to service_role;
grant execute on function public.job_due_nudges(timestamptz) to service_role;
grant execute on function public.job_push_tokens(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- The schedules. Each calls the AI service, if Vault says where it is.
-- ---------------------------------------------------------------------------

create function tracker.call_job(p_job text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'ai_service_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ai_job_secret';
  -- Not hosted yet: nothing to call.
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/jobs/' || p_job,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Job-Secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function tracker.call_job(text) from public, anon, authenticated;

-- Times are UTC. Letters and reminders check each person's own clock, so these run often.
select cron.schedule('ai-nightly-patterns', '15 3 * * *', $$ select tracker.call_job('nightly-patterns') $$);
select cron.schedule('ai-sunday-letters', '5 * * * 0,1', $$ select tracker.call_job('sunday-letters') $$);
select cron.schedule('ai-reminders-and-nudges', '*/15 * * * *', $$ select tracker.call_job('reminders-and-nudges') $$);
