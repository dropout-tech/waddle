-- ─────────────────────────────────────────────────────────────────────────────
-- 0016  Calendar sharing between accounts
--
-- Design doc: docs/CALENDAR_SHARING_PLAN.md (v2, reviewed by security-auditor
-- and engineer on 2026-07-21). Purely additive: no existing table or policy is
-- touched. Rollback = drop the three tables and five functions below.
--
-- Security model ("RPC 三件套" applied to every function):
--   1. EXECUTE revoked from public/anon, granted to authenticated only.
--   2. First statement asserts auth.uid() IS NOT NULL (a NULL uid must fail
--      loudly, never flip a membership predicate open).
--   3. SECURITY DEFINER with search_path = '' and schema-qualified names.
-- Cross-account reads happen ONLY inside these functions; grants use a
-- field-level whitelist (busy mode never sees titles; even full mode never
-- returns description/notes/attendees/location/meeting_url).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto with schema extensions;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.calendar_share_invites (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,          -- sha256 hex; raw token never stored
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at  timestamptz
);
create index calendar_share_invites_inviter_idx
  on public.calendar_share_invites(inviter_id);

alter table public.calendar_share_invites enable row level security;

create policy csi_select_own on public.calendar_share_invites
  for select to authenticated using (inviter_id = auth.uid());
-- update is how the inviter revokes (sets revoked_at); insert only via RPC.
create policy csi_update_own on public.calendar_share_invites
  for update to authenticated
  using (inviter_id = auth.uid()) with check (inviter_id = auth.uid());
create policy csi_delete_own on public.calendar_share_invites
  for delete to authenticated using (inviter_id = auth.uid());

create table public.calendar_shares (
  id         uuid primary key default gen_random_uuid(),
  user_lo    uuid not null references auth.users(id) on delete cascade,
  user_hi    uuid not null references auth.users(id) on delete cascade,
  invite_id  uuid references public.calendar_share_invites(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint calendar_shares_ordered check (user_lo < user_hi),
  constraint calendar_shares_pair_unique unique (user_lo, user_hi)
);
create index calendar_shares_user_lo_idx on public.calendar_shares(user_lo);
create index calendar_shares_user_hi_idx on public.calendar_shares(user_hi);

alter table public.calendar_shares enable row level security;

create policy cs_select_member on public.calendar_shares
  for select to authenticated using (auth.uid() in (user_lo, user_hi));
-- Either member may dissolve the relationship; grants cascade away with it.
create policy cs_delete_member on public.calendar_shares
  for delete to authenticated using (auth.uid() in (user_lo, user_hi));
-- No insert/update policy: rows are created only by accept_share_invite().

-- `ref` is TEXT, not uuid: for kind='workspace' it holds workspaces.id::text,
-- for kind='slot_type' it holds slot_types.key. Slot types are referenced by
-- KEY because time_blocks.type stores the key and custom slot_type rows are
-- rewritten (new uuids) on settings saves — a uuid reference would silently
-- orphan grants. Comparisons cast the table id to text (w.id::text = ref), so
-- malformed input can never raise a cast error inside a policy.
create table public.calendar_share_grants (
  share_id   uuid not null references public.calendar_shares(id) on delete cascade,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('workspace','slot_type')),
  ref        text not null check (char_length(ref) between 1 and 128),
  detail     text not null check (detail in ('full','busy')),
  created_at timestamptz not null default now(),
  primary key (share_id, owner_id, kind, ref)
);

alter table public.calendar_share_grants enable row level security;

-- Both members may read the grants of a share (UI shows "对方开放了哪些给你";
-- leaks only opaque ids/keys, which are unreadable without the data itself).
create policy csg_select_member on public.calendar_share_grants
  for select to authenticated using (
    exists (select 1 from public.calendar_shares s
            where s.id = share_id and auth.uid() in (s.user_lo, s.user_hi))
  );

-- Owner-only writes, with the WITH CHECK doing the heavy lifting (defense
-- layer 1 of 2 against the ref_id escalation chain: the ref MUST belong to
-- the caller; app-side checks don't count, PostgREST can be hit directly).
create policy csg_insert_own on public.calendar_share_grants
  for insert to authenticated with check (
    owner_id = auth.uid()
    and exists (select 1 from public.calendar_shares s
                where s.id = share_id and auth.uid() in (s.user_lo, s.user_hi))
    and (
      (kind = 'workspace' and exists
        (select 1 from public.workspaces w
         where w.id::text = ref and w.user_id = auth.uid()))
      or
      (kind = 'slot_type' and exists
        (select 1 from public.slot_types st
         where st.key = ref and st.user_id = auth.uid()))
    )
  );

create policy csg_update_own on public.calendar_share_grants
  for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.calendar_shares s
                where s.id = share_id and auth.uid() in (s.user_lo, s.user_hi))
    and (
      (kind = 'workspace' and exists
        (select 1 from public.workspaces w
         where w.id::text = ref and w.user_id = auth.uid()))
      or
      (kind = 'slot_type' and exists
        (select 1 from public.slot_types st
         where st.key = ref and st.user_id = auth.uid()))
    )
  );

create policy csg_delete_own on public.calendar_share_grants
  for delete to authenticated using (owner_id = auth.uid());

-- ── Functions ────────────────────────────────────────────────────────────────

-- 1) Mint an invite. Returns the raw token exactly once; only the hash is kept.
create or replace function public.create_share_invite()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 256-bit, URL-safe base64 without padding.
  v_token := rtrim(replace(replace(
               encode(extensions.gen_random_bytes(32), 'base64'),
               '+', '-'), '/', '_'), '=');

  insert into public.calendar_share_invites (inviter_id, token_hash)
  values (v_uid, encode(extensions.digest(v_token, 'sha256'), 'hex'));

  return v_token;
end;
$$;

-- 2) Preview: who is inviting me? All failure modes (unknown / expired /
--    accepted / revoked / own token) raise the SAME error so the endpoint
--    can't be used as an oracle to distinguish token states.
create or replace function public.preview_share_invite(p_token text)
returns table (display_name text, avatar_url text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_inviter uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select i.inviter_id into v_inviter
  from public.calendar_share_invites i
  where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and i.accepted_by is null
    and i.revoked_at is null
    and i.expires_at > now()
    and i.inviter_id <> v_uid;

  if v_inviter is null then
    raise exception 'invalid invite' using errcode = 'P0001';
  end if;

  return query
  select p.display_name, p.avatar_url
  from public.profiles p
  where p.id = v_inviter;
end;
$$;

-- 3) Accept: atomic single-use claim (concurrent accepts race on the UPDATE;
--    exactly one wins), then create the pair. Same uniform error as preview.
create or replace function public.accept_share_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_invite   public.calendar_share_invites%rowtype;
  v_lo       uuid;
  v_hi       uuid;
  v_share_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.calendar_share_invites i
     set accepted_by = v_uid, accepted_at = now()
   where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and i.accepted_by is null
     and i.revoked_at is null
     and i.expires_at > now()
     and i.inviter_id <> v_uid
  returning i.* into v_invite;

  if v_invite.id is null then
    raise exception 'invalid invite' using errcode = 'P0001';
  end if;

  v_lo := least(v_invite.inviter_id, v_uid);
  v_hi := greatest(v_invite.inviter_id, v_uid);

  insert into public.calendar_shares (user_lo, user_hi, invite_id)
  values (v_lo, v_hi, v_invite.id)
  on conflict (user_lo, user_hi) do nothing;

  select s.id into v_share_id
  from public.calendar_shares s
  where s.user_lo = v_lo and s.user_hi = v_hi;

  return v_share_id;
end;
$$;

-- 4) My peers, with just enough profile to render them. profiles stays
--    owner-only at the RLS level; this is the only path that reveals a
--    display name, and only across an established share.
create or replace function public.get_share_peers()
returns table (
  share_id     uuid,
  peer_id      uuid,
  display_name text,
  avatar_url   text,
  created_at   timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  select s.id,
         case when s.user_lo = v_uid then s.user_hi else s.user_lo end,
         p.display_name,
         p.avatar_url,
         s.created_at
  from public.calendar_shares s
  join public.profiles p
    on p.id = case when s.user_lo = v_uid then s.user_hi else s.user_lo end
  where v_uid in (s.user_lo, s.user_hi)
  order by s.created_at;
end;
$$;

-- 5) The core read. Field whitelist is FIXED for both detail levels (busy
--    just nulls the title); nothing beyond these columns ever leaves the DB —
--    in particular no description/notes/attendees/location/meeting_url.
--    Default-deny: only rows matching an explicit grant are returned, and a
--    time_block whose type key no longer exists in the owner's slot_types is
--    dropped too. Both event queries double-bind: user_id = p_peer AND the
--    grant must exist (defense layer 2 of 2).
--    Recurring tasks: masters whose start predates the window are still
--    returned when their recurrence overlaps it (the client expands
--    occurrences with lib/calendar-utils.ts taskOccursOnDate); otherwise a
--    weekly task created before the viewed week would vanish entirely.
create or replace function public.get_shared_calendar(
  p_peer uuid,
  p_from date,
  p_to   date
)
returns table (
  source                  text,
  id                      uuid,
  event_date              date,
  start_time              time,
  end_time                time,
  type_key                text,
  color                   text,
  detail                  text,
  title                   text,
  is_recurring            boolean,
  recurrence_type         text,
  recurrence_interval     integer,
  recurrence_days_of_week integer[],
  recurrence_end_date     date,
  exdates                 jsonb,
  parent_id               uuid
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_share_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_peer is null or p_from is null or p_to is null
     or p_to < p_from or (p_to - p_from) > 400 then
    raise exception 'invalid range' using errcode = 'P0001';
  end if;

  select s.id into v_share_id
  from public.calendar_shares s
  where (s.user_lo = v_uid and s.user_hi = p_peer)
     or (s.user_lo = p_peer and s.user_hi = v_uid);

  -- No relationship → empty result with the same shape (not an error:
  -- revocation mid-session should degrade to "nothing visible").
  if v_share_id is null then
    return;
  end if;

  return query
  select 'task'::text,
         t.id,
         t.scheduled_date,
         t.scheduled_start_time,
         t.scheduled_end_time,
         null::text,
         t.calendar_color,
         g.detail,
         case when g.detail = 'full' then t.title else null end,
         t.is_recurring,
         t.recurrence_type::text,
         t.recurrence_interval,
         t.recurrence_days_of_week,
         t.recurrence_end_date,
         t.exdates,
         t.parent_id
  from public.tasks t
  join public.calendar_share_grants g
    on g.share_id = v_share_id
   and g.owner_id = p_peer
   and g.kind     = 'workspace'
   and g.ref      = t.workspace_id::text
  where t.user_id = p_peer
    and t.is_archived = false
    and t.scheduled_date is not null
    and t.scheduled_start_time is not null
    and t.scheduled_end_time is not null
    and (
      t.scheduled_date between p_from and p_to
      or (t.is_recurring
          and t.parent_id is null
          and t.scheduled_date <= p_to
          and (t.recurrence_end_date is null or t.recurrence_end_date >= p_from))
    )

  union all

  select 'time_block'::text,
         tb.id,
         tb.date,
         tb.start_time,
         tb.end_time,
         tb.type,
         tb.color,
         g.detail,
         case when g.detail = 'full' then tb.label else null end,
         false,
         null::text, null::integer, null::integer[], null::date, null::jsonb,
         null::uuid
  from public.time_blocks tb
  join public.calendar_share_grants g
    on g.share_id = v_share_id
   and g.owner_id = p_peer
   and g.kind     = 'slot_type'
   and g.ref      = tb.type
  where tb.user_id = p_peer
    and tb.date between p_from and p_to
    and exists (select 1 from public.slot_types st
                where st.user_id = p_peer and st.key = tb.type)

  order by 3, 4;
end;
$$;

-- ── Lock down EXECUTE (RPC 三件套 #1) ────────────────────────────────────────

revoke execute on function public.create_share_invite()                  from public, anon;
revoke execute on function public.preview_share_invite(text)             from public, anon;
revoke execute on function public.accept_share_invite(text)              from public, anon;
revoke execute on function public.get_share_peers()                      from public, anon;
revoke execute on function public.get_shared_calendar(uuid, date, date)  from public, anon;

grant execute on function public.create_share_invite()                  to authenticated;
grant execute on function public.preview_share_invite(text)             to authenticated;
grant execute on function public.accept_share_invite(text)              to authenticated;
grant execute on function public.get_share_peers()                      to authenticated;
grant execute on function public.get_shared_calendar(uuid, date, date)  to authenticated;
