-- Run in a freshly created disposable database.
\ir check-in-points.sql
\ir ../../supabase/migrations/20260925120000_check_in_leaderboard.sql
insert into auth.users select ('10000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid from generate_series(1,55) i;
insert into public.points_accounts(user_id,total_points)
select id, 100 from auth.users where id::text like '10000000%';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ declare own record; begin
 if (select count(*) from public.get_check_in_leaderboard()) <> 51 then raise exception 'own row missing outside top 50'; end if;
 if (select count(*) from public.get_check_in_leaderboard() where in_top_50 and rank_position=1) <> 50 then raise exception 'ties or limit wrong'; end if;
 select * into own from public.get_check_in_leaderboard() where is_current_user;
 if own.rank_position <> 56 or own.total_points <> 1 or own.in_top_50 then raise exception 'own rank wrong'; end if;
 if exists(select from public.get_check_in_leaderboard() where penguin_alias !~ '^[a-f0-9]{12}$') then raise exception 'unexpected identity'; end if;
 if (select count(*) from public.points_accounts) <> 1 then raise exception 'RLS bypassed by caller'; end if;
end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ declare own record; begin
 select * into own from public.get_check_in_leaderboard() where is_current_user;
 if own.rank_position is not null or own.total_points <> 0 or own.in_top_50 then raise exception 'zero score rank wrong'; end if;
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
do $$ begin
 if (select count(*) from public.get_check_in_leaderboard()) <> 50 then raise exception 'duplicate own row'; end if;
 if (select count(*) from public.get_check_in_leaderboard() where is_current_user) <> 1 then raise exception 'own identity wrong'; end if;
end $$;
set request.jwt.claim.sub='';
do $$ begin
 begin perform public.get_check_in_leaderboard(); raise exception 'missing auth guard'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.get_check_in_leaderboard()','execute') then raise exception 'anon access'; end if;
end $$;
select 'PASS: tied rankings, top 50, own rank outside top 50, zero scores, anonymous aliases, RLS, auth guard' as result;
