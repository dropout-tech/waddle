-- Migration: global "未分類" (Uncategorized) WORKSPACE
--
-- Supersedes the per-workspace default category introduced by
-- 20260804120000_default_category.sql. That version gave every workspace its
-- own 未分類 category, which turned out to be the wrong level: the user wants
-- ONE global bucket at the workspace (大分類) level, pinned to the top of the
-- task panel, where every task created without an explicit category pick
-- lands.
--
-- What this does, per user:
--   1. workspaces.is_default column + "at most one per user" index
--   2. creates the 未分類 workspace (grey, sorted first) if missing
--   3. creates its single 未分類 category (is_default = true)
--   4. moves every task out of the old per-workspace 未分類 categories into
--      that new category
--   5. deletes those now-empty old categories (BACKED UP FIRST, see below)
--
-- DESTRUCTIVE STEP: step 5 deletes rows from public.categories. Protections:
--   - only categories with is_default = true AND name IN ('未分類',
--     'Uncategorized') AND not inside the new default workspace — i.e. only
--     the rows 20260804120000 itself created/promoted;
--   - every such row is copied verbatim into
--     _backup_uncategorized_cats_20260810 before the delete;
--   - every task move is recorded in _backup_uncategorized_task_moves_20260810
--     (task_id + old category_id/workspace_id) so it can be reversed;
--   - the delete runs only after the task move, and tasks.category_id is
--     ON DELETE CASCADE — so a delete before the move would destroy tasks.
--     Order matters and is enforced by the procedural block below.
--
-- Idempotent: safe to re-run. Column/index/table use `if not exists`; the
-- workspace/category inserts are guarded by `not exists`; after the first run
-- there are no old 未分類 categories left, so steps 4-5 become no-ops.
--
-- The 未分類 workspace's color '#9C9086' and icon '📥' are duplicated from
-- lib/palette.ts (UNCATEGORIZED_WORKSPACE_COLOR) and lib/default-category.ts
-- (UNCATEGORIZED_WORKSPACE_ICON) — SQL can't import them, keep in sync by hand.

-- ─────────────────────────────────────────────────────────
-- 1. workspaces.is_default
-- ─────────────────────────────────────────────────────────
alter table public.workspaces
  add column if not exists is_default boolean not null default false;

-- At most one default workspace per user.
create unique index if not exists workspaces_one_default_per_user_idx
  on public.workspaces(user_id)
  where is_default;

-- ─────────────────────────────────────────────────────────
-- 2. Backup tables (created empty, filled by the block below)
-- ─────────────────────────────────────────────────────────
create table if not exists public._backup_uncategorized_cats_20260810
  as select * from public.categories where false;

create table if not exists public._backup_uncategorized_task_moves_20260810 (
  task_id uuid,
  old_category_id uuid,
  old_workspace_id uuid,
  moved_at timestamptz not null default now()
);

-- These live in `public` (where PostgREST looks), so lock them down: RLS on
-- with zero policies = no access for anon/authenticated, while migrations and
-- the service role (which bypass RLS) can still read them for a rollback.
alter table public._backup_uncategorized_cats_20260810 enable row level security;
alter table public._backup_uncategorized_task_moves_20260810 enable row level security;
-- (guarded: the anon/authenticated roles only exist on Supabase, not on a
-- bare Postgres used for testing this file)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public._backup_uncategorized_cats_20260810 from anon;
    revoke all on public._backup_uncategorized_task_moves_20260810 from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public._backup_uncategorized_cats_20260810 from authenticated;
    revoke all on public._backup_uncategorized_task_moves_20260810 from authenticated;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────
-- 3-5. Per-user backfill + migration of the old 未分類 categories
-- ─────────────────────────────────────────────────────────
do $$
declare
  u record;
  is_zh boolean;
  bucket_name text;
  new_ws_id uuid;
  new_cat_id uuid;
  next_sort integer;
  old_cat_ids uuid[];
  created_ws integer := 0;
  created_cat integer := 0;
  moved_tasks integer := 0;
  deleted_cats integer := 0;
  n integer;
begin
  for u in select distinct user_id from public.workspaces loop
    -- ── 3. the 未分類 workspace ──────────────────────────
    select w.id into new_ws_id
      from public.workspaces w
      where w.user_id = u.user_id and w.is_default
      limit 1;

    -- Name follows the language the user's own data is written in: any CJK
    -- character in an existing workspace name → Chinese, otherwise English.
    -- Undetectable (e.g. emoji-only names) falls back to Chinese.
    select exists (
      select 1 from public.workspaces w
      where w.user_id = u.user_id and w.name ~ '[一-龥]'
    ) into is_zh;

    if is_zh or not exists (
      select 1 from public.workspaces w where w.user_id = u.user_id
    ) then
      bucket_name := '未分類';
    else
      bucket_name := 'Uncategorized';
    end if;

    if new_ws_id is null then
      select coalesce(min(w.sort_order), 1) - 1 into next_sort
        from public.workspaces w where w.user_id = u.user_id;

      insert into public.workspaces (user_id, name, color, icon, sort_order, is_archived, is_default)
        values (u.user_id, bucket_name, '#9C9086', '📥', next_sort, false, true)
        returning id into new_ws_id;
      created_ws := created_ws + 1;
    end if;

    -- ── 4. its 未分類 category ───────────────────────────
    select c.id into new_cat_id
      from public.categories c
      where c.workspace_id = new_ws_id
      order by c.is_default desc, c.sort_order asc
      limit 1;

    if new_cat_id is null then
      insert into public.categories (workspace_id, user_id, name, sort_order, is_collapsed, is_archived, is_default)
        values (new_ws_id, u.user_id, bucket_name, 0, false, false, true)
        returning id into new_cat_id;
      created_cat := created_cat + 1;
    else
      -- Existing category in the bucket workspace (re-run, or hand-made):
      -- make sure it carries the default flag.
      update public.categories set is_default = true
        where id = new_cat_id and is_default = false;
    end if;

    -- ── 5. old per-workspace 未分類 categories ───────────
    -- Exactly the rows 20260804120000 created or promoted: flagged default,
    -- literally named 未分類/Uncategorized, and living OUTSIDE the new bucket.
    select coalesce(array_agg(c.id), '{}'::uuid[]) into old_cat_ids
      from public.categories c
      where c.user_id = u.user_id
        and c.workspace_id <> new_ws_id
        and c.is_default
        and c.name in ('未分類', 'Uncategorized');

    if array_length(old_cat_ids, 1) > 0 then
      -- 5a. back up the category rows before anything touches them
      insert into public._backup_uncategorized_cats_20260810
        select * from public.categories c
        where c.id = any(old_cat_ids)
          and not exists (
            select 1 from public._backup_uncategorized_cats_20260810 b where b.id = c.id
          );

      -- 5b. record where each task came from, then move it. tasks carries
      --     BOTH category_id and workspace_id (denormalized names are joined
      --     at read time, not stored), so both columns must move together or
      --     the row would point at a category outside its own workspace.
      insert into public._backup_uncategorized_task_moves_20260810 (task_id, old_category_id, old_workspace_id)
        select t.id, t.category_id, t.workspace_id
          from public.tasks t
          where t.category_id = any(old_cat_ids);

      update public.tasks t
        set category_id = new_cat_id,
            workspace_id = new_ws_id,
            updated_at = now()
        where t.category_id = any(old_cat_ids);
      get diagnostics n = row_count;
      moved_tasks := moved_tasks + n;

      -- 5c. only now, with no tasks left pointing at them, delete
      delete from public.categories c
        where c.id = any(old_cat_ids)
          and not exists (select 1 from public.tasks t where t.category_id = c.id);
      get diagnostics n = row_count;
      deleted_cats := deleted_cats + n;
    end if;
  end loop;

  raise notice 'default-workspace migration: created % workspace(s), % category(ies); moved % task(s); deleted % old 未分類 category(ies)',
    created_ws, created_cat, moved_tasks, deleted_cats;
end $$;

-- ─────────────────────────────────────────────────────────
-- Post-run sanity counts (visible in the psql/CLI output)
-- ─────────────────────────────────────────────────────────
select
  (select count(*) from public.workspaces where is_default) as default_workspaces,
  (select count(*) from public.categories where is_default) as default_categories,
  (select count(*) from public._backup_uncategorized_cats_20260810) as backed_up_categories,
  (select count(*) from public._backup_uncategorized_task_moves_20260810) as backed_up_task_moves,
  (select count(*) from public.tasks t
     left join public.categories c on c.id = t.category_id
     where c.id is null or c.workspace_id <> t.workspace_id) as inconsistent_tasks;
