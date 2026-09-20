#!/usr/bin/env python3
"""Real role/accept_share_invite tests in a temporary socket-only PostgreSQL."""
from pathlib import Path
import subprocess,tempfile,concurrent.futures
root=Path(__file__).resolve().parents[2];pg=Path('/opt/homebrew/opt/postgresql@16/bin')
def uid(n):return f'00000000-0000-4000-8000-{n:012d}'
with tempfile.TemporaryDirectory(prefix='huddle-sharing-pg-') as tmp:
 d=Path(tmp);sock=d/'s';sock.mkdir()
 def run(*args,**kw):return subprocess.run([str(x) for x in args],check=True,**kw)
 run(pg/'initdb','-D',d/'data','--auth=trust','--no-locale',stdout=subprocess.DEVNULL)
 run(pg/'pg_ctl','-D',d/'data','-l',d/'log','-o',f"-k {sock} -c listen_addresses='' -p 55490",'start',stdout=subprocess.DEVNULL)
 def sql(s,ok=True):
  r=subprocess.run([str(pg/'psql'),'-h',str(sock),'-p','55490','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],input=s,text=True,capture_output=True)
  if ok and r.returncode:raise AssertionError(r.stderr)
  return r
 def auth(n):return f"set role authenticated;select set_config('request.jwt.claim.sub','{uid(n)}',false);"
 seq=0
 def invitation(a,b):
  global seq
  seq+=1;token=f'test-{seq}'
  sql(f"insert into public.calendar_share_invites(inviter_id,token_hash) values('{uid(a)}',encode(extensions.digest('{token}','sha256'),'hex'));")
  return auth(b)+f"select public.accept_share_invite('{token}');"
 def link(a,b,ok=True):return sql(invitation(a,b),ok)
 def limit(n):return sql(auth(n)+"select public.get_my_sharing_limit();").stdout
 try:
  sql("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;create table auth.users(id uuid primary key,created_at timestamptz not null);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;"+''.join(f"insert into auth.users values('{uid(n)}',now()-interval '{'0 days' if n<3 else '1 year'}');" for n in range(1,30)))
  base=(root/'supabase/migrations/0016_calendar_sharing.sql').read_text()
  sql(base[base.index('create extension'):base.index('-- `ref`')])
  sql(base[base.index('create or replace function public.accept_share_invite'):base.index('-- 4) My peers')])
  sql('revoke all on function public.accept_share_invite(text) from public,anon;grant execute on function public.accept_share_invite(text) to authenticated;')
  sql((root/'supabase/migrations/20260920082633_billing_entitlements.sql').read_text());sql((root/'supabase/migrations/20260920183303_sharing_plan_limits.sql').read_text())
  for n in [3,4,5]:link(1,n)
  assert '"enabled": false' in limit(1)
  assert sql('update public.sharing_plan_config set enabled=true;',False).returncode
  sql("update public.sharing_plan_config set enabled=true,effective_from=clock_timestamp()-interval '10 minutes';")
  link(3,1) # Already connected, another invitation is idempotent over quota.
  assert 'sharing_peer_limit' in link(1,6,False).stderr
  assert '"grandfathered": true' in limit(3)
  for n in range(6,29):link(3,n) # Legacy users retain >20 peers.
  for n in [4,5]:link(2,n)
  sql(f"insert into public.billing_entitlements values('{uid(1)}','pro',clock_timestamp()+interval '1 day',1);")
  assert 'sharing_peer_limit' in link(1,2,False).stderr # Invitee's free limit checked too.
  for n in range(6,23):link(1,n) # 3 + 17 = 20.
  assert 'sharing_peer_limit' in link(1,23,False).stderr
  sql(f"update public.billing_entitlements set expires_at=clock_timestamp()-interval '1 second' where user_id='{uid(1)}';")
  assert 'sharing_peer_limit' in link(1,24,False).stderr
  link(4,1) # Existing pair remains available after downgrade.
  assert sql(auth(1)+'select sharing_plan_private.for_user(\''+uid(2)+'\');',False).returncode
  assert sql(auth(1)+'update public.sharing_plan_config set enabled=false;',False).returncode
  assert sql('set role anon;select public.get_my_sharing_limit();',False).returncode
  assert sql(auth(1)+f"insert into public.calendar_shares(user_lo,user_hi) values('{uid(1)}','{uid(29)}');",False).returncode
  sql('truncate public.calendar_shares cascade;')
  link(1,3)
  requests=[invitation(1,4),invitation(1,5)]
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:results=list(ex.map(lambda s:sql(s,False),requests))
  assert sum(r.returncode==0 for r in results)==1
  assert any('sharing_peer_limit' in r.stderr for r in results)
  assert sql(f"select count(*) from public.calendar_shares where user_lo='{uid(1)}' or user_hi='{uid(1)}';").stdout.strip()=='2'
  print('PASS: default off, explicit activation, legacy unlimited, free2/pro20 both-party quotas, expired Pro, duplicate pair, concurrent last slot, private helper/config, anon and direct inserts denied.')
 finally:run(pg/'pg_ctl','-D',d/'data','-m','immediate','stop',stdout=subprocess.DEVNULL)
