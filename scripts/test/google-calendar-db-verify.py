#!/usr/bin/env python3
"""Isolated socket-only PostgreSQL; never reads credentials or remote databases."""
import pathlib,subprocess,tempfile
root=pathlib.Path(__file__).resolve().parents[2];pg=pathlib.Path('/opt/homebrew/opt/postgresql@16/bin')
with tempfile.TemporaryDirectory(prefix='huddle-google-pg-') as tmp:
 d=pathlib.Path(tmp);sock=d/'socket';sock.mkdir()
 def run(args,**kwargs):return subprocess.run([str(x) for x in args],check=True,**kwargs)
 run([pg/'initdb','-D',d/'data','--auth=trust','--no-locale','--encoding=UTF8'],stdout=subprocess.DEVNULL)
 run([pg/'pg_ctl','-D',d/'data','-l',d/'log','-o',f"-k {sock} -c listen_addresses='' -p 55489",'start'],stdout=subprocess.DEVNULL)
 try:
  sql="""
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key);
create table public.tasks(id uuid,user_id uuid,title text);
create table public.workspaces(id uuid,user_id uuid);
create table public.meeting_invitations(id uuid,organizer_id uuid,status text);
create table public.meeting_attendees(meeting_id uuid,user_id uuid,response text);
grant select on public.tasks,public.meeting_invitations,public.meeting_attendees to service_role;
insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
"""
  sql+=(root/'supabase/migrations/20260920182257_google_calendar_sync.sql').read_text()
  sql+="""
create function public.assert_ok(b boolean) returns void language plpgsql as $$ begin if b is distinct from true then raise exception 'assertion failed';end if;end $$;
create function public.denied(q text) returns void language plpgsql as $$ begin execute q;raise exception 'unexpected access';exception when insufficient_privilege then null;end $$;
set role anon;
select public.denied('select * from public.google_calendar_connections');
select public.denied('select public.google_calendar_snapshot(null)');
reset role;set role authenticated;
select public.denied('select * from public.google_calendar_oauth_states');
select public.denied('select * from public.google_calendar_event_mappings');
select public.denied('select public.google_calendar_claim(null,null,null)');
reset role;
insert into public.tasks values(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','own'),(gen_random_uuid(),'00000000-0000-0000-0000-000000000002','private other');
insert into public.meeting_invitations values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','active');
insert into public.meeting_attendees values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','pending');
set role service_role;
select public.assert_ok(jsonb_array_length(public.google_calendar_snapshot('00000000-0000-0000-0000-000000000001')->'tasks')=1);
select public.assert_ok(jsonb_array_length(public.google_calendar_snapshot('00000000-0000-0000-0000-000000000001')->'meetings')=0);
insert into public.google_calendar_connections(user_id,refresh_cipher,time_zone,workspace_ids) values('00000000-0000-0000-0000-000000000001','encrypted','Asia/Taipei','{}');
select public.assert_ok(not public.google_calendar_claim('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',gen_random_uuid()));
select public.assert_ok(public.google_calendar_claim('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',(select generation from public.google_calendar_connections)));
select public.assert_ok(not public.google_calendar_claim('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',(select generation from public.google_calendar_connections)));
insert into public.google_calendar_event_mappings values('00000000-0000-0000-0000-000000000001','task:deleted','event1',null,null);
reset role;
delete from public.tasks;
update public.meeting_attendees set response='accepted';
set role service_role;
select public.assert_ok(jsonb_array_length(public.google_calendar_snapshot('00000000-0000-0000-0000-000000000001')->'mappings')=1);
select public.assert_ok(jsonb_array_length(public.google_calendar_snapshot('00000000-0000-0000-0000-000000000001')->'meetings')=1);
delete from public.google_calendar_connections;
select public.assert_ok((select count(*)=0 from public.google_calendar_event_mappings));
"""
  run([pg/'psql','-h',sock,'-p','55489','-d','postgres','-v','ON_ERROR_STOP=1','-q'],input=sql,text=True,stdout=subprocess.DEVNULL)
  print('PASS 13 local SQL assertions: role denial, ownership, accepted-only meetings, leases, tombstones and disconnect cleanup')
 finally:run([pg/'pg_ctl','-D',d/'data','stop','-m','immediate'],stdout=subprocess.DEVNULL)
