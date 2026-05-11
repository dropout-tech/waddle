-- Migration 0007: completed-tasks UX support
--
-- Adds a user-level toggle for whether "completed today" tasks remain
-- greyed-out in the main task list until the date rolls over, and
-- backfills missing completed_at timestamps for older completions so
-- the new statistics surfaces have data to work with.

-- 1) Per-user toggle. Default true so existing users get the new
-- "keep today's completions visible" behavior automatically. App code
-- treats a missing column as default-true via the mappers fallback,
-- so it's safe to apply this on a live system before deploying.
alter table public.user_settings
  add column if not exists keep_completed_today_in_list boolean not null default true;

-- 2) Backfill completed_at for rows that were marked complete before
-- the toggleTaskComplete flow started writing completed_at. We use
-- updated_at as a best-effort approximation — it's not the exact moment
-- of completion but it's the closest signal we have without rebuilding
-- history. New completions are unaffected because completed_at is
-- already set there.
update public.tasks
   set completed_at = updated_at
 where is_completed = true
   and completed_at is null;
