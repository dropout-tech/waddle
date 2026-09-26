-- ─────────────────────────────────────────────────────────────────────────────
-- Task assignment (Asana-style, one shared row) + organizations.
--
-- Product rules (owner decisions 2026-09-27):
--   * Assigning shares the SAME task row: the assigner (tasks.user_id) keeps
--     ownership; the assignee sees it in their own list/calendar and can
--     complete / log time / schedule it. No acceptance step; the assignee may
--     "return" it with a one-line reason.
--   * One-to-one assignment is free between calendar-share peers.
--   * Organizations (invite link + owner/admin) let members assign to each
--     other without sharing calendars. Creating an organization requires Pro,
--     verified here in the database (never trusted from the client).
--
-- Security model:
--   * Assignment columns are written ONLY by SECURITY DEFINER RPCs. A trigger
--     rejects any direct client write to them (INSERT or UPDATE).
--   * The assignee gets a narrow SELECT/UPDATE policy on tasks; a trigger
--     limits their UPDATE to completion / actual time / schedule columns
--     (default-deny: any other column change, including future columns, fails).
--   * Organization members never read each other's task rows directly; the
--     org board is a DEFINER RPC with a fixed column whitelist, restricted to
--     tasks explicitly assigned inside that organization. Private tasks are
--     never visible to anyone but their owner.
--   * Organization tables have RLS on and NO client policies/grants: all
--     access goes through the RPCs below ("RPC 三件套": revoke public/anon,
--     auth.uid() + suspension guard first, search_path = '').
-- Rollback: drop the functions, policies, triggers, the five tasks columns and
-- the three organization tables below.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto with schema extensions;

-- ── Pro entitlement (server-side source of truth) ────────────────────────────
-- Mirrors the membership page's `pro_until` (huddle_operations 'self'):
-- a paid store entitlement OR an unrevoked gift/trial/referral grant that has
-- not expired. Not callable by clients; only used inside DEFINER RPCs.
create or replace function huddle_ops.has_pro(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.billing_entitlements b
                where b.user_id = p_user and b.entitlement = 'pro' and b.expires_at > now())
      or exists(select 1 from huddle_ops.grants g
                where g.user_id = p_user and g.revoked_at is null and g.expires_at > now())
$$;
revoke all on function huddle_ops.has_pro(uuid) from public, anon, authenticated;

-- ── Organization tables (RPC-only access) ───────────────────────────────────
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index organizations_owner_idx on public.organizations(owner_id);

create table public.organization_members (
  org_id    uuid not null references public.organizations(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id);

create table public.organization_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,           -- sha256 hex; raw token never stored
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz
);
create index organization_invites_org_idx on public.organization_invites(org_id);

alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;
revoke all on public.organizations, public.organization_members, public.organization_invites
  from public, anon, authenticated;
grant all on public.organizations, public.organization_members, public.organization_invites
  to service_role;

-- ── Task assignment columns ─────────────────────────────────────────────────
-- No "assignee xor status" CHECK on purpose: assignee_id is ON DELETE SET NULL
-- (a deleted account must not be blocked by someone else's task), which would
-- leave a status behind. Readers treat assignee_id IS NULL as "not assigned".
alter table public.tasks
  add column if not exists assignee_id       uuid references auth.users(id) on delete set null,
  add column if not exists organization_id   uuid references public.organizations(id) on delete set null,
  add column if not exists assignment_status text check (assignment_status in ('active','returned')),
  add column if not exists return_note       text check (char_length(return_note) <= 200),
  add column if not exists assigned_at       timestamptz;
alter table public.tasks
  add constraint tasks_assignee_not_owner check (assignee_id is null or assignee_id <> user_id);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id) where assignee_id is not null;
create index if not exists tasks_organization_idx on public.tasks(organization_id) where organization_id is not null;

-- Assignee may read / update only while the assignment is active. These are
-- permissive policies OR'ed with the untouched tasks_*_own policies; there is
-- deliberately NO assignee insert or delete policy.
create policy tasks_select_assignee on public.tasks
  for select to authenticated
  using (assignee_id = (select auth.uid()) and assignment_status = 'active');
create policy tasks_update_assignee on public.tasks
  for update to authenticated
  using (assignee_id = (select auth.uid()) and assignment_status = 'active')
  with check (assignee_id = (select auth.uid()) and assignment_status = 'active');

-- Column guard for direct client writes. DEFINER RPCs run as the function
-- owner (current_user <> authenticated) and pass through.
create or replace function public.tasks_assignment_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_assignee_cols text[] := array['is_completed','completed_at','actual_minutes',
    'scheduled_date','scheduled_start_time','scheduled_end_time','updated_at'];
begin
  if current_user not in ('authenticated','anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.assignee_id is not null or new.organization_id is not null
       or new.assignment_status is not null or new.return_note is not null
       or new.assigned_at is not null then
      raise exception 'ASSIGNMENT_VIA_RPC_ONLY' using errcode = '42501';
    end if;
    return new;
  end if;
  if v_uid is not null and old.user_id = v_uid then
    -- Owner: everything as before, except the assignment columns.
    if row(new.assignee_id, new.organization_id, new.assignment_status, new.return_note, new.assigned_at)
       is distinct from
       row(old.assignee_id, old.organization_id, old.assignment_status, old.return_note, old.assigned_at) then
      raise exception 'ASSIGNMENT_VIA_RPC_ONLY' using errcode = '42501';
    end if;
    return new;
  end if;
  -- Anyone else reaching an UPDATE got here through tasks_update_assignee.
  -- Default-deny: only the whitelisted columns may differ.
  if (to_jsonb(new) - v_assignee_cols) is distinct from (to_jsonb(old) - v_assignee_cols) then
    raise exception 'ASSIGNEE_FIELD_LOCKED' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tasks_assignment_guard
  before insert or update on public.tasks
  for each row execute function public.tasks_assignment_guard();

-- ── Internal helpers (not client-callable) ──────────────────────────────────
create or replace function huddle_ops.org_role(p_org uuid, p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_members m where m.org_id = p_org and m.user_id = p_user
$$;

create or replace function huddle_ops.are_share_peers(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.calendar_shares s
                where s.user_lo = least(p_a, p_b) and s.user_hi = greatest(p_a, p_b))
$$;

-- Clear the assignment (not the task) for every org task that involves p_user
-- as assigner or assignee. organization_id is kept for the owner's history.
create or replace function huddle_ops.org_detach(p_org uuid, p_user uuid) returns void
language sql security definer set search_path = '' as $$
  update public.tasks t
     set assignee_id = null, assignment_status = null, return_note = null, assigned_at = null
   where t.organization_id = p_org
     and t.assignee_id is not null
     and (p_user is null or t.assignee_id = p_user or t.user_id = p_user)
$$;
revoke all on function huddle_ops.org_role(uuid,uuid), huddle_ops.are_share_peers(uuid,uuid),
  huddle_ops.org_detach(uuid,uuid) from public, anon, authenticated;

-- Dissolving a calendar share ends the share-based (non-org) assignments
-- between the pair, symmetric with leaving an organization.
create or replace function huddle_ops.share_detach() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks t
     set assignee_id = null, assignment_status = null, return_note = null, assigned_at = null
   where t.organization_id is null
     and ((t.user_id = old.user_lo and t.assignee_id = old.user_hi)
       or (t.user_id = old.user_hi and t.assignee_id = old.user_lo));
  return old;
end;
$$;
revoke all on function huddle_ops.share_detach() from public, anon, authenticated;
create trigger calendar_shares_assignment_detach
  after delete on public.calendar_shares
  for each row execute function huddle_ops.share_detach();

-- ── Assignment RPCs ─────────────────────────────────────────────────────────
create or replace function public.assign_task(p_task uuid, p_assignee uuid, p_org uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_task public.tasks%rowtype;
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_task from public.tasks where id = p_task and user_id = v_uid for update;
  if not found then raise exception 'TASK_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_task.is_recurring then raise exception 'RECURRING_NOT_SUPPORTED' using errcode = 'P0001'; end if;
  if p_assignee is null or p_assignee = v_uid then raise exception 'ASSIGNEE_NOT_ALLOWED' using errcode = 'P0001'; end if;
  if not huddle_ops.access_allowed(p_assignee) then raise exception 'ASSIGNEE_NOT_ALLOWED' using errcode = 'P0001'; end if;
  if p_org is null then
    if not huddle_ops.are_share_peers(v_uid, p_assignee) then
      raise exception 'ASSIGNEE_NOT_ALLOWED' using errcode = 'P0001';
    end if;
  else
    if huddle_ops.org_role(p_org, v_uid) is null or huddle_ops.org_role(p_org, p_assignee) is null then
      raise exception 'ASSIGNEE_NOT_ALLOWED' using errcode = 'P0001';
    end if;
  end if;
  update public.tasks
     set assignee_id = p_assignee, organization_id = p_org, assignment_status = 'active',
         return_note = null, assigned_at = now()
   where id = p_task;
end;
$$;

create or replace function public.unassign_task(p_task uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  update public.tasks
     set assignee_id = null, organization_id = null, assignment_status = null,
         return_note = null, assigned_at = null
   where id = p_task and user_id = v_uid;
  if not found then raise exception 'TASK_NOT_FOUND' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.return_task(p_task uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(v_note) not between 1 and 200 then
    raise exception 'RETURN_NOTE_REQUIRED' using errcode = 'P0001';
  end if;
  update public.tasks
     set assignment_status = 'returned', return_note = v_note
   where id = p_task and assignee_id = v_uid and assignment_status = 'active';
  if not found then raise exception 'TASK_NOT_FOUND' using errcode = 'P0001'; end if;
end;
$$;

-- Both directions in one list, with just enough profile to render names.
create or replace function public.list_task_assignments()
returns table (
  task_id uuid, role text, peer_id uuid, peer_name text, peer_avatar text,
  status text, return_note text, organization_id uuid, organization_name text,
  assigned_at timestamptz, title text, is_completed boolean, completed_at timestamptz,
  scheduled_date date, due_date date
)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return query
  select t.id, 'assignee'::text, t.user_id, p.display_name, p.avatar_url,
         t.assignment_status, t.return_note, t.organization_id, o.name,
         t.assigned_at, t.title, t.is_completed, t.completed_at, t.scheduled_date, t.due_date
    from public.tasks t
    left join public.profiles p on p.id = t.user_id
    left join public.organizations o on o.id = t.organization_id
   where t.assignee_id = v_uid and t.assignment_status = 'active'
  union all
  select t.id, 'assigner'::text, t.assignee_id, p.display_name, p.avatar_url,
         t.assignment_status, t.return_note, t.organization_id, o.name,
         t.assigned_at, t.title, t.is_completed, t.completed_at, t.scheduled_date, t.due_date
    from public.tasks t
    left join public.profiles p on p.id = t.assignee_id
    left join public.organizations o on o.id = t.organization_id
   where t.user_id = v_uid and t.assignee_id is not null and t.assignment_status is not null
   order by 10 desc nulls last
   limit 500;
end;
$$;

-- Everyone the caller may assign to: calendar-share peers + co-members of
-- each organization (one row per path, so the UI knows which org to pass).
create or replace function public.get_assignable_people()
returns table (user_id uuid, display_name text, avatar_url text, source text, org_id uuid, org_name text)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return query
  select case when s.user_lo = v_uid then s.user_hi else s.user_lo end,
         p.display_name, p.avatar_url, 'share'::text, null::uuid, null::text
    from public.calendar_shares s
    left join public.profiles p on p.id = case when s.user_lo = v_uid then s.user_hi else s.user_lo end
   where v_uid in (s.user_lo, s.user_hi)
  union all
  select m2.user_id, p.display_name, p.avatar_url, 'org'::text, o.id, o.name
    from public.organization_members m1
    join public.organizations o on o.id = m1.org_id
    join public.organization_members m2 on m2.org_id = m1.org_id and m2.user_id <> v_uid
    left join public.profiles p on p.id = m2.user_id
   where m1.user_id = v_uid;
end;
$$;

-- ── Organization RPCs ───────────────────────────────────────────────────────
create or replace function public.get_my_organizations()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'can_create', huddle_ops.has_pro(v_uid),
    'orgs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'name', o.name, 'role', m.role, 'created_at', o.created_at,
               'member_count', (select count(*) from public.organization_members x where x.org_id = o.id))
             order by o.created_at)
        from public.organization_members m
        join public.organizations o on o.id = m.org_id
       where m.user_id = v_uid), '[]'::jsonb));
end;
$$;

create or replace function public.create_organization(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_org  uuid;
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not huddle_ops.has_pro(v_uid) then
    raise exception 'PRO_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 9127));
  if (select count(*) from public.organizations where owner_id = v_uid) >= 3 then
    raise exception 'ORG_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.organizations(name, owner_id) values (v_name, v_uid) returning id into v_org;
  insert into public.organization_members(org_id, user_id, role) values (v_org, v_uid, 'owner');
  return v_org;
end;
$$;

-- Mint a (multi-use, 7-day) invite link. Minting revokes the previous links of
-- the org, so "重新產生連結" is also how a leaked link is killed.
create or replace function public.create_org_invite(p_org uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_token text;
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(huddle_ops.org_role(p_org, v_uid), '') not in ('owner','admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.organization_invites set revoked_at = now()
   where org_id = p_org and revoked_at is null;
  v_token := rtrim(replace(replace(
               encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=');
  insert into public.organization_invites(org_id, created_by, token_hash)
  values (p_org, v_uid, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return v_token;
end;
$$;

-- All failure modes raise the same error (no token-state oracle).
create or replace function public.preview_org_invite(p_token text)
returns table (org_name text, inviter_name text, member_count bigint, already_member boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.organization_invites%rowtype;
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_inv from public.organization_invites i
   where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and i.revoked_at is null and i.expires_at > now();
  if v_inv.id is null then raise exception 'invalid invite' using errcode = 'P0001'; end if;
  return query
  select o.name, p.display_name,
         (select count(*) from public.organization_members x where x.org_id = o.id),
         exists(select 1 from public.organization_members x where x.org_id = o.id and x.user_id = v_uid)
    from public.organizations o
    left join public.profiles p on p.id = v_inv.created_by
   where o.id = v_inv.org_id;
end;
$$;

create or replace function public.accept_org_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.organization_invites%rowtype;
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_inv from public.organization_invites i
   where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and i.revoked_at is null and i.expires_at > now();
  if v_inv.id is null then raise exception 'invalid invite' using errcode = 'P0001'; end if;
  perform 1 from public.organizations where id = v_inv.org_id for update;
  if not exists(select 1 from public.organization_members where org_id = v_inv.org_id and user_id = v_uid)
     and (select count(*) from public.organization_members where org_id = v_inv.org_id) >= 200 then
    raise exception 'ORG_FULL' using errcode = 'P0001';
  end if;
  insert into public.organization_members(org_id, user_id, role)
  values (v_inv.org_id, v_uid, 'member')
  on conflict (org_id, user_id) do nothing;
  return v_inv.org_id;
end;
$$;

create or replace function public.get_org_members(p_org uuid)
returns table (user_id uuid, display_name text, avatar_url text, role text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if huddle_ops.org_role(p_org, v_uid) is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select m.user_id, p.display_name, p.avatar_url, m.role, m.joined_at
    from public.organization_members m
    left join public.profiles p on p.id = m.user_id
   where m.org_id = p_org
   order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.joined_at;
end;
$$;

-- Org board: tasks explicitly assigned inside this org, fixed whitelist
-- (no description / notes / attendees / location / meeting_url). Completed
-- ones stay visible for 7 days so progress is visible.
create or replace function public.get_org_board(p_org uuid)
returns table (
  task_id uuid, title text, assignee_id uuid, assignee_name text, assigner_id uuid,
  assigner_name text, is_completed boolean, completed_at timestamptz,
  due_date date, scheduled_date date, assigned_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if huddle_ops.org_role(p_org, v_uid) is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select t.id, t.title, t.assignee_id, pa.display_name, t.user_id, po.display_name,
         t.is_completed, t.completed_at, t.due_date, t.scheduled_date, t.assigned_at
    from public.tasks t
    join public.organization_members ma on ma.org_id = p_org and ma.user_id = t.assignee_id
    join public.organization_members mo on mo.org_id = p_org and mo.user_id = t.user_id
    left join public.profiles pa on pa.id = t.assignee_id
    left join public.profiles po on po.id = t.user_id
   where t.organization_id = p_org
     and t.assignment_status = 'active'
     and (not t.is_completed or t.completed_at > now() - interval '7 days')
   order by t.is_completed, t.due_date nulls last, t.assigned_at desc
   limit 500;
end;
$$;

create or replace function public.remove_org_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_role   text;
  v_target text;
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  v_role := huddle_ops.org_role(p_org, v_uid);
  v_target := huddle_ops.org_role(p_org, p_user);
  if v_target is null or p_user = v_uid or v_target = 'owner'
     or v_role is null or v_role = 'member'
     or (v_role = 'admin' and v_target <> 'member') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform huddle_ops.org_detach(p_org, p_user);
  delete from public.organization_members where org_id = p_org and user_id = p_user;
end;
$$;

create or replace function public.set_org_member_role(p_org uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if huddle_ops.org_role(p_org, v_uid) is distinct from 'owner'
     or p_role not in ('admin','member') or p_user = v_uid then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.organization_members set role = p_role
   where org_id = p_org and user_id = p_user and role <> 'owner';
  if not found then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
end;
$$;

create or replace function public.leave_org(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  v_role := huddle_ops.org_role(p_org, v_uid);
  if v_role is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_role = 'owner' then raise exception 'OWNER_CANNOT_LEAVE' using errcode = 'P0001'; end if;
  perform huddle_ops.org_detach(p_org, v_uid);
  delete from public.organization_members where org_id = p_org and user_id = v_uid;
end;
$$;

create or replace function public.delete_organization(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if huddle_ops.org_role(p_org, v_uid) is distinct from 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform huddle_ops.org_detach(p_org, null);
  delete from public.organizations where id = p_org;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
do $$ declare f text; begin
  foreach f in array array[
    'public.assign_task(uuid,uuid,uuid)', 'public.unassign_task(uuid)',
    'public.return_task(uuid,text)', 'public.list_task_assignments()',
    'public.get_assignable_people()', 'public.get_my_organizations()',
    'public.create_organization(text)', 'public.create_org_invite(uuid)',
    'public.preview_org_invite(text)', 'public.accept_org_invite(text)',
    'public.get_org_members(uuid)', 'public.get_org_board(uuid)',
    'public.remove_org_member(uuid,uuid)', 'public.set_org_member_role(uuid,uuid,text)',
    'public.leave_org(uuid)', 'public.delete_organization(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.tasks_assignment_guard() from public, anon, authenticated;

-- ── Suspension sweep (same idempotent block as 20260927110000) ──────────────
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
      and not exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='operations_account_active') loop
    execute format('create policy operations_account_active on public.%I as restrictive for all to authenticated using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()))',t.relname);
  end loop;
end $$;
