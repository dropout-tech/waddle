-- Rollback of supabase/migrations/20261002110000_settings_auto_defaults.sql.
-- Restores the 0001 shape: NOT NULL with defaults 'week' / 1, no
-- default_task_minutes column.
--
-- Data notes:
--   * 自動 (null) goes back to the old defaults 'week' / 1 — exactly what
--     those rows held before the migration.
--   * default_task_minutes is dropped. A value a user chose there is lost
--     (buffer_time is untouched, so a value copied from it is still there).
--   * Front-end code with lib/settings-auto.ts keeps working after this
--     rollback (it reads 'week' / 1 on a row without default_task_minutes
--     as 自動).
-- Idempotent.

update public.user_settings set default_view = 'week' where default_view is null;
update public.user_settings set week_start_day = 1 where week_start_day is null;
alter table public.user_settings alter column default_view set default 'week';
alter table public.user_settings alter column default_view set not null;
alter table public.user_settings alter column week_start_day set default 1;
alter table public.user_settings alter column week_start_day set not null;
alter table public.user_settings drop column if exists default_task_minutes;
