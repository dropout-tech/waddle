#!/usr/bin/env python3
"""Isolated real PostgreSQL role, limit and concurrency tests. No remote access."""
from pathlib import Path
import subprocess,tempfile,concurrent.futures
root=Path(__file__).resolve().parents[2]; pg=Path('/opt/homebrew/opt/postgresql@16/bin')
with tempfile.TemporaryDirectory(prefix='huddle-plan-pg-') as tmp:
 d=Path(tmp); sock=d/'s';sock.mkdir()
 def run(*args,**kw): return subprocess.run([str(x) for x in args],check=True,**kw)
 run(pg/'initdb','-D',d/'data','--auth=trust','--no-locale',stdout=subprocess.DEVNULL)
 run(pg/'pg_ctl','-D',d/'data','-l',d/'log','-o',f"-k {sock} -c listen_addresses='' -p 55489",'start',stdout=subprocess.DEVNULL)
 def sql(s,ok=True):
  r=subprocess.run([str(pg/'psql'),'-h',str(sock),'-p','55489','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],input=s,text=True,capture_output=True)
  if ok and r.returncode: raise AssertionError(r.stderr)
  return r
 user='00000000-0000-0000-0000-000000000001'
 auth=f"set role authenticated;select set_config('request.jwt.claim.sub','{user}',false);"
 def create(i,n=1):
  peers=','.join("'%s'"%f'00000000-0000-0000-0000-{j:012d}' for j in range(2,2+n))
  return f"select public.create_meeting_invitation('test','','','2099-01-01 00:00Z','2099-01-01 01:00Z','Asia/Taipei',array[{peers}]::uuid[],'10000000-0000-0000-0000-{i:012d}');"
 def denied(s,needle):
  r=sql(auth+s,False);assert r.returncode and needle in r.stderr,r.stderr
 try:
  sql("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;create table public.profiles(id uuid,display_name text);create table public.calendar_shares(user_lo uuid,user_hi uuid);insert into auth.users select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,12)i;insert into public.calendar_shares select '"+user+"',id from auth.users where id<>'"+user+"';")
  for name in ['20260920082633_billing_entitlements.sql','20260920173447_meeting_invitations.sql','20260920182613_meeting_plan_limits.sql']:sql((root/'supabase/migrations'/name).read_text())
  assert sql(auth+"select public.get_meeting_plan_usage()->>'enabled';").stdout.strip().endswith('false')
  for i in range(1,5):sql(auth+create(i,3))
  sql('update public.meeting_plan_config set enabled=true;')
  sql(auth+create(1,3)) # Retry succeeds after cap lowered and used > limit.
  denied(create(5),'meeting_monthly_limit');denied(create(5,3),'meeting_invitee_limit')
  denied('update public.meeting_plan_config set enabled=false;','permission denied')
  denied("insert into public.billing_entitlements values('"+user+"','pro',now()+interval '1 year',1);",'permission denied')
  assert sql('set role anon;select public.get_meeting_plan_usage();',False).returncode
  sql("update public.meeting_invitations set created_at=(date_trunc('month',now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei')-interval '1 second';")
  assert sql(auth+"select public.get_meeting_plan_usage()->>'used';").stdout.strip().endswith('0')
  sql(auth+create(5,2));sql(auth+create(6,2))
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
   results=list(ex.map(lambda i:sql(auth+create(i),False),[7,8]))
  assert sum(r.returncode==0 for r in results)==1
  assert any('meeting_monthly_limit' in r.stderr for r in results)
  sql(auth+"select public.cancel_meeting_invitation((public.get_meeting_invitation_by_request('10000000-0000-0000-0000-000000000005')->>'id')::uuid);")
  denied(create(9),'meeting_monthly_limit')
  sql("insert into public.billing_entitlements values('"+user+"','pro',clock_timestamp()+interval '1 day',1);")
  sql(auth+create(9,10))
  assert sql(auth+"select public.get_meeting_plan_usage()->>'monthly_limit';").stdout.strip().endswith('50')
  sql("update public.billing_entitlements set expires_at=clock_timestamp()-interval '1 second';")
  denied(create(10),'meeting_monthly_limit')
  sql(auth+create(9,10)) # Retry also survives downgrade.
  sql("update public.billing_entitlements set expires_at=clock_timestamp()+interval '1 day';")
  for i in range(10,56):sql(auth+create(i)) # 4 current + 46 = 50
  denied(create(56),'meeting_monthly_limit')
  assert sql(auth+"select public.get_meeting_plan_usage()->>'used';").stdout.strip().endswith('50')
  print('PASS: disabled defaults, private flag/entitlements, anonymous denial, free/pro caps, expiry downgrade, idempotent retries, Taipei month boundary, cancellation counts, concurrent final slot.')
 finally:run(pg/'pg_ctl','-D',d/'data','-m','immediate','stop',stdout=subprocess.DEVNULL)
