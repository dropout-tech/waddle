-- ─────────────────────────────────────────────────────────────────────────────
-- tasks.source: how a task row came to exist under its owner (spec v5 #7,
-- design U5). DRAFT — not applied to any database.
--
--   'self'               created by the owner (every client insert; default)
--   'meeting_import'     created by the owner's own AI meeting import
--                        (import_meeting_tasks; the description carries a
--                        transcript excerpt)
--   'meeting_assignment' created when the owner accepted someone else's
--                        meeting assignment (respond_meeting_assignment)
--
-- "Directly assigned to me by someone else" needs no value: assignment shares
-- the assigner's row (user_id = assigner, assignee_id = me,
-- 20260927120000_task_assignments_orgs.sql:1-8), so such a task is never the
-- assignee's own row and is told apart by ownership.
--
-- Why: the AI review sends only title / completion / dates for accepted
-- meeting assignments. Until now that was detected from the link row
-- (meeting_task_assignments.task_id, gone when the sender deletes the account
-- or the meeting) or the "指派人：" description line (editable by the owner).
-- The column survives both.
--
-- Who writes it:
--   * Clients (authenticated / anon) cannot: an INSERT with any value other
--     than 'self' and any UPDATE that changes it raise TASK_SOURCE_READ_ONLY
--     (tasks_source_guard; same current_user rule as tasks_assignment_guard).
--     A recurring-occurrence override inserted by the client inherits the
--     source of its own master row.
--   * The server sets it with AFTER UPDATE triggers on the two link tables,
--     in the same transaction as the existing functions that create the
--     tasks — no existing function is replaced:
--       meeting_task_assignments.task_id set on an accepted row
--         → 'meeting_assignment'   (respond_meeting_assignment)
--       meeting_imports.imported_tasks gains a task id
--         → 'meeting_import'       (import_meeting_tasks, route_meeting_tasks)
--
-- Backfill: every task an accepted assignment or an imported_tasks map still
-- points at. Rows whose link is already gone stay 'self'; the AI review keeps
-- the description fallbacks (R1 + R2) for them. trg_tasks_updated is paused
-- for the backfill so updated_at (used by clients) does not move.
--
-- Rollback: supabase/migrations-draft/rollback/20261003030000_task_source.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tasks
  add column source text not null default 'self'
  constraint tasks_source_check check (source in ('self', 'meeting_import', 'meeting_assignment'));

-- ── Backfill (before the guard exists; runs as the migration owner) ─────────
alter table public.tasks disable trigger trg_tasks_updated;
update public.tasks t
   set source = 'meeting_assignment'
  from public.meeting_task_assignments a
 where a.task_id = t.id and a.status = 'accepted' and a.recipient_id = t.user_id;
update public.tasks t
   set source = 'meeting_import'
  from public.meeting_imports m, jsonb_each_text(m.imported_tasks) v
 where m.user_id = t.user_id
   and t.source = 'self'
   and t.id = case when v.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   then v.value::uuid end;
alter table public.tasks enable trigger trg_tasks_updated;

-- ── Client guard ────────────────────────────────────────────────────────────
-- DEFINER functions run as their owner and the service role is not a client
-- role, so both pass through (same rule as tasks_assignment_guard).
create function public.tasks_source_guard() returns trigger
language plpgsql set search_path = '' as $$
declare v_parent text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.source is distinct from 'self' then
      raise exception 'TASK_SOURCE_READ_ONLY' using errcode = '42501';
    end if;
    if new.parent_id is not null then
      select t.source into v_parent from public.tasks t
       where t.id = new.parent_id and t.user_id = new.user_id;
      new.source := coalesce(v_parent, 'self');
    end if;
    return new;
  end if;
  if new.source is distinct from old.source then
    raise exception 'TASK_SOURCE_READ_ONLY' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.tasks_source_guard() from public, anon, authenticated;
create trigger tasks_source_guard
  before insert or update on public.tasks
  for each row execute function public.tasks_source_guard();

-- ── Server-side fill ────────────────────────────────────────────────────────
create function huddle_ops.task_source_from_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'accepted' and new.task_id is not null
     and (tg_op = 'INSERT' or new.task_id is distinct from old.task_id) then
    update public.tasks t set source = 'meeting_assignment'
     where t.id = new.task_id and t.user_id = new.recipient_id and t.source <> 'meeting_assignment';
  end if;
  return null;
end $$;
revoke all on function huddle_ops.task_source_from_assignment() from public, anon, authenticated, service_role;
create trigger meeting_task_assignments_task_source
  after insert or update of task_id, status on public.meeting_task_assignments
  for each row execute function huddle_ops.task_source_from_assignment();

create function huddle_ops.task_source_from_import() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks t set source = 'meeting_import'
   where t.user_id = new.user_id
     and t.source = 'self'
     and t.id in (
       select case when v.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   then v.value::uuid end
         from jsonb_each_text(new.imported_tasks) v
        where not (coalesce(old.imported_tasks, '{}'::jsonb) ? v.key));
  return null;
end $$;
revoke all on function huddle_ops.task_source_from_import() from public, anon, authenticated, service_role;
create trigger meeting_imports_task_source
  after update of imported_tasks on public.meeting_imports
  for each row when (new.imported_tasks is distinct from old.imported_tasks)
  execute function huddle_ops.task_source_from_import();
