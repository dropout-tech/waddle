-- Run by scripts/test/google-calendar-db-verify.sh AFTER every migration has
-- been applied to a disposable local cluster. Prints PASS/FAIL per check.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is true then raise notice 'PASS: %', label; else raise notice 'FAIL: %', label; end if;
end $$;
-- true when the statement is refused with insufficient_privilege
create or replace function pg_temp.denied(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when insufficient_privilege then
  return true;
end $$;
grant execute on function pg_temp.check(boolean, text), pg_temp.denied(text) to anon, authenticated, service_role;

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'gcal-a@test.invalid'),
  ('00000000-0000-4000-8000-0000000000c2', 'gcal-b@test.invalid');

select pg_temp.check(to_regclass('public.google_calendar_connections') is not null and to_regclass('public.google_calendar_oauth_states') is not null, 'migration created both tables');
select pg_temp.check(to_regclass('public.google_calendar_event_mappings') is null, 'no event-mapping table (event content is never stored)');
select pg_temp.check((select bool_and(relrowsecurity) from pg_class where oid in ('public.google_calendar_connections'::regclass, 'public.google_calendar_oauth_states'::regclass)), 'RLS enabled on both tables');
select pg_temp.check((select count(*) = 2 from pg_policy where polname = 'operations_account_active' and polrelid in ('public.google_calendar_connections'::regclass, 'public.google_calendar_oauth_states'::regclass)), 'suspension policy present on both tables');
select pg_temp.check(not exists(
  select 1 from (values ('anon'), ('authenticated')) r(role), (values ('public.google_calendar_connections'), ('public.google_calendar_oauth_states')) t(tbl),
    (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
  where has_table_privilege(r.role, t.tbl, p.priv)), 'anon + authenticated hold no privilege on either table');
select pg_temp.check((select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'google_calendar_connections') = 'created_at,last_error,refresh_cipher,scope,share_busy,status,updated_at,user_id', 'connections has only credential/status/share_busy columns (no workspace/calendar/sync fields)');

-- service_role (Edge Function) writes one row per table for user c1 and c2.
set role service_role;
insert into public.google_calendar_connections(user_id, refresh_cipher, scope) values
  ('00000000-0000-4000-8000-0000000000c1', 'sealed-a', 'https://www.googleapis.com/auth/calendar.events.owned.readonly'),
  ('00000000-0000-4000-8000-0000000000c2', 'sealed-b', 'https://www.googleapis.com/auth/calendar.events.owned.readonly');
insert into public.google_calendar_oauth_states(state_hash, user_id, session_id, verifier_cipher) values
  ('hash-a', '00000000-0000-4000-8000-0000000000c1', gen_random_uuid(), 'v-a'),
  ('hash-b', '00000000-0000-4000-8000-0000000000c2', gen_random_uuid(), 'v-b');
select pg_temp.check((select count(*) = 2 from public.google_calendar_connections), 'service_role can write + read connections');
select pg_temp.check((select bool_and(share_busy) from public.google_calendar_connections), 'share_busy defaults to true when not specified');
select pg_temp.check((select is_nullable = 'NO' and column_default = 'true' from information_schema.columns where table_schema = 'public' and table_name = 'google_calendar_connections' and column_name = 'share_busy'), 'share_busy is NOT NULL DEFAULT true');
reset role;
select pg_temp.check((select expires_at between now() + interval '9 minutes' and now() + interval '11 minutes' from public.google_calendar_oauth_states where state_hash = 'hash-a'), 'oauth state expires 10 minutes after creation');

-- anon: nothing.
set role anon;
select pg_temp.check(pg_temp.denied('select * from public.google_calendar_connections'), 'anon cannot SELECT connections');
select pg_temp.check(pg_temp.denied('select * from public.google_calendar_oauth_states'), 'anon cannot SELECT oauth_states');
select pg_temp.check(pg_temp.denied($q$insert into public.google_calendar_connections(user_id, refresh_cipher, scope) values ('00000000-0000-4000-8000-0000000000c1', 'x', 'x')$q$), 'anon cannot INSERT connections');
select pg_temp.check(pg_temp.denied($q$insert into public.google_calendar_oauth_states(state_hash, user_id, session_id, verifier_cipher) values ('h', '00000000-0000-4000-8000-0000000000c1', gen_random_uuid(), 'v')$q$), 'anon cannot INSERT oauth_states');
select pg_temp.check(pg_temp.denied($q$update public.google_calendar_connections set status = 'connected'$q$), 'anon cannot UPDATE connections');
select pg_temp.check(pg_temp.denied('delete from public.google_calendar_oauth_states'), 'anon cannot DELETE oauth_states');
reset role;

-- authenticated, acting as the row's own user: still nothing.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
select pg_temp.check(pg_temp.denied('select * from public.google_calendar_connections'), 'authenticated (own user) cannot SELECT connections');
select pg_temp.check(pg_temp.denied('select * from public.google_calendar_oauth_states'), 'authenticated (own user) cannot SELECT oauth_states');
select pg_temp.check(pg_temp.denied($q$insert into public.google_calendar_connections(user_id, refresh_cipher, scope) values ('00000000-0000-4000-8000-0000000000c1', 'x', 'x')$q$), 'authenticated cannot INSERT connections');
select pg_temp.check(pg_temp.denied($q$insert into public.google_calendar_oauth_states(state_hash, user_id, session_id, verifier_cipher) values ('h', '00000000-0000-4000-8000-0000000000c1', gen_random_uuid(), 'v')$q$), 'authenticated cannot INSERT oauth_states');
select pg_temp.check(pg_temp.denied($q$update public.google_calendar_connections set refresh_cipher = 'x'$q$), 'authenticated cannot UPDATE connections');
select pg_temp.check(pg_temp.denied('delete from public.google_calendar_connections'), 'authenticated cannot DELETE connections');
select pg_temp.check(pg_temp.denied($q$update public.google_calendar_oauth_states set user_id = user_id$q$), 'authenticated cannot UPDATE oauth_states');
reset role;
reset request.jwt.claim.sub;

-- Account deletion (delete-account removes the auth user) cascades.
delete from auth.users where id = '00000000-0000-4000-8000-0000000000c1';
select pg_temp.check(not exists(select 1 from public.google_calendar_connections where user_id = '00000000-0000-4000-8000-0000000000c1'), 'deleting auth user cascades its connection');
select pg_temp.check(not exists(select 1 from public.google_calendar_oauth_states where user_id = '00000000-0000-4000-8000-0000000000c1'), 'deleting auth user cascades its oauth states');
select pg_temp.check((select count(*) = 1 from public.google_calendar_connections) and (select count(*) = 1 from public.google_calendar_oauth_states), 'other users'' rows untouched by the cascade');
