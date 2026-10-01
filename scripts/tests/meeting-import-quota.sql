-- AI meeting summary attempt quota + site-wide fuse (20261002100000_meeting_import_attempt_quota.sql).
-- DISPOSABLE DATABASE ONLY. Run with: bash scripts/tests/meeting-import-quota.sh
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create or replace function public.t_ok(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'FAILED: %',msg; end if; raise notice 'PASS: %',msg; end $$;
create or replace function public.t_err(stmt text, fragment text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if position(fragment in sqlerrm)>0 then raise notice 'PASS: %',msg; return; end if;
    raise exception 'FAILED: % (unexpected error: %)',msg,sqlerrm;
  end;
  raise exception 'FAILED: % (no error raised)',msg;
end $$;
-- What the Edge Function calls (as service_role).
create or replace function public.t_reserve(p_user uuid, p_id uuid default gen_random_uuid()) returns jsonb language sql as $$
  select public.reserve_meeting_import_v2(p_user, p_id, 'Meeting', current_date, 'This transcript is long enough to be accepted.', '{}'::jsonb)
$$;
-- Seed n finished rows this Taipei month, two hours old (outside the hourly rate window).
create or replace function public.t_seed(p_user uuid, n integer, p_status text, p_billable boolean default true) returns void language sql as $$
  insert into public.meeting_imports(id,user_id,month,title,meeting_date,transcript,status,result,provider_billable,created_at,finished_at)
  select gen_random_uuid(), p_user, date_trunc('month', now() at time zone 'Asia/Taipei')::date, 'Seed', current_date,
         'This transcript is long enough to be accepted.', p_status,
         case when p_status='succeeded' then '{"summary":"s","decisions":[],"questions":[],"tasks":[]}'::jsonb end,
         p_billable, now()-interval '2 hours', now()-interval '2 hours'
    from generate_series(1,n)
$$;
create or replace function public.t_rows(p_user uuid) returns bigint language sql as $$
  select count(*) from public.meeting_imports where user_id=p_user $$;
grant execute on function public.t_ok(boolean,text), public.t_err(text,text,text), public.t_reserve(uuid,uuid), public.t_rows(uuid) to service_role, authenticated, anon;

\set A  '00000000-0000-4000-8000-00000000a001'
\set B  '00000000-0000-4000-8000-00000000a002'
\set C  '00000000-0000-4000-8000-00000000a003'
\set D  '00000000-0000-4000-8000-00000000a004'
\set E  '00000000-0000-4000-8000-00000000a005'
\set N  '00000000-0000-4000-8000-00000000a006'
\set P  '00000000-0000-4000-8000-00000000a007'
\set Z  '00000000-0000-4000-8000-00000000a008'
\set R1 '30000000-0000-4000-8000-000000000001'
\set R2 '30000000-0000-4000-8000-000000000002'
\set R3 '30000000-0000-4000-8000-000000000003'
\set R4 '30000000-0000-4000-8000-000000000004'

insert into auth.users(id,email,created_at)
select u::uuid, u||'@example.invalid', now()-interval '30 days'
  from unnest(array[:'A',:'B',:'C',:'D',:'E',:'N',:'P',:'Z']) u;
insert into public.billing_entitlements(user_id,entitlement,expires_at,observed_at_ms) values (:'P','pro',now()+interval '30 days',1);

-- ════ Shape and privileges ═════════════════════════════════════════════════
select public.t_ok((select meeting_import_daily_cap=300 from huddle_ops.settings),'fuse defaults to 300 calls per 24 h');
select public.t_ok(position('meeting_import_attempt_guard' in pg_get_functiondef('public.reserve_meeting_import_v2(uuid,uuid,text,date,text,jsonb)'::regprocedure))>0
  and position('access_allowed(p_user)' in pg_get_functiondef('public.reserve_meeting_import_v2(uuid,uuid,text,date,text,jsonb)'::regprocedure))>0,
  'reserve_meeting_import_v2 runs the guard and keeps the suspension check');
select public.t_ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='huddle_ops.meeting_import_attempt_guard(uuid)'::regprocedure),
  'guard is SECURITY DEFINER with an empty search_path');
select public.t_ok(
  not has_function_privilege('anon','public.fail_meeting_import(uuid,uuid,jsonb,boolean)','EXECUTE')
  and not has_function_privilege('authenticated','public.fail_meeting_import(uuid,uuid,jsonb,boolean)','EXECUTE')
  and not has_function_privilege('anon','huddle_ops.meeting_import_attempt_guard(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','huddle_ops.meeting_import_attempt_guard(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.reserve_meeting_import_v2(uuid,uuid,text,date,text,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.fail_meeting_import(uuid,uuid,jsonb,boolean)','EXECUTE')
  and has_function_privilege('service_role','huddle_ops.meeting_import_attempt_guard(uuid)','EXECUTE'),
  'new functions: service_role only (even with Supabase default grants)');
select public.t_ok(not has_table_privilege('authenticated','public.meeting_imports','UPDATE')
  and not has_table_privilege('authenticated','public.meeting_imports','DELETE')
  and not has_table_privilege('authenticated','public.meeting_imports','INSERT')
  and not has_column_privilege('authenticated','public.meeting_imports','provider_billable','UPDATE')
  and not has_table_privilege('authenticated','huddle_ops.settings','UPDATE'),
  'members cannot write meeting_imports or the fuse setting');

-- ════ Failure is recorded with usage and counts as an attempt ═══════════════
set role service_role;
select public.t_ok((public.t_reserve(:'A',:'R1')->>'claimed')::boolean,'service_role reserves a summary');
select public.t_ok((public.fail_meeting_import(:'A',:'R1','{"prompt_tokens":30000,"completion_tokens":6000,"model":"gpt-4.1-mini","cost_usd":0.0216}'::jsonb,true)->>'status')='failed',
  'fail_meeting_import marks the row failed');
reset role;
select public.t_ok((select provider_billable and (usage->>'cost_usd')::numeric=0.0216 and (usage->>'completion_tokens')::int=6000 and finished_at is not null
  from public.meeting_imports where id=:'R1'),'failed row keeps token usage, cost and counts as billable');
set role service_role;
select public.t_err(format('select public.fail_meeting_import(%L,%L,null,true)',:'A',:'R1'),'REQUEST_EXPIRED','a finished row cannot be re-finished');
select public.t_err(format('select public.fail_meeting_import(%L,%L,null,false)',:'B',:'R1'),'REQUEST_EXPIRED','another member id cannot touch the row');
select public.t_ok((public.t_reserve(:'A',:'R2')->>'claimed')::boolean,'second reservation');
select public.fail_meeting_import(:'A',:'R2',null,null);
reset role;
select public.t_ok((select provider_billable from public.meeting_imports where id=:'R2'),'unknown billing (null) counts as charged');

-- ════ Attempt limit (limits switch OFF: quota 20 → 40 attempts) ════════════
select public.t_seed(:'B',39,'failed');
set role service_role;
select public.t_ok((public.t_reserve(:'B')->>'claimed')::boolean,'off: 40th model call of the month is allowed (39 failures before)');
select public.t_err(format('select public.t_reserve(%L)',:'B'),'ATTEMPT_LIMIT','off: 41st call is refused with ATTEMPT_LIMIT although nothing succeeded');
select public.t_ok(public.t_rows(:'B')=40,'refused call leaves no row behind (rolled back)');
reset role;
-- Failures OpenAI refused itself (not charged) do not count.
select public.t_seed(:'C',45,'failed',false);
set role service_role;
select public.t_ok((public.t_reserve(:'C')->>'claimed')::boolean,'off: provider-refused (not charged) failures do not use attempts');
-- Expired pendings (Edge Function died after calling OpenAI) count.
reset role;
select public.t_seed(:'D',40,'pending');
set role service_role;
select public.t_err(format('select public.t_reserve(%L)',:'D'),'ATTEMPT_LIMIT','off: stale pendings (crash after the call) count as attempts');
-- Replaying an existing request id after the limit is not refused.
reset role;
select public.t_seed(:'E',39,'failed');
set role service_role;
select public.t_ok((public.t_reserve(:'E',:'R3')->>'claimed')::boolean,'off: E takes its 40th call');
select public.t_ok(not (public.t_reserve(:'E',:'R3')->>'claimed')::boolean,'off: re-sending the same request id returns the existing row, not ATTEMPT_LIMIT');
reset role;

-- ════ Successful summaries: monthly quota unchanged ═════════════════════════
select public.t_seed(:'Z',20,'succeeded');
select public.t_seed(:'Z',5,'failed');
set role service_role;
select public.t_err(format('select public.t_reserve(%L)',:'Z'),'MONTHLY_LIMIT','off: 20 successes → MONTHLY_LIMIT (reported before ATTEMPT_LIMIT)');
reset role;
set role authenticated;
set request.jwt.claim.sub = :'B';
select public.t_ok((public.my_plan_usage()->'used'->>'meeting_imports_this_month')::int=1,
  'B: failures are not shown as used successes (only the 1 live pending counts, as before)');
reset role;
set role authenticated;
set request.jwt.claim.sub = :'Z';
select public.t_ok((public.my_plan_usage()->'used'->>'meeting_imports_this_month')::int=20,'Z: 20 successes still show 20 used; 5 failures do not');
reset role;

-- ════ Members cannot reset their own counter ════════════════════════════════
set role authenticated;
set request.jwt.claim.sub = :'B';
select public.t_ok((select count(*) from public.meeting_imports)=40,'B reads only its own 40 rows (RLS)');
select public.t_err(format('update public.meeting_imports set provider_billable=false where user_id=%L',:'B'),'permission denied','B cannot mark its failures as not charged');
select public.t_err(format('delete from public.meeting_imports where user_id=%L',:'B'),'permission denied','B cannot delete its attempts');
select public.t_err(format('select public.fail_meeting_import(%L,gen_random_uuid(),null,false)',:'B'),'permission denied','B cannot call fail_meeting_import');
select public.t_err(format('select huddle_ops.meeting_import_attempt_guard(%L)',:'B'),'permission denied','B cannot call the guard');
select public.t_err(format('select public.t_reserve(%L)',:'B'),'permission denied','B cannot call reserve_meeting_import_v2');
select public.t_err('update huddle_ops.settings set meeting_import_daily_cap=100000','permission denied','B cannot raise the site-wide fuse');
reset role;
set role anon;
select public.t_err('select public.fail_meeting_import(gen_random_uuid(),gen_random_uuid(),null,false)','permission denied','anon cannot call fail_meeting_import');
reset role;
select public.t_ok(public.t_rows(:'B')=40 and (select count(*) from public.meeting_imports where user_id=:'B' and provider_billable)=40,'B counter unchanged after the attempts');

-- ════ Limits switch ON: free 5 → 10 attempts, Pro 20 → 40 ═══════════════════
update huddle_ops.settings set limits_enforced=true, limits_enforced_at=now() where id;
select public.t_seed(:'N',10,'failed');
select public.t_seed(:'P',10,'failed');
set role service_role;
select public.t_err(format('select public.t_reserve(%L)',:'N'),'ATTEMPT_LIMIT','on: free member with 10 failed calls is refused (2 × 5)');
select public.t_ok((public.t_reserve(:'P')->>'claimed')::boolean,'on: Pro member with 10 failed calls continues (2 × 20)');
reset role;
update huddle_ops.settings set limits_enforced=false, limits_enforced_at=null where id;

-- ════ Site-wide daily fuse ══════════════════════════════════════════════════
update huddle_ops.settings set meeting_import_daily_cap=(
  select count(*) from public.meeting_imports where created_at>now()-interval '24 hours' and (status<>'failed' or provider_billable)) + 1 where id;
set role service_role;
select public.t_ok((public.t_reserve(:'A')->>'claimed')::boolean,'fuse: the last call under the cap is allowed');
select public.t_err(format('select public.t_reserve(%L)',:'Z'),'MONTHLY_LIMIT','fuse: per-member refusals still come first');
select public.t_err(format('select public.t_reserve(%L)',:'A'),'AI_PAUSED','fuse: next call from any member is refused with AI_PAUSED');
reset role;
-- Not-charged failures do not trip it; calls older than 24 h fall out of the window.
select public.t_seed(:'C',50,'failed',false);
update public.meeting_imports set created_at=now()-interval '25 hours' where user_id=:'B';
set role service_role;
select public.t_ok((public.t_reserve(:'A')->>'claimed')::boolean,'fuse: rolling 24 h window reopens as old calls age out (not-charged failures ignored)');
reset role;
update huddle_ops.settings set meeting_import_daily_cap=0 where id;
set role service_role;
select public.t_err(format('select public.t_reserve(%L)',:'C'),'AI_PAUSED','fuse: cap 0 stops all new AI summaries (kill switch)');
select public.t_ok(not (public.t_reserve(:'E',:'R3')->>'claimed')::boolean,'fuse: polling an existing request still works while paused');
reset role;
