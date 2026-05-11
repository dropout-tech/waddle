-- Migration 0009: quick-links bar
--
-- Adds a JSONB column on user_settings to store the user's pinned
-- shortcuts surfaced in the bottom quick-links drawer (desktop) and
-- the "連結" tab (mobile). JSONB rather than a dedicated table because
-- the entity is tiny, owns no relationships, and rarely grows beyond
-- a handful of rows.

alter table public.user_settings
  add column if not exists quick_links jsonb not null default '[]'::jsonb;
