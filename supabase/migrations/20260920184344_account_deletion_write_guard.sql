create schema if not exists deletion_private;
revoke all on schema deletion_private from public,anon;
grant usage on schema deletion_private to authenticated,service_role;
create table public.account_deletion_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default now()
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public,anon,authenticated;
grant all on public.account_deletion_requests to service_role;
create function deletion_private.storage_write_allowed() returns boolean language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then return false; end if;
 -- A write holds this row lock through its transaction. Deletion waits for all
 -- already-authorized uploads before marking, then new uploads see the marker.
 perform 1 from auth.users where id=uid for key share;
 if not found then return false; end if;
 return not exists(select 1 from public.account_deletion_requests where user_id=uid);
end $$;
revoke all on function deletion_private.storage_write_allowed() from public,anon;
grant execute on function deletion_private.storage_write_allowed() to authenticated;
create function deletion_private.begin_deletion(p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=p_user_id for update;
 if not found then raise exception 'account_unavailable'; end if;
 insert into public.account_deletion_requests(user_id) values(p_user_id) on conflict do nothing;
end $$;
revoke all on function deletion_private.begin_deletion(uuid) from public,anon,authenticated;
grant execute on function deletion_private.begin_deletion(uuid) to service_role;
create function public.begin_account_deletion(p_user_id uuid) returns void language sql security invoker set search_path='' as $$select deletion_private.begin_deletion(p_user_id)$$;
revoke all on function public.begin_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.begin_account_deletion(uuid) to service_role;
create policy notebook_images_deletion_insert_guard on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'notebook-images' or deletion_private.storage_write_allowed());
create policy notebook_images_deletion_update_guard on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'notebook-images' or deletion_private.storage_write_allowed())
 with check(bucket_id<>'notebook-images' or deletion_private.storage_write_allowed());
