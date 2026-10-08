-- Rollback for 20261008100000_brain_dump_usage.sql.
-- Undeploy (or stop calling) the brain-dump Edge Function FIRST: without these
-- functions it answers DATABASE_ERROR and the app falls back to local rules.
set lock_timeout = '5s';
drop function if exists public.brain_dump_status(uuid, date);
drop function if exists public.finish_brain_dump(uuid, date, numeric);
drop function if exists public.refund_brain_dump(uuid, date);
drop function if exists public.reserve_brain_dump(uuid, date);
drop function if exists huddle_ops.brain_dump_day_ok(date);
alter table huddle_ops.settings drop column if exists brain_dump_daily_cap;
drop table if exists public.brain_dump_usage;
