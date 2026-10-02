-- Rollback of 20261003030000_task_source.sql. DRAFT.
-- Before running it: turn the AI review off (unset AI_REVIEW_ENABLED) or
-- remove the ai-review function, because its task query selects tasks.source
-- and would fail closed (503) without the column. Nothing else reads it.
-- The stored source values are lost; re-applying the migration backfills
-- again from the link tables (rows whose links are gone come back as 'self').
drop trigger if exists meeting_imports_task_source on public.meeting_imports;
drop trigger if exists meeting_task_assignments_task_source on public.meeting_task_assignments;
drop trigger if exists tasks_source_guard on public.tasks;
drop function if exists huddle_ops.task_source_from_import();
drop function if exists huddle_ops.task_source_from_assignment();
drop function if exists public.tasks_source_guard();
alter table public.tasks drop column if exists source;
