-- Website subscriptions, module C: reminder enqueueing + outbox claim/finish.
-- Design: docs/billing/2026-10-02-web-billing-design.md §2.2 (續訂提醒信), §4.2
-- steps 5 and 7. Interface: docs/billing/2026-10-02-web-billing-contracts.md §3.
-- Depends only on 20261003020100_web_billing_foundation (web_subscriptions,
-- web_payment_methods, web_email_outbox). Nothing here sends mail or changes
-- who is Pro; with no web subscriptions it does nothing at all.
--
-- ROLLBACK: supabase/rollback/20261003020200_web_billing_email_down.sql
-- (drops the three functions and the claimed_at column; queued rows stay).
--
-- No BEGIN/COMMIT inside, same as the foundation migration.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ── 1. claimed_at: visibility timeout for the queue ───────────────────────
-- SKIP LOCKED only hides a row while the claiming transaction is open, but a
-- PostgREST call commits right after the claim and the send happens later.
-- claimed_at keeps a second worker away for 15 minutes; if the first worker
-- dies before finishing, the row becomes claimable again (Resend's
-- Idempotency-Key = outbox id, valid 24h, stops a double send in that case).
alter table public.web_email_outbox add column if not exists claimed_at timestamptz;

-- ── 2. web_enqueue_reminders ──────────────────────────────────────────────
-- trial_ending : trialing, not canceled, not on hold, trial_end within the
--                next 2 days (owner decision D6-A; fewer chargeback disputes).
-- renewal_reminder: annual, active, not canceled, not on hold, next charge
--                (current_period_end) 7-8 days away. Terms T15 promise "at
--                least 7 days"; enqueueing at 8 days leaves one day of slack.
-- Both: dedupe_key keeps one mail per subscription (trial) / per cycle
-- (renewal); the to_email is the auth.users email at enqueue time.
-- Money is minor units (TWD x 100); instants are UTC ISO-8601 strings.
create or replace function huddle_ops.web_enqueue_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_trial integer;
  v_renew integer;
begin
  insert into public.web_email_outbox(user_id, kind, dedupe_key, to_email, payload)
  select s.user_id, 'trial_ending', 'trial_ending:' || s.id, u.email,
         jsonb_build_object(
           'plan', s.plan,
           'amount_minor', s.price_minor,
           'trial_end', to_char(s.trial_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'first_charge_at', to_char(coalesce(s.anchor_at, s.trial_end) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'card_last4', pm.last4)
    from public.web_subscriptions s
    join auth.users u on u.id = s.user_id
    left join public.web_payment_methods pm on pm.id = s.payment_method_id
   where s.status = 'trialing'
     and not s.cancel_at_period_end
     and not s.billing_hold
     and s.trial_end > p_now
     and s.trial_end <= p_now + interval '2 days'
     and coalesce(u.email, '') <> ''
  on conflict (dedupe_key) do nothing;
  get diagnostics v_trial = row_count;

  insert into public.web_email_outbox(user_id, kind, dedupe_key, to_email, payload)
  select s.user_id, 'renewal_reminder', 'renewal:' || s.id || ':' || s.cycle, u.email,
         jsonb_build_object(
           'plan', s.plan,
           'amount_minor', s.price_minor,
           'renews_at', to_char(s.current_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'card_last4', pm.last4)
    from public.web_subscriptions s
    join auth.users u on u.id = s.user_id
    left join public.web_payment_methods pm on pm.id = s.payment_method_id
   where s.plan = 'annual'
     and s.status = 'active'
     and not s.cancel_at_period_end
     and not s.billing_hold
     and s.current_period_end > p_now + interval '7 days'
     and s.current_period_end <= p_now + interval '8 days'
     and coalesce(u.email, '') <> ''
  on conflict (dedupe_key) do nothing;
  get diagnostics v_renew = row_count;

  return v_trial + v_renew;
end $$;

-- ── 3. web_claim_outbox ───────────────────────────────────────────────────
-- Oldest queued rows first, attempts + 1, returned to the caller. Rows another
-- worker claimed in the last 15 minutes are left alone. A row that already
-- used 5 attempts and was never finished (worker died) is closed as failed
-- here instead of being retried forever.
create or replace function huddle_ops.web_claim_outbox(p_limit integer default 30)
returns setof public.web_email_outbox language plpgsql security definer set search_path = '' as $$
begin
  update public.web_email_outbox o
     set status = 'failed', claimed_at = null
   where o.status = 'queued' and o.attempts >= 5
     and (o.claimed_at is null or o.claimed_at < now() - interval '15 minutes');

  return query
  with picked as (
    select q.id
      from public.web_email_outbox q
     where q.status = 'queued'
       and q.attempts < 5
       and (q.claimed_at is null or q.claimed_at < now() - interval '15 minutes')
     order by q.created_at, q.id
     limit greatest(coalesce(p_limit, 0), 0)
       for update skip locked)
  update public.web_email_outbox o
     set attempts = o.attempts + 1, claimed_at = now()
    from picked
   where o.id = picked.id
  returning o.*;
end $$;

-- ── 4. web_finish_outbox ──────────────────────────────────────────────────
-- p_skip wins over p_ok (an explicit "do not send" must not read as sent).
-- Only a queued row can be finished, so a late duplicate call is a no-op.
-- Failure: attempts >= 5 -> failed (abnormal list), otherwise back to queued.
create or replace function huddle_ops.web_finish_outbox(
  p_id uuid, p_ok boolean, p_provider_id text default null, p_skip boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.web_email_outbox o
     set status = case
           when coalesce(p_skip, false) then 'skipped'
           when coalesce(p_ok, false) then 'sent'
           when o.attempts >= 5 then 'failed'
           else 'queued' end,
         sent_at = case when coalesce(p_ok, false) and not coalesce(p_skip, false) then now() else o.sent_at end,
         provider_id = coalesce(p_provider_id, o.provider_id),
         claimed_at = null
   where o.id = p_id and o.status = 'queued';
end $$;

-- ── 5. Privileges: service_role only ──────────────────────────────────────
revoke all on function
  huddle_ops.web_enqueue_reminders(timestamptz),
  huddle_ops.web_claim_outbox(integer),
  huddle_ops.web_finish_outbox(uuid, boolean, text, boolean)
from public, anon, authenticated;
grant execute on function
  huddle_ops.web_enqueue_reminders(timestamptz),
  huddle_ops.web_claim_outbox(integer),
  huddle_ops.web_finish_outbox(uuid, boolean, text, boolean)
to service_role;

reset statement_timeout;
reset lock_timeout;
