-- Google Calendar READ-ONLY integration (Edge Function google-calendar).
--
-- Only the OAuth credential and the one-time OAuth handshake state are stored.
-- Google event CONTENT is never persisted: the Edge Function fetches the
-- user's primary calendar on demand and returns a minimal projection in the
-- HTTP response only. That also keeps Google meetings out of every sharing
-- path (get_shared_calendar reads tasks / time_blocks, never these tables).
-- The one cross-user use is the free-slot search (action `busy`): for an
-- authorised share partner it reads this user's calendar with this user's
-- grant and returns busy intervals only (see share_busy below).
--
-- Both tables are server-only: RLS on, every privilege revoked from anon and
-- authenticated, only service_role (the Edge Function) can touch them. The
-- refresh token is AES-GCM sealed by the function with a key that never
-- reaches the database (GOOGLE_CALENDAR_TOKEN_KEY), bound to the user id.
--
-- `on delete cascade` to auth.users is load-bearing: delete-account removes
-- the auth user and relies on the cascade to forget the Google credential.

create table public.google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_cipher text not null,
  scope text not null,
  status text not null default 'connected' check (status in ('connected', 'reauth_required')),
  -- When a share partner runs 「約交集」 with this user, count this user's
  -- Google meetings as busy (the partner receives start/end only — never a
  -- title, place, link or event id). The user's own searches always count
  -- their own Google meetings regardless of this flag.
  share_busy boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.google_calendar_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  verifier_cipher text not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);

create index google_calendar_oauth_states_user_idx on public.google_calendar_oauth_states(user_id);

alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_oauth_states enable row level security;

revoke all on public.google_calendar_connections, public.google_calendar_oauth_states from public, anon, authenticated;
grant all on public.google_calendar_connections, public.google_calendar_oauth_states to service_role;

-- Suspension sweep convention (20260926120000 / 20260927110000): every public
-- RLS table carries the restrictive operations_account_active policy. These
-- tables grant nothing to authenticated anyway; the policy keeps the
-- invariant (and its test) true.
create policy operations_account_active on public.google_calendar_connections
  as restrictive for all to authenticated
  using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()));
create policy operations_account_active on public.google_calendar_oauth_states
  as restrictive for all to authenticated
  using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()));
