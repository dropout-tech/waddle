-- Task assignment + organization RLS / RPC checks.
--
-- DISPOSABLE DATABASE ONLY (inserts fake auth.users rows). Run with:
--   bash scripts/tests/task-assignment.sh
-- which boots a throwaway local cluster, applies EVERY migration in order
-- (including 20260927120000_task_assignments_orgs.sql) and then runs this
-- file. Any failed expectation aborts with "FAILED: ...".
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
grant execute on function public.t_ok(boolean,text), public.t_err(text,text,text) to authenticated;

-- Supabase grants table privileges to authenticated by default; the bare
-- cluster does not, so emulate it for the tables under test.
grant select, insert, update, delete on public.tasks, public.workspaces, public.categories, public.calendar_shares to authenticated;

-- A = Pro assigner / org owner, B = A's calendar-share peer, C = stranger,
-- D = org member (no calendar share with A), E = not Pro.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000000a1','a@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b1','b@example.invalid'),
 ('00000000-0000-4000-8000-0000000000c1','c@example.invalid'),
 ('00000000-0000-4000-8000-0000000000d1','d@example.invalid'),
 ('00000000-0000-4000-8000-0000000000e1','e@example.invalid');
insert into public.calendar_shares(user_lo,user_hi) values
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b1');
insert into public.billing_entitlements(user_id,entitlement,expires_at,observed_at_ms) values
 ('00000000-0000-4000-8000-0000000000a1','pro',now()+interval '30 days',1),
 ('00000000-0000-4000-8000-0000000000e1','pro',now()-interval '1 day',1);   -- expired
insert into public.workspaces(id,user_id,name,color,icon) values
 ('10000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a1','A','#000','x'),
 ('10000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d1','D','#000','x');
insert into public.categories(id,workspace_id,user_id,name) values
 ('20000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a1','A'),
 ('20000000-0000-4000-8000-0000000000d1','10000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d1','D');

-- ── A: create tasks through the normal client path ─────────────────────────
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
insert into public.tasks(id,user_id,workspace_id,category_id,title,notes) values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a1','20000000-0000-4000-8000-0000000000a1','T1 shared','secret-notes'),
 ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a1','20000000-0000-4000-8000-0000000000a1','T2 org',null),
 ('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a1','20000000-0000-4000-8000-0000000000a1','T3 private',null);
select public.t_err($$insert into public.tasks(user_id,workspace_id,category_id,title,assignee_id) values ('00000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a1','20000000-0000-4000-8000-0000000000a1','x','00000000-0000-4000-8000-0000000000b1')$$,
  'ASSIGNMENT_VIA_RPC_ONLY','owner cannot INSERT a pre-assigned task (must use RPC)');
select public.t_err($$update public.tasks set assignee_id='00000000-0000-4000-8000-0000000000b1', assignment_status='active' where id='30000000-0000-4000-8000-000000000001'$$,
  'ASSIGNMENT_VIA_RPC_ONLY','owner cannot UPDATE assignment columns directly');
select public.t_err($$select public.assign_task('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000c1')$$,
  'ASSIGNEE_NOT_ALLOWED','cannot assign to a stranger (no share, no common org)');
select public.t_err($$select public.assign_task('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1')$$,
  'ASSIGNEE_NOT_ALLOWED','cannot assign to self');

-- C (not owner) cannot assign A's task.
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
select public.t_err($$select public.assign_task('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000b1')$$,
  'TASK_NOT_FOUND','non-owner cannot assign someone else''s task');

set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.assign_task('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000b1');
select public.t_ok((select assignee_id='00000000-0000-4000-8000-0000000000b1' and assignment_status='active' from public.tasks where id='30000000-0000-4000-8000-000000000001'),
  'owner assigns to calendar-share peer');

-- ── B: assignee rights ─────────────────────────────────────────────────────
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b1';
select public.t_ok((select count(*)=1 from public.tasks),'assignee sees exactly the assigned task (not A''s private T2/T3)');
select public.t_err($$update public.tasks set title='hacked' where id='30000000-0000-4000-8000-000000000001'$$,
  'ASSIGNEE_FIELD_LOCKED','assignee cannot change the title');
select public.t_err($$update public.tasks set notes='x' where id='30000000-0000-4000-8000-000000000001'$$,
  'ASSIGNEE_FIELD_LOCKED','assignee cannot change notes');
select public.t_err($$update public.tasks set user_id='00000000-0000-4000-8000-0000000000b1' where id='30000000-0000-4000-8000-000000000001'$$,
  'ASSIGNEE_FIELD_LOCKED','assignee cannot take ownership');
select public.t_err($$update public.tasks set assignee_id='00000000-0000-4000-8000-0000000000c1' where id='30000000-0000-4000-8000-000000000001'$$,
  '','assignee cannot re-route the assignment');
update public.tasks set is_completed=true, completed_at=now(), actual_minutes=25,
  scheduled_date=current_date, scheduled_start_time='09:00', scheduled_end_time='09:30'
  where id='30000000-0000-4000-8000-000000000001';
delete from public.tasks where id='30000000-0000-4000-8000-000000000001';
update public.tasks set title='x' where id='30000000-0000-4000-8000-000000000003';  -- invisible to B: 0 rows
reset role;
select public.t_ok((select is_completed and actual_minutes=25 and title='T1 shared' from public.tasks where id='30000000-0000-4000-8000-000000000001'),
  'assignee completion/time/schedule saved; title untouched; DELETE by assignee had no effect');
select public.t_ok((select title='T3 private' from public.tasks where id='30000000-0000-4000-8000-000000000003'),
  'assignee UPDATE on an unrelated private task changed nothing');
set role authenticated;

-- ── C: stranger reads nothing ──────────────────────────────────────────────
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
select public.t_ok((select count(*)=0 from public.tasks),'stranger reads no task rows');
select public.t_ok((select count(*)=0 from public.list_task_assignments()),'stranger sees no assignments');

-- ── Organizations ─────────────────────────────────────────────────────────
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000e1';
select public.t_err($$select public.create_organization('E org')$$,'PRO_REQUIRED','non-Pro (expired) cannot create an organization');
select public.t_ok((select not (public.get_my_organizations()->>'can_create')::boolean),'get_my_organizations reports can_create=false for non-Pro');

set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.create_organization('Acme') as org_id \gset
select public.t_ok((select (public.get_my_organizations()->>'can_create')::boolean),'Pro user can create organizations');
select public.create_org_invite(:'org_id') as token \gset
select public.t_err(format($$select public.assign_task('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000d1','%s')$$, :'org_id'),
  'ASSIGNEE_NOT_ALLOWED','cannot assign in an org to a non-member');

set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000d1';
select public.t_err($$select * from public.preview_org_invite('bogus')$$,'invalid invite','bad invite token rejected uniformly');
select public.t_ok((select org_name='Acme' from public.preview_org_invite(:'token')),'preview shows org name');
select public.accept_org_invite(:'token');
select public.t_err(format($$select public.create_org_invite('%s')$$, :'org_id'),'FORBIDDEN','plain member cannot mint invite links');
insert into public.tasks(id,user_id,workspace_id,category_id,title) values
 ('30000000-0000-4000-8000-0000000000d9','00000000-0000-4000-8000-0000000000d1','10000000-0000-4000-8000-0000000000d1','20000000-0000-4000-8000-0000000000d1','D private');

set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.assign_task('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000d1',:'org_id');
select public.t_ok((select count(*)=0 from public.tasks where id='30000000-0000-4000-8000-0000000000d9'),'org owner cannot read a member''s private task');
select public.t_ok((select count(*)=1 and bool_and(title='T2 org') from public.get_org_board(:'org_id')),'org board lists only the org-assigned task');

set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000d1';
select public.t_ok((select count(*)=1 from public.tasks where user_id='00000000-0000-4000-8000-0000000000a1'),'org member sees only the task assigned to them (not A''s private T3)');
select public.t_ok((select count(*)=1 from public.get_org_board(:'org_id')),'member sees the org board');

set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b1';
select public.t_err(format($$select * from public.get_org_board('%s')$$, :'org_id'),'FORBIDDEN','non-member cannot read the org board');
select public.t_err(format($$select * from public.get_org_members('%s')$$, :'org_id'),'FORBIDDEN','non-member cannot list org members');

-- ── Return with reason ─────────────────────────────────────────────────────
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000d1';
select public.t_err($$select public.return_task('30000000-0000-4000-8000-000000000002','  ')$$,'RETURN_NOTE_REQUIRED','return needs a reason');
select public.return_task('30000000-0000-4000-8000-000000000002','這週排不進來');
select public.t_ok((select count(*)=0 from public.tasks where id='30000000-0000-4000-8000-000000000002'),'returned task leaves the assignee''s view');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.t_ok((select status='returned' and return_note='這週排不進來' from public.list_task_assignments() where task_id='30000000-0000-4000-8000-000000000002'),'assigner sees returned status + reason');

-- ── Leaving / dissolving relationships ────────────────────────────────────
select public.assign_task('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000d1',:'org_id');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000d1';
select public.leave_org(:'org_id');
select public.t_ok((select count(*)=0 from public.tasks where user_id='00000000-0000-4000-8000-0000000000a1'),'leaving the org removes the org-assigned task from the leaver');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.t_ok((select assignee_id is null and organization_id=:'org_id'::uuid from public.tasks where id='30000000-0000-4000-8000-000000000002'),'after leave: assignment cleared, organization_id kept for the owner');
select public.t_err(format($$select public.leave_org('%s')$$, :'org_id'),'OWNER_CANNOT_LEAVE','owner cannot leave (must delete)');
-- Re-join, role management, removal and dissolution.
select public.create_org_invite(:'org_id') as token2 \gset
select public.t_err(format($$select * from public.preview_org_invite('%s')$$, :'token'),'invalid invite','minting a new link revokes the previous one');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000d1';
select public.accept_org_invite(:'token2');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.set_org_member_role(:'org_id','00000000-0000-4000-8000-0000000000d1','admin');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000d1';
select public.t_err(format($$select public.remove_org_member('%s','00000000-0000-4000-8000-0000000000a1')$$, :'org_id'),'FORBIDDEN','admin cannot remove the owner');
select public.t_err(format($$select public.delete_organization('%s')$$, :'org_id'),'FORBIDDEN','admin cannot delete the organization');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.assign_task('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000d1',:'org_id');
select public.remove_org_member(:'org_id','00000000-0000-4000-8000-0000000000d1');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000d1';
select public.t_ok((select count(*)=0 from public.tasks where user_id='00000000-0000-4000-8000-0000000000a1'),'removed member loses the org-assigned task');
select public.t_err(format($$select * from public.get_org_board('%s')$$, :'org_id'),'FORBIDDEN','removed member loses board access');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.delete_organization(:'org_id');
select public.t_ok((select jsonb_array_length(public.get_my_organizations()->'orgs')=0),'owner can delete the organization');

delete from public.calendar_shares;  -- A dissolves the share with B
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b1';
select public.t_ok((select count(*)=0 from public.tasks),'dissolving the calendar share ends share-based assignments');

-- ── Privilege surface ─────────────────────────────────────────────────────
reset role;
select public.t_ok(not has_function_privilege('anon','public.assign_task(uuid,uuid,uuid)','EXECUTE'),'anon cannot execute assign_task');
select public.t_ok(not has_function_privilege('authenticated','huddle_ops.has_pro(uuid)','EXECUTE'),'clients cannot call the Pro helper');
select public.t_ok(not has_table_privilege('authenticated','public.organizations','SELECT')
  and not has_table_privilege('authenticated','public.organization_members','INSERT')
  and not has_table_privilege('authenticated','public.organization_invites','SELECT'),'organization tables are RPC-only');
select public.t_ok(not exists(
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
    and not exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='operations_account_active')),
  'every public RLS table (incl. organizations*) carries the suspension policy');
