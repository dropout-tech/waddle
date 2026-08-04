-- Migration: default category per workspace
--
-- Adds a "default category" mechanism: every workspace can designate one
-- category as its fallback for tasks created without an explicit category
-- pick (quick-add, calendar drag-create, promote-from-scratchpad, etc).
-- Previously those paths silently fell back to "the first category" —
-- this makes the fallback explicit, user-controlled, and toggleable.
--
-- Idempotent: safe to re-run. Uses `if not exists` for columns/index and
-- `where not exists` guards for the backfill so a second run is a no-op.

-- ─────────────────────────────────────────────────────────
-- categories.is_default
-- ─────────────────────────────────────────────────────────
alter table public.categories
  add column if not exists is_default boolean not null default false;

-- At most one default category per workspace.
create unique index if not exists categories_one_default_per_workspace_idx
  on public.categories(workspace_id)
  where is_default;

-- ─────────────────────────────────────────────────────────
-- user_settings.default_category_enabled
-- ─────────────────────────────────────────────────────────
-- Per-user on/off switch for the whole mechanism. Defaults to true so
-- existing users get the behavior automatically; App code treats a
-- missing column as default-true via the mappers fallback, so it's safe
-- to apply this on a live system before deploying.
alter table public.user_settings
  add column if not exists default_category_enabled boolean not null default true;

-- ─────────────────────────────────────────────────────────
-- Backfill: give every existing, non-archived workspace a default
-- category named "未分類" (Uncategorized), unless it already has one
-- marked is_default (skip — don't touch) or already has a category with
-- that exact name (promote that one instead of inserting a duplicate).
-- ─────────────────────────────────────────────────────────
do $$
declare
  ws record;
  existing_uncat uuid;
  next_sort integer;
begin
  for ws in
    select w.id as workspace_id, w.user_id
    from public.workspaces w
    where w.is_archived = false
      and not exists (
        select 1 from public.categories c
        where c.workspace_id = w.id and c.is_default
      )
  loop
    -- Already has a category literally named "未分類" → promote it.
    select c.id into existing_uncat
    from public.categories c
    where c.workspace_id = ws.workspace_id
      and c.name = '未分類'
    order by c.sort_order asc
    limit 1;

    if existing_uncat is not null then
      update public.categories
        set is_default = true
        where id = existing_uncat;
    else
      select coalesce(max(sort_order), -1) + 1 into next_sort
        from public.categories
        where workspace_id = ws.workspace_id;

      insert into public.categories (workspace_id, user_id, name, sort_order, is_default)
        values (ws.workspace_id, ws.user_id, '未分類', next_sort, true);
    end if;
  end loop;
end $$;
