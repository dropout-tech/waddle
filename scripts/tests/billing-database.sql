\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
insert into auth.users values ('e33d985b-4bcb-456f-9658-9cc1085185ab'), ('a33d985b-4bcb-456f-9658-9cc1085185ab');
\ir ../../supabase/migrations/20260920082633_billing_entitlements.sql
set role service_role;
select public.apply_billing_snapshot('new', '[{"user_id":"e33d985b-4bcb-456f-9658-9cc1085185ab","expires_at":"2030-01-01T00:00:00Z","observed_at_ms":200}]');
select public.apply_billing_snapshot('old', '[{"user_id":"e33d985b-4bcb-456f-9658-9cc1085185ab","expires_at":null,"observed_at_ms":100}]');
select public.apply_billing_snapshot('new', '[{"user_id":"e33d985b-4bcb-456f-9658-9cc1085185ab","expires_at":null,"observed_at_ms":300}]');
do $$ begin
  if (select expires_at is null or observed_at_ms <> 200 from public.billing_entitlements limit 1) then raise exception 'Stale or duplicate event changed entitlement'; end if;
end $$;
select public.apply_billing_snapshot('refund', '[{"user_id":"e33d985b-4bcb-456f-9658-9cc1085185ab","expires_at":null,"observed_at_ms":400}]');
select public.apply_billing_snapshot('deleted-user', '[{"user_id":"b33d985b-4bcb-456f-9658-9cc1085185ab","expires_at":null,"observed_at_ms":400}]');
do $$ begin
  if (select expires_at is not null or observed_at_ms <> 400 from public.billing_entitlements limit 1) then raise exception 'Revocation failed'; end if;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = 'a33d985b-4bcb-456f-9658-9cc1085185ab';
do $$ begin
  if exists (select 1 from public.billing_entitlements) then raise exception 'Cross-account read leaked'; end if;
  if has_table_privilege(current_user, 'public.billing_entitlements', 'INSERT') or has_table_privilege(current_user, 'public.billing_entitlements', 'UPDATE') then raise exception 'Client has write privilege'; end if;
  if has_function_privilege(current_user, 'public.apply_billing_snapshot(text,jsonb)', 'EXECUTE') then raise exception 'Client can execute privileged RPC'; end if;
end $$;
set request.jwt.claim.sub = 'e33d985b-4bcb-456f-9658-9cc1085185ab';
do $$ begin
  if (select count(*) from public.billing_entitlements) <> 1 then raise exception 'Own entitlement unreadable'; end if;
end $$;
reset role;
do $$ begin
  if has_table_privilege('anon', 'public.billing_entitlements', 'SELECT') or has_function_privilege('anon', 'public.apply_billing_snapshot(text,jsonb)', 'EXECUTE') then raise exception 'Anonymous access'; end if;
end $$;
