-- DOWN for 20261003020200_web_billing_email.sql. Run as ONE transaction
-- (psql -1 -f this_file). Removes the three huddle_ops email functions and the
-- claimed_at column. Queued / sent mail rows stay (they are billing records);
-- the foundation tables are untouched. Re-applying the up migration works.
-- Note: the cron job that calls these functions must be switched off first.

set lock_timeout = '5s';
set statement_timeout = '60s';

drop function if exists huddle_ops.web_finish_outbox(uuid, boolean, text, boolean);
drop function if exists huddle_ops.web_claim_outbox(integer);
drop function if exists huddle_ops.web_enqueue_reminders(timestamptz);
alter table public.web_email_outbox drop column if exists claimed_at;

reset statement_timeout;
reset lock_timeout;
