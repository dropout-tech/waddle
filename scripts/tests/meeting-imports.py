"""Isolated PostgreSQL integration tests. Does not connect to Supabase or real data."""
import concurrent.futures, json, os, pathlib, subprocess, tempfile, uuid
root=pathlib.Path(__file__).resolve().parents[2]
bin=pathlib.Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@16/bin'))
tmp=tempfile.TemporaryDirectory(prefix='huddle-meeting-pg-'); path=pathlib.Path(tmp.name)
def run(*args):
 return subprocess.run([str(x) for x in args],check=True,text=True,capture_output=True)
def sql(query, fail=False):
 p=subprocess.run([str(bin/'psql'),'-h',str(path),'-p','55439','-U','postgres','-d','postgres','-XAt','-v','ON_ERROR_STOP=1','-c',query],text=True,capture_output=True)
 if fail:
  assert p.returncode != 0, query
  return p.stderr
 if p.returncode: raise AssertionError(p.stderr)
 return p.stdout.strip()
def q(v): return "'"+str(v).replace("'","''")+"'"
u=str(uuid.uuid4()); other=str(uuid.uuid4()); cat=str(uuid.uuid4()); ws=str(uuid.uuid4())
def reserve(user=u, id=None):
 id=id or str(uuid.uuid4())
 return id, sql(f"select public.reserve_meeting_import('{user}','{id}','Meeting','2026-09-25','This is a real transcript with a clear task.');")
try:
 run(bin/'initdb','-D',path/'data','-U','postgres','--auth=trust')
 run(bin/'pg_ctl','-D',path/'data','-l',path/'server.log','-o',f'-k {path} -p 55439 -h ""','start')
 sql("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;")
 initial=(root/'supabase/migrations/0001_initial_schema.sql').read_text().split('-- journal_entries')[0]
 sql(initial)
 sql((root/'supabase/migrations/20260925081959_meeting_imports.sql').read_text())
 sql(f"insert into auth.users values('{u}'),('{other}');insert into workspaces(id,user_id,name,color,icon) values('{ws}','{u}','Work','#aaa','x');insert into categories(id,user_id,workspace_id,name) values('{cat}','{u}','{ws}','Inbox');")
 id,data=reserve(); assert json.loads(data)['claimed']
 assert not json.loads(reserve(id=id)[1])['claimed']
 assert 'REQUEST_CONFLICT' in sql(f"select reserve_meeting_import('{other}','{id}','Meeting','2026-09-25','This is a real transcript with a clear task.');",True)
 result={'summary':'Summary','decisions':[],'questions':[],'tasks':[{'title':'Do work','owner':'','dueDate':'','source':'a clear task'}]}
 sql(f"select finish_meeting_import('{u}','{id}',{q(json.dumps(result))}::jsonb,'{{}}');")
 tasks=q(json.dumps([{'index':0,'title':'Edited task','owner':'Alice','dueDate':'2026-10-01'}]))
 a=sql(f"select import_meeting_tasks('{u}','{id}','{cat}',{tasks}::jsonb);")
 b=sql(f"select import_meeting_tasks('{u}','{id}','{cat}',{tasks}::jsonb);")
 assert a==b and sql('select count(*) from tasks;')=='1'
 assert sql('select title from tasks;')=='Edited task'
 assert 'MEETING_NOT_FOUND' in sql(f"select import_meeting_tasks('{other}','{id}','{cat}',{tasks}::jsonb);",True)
 assert 'CATEGORY_NOT_FOUND' in sql(f"select import_meeting_tasks('{u}','{id}','{uuid.uuid4()}',{tasks}::jsonb);",True)
 sql(f"set role authenticated; set request.jwt.claim.sub='{other}'; select * from meeting_imports;") == ''
 assert sql(f"set role authenticated; set request.jwt.claim.sub='{other}'; select count(*) from meeting_imports;").splitlines()[-1]=='0'
 assert 'permission denied' in sql(f"set role authenticated;select reserve_meeting_import('{u}','{uuid.uuid4()}','x','2026-09-25','This is a real transcript with a clear task.');",True)
 assert 'permission denied' in sql(f"set role authenticated;update meeting_imports set status='succeeded';",True)
 failed,_=reserve(); sql(f"select finish_meeting_import('{u}','{failed}',null,null);")
 stale,_=reserve(); sql(f"update meeting_imports set created_at=now()-interval '6 minutes' where id='{stale}';")
 reserve()
 assert sql(f"select status from meeting_imports where id='{stale}'")=='failed'
 assert 'REQUEST_EXPIRED' in sql(f"select finish_meeting_import('{u}','{stale}',{q(json.dumps(result))}::jsonb,'{{}}');",True)
 # 19 outstanding reservations for another user; simultaneous requests for last slot.
 for _ in range(19): reserve(other)
 def attempt(_):
  try: reserve(other); return True
  except AssertionError as e:
   assert 'MONTHLY_LIMIT' in str(e); return False
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
  assert sum(pool.map(attempt,range(8)))==1
 assert sql(f"select count(*) from meeting_imports where user_id='{other}' and status='pending'")=='20'
 sql(f"update meeting_imports set month=(month-interval '1 month')::date where user_id='{other}';")
 assert json.loads(reserve(other)[1])['claimed']
 assert sql("select date_trunc('month',timestamptz '2026-09-30 16:00:00+00' at time zone 'Asia/Taipei')::date;")=='2026-10-01'
 print('PASS: quota concurrency, replay, failure release, stale fencing, month reset, ownership/RLS, RPC grants, task validation and atomic deduplication')
finally:
 subprocess.run([str(bin/'pg_ctl'),'-D',str(path/'data'),'stop','-m','immediate'],capture_output=True)
 tmp.cleanup()
