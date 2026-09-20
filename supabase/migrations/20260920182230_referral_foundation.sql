-- Disabled until official store offers and published campaign dates are configured.
create schema if not exists referral_private;
revoke all on schema referral_private from public;
grant usage on schema referral_private to authenticated;
create table public.referral_campaigns (
 id text primary key, enabled boolean not null default false,
 starts_at timestamptz, ends_at timestamptz,
 reward_months integer not null default 3 check(reward_months=3),
 max_referrals integer not null default 4 check(max_referrals between 1 and 4),
 check(not enabled or (starts_at is not null and ends_at > starts_at))
);
insert into public.referral_campaigns(id) values ('launch');
create table public.referral_codes (
 user_id uuid primary key references auth.users(id) on delete cascade,
 code text unique not null default ('HUD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)))
);
create table public.referrals (
 id uuid primary key default gen_random_uuid(), campaign_id text not null references public.referral_campaigns,
 referrer_id uuid not null references auth.users(id) on delete cascade,
 invitee_id uuid not null unique references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), check(referrer_id<>invitee_id)
);
create table public.referral_rewards (
 id uuid primary key default gen_random_uuid(), referral_id uuid not null references public.referrals on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 months integer not null check(months=3), status text not null default 'pending_store_redemption' check(status in ('pending_store_redemption','redeemed','revoked')),
 created_at timestamptz not null default now(), unique(referral_id,user_id)
);
alter table public.referral_campaigns enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_rewards enable row level security;
revoke all on public.referral_campaigns, public.referral_codes, public.referrals, public.referral_rewards from public,anon,authenticated;
grant all on public.referral_campaigns, public.referral_codes, public.referrals, public.referral_rewards to service_role;
create function referral_private.get_my_referral() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'verified_account_required' using errcode='42501'; end if;
 insert into public.referral_codes(user_id) values(uid) on conflict(user_id) do nothing;
 select jsonb_build_object('code',c.code,'campaign_enabled',coalesce((select enabled and now() between starts_at and ends_at from public.referral_campaigns where id='launch'),false),'rewards',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'months',r.months,'status',r.status,'created_at',r.created_at) order by r.created_at desc) from public.referral_rewards r where r.user_id=uid),'[]'::jsonb),'has_redeemed',exists(select 1 from public.referrals where invitee_id=uid)) into result from public.referral_codes c where c.user_id=uid;
 return result;
end $$;
create function referral_private.redeem_referral(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); owner_id uuid; rid uuid; campaign public.referral_campaigns; registered timestamptz;
begin
 if uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
 -- Single campaign lock serializes cap checks, cycle checks and simultaneous redemptions.
 select * into campaign from public.referral_campaigns where id='launch' for update;
 if not campaign.enabled or now()<campaign.starts_at or now()>=campaign.ends_at then raise exception 'campaign_unavailable'; end if;
 select created_at into registered from auth.users where id=uid and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if registered is null then raise exception 'verified_account_required' using errcode='42501'; end if;
 select user_id into owner_id from public.referral_codes where code=upper(trim(p_code));
 if owner_id is null or owner_id=uid then raise exception 'invalid_referral_code'; end if;
 select id into rid from public.referrals where invitee_id=uid and referrer_id=owner_id;
 if rid is not null then return jsonb_build_object('status','pending_store_redemption','referral_id',rid); end if;
 if exists(select 1 from public.referrals where invitee_id=uid) then raise exception 'already_redeemed'; end if;
 if registered<campaign.starts_at or registered<now()-interval '14 days' then raise exception 'new_account_required'; end if;
 if exists(with recursive ancestors(id) as (select owner_id union select r.referrer_id from public.referrals r join ancestors a on r.invitee_id=a.id) select 1 from ancestors where id=uid) then raise exception 'referral_cycle'; end if;
 if (select count(*) from public.referrals where referrer_id=owner_id and campaign_id=campaign.id)>=campaign.max_referrals then raise exception 'referral_limit_reached'; end if;
 insert into public.referrals(campaign_id,referrer_id,invitee_id) values(campaign.id,owner_id,uid) returning id into rid;
 insert into public.referral_rewards(referral_id,user_id,months) values(rid,owner_id,3),(rid,uid,3);
 return jsonb_build_object('status','pending_store_redemption','referral_id',rid);
end $$;
revoke all on function referral_private.get_my_referral(), referral_private.redeem_referral(text) from public,anon;
grant execute on function referral_private.get_my_referral(), referral_private.redeem_referral(text) to authenticated;
create function public.get_my_referral() returns jsonb language sql security invoker set search_path='' as $$ select referral_private.get_my_referral() $$;
create function public.redeem_referral(p_code text) returns jsonb language sql security invoker set search_path='' as $$ select referral_private.redeem_referral(p_code) $$;
revoke all on function public.get_my_referral(),public.redeem_referral(text) from public,anon;
grant execute on function public.get_my_referral(),public.redeem_referral(text) to authenticated;
