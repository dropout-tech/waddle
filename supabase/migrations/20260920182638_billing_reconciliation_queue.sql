create table public.billing_reconciliation_queue (
 user_id uuid primary key references auth.users(id) on delete cascade,
 next_attempt_at timestamptz not null default now(), lease_id uuid, lease_until timestamptz,
 failures integer not null default 0, last_success_at timestamptz,
 last_error text check(last_error is null or last_error='reconciliation_failed')
);
alter table public.billing_reconciliation_queue enable row level security;
revoke all on public.billing_reconciliation_queue from public,anon,authenticated;
grant all on public.billing_reconciliation_queue to service_role;
insert into public.billing_reconciliation_queue(user_id) select user_id from public.billing_entitlements on conflict do nothing;
create function public.enqueue_billing_reconciliation() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.billing_reconciliation_queue(user_id) values(new.user_id) on conflict do nothing;
 return new;
end $$;
revoke all on function public.enqueue_billing_reconciliation() from public,anon,authenticated;
grant execute on function public.enqueue_billing_reconciliation() to service_role;
create trigger billing_reconciliation_enqueue after insert on public.billing_entitlements for each row execute function public.enqueue_billing_reconciliation();
create function public.claim_billing_reconciliation() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 with due as (
  select user_id from public.billing_reconciliation_queue where next_attempt_at<=now() and (lease_until is null or lease_until<now()) order by next_attempt_at,user_id limit 10 for update skip locked
 ), claimed as (
  update public.billing_reconciliation_queue q set lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes' from due where q.user_id=due.user_id returning q.user_id,q.lease_id
 ) select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'lease_id',lease_id)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
create function public.finish_billing_reconciliation(p_user_id uuid,p_lease_id uuid,p_success boolean) returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.billing_reconciliation_queue set
  next_attempt_at=now()+case when p_success then interval '6 hours' else least(3600,60*power(2,least(failures,6))) * interval '1 second' end,
  failures=case when p_success then 0 else failures+1 end,
  last_success_at=case when p_success then now() else last_success_at end,
  last_error=case when p_success then null else 'reconciliation_failed' end,
  lease_id=null,lease_until=null
 where user_id=p_user_id and lease_id=p_lease_id and p_success is not null;
end $$;
revoke all on function public.claim_billing_reconciliation(),public.finish_billing_reconciliation(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_billing_reconciliation(),public.finish_billing_reconciliation(uuid,uuid,boolean) to service_role;
