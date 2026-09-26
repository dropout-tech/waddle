-- Runs after every migration (see leaderboard-serial.sh for the seeding order).
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

-- Backfill: 1..N in sign-up order (A 1/1, B 2/1, C 3/1, D 4/1).
select public.t_ok((select array_agg(penguin_number order by penguin_number) from public.profiles)=array[1,2,3,4]::bigint[],'backfill is contiguous 1..N');
select public.t_ok((select array_agg(right(id::text,1) order by penguin_number) from public.profiles)=array['a','b','c','d'],'backfill follows auth.users.created_at, not insert order');
select public.t_ok((select attnotnull from pg_attribute where attrelid='public.profiles'::regclass and attname='penguin_number'),'penguin_number is NOT NULL');
select public.t_ok(exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_penguin_number_key' and contype='u'),'penguin_number is UNIQUE');

-- New sign-ups get the next number through the normal auth trigger.
insert into auth.users(id,email) values ('00000000-0000-4000-8000-00000000000e','new@example.invalid');
select public.t_ok((select penguin_number from public.profiles where id='00000000-0000-4000-8000-00000000000e')=5,'new sign-up gets the next number (5)');
-- Deleting a member never frees their number.
delete from auth.users where id='00000000-0000-4000-8000-00000000000e';
insert into auth.users(id,email) values ('00000000-0000-4000-8000-00000000000f','newer@example.invalid');
select public.t_ok((select penguin_number from public.profiles where id='00000000-0000-4000-8000-00000000000f')=6,'numbers are never reused after deletion');
delete from public.profiles where id='00000000-0000-4000-8000-00000000000f';
insert into public.profiles(id,penguin_number) values ('00000000-0000-4000-8000-00000000000f',1);
select public.t_ok((select penguin_number from public.profiles where id='00000000-0000-4000-8000-00000000000f')=7,'an insert cannot choose its number (server assigns next, 7)');
select public.t_ok((select count(distinct penguin_number)=count(*) from public.profiles),'all numbers unique after churn');

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000c';

-- Members cannot change their own number.
select public.t_err($$update public.profiles set penguin_number=99 where id=auth.uid()$$,'PENGUIN_NUMBER_IMMUTABLE','member cannot change own number');
select public.t_ok((select penguin_number from public.profiles where id=auth.uid())=3,'number unchanged after attempt');

-- Output shape and content.
select public.t_ok(pg_get_function_result('public.get_check_in_leaderboard()'::regprocedure)
    = 'TABLE(rank_position bigint, penguin_alias text, total_points bigint, is_current_user boolean, in_top_50 boolean, leaderboard_name text, has_nickname boolean, penguin_number bigint)',
  'leaderboard returns only rank/alias/points/flags/serial (no display_name, email, user_id)');
select public.t_ok((select bool_and(leaderboard_name = '小企鵝 ' || penguin_number and has_nickname) from public.get_check_in_leaderboard()),
  'every row is 小企鵝 N (legacy name column matches the serial)');
select public.t_ok((select penguin_number=3 and is_current_user from public.get_check_in_leaderboard() where is_current_user),'own row carries own number');
select public.t_ok((select array_agg(penguin_number order by rank_position) from public.get_check_in_leaderboard() where in_top_50)=array[1,2,3]::bigint[],'ranked rows carry their members'' numbers');
select public.t_ok(not exists(select 1 from public.get_check_in_leaderboard() r
    where r::text ilike '%Real Name%' or r::text like '%王小明%' or r::text like '%舊暱稱%' or r::text like '%@%' or r::text like '%00000000-0000-4000%'),
  'no row leaks display_name, old nickname, email or user_id');

-- Nicknames can no longer be set.
select public.t_err($$select public.set_leaderboard_nickname('新暱稱')$$,'permission denied','authenticated cannot call set_leaderboard_nickname');
reset role;
select public.t_ok(not has_function_privilege('authenticated','public.set_leaderboard_nickname(text)','execute'),'no execute grant on set_leaderboard_nickname');

-- Anonymous callers are rejected.
select public.t_ok(not has_function_privilege('anon','public.get_check_in_leaderboard()','execute'),'anon has no execute on leaderboard');
set role anon;
select public.t_err($$select * from public.get_check_in_leaderboard()$$,'permission denied','anon call to leaderboard denied');
reset role;
set role authenticated;
set request.jwt.claim.sub='';
select public.t_err($$select * from public.get_check_in_leaderboard()$$,'Authentication required','authenticated role without a user id rejected');
reset role;
select public.t_ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.get_check_in_leaderboard()'::regprocedure),
  'leaderboard stays security definer with empty search_path');

-- Suspended accounts are rejected.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000a';
select public.huddle_operations('admin_suspend','{"user_id":"00000000-0000-4000-8000-00000000000b","suspended":true,"reason":"停用測試"}') \gset q_
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000b';
select public.t_err($$select * from public.get_check_in_leaderboard()$$,'帳號已停用','suspended: leaderboard rejected');
reset role;
