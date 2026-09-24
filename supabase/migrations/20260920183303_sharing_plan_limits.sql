-- Inert until service_role explicitly supplies enabled=true and effective_from.
-- Users created before that timestamp keep their existing free sharing rights.
create schema if not exists sharing_plan_private;
revoke all on schema sharing_plan_private from public,anon;
grant usage on schema sharing_plan_private to authenticated;
create table public.sharing_plan_config (
 id boolean primary key default true check(id), enabled boolean not null default false,
 effective_from timestamptz,
 check(not enabled or effective_from is not null)
);
insert into public.sharing_plan_config values(true,false,null);
alter table public.sharing_plan_config enable row level security;
revoke all on public.sharing_plan_config from public,anon,authenticated;
grant all on public.sharing_plan_config to service_role;

create function sharing_plan_private.for_user(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare checked timestamptz:=clock_timestamp(); activated timestamptz; enabled boolean; legacy boolean; pro boolean; used integer;
begin
 select c.enabled,c.effective_from into enabled,activated from public.sharing_plan_config c where id;
 enabled:=coalesce(enabled,false) and activated is not null and activated<=checked;
 select coalesce(created_at<activated,false) into legacy from auth.users where id=p_user;
 if not found then raise exception 'account unavailable' using errcode='42501'; end if;
 select exists(select 1 from public.billing_entitlements where user_id=p_user and entitlement='pro' and expires_at>checked) into pro;
 select count(*) into used from public.calendar_shares where user_lo=p_user or user_hi=p_user;
 return jsonb_build_object('enabled',enabled,'grandfathered',legacy,'enforced',enabled and not legacy,'plan',case when pro then 'pro' else 'free' end,'limit',case when pro then 20 else 2 end,'used',used,'effective_from',activated);
end $$;
revoke all on function sharing_plan_private.for_user(uuid) from public,anon,authenticated;

create function sharing_plan_private.my_limit() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 return sharing_plan_private.for_user(auth.uid());
end $$;
revoke all on function sharing_plan_private.my_limit() from public,anon;
grant execute on function sharing_plan_private.my_limit() to authenticated;
create function public.get_my_sharing_limit() returns jsonb language sql security invoker set search_path='' as $$select sharing_plan_private.my_limit()$$;
revoke all on function public.get_my_sharing_limit() from public,anon;
grant execute on function public.get_my_sharing_limit() to authenticated;

-- Existing definer accept_share_invite owns relationship authorization. This
-- private trigger also protects privileged insertion paths; clients cannot call
-- it as an RPC, change the flag, or read another account's plan.
create function sharing_plan_private.check_insert() returns trigger language plpgsql security definer set search_path='' as $$
declare participant uuid; quota jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sharing-plan:'||least(new.user_lo,new.user_hi)::text,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sharing-plan:'||greatest(new.user_lo,new.user_hi)::text,0));
 -- BEFORE INSERT runs even for ON CONFLICT: an existing pair consumes nothing.
 if exists(select 1 from public.calendar_shares where user_lo=new.user_lo and user_hi=new.user_hi) then return new; end if;
 foreach participant in array array[new.user_lo,new.user_hi] loop
  quota:=sharing_plan_private.for_user(participant);
  if (quota->>'enforced')::boolean and (quota->>'used')::int>=(quota->>'limit')::int then
   raise exception 'sharing_peer_limit' using errcode='P0001';
  end if;
 end loop;
 return new;
end $$;
revoke all on function sharing_plan_private.check_insert() from public,anon,authenticated;
create trigger sharing_plan_check_insert before insert on public.calendar_shares for each row execute function sharing_plan_private.check_insert();
