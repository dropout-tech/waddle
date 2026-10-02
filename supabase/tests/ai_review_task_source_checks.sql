-- tasks.source checks (migrations-draft/20261003030000_task_source.sql).
-- DISPOSABLE DATABASE ONLY. Expects ai_review_task_source_seed.sql to have
-- run BEFORE the draft migrations (backfill fixtures).
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
create or replace function public.t_src(p_id uuid) returns text language sql security definer as
$$ select source from public.tasks where id=p_id $$;
grant execute on function public.t_ok(boolean,text), public.t_err(text,text,text), public.t_src(uuid) to authenticated, anon, service_role;
-- Production (Supabase) grants these to authenticated by default; the plain
-- local cluster does not. RLS + the triggers are what is under test.
grant select, insert, update, delete on public.tasks to authenticated;
-- The meeting RPCs are SECURITY INVOKER run by the service role, which has
-- full table access on Supabase by default.
grant select, insert, update on public.tasks to service_role;
grant select on public.categories, public.workspaces to service_role;
grant select, update on public.calendar_shares to service_role;  -- SELECT … FOR SHARE

\set P '00000000-0000-4000-8000-0000000000a7'
\set Q '00000000-0000-4000-8000-0000000000a8'
\set QWS '10000000-0000-4000-8000-0000000000a8'
\set QCAT '20000000-0000-4000-8000-0000000000a8'

-- ── structure ───────────────────────────────────────────────────────────────
select public.t_ok((select attnotnull and pg_get_expr(d.adbin,d.adrelid)='''self''::text'
  from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid='public.tasks'::regclass and a.attname='source'),'tasks.source is NOT NULL with default self');
select public.t_err($$update public.tasks set source='imported' where id='30000000-0000-4000-8000-000000000001'$$,
  'tasks_source_check','source accepts only the three known values');
select public.t_ok(not has_function_privilege('authenticated','huddle_ops.task_source_from_import()','execute')
  and not has_function_privilege('authenticated','huddle_ops.task_source_from_assignment()','execute')
  and not has_function_privilege('service_role','huddle_ops.task_source_from_assignment()','execute')
  and not has_function_privilege('authenticated','public.tasks_source_guard()','execute'),
  'no client role can execute the source trigger functions');
select public.t_ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from pg_proc p
  where p.proname in ('task_source_from_import','task_source_from_assignment')),
  'server-side fill functions are SECURITY DEFINER with an empty search_path');

-- ── backfill ────────────────────────────────────────────────────────────────
select public.t_ok(public.t_src('30000000-0000-4000-8000-000000000003')='meeting_assignment','backfill: accepted meeting assignment → meeting_assignment');
select public.t_ok(public.t_src('30000000-0000-4000-8000-000000000002')='meeting_import','backfill: own meeting import → meeting_import (malformed map value ignored)');
select public.t_ok(public.t_src('30000000-0000-4000-8000-000000000001')='self','backfill: plain task stays self');
select public.t_ok(public.t_src('30000000-0000-4000-8000-000000000004')='self','backfill: task without a link row stays self (text fallback R2 covers it)');
select public.t_ok((select bool_and(updated_at='2026-01-01T00:00:00Z') from public.tasks where user_id=:'Q'),'backfill did not move updated_at');

-- ── clients cannot write or change the source ───────────────────────────────
set role authenticated;
set request.jwt.claim.sub = :'Q';
select public.t_err(format($$insert into public.tasks(user_id,workspace_id,category_id,title,source) values(%L,%L,%L,'spoof','meeting_import')$$,:'Q',:'QWS',:'QCAT'),
  'TASK_SOURCE_READ_ONLY','user insert with source=meeting_import is rejected');
select public.t_err(format($$insert into public.tasks(user_id,workspace_id,category_id,title,source) values(%L,%L,%L,'spoof','meeting_assignment')$$,:'Q',:'QWS',:'QCAT'),
  'TASK_SOURCE_READ_ONLY','user insert with source=meeting_assignment is rejected');
insert into public.tasks(id,user_id,workspace_id,category_id,title) values('30000000-0000-4000-8000-000000000010',:'Q',:'QWS',:'QCAT','client task');
select public.t_ok(public.t_src('30000000-0000-4000-8000-000000000010')='self','user insert without source stores self');
select public.t_err($$update public.tasks set source='self' where id='30000000-0000-4000-8000-000000000003'$$,
  'TASK_SOURCE_READ_ONLY','user cannot clear meeting_assignment back to self');
select public.t_err($$update public.tasks set source='meeting_assignment' where id='30000000-0000-4000-8000-000000000001'$$,
  'TASK_SOURCE_READ_ONLY','user cannot change own self task to another source');
select public.t_err($$update public.tasks set source='self', title='x' where id='30000000-0000-4000-8000-000000000002'$$,
  'TASK_SOURCE_READ_ONLY','user cannot change source together with other columns');
update public.tasks set title='renamed', description='我改掉了開頭' where id='30000000-0000-4000-8000-000000000003';
select public.t_ok(public.t_src('30000000-0000-4000-8000-000000000003')='meeting_assignment','editing title/description keeps the source (U5 root fix)');
insert into public.tasks(id,user_id,workspace_id,category_id,title,parent_id)
  values('30000000-0000-4000-8000-000000000011',:'Q',:'QWS',:'QCAT','override','30000000-0000-4000-8000-000000000003');
select public.t_ok(public.t_src('30000000-0000-4000-8000-000000000011')='meeting_assignment','a client-inserted occurrence override inherits its master''s source');
reset role;

-- ── server-side fill through the existing functions ─────────────────────────
insert into public.calendar_shares(user_lo,user_hi) values (least(:'P'::uuid,:'Q'::uuid),greatest(:'P'::uuid,:'Q'::uuid));
insert into public.meeting_task_assignments(id,meeting_id,source_index,sender_id,recipient_id,sender_name,title,source,meeting_title,meeting_date)
values ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-0000000000a7',1,:'P',:'Q','P','new assignment','原文二','P meeting','2026-09-01'),
       ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-0000000000a7',2,:'P',:'Q','P','rejected one','原文三','P meeting','2026-09-01');
set role service_role;
select public.respond_meeting_assignment(:'Q','50000000-0000-4000-8000-000000000001',true,:'QCAT');
select public.respond_meeting_assignment(:'Q','50000000-0000-4000-8000-000000000002',false,null);
reset role;
select public.t_ok((select public.t_src(task_id)='meeting_assignment' from public.meeting_task_assignments where id='50000000-0000-4000-8000-000000000001'),
  'respond_meeting_assignment (accept) creates a meeting_assignment task');
select public.t_ok((select task_id is null from public.meeting_task_assignments where id='50000000-0000-4000-8000-000000000002'),
  'rejecting creates no task');
-- Own import: import_meeting_tasks for a new index on Q's meeting (index 1
-- is the seeded malformed map entry, so the new task is index 2).
update public.meeting_imports
   set result = jsonb_set(result,'{tasks}',(result->'tasks')||'[{"title":"t1","owner":"","dueDate":"","source":"一段"},{"title":"t2","owner":"","dueDate":"","source":"另一段"}]'::jsonb)
 where id='40000000-0000-4000-8000-0000000000a8';
set role service_role;
select public.import_meeting_tasks(:'Q','40000000-0000-4000-8000-0000000000a8',:'QCAT','[{"index":2,"title":"t2","owner":""}]');
reset role;
select public.t_ok((select public.t_src((imported_tasks->>'2')::uuid)='meeting_import' from public.meeting_imports where id='40000000-0000-4000-8000-0000000000a8'),
  'import_meeting_tasks creates a meeting_import task');
select public.t_ok(public.t_src('30000000-0000-4000-8000-000000000010')='self' and public.t_src('30000000-0000-4000-8000-000000000001')='self',
  'server-side fill touched only the linked tasks');
-- The link row disappears (sender deletes the account): the source stays.
delete from auth.users where id=:'P';
select public.t_ok(public.t_src('30000000-0000-4000-8000-000000000003')='meeting_assignment'
  and (select count(*)=0 from public.meeting_task_assignments where recipient_id=:'Q'),
  'after the sender deletes the account the task keeps meeting_assignment');
select public.t_ok(true,'task source SQL checks finished');
