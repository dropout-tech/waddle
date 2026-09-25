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
 # Assignment flow is tested on the same isolated database, never real users.
 sql("create table calendar_shares(id uuid default gen_random_uuid(),user_lo uuid,user_hi uuid,unique(user_lo,user_hi));")
 sql((root/'supabase/migrations/20260925083539_meeting_assignments.sql').read_text())
 sql(f"insert into calendar_shares(user_lo,user_hi) values(least('{u}'::uuid,'{other}'::uuid),greatest('{u}'::uuid,'{other}'::uuid));")
 other_ws=str(uuid.uuid4()); other_cat=str(uuid.uuid4())
 sql(f"insert into workspaces(id,user_id,name,color,icon) values('{other_ws}','{other}','Other','#aaa','x');insert into categories(id,user_id,workspace_id,name) values('{other_cat}','{other}','{other_ws}','Inbox');")
 meeting,_=reserve()
 multi={**result,'tasks':[result['tasks'][0],result['tasks'][0],result['tasks'][0]]}
 sql(f"select finish_meeting_import('{u}','{meeting}',{q(json.dumps(multi))}::jsonb,'{{}}');")
 choices=[{'index':0,'title':'Self work','owner':'Me','dueDate':'','assigneeId':u},{'index':1,'title':'Peer work','owner':'Peer','dueDate':'','assigneeId':other},{'index':2,'title':'Unassigned work','owner':'','dueDate':'','assigneeId':''}]
 sql(f"select route_meeting_tasks('{u}','{meeting}','{cat}',{q(json.dumps(choices))}::jsonb);")
 assert sql('select count(*) from tasks')=='2'
 assert sql('select count(*) from meeting_task_assignments')=='1'
 sql(f"select route_meeting_tasks('{u}','{meeting}','{cat}',{q(json.dumps(choices))}::jsonb);")
 assert sql('select count(*) from tasks')=='2'
 assignment=sql('select id from meeting_task_assignments')
 assert 'ASSIGNMENT_NOT_FOUND' in sql(f"select respond_meeting_assignment('{u}','{assignment}',true,'{cat}');",True)
 assert 'CATEGORY_NOT_FOUND' in sql(f"select respond_meeting_assignment('{other}','{assignment}',true,'{cat}');",True)
 assert sql('select status from meeting_task_assignments')=='pending'
 def accept(_):return sql(f"select respond_meeting_assignment('{other}','{assignment}',true,'{other_cat}');")
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: list(pool.map(accept,range(5)))
 assert sql('select count(*) from tasks')=='3'
 assert sql(f"select user_id from tasks where title='Peer work'")==other
 sql(f"select respond_meeting_assignment('{other}','{assignment}',false,null);")
 assert sql('select status from meeting_task_assignments')=='accepted'
 choices[2]['assigneeId']=other
 sql(f"select route_meeting_tasks('{u}','{meeting}',null,{q(json.dumps([choices[2]]))}::jsonb);")
 rejected=sql("select id from meeting_task_assignments where source_index=2")
 sql(f"select respond_meeting_assignment('{other}','{rejected}',false,null);")
 assert sql(f"select status from meeting_task_assignments where id='{rejected}'")=='rejected'
 assert sql('select count(*) from tasks')=='3'
 stranger=str(uuid.uuid4());sql(f"insert into auth.users values('{stranger}');")
 assert sql(f"set role authenticated;set request.jwt.claim.sub='{stranger}';select count(*) from meeting_task_assignments").splitlines()[-1]=='0'
 assert 'permission denied' in sql(f"set role authenticated;select respond_meeting_assignment('{other}','{assignment}',true,'{other_cat}');",True)
 assert 'permission denied' in sql("set role authenticated;update meeting_task_assignments set status='accepted';",True)
 # Automatic self assignment shares the result/quota transaction.
 auto_id=str(uuid.uuid4());person=str(uuid.uuid4())
 context={'autoSelf':True,'categoryId':cat,'participants':[{'id':person,'userId':u}]}
 sql(f"select reserve_meeting_import_v2('{u}','{auto_id}','Auto','2026-09-25','This is a real transcript with a clear task.',{q(json.dumps(context))}::jsonb);")
 explicit={**result,'tasks':[{**result['tasks'][0],'ownerParticipantId':person,'assignmentConfidence':'explicit'}]}
 sql(f"select finish_meeting_import_v2('{u}','{auto_id}',{q(json.dumps(explicit))}::jsonb,'{{}}');")
 assert sql('select count(*) from tasks')=='4'
 assert sql(f"select imported_tasks <> '{{}}'::jsonb from meeting_imports where id='{auto_id}'")=='t'
 # Unknown ownership stays a checklist and never creates a task automatically.
 unknown=str(uuid.uuid4())
 sql(f"select reserve_meeting_import_v2('{u}','{unknown}','Unknown','2026-09-25','This is a real transcript with a clear task.',{q(json.dumps(context))}::jsonb);")
 explicit['tasks'][0]['assignmentConfidence']='uncertain'
 sql(f"select finish_meeting_import_v2('{u}','{unknown}',{q(json.dumps(explicit))}::jsonb,'{{}}');")
 assert sql('select count(*) from tasks')=='4'
 print('PASS: self/peer/unassigned routing, atomic acceptance, rejection, ownership, replay, RLS, explicit-only automatic self tasks')
 print('PASS: quota concurrency, replay, failure release, stale fencing, month reset, ownership/RLS, RPC grants, task validation and atomic deduplication')
finally:
 subprocess.run([str(bin/'pg_ctl'),'-D',str(path/'data'),'stop','-m','immediate'],capture_output=True)
 tmp.cleanup()
