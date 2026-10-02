-- 「自動」settings: null means "behave as before these settings took effect".
--
-- Why: PR #131 made 預設視圖 / 每週開始日 / 預設任務時長 actually work. Every
-- existing row still holds the 0001 DB defaults (default_view='week',
-- week_start_day=1) that nobody chose, so turning them on would change the
-- screen for every user. The app treats null as 自動 (lib/settings-auto.ts):
--   default_view          null → desktop 日, phones 週
--   week_start_day        null → month grid from Sunday, week view from the selected date
--   default_task_minutes  null → click-to-create makes a 30-minute task
--
-- Affects public.user_settings only:
--   1. default_view, week_start_day: drop NOT NULL, default null.
--   2. Rows still holding the old defaults ('week' / 1) are set to null —
--      ONLY on the run that makes the columns nullable, so re-running this
--      file never wipes a 週 / 週一 a user picked afterwards.
--   3. New column default_task_minutes smallint null (15-240). The task
--      length used to be stored in buffer_time.defaultDuration (the buffer
--      block's length); a value there other than the old default 15 was set
--      by the user and is copied over once. buffer_time itself is untouched.
-- Nothing else (lunch_break, buffer_time, other columns, other tables) changes.
-- Idempotent. Rollback: supabase/rollback/20261002110000_settings_auto_defaults_down.sql

do $$
declare
  view_was_not_null boolean;
  week_was_not_null boolean;
  minutes_existed boolean;
begin
  select is_nullable = 'NO' into view_was_not_null
    from information_schema.columns
   where table_schema = 'public' and table_name = 'user_settings' and column_name = 'default_view';
  select is_nullable = 'NO' into week_was_not_null
    from information_schema.columns
   where table_schema = 'public' and table_name = 'user_settings' and column_name = 'week_start_day';
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'user_settings' and column_name = 'default_task_minutes'
  ) into minutes_existed;

  alter table public.user_settings alter column default_view drop not null;
  alter table public.user_settings alter column default_view set default null;
  alter table public.user_settings alter column week_start_day drop not null;
  alter table public.user_settings alter column week_start_day set default null;

  if view_was_not_null then
    update public.user_settings set default_view = null where default_view = 'week';
  end if;
  if week_was_not_null then
    update public.user_settings set week_start_day = null where week_start_day = 1;
  end if;

  if not minutes_existed then
    alter table public.user_settings add column default_task_minutes smallint
      constraint user_settings_default_task_minutes_range
      check (default_task_minutes is null or default_task_minutes between 15 and 240);
    update public.user_settings
       set default_task_minutes = (buffer_time->>'defaultDuration')::smallint
     where jsonb_typeof(buffer_time->'defaultDuration') = 'number'
       and (buffer_time->>'defaultDuration') ~ '^[0-9]+$'
       and (buffer_time->>'defaultDuration')::int between 15 and 240
       and (buffer_time->>'defaultDuration')::int <> 15;
  end if;
end $$;

comment on column public.user_settings.default_view is 'Initial calendar view; null = 自動 (desktop day, phones week).';
comment on column public.user_settings.week_start_day is '0=Sun..6; null = 自動 (month grid from Sunday, week view from the selected date).';
comment on column public.user_settings.default_task_minutes is 'Length of a task created by clicking an empty slot (15-240); null = 自動 (30).';
