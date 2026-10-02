-- Website subscriptions (SHOPLINE Payments), phase P2 (module A): every state
-- transition that can move money or access, as service-role-only functions.
-- Design: docs/billing/2026-10-02-web-billing-design.md §1.3, §2, §2.3, §4.3.
-- Contract: docs/billing/2026-10-02-web-billing-contracts.md §2 (outbox), §5.
--
-- RULE NUMBER ONE: never charge twice. Rather miss a charge than repeat one.
--   * web_claim_due locks the subscription row (FOR UPDATE SKIP LOCKED) and
--     inserts the 'pending' attempt in the same transaction; the P1 partial
--     unique indexes allow one undecided and one successful attempt per
--     (subscription, cycle).
--   * While ANY attempt of a subscription is pending/unknown, nothing new is
--     claimed or started for it. 'unknown' (SLP outcome not known) is only
--     resolved by SLP itself (webhook / query) or a human — never by retrying.
--   * SLP order ids are deterministic: {prefix}{order_ref}c{cycle4}a{attempt2}.
--
-- SAFETY ARGUMENT — with the switches off nothing changes for anybody:
--   * web_start_checkout refuses unless checkout_mode lets this member buy;
--   * web_claim_due returns [] unless renewals_enabled;
--   * every other function only acts on existing web_* rows (there are none).
--   No existing function, table, trigger or policy is modified.
--
-- Exposure: huddle_ops is not in the API schemas, so Edge Functions reach these
-- functions through ONE public dispatcher, public.web_billing_server(op, args),
-- executable by service_role only. It never accepts a caller-supplied clock
-- (the p_now parameters exist for tests only). Module C's outbox / reminder
-- functions are called through it dynamically (to_regprocedure) so this
-- migration does not depend on 20261002130000 being present.
--
-- Time: all calendar logic is in Asia/Taipei (UTC+8, no DST) and independent
-- of the session TimeZone; durations use hours ('24 hours'), never days.
--
-- ROLLBACK: supabase/rollback/20261002140000_web_billing_transitions_down.sql
-- (drops these functions and the rate-limit table; billing rows untouched).
--
-- No BEGIN/COMMIT inside (same convention as 20261002120000). Apply with
-- `psql -1` or `supabase db push`.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ── 0. Rate limit storage (huddle_ops: not reachable through the API) ──────
-- Not named public.web_*: P1 tests enumerate exactly ten public web_* tables.
create table if not exists huddle_ops.web_rate_hits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket  text not null check (bucket in ('read','write')),
  hit_at  timestamptz not null default now()
);
create index if not exists web_rate_hits_user_idx on huddle_ops.web_rate_hits (user_id, bucket, hit_at);
revoke all on huddle_ops.web_rate_hits from public, anon, authenticated;

-- Reconciliation bookkeeping (review 2026-10-02 #2/#3): the cron work lists
-- rotate on last_checked_at, so rows SLP never settles cannot starve the rest.
alter table public.web_payment_attempts add column if not exists last_checked_at timestamptz;
alter table public.web_refunds add column if not exists last_checked_at timestamptz;

-- ── 1. Pure helpers ────────────────────────────────────────────────────────
-- ISO 8601 in UTC for e-mail payloads (contract §2), whatever the TimeZone.
create or replace function huddle_ops.web_iso(p_at timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- Start of billing cycle k (k >= 1) = anchor + (k-1) months/years, computed on
-- the Taipei wall clock and ALWAYS from the anchor (design §2.3): a 31st anchor
-- gives 2/28, 3/31, 4/30 ... never drifting to the 28th; 2/29 + 1 year = 2/28.
create or replace function huddle_ops.web_cycle_at(p_anchor timestamptz, p_plan text, p_k integer)
returns timestamptz language sql stable set search_path = '' as $$
  select ((p_anchor at time zone 'Asia/Taipei')
          + (p_k - 1) * case p_plan when 'annual' then interval '1 year' when 'monthly' then interval '1 month' end)
         at time zone 'Asia/Taipei'
$$;

-- 00:00 Taipei on (Taipei calendar date of p_at) + p_days.
--   refund deadline (R5)  = day(paid, 8): the 7th day after payment ends 23:59:59
--   refund due_by   (R6)  = day(requested, 16): 15 days counted from the next day
create or replace function huddle_ops.web_taipei_day(p_at timestamptz, p_days integer)
returns timestamptz language sql stable set search_path = '' as $$
  select (((p_at at time zone 'Asia/Taipei')::date + p_days)::timestamp) at time zone 'Asia/Taipei'
$$;

-- Deterministic SLP order number (≤ 32): {prefix2}{order_ref16}c{cycle4}{a|r}{seq2}.
-- 'a' = payment attempt, 'r' = refund. Must match core.mjs orderId()/refundId().
create or replace function huddle_ops.web_order_id(p_prefix text, p_order_ref text, p_cycle integer, p_seq integer, p_tag text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if coalesce(p_prefix !~ '^[a-z]{2}$', true) or coalesce(p_order_ref !~ '^[A-Za-z0-9]{16}$', true)
     or coalesce(p_cycle not between 0 and 9999, true) or coalesce(p_seq not between 1 and 99, true)
     or coalesce(p_tag not in ('a','r'), true) then
    raise exception 'WEB_BILLING:invalid_input' using detail = 'order id parts';
  end if;
  return p_prefix || p_order_ref || 'c' || lpad(p_cycle::text, 4, '0') || p_tag || lpad(p_seq::text, 2, '0');
end $$;

-- Hard ceiling against unit mistakes (R9): NT$2,000 = 200000 minor units.
-- Real prices are NT$150 / NT$990; ×100 twice (NT$99,000) can never pass.
create or replace function huddle_ops.web_amount_ok(p_minor integer) returns boolean
language sql immutable set search_path = '' as $$ select coalesce(p_minor between 1 and 200000, false) $$;

-- ── 2. Outbox (contract §2): same transaction, dedupe_key, current e-mail ──
create or replace function huddle_ops.web_txn_outbox(p_user uuid, p_kind text, p_dedupe text, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if p_user is null then return; end if;
  select nullif(btrim(u.email), '') into v_email from auth.users u where u.id = p_user;
  if v_email is null then return; end if;  -- no e-mail, nothing queued (contract §2)
  insert into public.web_email_outbox (user_id, kind, dedupe_key, to_email, payload)
  values (p_user, p_kind, p_dedupe, v_email, p_payload)
  on conflict (dedupe_key) do nothing;
end $$;

-- Receipt for one succeeded charge (T14). Period = the cycle this charge paid.
create or replace function huddle_ops.web_txn_receipt(p_attempt uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.web_payment_attempts; s public.web_subscriptions; pm public.web_payment_methods;
begin
  select * into a from public.web_payment_attempts where id = p_attempt;
  select * into s from public.web_subscriptions where id = a.subscription_id;
  select * into pm from public.web_payment_methods where id = s.payment_method_id;
  perform huddle_ops.web_txn_outbox(a.user_id, 'receipt', 'receipt:' || a.id, jsonb_build_object(
    'plan', s.plan, 'amount_minor', a.amount_minor, 'paid_at', huddle_ops.web_iso(a.finished_at),
    'period_start', huddle_ops.web_iso(huddle_ops.web_cycle_at(s.anchor_at, s.plan, a.cycle)),
    'period_end', huddle_ops.web_iso(huddle_ops.web_cycle_at(s.anchor_at, s.plan, a.cycle + 1)),
    'card_brand', pm.brand, 'card_last4', pm.last4, 'reference_order_id', a.reference_order_id,
    'refund_deadline', case when a.cooling_off_eligible then huddle_ops.web_iso(a.refund_deadline) end));
end $$;

-- ── 3. Rate limit: per member per minute, in the database ──────────────────
-- 'read' = status polling (the /billing/return page polls for ≤ 60 s);
-- 'write' = anything that can talk to SLP or change state.
create or replace function huddle_ops.web_rate_hit(p_user uuid, p_bucket text, p_now timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare v_limit integer := case p_bucket when 'read' then 40 when 'write' then 10 end; v_count integer;
begin
  if p_user is null or v_limit is null then raise exception 'WEB_BILLING:invalid_input'; end if;
  perform pg_advisory_xact_lock(hashtext('web_billing_rate'), hashtext(p_user::text));
  delete from huddle_ops.web_rate_hits where user_id = p_user and hit_at < p_now - interval '5 minutes';
  select count(*) into v_count from huddle_ops.web_rate_hits
   where user_id = p_user and bucket = p_bucket and hit_at > p_now - interval '60 seconds';
  if v_count >= v_limit then raise exception 'WEB_BILLING:rate_limited'; end if;
  insert into huddle_ops.web_rate_hits (user_id, bucket, hit_at) values (p_user, p_bucket, p_now);
end $$;

-- ── 4. Start a customer-present SLP transaction (design §2.1, §2.2) ────────
-- p_kind: 'start' new subscription (CardBind with trial / CardBindPayment
-- without), 'card' change card (CardBind), 'pay' customer-present payment of
-- the unpaid cycle while past_due (QuickPayment). Creates the 'pending'
-- attempt; the Edge Function then calls SLP with reference_order_id.
-- p_expect_trial (optional): what the purchase page showed. If it promised a
-- trial that is no longer available we refuse (trial_used) instead of charging
-- money the member did not agree to pay today.
create or replace function huddle_ops.web_start_checkout(p_user uuid, p_kind text, p_plan text, p_prefix text,
  p_expect_trial boolean default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.web_billing_config;
  s public.web_subscriptions;
  v_trial boolean := false;
  v_price integer;
  v_kind text; v_cycle integer; v_amount integer; v_behavior text;
  v_no integer; v_ref text; v_attempt uuid;
begin
  if p_kind is null or p_kind not in ('start','card','pay') then raise exception 'WEB_BILLING:invalid_input'; end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user)
     or not huddle_ops.access_allowed(p_user) then
    raise exception 'WEB_BILLING:unauthorized';
  end if;
  perform huddle_ops.web_order_id(p_prefix, '0000000000000000', 0, 1, 'a');  -- validates the prefix
  -- One checkout decision per member at a time (double click, parallel tabs).
  perform pg_advisory_xact_lock(hashtext('web_billing_checkout'), hashtext(p_user::text));
  select * into c from public.web_billing_config where id;

  if p_kind = 'start' then
    if p_plan is null or p_plan not in ('monthly','annual') then raise exception 'WEB_BILLING:invalid_input'; end if;
    if not coalesce(c.checkout_mode = 'on' or (c.checkout_mode = 'testers'
         and exists (select 1 from public.web_billing_testers t where t.user_id = p_user)), false) then
      raise exception 'WEB_BILLING:disabled';
    end if;
    if exists (select 1 from public.billing_entitlements b
                where b.user_id = p_user and b.entitlement = 'pro' and b.expires_at > p_now) then
      raise exception 'WEB_BILLING:apple_active';  -- D2-A
    end if;
    -- Any undecided money-moving request of this member blocks a new purchase.
    if exists (select 1 from public.web_payment_attempts a
                where a.user_id = p_user and a.kind <> 'card_bind' and a.status in ('pending','unknown')) then
      raise exception 'WEB_BILLING:payment_in_progress';
    end if;
    select * into s from public.web_subscriptions w
     where w.user_id = p_user and w.status in ('incomplete','trialing','active','past_due') for update;
    if found and s.status <> 'incomplete' then raise exception 'WEB_BILLING:already_subscribed'; end if;
    v_trial := c.trial_days > 0 and not exists (select 1 from public.web_trial_usage t where t.user_id = p_user);
    if p_expect_trial is not null then
      if p_expect_trial and not v_trial then raise exception 'WEB_BILLING:trial_used'; end if;
      v_trial := p_expect_trial;  -- false: the member chose to pay now
    end if;
    v_price := case p_plan when 'annual' then c.price_annual_minor else c.price_monthly_minor end;
    if not huddle_ops.web_amount_ok(v_price) then raise exception 'WEB_BILLING:unavailable'; end if;
    -- An abandoned incomplete subscription is reused only if it is the same
    -- offer and idle; otherwise it is closed (no Pro, no trial consumed).
    -- (Open money attempts were refused above, so only a card binding can be
    -- open here, and a binding never moves money.)
    if s.id is not null and (s.plan <> p_plan or s.with_trial <> v_trial or s.price_minor <> v_price
        or exists (select 1 from public.web_payment_attempts a
                    where a.subscription_id = s.id and a.status in ('pending','unknown'))) then
      update public.web_subscriptions set status = 'incomplete_expired', ended_at = p_now where id = s.id;
      s := null;
    end if;
    if s.id is null then
      insert into public.web_subscriptions (order_ref, user_id, plan, price_minor, with_trial, created_at)
      values (substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), p_user, p_plan, v_price, v_trial, p_now)
      returning * into s;
    end if;
    if s.with_trial then
      v_kind := 'card_bind'; v_cycle := 0; v_amount := 0; v_behavior := 'CardBind';
    else
      v_kind := 'first_purchase'; v_cycle := 1; v_amount := s.price_minor; v_behavior := 'CardBindPayment';
    end if;
  elsif p_kind = 'card' then
    select * into s from public.web_subscriptions w
     where w.user_id = p_user and w.status in ('trialing','active','past_due') for update;
    if not found then raise exception 'WEB_BILLING:not_found'; end if;
    if s.billing_hold then raise exception 'WEB_BILLING:disabled'; end if;
    v_kind := 'card_bind'; v_cycle := 0; v_amount := 0; v_behavior := 'CardBind';
  else
    select * into s from public.web_subscriptions w
     where w.user_id = p_user and w.status = 'past_due' for update;
    if not found then raise exception 'WEB_BILLING:not_found'; end if;
    if s.billing_hold then raise exception 'WEB_BILLING:disabled'; end if;
    if not exists (select 1 from public.web_billing_customers bc where bc.user_id = p_user) then
      raise exception 'WEB_BILLING:not_found';
    end if;
    v_kind := 'customer_present'; v_cycle := s.cycle + 1; v_amount := s.price_minor; v_behavior := 'QuickPayment';
    if not huddle_ops.web_amount_ok(v_amount) then raise exception 'WEB_BILLING:unavailable'; end if;
    -- At most 20 customer-present tries per cycle: the order number has two
    -- attempt digits shared with the cron's retries (review #1).
    if (select count(*) from public.web_payment_attempts a
         where a.subscription_id = s.id and a.cycle = v_cycle and a.kind = 'customer_present') >= 20 then
      raise exception 'WEB_BILLING:rate_limited';
    end if;
  end if;

  -- One undecided SLP request per subscription, whatever its kind.
  if exists (select 1 from public.web_payment_attempts a
              where a.subscription_id = s.id and a.status in ('pending','unknown')) then
    raise exception 'WEB_BILLING:payment_in_progress';
  end if;
  select coalesce(max(a.attempt_no), 0) + 1 into v_no
    from public.web_payment_attempts a where a.subscription_id = s.id and a.cycle = v_cycle;
  if v_no > 99 then raise exception 'WEB_BILLING:unavailable'; end if;
  v_ref := huddle_ops.web_order_id(p_prefix, s.order_ref, v_cycle, v_no, 'a');
  insert into public.web_payment_attempts (subscription_id, user_id, kind, cycle, attempt_no, reference_order_id, amount_minor, created_at)
  values (s.id, p_user, v_kind, v_cycle, v_no, v_ref, v_amount, p_now)
  returning id into v_attempt;
  return jsonb_build_object(
    'subscription_id', s.id, 'attempt_id', v_attempt, 'reference_order_id', v_ref, 'order_ref', s.order_ref,
    'kind', v_kind, 'behavior', v_behavior, 'plan', s.plan, 'with_trial', s.with_trial, 'cycle', v_cycle,
    'amount_minor', v_amount,
    -- What the SDK was initialised with and what goes to SLP. For a card
    -- binding SLP authorises a fixed NT$1 and voids it (SLP notes §4).
    'charge_amount_minor', s.price_minor,
    'customer_id', (select bc.slp_customer_id from public.web_billing_customers bc where bc.user_id = p_user),
    'reference_customer_id', replace(p_user::text, '-', ''));
end $$;

-- ── 5. Applying an SLP outcome to an attempt ───────────────────────────────
-- p_result (built by core.mjs from an AUTHORITATIVE SLP response, never from
-- a webhook body): {status: pending|unknown|succeeded|failed, trade_order_id,
-- slp_status, slp_sub_status, failure_code, failure_msg,
-- failure_kind: hard|soft|customer_action, amount_minor,
-- customer_id, instrument: {id, brand, issuer_country, last4}}.
--
-- Shared first step. Caller holds the subscription and attempt locks.
-- Returns a final jsonb answer, or NULL when the caller must apply a
-- 'succeeded' / 'failed' decision itself.
create or replace function huddle_ops.web_attempt_progress(p_attempt uuid, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.web_payment_attempts;
  v_status text := p_result ->> 'status';
  v_trade text := nullif(p_result ->> 'trade_order_id', '');
  v_amount text := p_result ->> 'amount_minor';
begin
  select * into a from public.web_payment_attempts where id = p_attempt;
  -- Parked for a human (money / owner inconsistency): no later SLP answer
  -- (e.g. one without an amount) may silently upgrade it (review #6).
  if a.status = 'unknown' and a.failure_code in ('amount_mismatch','duplicate_success','owner_conflict') then
    return jsonb_build_object('applied', false, 'reason', 'needs_review', 'status', a.status);
  end if;
  if v_status is null or v_status not in ('pending','unknown','succeeded','failed') then
    raise exception 'WEB_BILLING:invalid_input' using detail = 'result status';
  end if;
  -- A different SLP trade can never decide this attempt.
  if v_trade is not null and (coalesce(a.slp_trade_order_id <> v_trade, false)
      or exists (select 1 from public.web_payment_attempts o where o.slp_trade_order_id = v_trade and o.id <> a.id)) then
    return jsonb_build_object('applied', false, 'reason', 'trade_mismatch', 'status', a.status);
  end if;
  if a.status in ('succeeded','failed') then
    return jsonb_build_object('applied', false, 'reason', 'already_decided', 'status', a.status);
  end if;
  update public.web_payment_attempts set
    slp_trade_order_id = coalesce(slp_trade_order_id, v_trade),
    slp_status = coalesce(left(p_result ->> 'slp_status', 40), slp_status),
    slp_sub_status = coalesce(left(p_result ->> 'slp_sub_status', 40), slp_sub_status)
  where id = a.id;
  if v_status = 'pending' then
    return jsonb_build_object('applied', true, 'status', a.status);
  end if;
  if v_status = 'unknown' then
    update public.web_payment_attempts set status = 'unknown',
      failure_code = coalesce(left(p_result ->> 'failure_code', 40), failure_code)
    where id = a.id and status = 'pending';
    return jsonb_build_object('applied', true, 'status', 'unknown');
  end if;
  -- Money taken must equal what we asked for (R9). Card binding moves none.
  if v_status = 'succeeded' and a.kind <> 'card_bind' and v_amount is not null
     and v_amount is distinct from a.amount_minor::text then
    update public.web_payment_attempts set status = 'unknown', failure_code = 'amount_mismatch' where id = a.id;
    return jsonb_build_object('applied', false, 'reason', 'amount_mismatch', 'status', 'unknown');
  end if;
  return null;
end $$;

-- Store the SLP customer + card for a member. NULL when either already
-- belongs to ANOTHER member (never reused; caller parks the attempt).
create or replace function huddle_ops.web_store_card(p_user uuid, p_customer text, p_result jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_instrument text := nullif(p_result #>> '{instrument,id}', '');
  v_last4 text := p_result #>> '{instrument,last4}';
  v_pm uuid;
begin
  if exists (select 1 from public.web_billing_customers bc where bc.slp_customer_id = p_customer and bc.user_id <> p_user)
     or exists (select 1 from public.web_payment_methods pm where pm.slp_instrument_id = v_instrument
                 and pm.user_id is distinct from p_user) then
    return null;
  end if;
  insert into public.web_billing_customers (user_id, slp_customer_id) values (p_user, p_customer)
  on conflict (user_id) do nothing;
  insert into public.web_payment_methods (user_id, slp_customer_id, slp_instrument_id, brand, issuer_country, last4)
  values (p_user, p_customer, v_instrument, left(p_result #>> '{instrument,brand}', 20),
          left(p_result #>> '{instrument,issuer_country}', 8), case when v_last4 ~ '^[0-9]{4}$' then v_last4 end)
  on conflict (slp_instrument_id) do update set status = 'active', disabled_at = null,
    brand = coalesce(excluded.brand, public.web_payment_methods.brand),
    issuer_country = coalesce(excluded.issuer_country, public.web_payment_methods.issuer_country),
    last4 = coalesce(excluded.last4, public.web_payment_methods.last4)
  returning id into v_pm;
  return v_pm;
end $$;

-- Card binding (trial start / card change) and first purchase (CardBindPayment).
create or replace function huddle_ops.web_apply_bind_result(p_reference_order_id text, p_result jsonb,
  p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sub uuid;
  s public.web_subscriptions;
  a public.web_payment_attempts;
  c public.web_billing_config;
  v jsonb;
  v_status text := p_result ->> 'status';
  v_customer text := nullif(p_result ->> 'customer_id', '');
  v_instrument text := nullif(p_result #>> '{instrument,id}', '');
  v_pm uuid;
  v_old public.web_payment_methods;
  v_trial_end timestamptz;
  v_end timestamptz;
begin
  select a0.subscription_id into v_sub from public.web_payment_attempts a0 where a0.reference_order_id = p_reference_order_id;
  if not found then return jsonb_build_object('applied', false, 'reason', 'unknown_order'); end if;
  select * into s from public.web_subscriptions where id = v_sub for update;   -- lock order: subscription, attempt
  select * into a from public.web_payment_attempts where reference_order_id = p_reference_order_id for update;
  if a.kind not in ('card_bind','first_purchase') then
    raise exception 'WEB_BILLING:invalid_input' using detail = 'not a binding attempt';
  end if;
  -- A first purchase activated without knowing the card ('card_unmatched'):
  -- a later authoritative answer naming the card attaches it (review #2).
  if a.status = 'succeeded' and a.failure_code = 'card_unmatched' and v_status = 'succeeded'
     and v_customer is not null and v_instrument is not null and s.payment_method_id is null
     and s.user_id = a.user_id and s.status in ('trialing','active','past_due')
     and (nullif(p_result ->> 'trade_order_id', '') is null or nullif(p_result ->> 'trade_order_id', '') = a.slp_trade_order_id) then
    v_pm := huddle_ops.web_store_card(a.user_id, v_customer, p_result);
    if v_pm is null then return jsonb_build_object('applied', false, 'reason', 'owner_conflict', 'status', a.status); end if;
    update public.web_subscriptions set payment_method_id = v_pm where id = s.id;
    update public.web_payment_attempts set failure_code = null where id = a.id;
    return jsonb_build_object('applied', true, 'status', 'succeeded', 'card', 'attached');
  end if;
  v := huddle_ops.web_attempt_progress(a.id, p_result);
  if v is not null then return v; end if;

  if v_status = 'failed' then
    update public.web_payment_attempts set status = 'failed', finished_at = p_now,
      failure_code = left(p_result ->> 'failure_code', 40), failure_msg = left(p_result ->> 'failure_msg', 200)
    where id = a.id;
    -- incomplete stays incomplete (member may try again; cron closes it after
    -- an hour); a failed card change leaves the old card in place.
    return jsonb_build_object('applied', true, 'status', 'failed', 'subscription_status', s.status);
  end if;

  -- succeeded: we must know which SLP customer and card it was.
  if v_customer is null or v_instrument is null then
    if a.kind = 'first_purchase' and s.status = 'incomplete' and a.user_id is not null then
      -- Money was taken but SLP did not say with which card: money taken =
      -- the member gets Pro now (review #2). No card = no automatic renewal
      -- until one is attached; listed in web_billing_anomalies.
      update public.web_payment_attempts set status = 'succeeded', finished_at = p_now, failure_code = 'card_unmatched',
        cooling_off_eligible = true, refund_deadline = huddle_ops.web_taipei_day(p_now, 8),
        slp_trade_order_id = coalesce(slp_trade_order_id, nullif(p_result ->> 'trade_order_id', ''))
      where id = a.id;
      v_end := huddle_ops.web_cycle_at(p_now, s.plan, 2);
      update public.web_subscriptions set status = 'active', cycle = 1, anchor_at = p_now,
        current_period_start = p_now, current_period_end = v_end, access_until = v_end + interval '24 hours'
      where id = s.id;
      perform huddle_ops.web_txn_receipt(a.id);
      return jsonb_build_object('applied', true, 'status', 'succeeded', 'subscription_status', 'active', 'card', 'unmatched');
    end if;
    return jsonb_build_object('applied', false, 'reason', 'instrument_missing', 'status', a.status);
  end if;
  if a.user_id is null then
    update public.web_payment_attempts set status = 'succeeded', finished_at = p_now,
      cooling_off_eligible = false, refund_deadline = null where id = a.id;
    return jsonb_build_object('applied', true, 'status', 'succeeded', 'needs_review', a.kind = 'first_purchase');
  end if;
  -- An SLP customer or card already linked to ANOTHER member is never reused.
  v_pm := huddle_ops.web_store_card(a.user_id, v_customer, p_result);
  if v_pm is null then
    update public.web_payment_attempts set status = 'unknown', failure_code = 'owner_conflict'
     where id = a.id and status = 'pending';
    return jsonb_build_object('applied', false, 'reason', 'owner_conflict', 'status', 'unknown');
  end if;
  update public.web_payment_attempts set status = 'succeeded', finished_at = p_now,
    cooling_off_eligible = (a.kind = 'first_purchase'),                       -- D9-A
    refund_deadline = case when a.kind = 'first_purchase' then huddle_ops.web_taipei_day(p_now, 8) end
  where id = a.id;

  if s.status = 'incomplete' and a.kind = 'card_bind' and s.with_trial then
    -- Trial starts now (T6): 14 × 24 h, first charge at trial end (= anchor).
    select * into c from public.web_billing_config where id;
    v_trial_end := p_now + greatest(c.trial_days, 1) * interval '24 hours';
    update public.web_subscriptions set status = 'trialing', trial_start = p_now, trial_end = v_trial_end,
      anchor_at = v_trial_end, current_period_end = v_trial_end, access_until = v_trial_end + interval '24 hours',
      payment_method_id = v_pm
    where id = s.id;
    insert into public.web_trial_usage (user_id, source, first_used_at, ref)
    values (a.user_id, 'web', p_now, s.order_ref) on conflict (user_id) do nothing;
    return jsonb_build_object('applied', true, 'status', 'succeeded', 'subscription_status', 'trialing');
  elsif s.status = 'incomplete' and a.kind = 'first_purchase' then
    -- Direct purchase (no trial): paid cycle 1 now, anchor = payment time.
    v_end := huddle_ops.web_cycle_at(p_now, s.plan, 2);
    update public.web_subscriptions set status = 'active', cycle = 1, anchor_at = p_now,
      current_period_start = p_now, current_period_end = v_end, access_until = v_end + interval '24 hours',
      payment_method_id = v_pm
    where id = s.id;
    perform huddle_ops.web_txn_receipt(a.id);
    return jsonb_build_object('applied', true, 'status', 'succeeded', 'subscription_status', 'active');
  elsif a.kind = 'card_bind' and s.status in ('trialing','active','past_due') and s.user_id = a.user_id then
    -- Card change: point the subscription at the new card, clear "needs
    -- customer action"; a past_due member gets one retry an hour from now
    -- (the page also offers paying right away, which is more likely to pass).
    select * into v_old from public.web_payment_methods where id = s.payment_method_id;
    update public.web_subscriptions set payment_method_id = v_pm, needs_customer_action = false,
      next_retry_at = case when s.status = 'past_due' and s.retry_count < 3 and p_now + interval '1 hour' < s.grace_until
                           then p_now + interval '1 hour' else s.next_retry_at end
    where id = s.id;
    if v_old.id is not null and v_old.id <> v_pm then
      update public.web_payment_methods set status = 'disabled', disabled_at = p_now where id = v_old.id and status = 'active';
      return jsonb_build_object('applied', true, 'status', 'succeeded', 'subscription_status', s.status,
        'unbind', jsonb_build_object('customer_id', v_old.slp_customer_id, 'instrument_id', v_old.slp_instrument_id));
    end if;
    return jsonb_build_object('applied', true, 'status', 'succeeded', 'subscription_status', s.status);
  end if;
  -- Late result for a closed subscription. A binding moved no money; a first
  -- purchase did and must be refunded by a human (R9).
  if a.kind = 'first_purchase' then perform huddle_ops.web_txn_receipt(a.id); end if;
  return jsonb_build_object('applied', true, 'status', 'succeeded', 'late', true, 'needs_review', a.kind = 'first_purchase');
end $$;

-- Recurring charges (cron) and customer-present payments (pay_now). Binding
-- kinds are delegated, so callers can always use this one.
create or replace function huddle_ops.web_apply_payment_result(p_reference_order_id text, p_result jsonb,
  p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sub uuid; v_kind text;
  s public.web_subscriptions;
  a public.web_payment_attempts;
  v jsonb;
  v_status text := p_result ->> 'status';
  v_fk text := coalesce(p_result ->> 'failure_kind', 'hard');
  v_due timestamptz; v_grace timestamptz; v_next timestamptz;
  v_count integer; v_eligible boolean; v_start timestamptz; v_end timestamptz;
begin
  select a0.subscription_id, a0.kind into v_sub, v_kind from public.web_payment_attempts a0
   where a0.reference_order_id = p_reference_order_id;
  if not found then return jsonb_build_object('applied', false, 'reason', 'unknown_order'); end if;
  if v_kind in ('card_bind','first_purchase') then
    return huddle_ops.web_apply_bind_result(p_reference_order_id, p_result, p_now);
  end if;
  select * into s from public.web_subscriptions where id = v_sub for update;
  select * into a from public.web_payment_attempts where reference_order_id = p_reference_order_id for update;
  v := huddle_ops.web_attempt_progress(a.id, p_result);
  if v is not null then return v; end if;
  if v_fk not in ('hard','soft','customer_action') then v_fk := 'hard'; end if;

  if v_status = 'failed' then
    update public.web_payment_attempts set status = 'failed', finished_at = p_now,
      failure_code = left(p_result ->> 'failure_code', 40), failure_msg = left(p_result ->> 'failure_msg', 200)
    where id = a.id;
    if a.user_id is null or s.status not in ('trialing','active','past_due') or a.cycle <> s.cycle + 1 then
      return jsonb_build_object('applied', true, 'status', 'failed', 'state_change', false);
    end if;
    if a.kind = 'customer_present' then
      -- The member is on the page and can try again; no automatic consequence.
      return jsonb_build_object('applied', true, 'status', 'failed', 'state_change', false);
    end if;
    if s.cancel_at_period_end and s.status in ('trialing','active') then
      -- Canceled while this renewal was in flight (R2): the renewal simply did
      -- not happen. Pro ends at the paid end: no grace, no retry, no "we will
      -- retry" e-mail (the cancel confirmation was already sent). Review #5.
      update public.web_subscriptions set status = 'expired', ended_at = p_now, access_until = least(access_until, p_now),
        next_retry_at = null
      where id = s.id;
      return jsonb_build_object('applied', true, 'status', 'failed', 'subscription_status', 'expired');
    end if;
    if v_fk = 'soft' then
      -- 1201 "card is cloning": retry in ~5 minutes, not counted (SLP notes §5),
      -- but the fourth soft failure of a cycle is treated as a real failure.
      select count(*) into v_count from public.web_payment_attempts o
       where o.subscription_id = s.id and o.cycle = a.cycle and o.status = 'failed'
         and o.failure_code is not distinct from left(p_result ->> 'failure_code', 40);
      if v_count <= 3 then
        if s.status = 'past_due' and p_now + interval '5 minutes' < s.grace_until then
          update public.web_subscriptions set next_retry_at = p_now + interval '5 minutes' where id = s.id;
        end if;
        -- trialing/active stay due, so the next tick (≥ 5 min later) claims again.
        return jsonb_build_object('applied', true, 'status', 'failed', 'retry', 'soon');
      end if;
      v_fk := 'hard';
    end if;
    v_due := s.current_period_end;  -- unchanged while unpaid: "original charge time"
    if s.status in ('trialing','active') then
      -- First failure of this cycle (T18 / D4-A): 7-day grace, Pro kept.
      v_grace := v_due + interval '168 hours';
      v_next := case when v_fk = 'customer_action' then null
                     else greatest(v_due + interval '24 hours', p_now + interval '1 hour') end;
      if v_next >= v_grace then v_next := null; end if;
      update public.web_subscriptions set status = 'past_due', grace_until = v_grace, access_until = v_grace,
        retry_count = 0, next_retry_at = v_next, needs_customer_action = (v_fk = 'customer_action')
      where id = s.id;
      if v_fk = 'customer_action' then
        perform huddle_ops.web_txn_outbox(a.user_id, 'action_required', 'action_required:' || s.id || ':' || a.cycle,
          jsonb_build_object('plan', s.plan, 'amount_minor', a.amount_minor, 'grace_until', huddle_ops.web_iso(v_grace)));
      else
        perform huddle_ops.web_txn_outbox(a.user_id, 'payment_failed', 'payment_failed:' || s.id || ':' || a.cycle,
          jsonb_build_object('plan', s.plan, 'amount_minor', a.amount_minor, 'failed_at', huddle_ops.web_iso(p_now),
            'grace_until', huddle_ops.web_iso(v_grace), 'next_retry_at', huddle_ops.web_iso(v_next)));
      end if;
      return jsonb_build_object('applied', true, 'status', 'failed', 'subscription_status', 'past_due');
    end if;
    -- past_due: an automatic retry failed.
    if v_fk = 'customer_action' then
      -- 4900/4901/4902: unattended charges cannot pass; stop retrying (SLP notes §5).
      update public.web_subscriptions set needs_customer_action = true, next_retry_at = null where id = s.id;
      perform huddle_ops.web_txn_outbox(a.user_id, 'action_required', 'action_required:' || s.id || ':' || a.cycle,
        jsonb_build_object('plan', s.plan, 'amount_minor', a.amount_minor, 'grace_until', huddle_ops.web_iso(s.grace_until)));
    else
      -- Retries at due +1 / +3 / +6 days (three in total, all inside the grace).
      v_count := s.retry_count + 1;
      v_next := case when v_count >= 3 then null
                     else greatest(v_due + case v_count when 1 then interval '72 hours' else interval '144 hours' end,
                                   p_now + interval '1 hour') end;
      if v_next >= s.grace_until then v_next := null; end if;
      update public.web_subscriptions set retry_count = least(v_count, 10), next_retry_at = v_next where id = s.id;
    end if;
    return jsonb_build_object('applied', true, 'status', 'failed', 'subscription_status', 'past_due');
  end if;

  -- succeeded
  if exists (select 1 from public.web_payment_attempts o
              where o.subscription_id = s.id and o.cycle = a.cycle and o.status = 'succeeded' and o.id <> a.id) then
    -- The same cycle was already paid: this is a double charge. Keep it
    -- undecided for a human (refund, R9); never record two successes.
    update public.web_payment_attempts set status = 'unknown', failure_code = 'duplicate_success' where id = a.id;
    return jsonb_build_object('applied', false, 'reason', 'duplicate_success', 'status', 'unknown');
  end if;
  v_eligible := a.cycle = 1 or s.plan = 'annual';  -- R3: first charge / annual renewal
  update public.web_payment_attempts set status = 'succeeded', finished_at = p_now,
    cooling_off_eligible = v_eligible,
    refund_deadline = case when v_eligible then huddle_ops.web_taipei_day(p_now, 8) end
  where id = a.id;
  if a.user_id is not null and s.status in ('trialing','active','past_due') and a.cycle = s.cycle + 1 then
    v_start := huddle_ops.web_cycle_at(s.anchor_at, s.plan, a.cycle);
    v_end := huddle_ops.web_cycle_at(s.anchor_at, s.plan, a.cycle + 1);
    update public.web_subscriptions set status = 'active', cycle = a.cycle,
      current_period_start = v_start, current_period_end = v_end,
      access_until = v_end + case when s.cancel_at_period_end then interval '0' else interval '24 hours' end,
      grace_until = null, retry_count = 0, next_retry_at = null, needs_customer_action = false
    where id = s.id;
    perform huddle_ops.web_txn_receipt(a.id);
    return jsonb_build_object('applied', true, 'status', 'succeeded', 'subscription_status', 'active');
  end if;
  perform huddle_ops.web_txn_receipt(a.id);
  return jsonb_build_object('applied', true, 'status', 'succeeded', 'needs_review', true);
end $$;

-- ── 6. Claim due charges (cron, design §2.2 / §4.3) ────────────────────────
-- Returns at most 10 newly inserted 'pending' recurring attempts, each with
-- what the Edge Function needs for SLP Recurring. Never claims a subscription
-- that is canceled, on hold, waiting for the customer, has ANY undecided
-- attempt, or whose cycle is already paid. Due dates more than 7 days old are
-- not charged (billing was paused: the member already lost access; rather
-- miss than surprise-charge) — web_expire_due closes those.
create or replace function huddle_ops.web_claim_due(p_prefix text, p_limit integer default 10,
  p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 0), 0), 10);
  r record;
  v_no integer; v_ref text; v_attempt uuid; v_count integer := 0;
  v_out jsonb := '[]'::jsonb;
begin
  perform huddle_ops.web_order_id(p_prefix, '0000000000000000', 0, 1, 'a');
  if v_limit = 0 or not coalesce((select c.renewals_enabled from public.web_billing_config c where c.id), false) then
    return v_out;
  end if;
  -- No LIMIT in the scan (review #1): a row skipped below can never hide
  -- later due rows. Rows that can never be charged automatically (absurd
  -- price, 20 automatic tries in one cycle, order numbers used up) are not
  -- due at all; web_billing_anomalies lists them for a human.
  for r in
    select s.id, s.order_ref, s.user_id, s.plan, s.cycle, s.price_minor, pm.slp_customer_id, pm.slp_instrument_id
      from public.web_subscriptions s
      join public.web_payment_methods pm on pm.id = s.payment_method_id and pm.status = 'active'
     where s.status in ('trialing','active','past_due')
       and not s.cancel_at_period_end and not s.billing_hold and not s.needs_customer_action
       and s.user_id is not null
       and ((s.status in ('trialing','active') and s.current_period_end <= p_now
              and s.current_period_end > p_now - interval '168 hours')
         or (s.status = 'past_due' and s.next_retry_at <= p_now and s.grace_until > p_now))
       and huddle_ops.web_amount_ok(s.price_minor)
       and not exists (select 1 from public.web_payment_attempts a
                        where a.subscription_id = s.id and a.status in ('pending','unknown'))
       and (select count(*) from public.web_payment_attempts a
             where a.subscription_id = s.id and a.cycle = s.cycle + 1 and a.kind = 'recurring') < 20
       and coalesce((select max(a.attempt_no) from public.web_payment_attempts a
                      where a.subscription_id = s.id and a.cycle = s.cycle + 1), 0) < 99
     order by coalesce(s.next_retry_at, s.current_period_end), s.id
     for update of s skip locked
  loop
    exit when v_count >= v_limit;
    -- Re-check under the row lock (the snapshot above may be stale).
    if exists (select 1 from public.web_payment_attempts a
                where a.subscription_id = r.id and (a.status in ('pending','unknown')
                   or (a.cycle = r.cycle + 1 and a.status = 'succeeded'))) then
      continue;
    end if;
    select coalesce(max(a.attempt_no), 0) + 1 into v_no
      from public.web_payment_attempts a where a.subscription_id = r.id and a.cycle = r.cycle + 1;
    if v_no > 99 then continue; end if;
    v_ref := huddle_ops.web_order_id(p_prefix, r.order_ref, r.cycle + 1, v_no, 'a');
    insert into public.web_payment_attempts (subscription_id, user_id, kind, cycle, attempt_no, reference_order_id, amount_minor, created_at)
    values (r.id, r.user_id, 'recurring', r.cycle + 1, v_no, v_ref, r.price_minor, p_now)
    returning id into v_attempt;
    v_count := v_count + 1;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'attempt_id', v_attempt, 'subscription_id', r.id, 'reference_order_id', v_ref, 'kind', 'recurring',
      'amount_minor', r.price_minor, 'charge_amount_minor', r.price_minor, 'currency', 'TWD',
      'plan', r.plan, 'cycle', r.cycle + 1, 'attempt_no', v_no, 'behavior', 'Recurring',
      'customer_id', r.slp_customer_id, 'instrument_id', r.slp_instrument_id,
      'reference_customer_id', replace(r.user_id::text, '-', '')));
  end loop;
  return v_out;
end $$;

-- ── 7. Member actions: cancel / resume (T16, T17, R2) ──────────────────────
create or replace function huddle_ops.web_cancel(p_user uuid, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.web_subscriptions;
begin
  select * into s from public.web_subscriptions w
   where w.user_id = p_user and w.status in ('trialing','active','past_due') for update;
  if not found then raise exception 'WEB_BILLING:not_found'; end if;
  if s.cancel_at_period_end then return jsonb_build_object('changed', false, 'status', s.status); end if;
  -- Drop the +24h buffer: Pro ends exactly at the paid (or trial) end. An
  -- already-sent charge for the due cycle still counts (R2: that period runs).
  update public.web_subscriptions set cancel_at_period_end = true, canceled_at = p_now, cancel_reason = 'user',
    access_until = case status when 'trialing' then trial_end when 'active' then current_period_end else access_until end
  where id = s.id
  returning * into s;
  perform huddle_ops.web_txn_outbox(s.user_id, 'canceled', 'canceled:' || s.id || ':user:' || s.cycle,
    jsonb_build_object('plan', s.plan, 'access_until', huddle_ops.web_iso(s.access_until), 'reason', 'user'));
  return jsonb_build_object('changed', true, 'status', s.status);
end $$;

-- Only the member's own cancellation can be undone, before the period ends.
create or replace function huddle_ops.web_resume(p_user uuid, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.web_subscriptions;
begin
  select * into s from public.web_subscriptions w
   where w.user_id = p_user and w.status in ('trialing','active','past_due') for update;
  if not found then raise exception 'WEB_BILLING:not_found'; end if;
  if not s.cancel_at_period_end then return jsonb_build_object('changed', false, 'status', s.status); end if;
  if s.cancel_reason is distinct from 'user' or s.billing_hold or s.access_until <= p_now then
    raise exception 'WEB_BILLING:not_found';  -- admin / refund / hold, or already over: buy again
  end if;
  update public.web_subscriptions set cancel_at_period_end = false, canceled_at = null, cancel_reason = null,
    access_until = case status when 'trialing' then trial_end + interval '24 hours'
                               when 'active' then current_period_end + interval '24 hours' else access_until end
  where id = s.id;
  return jsonb_build_object('changed', true, 'status', s.status);
end $$;

-- ── 8. Refunds (R3–R7, D3) ─────────────────────────────────────────────────
-- Server-side eligibility (never trusts the page). Creates the refund row and
-- stops renewals in the same transaction. First self-service refund of a
-- member is automatic ('requested' → Edge Function calls SLP); later ones go
-- to a human ('needs_review').
create or replace function huddle_ops.web_request_refund(p_user uuid, p_payment uuid, p_prefix text,
  p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sub uuid;
  s public.web_subscriptions;
  a public.web_payment_attempts;
  v_auto boolean; v_seq integer; v_ref text; v_id uuid; v_status text;
begin
  perform huddle_ops.web_order_id(p_prefix, '0000000000000000', 0, 1, 'r');
  select a0.subscription_id into v_sub from public.web_payment_attempts a0 where a0.id = p_payment and a0.user_id = p_user;
  if not found or p_user is null then raise exception 'WEB_BILLING:not_found'; end if;
  select * into s from public.web_subscriptions where id = v_sub for update;
  select * into a from public.web_payment_attempts where id = p_payment for update;
  if a.status <> 'succeeded' or a.kind = 'card_bind' or not a.cooling_off_eligible
     or a.refund_deadline is null or a.refund_deadline <= p_now or a.refunded_minor <> 0
     or exists (select 1 from public.web_refunds r where r.payment_attempt_id = a.id and r.status <> 'failed') then
    raise exception 'WEB_BILLING:not_refundable';
  end if;
  v_auto := a.slp_trade_order_id is not null and (select count(*) from public.web_refunds r
              where r.user_id = p_user and r.requested_by = 'user' and r.status <> 'failed')
            < (select c.auto_refund_limit from public.web_billing_config c where c.id);
  v_status := case when v_auto then 'requested' else 'needs_review' end;
  select count(*) + 1 into v_seq from public.web_refunds r where r.payment_attempt_id = a.id;
  v_ref := huddle_ops.web_order_id(p_prefix, s.order_ref, a.cycle, v_seq, 'r');
  insert into public.web_refunds (payment_attempt_id, user_id, reference_order_id, amount_minor, reason,
    requested_by, requested_at, due_by, status)
  values (a.id, p_user, v_ref, a.amount_minor, 'cooling_off', 'user', p_now, huddle_ops.web_taipei_day(p_now, 16), v_status)
  returning id into v_id;
  if s.status in ('trialing','active','past_due') then
    update public.web_subscriptions set cancel_at_period_end = true, canceled_at = coalesce(canceled_at, p_now),
      cancel_reason = 'refund',
      access_until = case status when 'trialing' then trial_end when 'active' then current_period_end else access_until end
    where id = s.id;
  end if;
  return jsonb_build_object('refund_id', v_id, 'reference_order_id', v_ref, 'status', v_status,
    'amount_minor', a.amount_minor, 'trade_order_id', a.slp_trade_order_id,
    'payment_reference_order_id', a.reference_order_id);
end $$;

-- p_result (from an authoritative SLP refund response): {status: processing |
-- succeeded | failed, refund_order_id, amount_minor}. A failure goes to a
-- human (needs_review, R6 deadline still running).
create or replace function huddle_ops.web_apply_refund_result(p_reference_order_id text, p_result jsonb,
  p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sub uuid; v_attempt uuid;
  s public.web_subscriptions;
  a public.web_payment_attempts;
  r public.web_refunds;
  pm public.web_payment_methods;
  v_status text := p_result ->> 'status';
  v_slp text := nullif(p_result ->> 'refund_order_id', '');
begin
  if v_status is null or v_status not in ('processing','succeeded','failed') then
    raise exception 'WEB_BILLING:invalid_input' using detail = 'refund status';
  end if;
  select r0.payment_attempt_id into v_attempt from public.web_refunds r0 where r0.reference_order_id = p_reference_order_id;
  if not found then return jsonb_build_object('applied', false, 'reason', 'unknown_refund'); end if;
  select a0.subscription_id into v_sub from public.web_payment_attempts a0 where a0.id = v_attempt;
  select * into s from public.web_subscriptions where id = v_sub for update;
  select * into a from public.web_payment_attempts where id = v_attempt for update;
  select * into r from public.web_refunds where reference_order_id = p_reference_order_id for update;
  if r.status in ('succeeded','failed') then
    return jsonb_build_object('applied', false, 'reason', 'already_decided', 'status', r.status);
  end if;
  if v_slp is not null and coalesce(r.slp_refund_order_id <> v_slp, false) then
    return jsonb_build_object('applied', false, 'reason', 'refund_mismatch', 'status', r.status);
  end if;
  if v_status = 'processing' then
    update public.web_refunds set status = 'processing', slp_refund_order_id = coalesce(slp_refund_order_id, v_slp)
     where id = r.id;
    return jsonb_build_object('applied', true, 'status', 'processing');
  end if;
  if v_status = 'failed' or (p_result ? 'amount_minor' and (p_result ->> 'amount_minor') is distinct from r.amount_minor::text) then
    update public.web_refunds set status = 'needs_review', slp_refund_order_id = coalesce(slp_refund_order_id, v_slp)
     where id = r.id;
    return jsonb_build_object('applied', true, 'status', 'needs_review');
  end if;
  update public.web_refunds set status = 'succeeded', completed_at = p_now,
    slp_refund_order_id = coalesce(slp_refund_order_id, v_slp) where id = r.id;
  update public.web_payment_attempts set refunded_minor = refunded_minor + r.amount_minor where id = a.id;
  perform huddle_ops.web_txn_outbox(r.user_id, 'refund_done', 'refund_done:' || r.id,
    jsonb_build_object('amount_minor', r.amount_minor, 'refunded_at', huddle_ops.web_iso(p_now),
      'reference_order_id', a.reference_order_id));
  if r.reason = 'cooling_off' and s.status in ('trialing','active','past_due') then
    -- R7: Pro stops now, back to free, data kept; the card is unbound.
    update public.web_subscriptions set status = 'refunded', ended_at = p_now, access_until = p_now,
      cancel_at_period_end = true, canceled_at = coalesce(canceled_at, p_now), cancel_reason = 'refund',
      grace_until = null, next_retry_at = null
    where id = s.id;
    perform huddle_ops.web_txn_outbox(s.user_id, 'canceled', 'canceled:' || s.id || ':refund:' || s.cycle,
      jsonb_build_object('plan', s.plan, 'access_until', huddle_ops.web_iso(p_now), 'reason', 'refund'));
    select * into pm from public.web_payment_methods where id = s.payment_method_id;
    if pm.id is not null and pm.status = 'active' then
      update public.web_payment_methods set status = 'disabled', disabled_at = p_now where id = pm.id;
      return jsonb_build_object('applied', true, 'status', 'succeeded', 'subscription_status', 'refunded',
        'unbind', jsonb_build_object('customer_id', pm.slp_customer_id, 'instrument_id', pm.slp_instrument_id));
    end if;
    return jsonb_build_object('applied', true, 'status', 'succeeded', 'subscription_status', 'refunded');
  end if;
  return jsonb_build_object('applied', true, 'status', 'succeeded');
end $$;

-- ── 9. Time-based closing (cron step 4) ────────────────────────────────────
-- Pure labels: access already ended by timestamp. Never closes a subscription
-- with an undecided money attempt (a late success must still find it open).
create or replace function huddle_ops.web_expire_due(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n_incomplete integer := 0; n_canceled integer := 0; n_grace integer := 0; n_lapsed integer := 0; n_refunds integer := 0;
begin
  for r in
    select s.* from public.web_subscriptions s
     where ((s.status = 'incomplete'
             and greatest(s.created_at, (select max(a.created_at) from public.web_payment_attempts a
                                          where a.subscription_id = s.id)) <= p_now - interval '1 hour')
         or (s.status in ('trialing','active') and s.cancel_at_period_end and s.access_until <= p_now)
         or (s.status = 'past_due' and s.grace_until <= p_now)
         or (s.status in ('trialing','active') and not s.cancel_at_period_end
             and s.current_period_end <= p_now - interval '168 hours'))
       and not exists (select 1 from public.web_payment_attempts a where a.subscription_id = s.id
                        and a.status in ('pending','unknown') and a.kind <> 'card_bind')
     order by s.id
     for update of s skip locked
  loop
    if r.status = 'incomplete' then
      update public.web_subscriptions set status = 'incomplete_expired', ended_at = p_now where id = r.id;
      n_incomplete := n_incomplete + 1;
    elsif r.status = 'past_due' then
      if exists (select 1 from public.web_payment_attempts a where a.subscription_id = r.id and a.status in ('pending','unknown')) then
        continue;
      end if;
      update public.web_subscriptions set status = 'expired', ended_at = p_now, next_retry_at = null,
        cancel_reason = coalesce(cancel_reason, 'grace_exhausted')
      where id = r.id;
      if r.cancel_reason is null then
        perform huddle_ops.web_txn_outbox(r.user_id, 'canceled', 'canceled:' || r.id || ':grace_exhausted:' || r.cycle,
          jsonb_build_object('plan', r.plan, 'access_until', huddle_ops.web_iso(r.access_until), 'reason', 'grace_exhausted'));
      end if;
      n_grace := n_grace + 1;
    elsif r.cancel_at_period_end then
      if exists (select 1 from public.web_payment_attempts a where a.subscription_id = r.id and a.status in ('pending','unknown')) then
        continue;
      end if;
      update public.web_subscriptions set status = 'expired', ended_at = p_now where id = r.id;
      n_canceled := n_canceled + 1;
    else
      -- Overdue > 7 days and never charged (renewals were switched off, no
      -- usable card): close it so the member can buy again; Pro ended long ago.
      if exists (select 1 from public.web_payment_attempts a where a.subscription_id = r.id and a.status in ('pending','unknown')) then
        continue;
      end if;
      update public.web_subscriptions set status = 'expired', ended_at = p_now where id = r.id;
      n_lapsed := n_lapsed + 1;
    end if;
  end loop;
  -- Refunds go to a human (status needs_review; money is never re-sent):
  --  * automatic request SLP never answered (10 min);
  --  * SLP said "processing" without a refund id we could track (30 min);
  --    refund/get needs SLP's id, TODO(SLP-Q9): lookup by our reference;
  --  * anything not final 5 days before the 15-day promise (R6). Review #3.
  update public.web_refunds set status = 'needs_review'
   where (status = 'requested' and slp_refund_order_id is null and requested_at <= p_now - interval '10 minutes')
      or (status = 'processing' and slp_refund_order_id is null and requested_at <= p_now - interval '30 minutes')
      or (status in ('requested','processing') and due_by <= p_now + interval '120 hours');
  get diagnostics n_refunds = row_count;
  return jsonb_build_object('incomplete_expired', n_incomplete, 'canceled_expired', n_canceled,
    'grace_exhausted', n_grace, 'lapsed', n_lapsed, 'refunds_to_review', n_refunds);
end $$;

-- ── 10. Runner lease (§4.3 layer 1) ────────────────────────────────────────
-- The returned lease end is the token: release only clears the lease it took.
create or replace function huddle_ops.web_take_runner_lease(p_now timestamptz default now(), p_seconds integer default 300)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v timestamptz;
begin
  update public.web_billing_config set runner_lease_until = p_now + make_interval(secs => least(greatest(coalesce(p_seconds, 300), 60), 900))
   where id and (runner_lease_until is null or runner_lease_until < p_now)
  returning runner_lease_until into v;
  return v;
end $$;

create or replace function huddle_ops.web_release_runner_lease(p_lease timestamptz, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.web_billing_config set runner_lease_until = null, runner_last_tick_at = p_now
   where id and runner_lease_until = p_lease;
  return found;
end $$;

-- ── 11. Webhook de-duplication and read helpers for the Edge Functions ─────
create or replace function huddle_ops.web_webhook_begin(p_event_id text, p_type text, p_ref text, p_payload jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v timestamptz;
begin
  if p_event_id is null or length(p_event_id) not between 1 and 64 then raise exception 'WEB_BILLING:invalid_input'; end if;
  insert into public.web_billing_events (source, event_id, type, reference_order_id, payload)
  values ('slp_webhook', p_event_id, left(p_type, 64), left(p_ref, 32), p_payload)
  on conflict (source, event_id) do nothing;
  if found then return 'new'; end if;
  select e.processed_at into v from public.web_billing_events e where e.source = 'slp_webhook' and e.event_id = p_event_id;
  return case when v is null then 'retry' else 'duplicate' end;
end $$;

create or replace function huddle_ops.web_webhook_finish(p_event_id text, p_outcome text)
returns void language sql security definer set search_path = '' as $$
  update public.web_billing_events set processed_at = now(), outcome = left(p_outcome, 64)
   where source = 'slp_webhook' and event_id = p_event_id
$$;

-- Everything the Edge Functions need to ask SLP about one attempt.
create or replace function huddle_ops.web_attempt_json(p_attempt uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('attempt_id', a.id, 'reference_order_id', a.reference_order_id, 'kind', a.kind,
    'status', a.status, 'failure_code', a.failure_code, 'cycle', a.cycle, 'amount_minor', a.amount_minor, 'trade_order_id', a.slp_trade_order_id,
    'created_at', huddle_ops.web_iso(a.created_at), 'subscription_id', a.subscription_id,
    'subscription_status', s.status, 'user_id', a.user_id,
    'reference_customer_id', replace(a.user_id::text, '-', ''),
    'customer_id', (select bc.slp_customer_id from public.web_billing_customers bc where bc.user_id = a.user_id),
    'known_instruments', coalesce((select jsonb_agg(pm.slp_instrument_id order by pm.created_at)
                                     from public.web_payment_methods pm where pm.user_id = a.user_id), '[]'::jsonb))
    from public.web_payment_attempts a join public.web_subscriptions s on s.id = a.subscription_id
   where a.id = p_attempt
$$;

create or replace function huddle_ops.web_attempt_context(p_reference_order_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select huddle_ops.web_attempt_json(a.id) from public.web_payment_attempts a where a.reference_order_id = p_reference_order_id
$$;

-- Open (pending / unknown) attempts of a member, newest first.
create or replace function huddle_ops.web_open_attempts(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(huddle_ops.web_attempt_json(a.id) order by a.created_at desc), '[]'::jsonb)
    from public.web_payment_attempts a where a.user_id = p_user and a.status in ('pending','unknown')
$$;

-- Cron step 2 / 6 work lists, rotating on last_checked_at (never-checked and
-- longest-unchecked first) so rows SLP never settles cannot starve the rest
-- (review #2). Attempts: pending > 15 min; card bindings open > 1 hour;
-- charges escalated as stale_pending (SLP may still settle them); first
-- purchases paid without a known card (< 7 days, to attach it). Refunds SLP
-- holds: processing, or needs_review with an SLP id.
create or replace function huddle_ops.web_reconcile_candidates(p_now timestamptz default now(), p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_att uuid[]; v_ref uuid[];
begin
  select coalesce(array_agg(q.id order by q.ord), '{}') into v_att from (
    select a.id, row_number() over (order by a.last_checked_at nulls first, a.created_at, a.id) ord
      from public.web_payment_attempts a
     where (a.status = 'pending' and a.created_at <= p_now - interval '15 minutes')
        or (a.kind = 'card_bind' and a.status in ('pending','unknown') and a.created_at <= p_now - interval '1 hour')
        or (a.status = 'unknown' and a.failure_code = 'stale_pending' and a.slp_trade_order_id is not null)
        or (a.status = 'succeeded' and a.failure_code = 'card_unmatched' and a.finished_at > p_now - interval '7 days')
     order by a.last_checked_at nulls first, a.created_at, a.id limit v_limit) q;
  update public.web_payment_attempts set last_checked_at = p_now where id = any(v_att);
  select coalesce(array_agg(q.id order by q.ord), '{}') into v_ref from (
    select r.id, row_number() over (order by r.last_checked_at nulls first, r.requested_at, r.id) ord
      from public.web_refunds r
     where r.status in ('processing','needs_review') and r.slp_refund_order_id is not null
     order by r.last_checked_at nulls first, r.requested_at, r.id limit v_limit) q;
  update public.web_refunds set last_checked_at = p_now where id = any(v_ref);
  return jsonb_build_object(
    'attempts', coalesce((select jsonb_agg(huddle_ops.web_attempt_json(x.id) order by x.ord)
                            from unnest(v_att) with ordinality x(id, ord)), '[]'::jsonb),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('refund_id', r.id, 'reference_order_id', r.reference_order_id,
        'refund_order_id', r.slp_refund_order_id, 'amount_minor', r.amount_minor, 'status', r.status) order by x.ord)
                           from unnest(v_ref) with ordinality x(id, ord) join public.web_refunds r on r.id = x.id), '[]'::jsonb));
end $$;

-- What a human must look at (back office P5; the cron reports the count).
create or replace function huddle_ops.web_billing_anomalies(p_now timestamptz default now())
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x ->> 'kind', x ->> 'since'), '[]'::jsonb) from (
    -- due subscriptions the cron will never claim (review #1)
    select jsonb_build_object('kind', 'claim_blocked', 'subscription_id', s.id, 'since', huddle_ops.web_iso(s.current_period_end)) x
      from public.web_subscriptions s
     where s.status in ('trialing','active','past_due') and not s.cancel_at_period_end and not s.billing_hold
       and (not huddle_ops.web_amount_ok(s.price_minor)
         or (select count(*) from public.web_payment_attempts a
              where a.subscription_id = s.id and a.cycle = s.cycle + 1 and a.kind = 'recurring') >= 20
         or coalesce((select max(a.attempt_no) from public.web_payment_attempts a
                       where a.subscription_id = s.id and a.cycle = s.cycle + 1), 0) >= 99)
    union all
    -- undecided requests: unknown, or still pending after a day
    select jsonb_build_object('kind', case when a.status = 'unknown' then 'attempt_unknown' else 'attempt_pending_24h' end,
             'attempt_id', a.id, 'subscription_id', a.subscription_id, 'reason', a.failure_code, 'since', huddle_ops.web_iso(a.created_at))
      from public.web_payment_attempts a
     where a.status = 'unknown' or (a.status = 'pending' and a.created_at <= p_now - interval '24 hours')
    union all
    -- paid, Pro granted, but no card on file: will not renew (review #2)
    select jsonb_build_object('kind', 'paid_without_card', 'subscription_id', s.id, 'since', huddle_ops.web_iso(s.updated_at))
      from public.web_subscriptions s
     where s.status in ('active','past_due') and s.payment_method_id is null
    union all
    -- refunds a human must finish, or close to the 15-day promise (R6)
    select jsonb_build_object('kind', case when r.status = 'needs_review' then 'refund_needs_review' else 'refund_due_soon' end,
             'refund_id', r.id, 'since', huddle_ops.web_iso(r.requested_at), 'due_by', huddle_ops.web_iso(r.due_by))
      from public.web_refunds r
     where r.status = 'needs_review' or (r.status in ('requested','processing') and r.due_by <= p_now + interval '120 hours')
  ) q
$$;

create or replace function huddle_ops.web_refund_context(p_reference_order_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('refund_id', r.id, 'reference_order_id', r.reference_order_id, 'status', r.status,
    'refund_order_id', r.slp_refund_order_id, 'amount_minor', r.amount_minor,
    'payment_reference_order_id', a.reference_order_id, 'trade_order_id', a.slp_trade_order_id)
    from public.web_refunds r join public.web_payment_attempts a on a.id = r.payment_attempt_id
   where r.reference_order_id = p_reference_order_id
$$;

-- Find the member behind an SLP referenceCustomerId (= user id without dashes).
create or replace function huddle_ops.web_user_by_ref(p_reference_customer_id text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
   where p_reference_customer_id ~ '^[0-9a-f]{32}$' and replace(u.id::text, '-', '') = p_reference_customer_id
$$;

-- ── 12. The one API entry point (service_role only) ────────────────────────
-- Fixed operation whitelist; arguments by name; always the real clock.
create or replace function public.web_billing_server(p_op text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a jsonb := coalesce(p_args, '{}'::jsonb);
  v jsonb;
  v_user uuid;
begin
  case p_op
    when 'config' then
      return (select jsonb_build_object('checkout_mode', c.checkout_mode, 'renewals_enabled', c.renewals_enabled)
                from public.web_billing_config c where c.id);
    when 'rate_hit' then
      perform huddle_ops.web_rate_hit((a ->> 'user_id')::uuid, a ->> 'bucket');
      return jsonb_build_object('ok', true);
    when 'start_checkout' then
      return huddle_ops.web_start_checkout((a ->> 'user_id')::uuid, a ->> 'kind', a ->> 'plan', a ->> 'prefix',
                                           (a ->> 'expect_trial')::boolean);
    when 'apply_payment_result' then
      return huddle_ops.web_apply_payment_result(a ->> 'reference_order_id', a -> 'result');
    when 'claim_due' then
      return huddle_ops.web_claim_due(a ->> 'prefix', coalesce((a ->> 'limit')::integer, 1));
    when 'cancel' then
      return huddle_ops.web_cancel((a ->> 'user_id')::uuid);
    when 'resume' then
      return huddle_ops.web_resume((a ->> 'user_id')::uuid);
    when 'request_refund' then
      return huddle_ops.web_request_refund((a ->> 'user_id')::uuid, (a ->> 'payment_id')::uuid, a ->> 'prefix');
    when 'apply_refund_result' then
      return huddle_ops.web_apply_refund_result(a ->> 'reference_order_id', a -> 'result');
    when 'expire_due' then
      return huddle_ops.web_expire_due();
    when 'take_lease' then
      return to_jsonb(huddle_ops.web_take_runner_lease(now(), coalesce((a ->> 'seconds')::integer, 300)));
    when 'release_lease' then
      return to_jsonb(huddle_ops.web_release_runner_lease((a ->> 'lease')::timestamptz));
    when 'webhook_begin' then
      return to_jsonb(huddle_ops.web_webhook_begin(a ->> 'event_id', a ->> 'type', a ->> 'reference_order_id', a -> 'payload'));
    when 'webhook_finish' then
      perform huddle_ops.web_webhook_finish(a ->> 'event_id', a ->> 'outcome');
      return jsonb_build_object('ok', true);
    when 'attempt_context' then
      return huddle_ops.web_attempt_context(a ->> 'reference_order_id');
    when 'open_attempts' then
      return huddle_ops.web_open_attempts((a ->> 'user_id')::uuid);
    when 'reconcile_candidates' then
      return huddle_ops.web_reconcile_candidates(now(), coalesce((a ->> 'limit')::integer, 20));
    when 'refund_context' then
      return huddle_ops.web_refund_context(a ->> 'reference_order_id');
    when 'user_by_ref' then
      v_user := huddle_ops.web_user_by_ref(a ->> 'reference_customer_id');
      return case when v_user is null then null else jsonb_build_object('user_id', v_user,
        'open_attempts', huddle_ops.web_open_attempts(v_user),
        'unmatched_attempts', coalesce((select jsonb_agg(huddle_ops.web_attempt_json(a.id) order by a.created_at desc)
            from public.web_payment_attempts a
           where a.user_id = v_user and a.status = 'succeeded' and a.failure_code = 'card_unmatched'), '[]'::jsonb)) end;
    when 'anomalies' then
      return huddle_ops.web_billing_anomalies();
    when 'customer_of' then
      return (select jsonb_build_object('customer_id', bc.slp_customer_id) from public.web_billing_customers bc
               where bc.user_id = (a ->> 'user_id')::uuid);
    -- Module C (20261002130000), looked up at run time so this migration does
    -- not depend on it. Missing → {"missing": true}; the cron skips the step.
    when 'enqueue_reminders' then
      if to_regprocedure('huddle_ops.web_enqueue_reminders(timestamptz)') is null then
        return jsonb_build_object('missing', true);
      end if;
      execute 'select to_jsonb(huddle_ops.web_enqueue_reminders(now()))' into v;
      return jsonb_build_object('count', v);
    when 'claim_outbox' then
      if to_regprocedure('huddle_ops.web_claim_outbox(integer)') is null then
        return jsonb_build_object('missing', true);
      end if;
      execute 'select coalesce(jsonb_agg(to_jsonb(o)), ''[]''::jsonb) from huddle_ops.web_claim_outbox($1) o'
        into v using least(greatest(coalesce((a ->> 'limit')::integer, 30), 1), 30);
      return jsonb_build_object('rows', v);
    when 'finish_outbox' then
      if to_regprocedure('huddle_ops.web_finish_outbox(uuid,boolean,text,boolean)') is null then
        return jsonb_build_object('missing', true);
      end if;
      execute 'select huddle_ops.web_finish_outbox($1, $2, $3, $4)'
        using (a ->> 'id')::uuid, coalesce((a ->> 'ok')::boolean, false), a ->> 'provider_id', coalesce((a ->> 'skip')::boolean, false);
      return jsonb_build_object('ok', true);
    else
      raise exception 'WEB_BILLING:invalid_input' using detail = 'unknown op';
  end case;
end $$;

-- ── 13. Privileges: nothing here is callable by anon / authenticated ───────
revoke all on function
  huddle_ops.web_iso(timestamptz),
  huddle_ops.web_cycle_at(timestamptz, text, integer),
  huddle_ops.web_taipei_day(timestamptz, integer),
  huddle_ops.web_order_id(text, text, integer, integer, text),
  huddle_ops.web_amount_ok(integer),
  huddle_ops.web_txn_outbox(uuid, text, text, jsonb),
  huddle_ops.web_txn_receipt(uuid),
  huddle_ops.web_rate_hit(uuid, text, timestamptz),
  huddle_ops.web_start_checkout(uuid, text, text, text, boolean, timestamptz),
  huddle_ops.web_attempt_progress(uuid, jsonb),
  huddle_ops.web_apply_bind_result(text, jsonb, timestamptz),
  huddle_ops.web_apply_payment_result(text, jsonb, timestamptz),
  huddle_ops.web_claim_due(text, integer, timestamptz),
  huddle_ops.web_cancel(uuid, timestamptz),
  huddle_ops.web_resume(uuid, timestamptz),
  huddle_ops.web_request_refund(uuid, uuid, text, timestamptz),
  huddle_ops.web_apply_refund_result(text, jsonb, timestamptz),
  huddle_ops.web_expire_due(timestamptz),
  huddle_ops.web_take_runner_lease(timestamptz, integer),
  huddle_ops.web_release_runner_lease(timestamptz, timestamptz),
  huddle_ops.web_webhook_begin(text, text, text, jsonb),
  huddle_ops.web_webhook_finish(text, text),
  huddle_ops.web_attempt_json(uuid),
  huddle_ops.web_attempt_context(text),
  huddle_ops.web_open_attempts(uuid),
  huddle_ops.web_reconcile_candidates(timestamptz, integer),
  huddle_ops.web_refund_context(text),
  huddle_ops.web_user_by_ref(text),
  huddle_ops.web_store_card(uuid, text, jsonb),
  huddle_ops.web_billing_anomalies(timestamptz),
  public.web_billing_server(text, jsonb)
from public, anon, authenticated;
grant execute on function
  huddle_ops.web_start_checkout(uuid, text, text, text, boolean, timestamptz),
  huddle_ops.web_apply_bind_result(text, jsonb, timestamptz),
  huddle_ops.web_apply_payment_result(text, jsonb, timestamptz),
  huddle_ops.web_claim_due(text, integer, timestamptz),
  huddle_ops.web_cancel(uuid, timestamptz),
  huddle_ops.web_resume(uuid, timestamptz),
  huddle_ops.web_request_refund(uuid, uuid, text, timestamptz),
  huddle_ops.web_apply_refund_result(text, jsonb, timestamptz),
  huddle_ops.web_expire_due(timestamptz),
  huddle_ops.web_take_runner_lease(timestamptz, integer),
  huddle_ops.web_release_runner_lease(timestamptz, timestamptz),
  huddle_ops.web_billing_anomalies(timestamptz),
  public.web_billing_server(text, jsonb)
to service_role;

reset statement_timeout;
reset lock_timeout;
