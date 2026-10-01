-- AI consent / AI review ledger checks. DISPOSABLE DATABASE ONLY.
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
-- Test-only inspectors (owner = superuser) so role-switched sessions can look at closed tables.
create or replace function public.t_cid(p_user uuid, p_feature text) returns bigint language sql security definer as
$$ select id from public.ai_consents where user_id=p_user and feature=p_feature order by id desc limit 1 $$;
create or replace function public.t_usage(p_id uuid) returns text language sql security definer as
$$ select status||':'||coalesce(failure_code,'') from public.ai_review_usage where id=p_id $$;
create or replace function public.t_n(p_table text, p_user uuid) returns integer language plpgsql security definer as
$$ declare n integer; begin execute format('select count(*) from public.%I where user_id=$1',p_table) into n using p_user; return n; end $$;
create or replace function public.t_report(p_user uuid, p_cid bigint, p_rhythm text default '節奏', p_stats jsonb default '{"completed_count":3,"focus_minutes":90}')
returns jsonb language sql as $$
  select jsonb_build_object('consent_id',p_cid,'period_key','last_week','period_start','2026-09-17T02:00:00Z',
    'period_end','2026-09-24T02:00:00Z','locale','zh-TW','rhythm',p_rhythm,'done','做了','time_spent','時間',
    'pending','掛著','observation','觀察','stats',p_stats) $$;
grant execute on function public.t_ok(boolean,text), public.t_err(text,text,text), public.t_cid(uuid,text),
  public.t_usage(uuid), public.t_n(text,uuid), public.t_report(uuid,bigint,text,jsonb) to authenticated, anon, service_role;

-- A free, B pro, C free (attempt limit), S suspended, N anonymous, G filler, W withdraw, M meeting, X stale
\set A '00000000-0000-4000-8000-0000000000a1'
\set B '00000000-0000-4000-8000-0000000000b1'
\set C '00000000-0000-4000-8000-0000000000c1'
\set S '00000000-0000-4000-8000-0000000000d1'
\set N '00000000-0000-4000-8000-0000000000e1'
\set G '00000000-0000-4000-8000-0000000000f1'
\set W '00000000-0000-4000-8000-0000000000f2'
\set M '00000000-0000-4000-8000-0000000000f3'
\set X '00000000-0000-4000-8000-0000000000f4'
insert into auth.users(id,email,is_anonymous) values
 (:'A','a@example.invalid',false),(:'B','b@example.invalid',false),(:'C','c@example.invalid',false),
 (:'S','s@example.invalid',false),(:'N','n@example.invalid',true),(:'G','g@example.invalid',false),
 (:'W','w@example.invalid',false),(:'M','m@example.invalid',false),(:'X','x@example.invalid',false);
insert into public.billing_entitlements(user_id,entitlement,expires_at,observed_at_ms) values (:'B','pro',now()+interval '30 days',1);
insert into huddle_ops.members(user_id,alias,suspended) values (:'S','suspended',true);

-- Nothing is granted here on purpose: every check must hold with only what
-- the migration itself granted.

-- ── structure ───────────────────────────────────────────────────────────────
select public.t_ok((select count(*)=3 from pg_policy p join pg_class c on c.oid=p.polrelid
  where p.polname='operations_account_active' and c.relname in ('ai_consents','ai_review_usage','ai_review_reports')),
  'all three new tables carry the restrictive suspension policy');
select public.t_ok((select bool_and(c.relrowsecurity) from pg_class c where c.relname in ('ai_consents','ai_review_usage','ai_review_reports')),
  'RLS enabled on all three tables');
select public.t_ok((select count(*)=7 and bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from pg_proc p
  where p.proname in ('record_ai_consent','reserve_ai_review','finish_ai_review','ai_feature_status','reserve_meeting_import_v3','ai_consent_state','ai_review_quota')),
  'all 7 functions are SECURITY DEFINER with an empty search_path');
select public.t_ok(not has_function_privilege('authenticated','public.reserve_ai_review(uuid,uuid,integer)','execute')
  and not has_function_privilege('anon','public.reserve_ai_review(uuid,uuid,integer)','execute')
  and not has_function_privilege('authenticated','public.finish_ai_review(uuid,uuid,jsonb,text,integer,integer)','execute')
  and not has_function_privilege('authenticated','public.ai_feature_status(uuid,text,integer)','execute')
  and not has_function_privilege('authenticated','public.reserve_meeting_import_v3(uuid,uuid,text,date,text,jsonb,integer)','execute')
  and not has_function_privilege('authenticated','public.record_ai_consent(uuid,text,text,text,text,integer,jsonb,text,text,text,text,boolean)','execute')
  and not has_function_privilege('anon','public.record_ai_consent(uuid,text,text,text,text,integer,jsonb,text,text,text,text,boolean)','execute')
  and not has_function_privilege('authenticated','huddle_ops.ai_review_quota(uuid)','execute')
  and not has_function_privilege('authenticated','huddle_ops.ai_consent_state(uuid,text,integer)','execute'),
  'no client role can execute the RPCs or helpers');
select public.t_ok(has_function_privilege('service_role','public.reserve_ai_review(uuid,uuid,integer)','execute')
  and has_function_privilege('service_role','public.record_ai_consent(uuid,text,text,text,text,integer,jsonb,text,text,text,text,boolean)','execute')
  and has_function_privilege('service_role','public.finish_ai_review(uuid,uuid,jsonb,text,integer,integer)','execute')
  and has_function_privilege('service_role','public.ai_feature_status(uuid,text,integer)','execute')
  and has_function_privilege('service_role','public.reserve_meeting_import_v3(uuid,uuid,text,date,text,jsonb,integer)','execute')
  and not has_function_privilege('service_role','huddle_ops.ai_review_quota(uuid)','execute')
  and not has_function_privilege('service_role','huddle_ops.has_pro(uuid)','execute'),
  'service_role can execute the 5 RPCs but not the huddle_ops helpers / has_pro');
select public.t_ok(not has_table_privilege('authenticated','public.ai_consents','insert')
  and not has_table_privilege('authenticated','public.ai_consents','update')
  and not has_table_privilege('authenticated','public.ai_consents','delete')
  and has_table_privilege('authenticated','public.ai_consents','select')
  and not has_table_privilege('authenticated','public.ai_review_usage','select')
  and not has_table_privilege('authenticated','public.ai_review_usage','insert')
  and not has_table_privilege('authenticated','public.ai_review_usage','update')
  and not has_table_privilege('authenticated','public.ai_review_usage','delete')
  and has_table_privilege('authenticated','public.ai_review_reports','select')
  and has_table_privilege('authenticated','public.ai_review_reports','delete')
  and not has_table_privilege('authenticated','public.ai_review_reports','insert')
  and not has_table_privilege('authenticated','public.ai_review_reports','update')
  and not has_table_privilege('anon','public.ai_review_reports','select')
  and not has_table_privilege('anon','public.ai_consents','select')
  and not has_table_privilege('service_role','public.ai_consents','insert')
  and not has_table_privilege('service_role','public.ai_review_usage','insert')
  and not has_table_privilege('service_role','public.ai_review_reports','insert'),
  'table grants: consent read-only, ledger closed, reports read+delete, service role has no direct table access');

-- ── direct access as a signed-in member ─────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = :'A';
select public.t_err($$insert into public.ai_consents(user_id,feature,action,copy_version,locale,scope_version,scope_options,recipient,recipient_region,platform)
  values('00000000-0000-4000-8000-0000000000a1','ai_review','granted','v1','zh-TW',1,'{"meeting_highlights": false}','OpenAI','US','web')$$,
  'permission denied','member cannot INSERT a consent row');
select public.t_err($$insert into public.ai_review_usage(id,user_id) values(gen_random_uuid(),'00000000-0000-4000-8000-0000000000a1')$$,
  'permission denied','member cannot INSERT a ledger row');
select public.t_err($$delete from public.ai_review_usage$$,'permission denied','member cannot DELETE ledger rows');
select public.t_err($$select count(*) from public.ai_review_usage$$,'permission denied','member cannot read the ledger');
select public.t_err($$select public.reserve_ai_review('00000000-0000-4000-8000-0000000000a1',gen_random_uuid(),1)$$,
  'permission denied','member cannot call reserve_ai_review');
select public.t_err($$select public.record_ai_consent('00000000-0000-4000-8000-0000000000a1','ai_review','granted','v1','zh-TW',1,'{}','OpenAI','US','web',null)$$,
  'permission denied','member cannot call record_ai_consent');
select public.t_err($$select public.finish_ai_review('00000000-0000-4000-8000-0000000000a1',gen_random_uuid(),null,'X',null,null)$$,
  'permission denied','member cannot call finish_ai_review');
reset role;

-- ── service role path: consent ──────────────────────────────────────────────
set role service_role;
select public.t_err($$insert into public.ai_review_usage(id,user_id) values(gen_random_uuid(),'00000000-0000-4000-8000-0000000000a1')$$,
  'permission denied','service role cannot write the ledger directly');
select public.t_err(format($$select public.reserve_ai_review(%L,'11111111-0000-4000-8000-000000000001',1)$$,:'A'),
  'CONSENT_REQUIRED','reserve without any consent row is refused');
select public.t_ok(q->'consent'->>'granted'='false' and q->'quota'->>'reports_remaining'='4' and q->'quota'->>'is_pro'='false'
  and q->'quota'->>'report_limit'='4' and q->'quota'->>'attempt_limit'='12' and q->'quota'->>'hourly_attempt_limit'='3'
  and (q->'quota'->>'resets_on')::date=(date_trunc('month',now() at time zone 'Asia/Taipei')+interval '1 month')::date,
  'status for a new free account: not consented, 4 remaining, resets on the 1st of next Taipei month')
  from public.ai_feature_status(:'A','ai_review',1) q;
select public.t_ok(q->'quota'->>'report_limit'='30' and q->'quota'->>'attempt_limit'='90' and q->'quota'->>'is_pro'='true',
  'pro account gets 30 reports / 90 attempts (decided in the database)')
  from public.ai_feature_status(:'B','ai_review',1) q;
select public.t_ok(q->'quota'='null'::jsonb,'meeting_import status carries no quota') from public.ai_feature_status(:'A','meeting_import',1) q;

select public.t_ok(q->>'recorded'='true' and q->'consent'->>'granted'='true','grant recorded')
  from public.record_ai_consent(:'A','ai_review','granted','2026-10-01.1','zh-TW',1,'{}','OpenAI','US','web','0.1.2') q;
select public.t_ok(q->>'recorded'='false','repeating the same grant adds no row')
  from public.record_ai_consent(:'A','ai_review','granted','2026-10-01.1','zh-TW',1,'{}','OpenAI','US','web','0.1.2') q;
select public.t_ok(public.t_n('ai_consents',:'A')=1,'exactly one consent row so far');
select public.t_ok(q->'consent'->'scope_options'->>'meeting_highlights'='false','meeting highlights default off')
  from public.ai_feature_status(:'A','ai_review',1) q;
select public.t_ok(q->'consent'->>'granted'='false' and q->'consent'->>'needs_reconsent'='true',
  'a newer scope version invalidates the old consent') from public.ai_feature_status(:'A','ai_review',2) q;
select public.t_err(format($$select public.reserve_ai_review(%L,'11111111-0000-4000-8000-000000000001',2)$$,:'A'),
  'CONSENT_REQUIRED','reserve with a newer scope version is refused');
select public.t_err(format($$select public.reserve_meeting_import_v3(%L,'22222222-0000-4000-8000-000000000001','Meeting','2026-10-01','This is a real transcript with a clear task.','{}',1)$$,:'A'),
  'CONSENT_REQUIRED','ai_review consent does not cover meeting_import');
select public.t_err(format($$select public.record_ai_consent(%L,'ai_review','granted','v1','zh-TW',1,'{}','OpenAI','US','web',null)$$,:'S'),
  'ACCOUNT_SUSPENDED','suspended account cannot record consent');
select public.t_err(format($$select public.record_ai_consent(%L,'ai_review','granted','v1','zh-TW',1,'{}','OpenAI','US','web',null)$$,:'N'),
  'ANONYMOUS_NOT_ALLOWED','anonymous account cannot record consent');
select public.t_err(format($$select public.reserve_ai_review(%L,gen_random_uuid(),1)$$,:'S'),'ACCOUNT_SUSPENDED','suspended account cannot reserve');
select public.t_err(format($$select public.reserve_ai_review(%L,gen_random_uuid(),1)$$,:'N'),'ANONYMOUS_NOT_ALLOWED','anonymous account cannot reserve');
select public.t_err(format($$select public.ai_feature_status(%L,'ai_review',1)$$,:'S'),'ACCOUNT_SUSPENDED','suspended account cannot read status');
select public.t_err(format($$select public.record_ai_consent(%L,'other','granted','v1','zh-TW',1,'{}','OpenAI','US','web',null)$$,:'A'),
  'INVALID_INPUT','unknown feature refused');

-- ── reserve / in-flight / duplicate / failure ───────────────────────────────
select public.t_ok(q->>'consent_id' is not null and q->'scope_options'->>'meeting_highlights'='false','reserve with consent succeeds')
  from public.reserve_ai_review(:'A','11111111-0000-4000-8000-000000000001',1) q;
select public.t_err(format($$select public.reserve_ai_review(%L,'11111111-0000-4000-8000-000000000002',1)$$,:'A'),
  'IN_PROGRESS','second request while one is pending is refused');
select public.t_err(format($$select public.reserve_ai_review(%L,'11111111-0000-4000-8000-000000000001',1)$$,:'B'),
  'DUPLICATE_REQUEST','request ids are single-use (even across accounts)');
select public.t_ok(q->'quota'->>'in_progress'='true' and q->'quota'->>'reports_remaining'='3' and q->'quota'->>'blocked'='IN_PROGRESS',
  'pending request holds one slot') from public.ai_feature_status(:'A','ai_review',1) q;
select public.t_ok(q->>'status'='failed','finish(failure)')
  from public.finish_ai_review(:'A','11111111-0000-4000-8000-000000000001',null,'PROVIDER_ERROR',1200,null) q;
select public.t_ok(public.t_usage('11111111-0000-4000-8000-000000000001')='failed:PROVIDER_ERROR','ledger row marked failed with the code');
select public.t_ok(q->'quota'->>'reports_used'='0' and q->'quota'->>'reports_remaining'='4' and q->'quota'->>'attempts_used'='1'
  and q->'quota'->>'in_progress'='false',
  'failed call: remaining unchanged, attempt counted') from public.ai_feature_status(:'A','ai_review',1) q;
select public.t_err(format($$select public.finish_ai_review(%L,'11111111-0000-4000-8000-000000000001',null,'X',null,null)$$,:'A'),
  'REQUEST_EXPIRED','a closed request cannot be finished twice');

-- ── success path, report constraints ────────────────────────────────────────
select public.reserve_ai_review(:'A','11111111-0000-4000-8000-000000000003',1);
select public.t_err(format($$select public.finish_ai_review(%L,'11111111-0000-4000-8000-000000000003',public.t_report(%L,public.t_cid(%L,'ai_review'),'節奏 https://evil.example/x'),null,10,20)$$,:'A',:'A',:'A'),
  'ai_review_reports_no_urls','a report that still contains a URL is not stored');
select public.t_err(format($$select public.finish_ai_review(%L,'11111111-0000-4000-8000-000000000003',public.t_report(%L,public.t_cid(%L,'ai_review'),'節奏','{"note":"寫季報"}'),null,10,20)$$,:'A',:'A',:'A'),
  'INVALID_REPORT','stats must be numbers only');
select public.t_err(format($$select public.finish_ai_review(%L,'11111111-0000-4000-8000-000000000003',public.t_report(%L,public.t_cid(%L,'ai_review'),repeat('長',901)),null,10,20)$$,:'A',:'A',:'A'),
  'ai_review_reports_rhythm_check','an over-long section is not stored');
select public.t_ok(public.t_usage('11111111-0000-4000-8000-000000000003')='pending:','rejected report leaves the row pending (caller then fails it)');
select public.t_err(format($$select public.finish_ai_review(%L,'11111111-0000-4000-8000-000000000003',public.t_report(%L,public.t_cid(%L,'ai_review')),null,10,20)$$,:'B',:'A',:'A'),
  'REQUEST_EXPIRED','another account cannot finish this request');
select public.t_ok(q->>'status'='succeeded' and q->'report'->>'period_key'='last_week' and q->'report'->>'usage_id'='11111111-0000-4000-8000-000000000003'
  and not (q->'report' ? 'user_id') and q->'report'->'stats'->>'completed_count'='3','finish(success) stores and returns the report')
  from public.finish_ai_review(:'A','11111111-0000-4000-8000-000000000003',public.t_report(:'A',public.t_cid(:'A','ai_review')),null,5000,800) q;
select public.t_ok(q->'quota'->>'reports_used'='1' and q->'quota'->>'reports_remaining'='3' and q->'quota'->>'attempts_used'='2',
  'success uses one report slot') from public.ai_feature_status(:'A','ai_review',1) q;
reset role;
select public.t_ok((select prompt_tokens=5000 and completion_tokens=800 from public.ai_review_usage where id='11111111-0000-4000-8000-000000000003')
  and (select prompt_tokens=1200 from public.ai_review_usage where id='11111111-0000-4000-8000-000000000001'),'token usage recorded on the ledger');

-- ── member reads / deletes own report; quota does not come back ─────────────
set role authenticated;
set request.jwt.claim.sub = :'B';
select public.t_ok((select count(*)=0 from public.ai_review_reports),'B cannot see A''s report');
select public.t_ok((select count(*)=0 from public.ai_consents),'B cannot see A''s consent rows');
set request.jwt.claim.sub = :'A';
select public.t_ok((select count(*)=1 from public.ai_review_reports),'A sees own report');
select public.t_ok((select count(*)=1 from public.ai_consents),'A sees own consent row');
select public.t_err($$update public.ai_review_reports set rhythm='x'$$,'permission denied','member cannot edit a report');
delete from public.ai_review_reports where usage_id='11111111-0000-4000-8000-000000000003';
select public.t_ok((select count(*)=0 from public.ai_review_reports),'A deleted own report');
set role service_role;
select public.t_ok(q->'quota'->>'reports_used'='1' and q->'quota'->>'reports_remaining'='3',
  'deleting the report does not refund quota') from public.ai_feature_status(:'A','ai_review',1) q;

-- ── hourly limit (3 attempts incl. failures) ────────────────────────────────
select public.reserve_ai_review(:'A','11111111-0000-4000-8000-000000000004',1);
select public.finish_ai_review(:'A','11111111-0000-4000-8000-000000000004',null,'TIMEOUT',null,null);
select public.t_err(format($$select public.reserve_ai_review(%L,'11111111-0000-4000-8000-000000000005',1)$$,:'A'),
  'RATE_LIMIT','4th attempt within the hour is refused');
select public.t_ok(q->'quota'->>'blocked'='RATE_LIMIT' and q->'quota'->>'hourly_retry_at' is not null,'status reports RATE_LIMIT + retry time')
  from public.ai_feature_status(:'A','ai_review',1) q;
reset role;

-- ── monthly report limit: free 4 ────────────────────────────────────────────
-- Move A's history out of the hourly window (month column untouched).
update public.ai_review_usage set created_at = created_at - interval '2 hours' where user_id=:'A';
insert into public.ai_review_usage(id,user_id,status,finished_at,created_at)
select gen_random_uuid(),:'A','succeeded',now(),now()-interval '2 hours' from generate_series(1,3);
set role service_role;
select public.t_err(format($$select public.reserve_ai_review(%L,gen_random_uuid(),1)$$,:'A'),'MONTHLY_LIMIT','free account is stopped after 4 reports');
select public.t_ok(q->'quota'->>'reports_remaining'='0' and q->'quota'->>'blocked'='MONTHLY_LIMIT','status shows 0 remaining')
  from public.ai_feature_status(:'A','ai_review',1) q;
reset role;
-- Last month's usage does not count.
update public.ai_review_usage set month = (month - interval '1 month')::date where user_id=:'A';
set role service_role;
select public.t_ok(q->'quota'->>'reports_remaining'='4' and q->'quota'->>'blocked' is null,'a new Taipei month starts from zero')
  from public.ai_feature_status(:'A','ai_review',1) q;

-- ── pro: 30 ─────────────────────────────────────────────────────────────────
select public.record_ai_consent(:'B','ai_review','granted','2026-10-01.1','en',1,'{"meeting_highlights": true}','OpenAI','US','ios','1.0.0');
select public.t_ok(q->'consent'->'scope_options'->>'meeting_highlights'='true','meeting highlights switch is stored in the consent row')
  from public.ai_feature_status(:'B','ai_review',1) q;
reset role;
insert into public.ai_review_usage(id,user_id,status,finished_at,created_at)
select gen_random_uuid(),:'B','succeeded',now(),now()-interval '2 hours' from generate_series(1,29);
set role service_role;
select public.t_ok(q->>'is_pro'='true' and q->'scope_options'->>'meeting_highlights'='true','pro account can reserve its 30th report')
  from public.reserve_ai_review(:'B','33333333-0000-4000-8000-000000000030',1) q;
select public.finish_ai_review(:'B','33333333-0000-4000-8000-000000000030',public.t_report(:'B',public.t_cid(:'B','ai_review')),null,1,1);
select public.t_err(format($$select public.reserve_ai_review(%L,gen_random_uuid(),1)$$,:'B'),'MONTHLY_LIMIT','pro account is stopped after 30 reports');
-- Switching 會議重點 off appends a new grant row; the newest one wins.
select public.t_ok(q->>'recorded'='true' and q->'consent'->'scope_options'->>'meeting_highlights'='false','toggling the switch appends a row')
  from public.record_ai_consent(:'B','ai_review','granted','2026-10-01.1','en',1,'{"meeting_highlights": false}','OpenAI','US','ios','1.0.0') q;
select public.t_ok(public.t_n('ai_consents',:'B')=2,'B has two consent rows');
reset role;

-- ── monthly attempt limit: free 12 (failures count) ─────────────────────────
insert into public.ai_review_usage(id,user_id,status,failure_code,finished_at,created_at)
select gen_random_uuid(),:'C','failed','PROVIDER_ERROR',now(),now()-interval '2 hours' from generate_series(1,12);
set role service_role;
select public.record_ai_consent(:'C','ai_review','granted','2026-10-01.1','zh-TW',1,'{}','OpenAI','US','web',null);
select public.t_err(format($$select public.reserve_ai_review(%L,gen_random_uuid(),1)$$,:'C'),'ATTEMPT_LIMIT','13th attempt of the month is refused for a free account');
select public.t_ok(q->'quota'->>'reports_remaining'='4' and q->'quota'->>'blocked'='ATTEMPT_LIMIT','attempt limit is separate from the report quota')
  from public.ai_feature_status(:'C','ai_review',1) q;

-- ── stale pending rows are treated as failed ────────────────────────────────
select public.record_ai_consent(:'X','ai_review','granted','2026-10-01.1','zh-TW',1,'{}','OpenAI','US','web',null);
select public.reserve_ai_review(:'X','44444444-0000-4000-8000-000000000001',1);
reset role;
update public.ai_review_usage set created_at = now() - interval '4 minutes' where id='44444444-0000-4000-8000-000000000001';
set role service_role;
select public.t_ok(q->'quota'->>'in_progress'='false','status ignores a pending row older than the stale window')
  from public.ai_feature_status(:'X','ai_review',1) q;
select public.t_ok(q->>'usage_id'='44444444-0000-4000-8000-000000000002','a new request is accepted after the old one went stale')
  from public.reserve_ai_review(:'X','44444444-0000-4000-8000-000000000002',1) q;
select public.t_ok(public.t_usage('44444444-0000-4000-8000-000000000001')='failed:STALE','stale row was closed as failed');
select public.t_err(format($$select public.finish_ai_review(%L,'44444444-0000-4000-8000-000000000001',public.t_report(%L,public.t_cid(%L,'ai_review')),null,1,1)$$,:'X',:'X',:'X'),
  'REQUEST_EXPIRED','a late result for a stale request is refused');
select public.finish_ai_review(:'X','44444444-0000-4000-8000-000000000002',public.t_report(:'X',public.t_cid(:'X','ai_review')),null,1,1);

-- ── withdrawal ──────────────────────────────────────────────────────────────
select public.record_ai_consent(:'W','ai_review','granted','2026-10-01.1','zh-TW',1,'{}','OpenAI','US','web',null);
select public.reserve_ai_review(:'W','55555555-0000-4000-8000-000000000001',1);
select public.finish_ai_review(:'W','55555555-0000-4000-8000-000000000001',public.t_report(:'W',public.t_cid(:'W','ai_review')),null,1,1);
reset role;
update public.ai_review_usage set created_at = created_at - interval '2 hours' where user_id=:'W';
set role service_role;
select public.reserve_ai_review(:'W','55555555-0000-4000-8000-000000000002',1);
select public.t_ok(q->>'recorded'='true' and q->>'deleted_reports'='0' and q->'consent'->>'granted'='false'
  and q->'consent'->>'last_action'='withdrawn','withdrawal recorded, reports kept')
  from public.record_ai_consent(:'W','ai_review','withdrawn','2026-10-01.1','zh-TW',1,'{}','OpenAI','US','web',null,false) q;
select public.t_ok(public.t_usage('55555555-0000-4000-8000-000000000002')='failed:CONSENT_WITHDRAWN','withdrawal fails the running request');
select public.t_err(format($$select public.finish_ai_review(%L,'55555555-0000-4000-8000-000000000002',public.t_report(%L,1),null,1,1)$$,:'W',:'W'),
  'REQUEST_EXPIRED','result arriving after a withdrawal is not saved');
select public.t_err(format($$select public.reserve_ai_review(%L,gen_random_uuid(),1)$$,:'W'),'CONSENT_REQUIRED','after withdrawal the next request needs consent again');
select public.t_ok(public.t_n('ai_review_reports',:'W')=1,'existing report still there after a plain withdrawal');
select public.t_ok(q->>'recorded'='false' and q->>'deleted_reports'='1','withdraw again with delete flag removes every report, adds no row')
  from public.record_ai_consent(:'W','ai_review','withdrawn','2026-10-01.1','zh-TW',1,'{}','OpenAI','US','web',null,true) q;
select public.t_ok(public.t_n('ai_review_reports',:'W')=0 and public.t_n('ai_review_usage',:'W')=2 and public.t_n('ai_consents',:'W')=2,
  'reports gone, ledger and consent log untouched');
select public.t_ok(q->'quota'->>'reports_used'='1','withdraw + delete does not refund quota') from public.ai_feature_status(:'W','ai_review',1) q;
reset role;
select public.t_err($$update public.ai_consents set action='granted' where action='withdrawn'$$,'AI_CONSENTS_APPEND_ONLY','consent rows cannot be updated, even by the owner');

-- ── suspended member loses direct access to own rows ────────────────────────
insert into public.ai_consents(user_id,feature,action,copy_version,locale,scope_version,scope_options,recipient,recipient_region,platform)
values(:'S','ai_review','granted','v1','zh-TW',1,'{"meeting_highlights": false}','OpenAI','US','web');
set role authenticated;
set request.jwt.claim.sub = :'S';
select public.t_ok((select count(*)=0 from public.ai_consents),'suspended member reads nothing from ai_consents');
reset role;

-- ── F12: meeting_import consent + existing reservation in one transaction ───
set role service_role;
select public.t_err(format($$select public.reserve_meeting_import_v3(%L,'66666666-0000-4000-8000-000000000001','Meeting','2026-10-01','This is a real transcript with a clear task.','{}',1)$$,:'M'),
  'CONSENT_REQUIRED','meeting import without consent is refused');
reset role;
select public.t_ok((select count(*)=0 from public.meeting_imports where user_id=:'M'),'no meeting row (and no quota) was created');
set role service_role;
select public.t_ok(q->>'recorded'='true' and q->'consent'->'scope_options'='{}'::jsonb,'meeting_import grant recorded')
  from public.record_ai_consent(:'M','meeting_import','granted','2026-10-01.1','zh-TW',1,'{"meeting_highlights": true}','OpenAI','US','web',null) q;
select public.t_ok(q->'consent'->>'granted'='false','meeting_import consent does not cover ai_review') from public.ai_feature_status(:'M','ai_review',1) q;
select public.t_ok((q->>'claimed')::boolean,'consented meeting import reserves through the unchanged v2')
  from public.reserve_meeting_import_v3(:'M','66666666-0000-4000-8000-000000000001','Meeting','2026-10-01','This is a real transcript with a clear task.','{}',1) q;
select public.record_ai_consent(:'M','meeting_import','withdrawn','2026-10-01.1','zh-TW',1,'{}','OpenAI','US','web',null);
select public.t_ok(not (q->>'claimed')::boolean,'replaying an existing meeting id still works after withdrawal (never reaches the model)')
  from public.reserve_meeting_import_v3(:'M','66666666-0000-4000-8000-000000000001','Meeting','2026-10-01','This is a real transcript with a clear task.','{}',1) q;
select public.t_err(format($$select public.reserve_meeting_import_v3(%L,'66666666-0000-4000-8000-000000000002','Meeting','2026-10-01','This is a real transcript with a clear task.','{}',1)$$,:'M'),
  'CONSENT_REQUIRED','a new meeting import after withdrawal is refused');
select public.t_ok((q->>'claimed')::boolean,'the legacy v2 entry point is unchanged (still no consent check)')
  from public.reserve_meeting_import_v2(:'M','66666666-0000-4000-8000-000000000003','Meeting','2026-10-01','This is a real transcript with a clear task.','{}') q;

-- ── site-wide daily cap ─────────────────────────────────────────────────────
reset role;
insert into public.ai_review_usage(id,user_id,status,failure_code,finished_at)
select gen_random_uuid(),:'G','failed','PROVIDER_ERROR',now() from generate_series(1,200);
update public.ai_review_usage set created_at = now() - interval '2 hours' where user_id=:'X';
set role service_role;
select public.t_err(format($$select public.reserve_ai_review(%L,gen_random_uuid(),1)$$,:'X'),'GLOBAL_DAILY_LIMIT','site-wide daily cap pauses everyone');
select public.t_ok(q->'quota'->>'blocked'='GLOBAL_DAILY_LIMIT','status reports the pause') from public.ai_feature_status(:'X','ai_review',1) q;
reset role;

-- ── account deletion cascades ───────────────────────────────────────────────
select public.t_ok(public.t_n('ai_review_reports',:'X')=1 and public.t_n('ai_review_usage',:'X')=2 and public.t_n('ai_consents',:'X')=1,'X has rows in all three tables');
delete from auth.users where id=:'X';
select public.t_ok(public.t_n('ai_review_reports',:'X')=0 and public.t_n('ai_review_usage',:'X')=0 and public.t_n('ai_consents',:'X')=0,
  'deleting the account removes reports, ledger and consent rows');
select public.t_ok(true,'AI review SQL checks finished');
