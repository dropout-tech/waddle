-- cleanup-images: server-side rate limit (待辦盤點 #33, 2026-10-02).
--
-- Before: the client only self-throttled (localStorage, ≤ once a day on
-- launch + 5 s after a note delete). Any signed-in account could call the
-- Edge Function in a loop, and every call that found a >24h-old object ran
-- notebook_image_references(), i.e. one sequential scan of EVERY table in
-- public/huddle_ops — a cheap way to keep the database busy.
--
-- Now the Edge Function claims a run slot here before it lists or scans
-- anything; a caller whose last claimed run is younger than the interval gets
-- 429 and no work is done. The claim is a single upsert, so two concurrent
-- calls from the same account cannot both win.
--
-- Rows are only a timestamp per user and disappear with the account
-- (on delete cascade). Service-role only, like notebook_image_references().
--
-- Rollback: supabase/rollback/20261003010000_image_cleanup_rate_limit_down.sql
-- (deploy the previous cleanup-images first — the new one requires this RPC).

set lock_timeout = '5s';

create table if not exists huddle_ops.image_cleanup_runs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_run_at timestamptz not null
);

alter table huddle_ops.image_cleanup_runs enable row level security;
revoke all on table huddle_ops.image_cleanup_runs from public, anon, authenticated;

create or replace function public.claim_image_cleanup_run(p_user uuid, p_min_interval_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  claimed boolean;
begin
  if p_user is null or p_min_interval_seconds is null or p_min_interval_seconds < 0 then
    raise exception 'user and a non-negative interval are required';
  end if;

  insert into huddle_ops.image_cleanup_runs as r (user_id, last_run_at)
  values (p_user, clock_timestamp())
  on conflict (user_id) do update
     set last_run_at = excluded.last_run_at
   where r.last_run_at <= excluded.last_run_at - make_interval(secs => p_min_interval_seconds)
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_image_cleanup_run(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_image_cleanup_run(uuid, integer) to service_role;

comment on function public.claim_image_cleanup_run(uuid, integer) is
  'Service-role only. Atomically claims a cleanup-images run for p_user; false if the previous claimed run is younger than p_min_interval_seconds.';
