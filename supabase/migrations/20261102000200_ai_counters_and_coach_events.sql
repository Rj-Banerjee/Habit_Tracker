-- Rate-limit counters that survive restarts, and coach events from the AI service.
-- Both are for the service's secret key only: nothing here is open to app users.

create table tracker.ai_counters (
  scope text not null,
  bucket timestamptz not null,
  used int not null default 1,
  primary key (scope, bucket)
);
create index ai_counters_bucket_idx on tracker.ai_counters (bucket);

-- Takes one slot in a fixed window. Returns 0 if it was granted, otherwise the
-- seconds until the window resets. The upsert keeps this safe across processes.
create function public.ai_take_slot(p_scope text, p_limit int, p_seconds int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  v_used int;
begin
  delete from tracker.ai_counters where bucket < now() - interval '2 days';

  insert into tracker.ai_counters (scope, bucket)
  values (p_scope, v_bucket)
  on conflict (scope, bucket) do update
    set used = tracker.ai_counters.used + 1
    where tracker.ai_counters.used < p_limit
  returning used into v_used;

  if v_used is not null then
    return 0;
  end if;
  return greatest(1, ceil(extract(epoch from v_bucket + make_interval(secs => p_seconds) - now())))::int;
end;
$$;

revoke all on function public.ai_take_slot(text, int, int) from public, anon, authenticated;
grant execute on function public.ai_take_slot(text, int, int) to service_role;

grant usage on schema public to service_role;
grant select, insert on public.coach_events to service_role;

-- A voice log is the person's choice, but the AI worked out what they meant.
create or replace function tracker.record_log_activity()
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
    case when v_row.source in ('coach', 'voice') then 'ai_assisted' else 'user' end::public.activity_actor
  );
  return null;
end;
$$;
