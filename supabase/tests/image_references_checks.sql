-- notebook_image_references() checks.
--
-- DISPOSABLE DATABASE ONLY (inserts fake auth.users rows). Run with:
--   bash scripts/tests/image-references.sh
-- which boots a throwaway local cluster, applies EVERY migration in order and
-- then runs this file. Any failed expectation aborts with "FAILED: ...".
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create or replace function public.t_ok(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'FAILED: %',msg; end if; raise notice 'PASS: %',msg; end $$;
grant execute on function public.t_ok(boolean,text) to authenticated;

-- A owns the images; B is another user whose rows embed some of them.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000000a1','a@test'),
 ('00000000-0000-4000-8000-0000000000b1','b@test');
insert into public.workspaces(id,user_id,name,color,icon) values
 ('10000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000b1','B','#000','x');
insert into public.categories(id,workspace_id,user_id,name) values
 ('20000000-0000-4000-8000-0000000000b1','10000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000b1','B');

-- K1: A's own archived notebook note (Tiptap JSON image node).
insert into public.notebook_notes(user_id,title,is_archived,content) values
 ('00000000-0000-4000-8000-0000000000a1','n',true,
  '{"type":"doc","content":[{"type":"image","attrs":{"src":"https://x.supabase.co/storage/v1/object/public/notebook-images/00000000-0000-4000-8000-0000000000a1/11111111-1111-4111-8111-111111111111.png"}}]}');
-- K2: B's task notes (markdown) embed A's image.
insert into public.tasks(user_id,workspace_id,category_id,title,notes) values
 ('00000000-0000-4000-8000-0000000000b1','10000000-0000-4000-8000-0000000000b1','20000000-0000-4000-8000-0000000000b1','t',
  '![x](https://x.supabase.co/storage/v1/object/public/notebook-images/00000000-0000-4000-8000-0000000000a1/22222222-2222-4222-8222-222222222222.jpg)');
-- K3: B's sticky note; K4: a whiteboard card's metadata document.
insert into public.sticky_notes(user_id,content) values
 ('00000000-0000-4000-8000-0000000000b1',
  '{"type":"doc","content":[{"type":"image","attrs":{"src":"https://x/notebook-images/00000000-0000-4000-8000-0000000000a1/33333333-3333-4333-8333-333333333333.webp"}}]}');
insert into public.scratchpad_items(user_id,date,type,content,metadata) values
 ('00000000-0000-4000-8000-0000000000a1',current_date,'text','',
  '{"document":{"type":"doc","content":[{"type":"image","attrs":{"src":"https://x/notebook-images/00000000-0000-4000-8000-0000000000a1/44444444-4444-4444-8444-444444444444.fi%20le"}}]}}');
-- An image in B's own folder, referenced by B's task (must not leak into A's answer).
update public.tasks set description =
 'https://x/notebook-images/00000000-0000-4000-8000-0000000000b1/66666666-6666-4666-8666-666666666666.png'
 where user_id = '00000000-0000-4000-8000-0000000000b1';

create temp table r as select public.notebook_image_references(
  '00000000-0000-4000-8000-0000000000a1',
  array[
    '00000000-0000-4000-8000-0000000000a1/11111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-0000000000a1/22222222-2222-4222-8222-222222222222',
    '00000000-0000-4000-8000-0000000000a1/33333333-3333-4333-8333-333333333333',
    '00000000-0000-4000-8000-0000000000a1/44444444-4444-4444-8444-444444444444',
    '00000000-0000-4000-8000-0000000000a1/55555555-5555-4555-8555-555555555555',
    '00000000-0000-4000-8000-0000000000b1/66666666-6666-4666-8666-666666666666'
  ]) as found;

select public.t_ok((select '00000000-0000-4000-8000-0000000000a1/11111111-1111-4111-8111-111111111111' = any(found) from r), 'archived own note keeps its image');
select public.t_ok((select '00000000-0000-4000-8000-0000000000a1/22222222-2222-4222-8222-222222222222' = any(found) from r), 'another user''s task keeps the image');
select public.t_ok((select '00000000-0000-4000-8000-0000000000a1/33333333-3333-4333-8333-333333333333' = any(found) from r), 'another user''s sticky note keeps the image');
select public.t_ok((select '00000000-0000-4000-8000-0000000000a1/44444444-4444-4444-8444-444444444444' = any(found) from r), 'whiteboard metadata (odd extension) keeps the image');
select public.t_ok((select not ('00000000-0000-4000-8000-0000000000a1/55555555-5555-4555-8555-555555555555' = any(found)) from r), 'unreferenced image is reported as unreferenced');
select public.t_ok((select not ('00000000-0000-4000-8000-0000000000b1/66666666-6666-4666-8666-666666666666' = any(found)) from r), 'keys outside the owner folder are ignored');
select public.t_ok((select cardinality(found) = 4 from r), 'exactly the four referenced keys are returned');

select public.t_ok(not has_function_privilege('authenticated','public.notebook_image_references(uuid,text[])','execute'), 'authenticated cannot call it');
select public.t_ok(not has_function_privilege('anon','public.notebook_image_references(uuid,text[])','execute'), 'anon cannot call it');
select public.t_ok(has_function_privilege('service_role','public.notebook_image_references(uuid,text[])','execute'), 'service_role can call it');

-- claim_image_cleanup_run(): cleanup-images rate limit (20261003010000).
select public.t_ok(public.claim_image_cleanup_run('00000000-0000-4000-8000-0000000000a1', 600), 'first claim for an account wins');
select public.t_ok(not public.claim_image_cleanup_run('00000000-0000-4000-8000-0000000000a1', 600), 'second claim inside the interval is refused');
select public.t_ok(not public.claim_image_cleanup_run('00000000-0000-4000-8000-0000000000a1', 600), 'repeated claims stay refused');
select public.t_ok(public.claim_image_cleanup_run('00000000-0000-4000-8000-0000000000b1', 600), 'another account has its own slot');
update huddle_ops.image_cleanup_runs set last_run_at = clock_timestamp() - interval '601 seconds'
 where user_id = '00000000-0000-4000-8000-0000000000a1';
select public.t_ok(public.claim_image_cleanup_run('00000000-0000-4000-8000-0000000000a1', 600), 'claim wins again once the interval has passed');
select public.t_ok(not public.claim_image_cleanup_run('00000000-0000-4000-8000-0000000000a1', 600), 'and the slot is taken again right after');
select public.t_ok((select count(*) = 2 from huddle_ops.image_cleanup_runs), 'one row per account');
do $$ begin
  perform public.claim_image_cleanup_run(null, 600);
  raise exception 'FAILED: null user must be rejected';
exception when others then
  if sqlerrm like 'FAILED:%' then raise; end if;
  raise notice 'PASS: null user is rejected';
end $$;
select public.t_ok(not has_function_privilege('authenticated','public.claim_image_cleanup_run(uuid,integer)','execute'), 'authenticated cannot claim');
select public.t_ok(not has_function_privilege('anon','public.claim_image_cleanup_run(uuid,integer)','execute'), 'anon cannot claim');
select public.t_ok(has_function_privilege('service_role','public.claim_image_cleanup_run(uuid,integer)','execute'), 'service_role can claim');
select public.t_ok(not has_table_privilege('authenticated','huddle_ops.image_cleanup_runs','select'), 'authenticated cannot read run times');
delete from auth.users where id = '00000000-0000-4000-8000-0000000000b1';
select public.t_ok((select count(*) = 1 from huddle_ops.image_cleanup_runs), 'run row disappears with the account');
