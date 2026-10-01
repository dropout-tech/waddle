-- AI meeting summaries: every model call counts (security review 2026-10-02, F1).
--
-- Before: only pending/succeeded rows counted toward the monthly quota. A
-- summary that failed AFTER OpenAI answered (output too long, invented
-- source, …) was marked failed, cost nothing against the quota and recorded
-- no usage — so a free account could burn the OpenAI bill 30 times an hour.
--
-- Now, on top of the unchanged monthly quota (successful summaries,
-- plan_limits->meeting_imports):
--   * ATTEMPT_LIMIT  per member per Taipei month, at most 2 × the quota calls
--                    that may have been charged (pending, succeeded, or failed
--                    with provider_billable). Only a failure where OpenAI
--                    itself refused the request (non-2xx, not charged) is
--                    marked provider_billable = false by the Edge Function.
--   * AI_PAUSED      site-wide fuse: at most huddle_ops.settings
--                    .meeting_import_daily_cap such calls in any rolling 24 h,
--                    all members together. Setting it to 0 stops new AI
--                    summaries immediately (service_role / SQL editor only).
-- Both checks run inside reserve_meeting_import_v2 AFTER the reservation is
-- inserted; raising rolls the reservation back, so a refused request leaves
-- no row behind. Re-sending an existing request id is never refused here.
-- Existing failed rows default to provider_billable = true (they were charged).

set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.meeting_imports
  add column if not exists provider_billable boolean not null default true;
create index if not exists meeting_imports_created_at on public.meeting_imports(created_at);

alter table huddle_ops.settings
  add column if not exists meeting_import_daily_cap integer not null default 300
    check (meeting_import_daily_cap between 0 and 100000);

create or replace function huddle_ops.meeting_import_attempt_guard(p_user uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', now() at time zone 'Asia/Taipei')::date;
  v_limit integer;
  v_cap   integer;
begin
  if p_user is null then
    raise exception 'INVALID_USER';
  end if;
  -- Caller (reserve_meeting_import_v2) already holds this member's advisory
  -- lock, so the count below includes every row of theirs, the new one too.
  v_limit := 2 * coalesce((huddle_ops.plan_limits(p_user)->>'meeting_imports')::integer, 20);
  if (select count(*) from public.meeting_imports m
       where m.user_id = p_user and m.month = v_month
         and (m.status <> 'failed' or m.provider_billable)) > v_limit then
    raise exception 'ATTEMPT_LIMIT';
  end if;
  -- One site-wide lock so concurrent members cannot all take the last slot
  -- (always taken after the per-member lock: no deadlock).
  perform pg_advisory_xact_lock(hashtextextended('meeting_import_daily_cap', 726));
  select s.meeting_import_daily_cap into v_cap from huddle_ops.settings s where s.id;
  if (select count(*) from public.meeting_imports m
       where m.created_at > now() - interval '24 hours'
         and (m.status <> 'failed' or m.provider_billable)) > coalesce(v_cap, 0) then
    raise exception 'AI_PAUSED';
  end if;
end;
$$;

-- Same body as 20260926120000_harden_deactivated_accounts.sql, plus the guard.
CREATE OR REPLACE FUNCTION public.reserve_meeting_import_v2(p_user uuid, p_id uuid, p_title text, p_date date, p_transcript text, p_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare reservation jsonb; old_context jsonb;
begin
  if not huddle_ops.access_allowed(p_user) then raise exception 'ACCOUNT_SUSPENDED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,726));
  select context into old_context from public.meeting_imports where id=p_id and user_id=p_user;
  if found and old_context<>p_context then raise exception 'REQUEST_CONFLICT'; end if;
  reservation:=public.reserve_meeting_import(p_user,p_id,p_title,p_date,p_transcript);
  if (reservation->>'claimed')::boolean then
    perform huddle_ops.meeting_import_attempt_guard(p_user);
    update public.meeting_imports set context=p_context where id=p_id and user_id=p_user;
  end if;
  return reservation;
end $function$
;

-- Failure path of the Edge Function: keeps token usage / cost and whether
-- OpenAI could have charged. Unknown (null) counts as charged.
create or replace function public.fail_meeting_import(p_user uuid, p_id uuid, p_usage jsonb, p_billable boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.meeting_imports;
begin
  update public.meeting_imports
     set status = 'failed', result = null, usage = p_usage,
         provider_billable = coalesce(p_billable, true), finished_at = now()
   where id = p_id and user_id = p_user and status = 'pending'
  returning * into r;
  if not found then raise exception 'REQUEST_EXPIRED'; end if;
  return to_jsonb(r);
end;
$$;

revoke all on function huddle_ops.meeting_import_attempt_guard(uuid) from public, anon, authenticated;
revoke all on function public.fail_meeting_import(uuid,uuid,jsonb,boolean) from public, anon, authenticated;
-- reserve_meeting_import_v2 is SECURITY INVOKER, executed by the service role.
grant execute on function huddle_ops.meeting_import_attempt_guard(uuid) to service_role;
grant execute on function public.fail_meeting_import(uuid,uuid,jsonb,boolean) to service_role;

reset statement_timeout;
reset lock_timeout;
