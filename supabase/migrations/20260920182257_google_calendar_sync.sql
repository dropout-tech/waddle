-- Server-only credentials and reconciliation ledger. No source FK: deletions must
-- remain observable until the corresponding remote event has been removed.
create table public.google_calendar_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 generation uuid not null default gen_random_uuid(),
 refresh_cipher text not null,
 time_zone text not null,
 workspace_ids uuid[] not null,
 calendar_id text,
 status text not null default 'pending' check(status in ('pending','connected','syncing','partial','conflict','reauth_required','calendar_creation_uncertain')),
 last_synced_at timestamptz,
 sync_cursor text,
 sync_signature text,
 sync_conflicts integer not null default 0,
 last_error text,
 lease_id uuid,
 lease_until timestamptz,
 created_at timestamptz not null default now()
);
create table public.google_calendar_oauth_states (
 state_hash text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 verifier_cipher text not null,
 time_zone text not null,
 workspace_ids uuid[] not null,
 expires_at timestamptz not null default now()+interval '10 minutes'
);
create table public.google_calendar_event_mappings (
 user_id uuid not null references public.google_calendar_connections(user_id) on delete cascade,
 source_key text not null,
 event_id text not null,
 payload jsonb,
 etag text,
 primary key(user_id,source_key),
 unique(user_id,event_id)
);
alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_oauth_states enable row level security;
alter table public.google_calendar_event_mappings enable row level security;
revoke all on public.google_calendar_connections,public.google_calendar_oauth_states,public.google_calendar_event_mappings from public,anon,authenticated;
grant all on public.google_calendar_connections,public.google_calendar_oauth_states,public.google_calendar_event_mappings to service_role;
grant select on public.tasks,public.workspaces,public.meeting_invitations,public.meeting_attendees to service_role;
-- All routines below are service-only invokers; user identity comes only from a
-- validated JWT inside the Edge Function, never from the browser request body.
create function public.google_calendar_snapshot(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if (select count(*) from public.tasks where user_id=p_user)>5000 or (select count(*) from public.google_calendar_event_mappings where user_id=p_user)>20000 then raise exception 'sync_capacity_exceeded'; end if;
 select jsonb_build_object(
 'tasks',coalesce((select jsonb_agg(to_jsonb(t)) from public.tasks t where t.user_id=p_user),'[]'::jsonb),
 'meetings',coalesce((select jsonb_agg(to_jsonb(m)) from public.meeting_invitations m where m.status='active' and (m.organizer_id=p_user or exists(select 1 from public.meeting_attendees a where a.meeting_id=m.id and a.user_id=p_user and a.response='accepted'))),'[]'::jsonb),
 'mappings',coalesce((select jsonb_agg(to_jsonb(g)) from public.google_calendar_event_mappings g where g.user_id=p_user),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.google_calendar_claim(p_user uuid,p_lease uuid,p_generation uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.google_calendar_connections set lease_id=p_lease,lease_until=now()+interval '2 minutes' where user_id=p_user and generation=p_generation and (lease_until is null or lease_until<now());
 return found;
end $$;
revoke all on function public.google_calendar_snapshot(uuid),public.google_calendar_claim(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.google_calendar_snapshot(uuid),public.google_calendar_claim(uuid,uuid,uuid) to service_role;
