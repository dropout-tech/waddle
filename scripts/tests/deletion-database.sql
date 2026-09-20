\set ON_ERROR_STOP on
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,storage to authenticated;
create table storage.objects(id bigint generated always as identity,bucket_id text,name text);
alter table storage.objects enable row level security;
grant select,insert,update on storage.objects to authenticated;
grant usage on all sequences in schema storage to authenticated;
create policy permit_own on storage.objects for all to authenticated using(split_part(name,'/',1)=auth.uid()::text) with check(split_part(name,'/',1)=auth.uid()::text);
insert into auth.users values('00000000-0000-4000-8000-000000000001');
\ir ../../supabase/migrations/20260920184344_account_deletion_write_guard.sql
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
insert into storage.objects(bucket_id,name) values('notebook-images','00000000-0000-4000-8000-000000000001/a.png');
reset role;
set role service_role;
select public.begin_account_deletion('00000000-0000-4000-8000-000000000001');
reset role;
set role authenticated;
do $$begin
 begin insert into storage.objects(bucket_id,name) values('notebook-images','00000000-0000-4000-8000-000000000001/b.png');raise exception 'marker bypass';exception when insufficient_privilege then null;end;
 update storage.objects set name='00000000-0000-4000-8000-000000000001/changed.png' where bucket_id='notebook-images';
 if found then raise exception 'update bypass';end if;
 if has_function_privilege(current_user,'public.begin_account_deletion(uuid)','EXECUTE') then raise exception 'client deletion';end if;
end$$;
reset role;
delete from auth.users;
set role authenticated;
do $$begin
 begin insert into storage.objects(bucket_id,name) values('notebook-images','00000000-0000-4000-8000-000000000001/stale-jwt.png');raise exception 'stale JWT bypass';exception when insufficient_privilege then null;end;
end$$;
