\set ON_ERROR_STOP on
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key, created_at timestamptz default now(),email_confirmed_at timestamptz default now(),is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
insert into auth.users(id) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,9)n;
\ir ../../supabase/migrations/20260920182230_referral_foundation.sql
insert into public.referral_codes(user_id,code) values('00000000-0000-4000-8000-000000000001','HUD-OWNER');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
select public.get_my_referral();
do $$begin
 begin perform public.redeem_referral('HUD-OWNER'); raise exception 'disabled accepted'; exception when others then if sqlerrm<>'campaign_unavailable' then raise; end if; end;
 if has_table_privilege(current_user,'public.referral_rewards','UPDATE') then raise exception 'writable'; end if;
 if has_table_privilege(current_user,'public.referrals','SELECT') then raise exception 'read leaked'; end if;
end$$;
reset role;
update public.referral_campaigns set enabled=true, starts_at=now()-interval '1 hour',ends_at=now()+interval '90 days';
set role authenticated;
select public.redeem_referral(' hud-owner ');
select public.redeem_referral('HUD-OWNER');
reset role;
do $$begin if (select count(*) from public.referral_rewards)<>2 then raise exception 'idempotency failed'; end if; end$$;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
do $$begin
 begin perform public.redeem_referral('HUD-OWNER'); raise exception 'self accepted'; exception when others then if sqlerrm<>'invalid_referral_code' then raise; end if; end;
end$$;
reset role;
update public.referral_codes set code='HUD-CHILD' where user_id='00000000-0000-4000-8000-000000000002';
set role authenticated;
do $$begin
 begin perform public.redeem_referral('HUD-CHILD'); raise exception 'cycle accepted'; exception when others then if sqlerrm<>'referral_cycle' then raise; end if; end;
end$$;
reset role;
update auth.users set email_confirmed_at=null where id='00000000-0000-4000-8000-000000000009';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000009';
do $$begin
 begin perform public.redeem_referral('HUD-OWNER'); raise exception 'unverified accepted'; exception when insufficient_privilege then null; end;
end$$;
reset role;
do $$declare n int; begin
 for n in 3..5 loop perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-'||lpad(n::text,12,'0'),true); perform public.redeem_referral('HUD-OWNER'); end loop;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
 begin perform public.redeem_referral('HUD-OWNER'); raise exception 'cap ignored'; exception when others then if sqlerrm<>'referral_limit_reached' then raise; end if; end;
 if (select count(*) from public.referral_rewards)<>8 then raise exception 'reward count'; end if;
 if exists(select 1 from public.referral_rewards where status<>'pending_store_redemption') then raise exception 'fake grant'; end if;
 if has_function_privilege('anon','public.redeem_referral(text)','EXECUTE') then raise exception 'anon permission'; end if;
end$$;
update auth.users set created_at=now()-interval '15 days' where id='00000000-0000-4000-8000-000000000007';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000007';
do $$begin
 begin perform public.redeem_referral('HUD-CHILD'); raise exception 'old accepted'; exception when others then if sqlerrm<>'new_account_required' then raise; end if; end;
end$$;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
do $$begin
 begin perform public.redeem_referral('nonexistent'); raise exception 'bad code'; exception when others then if sqlerrm<>'invalid_referral_code' then raise; end if; end;
end$$;
reset role;
update public.referral_campaigns set ends_at=now()-interval '1 second';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000008';
do $$begin
 begin perform public.redeem_referral('HUD-CHILD'); raise exception 'expired accepted'; exception when others then if sqlerrm<>'campaign_unavailable' then raise; end if; end;
end$$;
