-- Migration 0008: meeting metadata on tasks
--
-- Tasks can now be marked as meetings, which surface dedicated fields
-- (attendees, location, video URL) in the detail modal and a distinct
-- visual treatment on the calendar / task list / export image.
-- Modeled as flags on the existing tasks table rather than a separate
-- entity so all existing task flows (drag, edit, complete, statistics,
-- export) keep working unchanged.

alter table public.tasks
  add column if not exists is_meeting boolean not null default false,
  add column if not exists attendees text,
  add column if not exists location text,
  add column if not exists meeting_url text;

-- Optional supporting index for upcoming "今日會議" surfaces. Cheap to
-- add now; lets a partial scan filter to meetings quickly when we wire
-- up the today-meetings panel later.
create index if not exists tasks_is_meeting_idx
  on public.tasks (user_id, scheduled_date)
  where is_meeting = true;
