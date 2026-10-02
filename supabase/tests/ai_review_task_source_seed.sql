-- Pre-migration fixtures for the tasks.source backfill. DISPOSABLE DATABASE
-- ONLY. Runs after supabase/migrations/ and BEFORE supabase/migrations-draft/,
-- i.e. against today's schema (no source column yet).
\set ON_ERROR_STOP on
\set QUIET on
-- P = meeting owner / sender, Q = recipient
\set P '00000000-0000-4000-8000-0000000000a7'
\set Q '00000000-0000-4000-8000-0000000000a8'
insert into auth.users(id,email,is_anonymous) values (:'P','p@example.invalid',false),(:'Q','q@example.invalid',false);
insert into public.workspaces(id,user_id,name,color,icon) values
 ('10000000-0000-4000-8000-0000000000a7',:'P','P ws','#aaa','x'),
 ('10000000-0000-4000-8000-0000000000a8',:'Q','Q ws','#aaa','x');
insert into public.categories(id,workspace_id,user_id,name) values
 ('20000000-0000-4000-8000-0000000000a7','10000000-0000-4000-8000-0000000000a7',:'P','P cat'),
 ('20000000-0000-4000-8000-0000000000a8','10000000-0000-4000-8000-0000000000a8',:'Q','Q cat');
-- Q's tasks: self / own import / accepted assignment / orphaned assignment text
insert into public.tasks(id,user_id,workspace_id,category_id,title,description,updated_at) values
 ('30000000-0000-4000-8000-000000000001',:'Q','10000000-0000-4000-8000-0000000000a8','20000000-0000-4000-8000-0000000000a8','self task','plain',now()),
 ('30000000-0000-4000-8000-000000000002',:'Q','10000000-0000-4000-8000-0000000000a8','20000000-0000-4000-8000-0000000000a8','imported','會議：週會（2026-09-01）'||E'\n來源原文：逐字稿片段',now()),
 ('30000000-0000-4000-8000-000000000003',:'Q','10000000-0000-4000-8000-0000000000a8','20000000-0000-4000-8000-0000000000a8','accepted','指派人：P'||E'\n會議：週會（2026-09-01）',now()),
 ('30000000-0000-4000-8000-000000000004',:'Q','10000000-0000-4000-8000-0000000000a8','20000000-0000-4000-8000-0000000000a8','orphan','指派人：P（連結列已消失）',now());
-- Freeze updated_at so the backfill can be shown not to move it.
alter table public.tasks disable trigger trg_tasks_updated;
update public.tasks set updated_at = '2026-01-01T00:00:00Z' where user_id = :'Q';
alter table public.tasks enable trigger trg_tasks_updated;
-- Q's own import maps index 0 to task 2 (plus one malformed value that must not break the backfill).
insert into public.meeting_imports(id,user_id,title,meeting_date,transcript,status,result,imported_tasks,finished_at) values
 ('40000000-0000-4000-8000-0000000000a8',:'Q','Q meeting','2026-09-01','這是一段夠長的會議逐字稿內容，用來測試。','succeeded',
  '{"summary":"s","decisions":[],"questions":[],"tasks":[{"title":"t","owner":"","dueDate":"","source":"逐字稿片段"}]}',
  '{"0":"30000000-0000-4000-8000-000000000002","1":"not-a-uuid"}',now()),
 ('40000000-0000-4000-8000-0000000000a7',:'P','P meeting','2026-09-01','這是一段夠長的會議逐字稿內容，用來測試。','succeeded',
  '{"summary":"s","decisions":[],"questions":[],"tasks":[{"title":"a","owner":"","dueDate":"","source":"原文一"},{"title":"b","owner":"","dueDate":"","source":"原文二"},{"title":"c","owner":"","dueDate":"","source":"原文三"}]}',
  '{}',now());
insert into public.meeting_task_assignments(meeting_id,source_index,sender_id,recipient_id,sender_name,title,source,meeting_title,meeting_date,status,task_id,responded_at) values
 ('40000000-0000-4000-8000-0000000000a7',0,:'P',:'Q','P','accepted','原文一','P meeting','2026-09-01','accepted','30000000-0000-4000-8000-000000000003',now());
