-- Migration 0013: auto category prefix on calendar task titles
--
-- Adds a per-user toggle for whether task titles in the calendar are shown
-- prefixed with their category name (e.g. "Let's Play｜夏令營"). The prefix
-- is a display-only decoration applied in the client — the stored task.title
-- is never modified — so this single boolean is all the schema needs.
--
-- Default true so existing users get the behavior automatically; those who
-- prefer clean titles can turn it off in Settings. App code treats a missing
-- column as default-true via the mappers fallback, so it's safe to apply this
-- on a live system before deploying.
alter table public.user_settings
  add column if not exists show_category_prefix boolean not null default true;
