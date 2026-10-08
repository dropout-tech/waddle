"""Isolated PostgreSQL tests for meeting follow-ups (20261003040000_meeting_followups.sql).
Starts a throwaway local PostgreSQL; never connects to Supabase or real data."""
import json, os, pathlib, subprocess, tempfile, uuid
root=pathlib.Path(__file__).resolve().parents[2]
bin=pathlib.Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@16/bin'))
tmp=tempfile.TemporaryDirectory(prefix='huddle-followup-pg-',dir=os.environ.get('PG_TMP','/tmp')); path=pathlib.Path(tmp.name)  # short dir: unix socket path limit
PORT='55441'
MIGRATION=root/'supabase/migrations/20261003040000_meeting_followups.sql'
ROLLBACK=root/'supabase/rollback/20261003040000_meeting_followups_down.sql'
# LC_ALL=C: a non-C session locale makes the postmaster abort on macOS
# ("became multithreaded during startup"); the cluster itself is UTF8.
ENV={**os.environ,'LC_ALL':'C','LANG':'C'}
def run(*args):
 return subprocess.run([str(x) for x in args],check=True,text=True,capture_output=True,env=ENV)
def sql(query, fail=False):
 p=subprocess.run([str(bin/'psql'),'-h',str(path),'-p',PORT,'-U','postgres','-d','postgres','-XAt','-F','|','-v','ON_ERROR_STOP=1','-c',query],text=True,capture_output=True)
 if fail:
  assert p.returncode != 0, query
  return p.stderr
 if p.returncode: raise AssertionError(p.stderr)
 return p.stdout.strip()
def q(v): return "'"+str(v).replace("'","''")+"'"
def as_user(user, query):
 out=sql(f"set role authenticated; set request.jwt.claim.sub='{user}'; {query}")
 return [l for l in out.splitlines() if l not in ('SET',)]
u=str(uuid.uuid4()); other=str(uuid.uuid4()); cat=str(uuid.uuid4()); ws=str(uuid.uuid4())
other_ws=str(uuid.uuid4()); other_cat=str(uuid.uuid4())
TRANSCRIPT='This is a real transcript with a clear task.'
def task(title, **extra):
 return {'title':title,'owner':'','dueDate':'','source':'a clear task',**extra}
try:
 run(bin/'initdb','-D',path/'data','-U','postgres','--auth=trust','-E','UTF8','--locale=C')
 run(bin/'pg_ctl','-D',path/'data','-l',path/'server.log','-o',f'-k {path} -p {PORT} -h ""','start')
 sql("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$; grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;")
 sql((root/'supabase/migrations/0001_initial_schema.sql').read_text().split('-- journal_entries')[0])
 # Mirror Supabase: table grants for API roles + the tasks RLS from 0002, plus a
 # permissive policy standing in for tasks_select_assignee (other people's rows
 # visible through RLS) so the RPCs must pin rows to auth.uid() themselves.
 sql("alter table public.tasks enable row level security; create policy tasks_select_own on public.tasks for select using (auth.uid() = user_id); create policy sim_assignee_visibility on public.tasks for select using (true); grant select on public.tasks to anon, authenticated;")
 sql((root/'supabase/migrations/20260925081959_meeting_imports.sql').read_text())
 sql("create table calendar_shares(id uuid default gen_random_uuid(),user_lo uuid,user_hi uuid,unique(user_lo,user_hi));")
 sql((root/'supabase/migrations/20260925083539_meeting_assignments.sql').read_text())
 sql(f"insert into auth.users values('{u}'),('{other}');insert into workspaces(id,user_id,name,color,icon) values('{ws}','{u}','Work','#aaa','x'),('{other_ws}','{other}','Other','#bbb','x');insert into categories(id,user_id,workspace_id,name) values('{cat}','{u}','{ws}','Inbox'),('{other_cat}','{other}','{other_ws}','Inbox');")
 sql(MIGRATION.read_text())
 sql(MIGRATION.read_text())  # create or replace: re-applying is harmless

 # ── 1. autoSelf creates follow-up tasks exactly like a manual save ──────────
 me=str(uuid.uuid4()); peer=str(uuid.uuid4())
 def auto_import(user, category, result, auto=True, title='Auto'):
  mid=str(uuid.uuid4())
  context={'autoSelf':auto,'categoryId':category,'participants':[{'id':me,'userId':user},{'id':peer}]}
  sql(f"select reserve_meeting_import_v2('{user}','{mid}',{q(title)},'2026-10-03',{q(TRANSCRIPT)},{q(json.dumps(context))}::jsonb);")
  sql(f"select finish_meeting_import_v2('{user}','{mid}',{q(json.dumps(result))}::jsonb,'{{}}');")
  return mid
 auto_result={'summary':'S','decisions':[],'questions':[],'tasks':[
  task('Mine explicit',owner='Me',ownerParticipantId=me,assignmentConfidence='explicit',ownerSide='ours',followUp=False),
  task('追 Bob：send the quote',owner='Bob',dueDate='2026-10-08',ownerParticipantId=peer,assignmentConfidence='explicit',ownerSide='theirs',followUp=True),
  task('Unknown owner',owner='',ownerParticipantId='',assignmentConfidence='uncertain',ownerSide='unknown',followUp=False),
  task('追 Amy：check budget',owner='Amy',ownerParticipantId='',assignmentConfidence='uncertain',ownerSide='theirs',followUp=True)]}
 m1=auto_import(u,cat,auto_result,title='Weekly sync')
 got=json.loads(sql(f"select imported_tasks from meeting_imports where id='{m1}'"))
 assert sorted(got)==['0','1','3'], got  # unknown owner stays a checklist item
 auto_desc=sql(f"select title||'#'||coalesce(due_date::text,'')||'#'||description from tasks where id='{got['1']}'")
 # Manual path for the same task (what the client sends on 儲存).
 m_manual=auto_import(u,cat,auto_result,auto=False,title='Weekly sync')
 sql(f"select route_meeting_tasks('{u}','{m_manual}','{cat}',{q(json.dumps([{'index':1,'title':'追 Bob：send the quote','owner':'Bob','dueDate':'2026-10-08','assigneeId':u}]))}::jsonb);")
 manual_id=json.loads(sql(f"select imported_tasks from meeting_imports where id='{m_manual}'"))['1']
 manual_desc=sql(f"select title||'#'||coalesce(due_date::text,'')||'#'||description from tasks where id='{manual_id}'")
 assert auto_desc==manual_desc, (auto_desc, manual_desc)
 assert '負責人（文字備註）：Bob' in auto_desc and auto_desc.startswith('追 Bob：send the quote#2026-10-08#會議：Weekly sync（2026-10-03）')
 assert sql(f"select count(*) from meeting_task_assignments")=='0'
 # Pressing 儲存 afterwards on the auto-created follow-up never duplicates it.
 before=sql('select count(*) from tasks')
 sql(f"select route_meeting_tasks('{u}','{m1}','{cat}',{q(json.dumps([{'index':1,'title':'追 Bob：send the quote','owner':'Bob','dueDate':'2026-10-08','assigneeId':u}]))}::jsonb);")
 assert sql('select count(*) from tasks')==before
 print('PASS 1: autoSelf creates follow-up tasks; title/due/description identical to manual save; uncertain tasks stay checklist; idempotent')

 # ── 2. get_task_meeting_source ──────────────────────────────────────────────
 src=as_user(u,f"select import_id,title,meeting_date from get_task_meeting_source('{got['1']}')")
 assert src==[f"{m1}|Weekly sync|2026-10-03"], src
 plain=str(uuid.uuid4())
 sql(f"insert into tasks(id,user_id,workspace_id,category_id,title) values('{plain}','{u}','{ws}','{cat}','Hand made');")
 assert as_user(u,f"select * from get_task_meeting_source('{plain}')")==[]
 assert as_user(u,f"select * from get_task_meeting_source('{uuid.uuid4()}')")==[]
 # Second user: cannot see the first user's source, even though RLS lets them see the task row.
 assert as_user(other,f"select count(*) from tasks where id='{got['1']}'")==['1']
 assert as_user(other,f"select * from get_task_meeting_source('{got['1']}')")==[]
 print('PASS 2: get_task_meeting_source returns the meeting for own imported tasks, 0 rows for hand-made/unknown/other user')

 # ── 3. list_meeting_followups ───────────────────────────────────────────────
 rows=as_user(u,"select task_id,title,due_date,is_completed,counterpart,import_id,meeting_title,meeting_date from list_meeting_followups()")
 ids=[r.split('|')[0] for r in rows]
 assert set(ids)=={got['1'],got['3'],manual_id}, rows
 assert ids[-1]==got['3'] and rows[-1].split('|')[2]=='' , rows  # no due date sorts last
 r1=[r for r in rows if r.startswith(got['1'])][0].split('|')
 assert r1[1:]==['追 Bob：send the quote','2026-10-08','f','Bob',m1,'Weekly sync','2026-10-03'], r1
 # Completed: hidden by default, shown with p_include_done; archived never shown.
 sql(f"update tasks set is_completed=true where id='{got['1']}'; update tasks set is_archived=true where id='{manual_id}';")
 assert [r.split('|')[0] for r in as_user(u,"select * from list_meeting_followups()")]==[got['3']]
 done=as_user(u,"select task_id,is_completed from list_meeting_followups(true)")
 assert done==[f"{got['1']}|t",f"{got['3']}|f"], done
 # Deleted task disappears.
 sql(f"delete from tasks where id='{got['3']}'")
 assert as_user(u,"select count(*) from list_meeting_followups(true)")==['1']
 # Ordering: earlier due first, then later, then none.
 order_result={'summary':'S','decisions':[],'questions':[],'tasks':[
  task('追 C：late',owner='C',dueDate='2026-12-01',followUp=True,ownerSide='theirs',assignmentConfidence='uncertain'),
  task('追 D：none',owner='D',followUp=True,ownerSide='theirs',assignmentConfidence='uncertain'),
  task('追 E：soon',owner='E',dueDate='2026-10-05',followUp=True,ownerSide='theirs',assignmentConfidence='uncertain')]}
 auto_import(u,cat,order_result,title='Order')
 titles=[r.split('|')[1] for r in as_user(u,"select task_id,title from list_meeting_followups()")]
 assert titles==['追 E：soon','追 C：late','追 D：none'], titles
 # Second user sees none of the first user's follow-ups; their own list is separate.
 assert as_user(other,"select count(*) from list_meeting_followups(true)")==['0']
 auto_import(other,other_cat,{'summary':'S','decisions':[],'questions':[],'tasks':[task('追 Zed：x',owner='Zed',followUp=True,ownerSide='theirs',assignmentConfidence='uncertain')]},title='Other mtg')
 assert [r.split('|')[1] for r in as_user(other,"select task_id,title from list_meeting_followups()")]==['追 Zed：x']
 assert '追 Zed：x' not in as_user(u,"select title from list_meeting_followups(true)")
 print('PASS 3: list_meeting_followups — own follow-ups only, include_done, archived/deleted excluded, due asc nulls last, counterpart/meeting fields')

 # ── 4. Old/malformed records never error ────────────────────────────────────
 legacy=str(uuid.uuid4()); t_side=str(uuid.uuid4()); t_none=str(uuid.uuid4()); t_bad=str(uuid.uuid4()); t_str=str(uuid.uuid4())
 for tid,ttl in [(t_side,'Legacy theirs'),(t_none,'Legacy plain'),(t_bad,'Bad followUp'),(t_str,'String followUp')]:
  sql(f"insert into tasks(id,user_id,workspace_id,category_id,title) values('{tid}','{u}','{ws}','{cat}',{q(ttl)});")
 legacy_result={'summary':'S','decisions':[],'questions':[],'tasks':[
  task('Legacy theirs',owner='Kim',ownerSide='theirs'), task('Legacy plain',owner='Lee'),
  task('Bad followUp',owner='X',followUp='yes'), task('String followUp',owner='Y',followUp='yes',ownerSide='theirs')]}
 imported={'0':t_side,'1':t_none,'2':t_bad,'3':t_str,'4':'not-a-uuid','x':str(uuid.uuid4()),'99':str(uuid.uuid4()),'5':12}
 sql(f"insert into meeting_imports(id,user_id,title,meeting_date,transcript,status,result,imported_tasks) values('{legacy}','{u}','Legacy','2026-09-01',{q(TRANSCRIPT)},'succeeded',{q(json.dumps(legacy_result))}::jsonb,{q(json.dumps(imported))}::jsonb);")
 # A record whose result has no tasks array at all.
 sql(f"insert into meeting_imports(id,user_id,title,meeting_date,transcript,status,result,imported_tasks) values('{uuid.uuid4()}','{u}','No tasks','2026-09-02',{q(TRANSCRIPT)},'succeeded','{{\"summary\":\"S\"}}'::jsonb,{q(json.dumps({'0':t_none}))}::jsonb);")
 legacy_titles=[r.split('|')[1] for r in as_user(u,"select task_id,title,counterpart from list_meeting_followups(true)") if 'Legacy' in r or 'followUp' in r]
 assert sorted(legacy_titles)==['Legacy theirs','String followUp'], legacy_titles
 assert as_user(u,f"select counterpart from list_meeting_followups(true) where task_id='{t_side}'")==['Kim']
 assert as_user(u,f"select title from get_task_meeting_source('{t_side}')")==['Legacy']
 assert as_user(u,f"select count(*) from get_task_meeting_source('{t_none}')")==['1']
 print('PASS 4: legacy (no followUp → ownerSide fallback), non-boolean followUp, invalid uuid/keys/out-of-range index, missing tasks array — no errors')

 # ── 5. Grants ───────────────────────────────────────────────────────────────
 assert 'permission denied' in sql("set role anon; select * from list_meeting_followups();",True)
 assert 'permission denied' in sql(f"set role anon; select * from get_task_meeting_source('{t_side}');",True)
 assert sql("select count(*) from pg_proc where proname in ('get_task_meeting_source','list_meeting_followups') and prosecdef")=='0'
 cfg=sql("select string_agg(proname||'='||array_to_string(proconfig,','),' ' order by proname) from pg_proc where proname in ('get_task_meeting_source','list_meeting_followups')")
 assert cfg=='get_task_meeting_source=search_path="" list_meeting_followups=search_path=""', cfg
 assert 'permission denied' in sql(f"set role authenticated; set request.jwt.claim.sub='{u}'; select finish_meeting_import_v2('{u}','{m1}',null,null);",True)
 print('PASS 5: anon denied on both RPCs; both SECURITY INVOKER with empty search_path; finish_meeting_import_v2 still service-role only')

 # ── 6. Rollback, then re-apply ──────────────────────────────────────────────
 sql(ROLLBACK.read_text())
 assert sql("select count(*) from pg_proc where proname in ('get_task_meeting_source','list_meeting_followups')")=='0'
 rb=auto_import(u,cat,auto_result,title='After rollback')
 assert sorted(json.loads(sql(f"select imported_tasks from meeting_imports where id='{rb}'"))) == ['0'], 'rollback restores explicit-only autoSelf'
 sql(MIGRATION.read_text())
 again=auto_import(u,cat,auto_result,title='Re-applied')
 assert sorted(json.loads(sql(f"select imported_tasks from meeting_imports where id='{again}'"))) == ['0','1','3']
 print('PASS 6: rollback drops both RPCs and restores explicit-only autoSelf; migration re-applies cleanly')
finally:
 subprocess.run([str(bin/'pg_ctl'),'-D',str(path/'data'),'stop','-m','immediate'],capture_output=True)
 tmp.cleanup()
