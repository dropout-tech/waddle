-- Free task cap counts only what the member sees as an open task (audit 2026-10-02, revback H5).
-- Before: every not-completed, not-archived row counted, including meetings,
-- calendar-only tasks, tasks inside archived workspaces/categories and
-- recurring masters whose series already ended — so a member with a few dozen
-- visible tasks could be told "150 reached". Free-first principle: when in
-- doubt, do not count it.
-- No schema change; both functions keep their signatures and grants.
-- Rollback: re-run the two definitions from 20261001200000_pro_limits.sql.

create or replace function huddle_ops.active_task_count(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
    from public.tasks t
    join public.workspaces w on w.id = t.workspace_id
    join public.categories c on c.id = t.category_id
   where t.user_id = p_user
     and not t.is_completed and not t.is_archived
     -- Same visibility rule as the task list / focus picker (lib/focus.ts).
     and t.show_in_task_list and not t.is_meeting
     -- Archiving a workspace or category hides its tasks without touching them.
     and not w.is_archived and not c.is_archived
     -- A series that has already ended (e.g. the old half left by "this and
     -- following") is history, not an open task. One day of slack for time zones.
     and not (t.is_recurring and t.recurrence_end_date is not null
              and t.recurrence_end_date < current_date - 1)
     -- "Only this" overrides count through their recurring master.
     and not (t.parent_id is not null and exists (
       select 1 from public.tasks p
        where p.id = t.parent_id and p.user_id = p_user and p.is_recurring))
$$;

-- Rows that will not be counted are not capped on insert either.
create or replace function public.tasks_plan_limit_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.is_completed or new.is_archived then
    return new;
  end if;
  -- Meetings and calendar-only tasks are not open tasks (see active_task_count).
  if new.is_meeting or not new.show_in_task_list then
    return new;
  end if;
  -- A recurring-occurrence override (counted via its master) is exempt only
  -- when parent_id points at the caller's OWN recurring task; any other
  -- parent_id is counted and capped like a normal insert.
  if new.parent_id is not null and huddle_ops.is_own_recurring_parent(new.parent_id) then
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
