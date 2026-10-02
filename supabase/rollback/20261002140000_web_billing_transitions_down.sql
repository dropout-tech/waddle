-- DOWN for 20261002140000_web_billing_transitions.sql. Run as ONE transaction
-- (psql -1 -f this_file), only after the owner agreed (design §7 回滾), and
-- only after the web-billing / web-billing-webhook / web-billing-cron Edge
-- Functions are undeployed or their switches are off — without these
-- functions they answer 503 / fail closed (nothing is charged).
--
-- Drops every function of the up migration, the rate-limit table and the
-- last_checked_at bookkeeping columns. Billing
-- rows (web_subscriptions, web_payment_attempts, web_refunds, outbox, events)
-- are NOT touched. Nothing from 20261002120000 (P1) is changed. Re-applying the
-- up migration afterwards works (scripts/tests/web-billing-transitions.sh).

set lock_timeout = '5s';
set statement_timeout = '60s';

drop function if exists public.web_billing_server(text, jsonb);
drop function if exists huddle_ops.web_user_by_ref(text);
drop function if exists huddle_ops.web_billing_anomalies(timestamptz);
drop function if exists huddle_ops.web_store_card(uuid, text, jsonb);
drop function if exists huddle_ops.web_refund_context(text);
drop function if exists huddle_ops.web_reconcile_candidates(timestamptz, integer);
drop function if exists huddle_ops.web_open_attempts(uuid);
drop function if exists huddle_ops.web_attempt_context(text);
drop function if exists huddle_ops.web_attempt_json(uuid);
drop function if exists huddle_ops.web_webhook_finish(text, text);
drop function if exists huddle_ops.web_webhook_begin(text, text, text, jsonb);
drop function if exists huddle_ops.web_release_runner_lease(timestamptz, timestamptz);
drop function if exists huddle_ops.web_take_runner_lease(timestamptz, integer);
drop function if exists huddle_ops.web_expire_due(timestamptz);
drop function if exists huddle_ops.web_apply_refund_result(text, jsonb, timestamptz);
drop function if exists huddle_ops.web_request_refund(uuid, uuid, text, timestamptz);
drop function if exists huddle_ops.web_resume(uuid, timestamptz);
drop function if exists huddle_ops.web_cancel(uuid, timestamptz);
drop function if exists huddle_ops.web_claim_due(text, integer, timestamptz);
drop function if exists huddle_ops.web_apply_payment_result(text, jsonb, timestamptz);
drop function if exists huddle_ops.web_apply_bind_result(text, jsonb, timestamptz);
drop function if exists huddle_ops.web_attempt_progress(uuid, jsonb);
drop function if exists huddle_ops.web_start_checkout(uuid, text, text, text, boolean, timestamptz);
drop function if exists huddle_ops.web_rate_hit(uuid, text, timestamptz);
drop function if exists huddle_ops.web_txn_receipt(uuid);
drop function if exists huddle_ops.web_txn_outbox(uuid, text, text, jsonb);
drop function if exists huddle_ops.web_amount_ok(integer);
drop function if exists huddle_ops.web_order_id(text, text, integer, integer, text);
drop function if exists huddle_ops.web_taipei_day(timestamptz, integer);
drop function if exists huddle_ops.web_cycle_at(timestamptz, text, integer);
drop function if exists huddle_ops.web_iso(timestamptz);
drop table if exists huddle_ops.web_rate_hits;
-- Operational bookkeeping only (no billing facts).
alter table public.web_payment_attempts drop column if exists last_checked_at;
alter table public.web_refunds drop column if exists last_checked_at;

reset statement_timeout;
reset lock_timeout;
