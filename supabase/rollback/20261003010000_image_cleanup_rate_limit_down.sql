-- Rollback for 20261003010000_image_cleanup_rate_limit.sql.
-- Deploy the previous cleanup-images Edge Function FIRST: the rate-limited
-- version calls claim_image_cleanup_run() and answers 500 without it.
set lock_timeout = '5s';
drop function if exists public.claim_image_cleanup_run(uuid, integer);
drop table if exists huddle_ops.image_cleanup_runs;
