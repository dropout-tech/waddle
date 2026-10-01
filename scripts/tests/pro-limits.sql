-- Pro gating + free usage caps (20261001200000_pro_limits.sql).
-- DISPOSABLE DATABASE ONLY. Run with: bash scripts/tests/pro-limits.sh
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
-- Reserve n AI meeting summaries for a user (run as service_role like the Edge Function).
create or replace function public.t_reserve(p_user uuid, n integer) returns void language plpgsql as $$
begin
  for i in 1..n loop
    perform public.reserve_meeting_import(p_user, gen_random_uuid(), 'Meeting', current_date, 'This transcript is long enough to be accepted.');
  end loop;
end $$;
-- A SECURITY DEFINER flow that creates a task for the caller (like accepting an assignment).
create or replace function public.t_definer_task(p_ws uuid, p_cat uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tasks(user_id,workspace_id,category_id,title) values (auth.uid(), p_ws, p_cat, 'via definer');
end $$;
grant execute on function public.t_ok(boolean,text), public.t_err(text,text,text), public.t_definer_task(uuid,uuid) to authenticated, service_role;
grant execute on function public.t_reserve(uuid,integer) to service_role;
-- Supabase grants table privileges to API roles by default; the bare cluster does not.
grant select, insert, update, delete on public.tasks, public.notebook_notes, public.workspaces, public.categories to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant all on public.tasks to service_role;

\set F  '00000000-0000-4000-8000-0000000000f1'
\set G  '00000000-0000-4000-8000-0000000000f2'
\set H  '00000000-0000-4000-8000-0000000000f3'
\set M1 '00000000-0000-4000-8000-0000000000f4'
\set Q  '00000000-0000-4000-8000-0000000000f5'
\set AN '00000000-0000-4000-8000-0000000000f6'
\set P  '00000000-0000-4000-8000-0000000000a9'
\set S  '00000000-0000-4000-8000-0000000000c0'
\set N1 '00000000-0000-4000-8000-0000000000e1'
\set N2 '00000000-0000-4000-8000-0000000000e2'
\set M2 '00000000-0000-4000-8000-0000000000e3'
\set WSF  '10000000-0000-4000-8000-0000000000f1'
\set CATF '20000000-0000-4000-8000-0000000000f1'
\set WSN  '10000000-0000-4000-8000-0000000000e1'
\set CATN '20000000-0000-4000-8000-0000000000e1'
\set WSP  '10000000-0000-4000-8000-0000000000a9'
\set CATP '20000000-0000-4000-8000-0000000000a9'

insert into auth.users(id,email,created_at) values
 (:'F','free@example.invalid',now()-interval '30 days'),
 (:'G','google@example.invalid',now()-interval '30 days'),
 (:'H','late-link@example.invalid',now()-interval '30 days'),
 (:'M1','meetings@example.invalid',now()-interval '30 days'),
 (:'Q','trial@example.invalid',now()-interval '2 days'),
 (:'P','paid@example.invalid',now()-interval '30 days');
insert into auth.users(id,email,is_anonymous) values (:'AN',null,true);
insert into public.billing_entitlements(user_id,entitlement,expires_at,observed_at_ms) values (:'P','pro',now()+interval '30 days',1);
insert into huddle_ops.grants(user_id,days,source,source_key,starts_at,expires_at,reason)
  values (:'Q',14,'trial','trial:'||:'Q',now(),now()+interval '14 days','trial');
insert into public.workspaces(id,user_id,name,color,icon) values (:'WSF',:'F','W','#aaa','x'),(:'WSP',:'P','W','#aaa','x');
insert into public.categories(id,user_id,workspace_id,name) values (:'CATF',:'F',:'WSF','C'),(:'CATP',:'P',:'WSP','C');

-- ════ Migration itself ═════════════════════════════════════════════════════
select public.t_ok((select not limits_enforced and limits_enforced_at is null from huddle_ops.settings),'switch defaults to off; migration does not enable it');
select public.t_ok(exists(select 1 from huddle_ops.feature_grandfathers where user_id=:'S' and feature='google_calendar'),'migration backfills members already linked to Google Calendar');
select public.t_ok(position('plan_limits' in pg_get_functiondef('public.reserve_meeting_import(uuid,uuid,text,date,text)'::regprocedure))>0
  and position('access_allowed(p_user)' in pg_get_functiondef('public.reserve_meeting_import(uuid,uuid,text,date,text)'::regprocedure))>0,
  'reserve_meeting_import reads plan_limits and keeps the later suspension hardening');
select public.t_ok(position('plan_allows(v_uid)' in pg_get_functiondef('public.create_organization(text)'::regprocedure))>0
  and position('has_pro' in pg_get_functiondef('public.create_organization(text)'::regprocedure))=0
  and position('plan_allows(v_uid)' in pg_get_functiondef('public.get_my_organizations()'::regprocedure))>0,
  'organization RPCs use plan_allows');

-- ════ Switch OFF: everything exactly as today ══════════════════════════════
select public.t_ok(huddle_ops.plan_limits(:'F')='{"active_tasks":null,"notes":null,"image_bytes":null,"meeting_imports":20}'::jsonb,'off: plan_limits has no caps and 20 meetings');
set role authenticated;
set request.jwt.claim.sub = :'F';
insert into public.tasks(user_id,workspace_id,category_id,title) select :'F',:'WSF',:'CATF','t'||g from generate_series(1,160) g;
insert into public.notebook_notes(user_id,title) select :'F','n'||g from generate_series(1,110) g;
reset role;
select public.t_ok((select count(*)=160 from public.tasks where user_id=:'F'),'off: free member creates 160 active tasks');
select public.t_ok((select count(*)=110 from public.notebook_notes where user_id=:'F'),'off: free member creates 110 notes');
insert into storage.objects(bucket_id,name,owner,metadata) select 'notebook-images',:'F'||'/old'||g||'.png',:'F','{"size":5242880}' from generate_series(1,60) g;
set role authenticated;
set request.jwt.claim.sub = :'F';
insert into storage.objects(bucket_id,name,owner,metadata) values ('notebook-images',:'F'||'/new.png',:'F','{"size":100}');
select public.t_ok((select public.create_organization('Free org') is not null),'off: free member can create an organization');
select public.t_ok((public.get_my_organizations()->>'can_create')::boolean,'off: get_my_organizations can_create=true for free member');
select public.my_plan_usage() as u \gset
select public.t_ok((:'u'::jsonb->>'enforced')::boolean=false and (:'u'::jsonb->'limits'->>'meeting_imports')::int=20
  and (:'u'::jsonb->'used'->>'active_tasks')::int=160 and (:'u'::jsonb->'used'->>'notes')::int=110
  and (:'u'::jsonb->'used'->>'image_bytes')::bigint=60*5242880+100,'off: my_plan_usage reports usage, enforced=false, 20 meetings');
reset role;
select public.t_ok((select count(*)=61 from storage.objects where name like :'F'||'/%'),'off: image upload above 200MB still allowed');
set role service_role;
select public.t_reserve(:'M1',20);
select public.t_err(format('select public.t_reserve(%L,1)',:'M1'),'MONTHLY_LIMIT','off: 21st AI meeting summary of the month is refused (20, unchanged)');
select public.t_ok(public.meeting_import_limit(:'M1')=20,'off: Edge Function list limit is 20');
select public.t_ok(public.google_calendar_connect_allowed(:'F'),'off: free member may start Google Calendar linking');
reset role;
insert into public.google_calendar_connections(user_id,refresh_cipher,scope) values (:'G','sealed','calendar.readonly');
select public.t_ok(exists(select 1 from huddle_ops.feature_grandfathers where user_id=:'G' and feature='google_calendar'),'off: a new Google Calendar link is grandfathered by the trigger');
-- H links while the trigger is bypassed: only enable_pro_limits' own backfill can catch it.
alter table public.google_calendar_connections disable trigger google_calendar_grandfather;
insert into public.google_calendar_connections(user_id,refresh_cipher,scope) values (:'H','sealed','calendar.readonly');
alter table public.google_calendar_connections enable trigger google_calendar_grandfather;
select public.t_ok(not exists(select 1 from huddle_ops.feature_grandfathers where user_id=:'H'),'setup: H linked without a grandfather row');

-- ════ Privileges ═══════════════════════════════════════════════════════════
select public.t_ok(not has_function_privilege('authenticated','huddle_ops.enable_pro_limits(integer)','EXECUTE')
  and not has_function_privilege('authenticated','huddle_ops.disable_pro_limits()','EXECUTE')
  and not has_function_privilege('anon','huddle_ops.enable_pro_limits(integer)','EXECUTE'),'clients cannot flip the switch');
select public.t_ok(has_function_privilege('service_role','huddle_ops.enable_pro_limits(integer)','EXECUTE')
  and has_function_privilege('service_role','huddle_ops.disable_pro_limits()','EXECUTE'),'service_role can flip the switch');
select public.t_ok(not has_function_privilege('authenticated','huddle_ops.plan_limits(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','huddle_ops.plan_allows(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','huddle_ops.limits_enforced()','EXECUTE')
  and not has_function_privilege('authenticated','huddle_ops.active_task_count(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','huddle_ops.image_bytes_used(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','huddle_ops.pro_until(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','huddle_ops.days_to_reach(uuid,timestamptz)','EXECUTE')
  and not has_function_privilege('anon','huddle_ops.is_own_recurring_parent(uuid)','EXECUTE'),'clients cannot call the plan helpers for arbitrary users');
select public.t_ok(not has_function_privilege('authenticated','public.meeting_import_limit(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.google_calendar_connect_allowed(uuid)','EXECUTE')
  and has_function_privilege('service_role','public.meeting_import_limit(uuid)','EXECUTE')
  and has_function_privilege('service_role','public.google_calendar_connect_allowed(uuid)','EXECUTE'),'Edge Function helpers are service_role only');
select public.t_ok(has_function_privilege('authenticated','public.my_plan_usage()','EXECUTE')
  and not has_function_privilege('anon','public.my_plan_usage()','EXECUTE'),'my_plan_usage: authenticated yes, anon no');
select public.t_ok(not has_table_privilege('authenticated','huddle_ops.feature_grandfathers','SELECT')
  and not has_table_privilege('authenticated','huddle_ops.feature_grandfathers','INSERT'),'clients cannot read or write grandfather rows');
select public.t_ok((select bool_and(p.proconfig @> array['search_path=""']) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prosecdef and p.proname in ('limits_enforced','plan_allows','plan_limits','active_task_count','note_count','image_bytes_used',
    'check_insert_quota','image_upload_allowed','google_calendar_grandfather','enable_pro_limits','disable_pro_limits',
    'meeting_import_limit','google_calendar_connect_allowed','my_plan_usage',
    'is_own_recurring_parent','pro_until','days_to_reach','grant_early_pro')),'every new SECURITY DEFINER function pins search_path to empty');
set role authenticated;
set request.jwt.claim.sub = :'F';
select public.t_err('select huddle_ops.enable_pro_limits()','permission denied','authenticated call to enable_pro_limits is refused');
reset role;

-- ════ Early Pro (grant_early_pro) — run in a transaction, then rolled back ═
\set SU '00000000-0000-4000-8000-0000000000f7'
select public.t_ok(not has_function_privilege('authenticated','huddle_ops.grant_early_pro(timestamptz)','EXECUTE')
  and not has_function_privilege('anon','huddle_ops.grant_early_pro(timestamptz)','EXECUTE')
  and has_function_privilege('service_role','huddle_ops.grant_early_pro(timestamptz)','EXECUTE'),'grant_early_pro: service_role only');
select public.t_ok((select position('grant_early_pro' in string_agg(pg_get_functiondef(p.oid),''))=0 from pg_proc p
  where p.proname in ('reserve_meeting_import','create_organization','get_my_organizations')),'grant_early_pro is not wired into any client RPC');
begin;
insert into auth.users(id,email,created_at) values (:'SU','suspended@example.invalid',now()-interval '30 days');
insert into huddle_ops.members(user_id,alias,suspended) values (:'SU','停權測試',true);
select huddle_ops.pro_until(:'P') as p_until_before \gset
set role service_role;
select public.t_err('select huddle_ops.grant_early_pro(now()-interval ''1 day'')','INVALID_EARLY_PRO_UNTIL','grant_early_pro refuses a date in the past');
select huddle_ops.grant_early_pro(now()+interval '10 days') as e1 \gset
reset role;
select public.t_ok(:'e1'::int=5,'grant_early_pro: gives the 5 members whose Pro ends earlier (F,G,H,M1,S)');
select public.t_ok((select bool_and(huddle_ops.pro_until(u) >= now()+interval '10 days' and huddle_ops.pro_until(u) < now()+interval '11 days')
  from unnest(array[:'F',:'G',:'H',:'M1',:'S']::uuid[]) u),'grant_early_pro: their Pro now lasts until the date (whole days, rounded up)');
select public.t_ok((select bool_and(g.source='manual' and g.days=10 and g.source_key like 'early-pro:'||g.user_id||':%') from huddle_ops.grants g
  where g.source_key like 'early-pro:%'),'grant_early_pro: manual grants with a per-member source key');
select public.t_ok(not exists(select 1 from huddle_ops.grants where source_key like 'early-pro:%' and user_id in (:'P',:'Q',:'AN',:'SU')),
  'grant_early_pro: paid (30 days), trial (14 days), anonymous and suspended members get nothing');
select public.t_ok(huddle_ops.pro_until(:'P')=:'p_until_before'::timestamptz,'grant_early_pro: paid member is not shortened');
set role service_role;
select huddle_ops.grant_early_pro(now()+interval '10 days') as e2 \gset
reset role;
select public.t_ok(:'e2'::int=0 and (select count(*)=5 from huddle_ops.grants where source_key like 'early-pro:%'),'grant_early_pro is idempotent (re-run gives nothing)');
set role service_role;
select huddle_ops.grant_early_pro(now()+interval '20 days') as e3 \gset
reset role;
select public.t_ok(:'e3'::int=6 and huddle_ops.pro_until(:'P')=:'p_until_before'::timestamptz
  and (select count(*)=2 from huddle_ops.grants where user_id=:'F' and source_key like 'early-pro:%')
  and huddle_ops.pro_until(:'F') >= now()+interval '20 days','grant_early_pro: a later date extends (F,G,H,M1,S + trial Q), paid member still untouched');
-- Switch on 2 days later in effect: early Pro (20 days) is shorter than the 60-day promise → topped up.
set role service_role;
select huddle_ops.enable_pro_limits() as e4 \gset
reset role;
select public.t_ok((select bool_and(huddle_ops.pro_until(au.id) >= now()+interval '60 days') from auth.users au
  where au.created_at < now() and not coalesce(au.is_anonymous,false)),'enable after early Pro: every old member has Pro for at least 60 days');
select public.t_ok((select days=40 from huddle_ops.grants where source_key='pro-limits-launch-gift:'||:'F')
  and huddle_ops.pro_until(:'F')=now()+interval '60 days','enable after early Pro: F (20 days early Pro) is topped up by 40 days, to exactly 60');
rollback;
select public.t_ok(not exists(select 1 from huddle_ops.grants where source_key like 'early-pro:%') and (select not limits_enforced from huddle_ops.settings),
  'early Pro block rolled back (switch off, no grants)');

-- ════ Turning the switch ON ════════════════════════════════════════════════
set role service_role;
select huddle_ops.enable_pro_limits() as r \gset
reset role;
select public.t_ok((:'r'::jsonb->>'already_enforced')::boolean=false and (:'r'::jsonb->>'gifted')::int=7,'enable: tops up the 7 old members below 60 days (F,G,H,M1,S + paid P, trial Q)');
select public.t_ok((select limits_enforced and limits_enforced_at is not null from huddle_ops.settings),'enable: switch is on with a timestamp');
select public.t_ok(exists(select 1 from huddle_ops.feature_grandfathers where user_id=:'H'),'enable: backfills grandfather rows for current links');
select public.t_ok((select count(*)=5 from huddle_ops.grants where source_key like 'pro-limits-launch-gift:%' and source='manual' and days=60),'enable: free members get 60-day manual grants with idempotent source keys');
select public.t_ok(not exists(select 1 from huddle_ops.grants where source_key='pro-limits-launch-gift:'||:'AN'),'enable: anonymous users get no gift');
select limits_enforced_at as first_at from huddle_ops.settings \gset
select public.t_ok((select bool_and(huddle_ops.pro_until(u) >= :'first_at'::timestamptz+interval '60 days'
                                 and huddle_ops.pro_until(u) <  :'first_at'::timestamptz+interval '61 days')
  from unnest(array[:'P',:'Q']::uuid[]) u)
  and (select max(days) between 30 and 31 from huddle_ops.grants where source_key='pro-limits-launch-gift:'||:'P'),
  'enable: paid P (30 days left) and trial Q (14 days left) are topped up to 60 days, not stacked');
set role service_role;
select huddle_ops.enable_pro_limits() as r2 \gset
reset role;
select public.t_ok((:'r2'::jsonb->>'already_enforced')::boolean and (select count(*)=7 from huddle_ops.grants where source_key like 'pro-limits-launch-gift:%')
  and (select limits_enforced_at=:'first_at'::timestamptz from huddle_ops.settings),'enable is idempotent (no extra gifts, timestamp kept)');

-- Members registered after the switch (no gift).
insert into auth.users(id,email) values (:'N1','new1@example.invalid'),(:'N2','new2@example.invalid'),(:'M2','new3@example.invalid');
insert into public.workspaces(id,user_id,name,color,icon) values (:'WSN',:'N1','W','#aaa','x');
insert into public.categories(id,user_id,workspace_id,name) values (:'CATN',:'N1',:'WSN','C');
select public.t_ok(not huddle_ops.has_pro(:'N1'),'new member after the switch is free');
select public.t_ok(huddle_ops.plan_limits(:'N1')='{"active_tasks":150,"notes":100,"image_bytes":209715200,"meeting_imports":5}'::jsonb,'on: free plan_limits 150/100/200MB/5');
select public.t_ok(huddle_ops.plan_limits(:'P')='{"active_tasks":null,"notes":null,"image_bytes":21474836480,"meeting_imports":20}'::jsonb,'on: Pro plan_limits unlimited/unlimited/20GB/20');

-- ── Tasks ──
\set PREC '30000000-0000-4000-8000-0000000000a9'
insert into public.tasks(id,user_id,workspace_id,category_id,title,is_recurring) values (:'PREC',:'P',:'WSP',:'CATP','P recurring',true);
select :'PREC' as prec \gset
set role authenticated;
set request.jwt.claim.sub = :'N1';
select public.t_err(format($$insert into public.tasks(user_id,workspace_id,category_id,title) select %L,%L,%L,'b'||g from generate_series(1,151) g$$,:'N1',:'WSN',:'CATN'),
  'TASK_LIMIT','on: one 151-row insert is refused as a whole');
insert into public.tasks(user_id,workspace_id,category_id,title) select :'N1',:'WSN',:'CATN','t'||g from generate_series(1,150) g;
select public.t_ok((select count(*)=150 from public.tasks where user_id=:'N1'),'on: free member creates 150 active tasks');
select public.t_err(format($$insert into public.tasks(user_id,workspace_id,category_id,title) values (%L,%L,%L,'151st')$$,:'N1',:'WSN',:'CATN'),
  'TASK_LIMIT','on: free 151st active task raises TASK_LIMIT');
insert into public.tasks(user_id,workspace_id,category_id,title,is_completed,completed_at) values (:'N1',:'WSN',:'CATN','done',true,now());
insert into public.tasks(user_id,workspace_id,category_id,title,is_archived) values (:'N1',:'WSN',:'CATN','archived',true);
select public.t_ok(true,'on: completed / archived task rows are not capped');
select id as master from public.tasks where user_id=:'N1' and title='t1' \gset
select id as plain from public.tasks where user_id=:'N1' and title='t3' \gset
select public.t_err(format($$insert into public.tasks(user_id,workspace_id,category_id,title,parent_id) values (%L,%L,%L,'fake override',%L)$$,:'N1',:'WSN',:'CATN',:'plain'),
  'TASK_LIMIT','on: parent_id pointing at a NON-recurring task does not bypass the cap');
select public.t_err(format($$insert into public.tasks(user_id,workspace_id,category_id,title,parent_id) values (%L,%L,%L,'foreign override',%L)$$,:'N1',:'WSN',:'CATN',:'prec'),
  'TASK_LIMIT','on: parent_id pointing at SOMEONE ELSE''s recurring task does not bypass the cap');
update public.tasks set is_recurring=true where id=:'master';
insert into public.tasks(user_id,workspace_id,category_id,title,parent_id,show_in_task_list) values (:'N1',:'WSN',:'CATN','only this',:'master',false);
select public.t_ok(true,'on: recurring "only this" override (parent_id → own recurring task) is not blocked');
insert into public.tasks(id,user_id,workspace_id,category_id,title) values (:'master',:'N1',:'WSN',:'CATN','edited via upsert')
  on conflict (id) do update set title=excluded.title;
select public.t_ok((select title='edited via upsert' from public.tasks where id=:'master'),'on: upsert of an existing task at the cap is an edit, not blocked');
update public.tasks set title='edited' where id=:'master';
select public.t_ok((select title='edited' from public.tasks where id=:'master'),'on: editing over the cap works');
select public.t_definer_task(:'WSN',:'CATN');
select public.t_ok(true,'on: SECURITY DEFINER flow can still create a task at the cap');
update public.tasks set is_completed=true where id=(select id from public.tasks where user_id=:'N1' and title='t2');
update public.tasks set is_completed=true where id=(select id from public.tasks where user_id=:'N1' and title='via definer');
insert into public.tasks(user_id,workspace_id,category_id,title) values (:'N1',:'WSN',:'CATN','after completing one');
select public.t_ok(true,'on: completing a task frees a slot; a new task can be created');
select public.t_err(format($$insert into public.tasks(user_id,workspace_id,category_id,title) values (%L,%L,%L,'again')$$,:'N1',:'WSN',:'CATN'),
  'TASK_LIMIT','on: and the cap applies again at 150');
update public.tasks set is_completed=true where id=(select id from public.tasks where user_id=:'N1' and title='t4');
insert into public.tasks(user_id,workspace_id,category_id,title,parent_id) values (:'N1',:'WSN',:'CATN','non-override child',:'plain');
select public.t_err(format($$insert into public.tasks(user_id,workspace_id,category_id,title) values (%L,%L,%L,'again2')$$,:'N1',:'WSN',:'CATN'),
  'TASK_LIMIT','on: a parent_id row that is not a recurring override counts toward the cap');
select public.my_plan_usage() as un \gset
reset role;
delete from public.tasks where id=:'PREC';
set role service_role;
insert into public.tasks(user_id,workspace_id,category_id,title) values (:'N1',:'WSN',:'CATN','meeting import (service role)');
select public.t_ok(true,'on: service-role writes (meeting import) are not capped');
reset role;
select public.t_ok((:'un'::jsonb->>'enforced')::boolean and not (:'un'::jsonb->>'pro')::boolean
  and (:'un'::jsonb->'limits'->>'active_tasks')::int=150 and (:'un'::jsonb->'used'->>'active_tasks')::int=150
  and (:'un'::jsonb->'used') ?& array['active_tasks','notes','image_bytes','meeting_imports_this_month']
  and (:'un'::jsonb->'limits') ?& array['active_tasks','notes','image_bytes','meeting_imports']
  and (:'un'::jsonb->'grandfathered'->>'google_calendar')::boolean=false,'on: my_plan_usage contract shape and values for a free member');

-- Old member whose gift lapsed, sitting at 160 active tasks created while off.
update huddle_ops.grants set revoked_at=now(), revoked_reason='test lapse' where source_key in ('pro-limits-launch-gift:'||:'F','pro-limits-launch-gift:'||:'H');
set role authenticated;
set request.jwt.claim.sub = :'F';
select public.t_err(format($$insert into public.tasks(user_id,workspace_id,category_id,title) values (%L,%L,%L,'x')$$,:'F',:'WSF',:'CATF'),
  'TASK_LIMIT','on: member over the cap (160) cannot add');
update public.tasks set title='still editable' where id=(select id from public.tasks where user_id=:'F' limit 1);
delete from public.tasks where id=(select id from public.tasks where user_id=:'F' and title='t160');
select public.t_ok((select count(*)=159 from public.tasks where user_id=:'F'),'on: over-cap member can still edit and delete; nothing hidden');
select public.t_err(format($$insert into public.notebook_notes(user_id,title) values (%L,'x')$$,:'F'),'NOTE_LIMIT','on: member over the note cap (110) cannot add a note');

-- Pro member: unlimited tasks / notes.
set request.jwt.claim.sub = :'P';
insert into public.tasks(user_id,workspace_id,category_id,title) select :'P',:'WSP',:'CATP','t'||g from generate_series(1,200) g;
insert into public.notebook_notes(user_id,title) select :'P','n'||g from generate_series(1,120) g;
select public.t_ok((select count(*)=200 from public.tasks where user_id=:'P'),'on: Pro member creates 200 active tasks and 120 notes');

-- ── Notes ──
set request.jwt.claim.sub = :'N1';
insert into public.notebook_notes(user_id,title) select :'N1','n'||g from generate_series(1,100) g;
select public.t_err(format($$insert into public.notebook_notes(user_id,title) values (%L,'101st')$$,:'N1'),'NOTE_LIMIT','on: free 101st note raises NOTE_LIMIT');
insert into public.notebook_notes(user_id,title,is_archived) values (:'N1','archived',true);
select id as note1 from public.notebook_notes where user_id=:'N1' and title='n1' \gset
insert into public.notebook_notes(id,user_id,title,sort_order) values (:'note1',:'N1','n1',990)
  on conflict (id) do update set sort_order=excluded.sort_order;
select public.t_ok((select sort_order=990 from public.notebook_notes where id=:'note1'),'on: notebook reorder (upsert) at the cap still works');
update public.notebook_notes set is_archived=true where id=:'note1';
insert into public.notebook_notes(user_id,title) values (:'N1','after archiving one');
select public.t_ok(true,'on: archiving a note frees a slot');
reset role;

-- ── Images ──
insert into storage.objects(bucket_id,name,owner,metadata) select 'notebook-images',:'N1'||'/s'||g||'.png',:'N1','{"size":5242880}' from generate_series(1,40) g;
insert into storage.objects(bucket_id,name,owner,metadata) select 'notebook-images',:'N2'||'/s'||g||'.png',:'N2','{"size":5216665}' from generate_series(1,40) g;
insert into storage.objects(bucket_id,name,owner,metadata) values ('notebook-images',:'P'||'/big.png',:'P','{"size":314572800}');
-- Stand-in for another bucket's own permissive policy (avatars, …).
create policy t_other_bucket on storage.objects for insert to authenticated with check (bucket_id='other-bucket');
set role authenticated;
set request.jwt.claim.sub = :'N1';
select public.t_err(format($$insert into storage.objects(bucket_id,name,owner,metadata) values ('notebook-images',%L,%L,'{"size":10}')$$,:'N1'||'/over.png',:'N1'),
  'row-level security','on: free member with 200MB stored cannot upload another image');
insert into storage.objects(bucket_id,name,owner,metadata) values ('other-bucket',:'N1'||'/x.png',:'N1','{"size":10}');
select public.t_ok(true,'on: other buckets are untouched by the image cap');
reset role;
delete from storage.objects where name=:'N1'||'/s1.png';
set role authenticated;
set request.jwt.claim.sub = :'N1';
insert into storage.objects(bucket_id,name,owner,metadata) values ('notebook-images',:'N1'||'/after-delete.png',:'N1','{"size":10}');
select public.t_ok(true,'on: deleting an image frees room for an upload');
set request.jwt.claim.sub = :'N2';
insert into storage.objects(bucket_id,name,owner,metadata) values ('notebook-images',:'N2'||'/under.png',:'N2','{"size":10}');
select public.t_ok(true,'on: free member just under 200MB can upload');
set request.jwt.claim.sub = :'P';
insert into storage.objects(bucket_id,name,owner,metadata) values ('notebook-images',:'P'||'/pro.png',:'P','{"size":10}');
select public.t_ok(true,'on: Pro member with 300MB can upload');
reset role;
update storage.objects set metadata='{"size":21474836480}' where name=:'P'||'/big.png';
set role authenticated;
set request.jwt.claim.sub = :'P';
select public.t_err(format($$insert into storage.objects(bucket_id,name,owner,metadata) values ('notebook-images',%L,%L,'{"size":10}')$$,:'P'||'/over.png',:'P'),
  'row-level security','on: Pro member at 20GB cannot upload');
reset role;

-- ── AI meeting summaries ──
set role service_role;
select public.t_ok(public.meeting_import_limit(:'M2')=5 and public.meeting_import_limit(:'P')=20,'on: Edge Function list limit is 5 (free) / 20 (Pro)');
select public.t_reserve(:'M2',5);
select public.t_err(format('select public.t_reserve(%L,1)',:'M2'),'MONTHLY_LIMIT','on: free 6th AI meeting summary is refused');
select public.t_reserve(:'P',20);
select public.t_err(format('select public.t_reserve(%L,1)',:'P'),'MONTHLY_LIMIT','on: Pro 21st AI meeting summary is refused');
reset role;
set role authenticated;
set request.jwt.claim.sub = :'M2';
select public.t_ok((public.my_plan_usage()->'used'->>'meeting_imports_this_month')::int=5,'on: my_plan_usage counts this month''s meeting summaries');

-- ── Organizations ──
set request.jwt.claim.sub = :'N1';
select public.t_err($$select public.create_organization('N1 org')$$,'PRO_REQUIRED','on: free member cannot create an organization');
select public.t_ok(not (public.get_my_organizations()->>'can_create')::boolean,'on: can_create=false for free member');
set request.jwt.claim.sub = :'P';
select public.t_ok((select public.create_organization('Pro org') is not null) and (public.get_my_organizations()->>'can_create')::boolean,'on: Pro member can create an organization');

-- ── Google Calendar ──
set request.jwt.claim.sub = :'H';
select public.t_ok((public.my_plan_usage()->'grandfathered'->>'google_calendar')::boolean and not (public.my_plan_usage()->>'pro')::boolean,'on: my_plan_usage shows grandfathered link for lapsed member H');
reset role;
set role service_role;
select public.t_ok(not public.google_calendar_connect_allowed(:'N1'),'on: free member without a grandfather row cannot start linking');
select public.t_ok(public.google_calendar_connect_allowed(:'H'),'on: grandfathered member (gift lapsed) may still (re)link');
select public.t_ok(public.google_calendar_connect_allowed(:'P'),'on: Pro member may link');
reset role;
insert into public.google_calendar_connections(user_id,refresh_cipher,scope) values (:'P','sealed','calendar.readonly');
select public.t_ok(not exists(select 1 from huddle_ops.feature_grandfathers where user_id=:'P'),'on: links made while on are not grandfathered');

-- ════ Turning the switch OFF (rollback) ════════════════════════════════════
set role service_role;
select huddle_ops.disable_pro_limits();
reset role;
select public.t_ok((select not limits_enforced from huddle_ops.settings),'disable: switch is off');
select public.t_ok((select count(*)=7 from huddle_ops.grants where source_key like 'pro-limits-launch-gift:%'),'disable: gifted days are not taken back');
set role authenticated;
set request.jwt.claim.sub = :'N1';
insert into public.tasks(user_id,workspace_id,category_id,title) select :'N1',:'WSN',:'CATN','off again '||g from generate_series(1,5) g;
insert into public.notebook_notes(user_id,title) values (:'N1','off again');
insert into storage.objects(bucket_id,name,owner,metadata) values ('notebook-images',:'N1'||'/off-again.png',:'N1','{"size":10}');
select public.t_ok((select public.create_organization('N1 org') is not null),'disable: free member can add tasks, notes, images and organizations again');
reset role;
set role service_role;
select public.t_ok(public.meeting_import_limit(:'M2')=20 and public.google_calendar_connect_allowed(:'N1'),'disable: meetings back to 20 and Google Calendar open');
select public.t_reserve(:'M2',15);
select public.t_err(format('select public.t_reserve(%L,1)',:'M2'),'MONTHLY_LIMIT','disable: monthly limit is 20 again');
-- Re-enable: members who already had the gift never get a second one.
select huddle_ops.enable_pro_limits() as r3 \gset
reset role;
select public.t_ok((select count(*)=1 from huddle_ops.grants where source_key='pro-limits-launch-gift:'||:'F')
  and (select max(c)=1 from (select count(*) c from huddle_ops.grants where source_key like 'pro-limits-launch-gift:%' group by user_id) x),
  're-enable: at most one launch gift per member, ever');
