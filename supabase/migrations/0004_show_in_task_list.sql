-- Per-task visibility flag for the left task panel.
-- When false, the task only shows on the calendar (useful for recurring
-- meetings the user doesn't want cluttering the to-do list).
-- Defaults to true so existing tasks keep current behavior.

alter table public.tasks
  add column if not exists show_in_task_list boolean not null default true;
