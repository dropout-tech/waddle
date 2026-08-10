-- Migration: current focus ("當前重點") board
--
-- Adds a single JSONB blob column to persist the "current focus" pin
-- shown at the top of the task panel: a headline focus (free text /
-- pinned task / auto-picked) plus optional per-workspace focuses.
-- Shape lives in lib/focus.ts (`FocusSettings`) and is normalized on
-- read via `normalizeFocusSettings`, so this column intentionally has
-- no sub-schema — adding fields later needs no further migration
-- (same trick as `quick_links`, see 0009_quick_links.sql).
--
-- Idempotent: `add column if not exists`, safe to re-run.
-- Rollback: `alter table public.user_settings drop column if exists focus_board;`
-- (no backfill, no data loss beyond the focus pins themselves).

alter table public.user_settings
  add column if not exists focus_board jsonb;
