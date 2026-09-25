#!/usr/bin/env python3
"""Creates and destroys a Unix-socket-only temporary Postgres cluster. No remote DB access."""
import pathlib, subprocess, tempfile, shutil, sys, urllib.parse, getpass
root=pathlib.Path(__file__).resolve().parents[2]
pg=pathlib.Path('/opt/homebrew/opt/postgresql@16/bin')
with tempfile.TemporaryDirectory(prefix='huddle-meeting-pg-') as directory:
 d=pathlib.Path(directory); data=d/'data'; sock=d/'socket'; sock.mkdir()
 def run(args,**kw): return subprocess.run([str(x) for x in args],check=True,**kw)
 run([pg/'initdb','-D',data,'--auth=trust','--no-locale','--encoding=UTF8'],stdout=subprocess.DEVNULL)
 run([pg/'pg_ctl','-D',data,'-l',d/'postgres.log','-o',f"-k {sock} -c listen_addresses='' -p 55487",'start'],stdout=subprocess.DEVNULL)
 try:
  sql="""
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
create table public.profiles(id uuid primary key,display_name text);
create table public.calendar_shares(user_lo uuid,user_hi uuid);
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004');
insert into public.profiles select id,'Person '||right(id::text,1) from auth.users;
insert into public.calendar_shares values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
"""
  sql+=(root/'supabase/migrations/20260920173447_meeting_invitations.sql').read_text()
  sql+=r"""
create function public.expect_denied(query text) returns void language plpgsql as $$ begin execute query; raise exception 'Unexpected success: %',query; exception when insufficient_privilege or invalid_parameter_value then null; end $$;
create function public.assert_ok(result boolean,label text) returns void language plpgsql as $$ begin if result is distinct from true then raise exception 'Assertion failed: %',label; end if; end $$;
set role anon;
select public.expect_denied($q$select public.get_meeting_invitations(now(),now()+interval '7 days')$q$);
reset role;
set role authenticated;
select public.expect_denied($q$select public.get_meeting_invitations(now(),now()+interval '7 days')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.expect_denied($q$select * from public.meeting_invitations$q$);
select public.expect_denied($q$insert into public.meeting_attendees values(null,null,'accepted',now())$q$);
select public.expect_denied($q$select public.create_meeting_invitation('test','','',now()+interval '1 day',now()+interval '1 day 1 hour','Asia/Taipei',array['00000000-0000-0000-0000-000000000004']::uuid[],'10000000-0000-0000-0000-000000000001')$q$);
select public.expect_denied($q$select public.create_meeting_invitation('test','','',now()-interval '1 day',now()+interval '1 hour','Asia/Taipei',array['00000000-0000-0000-0000-000000000002']::uuid[],'10000000-0000-0000-0000-000000000001')$q$);
begin;
select public.create_meeting_invitation('test','notes','room',now()+interval '1 day',now()+interval '1 day 1 hour','Asia/Taipei',array['00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003']::uuid[],'10000000-0000-0000-0000-000000000001') as mid \gset
select public.assert_ok(public.create_meeting_invitation('test','notes','room',now()+interval '1 day',now()+interval '1 day 1 hour','Asia/Taipei',array['00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002']::uuid[],'10000000-0000-0000-0000-000000000001')=:'mid'::uuid,'idempotent deduplicated retry');
select public.expect_denied($q$select public.create_meeting_invitation('DIFFERENT','','',now()+interval '1 day',now()+interval '1 day 1 hour','Asia/Taipei',array['00000000-0000-0000-0000-000000000002']::uuid[],'10000000-0000-0000-0000-000000000001')$q$);
select public.assert_ok(jsonb_array_length(public.get_meeting_invitations(now(),now()+interval '7 days')->0->'participants')=3,'all participants visible without emails');
select public.assert_ok(public.get_meeting_invitation_by_request('10000000-0000-0000-0000-000000000001')->>'id'=:'mid','organizer recovers lost create response');
select public.assert_ok(public.get_meeting_invitation_by_request('90000000-0000-0000-0000-000000000001') is null,'unknown request returns null');
select public.assert_ok(public.get_meeting_invitations(now(),now()+interval '7 days')->0->'email_status'->>'pending'='2','outbox enqueued');
commit;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select public.assert_ok(public.get_meeting_invitations(now(),now()+interval '7 days')='[]'::jsonb,'third party cannot read');
select public.assert_ok(public.get_meeting_invitation_by_request('10000000-0000-0000-0000-000000000001') is null,'third party same request key does not leak');
select public.expect_denied(format('select public.get_meeting_invitation(%L)',:'mid'));
select public.expect_denied(format('select public.respond_meeting_invitation(%L,''accepted'')',:'mid'));
select public.expect_denied(format('select public.cancel_meeting_invitation(%L)',:'mid'));
select public.expect_denied($q$select public.get_shared_meeting_busy(array['00000000-0000-0000-0000-000000000001']::uuid[],now(),now()+interval '7 days')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.assert_ok(public.get_meeting_invitation(:'mid')->>'id'=:'mid','direct link lookup');
select public.assert_ok(public.get_meeting_invitation_by_request('10000000-0000-0000-0000-000000000001') is null,'attendee cannot recover organizer request');
select public.respond_meeting_invitation(:'mid','accepted');
select public.assert_ok(public.get_meeting_invitations(now(),now()+interval '7 days')->0->'email_status'='null'::jsonb,'email stats organizer only');
select public.expect_denied(format('select public.cancel_meeting_invitation(%L)',:'mid'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.respond_meeting_invitation(:'mid','tentative');
select public.respond_meeting_invitation(:'mid','declined');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.assert_ok(jsonb_array_length(public.get_shared_meeting_busy(array['00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003']::uuid[],now(),now()+interval '7 days'))=1,'only accepted is busy');
select public.cancel_meeting_invitation(:'mid');
select public.cancel_meeting_invitation(:'mid');
select public.assert_ok(public.get_shared_meeting_busy(array['00000000-0000-0000-0000-000000000002']::uuid[],now(),now()+interval '7 days')='[]'::jsonb,'cancel clears busy');
select public.assert_ok(public.get_meeting_invitations(now(),now()+interval '7 days')->0->'email_status'->>'pending'='2','cancel outbox idempotent');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.expect_denied(format('select public.respond_meeting_invitation(%L,''accepted'')',:'mid'));
reset role;
select public.assert_ok((select count(*)=1 from public.meeting_invitations),'one idempotent invitation');
select public.assert_ok((select count(*)=4 from public.meeting_email_outbox),'exactly four outbox records');
insert into public.meeting_invitations(id,organizer_id,title,starts_at,ends_at,time_zone,client_request_id,request_payload) values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Private other meeting',now()+interval '2 days',now()+interval '2 days 1 hour','Asia/Taipei','20000000-0000-0000-0000-000000000002','{}');
insert into public.meeting_attendees(meeting_id,user_id,response) values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','accepted'),('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','accepted');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.assert_ok(public.get_shared_meeting_busy(array['00000000-0000-0000-0000-000000000002']::uuid[],now(),now()+interval '7 days')='[]'::jsonb,'share peer does not expose unrelated meeting');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.assert_ok(jsonb_array_length(public.get_shared_meeting_busy(array['00000000-0000-0000-0000-000000000002']::uuid[],now(),now()+interval '7 days'))=1,'own private meeting remains busy');

"""
  sql+='\nreset role;\n'
  sql+=(root/'supabase/migrations/20260925155252_meeting_in_app_notifications.sql').read_text()
  sql+=r"""

set role anon;
select public.expect_denied($q$select public.get_meeting_notifications()$q$);
reset role; set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.expect_denied($q$select * from public.meeting_notifications$q$);
begin;
select public.create_meeting_invitation('In-app only','','',now()+interval '3 days',now()+interval '3 days 1 hour','Asia/Taipei',array['00000000-0000-0000-0000-000000000002']::uuid[],'30000000-0000-0000-0000-000000000001') as appmid \gset
select public.assert_ok(public.create_meeting_invitation('In-app only','','',now()+interval '3 days',now()+interval '3 days 1 hour','Asia/Taipei',array['00000000-0000-0000-0000-000000000002']::uuid[],'30000000-0000-0000-0000-000000000001')=:'appmid'::uuid,'in-app creation retry');
select public.assert_ok(public.get_meeting_notifications()->>'unread_count'='0','no invitation notification to self');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.assert_ok(public.get_meeting_notifications()->>'unread_count'='1','one invitation notification');
select public.get_meeting_notifications()->'items'->0->>'id' as nid \gset
select public.read_meeting_notification(:'nid');
select public.read_meeting_notification(:'nid');
select public.assert_ok(public.get_meeting_notifications()->>'unread_count'='0','read idempotent and persistent');
select public.respond_meeting_invitation(:'appmid','accepted');
select public.respond_meeting_invitation(:'appmid','accepted');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.assert_ok(public.get_meeting_notifications()->>'unread_count'='0','third party sees no notifications');
select public.expect_denied(format('select public.read_meeting_notification(%L)',:'nid'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.assert_ok(public.get_meeting_notifications()->>'unread_count'='1','same response retry no duplicate');
select public.assert_ok(public.get_meeting_notifications()->'items'->0->>'response'='accepted','response snapshot');
select public.cancel_meeting_invitation(:'appmid');
select public.cancel_meeting_invitation(:'appmid');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.assert_ok(public.get_meeting_notifications()->>'unread_count'='1','one cancellation');
select public.assert_ok(public.get_meeting_notifications()->'items'->0->>'kind'='cancellation','cancellation notification');
commit;
reset role;
select public.assert_ok((select count(*)=4 from public.meeting_email_outbox),'no new emails enqueued');
select public.assert_ok((select count(*)=3 from public.meeting_notifications),'exactly invitation response cancellation');
select public.assert_ok((select relrowsecurity from pg_class where oid='public.meeting_notifications'::regclass),'notification RLS enabled');
select public.assert_ok(not has_table_privilege('authenticated','public.meeting_notifications','insert'),'client cannot forge notifications');

"""
  run([pg/'psql','-h',sock,'-p','55487','-d','postgres','-v','ON_ERROR_STOP=1','-q'],input=sql,text=True,stdout=subprocess.DEVNULL)
  if '--advisors' in sys.argv:
   uri=f'postgresql://{getpass.getuser()}@localhost:55487/postgres?host={urllib.parse.quote(str(sock), safe="")}'
   result=subprocess.run(['supabase','db','advisors','--db-url',uri,'--type','security'],cwd=root,text=True,capture_output=True,timeout=45)
   print('LOCAL ADVISORS:',result.stdout,result.stderr)
  print('PASS: local isolated Postgres migration, membership, anonymous denial, direct write denial, idempotency, responses, cancellation, free/busy privacy and in-app notification isolation/read/idempotency/no new email queue.')
 finally: run([pg/'pg_ctl','-D',data,'-m','immediate','stop'],stdout=subprocess.DEVNULL)
