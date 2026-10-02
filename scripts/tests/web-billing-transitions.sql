-- Web billing P2 (module A) transitions: run by web-billing-transitions.sh on
-- a disposable cluster with EVERY migration applied. Never touches a remote DB.
-- Times are passed explicitly (p_now) so whole subscription lives can be
-- walked; checks against has_pro / paid_until use times relative to t0().
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function public.t_ok(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAILED: %', msg; end if; raise notice 'PASS: %', msg; end $$;
create or replace function public.t_err(p_sql text, p_fragment text, p_msg text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(p_fragment in sqlerrm) > 0 then raise notice 'PASS: %', p_msg; return; end if;
    raise exception 'FAILED: % (unexpected error: %)', p_msg, sqlerrm;
  end;
  raise exception 'FAILED: % (no error raised)', p_msg;
end $$;

create table public.t_clock as select now() as t0;
create or replace function public.t0() returns timestamptz language sql stable as $$ select t0 from public.t_clock $$;
create or replace function public.t_u(n integer) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-8000-0000000c' || lpad(n::text, 4, '0'))::uuid $$;
create or replace function public.tp(p text) returns timestamptz language sql immutable as $$ select p::timestamptz $$;

update huddle_ops.settings set trial_enabled = false;
insert into auth.users(id, email) select public.t_u(n), 'wb' || n || '@example.invalid' from generate_series(1, 40) n;
update auth.users set email = null where id = public.t_u(40);
insert into huddle_ops.members(user_id, alias, trial_checked, suspended)
  select id, 'wb' || right(id::text, 4), true, id = public.t_u(39) from auth.users where id::text like '00000000-0000-4000-8000-0000000c%';
update public.web_billing_config set checkout_mode = 'on', renewals_enabled = true;
-- Members who already used a trial (Apple) buy directly.
insert into public.web_trial_usage(user_id, source)
  select public.t_u(n), 'apple' from unnest(array[2,3,4,7,8,12,13,14,19,20,22,40]) n;

create or replace function public.t_start(n integer, p_kind text, p_plan text, p_now timestamptz, p_expect boolean default null)
returns jsonb language sql as $$ select huddle_ops.web_start_checkout(public.t_u(n), p_kind, p_plan, 'hs', p_expect, p_now) $$;
-- An authoritative "succeeded" (binding kinds get customer + card).
create or replace function public.t_okr(p_ref text, p_now timestamptz, p_inst text default null, p_amount integer default null, p_last4 text default '4242')
returns jsonb language sql as $$
  select huddle_ops.web_apply_payment_result(p_ref, jsonb_strip_nulls(jsonb_build_object('status', 'succeeded',
    'trade_order_id', 'TR' || p_ref, 'amount_minor', p_amount,
    'customer_id', (select 'CUS' || replace(user_id::text, '-', '') from public.web_payment_attempts where reference_order_id = p_ref),
    'instrument', jsonb_build_object('id', coalesce(p_inst, 'INS' || p_ref), 'brand', 'VISA', 'issuer_country', 'TW', 'last4', p_last4))), p_now) $$;
create or replace function public.t_res(p_ref text, p_status text, p_now timestamptz, p_code text default null,
  p_kind text default null, p_amount integer default null, p_trade text default null)
returns jsonb language sql as $$
  select huddle_ops.web_apply_payment_result(p_ref, jsonb_strip_nulls(jsonb_build_object('status', p_status,
    'trade_order_id', case when p_status = 'unknown' then p_trade else coalesce(p_trade, 'TR' || p_ref) end,
    'failure_code', p_code, 'failure_kind', p_kind, 'amount_minor', p_amount)), p_now) $$;
create or replace function public.t_sub(n integer) returns public.web_subscriptions language sql as $$
  select * from public.web_subscriptions where user_id = public.t_u(n)
   order by (status in ('incomplete','trialing','active','past_due')) desc, created_at desc limit 1 $$;
-- Claim as the cron would, but with every OTHER member's subscription held,
-- so one scenario never claims another scenario's subscription.
create or replace function public.t_claim1(n integer, p_now timestamptz) returns jsonb language plpgsql as $$
declare v jsonb; held uuid[];
begin
  select array_agg(id) into held from public.web_subscriptions
   where status in ('trialing','active','past_due') and user_id is distinct from public.t_u(n) and not billing_hold;
  update public.web_subscriptions set billing_hold = true where id = any(held);
  v := huddle_ops.web_claim_due('hs', 10, p_now);
  update public.web_subscriptions set billing_hold = false where id = any(held);
  return v;
end $$;
create or replace function public.t_outbox(n integer, p_kind text) returns bigint language sql as
$$ select count(*) from public.web_email_outbox where user_id = public.t_u(n) and kind = p_kind $$;
create table public.t_ref(k text primary key, v text);
create or replace function public.t_keep(k text, v text) returns text language sql as
$$ insert into public.t_ref values (k, v) on conflict (k) do update set v = excluded.v returning v $$;
create or replace function public.t_get(p text) returns text language sql stable as $$ select v from public.t_ref where k = p $$;

-- ── 1. Pure date / id helpers (design §2.3) ────────────────────────────────
select public.t_ok(huddle_ops.web_order_id('hs', 'AbCdEf0123456789', 1, 1, 'a') = 'hsAbCdEf0123456789c0001a01'
  and length(huddle_ops.web_order_id('hp', 'AbCdEf0123456789', 9999, 99, 'r')) = 26
  and huddle_ops.web_order_id('hs', 'AbCdEf0123456789', 12, 3, 'a') = huddle_ops.web_order_id('hs', 'AbCdEf0123456789', 12, 3, 'a'),
  'order id: {prefix2}{order_ref16}c{cycle4}a{attempt2}, 26 chars (<= 32; design §4.3 says 25, arithmetic is 26), deterministic');
select public.t_err($$select huddle_ops.web_order_id('HS', 'AbCdEf0123456789', 1, 1, 'a')$$, 'WEB_BILLING:invalid_input', 'order id rejects a bad prefix');
select public.t_err($$select huddle_ops.web_order_id('hs', 'AbCdEf0123456789', 1, 100, 'a')$$, 'WEB_BILLING:invalid_input', 'order id rejects attempt 100 (2 digits)');
select public.t_ok((select bool_and(huddle_ops.web_cycle_at(public.tp('2027-01-31 10:00+08'), 'monthly', k) = public.tp(e || ' 10:00+08'))
  from (values (1,'2027-01-31'),(2,'2027-02-28'),(3,'2027-03-31'),(4,'2027-04-30'),(5,'2027-05-31'),(6,'2027-06-30'),
               (7,'2027-07-31'),(8,'2027-08-31'),(9,'2027-09-30'),(10,'2027-10-31'),(11,'2027-11-30'),(12,'2027-12-31'),
               (13,'2028-01-31')) x(k, e)),
  '31st anchor, 12 monthly cycles: always from the anchor, clamped to month end, never drifting to the 28th');
select public.t_ok(huddle_ops.web_cycle_at(public.tp('2028-02-29 09:00+08'), 'annual', 2) = public.tp('2029-02-28 09:00+08')
  and huddle_ops.web_cycle_at(public.tp('2028-02-29 09:00+08'), 'annual', 3) = public.tp('2030-02-28 09:00+08')
  and huddle_ops.web_cycle_at(public.tp('2028-02-29 09:00+08'), 'annual', 5) = public.tp('2032-02-29 09:00+08'),
  'annual 2/29 anchor: 2/28 in common years, back to 2/29 in leap years');
select public.t_ok(huddle_ops.web_cycle_at(public.tp('2026-03-31 00:30+08'), 'monthly', 2) = public.tp('2026-04-30 00:30+08')
  and huddle_ops.web_cycle_at(public.tp('2026-03-31 00:30+08'), 'monthly', 2) <> (public.tp('2026-03-31 00:30+08') at time zone 'UTC' + interval '1 month') at time zone 'UTC'
  and huddle_ops.web_cycle_at(public.tp('2026-01-31 23:30+08'), 'monthly', 2) = public.tp('2026-02-28 23:30+08'),
  'Taipei 00:30 (UTC previous day) and 23:30 anchors use the Taipei calendar (UTC math would give 5/1)');
select public.t_ok(huddle_ops.web_taipei_day(public.tp('2026-10-02 23:30+08'), 8) = public.tp('2026-10-10 00:00+08')
  and huddle_ops.web_taipei_day(public.tp('2026-10-03 00:30+08'), 8) = public.tp('2026-10-11 00:00+08'),
  'refund deadline = Taipei date + 8 at 00:00 for 23:30 and 00:30 payments');
set timezone = 'America/New_York';
select public.t_ok(huddle_ops.web_cycle_at(public.tp('2026-03-31 00:30+08'), 'monthly', 2) = public.tp('2026-04-30 00:30+08')
  and huddle_ops.web_cycle_at(public.tp('2027-01-31 10:00+08'), 'monthly', 2) = public.tp('2027-02-28 10:00+08')
  and huddle_ops.web_taipei_day(public.tp('2026-10-03 00:30+08'), 8) = public.tp('2026-10-11 00:00+08')
  and huddle_ops.web_iso(public.tp('2026-10-03 00:30+08')) = '2026-10-02T16:30:00.000Z',
  'results do not depend on the session TimeZone (DST zone); e-mail times are UTC ISO');
reset timezone;

-- ── 2. Trial start: card binding → trialing (T6, T8, T11) ──────────────────
select public.t_keep('r1', public.t_start(1, 'start', 'monthly', public.t0()) ->> 'reference_order_id');
select public.t_ok(public.t_get('r1') ~ '^hs[0-9a-f]{16}c0000a01$'
  and (select kind = 'card_bind' and status = 'pending' and amount_minor = 0 from public.web_payment_attempts where reference_order_id = public.t_get('r1'))
  and (public.t_sub(1)).status = 'incomplete' and (public.t_sub(1)).with_trial
  and not huddle_ops.has_pro(public.t_u(1)),
  'start with trial eligibility: incomplete subscription + pending card_bind (cycle 0, NT$0), no Pro yet');
select public.t_keep('x', public.t_res(public.t_get('r1'), 'pending', public.t0())::text);
select public.t_ok(public.t_get('x')::jsonb ->> 'status' = 'pending'
  and (select slp_trade_order_id = 'TR' || public.t_get('r1') from public.web_payment_attempts where reference_order_id = public.t_get('r1')),
  'pending result only records the SLP trade id');
select public.t_keep('x', public.t_okr(public.t_get('r1'), public.t0())::text);
select public.t_ok(public.t_get('x')::jsonb ->> 'subscription_status' = 'trialing'
  and (public.t_sub(1)).trial_start = public.t0()
  and (public.t_sub(1)).trial_end = public.t0() + interval '336 hours'
  and (public.t_sub(1)).anchor_at = (public.t_sub(1)).trial_end
  and (public.t_sub(1)).access_until = (public.t_sub(1)).trial_end + interval '24 hours'
  and exists (select 1 from public.web_trial_usage where user_id = public.t_u(1) and source = 'web')
  and exists (select 1 from public.web_billing_customers where user_id = public.t_u(1))
  and (select last4 = '4242' and brand = 'VISA' and status = 'active' from public.web_payment_methods where id = (public.t_sub(1)).payment_method_id)
  and public.t_outbox(1, 'receipt') = 0,
  'binding succeeded: trialing 14 days, anchor = trial end, access = trial end + 24h, trial recorded (web), card stored, no receipt');
select public.t_ok(huddle_ops.has_pro(public.t_u(1)) and huddle_ops.paid_until(public.t_u(1)) = (public.t_sub(1)).access_until,
  'paid_until / has_pro for a trialing web subscriber = access_until');
select public.t_ok(public.t_okr(public.t_get('r1'), public.t0()) ->> 'reason' = 'already_decided',
  'replayed success is a no-op (idempotent)');
select public.t_err($$select public.t_start(1, 'start', 'monthly', public.t0())$$, 'WEB_BILLING:already_subscribed', 'second purchase while trialing refused');

-- ── 3. Direct purchase: CardBindPayment → active + receipt (D9-A) ──────────
select public.t_err($$select public.t_start(2, 'start', 'annual', public.t0(), true)$$, 'WEB_BILLING:trial_used',
  'page promised a trial but the trial is used: refused, nothing charged');
select public.t_keep('r2', public.t_start(2, 'start', 'annual', public.t0()) ->> 'reference_order_id');
select public.t_ok((select kind = 'first_purchase' and cycle = 1 and amount_minor = 99000 from public.web_payment_attempts where reference_order_id = public.t_get('r2')),
  'trial used: start = first_purchase, cycle 1, NT$990 = 99000 minor units');
select public.t_keep('x', public.t_okr(public.t_get('r2'), public.t0(), null, 99000)::text);
select public.t_ok(public.t_get('x')::jsonb ->> 'subscription_status' = 'active'
  and (public.t_sub(2)).cycle = 1 and (public.t_sub(2)).anchor_at = public.t0()
  and (public.t_sub(2)).current_period_end = huddle_ops.web_cycle_at(public.t0(), 'annual', 2)
  and (public.t_sub(2)).access_until = (public.t_sub(2)).current_period_end + interval '24 hours'
  and huddle_ops.paid_until(public.t_u(2)) = (public.t_sub(2)).access_until and huddle_ops.has_pro(public.t_u(2))
  and (select cooling_off_eligible and refund_deadline = huddle_ops.web_taipei_day(public.t0(), 8) from public.web_payment_attempts where reference_order_id = public.t_get('r2')),
  'direct purchase: active cycle 1, anchor = payment time, one year, Pro now (T11), refundable 7 days');
select public.t_ok((select count(*) = 1 and bool_and(o.dedupe_key = 'receipt:' || a.id and o.to_email = 'wb2@example.invalid'
    and (o.payload ->> 'amount_minor')::integer = 99000 and o.payload ->> 'plan' = 'annual'
    and o.payload ->> 'card_last4' = '4242' and o.payload ->> 'reference_order_id' = a.reference_order_id
    and o.payload ->> 'refund_deadline' = huddle_ops.web_iso(a.refund_deadline)
    and o.payload ->> 'period_start' = huddle_ops.web_iso(public.t0())
    and (select array_agg(k order by k) from jsonb_object_keys(o.payload) k) = array['amount_minor','card_brand','card_last4','paid_at','period_end','period_start','plan','reference_order_id','refund_deadline'])
  from public.web_email_outbox o join public.web_payment_attempts a on a.reference_order_id = public.t_get('r2')
  where o.user_id = public.t_u(2)),
  'receipt queued in the same transaction, dedupe receipt:{attempt}, contract payload fields');
select public.t_ok(public.t_okr(public.t_get('r2'), public.t0(), null, 99000) ->> 'reason' = 'already_decided' and public.t_outbox(2, 'receipt') = 1,
  'replay does not queue a second receipt');

-- ── 4. Claiming the first charge: one pending per cycle ────────────────────
select public.t_ok(jsonb_array_length(public.t_claim1(1, (public.t_sub(1)).trial_end - interval '1 minute')) = 0,
  'not claimed before the trial ends');
select public.t_keep('c1', public.t_claim1(1, (public.t_sub(1)).trial_end + interval '1 minute') -> 0 ->> 'reference_order_id');
select public.t_ok(public.t_get('c1') ~ '^hs[0-9a-f]{16}c0001a01$'
  and (select status = 'pending' and kind = 'recurring' and amount_minor = 15000 and cycle = 1 from public.web_payment_attempts where reference_order_id = public.t_get('c1')),
  'trial end: claim inserts ONE pending recurring attempt for cycle 1 (NT$150)');
select public.t_keep('x', (jsonb_array_length(public.t_claim1(1, (public.t_sub(1)).trial_end + interval '2 minutes')) = 0
  and jsonb_array_length(public.t_claim1(1, (public.t_sub(1)).trial_end + interval '3 days')) = 0)::text);
select public.t_ok(public.t_get('x')::boolean
  and (select count(*) from public.web_payment_attempts where subscription_id = (public.t_sub(1)).id and cycle = 1) = 1,
  'same cycle claimed twice: still exactly one attempt (pending blocks any further claim)');
select public.t_err($$insert into public.web_payment_attempts(subscription_id, user_id, kind, cycle, attempt_no, reference_order_id, amount_minor)
  select id, user_id, 'recurring', 1, 9, 'hsX', 15000 from public.web_subscriptions where id = (public.t_sub(1)).id$$,
  'web_payment_attempts_one_open_per_cycle', 'database refuses a second undecided attempt for the cycle');
update public.web_billing_config set renewals_enabled = false;
select public.t_ok(huddle_ops.web_claim_due('hs', 10, public.t0() + interval '400 days') = '[]'::jsonb,
  'renewals switch off: claim returns nothing at all');
update public.web_billing_config set renewals_enabled = true;
select public.t_keep('x', public.t_okr(public.t_get('c1'), (public.t_sub(1)).trial_end + interval '3 minutes', null, 15000)::text);
select public.t_ok(public.t_get('x')::jsonb ->> 'subscription_status' = 'active'
  and (public.t_sub(1)).cycle = 1
  and (public.t_sub(1)).current_period_start = (public.t_sub(1)).trial_end
  and (public.t_sub(1)).current_period_end = huddle_ops.web_cycle_at((public.t_sub(1)).trial_end, 'monthly', 2)
  and public.t_outbox(1, 'receipt') = 1
  and (select cooling_off_eligible from public.web_payment_attempts where reference_order_id = public.t_get('c1')),
  'first charge after trial: active, period from anchor, receipt queued, 7-day refund right (R3)');
select public.t_ok(jsonb_array_length(public.t_claim1(1, (public.t_sub(1)).trial_end + interval '4 minutes')) = 0,
  'a paid cycle is not claimed again');

-- ── 5. Failure → past_due + grace → retries +1/+3/+6 days → recovery ──────
select public.t_keep('d1', (public.t_sub(1)).current_period_end::text);
select public.t_keep('c2', public.t_claim1(1, public.t_get('d1')::timestamptz + interval '1 minute') -> 0 ->> 'reference_order_id');
select public.t_keep('x', public.t_res(public.t_get('c2'), 'failed', public.t_get('d1')::timestamptz + interval '2 minutes', '1203', 'hard')::text);
select public.t_ok(public.t_get('x')::jsonb ->> 'subscription_status' = 'past_due'
  and (public.t_sub(1)).grace_until = public.t_get('d1')::timestamptz + interval '168 hours'
  and (public.t_sub(1)).access_until = (public.t_sub(1)).grace_until
  and (public.t_sub(1)).next_retry_at = public.t_get('d1')::timestamptz + interval '24 hours'
  and (public.t_sub(1)).retry_count = 0 and not (public.t_sub(1)).needs_customer_action
  and public.t_outbox(1, 'payment_failed') = 1
  and (select payload ->> 'next_retry_at' = huddle_ops.web_iso(public.t_get('d1')::timestamptz + interval '24 hours')
        and payload ->> 'grace_until' = huddle_ops.web_iso(public.t_get('d1')::timestamptz + interval '168 hours')
        and dedupe_key = 'payment_failed:' || (public.t_sub(1)).id || ':2'
       from public.web_email_outbox where user_id = public.t_u(1) and kind = 'payment_failed')
  and huddle_ops.has_pro(public.t_u(1)) and huddle_ops.paid_until(public.t_u(1)) = (public.t_sub(1)).grace_until,
  'renewal failed: past_due, grace = due + 7 days, Pro kept until grace, retry at +1 day, payment_failed queued');
select public.t_ok(jsonb_array_length(public.t_claim1(1, public.t_get('d1')::timestamptz + interval '2 hours')) = 0,
  'no retry before next_retry_at');
select public.t_keep('c3', public.t_claim1(1, public.t_get('d1')::timestamptz + interval '24 hours 1 minute') -> 0 ->> 'reference_order_id');
select public.t_ok(public.t_get('c3') like '%c0002a02'
  and public.t_res(public.t_get('c3'), 'failed', public.t_get('d1')::timestamptz + interval '24 hours 2 minutes', '1203', 'hard') ->> 'status' = 'failed'
  and (public.t_sub(1)).retry_count = 1 and (public.t_sub(1)).next_retry_at = public.t_get('d1')::timestamptz + interval '72 hours',
  'retry 1 (attempt a02) failed: next retry at due + 3 days');
select public.t_keep('c4', public.t_claim1(1, public.t_get('d1')::timestamptz + interval '72 hours 1 minute') -> 0 ->> 'reference_order_id');
select public.t_ok(public.t_res(public.t_get('c4'), 'failed', public.t_get('d1')::timestamptz + interval '72 hours 2 minutes', '1203', 'hard') ->> 'status' = 'failed'
  and (public.t_sub(1)).retry_count = 2 and (public.t_sub(1)).next_retry_at = public.t_get('d1')::timestamptz + interval '144 hours'
  and public.t_outbox(1, 'payment_failed') = 1,
  'retry 2 failed: next retry at due + 6 days; still one payment_failed e-mail for the cycle');
select public.t_keep('c5', public.t_claim1(1, public.t_get('d1')::timestamptz + interval '144 hours 1 minute') -> 0 ->> 'reference_order_id');
select public.t_keep('x', public.t_okr(public.t_get('c5'), public.t_get('d1')::timestamptz + interval '144 hours 2 minutes', null, 15000)::text);
select public.t_ok(public.t_get('x')::jsonb ->> 'subscription_status' = 'active'
  and (public.t_sub(1)).cycle = 2 and (public.t_sub(1)).grace_until is null and (public.t_sub(1)).retry_count = 0
  and (public.t_sub(1)).current_period_start = public.t_get('d1')::timestamptz
  and (public.t_sub(1)).current_period_end = huddle_ops.web_cycle_at((public.t_sub(1)).anchor_at, 'monthly', 3)
  and public.t_outbox(1, 'receipt') = 2
  and not (select cooling_off_eligible from public.web_payment_attempts where reference_order_id = public.t_get('c5')),
  'retry 3 succeeded: active cycle 2 (period still from the anchor), grace cleared; monthly renewal not refundable');
select public.t_err(format($$select huddle_ops.web_request_refund(public.t_u(1), %L, 'hs', %L)$$,
    (select id from public.web_payment_attempts where reference_order_id = public.t_get('c5')), public.t_get('d1')::timestamptz + interval '145 hours'),
  'WEB_BILLING:not_refundable', 'monthly renewal charge cannot be refunded by the member (R3)');

-- ── 6. Third failure exhausts retries; grace end → expired (no dunning) ───
select public.t_keep('r4', public.t_start(4, 'start', 'monthly', public.t0() - interval '40 days') ->> 'reference_order_id');
select public.t_okr(public.t_get('r4'), public.t0() - interval '40 days', null, 15000);
select public.t_keep('d4', (public.t_sub(4)).current_period_end::text);
select public.t_res(public.t_claim1(4, public.t_get('d4')::timestamptz + interval '1 minute') -> 0 ->> 'reference_order_id', 'failed', public.t_get('d4')::timestamptz + interval '2 minutes', '1203', 'hard');
select public.t_res(public.t_claim1(4, public.t_get('d4')::timestamptz + interval '24 hours 1 minute') -> 0 ->> 'reference_order_id', 'failed', public.t_get('d4')::timestamptz + interval '25 hours', '1203', 'hard');
select public.t_res(public.t_claim1(4, public.t_get('d4')::timestamptz + interval '72 hours 1 minute') -> 0 ->> 'reference_order_id', 'failed', public.t_get('d4')::timestamptz + interval '73 hours', '1203', 'hard');
select public.t_res(public.t_claim1(4, public.t_get('d4')::timestamptz + interval '144 hours 1 minute') -> 0 ->> 'reference_order_id', 'failed', public.t_get('d4')::timestamptz + interval '145 hours', '1203', 'hard');
select public.t_ok((public.t_sub(4)).status = 'past_due' and (public.t_sub(4)).retry_count = 3 and (public.t_sub(4)).next_retry_at is null
  and (select count(*) from public.web_payment_attempts where subscription_id = (public.t_sub(4)).id and kind = 'recurring') = 4
  and jsonb_array_length(public.t_claim1(4, public.t_get('d4')::timestamptz + interval '167 hours')) = 0,
  'after the first failure + 3 retries: no further attempt inside the grace');
select public.t_keep('x', huddle_ops.web_expire_due(public.t_get('d4')::timestamptz + interval '168 hours 1 minute')::text);
select public.t_ok((public.t_get('x')::jsonb ->> 'grace_exhausted')::integer >= 1
  and (select status = 'expired' and cancel_reason = 'grace_exhausted' and ended_at is not null
       from public.web_subscriptions where user_id = public.t_u(4))
  and public.t_outbox(4, 'canceled') = 1
  and (select payload ->> 'reason' = 'grace_exhausted' from public.web_email_outbox where user_id = public.t_u(4) and kind = 'canceled')
  and not huddle_ops.has_pro(public.t_u(4)) and huddle_ops.paid_until(public.t_u(4)) < now()
  and not exists (select 1 from public.web_payment_attempts where user_id = public.t_u(4) and status in ('pending','unknown')),
  'grace used up: expired (grace_exhausted), canceled e-mail, Pro gone, nothing owed');

-- ── 7. 4900 (needs 3-D Secure): no automatic retry, customer pays ─────────
select public.t_keep('r3', public.t_start(3, 'start', 'monthly', public.t0()) ->> 'reference_order_id');
select public.t_okr(public.t_get('r3'), public.t0(), null, 15000);
select public.t_keep('d3', (public.t_sub(3)).current_period_end::text);
select public.t_keep('c3a', public.t_claim1(3, public.t_get('d3')::timestamptz + interval '1 minute') -> 0 ->> 'reference_order_id');
select public.t_keep('x', public.t_res(public.t_get('c3a'), 'failed', public.t_get('d3')::timestamptz + interval '2 minutes', '4900', 'customer_action')::text);
select public.t_ok(public.t_get('x')::jsonb ->> 'subscription_status' = 'past_due'
  and (public.t_sub(3)).needs_customer_action and (public.t_sub(3)).next_retry_at is null
  and public.t_outbox(3, 'action_required') = 1 and public.t_outbox(3, 'payment_failed') = 0
  and (select dedupe_key = 'action_required:' || (public.t_sub(3)).id || ':2' from public.web_email_outbox where user_id = public.t_u(3) and kind = 'action_required'),
  '4900: past_due with needs_customer_action, no retry scheduled, action_required queued');
select public.t_ok(jsonb_array_length(public.t_claim1(3, public.t_get('d3')::timestamptz + interval '2 days')) = 0
  and jsonb_array_length(public.t_claim1(3, public.t_get('d3')::timestamptz + interval '6 days')) = 0,
  'needs_customer_action is never claimed by the cron');
select public.t_keep('p3a', public.t_start(3, 'pay', null, public.t_get('d3')::timestamptz + interval '1 hour') ->> 'reference_order_id');
select public.t_ok((select kind = 'customer_present' and cycle = 2 and amount_minor = 15000 from public.web_payment_attempts where reference_order_id = public.t_get('p3a'))
  and public.t_get('p3a') like '%c0002a02',
  'pay_now: customer-present attempt for the unpaid cycle 2');
select public.t_err($$select public.t_start(3, 'pay', null, public.t0())$$, 'WEB_BILLING:payment_in_progress', 'second pay_now while one is undecided refused');
select public.t_ok(public.t_res(public.t_get('p3a'), 'failed', public.t_get('d3')::timestamptz + interval '2 hours', '1203') ->> 'state_change' = 'false'
  and (public.t_sub(3)).status = 'past_due' and (public.t_sub(3)).needs_customer_action,
  'customer-present failure: no automatic consequence (member can try again)');
select public.t_keep('p3b', public.t_start(3, 'pay', null, public.t_get('d3')::timestamptz + interval '3 hours') ->> 'reference_order_id');
select public.t_ok(public.t_okr(public.t_get('p3b'), public.t_get('d3')::timestamptz + interval '3 hours', null, 15000) ->> 'subscription_status' = 'active'
  and (public.t_sub(3)).cycle = 2 and not (public.t_sub(3)).needs_customer_action
  and (public.t_sub(3)).current_period_start = public.t_get('d3')::timestamptz,
  'customer paid the unpaid cycle: active cycle 2, flag cleared');

-- ── 8. Cancel and resume (T7, T16, T17) ───────────────────────────────────
select public.t_okr(public.t_start(5, 'start', 'monthly', public.t0()) ->> 'reference_order_id', public.t0());
select public.t_keep('x', huddle_ops.web_cancel(public.t_u(5), public.t0() + interval '1 day')::text);
select public.t_keep('y', huddle_ops.web_cancel(public.t_u(5), public.t0() + interval '2 days')::text);
select public.t_ok(public.t_get('x')::jsonb ->> 'changed' = 'true'
  and (public.t_sub(5)).cancel_at_period_end and (public.t_sub(5)).cancel_reason = 'user'
  and (public.t_sub(5)).access_until = (public.t_sub(5)).trial_end
  and public.t_outbox(5, 'canceled') = 1
  and (select dedupe_key = 'canceled:' || (public.t_sub(5)).id || ':user:0' and payload ->> 'reason' = 'user'
       from public.web_email_outbox where user_id = public.t_u(5) and kind = 'canceled')
  and public.t_get('y')::jsonb ->> 'changed' = 'false',
  'cancel during trial: Pro until trial end exactly (no buffer), canceled e-mail once, idempotent');
select public.t_ok(jsonb_array_length(public.t_claim1(5, (public.t_sub(5)).trial_end + interval '1 minute')) = 0,
  'canceled trial is never charged (T7)');
select public.t_keep('x', huddle_ops.web_expire_due((public.t_sub(5)).trial_end + interval '1 minute')::text);
select public.t_ok((public.t_get('x')::jsonb ->> 'canceled_expired')::integer >= 1
  and (select status = 'expired' and cancel_reason = 'user' from public.web_subscriptions where user_id = public.t_u(5))
  and public.t_outbox(5, 'canceled') = 1,
  'canceled trial ends at trial end → expired, no second e-mail');
select public.t_err($$select huddle_ops.web_resume(public.t_u(5), public.t0())$$, 'WEB_BILLING:not_found', 'expired cannot be resumed (buy again)');
select public.t_okr(public.t_start(6, 'start', 'monthly', public.t0()) ->> 'reference_order_id', public.t0());
select huddle_ops.web_cancel(public.t_u(6), public.t0() + interval '1 hour');
select public.t_ok(huddle_ops.web_resume(public.t_u(6), public.t0() + interval '2 hours') ->> 'changed' = 'true'
  and not (public.t_sub(6)).cancel_at_period_end and (public.t_sub(6)).cancel_reason is null
  and (public.t_sub(6)).access_until = (public.t_sub(6)).trial_end + interval '24 hours',
  'resume before the end: renewals back on, +24h buffer restored');
select public.t_keep('c6', public.t_claim1(6, (public.t_sub(6)).trial_end + interval '1 minute') -> 0 ->> 'reference_order_id');
select public.t_ok(public.t_get('c6') is not null and public.t_okr(public.t_get('c6'), (public.t_sub(6)).trial_end + interval '2 minutes', null, 15000) ->> 'subscription_status' = 'active',
  'resumed subscription is charged at trial end');

-- ── 9. 7-day refund (R3–R7, D3) ────────────────────────────────────────────
select public.t_keep('r7', public.t_start(7, 'start', 'monthly', public.t0() - interval '3 days') ->> 'reference_order_id');
select public.t_okr(public.t_get('r7'), public.t0() - interval '3 days', 'CARD7', 15000);
select public.t_keep('rf7', huddle_ops.web_request_refund(public.t_u(7),
  (select id from public.web_payment_attempts where reference_order_id = public.t_get('r7')), 'hs', public.t0() - interval '2 days') ->> 'reference_order_id');
select public.t_ok(public.t_get('rf7') ~ '^hs[0-9a-f]{16}c0001r01$'
  and (select status = 'requested' and amount_minor = 15000 and reason = 'cooling_off' and requested_by = 'user'
          and due_by = huddle_ops.web_taipei_day(public.t0() - interval '2 days', 16)
       from public.web_refunds where reference_order_id = public.t_get('rf7'))
  and (public.t_sub(7)).cancel_at_period_end and (public.t_sub(7)).cancel_reason = 'refund'
  and (public.t_sub(7)).access_until = (public.t_sub(7)).current_period_end,
  'refund requested within 7 days: automatic (first time), renewals stopped at once, due_by = 15 days from next day');
select public.t_err($$select huddle_ops.web_resume(public.t_u(7), public.t0() - interval '2 days')$$, 'WEB_BILLING:not_found',
  'a refund cancellation cannot be undone by resume');
select public.t_err(format($$select huddle_ops.web_request_refund(public.t_u(7), %L, 'hs', %L)$$,
    (select id from public.web_payment_attempts where reference_order_id = public.t_get('r7')), public.t0() - interval '2 days'),
  'WEB_BILLING:not_refundable', 'a second refund of the same charge refused');
select public.t_err(format($$select huddle_ops.web_request_refund(public.t_u(8), %L, 'hs', %L)$$,
    (select id from public.web_payment_attempts where reference_order_id = public.t_get('r7')), public.t0() - interval '2 days'),
  'WEB_BILLING:not_found', 'another member cannot refund my charge');
select public.t_ok(huddle_ops.web_apply_refund_result(public.t_get('rf7'), '{"status":"processing","refund_order_id":"RF7"}', public.t0() - interval '2 days') ->> 'status' = 'processing',
  'SLP accepted the refund: processing');
select public.t_keep('x', huddle_ops.web_apply_refund_result(public.t_get('rf7'), '{"status":"succeeded","refund_order_id":"RF7","amount_minor":15000}', public.t0() - interval '2 days')::text);
select public.t_ok(public.t_get('x')::jsonb #>> '{unbind,instrument_id}' = 'CARD7'
  and (public.t_sub(7)).status = 'refunded'
  and (public.t_sub(7)).access_until = public.t0() - interval '2 days' and (public.t_sub(7)).ended_at = public.t0() - interval '2 days'
  and (select refunded_minor = 15000 from public.web_payment_attempts where reference_order_id = public.t_get('r7'))
  and (select status = 'succeeded' and completed_at is not null from public.web_refunds where reference_order_id = public.t_get('rf7'))
  and public.t_outbox(7, 'refund_done') = 1
  and (select dedupe_key = 'refund_done:' || (select id from public.web_refunds where reference_order_id = public.t_get('rf7'))
          and (payload ->> 'amount_minor')::integer = 15000 and payload ->> 'reference_order_id' = public.t_get('r7')
       from public.web_email_outbox where user_id = public.t_u(7) and kind = 'refund_done')
  and (select status = 'disabled' from public.web_payment_methods where slp_instrument_id = 'CARD7')
  and not huddle_ops.has_pro(public.t_u(7)) and huddle_ops.paid_until(public.t_u(7)) < now(),
  'refund succeeded: refunded, access_until = refund time, refunded_minor, refund_done queued, card disabled + unbind, Pro gone (R7)');
select public.t_ok(huddle_ops.web_apply_refund_result(public.t_get('rf7'), '{"status":"succeeded","refund_order_id":"RF7"}', public.t0() - interval '1 day') ->> 'reason' = 'already_decided'
  and public.t_outbox(7, 'refund_done') = 1,
  'refund result replay is a no-op');
select public.t_keep('r7b', public.t_start(7, 'start', 'monthly', public.t0() - interval '1 day') ->> 'reference_order_id');
select public.t_okr(public.t_get('r7b'), public.t0() - interval '1 day', 'CARD7B', 15000);
select public.t_ok(huddle_ops.web_request_refund(public.t_u(7), (select id from public.web_payment_attempts where reference_order_id = public.t_get('r7b')),
    'hs', public.t0() - interval '12 hours') ->> 'status' = 'needs_review',
  'second self-service refund of the same member goes to a human (D3 auto_refund_limit = 1)');
-- Day 8 is too late: payment at Taipei 23:30 on 9/10 → last day 9/17, closes 9/18 00:00.
select public.t_keep('r8', public.t_start(8, 'start', 'monthly', public.tp('2026-09-10 23:30+08')) ->> 'reference_order_id');
select public.t_okr(public.t_get('r8'), public.tp('2026-09-10 23:30+08'), null, 15000);
select public.t_ok((select refund_deadline = public.tp('2026-09-18 00:00+08') from public.web_payment_attempts where reference_order_id = public.t_get('r8')),
  'refund deadline for a 23:30 Taipei payment = 8th day 00:00 Taipei');
select public.t_err(format($$select huddle_ops.web_request_refund(public.t_u(8), %L, 'hs', %L)$$,
    (select id from public.web_payment_attempts where reference_order_id = public.t_get('r8')), '2026-09-18 00:00:01+08'),
  'WEB_BILLING:not_refundable', 'refund on the 8th day refused (server clock, not the page)');
select public.t_ok(huddle_ops.web_request_refund(public.t_u(8), (select id from public.web_payment_attempts where reference_order_id = public.t_get('r8')),
    'hs', public.tp('2026-09-17 23:59:00+08')) ->> 'status' = 'requested',
  'refund on the 7th day at 23:59 accepted');

-- ── 10. Taipei day boundaries in real flows (T13, R5) ──────────────────────
select public.t_keep('r19', public.t_start(19, 'start', 'monthly', public.tp('2026-03-31 00:30+08')) ->> 'reference_order_id');
select public.t_okr(public.t_get('r19'), public.tp('2026-03-31 00:30+08'), null, 15000);
select public.t_keep('r20', public.t_start(20, 'start', 'monthly', public.tp('2026-01-31 23:30+08')) ->> 'reference_order_id');
select public.t_okr(public.t_get('r20'), public.tp('2026-01-31 23:30+08'), null, 15000);
select public.t_ok((public.t_sub(19)).current_period_end = public.tp('2026-04-30 00:30+08')
  and (select refund_deadline = public.tp('2026-04-08 00:00+08') from public.web_payment_attempts where reference_order_id = public.t_get('r19'))
  and (public.t_sub(20)).current_period_end = public.tp('2026-02-28 23:30+08')
  and (select refund_deadline = public.tp('2026-02-08 00:00+08') from public.web_payment_attempts where reference_order_id = public.t_get('r20')),
  'Taipei 00:30 (UTC 3/30) purchase renews 4/30 00:30; Taipei 23:30 1/31 renews 2/28 23:30; deadlines by Taipei date');
select public.t_keep('r21', public.t_start(21, 'start', 'monthly', public.tp('2026-10-25 12:00+08')) ->> 'reference_order_id');
select public.t_okr(public.t_get('r21'), public.tp('2026-10-25 12:00+08'));
select public.t_keep('c21', public.t_claim1(21, public.tp('2026-11-08 12:01+08')) -> 0 ->> 'reference_order_id');
select public.t_okr(public.t_get('c21'), public.tp('2026-11-08 12:02+08'), null, 15000);
select public.t_ok((public.t_sub(21)).trial_end = public.tp('2026-11-08 12:00+08')
  and (public.t_sub(21)).current_period_start = public.tp('2026-11-08 12:00+08')
  and (public.t_sub(21)).current_period_end = public.tp('2026-12-08 12:00+08'),
  'trial crossing a month end: 10/25 → first charge 11/8 → next 12/8 (anchor = trial end)');

-- ── 11. 31st anchor: 12 real charges, and 2/29 annual ─────────────────────
select public.t_okr(public.t_start(12, 'start', 'monthly', public.tp('2027-01-31 10:00+08')) ->> 'reference_order_id', public.tp('2027-01-31 10:00+08'), null, 15000);
do $$
declare k integer; d timestamptz; ref text; starts timestamptz[] := '{}';
begin
  for k in 2 .. 13 loop
    d := (public.t_sub(12)).current_period_end;
    ref := public.t_claim1(12, d + interval '1 minute') -> 0 ->> 'reference_order_id';
    if ref is null or ref not like '%c' || lpad(k::text, 4, '0') || 'a01' then raise exception 'FAILED: cycle % not claimed (%)', k, ref; end if;
    perform public.t_okr(ref, d + interval '2 minutes', null, 15000);
    starts := starts || (public.t_sub(12)).current_period_start;
  end loop;
  if starts <> array['2027-02-28 10:00+08','2027-03-31 10:00+08','2027-04-30 10:00+08','2027-05-31 10:00+08','2027-06-30 10:00+08',
      '2027-07-31 10:00+08','2027-08-31 10:00+08','2027-09-30 10:00+08','2027-10-31 10:00+08','2027-11-30 10:00+08',
      '2027-12-31 10:00+08','2028-01-31 10:00+08']::timestamptz[]
     or (public.t_sub(12)).cycle <> 13 or (public.t_sub(12)).current_period_end <> '2028-02-29 10:00+08'::timestamptz then
    raise exception 'FAILED: 31st anchor schedule %', starts;
  end if;
end $$;
select public.t_ok(true, 'monthly 31st anchor through the real claim → success path: 2/28, 3/31, 4/30 … 1/31, then 2/29 (leap)');
select public.t_okr(public.t_start(13, 'start', 'annual', public.tp('2028-02-29 09:00+08')) ->> 'reference_order_id', public.tp('2028-02-29 09:00+08'), null, 99000);
select public.t_okr(public.t_claim1(13, public.tp('2029-02-28 09:01+08')) -> 0 ->> 'reference_order_id', public.tp('2029-02-28 09:02+08'), null, 99000);
select public.t_ok((public.t_sub(13)).current_period_end = public.tp('2030-02-28 09:00+08')
  and (public.t_sub(13)).current_period_start = public.tp('2029-02-28 09:00+08') and (public.t_sub(13)).cycle = 2
  and (select cooling_off_eligible from public.web_payment_attempts where subscription_id = (public.t_sub(13)).id and cycle = 2),
  'annual 2/29 anchor: renews 2029-02-28, next 2030-02-28; annual renewal is refundable (R3)');

-- ── 12. Unknown outcome: never re-charged, resolved only by SLP ───────────
select public.t_okr(public.t_start(16, 'start', 'monthly', public.t0()) ->> 'reference_order_id', public.t0());
select public.t_keep('c16', public.t_claim1(16, (public.t_sub(16)).trial_end + interval '1 minute') -> 0 ->> 'reference_order_id');
select public.t_ok(public.t_res(public.t_get('c16'), 'unknown', (public.t_sub(16)).trial_end + interval '2 minutes') ->> 'status' = 'unknown'
  and jsonb_array_length(public.t_claim1(16, (public.t_sub(16)).trial_end + interval '2 hours')) = 0
  and jsonb_array_length(public.t_claim1(16, (public.t_sub(16)).trial_end + interval '5 days')) = 0,
  'SLP outcome unknown (timeout): no new charge for this subscription, ever, until resolved');
select public.t_err($$select public.t_start(16, 'card', null, public.t0())$$, 'WEB_BILLING:payment_in_progress', 'card change refused while a charge is undecided');
select public.t_ok(((huddle_ops.web_expire_due((public.t_sub(16)).trial_end + interval '30 days')) is not null)
  and (public.t_sub(16)).status = 'trialing',
  'an undecided charge keeps the subscription open (a late success must still find it)');
select public.t_keep('x', public.t_res(public.t_get('c16'), 'succeeded', (public.t_sub(16)).trial_end + interval '1 day', null, null, 15000, 'TRLATE16')::text);
select public.t_ok(public.t_get('x')::jsonb ->> 'subscription_status' = 'active'
  and (select status = 'succeeded' and slp_trade_order_id = 'TRLATE16' from public.web_payment_attempts where reference_order_id = public.t_get('c16')),
  'late authoritative success (webhook → SLP query) resolves unknown → active');

-- ── 13. Untrusted / inconsistent results are refused ───────────────────────
select public.t_okr(public.t_start(17, 'start', 'monthly', public.t0()) ->> 'reference_order_id', public.t0());
select public.t_keep('c17', public.t_claim1(17, (public.t_sub(17)).trial_end + interval '1 minute') -> 0 ->> 'reference_order_id');
select public.t_res(public.t_get('c17'), 'pending', (public.t_sub(17)).trial_end + interval '2 minutes');
select public.t_ok(public.t_res(public.t_get('c17'), 'succeeded', (public.t_sub(17)).trial_end + interval '3 minutes', null, null, 15000, 'SOMEONE-ELSE') ->> 'reason' = 'trade_mismatch'
  and (public.t_sub(17)).status = 'trialing',
  'a result for a different SLP trade cannot decide this attempt');
select public.t_keep('x', public.t_res(public.t_get('c17'), 'succeeded', (public.t_sub(17)).trial_end + interval '3 minutes', null, null, 1500)::text);
select public.t_ok(public.t_get('x')::jsonb ->> 'reason' = 'amount_mismatch'
  and (select status = 'unknown' and failure_code = 'amount_mismatch' from public.web_payment_attempts where reference_order_id = public.t_get('c17'))
  and (public.t_sub(17)).status = 'trialing',
  'success with the wrong amount (NT$15 instead of NT$150) is parked as unknown for a human, not activated');
select public.t_ok(huddle_ops.web_apply_payment_result('hsNOPE', '{"status":"succeeded"}') ->> 'reason' = 'unknown_order',
  'result for an order we never created is ignored');

-- ── 14. 1201 (card still cloning): soft retries, 4th counts as failure ────
select public.t_okr(public.t_start(18, 'start', 'monthly', public.t0()) ->> 'reference_order_id', public.t0());
do $$
declare i integer; e timestamptz := (public.t_sub(18)).trial_end; ref text; r jsonb;
begin
  for i in 1 .. 4 loop
    ref := public.t_claim1(18, e + make_interval(mins => 10 * i)) -> 0 ->> 'reference_order_id';
    if ref is null then raise exception 'FAILED: soft retry % not claimed', i; end if;
    r := public.t_res(ref, 'failed', e + make_interval(mins => 10 * i + 1), '1201', 'soft');
    if i < 4 and ((public.t_sub(18)).status <> 'trialing' or r ->> 'retry' <> 'soon') then raise exception 'FAILED: soft % changed state %', i, r; end if;
  end loop;
  if (public.t_sub(18)).status <> 'past_due' then raise exception 'FAILED: 4th 1201 should be a real failure'; end if;
end $$;
select public.t_ok(true, '1201: retried on the next tick without counting (3 times), 4th is treated as a failure → past_due');
select public.t_ok((public.t_sub(18)).grace_until = (public.t_sub(18)).trial_end + interval '168 hours'
  and (public.t_sub(18)).access_until = (public.t_sub(18)).grace_until and huddle_ops.has_pro(public.t_u(18))
  and public.t_outbox(18, 'payment_failed') = 1
  and (select dedupe_key = 'payment_failed:' || (public.t_sub(18)).id || ':1' from public.web_email_outbox where user_id = public.t_u(18) and kind = 'payment_failed'),
  'first charge after the trial failed (D4-A): past_due, 7-day grace from trial end, Pro kept, payment_failed queued for cycle 1');

-- ── 15. Card change (design §2.2 換卡) ─────────────────────────────────────
select public.t_okr(public.t_start(14, 'start', 'monthly', public.t0()) ->> 'reference_order_id', public.t0(), 'OLDCARD14', 15000);
select public.t_keep('k14', public.t_start(14, 'card', null, public.t0() + interval '1 day') ->> 'reference_order_id');
select public.t_ok(public.t_get('k14') like '%c0000a01'
  and (select kind = 'card_bind' and amount_minor = 0 from public.web_payment_attempts where reference_order_id = public.t_get('k14')),
  'card change: CardBind attempt on the existing subscription, no money');
select public.t_keep('x', public.t_okr(public.t_get('k14'), public.t0() + interval '1 day', 'NEWCARD14', null, '1111')::text);
select public.t_ok(public.t_get('x')::jsonb #>> '{unbind,instrument_id}' = 'OLDCARD14'
  and (select slp_instrument_id = 'NEWCARD14' and last4 = '1111' from public.web_payment_methods where id = (public.t_sub(14)).payment_method_id)
  and (select status = 'disabled' from public.web_payment_methods where slp_instrument_id = 'OLDCARD14')
  and (public.t_claim1(14, (public.t_sub(14)).current_period_end + interval '1 minute') -> 0 ->> 'instrument_id') = 'NEWCARD14',
  'card changed: subscription uses the new card, old card disabled + returned for unbind, next charge on the new card');
select public.t_ok(huddle_ops.web_apply_payment_result(public.t_get('r2'), jsonb_build_object('status', 'succeeded', 'trade_order_id', 'TR' || public.t_get('r2'),
    'customer_id', 'CUS-of-someone', 'instrument', jsonb_build_object('id', 'NEWCARD14'))) ->> 'reason' = 'already_decided',
  'decided attempts ignore later results');

-- ── 16. Incomplete checkouts and guards on starting ────────────────────────
select public.t_keep('r15', public.t_start(15, 'start', 'monthly', public.t0()) ->> 'reference_order_id');
select public.t_keep('x', huddle_ops.web_expire_due(public.t0() + interval '61 minutes')::text);
select public.t_ok((public.t_get('x')::jsonb ->> 'incomplete_expired')::integer >= 1
  and (select status = 'incomplete_expired' and access_until is null from public.web_subscriptions where order_ref = substr(public.t_get('r15'), 3, 16))
  and not exists (select 1 from public.web_trial_usage where user_id = public.t_u(15)),
  'abandoned checkout closes after 1 hour and does not consume the trial');
select public.t_keep('x', public.t_okr(public.t_get('r15'), public.t0() + interval '2 hours')::text);
select public.t_ok(public.t_get('x')::jsonb ->> 'late' = 'true'
  and (select status = 'incomplete_expired' from public.web_subscriptions where order_ref = substr(public.t_get('r15'), 3, 16)),
  'late binding success on a closed checkout changes nothing (no money moved)');
select public.t_ok(public.t_start(15, 'start', 'monthly', public.t0() + interval '3 hours') ->> 'kind' = 'card_bind',
  'member can start again (new subscription, trial still available)');
select public.t_keep('r22', public.t_start(22, 'start', 'monthly', public.t0()) ->> 'reference_order_id');
select public.t_res(public.t_get('r22'), 'pending', public.t0());
select public.t_ok((huddle_ops.web_expire_due(public.t0() + interval '2 hours') is not null)
  and (public.t_sub(22)).status = 'incomplete',
  'checkout with an undecided payment is NOT closed (its money may still arrive)');
select public.t_err($$select public.t_start(22, 'start', 'annual', public.t0() + interval '3 hours')$$, 'WEB_BILLING:payment_in_progress',
  'new purchase refused while a previous payment is undecided');
select public.apply_billing_snapshot('wb-9', jsonb_build_array(jsonb_build_object('user_id', public.t_u(9), 'expires_at', now() + interval '30 days', 'observed_at_ms', 1)));
select public.t_err($$select public.t_start(9, 'start', 'monthly', now())$$, 'WEB_BILLING:apple_active', 'active Apple subscription blocks website purchase (D2-A)');
update public.web_billing_config set checkout_mode = 'off';
select public.t_err($$select public.t_start(10, 'start', 'monthly', public.t0())$$, 'WEB_BILLING:disabled', 'checkout switch off: refused');
update public.web_billing_config set checkout_mode = 'testers';
select public.t_err($$select public.t_start(10, 'start', 'monthly', public.t0())$$, 'WEB_BILLING:disabled', 'testers mode: non-tester refused');
insert into public.web_billing_testers(user_id) values (public.t_u(10));
select public.t_ok(public.t_start(10, 'start', 'monthly', public.t0()) ->> 'kind' = 'card_bind', 'testers mode: listed tester may start');
select public.t_keep('x', (public.t_sub(10)).id::text);
select public.t_keep('y', public.t_start(10, 'start', 'annual', public.t0())::text);
select public.t_ok(public.t_get('y')::jsonb ->> 'plan' = 'annual'
  and (select status = 'incomplete_expired' from public.web_subscriptions where id = public.t_get('x')::uuid)
  and (public.t_sub(10)).id <> public.t_get('x')::uuid
  and (select count(*) from public.web_subscriptions where user_id = public.t_u(10) and status = 'incomplete') = 1,
  'changing the offer before paying closes the old checkout (no Pro, no trial used) and opens a new one');
update public.web_billing_config set checkout_mode = 'on';
select public.t_keep('r25', public.t_start(25, 'start', 'monthly', public.t0(), false) ->> 'reference_order_id');
select public.t_res(public.t_get('r25'), 'failed', public.t0(), '1203', 'hard');
select public.t_keep('y', public.t_start(25, 'start', 'monthly', public.t0(), false)::text);
select public.t_ok(public.t_get('y')::jsonb ->> 'reference_order_id' = left(public.t_get('r25'), 24) || '02'
  and (public.t_sub(25)).status = 'incomplete' and not exists (select 1 from public.web_trial_usage where user_id = public.t_u(25)),
  'declined direct purchase: same idle checkout reused with the next attempt number (a02), member stays free');
select public.t_err($$select public.t_start(39, 'start', 'monthly', public.t0())$$, 'WEB_BILLING:unauthorized', 'suspended member cannot start');
select public.t_err($$select public.t_start(11, 'start', 'weekly', public.t0())$$, 'WEB_BILLING:invalid_input', 'unknown plan refused');
select public.t_err($$select public.t_start(11, 'pay', null, public.t0())$$, 'WEB_BILLING:not_found', 'pay_now without a past_due subscription: not_found');
select public.t_err($$select huddle_ops.web_cancel(public.t_u(11))$$, 'WEB_BILLING:not_found', 'cancel without subscription: not_found');
select public.t_okr(public.t_start(40, 'start', 'monthly', public.t0()) ->> 'reference_order_id', public.t0(), null, 15000);
select public.t_ok((public.t_sub(40)).status = 'active' and not exists (select 1 from public.web_email_outbox where user_id = public.t_u(40)),
  'member without e-mail: transition works, nothing queued (contract §2)');

-- ── 17. Rate limit, lease, webhook de-dup ──────────────────────────────────
do $$ begin for i in 1 .. 10 loop perform huddle_ops.web_rate_hit(public.t_u(11), 'write', public.t0()); end loop; end $$;
select public.t_err($$select huddle_ops.web_rate_hit(public.t_u(11), 'write', public.t0() + interval '30 seconds')$$, 'WEB_BILLING:rate_limited',
  '11th state-changing action within a minute is rate limited');
do $$ begin for i in 1 .. 40 loop perform huddle_ops.web_rate_hit(public.t_u(11), 'read', public.t0()); end loop; end $$;
select public.t_err($$select huddle_ops.web_rate_hit(public.t_u(11), 'read', public.t0())$$, 'WEB_BILLING:rate_limited', '41st status poll within a minute is rate limited');
select huddle_ops.web_rate_hit(public.t_u(11), 'write', public.t0() + interval '61 seconds');
select public.t_ok(true, 'after a minute the member can act again');
select public.t_keep('lease', huddle_ops.web_take_runner_lease(public.t0(), 300)::text);
select public.t_keep('x', (huddle_ops.web_take_runner_lease(public.t0() + interval '1 minute', 300) is null)::text);
select public.t_keep('y', (huddle_ops.web_release_runner_lease(public.t0() + interval '1 second', public.t0()))::text);
select public.t_keep('z', (huddle_ops.web_release_runner_lease(public.t_get('lease')::timestamptz, public.t0() + interval '2 minutes'))::text);
select public.t_ok(public.t_get('lease') is not null and public.t_get('x')::boolean and not public.t_get('y')::boolean and public.t_get('z')::boolean
  and (select runner_lease_until is null and runner_last_tick_at = public.t0() + interval '2 minutes' from public.web_billing_config),
  'runner lease: one holder at a time, release needs the token, heartbeat written on release');
select public.t_keep('x', (huddle_ops.web_take_runner_lease(public.t0() + interval '3 minutes', 300) is not null)::text);
select public.t_ok(public.t_get('x')::boolean and huddle_ops.web_take_runner_lease(public.t0() + interval '9 minutes', 300) is not null,
  'released lease can be taken; an expired (crashed) lease is taken over');
select public.t_ok(huddle_ops.web_webhook_begin('evt_1', 'trade.succeeded', 'hsX', '{"type":"trade.succeeded"}') = 'new'
  and huddle_ops.web_webhook_begin('evt_1', 'trade.succeeded', 'hsX', null) = 'retry',
  'webhook event: first delivery new; redelivery before processing finished = retry');
select huddle_ops.web_webhook_finish('evt_1', 'applied');
select public.t_ok(huddle_ops.web_webhook_begin('evt_1', 'trade.succeeded', 'hsX', null) = 'duplicate',
  'webhook event already processed = duplicate (no second processing)');

-- ── 18. Dispatcher (the only API entry) and module C passthrough ──────────
set role service_role;
select public.t_ok(public.web_billing_server('config') ->> 'checkout_mode' = 'on'
  and public.web_billing_server('start_checkout', jsonb_build_object('user_id', public.t_u(23), 'kind', 'start', 'plan', 'monthly', 'prefix', 'hs')) ->> 'behavior' = 'CardBind'
  and jsonb_typeof(public.web_billing_server('open_attempts', jsonb_build_object('user_id', public.t_u(23)))) = 'array'
  and public.web_billing_server('user_by_ref', jsonb_build_object('reference_customer_id', replace(public.t_u(23)::text, '-', ''))) ->> 'user_id' = public.t_u(23)::text
  and public.web_billing_server('user_by_ref', jsonb_build_object('reference_customer_id', 'not-ours')) is null,
  'service_role reaches the transitions through public.web_billing_server');
select public.t_err($$select public.web_billing_server('drop_everything')$$, 'WEB_BILLING:invalid_input', 'unknown dispatcher op refused');
reset role;
do $$
declare v_c_present boolean := to_regprocedure('huddle_ops.web_claim_outbox(integer)') is not null;
begin
  if not v_c_present then
    if not (public.web_billing_server('enqueue_reminders') = '{"missing": true}' and public.web_billing_server('claim_outbox') = '{"missing": true}'
            and public.web_billing_server('finish_outbox', '{"id":"00000000-0000-4000-8000-000000000000"}') = '{"missing": true}') then
      raise exception 'FAILED: module C functions absent should report missing';
    end if;
    create function huddle_ops.web_enqueue_reminders(p_now timestamptz default now()) returns integer language sql as $f$ select 7 $f$;
    create function huddle_ops.web_claim_outbox(p_limit integer default 30) returns setof public.web_email_outbox language sql as
      $f$ select * from public.web_email_outbox order by created_at limit p_limit $f$;
    create table public.t_finish(id uuid, ok boolean, provider text, skip boolean);
    create function huddle_ops.web_finish_outbox(p_id uuid, p_ok boolean, p_provider_id text default null, p_skip boolean default false)
      returns void language sql as $f$ insert into public.t_finish values (p_id, p_ok, p_provider_id, p_skip) $f$;
    if not ((public.web_billing_server('enqueue_reminders') ->> 'count')::integer = 7
            and jsonb_array_length(public.web_billing_server('claim_outbox', '{"limit": 2}') -> 'rows') = 2
            and (public.web_billing_server('claim_outbox', '{"limit": 2}') -> 'rows' -> 0) ? 'to_email'
            and public.web_billing_server('finish_outbox', '{"id":"00000000-0000-4000-8000-000000000001","ok":true,"provider_id":"re_1","skip":false}') ->> 'ok' = 'true'
            and (select ok and provider = 're_1' and not skip from public.t_finish)) then
      raise exception 'FAILED: dispatcher passthrough to module C functions';
    end if;
    drop function huddle_ops.web_enqueue_reminders(timestamptz);
    drop function huddle_ops.web_claim_outbox(integer);
    drop function huddle_ops.web_finish_outbox(uuid, boolean, text, boolean);
    drop table public.t_finish;
  else
    if jsonb_typeof(public.web_billing_server('enqueue_reminders') -> 'count') <> 'number' then
      raise exception 'FAILED: dispatcher passthrough to module C enqueue_reminders';
    end if;
  end if;
end $$;
select public.t_ok(true, 'module C functions: reported missing when absent, passed through (positional finish args) when present');

-- ── 19. Privileges: nothing new is callable by anon / authenticated ───────
select public.t_ok((select count(*) = 29 and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname = 'huddle_ops' and p.proname like 'web\_%'
         and p.proname not in ('web_paid_until','web_subscription_guard','web_payment_attempt_guard','web_refund_guard'))
     or (n.nspname = 'public' and p.proname = 'web_billing_server'))
  and has_function_privilege('service_role', 'public.web_billing_server(text,jsonb)', 'EXECUTE')
  and not has_table_privilege('authenticated', 'huddle_ops.web_rate_hits', 'SELECT')
  and not has_table_privilege('anon', 'huddle_ops.web_rate_hits', 'SELECT'),
  'all 29 new functions (28 huddle_ops + dispatcher): no EXECUTE for anon / authenticated (despite default grants); service_role has the dispatcher');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0001';
select public.t_err($$select public.web_billing_server('config')$$, 'permission denied', 'a member cannot call the dispatcher');
select public.t_err($$select huddle_ops.web_cancel('00000000-0000-4000-8000-0000000c0002')$$, 'permission denied', 'a member cannot cancel someone else directly');
reset role;
set role anon;
select public.t_err($$select public.web_billing_server('claim_due', '{"prefix":"hs"}')$$, 'permission denied', 'anon cannot claim charges');
reset role;
create or replace function public.t_mwb(n integer) returns jsonb language plpgsql as
$$ begin perform set_config('request.jwt.claim.sub', public.t_u(n)::text, true); return public.my_web_billing(); end $$;
select public.t_ok(public.t_mwb(2) -> 'subscription' ->> 'status' = 'active' and jsonb_array_length(public.t_mwb(7) -> 'payments') = 2
    and public.t_mwb(7) -> 'open_refund' ->> 'status' = 'needs_review',
  'my_web_billing (P1 read path) reflects the transitions');

-- ── 20. Rollback round trip: down → (billing rows kept) → up ──────────────
create table public.t_rows as select (select count(*) from public.web_subscriptions) s, (select count(*) from public.web_payment_attempts) a,
  (select count(*) from public.web_email_outbox) o;
\ir ../../supabase/rollback/20261002140000_web_billing_transitions_down.sql
select public.t_ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'huddle_ops' and p.proname like 'web\_%'
           and p.proname not in ('web_paid_until','web_subscription_guard','web_payment_attempt_guard','web_refund_guard'))
       or (n.nspname = 'public' and p.proname = 'web_billing_server'))
  and to_regclass('huddle_ops.web_rate_hits') is null
  and (select s = (select count(*) from public.web_subscriptions) and a = (select count(*) from public.web_payment_attempts)
         and o = (select count(*) from public.web_email_outbox) from public.t_rows)
  and to_regprocedure('huddle_ops.paid_until(uuid)') is not null and huddle_ops.has_pro(public.t_u(2)),
  'down: all new functions and the rate table gone; billing rows and P1 functions untouched');
\ir ../../supabase/migrations/20261002140000_web_billing_transitions.sql
select public.t_ok((select count(*) = 29 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'huddle_ops' and p.proname like 'web\_%'
           and p.proname not in ('web_paid_until','web_subscription_guard','web_payment_attempt_guard','web_refund_guard'))
       or (n.nspname = 'public' and p.proname = 'web_billing_server'))
  and not has_function_privilege('authenticated', 'public.web_billing_server(text,jsonb)', 'EXECUTE')
  and (public.t_claim1(3, (public.t_sub(3)).current_period_end + interval '1 minute') -> 0 ->> 'reference_order_id') like '%c0003a01',
  'up again after down: 29 functions back, privileges re-applied, claiming works');

-- ── 21. Leave exactly one due subscription for the two-session claim race ─
select public.t_okr(public.t_start(24, 'start', 'monthly', public.t0()) ->> 'reference_order_id', public.t0());
update public.web_subscriptions set billing_hold = true
 where status in ('trialing','active','past_due') and user_id is distinct from public.t_u(24);
\echo 'Web billing transitions suite finished.'
