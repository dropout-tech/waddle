-- Run only against a disposable local PostgreSQL database.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
\ir ../../supabase/migrations/20260925090000_daily_check_ins.sql
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.daily_check_ins(user_id,check_in_date) values(auth.uid(),'2026-09-25') on conflict(user_id,check_in_date) do nothing;
insert into public.daily_check_ins(user_id,check_in_date) values(auth.uid(),'2026-09-25') on conflict(user_id,check_in_date) do nothing;
do $$ begin
 if (select count(*) from public.daily_check_ins) <> 1 then raise exception 'duplicate check-in'; end if;
 begin
  insert into public.daily_check_ins(user_id,check_in_date) values('00000000-0000-0000-0000-000000000002','2026-09-25');
  raise exception 'cross-account insert allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
 if (select count(*) from public.daily_check_ins) <> 0 then raise exception 'cross-account read allowed'; end if;
end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.daily_check_ins','select') then raise exception 'anonymous access'; end if;
 if has_table_privilege('authenticated','public.daily_check_ins','update') then raise exception 'unexpected update privilege'; end if;
end $$;
select 'PASS: unique day, account isolation, anonymous denial, insert/select only' as result;
