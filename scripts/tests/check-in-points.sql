-- Disposable PostgreSQL database ONLY. Roles may already exist from earlier tests.
\set ON_ERROR_STOP on
do $$ begin
 if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
insert into auth.users values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-000000000004');
\ir ../../supabase/migrations/20260925090000_daily_check_ins.sql
-- Older check-ins remain history, not automatically awarded points.
insert into public.daily_check_ins(user_id,check_in_date) values('00000000-0000-0000-0000-000000000001','2020-01-01');
\ir ../../supabase/migrations/20260925100000_check_in_points.sql
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ declare s record; begin
 select * into s from public.get_daily_check_in_status();
 if s.available_points <> 0 or s.checked_in then raise exception 'history awarded points'; end if;
 select * into s from public.claim_daily_check_in();
 if s.available_points <> 1 or s.ranking_points <> 1 or not s.checked_in then raise exception 'incorrect first reward'; end if;
 if s.check_in_date <> (statement_timestamp() at time zone 'Asia/Taipei')::date then raise exception 'wrong server day'; end if;
 perform public.claim_daily_check_in();
 if (select count(*) from public.points_ledger) <> 1 then raise exception 'duplicate reward'; end if;
 begin
  insert into public.daily_check_ins(user_id,check_in_date) values(auth.uid(),'2099-01-01');
  raise exception 'client can forge day';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.points_ledger(user_id,kind,source_key,points_delta,description) values(auth.uid(),'adjustment','forged',999,'forged');
  raise exception 'client can forge points';
 exception when insufficient_privilege then null; end;
 begin
  update public.points_accounts set available_points=999;
  raise exception 'client can update balance';
 exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin
 if (select count(*) from public.points_ledger) <> 0 or (select count(*) from public.points_accounts) <> 0 then raise exception 'cross-account read'; end if;
end $$;
reset role;
-- Simulated future trusted service inserts exercise balance/ranking invariants.
set role service_role;
insert into public.points_ledger(user_id,kind,source_key,points_delta,ranking_delta,description)
 values('00000000-0000-0000-0000-000000000001','adjustment','test-bonus',4,4,'test award'),
 ('00000000-0000-0000-0000-000000000001','redemption','test-order',-2,0,'test redemption');
do $$ begin
 if not exists(select from public.points_accounts where available_points=3 and ranking_points=5) then raise exception 'redemption changed rank'; end if;
 begin
  insert into public.points_ledger(user_id,kind,source_key,points_delta,description)
   values('00000000-0000-0000-0000-000000000001','redemption','overdraft',-99,'must fail');
  raise exception 'overdraft accepted';
 exception when check_violation then null; end;
 begin
  delete from public.points_ledger;
  raise exception 'ledger mutable';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.points_ledger(user_id,kind,source_key,points_delta,description)
   values('00000000-0000-0000-0000-000000000001','refund','test-order',2,'duplicate key');
  raise exception 'duplicate source accepted';
 exception when unique_violation then null; end;
end $$;
reset role;
-- A ledger failure must roll back the check-in itself.
create function public.test_fail_award() returns trigger language plpgsql as $$ begin
 if new.user_id='00000000-0000-0000-0000-000000000003' then raise exception 'injected failure' using errcode='23514'; end if;
 return new;
end $$;
create trigger test_fail_award before insert on public.points_ledger for each row execute function public.test_fail_award();
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ begin
 begin perform public.claim_daily_check_in(); raise exception 'injected failure missing'; exception when check_violation then null; end;
 if exists(select from public.daily_check_ins) or exists(select from public.points_ledger) or exists(select from public.points_accounts) then raise exception 'partial transaction committed'; end if;
end $$;
reset role;
drop trigger test_fail_award on public.points_ledger;
drop function public.test_fail_award();
do $$ begin
 if has_function_privilege('anon','public.claim_daily_check_in()','execute') then raise exception 'anonymous claim'; end if;
 if has_function_privilege('authenticated','public.apply_points_ledger_entry()','execute') then raise exception 'trigger publicly callable'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub='';
do $$ begin
 begin perform public.claim_daily_check_in(); raise exception 'null identity accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: rewards, history, duplicate, RLS, server date, redemption, overdraft, immutable ledger, atomic rollback, privileges' as result;
