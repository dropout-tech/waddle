-- Runs against a fresh database with every migration applied (see .sh).
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
create function public.t_ok(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'FAILED: %',msg; end if; raise notice 'PASS: %',msg; end $$;
create function public.t_err(stmt text, fragment text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if position(fragment in sqlerrm)>0 then raise notice 'PASS: %',msg; return; end if;
    raise exception 'FAILED: % (unexpected error: %)',msg,sqlerrm;
  end;
  raise exception 'FAILED: % (no error raised)',msg;
end $$;
grant execute on function public.t_ok(boolean,text), public.t_err(text,text,text) to anon, authenticated, service_role;
-- Emulate Supabase's project default privileges on profiles (RLS still applies).
grant select, update on public.profiles to authenticated;

-- A = administrator, B = will be suspended, C = has a Google real name, D = zero score.
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-00000000000a','lazy@dreamcube.tw','{}'),
 ('00000000-0000-4000-8000-00000000000b','suspended@example.invalid','{}'),
 ('00000000-0000-4000-8000-00000000000c','real.person@example.invalid','{"full_name":"王小明 Real Name"}'),
 ('00000000-0000-4000-8000-00000000000d','fresh@example.invalid','{}');
insert into public.points_accounts(user_id,total_points) values
 ('00000000-0000-4000-8000-00000000000a',5),
 ('00000000-0000-4000-8000-00000000000b',4),
 ('00000000-0000-4000-8000-00000000000c',3);

select public.t_ok((select display_name from public.profiles where id='00000000-0000-4000-8000-00000000000c')='王小明 Real Name',
  'fixture: C has a real display_name that must never be published');

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000c';

-- Default: no nickname -> short anonymous code, not the display name.
select public.t_ok((select leaderboard_nickname is null from public.profiles where id=auth.uid()),'nickname defaults to empty (opt-in)');
select public.t_ok((select bool_and(leaderboard_name ~ '^小企鵝 #[a-f0-9]{4}$' and not has_nickname) from public.get_check_in_leaderboard()),
  'no nickname: every row shows 小企鵝 #xxxx code');
select public.t_ok((select leaderboard_name = '小企鵝 #' || left(penguin_alias,4) from public.get_check_in_leaderboard() where is_current_user),
  'anonymous code is the first 4 chars of the existing alias');

-- Output shape: only these seven columns, none of which is an identity field.
select public.t_ok(pg_get_function_result('public.get_check_in_leaderboard()'::regprocedure)
    = 'TABLE(rank_position bigint, penguin_alias text, total_points bigint, is_current_user boolean, in_top_50 boolean, leaderboard_name text, has_nickname boolean)',
  'leaderboard returns only rank/alias/points/flags/leaderboard_name (no display_name, email, user_id)');
select public.t_ok(not exists(select 1 from public.get_check_in_leaderboard() r
    where r::text ilike '%Real Name%' or r::text like '%王小明%' or r::text like '%@%' or r::text like '%00000000-0000-4000%'),
  'no row leaks display_name, email or user_id text');

-- Validation (RPC).
select public.t_err($$select public.set_leaderboard_nickname('   ')$$,'NICKNAME_BLANK','whitespace-only nickname rejected');
select public.t_err($$select public.set_leaderboard_nickname('　　')$$,'NICKNAME_BLANK','full-width-space-only nickname rejected');
select public.t_err($$select public.set_leaderboard_nickname('')$$,'NICKNAME_BLANK','empty string rejected');
select public.t_err($$select public.set_leaderboard_nickname('一二三四五六七八九十一二三四五六七')$$,'NICKNAME_TOO_LONG','17-character nickname rejected');
select public.t_err(format('select public.set_leaderboard_nickname(%L)', 'ab'||chr(10)||'cd'),'NICKNAME_INVALID','control characters rejected');
select public.t_ok(public.set_leaderboard_nickname('  一二三四五六七八九十一二三四五六  ')='一二三四五六七八九十一二三四五六','16 characters accepted and trimmed');
select public.t_ok(public.set_leaderboard_nickname(' 冰上小飛俠 ')='冰上小飛俠','nickname saved trimmed');

-- Validation (direct table write through PostgREST is guarded by the CHECK too).
select public.t_err($$update public.profiles set leaderboard_nickname=' 前後空白 ' where id=auth.uid()$$,'profiles_leaderboard_nickname_check','direct write of untrimmed nickname rejected by CHECK');
select public.t_err($$update public.profiles set leaderboard_nickname='' where id=auth.uid()$$,'profiles_leaderboard_nickname_check','direct write of empty nickname rejected by CHECK');
select public.t_err($$update public.profiles set leaderboard_nickname=repeat('字',17) where id=auth.uid()$$,'profiles_leaderboard_nickname_check','direct write of 17 chars rejected by CHECK');

-- With nickname: shown as-is; others stay anonymous.
select public.t_ok((select leaderboard_name='冰上小飛俠' and has_nickname from public.get_check_in_leaderboard() where is_current_user),'own row shows chosen nickname');
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000a';
select public.t_ok((select leaderboard_name='冰上小飛俠' and has_nickname and total_points=3 from public.get_check_in_leaderboard() where penguin_alias=left(md5('00000000-0000-4000-8000-00000000000c'),12)),
  'other members see the nickname, never the real name');
select public.t_ok((select leaderboard_name ~ '^小企鵝 #[a-f0-9]{4}$' from public.get_check_in_leaderboard() where is_current_user),'member without nickname still anonymous');

-- Nobody can change someone else's nickname.
update public.profiles set leaderboard_nickname='被竄改' where id='00000000-0000-4000-8000-00000000000c';
select public.t_ok(not exists(select 1 from public.profiles where id='00000000-0000-4000-8000-00000000000c'),'RLS hides other profiles from A');
reset role;
select public.t_ok((select leaderboard_nickname from public.profiles where id='00000000-0000-4000-8000-00000000000c')='冰上小飛俠','A cannot overwrite C''s nickname (RLS update own)');
select public.t_ok(not exists(select 1 from pg_proc where proname='set_leaderboard_nickname' and pronargs>1),'set_leaderboard_nickname has no target-user parameter');

-- Clearing returns to the anonymous code.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000c';
select public.t_ok(public.set_leaderboard_nickname(null) is null,'null clears the nickname');
select public.t_ok((select leaderboard_name ~ '^小企鵝 #[a-f0-9]{4}$' and not has_nickname from public.get_check_in_leaderboard() where is_current_user),'cleared nickname falls back to code');
select public.set_leaderboard_nickname('冰上小飛俠') \gset q_

-- Anonymous callers are rejected (no grant, and the auth guard behind it).
reset role;
select public.t_ok(not has_function_privilege('anon','public.get_check_in_leaderboard()','execute'),'anon has no execute on leaderboard');
select public.t_ok(not has_function_privilege('anon','public.set_leaderboard_nickname(text)','execute'),'anon has no execute on set nickname');
set role anon;
select public.t_err($$select * from public.get_check_in_leaderboard()$$,'permission denied','anon call to leaderboard denied');
select public.t_err($$select public.set_leaderboard_nickname('x')$$,'permission denied','anon call to set nickname denied');
reset role;
set role authenticated;
set request.jwt.claim.sub='';
select public.t_err($$select * from public.get_check_in_leaderboard()$$,'Authentication required','authenticated role without a user id rejected');
select public.t_err($$select public.set_leaderboard_nickname('x')$$,'Authentication required','set nickname without a user id rejected');
reset role;
select public.t_ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.get_check_in_leaderboard()'::regprocedure),
  'leaderboard stays security definer with empty search_path');

-- Suspended accounts are rejected.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000b';
select public.t_ok(public.set_leaderboard_nickname('停用前')='停用前','active B can set a nickname');
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000a';
select public.huddle_operations('admin_suspend','{"user_id":"00000000-0000-4000-8000-00000000000b","suspended":true,"reason":"停用測試"}') \gset q_
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000b';
select public.t_err($$select * from public.get_check_in_leaderboard()$$,'帳號已停用','suspended: leaderboard rejected');
select public.t_err($$select public.set_leaderboard_nickname('停用後')$$,'帳號已停用','suspended: set nickname rejected');
with u as (update public.profiles set leaderboard_nickname='停用後' where id=auth.uid() returning 1)
select public.t_ok(not exists(select 1 from u),'suspended: direct profile write affects no rows');
reset role;
select public.t_ok((select leaderboard_nickname from public.profiles where id='00000000-0000-4000-8000-00000000000b')='停用前','suspended nickname unchanged');
