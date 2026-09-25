-- Minimal Supabase platform stubs for a disposable PostgreSQL cluster ONLY.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema extensions;
create schema auth;
create schema storage;
create table auth.users(
  id uuid primary key, email text, created_at timestamptz default now(),
  email_confirmed_at timestamptz default now(), phone_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}', is_anonymous boolean default false
);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth, extensions, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
$$ select string_to_array(name,'/') $$;
