-- Pro gating + free usage caps (design: docs/billing/2026-10-01-pro-limits-design.md §2).
--
-- EVERYTHING here is behind ONE switch, huddle_ops.settings.limits_enforced,
-- which defaults to false. While it is false nothing a user can notice changes:
-- no insert is refused, AI meeting summaries stay at 20 per month, Google
-- Calendar can be connected by anyone. (Creating an organization becomes open
-- to free members while the switch is off — that is the owner's decision in
-- §0 of the design, not an accident.)
--
-- Turning the switch on is NOT done here. It is a separate, deliberate step:
--   select huddle_ops.enable_pro_limits();   -- service_role / SQL editor only
-- which grandfathers existing Google Calendar links, gifts existing free
-- members Pro days, and only then flips the switch. disable_pro_limits()
-- flips it back without taking any gifted days away.
--
-- Over the limit only blocks ADDING. Viewing, editing, completing, deleting
-- and exporting are never blocked, and no data is hidden or removed.

-- ── 1. The switch ──────────────────────────────────────────────────────────
alter table huddle_ops.settings
  add column if not exists limits_enforced boolean not null default false,
  add column if not exists limits_enforced_at timestamptz;

-- ── 2–4. Plan helpers (internal; not callable by clients) ──────────────────
create or replace function huddle_ops.limits_enforced() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.limits_enforced from huddle_ops.settings s where s.id), false)
$$;

create or replace function huddle_ops.plan_allows(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not huddle_ops.limits_enforced() or huddle_ops.has_pro(p_user)
$$;

-- The single place every number lives. null = unlimited.
create or replace function huddle_ops.plan_limits(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not huddle_ops.limits_enforced() then
    -- Today's behaviour: no caps, 20 AI meeting summaries a month for everyone.
    return jsonb_build_object('active_tasks', null, 'notes', null, 'image_bytes', null, 'meeting_imports', 20);
  end if;
  if huddle_ops.has_pro(p_user) then
    return jsonb_build_object('active_tasks', null, 'notes', null, 'image_bytes', 21474836480, 'meeting_imports', 20);
  end if;
  return jsonb_build_object('active_tasks', 150, 'notes', 100, 'image_bytes', 209715200, 'meeting_imports', 5);
end;
$$;

-- Usage counters. "Active task" = not completed and not archived (lib/focus.ts).
-- Rows with parent_id are single-occurrence overrides materialised from a
-- recurring master ("only this" edits); the recurring task counts once, so
-- they are not counted — and not blocked (see the trigger below).
create or replace function huddle_ops.active_task_count(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.tasks t
   where t.user_id = p_user and not t.is_completed and not t.is_archived and t.parent_id is null
$$;

create or replace function huddle_ops.note_count(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.notebook_notes n
   where n.user_id = p_user and not n.is_archived
$$;

-- Bytes stored under {user_id}/ in the notebook-images bucket. Whiteboard
-- base64 images (scratchpad_items.content) are not counted (known gap, §1).
create or replace function huddle_ops.image_bytes_used(p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when jsonb_typeof(o.metadata->'size') = 'number'
                           then (o.metadata->>'size')::numeric else 0 end), 0)::bigint
    from storage.objects o
   where o.bucket_id = 'notebook-images' and o.name like p_user::text || '/%'
$$;

-- ── 5–6. Task / note caps ──────────────────────────────────────────────────
-- Called by the BEFORE INSERT triggers for direct client writes. Uses the
-- caller's own id, so it reveals nothing about anyone else.
create or replace function huddle_ops.check_insert_quota(p_kind text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_limit integer;
  v_used  integer;
begin
  if p_kind not in ('active_tasks', 'notes') then
    raise exception 'INVALID_QUOTA_KIND';
  end if;
  if v_uid is null or not huddle_ops.limits_enforced() or huddle_ops.has_pro(v_uid) then
    return;
  end if;
  v_limit := (huddle_ops.plan_limits(v_uid)->>p_kind)::integer;
  if v_limit is null then
    return;
  end if;
  -- Serialise one member's concurrent inserts so two tabs cannot both take
  -- the last slot (each count below runs on a fresh snapshot after the lock).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 8150));
  if p_kind = 'active_tasks' then
    v_used := huddle_ops.active_task_count(v_uid);
  else
    v_used := huddle_ops.note_count(v_uid);
  end if;
  if v_used >= v_limit then
    raise exception '%', case p_kind when 'active_tasks' then 'TASK_LIMIT' else 'NOTE_LIMIT' end
      using errcode = 'P0001';
  end if;
end;
$$;

-- Only direct client writes (current_user = authenticated) are capped.
-- SECURITY DEFINER flows (accepting a meeting assignment, …) and the service
-- role (meeting import Edge Function) run as another role and pass through.
create or replace function public.tasks_plan_limit_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  -- Not active, or a recurring-occurrence override (counted via its master).
  if new.is_completed or new.is_archived or new.parent_id is not null then
    return new;
  end if;
  -- INSERT … ON CONFLICT DO UPDATE fires BEFORE INSERT even when it ends up
  -- updating an existing row: editing existing data is never blocked.
  if exists (select 1 from public.tasks t where t.id = new.id) then
    return new;
  end if;
  perform huddle_ops.check_insert_quota('active_tasks');
  return new;
end;
$$;
drop trigger if exists tasks_plan_limit_guard on public.tasks;
create trigger tasks_plan_limit_guard
  before insert on public.tasks
  for each row execute function public.tasks_plan_limit_guard();

create or replace function public.notebook_notes_plan_limit_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.is_archived then
    return new;
  end if;
  -- The notebook reorder writes every row with upsert(); those are updates.
  if exists (select 1 from public.notebook_notes n where n.id = new.id) then
    return new;
  end if;
  perform huddle_ops.check_insert_quota('notes');
  return new;
end;
$$;
drop trigger if exists notebook_notes_plan_limit_guard on public.notebook_notes;
create trigger notebook_notes_plan_limit_guard
  before insert on public.notebook_notes
  for each row execute function public.notebook_notes_plan_limit_guard();

-- ── 7. Image storage cap ───────────────────────────────────────────────────
-- Compares what is ALREADY stored (the new file's size is unknown to RLS), so
-- the last upload may overshoot by at most one file (bucket limit 5 MB).
create or replace function huddle_ops.image_upload_allowed() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_limit bigint;
begin
  if v_uid is null or not huddle_ops.limits_enforced() then
    return true;
  end if;
  v_limit := (huddle_ops.plan_limits(v_uid)->>'image_bytes')::bigint;
  return v_limit is null or huddle_ops.image_bytes_used(v_uid) < v_limit;
end;
$$;

do $$ begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists notebook_images_plan_limit on storage.objects;
    create policy notebook_images_plan_limit on storage.objects
      as restrictive for insert to authenticated
      with check (bucket_id is distinct from 'notebook-images' or (select huddle_ops.image_upload_allowed()));
  end if;
end $$;

-- ── 8. AI meeting summaries: monthly quota from plan_limits ────────────────
-- Rewrite the LIVE definition (20260926120000 hardened it after the original)
-- so later fixes are kept; refuse to migrate if its shape is not as expected.
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.reserve_meeting_import(uuid,uuid,text,date,text)'::regprocedure);
  v_new := regexp_replace(v_def,
    '\)\s*>=\s*20\s+then(\s+raise exception ''MONTHLY_LIMIT'')',
    ') >= coalesce((huddle_ops.plan_limits(p_user)->>''meeting_imports'')::integer, 20) then\1');
  if v_new = v_def or position('plan_limits' in v_new) = 0 then
    raise exception 'reserve_meeting_import monthly quota changed shape; review pro limits migration';
  end if;
  execute v_new;
end $$;

-- Display value for the meeting-import Edge Function `list` action.
create or replace function public.meeting_import_limit(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((huddle_ops.plan_limits(p_user)->>'meeting_imports')::integer, 20)
$$;

-- ── 9. Google Calendar: Pro, except members who linked before the switch ───
create table if not exists huddle_ops.feature_grandfathers (
  user_id    uuid not null references auth.users(id) on delete cascade,
  feature    text not null check (feature in ('google_calendar')),
  granted_at timestamptz not null default now(),
  primary key (user_id, feature)
);
alter table huddle_ops.feature_grandfathers enable row level security;
revoke all on huddle_ops.feature_grandfathers from public, anon, authenticated;

insert into huddle_ops.feature_grandfathers(user_id, feature)
select c.user_id, 'google_calendar' from public.google_calendar_connections c
on conflict do nothing;

-- Every successful link made while the switch is off is grandfathered. A
-- trigger (not the Edge Function) so no write path can forget it.
create or replace function huddle_ops.google_calendar_grandfather() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not huddle_ops.limits_enforced() then
    insert into huddle_ops.feature_grandfathers(user_id, feature)
    values (new.user_id, 'google_calendar')
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists google_calendar_grandfather on public.google_calendar_connections;
create trigger google_calendar_grandfather
  after insert or update on public.google_calendar_connections
  for each row execute function huddle_ops.google_calendar_grandfather();

-- Gate for the Edge Function `start` action (service_role only).
create or replace function public.google_calendar_connect_allowed(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select huddle_ops.plan_allows(p_user)
      or exists (select 1 from huddle_ops.feature_grandfathers g
                  where g.user_id = p_user and g.feature = 'google_calendar')
$$;

-- ── 10. Organizations: Pro only once the switch is on ──────────────────────
do $$
declare
  f record;
  v_def text;
begin
  for f in select unnest(array['public.create_organization(text)', 'public.get_my_organizations()']) as sig loop
    v_def := pg_get_functiondef(f.sig::regprocedure);
    if position('huddle_ops.has_pro(v_uid)' in v_def) = 0 then
      raise exception '% no longer checks has_pro(v_uid); review pro limits migration', f.sig;
    end if;
    execute replace(v_def, 'huddle_ops.has_pro(v_uid)', 'huddle_ops.plan_allows(v_uid)');
  end loop;
end $$;

-- ── 11. What the client shows (membership page, upgrade prompts) ───────────
create or replace function public.my_plan_usage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_month date := date_trunc('month', now() at time zone 'Asia/Taipei')::date;
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'enforced', huddle_ops.limits_enforced(),
    'pro', huddle_ops.has_pro(v_uid),
    'limits', huddle_ops.plan_limits(v_uid),
    'used', jsonb_build_object(
      'active_tasks', huddle_ops.active_task_count(v_uid),
      'notes', huddle_ops.note_count(v_uid),
      'image_bytes', huddle_ops.image_bytes_used(v_uid),
      -- Same rule reserve_meeting_import enforces (stale pendings expire after 5 min).
      'meeting_imports_this_month', (
        select count(*) from public.meeting_imports m
         where m.user_id = v_uid and m.month = v_month
           and (m.status = 'succeeded' or (m.status = 'pending' and m.created_at >= now() - interval '5 minutes')))),
    'grandfathered', jsonb_build_object(
      'google_calendar', exists (select 1 from huddle_ops.feature_grandfathers g
                                  where g.user_id = v_uid and g.feature = 'google_calendar')));
end;
$$;

-- ── 12. Turning the switch on / off (service_role only; never run here) ────
create or replace function huddle_ops.enable_pro_limits(p_gift_days integer default 60) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s            huddle_ops.settings;
  v_cutoff     timestamptz := now();
  v_backfilled integer := 0;
  v_gifted     integer := 0;
  u            record;
begin
  if p_gift_days is null or p_gift_days not between 0 and 365 then
    raise exception 'INVALID_GIFT_DAYS';
  end if;
  select * into s from huddle_ops.settings where id for update;
  if s.limits_enforced then
    return jsonb_build_object('enforced', true, 'already_enforced', true,
      'enforced_at', s.limits_enforced_at, 'grandfathered', 0, 'gifted', 0);
  end if;
  -- (a) Everyone linked to Google Calendar right now keeps it for good.
  insert into huddle_ops.feature_grandfathers(user_id, feature)
  select c.user_id, 'google_calendar' from public.google_calendar_connections c
  on conflict do nothing;
  get diagnostics v_backfilled = row_count;
  -- (b) Members who registered before this moment and are not Pro get the gift.
  -- The source key makes it once per member, ever (also across off/on cycles).
  if p_gift_days > 0 then
    for u in
      select au.id from auth.users au
       where au.created_at < v_cutoff and not coalesce(au.is_anonymous, false)
         and not exists (select 1 from huddle_ops.grants g
                          where g.source_key = 'pro-limits-launch-gift:' || au.id::text)
       order by au.created_at
    loop
      if not huddle_ops.has_pro(u.id) then
        perform huddle_ops.give_days(u.id, p_gift_days, 'manual',
          'pro-limits-launch-gift:' || u.id::text, 'Pro 上線贈送：舊用戶 ' || p_gift_days || ' 天');
        v_gifted := v_gifted + 1;
      end if;
    end loop;
  end if;
  -- (c) Flip the switch.
  update huddle_ops.settings
     set limits_enforced = true, limits_enforced_at = v_cutoff, updated_at = now()
   where id;
  return jsonb_build_object('enforced', true, 'already_enforced', false,
    'enforced_at', v_cutoff, 'grandfathered', v_backfilled, 'gifted', v_gifted);
end;
$$;

-- Rollback switch. Gifted days are kept; grandfather rows are kept.
create or replace function huddle_ops.disable_pro_limits() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update huddle_ops.settings set limits_enforced = false, updated_at = now() where id;
  return jsonb_build_object('enforced', false);
end;
$$;

-- ── 13. Privileges ─────────────────────────────────────────────────────────
revoke all on function
  huddle_ops.limits_enforced(),
  huddle_ops.plan_allows(uuid),
  huddle_ops.plan_limits(uuid),
  huddle_ops.active_task_count(uuid),
  huddle_ops.note_count(uuid),
  huddle_ops.image_bytes_used(uuid),
  huddle_ops.check_insert_quota(text),
  huddle_ops.image_upload_allowed(),
  huddle_ops.google_calendar_grandfather(),
  huddle_ops.enable_pro_limits(integer),
  huddle_ops.disable_pro_limits(),
  public.tasks_plan_limit_guard(),
  public.notebook_notes_plan_limit_guard(),
  public.meeting_import_limit(uuid),
  public.google_calendar_connect_allowed(uuid),
  public.my_plan_usage()
from public, anon, authenticated;

-- Triggers / RLS run as the client: they need these two (own id only).
grant execute on function huddle_ops.check_insert_quota(text) to authenticated;
grant execute on function huddle_ops.image_upload_allowed() to authenticated;
-- reserve_meeting_import is SECURITY INVOKER, executed by the service role.
grant execute on function huddle_ops.plan_limits(uuid) to service_role;
grant execute on function public.meeting_import_limit(uuid) to service_role;
grant execute on function public.google_calendar_connect_allowed(uuid) to service_role;
grant execute on function huddle_ops.enable_pro_limits(integer) to service_role;
grant execute on function huddle_ops.disable_pro_limits() to service_role;
grant execute on function public.my_plan_usage() to authenticated;
