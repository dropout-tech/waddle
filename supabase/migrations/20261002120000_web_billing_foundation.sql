-- Website subscriptions (SHOPLINE Payments), phase P1: data layer only.
-- Design: docs/billing/2026-10-02-web-billing-design.md §1 (tables, state
-- machine, unified paid-until), §8 P1. No Edge Function, no UI, no SLP call.
--
-- SAFETY ARGUMENT — while the web_* tables are empty, nothing changes:
--   * huddle_ops.paid_until(u) = greatest(Apple expires_at, web access_until);
--     greatest() ignores NULL, so with no web rows it IS the Apple value.
--   * has_pro / pro_until / give_days / defer_gifts / dispatch read
--     paid_until instead of billing_entitlements directly → same results.
--   * dispatch('self') keeps `paid_until` = Apple only (the iOS purchase card
--     decides "already subscribed through Apple" from it) and only gains one
--     new key, `web_paid_until`, which is null.
--   * web_billing_config ships with checkout_mode='off', renewals_enabled=false.
--   Proven by scripts/tests/web-billing-database.sh (before/after equivalence
--   in one transaction for every fixture user).
--
-- Production check (2026-10-02, read-only SELECT via `supabase db query
-- --linked`, project jnikcndiexjojgvicohf): md5(pg_get_functiondef) of
-- dispatch, has_pro, pro_until, give_days, defer_gifts, plan_allows and
-- my_plan_usage are identical to a fresh database migrated from this repo.
--
-- ROLLBACK: supabase/rollback/20261002120000_web_billing_foundation_down.sql
-- restores the five rewritten functions byte-for-byte (tested: up → down →
-- pg_get_functiondef md5 equal to before → up again). It keeps the web_*
-- tables on purpose (billing records must survive). Once real customers
-- exist, rolling back is a business decision (design §7 回滾), not a script.
--
-- No BEGIN/COMMIT inside (same as 20261001200000) so the equivalence test can
-- run this file inside its own transaction. Apply with `psql -1` or the usual
-- `supabase db push`. Statement order keeps every partial state harmless:
-- tables, then paid_until, then readers switched one by one (each equivalent
-- while web tables are empty), dispatch last; new huddle_ops functions get no
-- PUBLIC execute (schema default privileges, 20260925075939).

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ── 1. Tables (service_role only; clients read through my_web_billing) ─────
-- Every amount is integer minor units (TWD cents: NT$150 = 15000).

-- Single-row server config. NOT in huddle_ops.settings: dispatch('self')
-- returns that whole row to the browser (to_jsonb(s)-'launched_at').
create table if not exists public.web_billing_config (
  id                   boolean primary key default true check (id),
  checkout_mode        text    not null default 'off' check (checkout_mode in ('off','testers','on')),
  renewals_enabled     boolean not null default false,
  price_monthly_minor  integer not null check (price_monthly_minor > 0),
  price_annual_minor   integer not null check (price_annual_minor > 0),
  trial_days           integer not null default 14 check (trial_days between 0 and 365),
  auto_refund_limit    integer not null default 1 check (auto_refund_limit between 0 and 100),
  runner_lease_until   timestamptz,
  runner_last_tick_at  timestamptz,
  updated_at           timestamptz not null default now()
);
-- Owner decision D7 (PR #128): monthly NT$150, annual NT$990, same as the App.
insert into public.web_billing_config (id, price_monthly_minor, price_annual_minor)
values (true, 15000, 99000)
on conflict (id) do nothing;

-- Who may buy while checkout_mode = 'testers'.
create table if not exists public.web_billing_testers (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.web_billing_customers (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  slp_customer_id text not null unique,
  created_at      timestamptz not null default now()
);

-- Only brand / issuing country / last 4 (privacy policy lists exactly these).
-- No first 6 digits, holder name or expiry date.
create table if not exists public.web_payment_methods (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete set null,
  slp_customer_id   text not null,
  slp_instrument_id text not null unique,
  brand             text,
  issuer_country    text,
  last4             text check (last4 ~ '^[0-9]{4}$'),
  status            text not null default 'active' check (status in ('active','disabled')),
  created_at        timestamptz not null default now(),
  disabled_at       timestamptz,
  check ((status = 'disabled') = (disabled_at is not null))
);
create index if not exists web_payment_methods_user_idx on public.web_payment_methods (user_id);

-- access_until is the ONLY column entitlement checks read. Its value is
-- pinned to the state by web_subscriptions_access_rule (design §1.3):
--   trialing  trial_end          (+24h buffer unless cancel_at_period_end)
--   active    current_period_end (+24h buffer unless cancel_at_period_end)
--   past_due  grace_until
--   terminal  frozen, never after ended_at;  incomplete*  null (no Pro)
-- The 24h buffer keeps a member Pro while the renewal job / SLP is slow.
-- '24 hours' (not '1 day') so the result never depends on session TimeZone.
create table if not exists public.web_subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  order_ref             text not null unique check (order_ref ~ '^[A-Za-z0-9]{16}$'),
  user_id               uuid references auth.users(id) on delete set null,
  plan                  text not null check (plan in ('monthly','annual')),
  status                text not null default 'incomplete' check (status in
                          ('incomplete','trialing','active','past_due','expired','refunded','incomplete_expired')),
  price_minor           integer not null check (price_minor > 0),
  currency              text not null default 'TWD' check (currency = 'TWD'),
  next_price_minor      integer check (next_price_minor > 0),
  next_price_from       timestamptz,
  price_notice_sent_at  timestamptz,
  with_trial            boolean not null,
  trial_start           timestamptz,
  trial_end             timestamptz,
  anchor_at             timestamptz,
  cycle                 integer not null default 0 check (cycle >= 0),
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  access_until          timestamptz,
  grace_until           timestamptz,
  retry_count           smallint not null default 0 check (retry_count between 0 and 10),
  next_retry_at         timestamptz,
  needs_customer_action boolean not null default false,
  cancel_at_period_end  boolean not null default false,
  canceled_at           timestamptz,
  cancel_reason         text check (cancel_reason in
                          ('user','admin','account_deleted','refund','grace_exhausted','duplicate','admin_hold')),
  billing_hold          boolean not null default false,
  payment_method_id     uuid references public.web_payment_methods(id),
  ended_at              timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint web_subscriptions_next_price_pair check ((next_price_minor is null) = (next_price_from is null)),
  constraint web_subscriptions_cancel_stamp check (not cancel_at_period_end or canceled_at is not null),
  constraint web_subscriptions_trial_window check (trial_end is null or trial_start is null or trial_end > trial_start),
  -- coalesce: a CHECK that evaluates to NULL would PASS (e.g. access_until null).
  constraint web_subscriptions_access_rule check (coalesce(case status
    when 'incomplete' then access_until is null and ended_at is null
    when 'incomplete_expired' then access_until is null and ended_at is not null
    when 'trialing' then with_trial and trial_start is not null and trial_end is not null and ended_at is null
      and access_until = trial_end + case when cancel_at_period_end then interval '0' else interval '24 hours' end
    when 'active' then cycle >= 1 and anchor_at is not null and current_period_end is not null and ended_at is null
      and access_until = current_period_end + case when cancel_at_period_end then interval '0' else interval '24 hours' end
    when 'past_due' then grace_until is not null and ended_at is null and access_until = grace_until
    else ended_at is not null and (access_until is null or access_until <= ended_at)
  end, false))
);
-- One in-progress subscription per member (double click / parallel tabs).
create unique index if not exists web_subscriptions_one_open_per_user
  on public.web_subscriptions (user_id) where status in ('incomplete','trialing','active','past_due');
-- has_pro() runs on every quota-checked insert: keep paid_until an index probe.
create index if not exists web_subscriptions_user_access_idx on public.web_subscriptions (user_id, access_until);

-- Every request to SLP that can move money (card binding included).
create table if not exists public.web_payment_attempts (
  id                   uuid primary key default gen_random_uuid(),
  subscription_id      uuid not null references public.web_subscriptions(id),
  user_id              uuid references auth.users(id) on delete set null,
  kind                 text not null check (kind in ('card_bind','first_purchase','recurring','customer_present')),
  cycle                integer not null check (cycle >= 0),
  attempt_no           smallint not null check (attempt_no >= 1),
  reference_order_id   text not null unique check (char_length(reference_order_id) between 1 and 32),
  amount_minor         integer not null check (amount_minor >= 0),
  currency             text not null default 'TWD' check (currency = 'TWD'),
  status               text not null default 'pending' check (status in ('pending','succeeded','failed','unknown')),
  slp_trade_order_id   text unique,
  slp_status           text,
  slp_sub_status       text,
  failure_code         text,
  failure_msg          text,
  cooling_off_eligible boolean not null default false,
  refund_deadline      timestamptz,
  refunded_minor       integer not null default 0,
  created_at           timestamptz not null default now(),
  finished_at          timestamptz,
  check ((kind = 'card_bind') = (cycle = 0)),
  check (refunded_minor between 0 and amount_minor),
  check (not cooling_off_eligible or refund_deadline is not null),
  check ((status in ('succeeded','failed')) = (finished_at is not null))
);
-- The core of "never charge twice" (design §4.3): per subscription and cycle,
-- at most one successful charge and at most one undecided request.
create unique index if not exists web_payment_attempts_one_success_per_cycle
  on public.web_payment_attempts (subscription_id, cycle) where status = 'succeeded' and kind <> 'card_bind';
create unique index if not exists web_payment_attempts_one_open_per_cycle
  on public.web_payment_attempts (subscription_id, cycle) where status in ('pending','unknown');
create index if not exists web_payment_attempts_user_idx on public.web_payment_attempts (user_id, created_at desc);

create table if not exists public.web_refunds (
  id                  uuid primary key default gen_random_uuid(),
  payment_attempt_id  uuid not null references public.web_payment_attempts(id),
  user_id             uuid references auth.users(id) on delete set null,
  reference_order_id  text not null unique check (char_length(reference_order_id) between 1 and 32),
  amount_minor        integer not null check (amount_minor > 0),
  reason              text not null check (reason in ('cooling_off','duplicate','wrong_amount',
                        'charged_after_cancel','account_compromised','service_discontinued','admin_other')),
  requested_by        text not null check (requested_by in ('user','admin')),
  requested_at        timestamptz not null default now(),
  due_by              timestamptz not null,
  status              text not null default 'requested' check (status in
                        ('requested','processing','succeeded','failed','needs_review')),
  slp_refund_order_id text,
  completed_at        timestamptz,
  check ((status = 'succeeded') = (completed_at is not null))
);
create index if not exists web_refunds_attempt_idx on public.web_refunds (payment_attempt_id);
create index if not exists web_refunds_user_idx on public.web_refunds (user_id, requested_at desc);

-- External event de-duplication + audit. payload keeps whitelisted fields only.
create table if not exists public.web_billing_events (
  source             text not null check (source in ('slp_webhook','cron','user','admin','system')),
  event_id           text not null,
  type               text,
  reference_order_id text,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  outcome            text,
  payload            jsonb,
  primary key (source, event_id)
);

-- One trial per person across iOS and web (design §6).
create table if not exists public.web_trial_usage (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  source        text not null check (source in ('web','apple')),
  first_used_at timestamptz not null default now(),
  ref           text
);

create table if not exists public.web_email_outbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  kind        text not null check (kind in ('receipt','trial_ending','renewal_reminder','payment_failed',
                'action_required','refund_done','canceled','price_change','service_notice')),
  dedupe_key  text not null unique,
  to_email    text not null,
  payload     jsonb,
  status      text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  attempts    smallint not null default 0 check (attempts >= 0),
  provider_id text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists web_email_outbox_queue_idx on public.web_email_outbox (status, created_at);

-- RLS on, no client table privileges at all (Supabase grants new public
-- tables to anon/authenticated by default, so revoke explicitly). The
-- restrictive suspension policy matches every other public RLS table.
do $$
declare t text;
begin
  foreach t in array array['web_billing_config','web_billing_testers','web_billing_customers',
      'web_payment_methods','web_subscriptions','web_payment_attempts','web_refunds',
      'web_billing_events','web_trial_usage','web_email_outbox'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists operations_account_active on public.%I', t);
    execute format('create policy operations_account_active on public.%I as restrictive for all to authenticated '
                   'using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()))', t);
  end loop;
end $$;

-- ── 2. State machine guards (design §1.3) ─────────────────────────────────
-- New subscriptions start as 'incomplete' (only a completed card binding /
-- payment can turn one into Pro: terms T2). Terminal states are final and
-- their access_until is frozen. plan / order_ref / with_trial never change;
-- user_id may only become null (account deletion keeps billing records).
create or replace function huddle_ops.web_subscription_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'incomplete' then
      raise exception 'WEB_SUBSCRIPTION_MUST_START_INCOMPLETE (%)', new.status using errcode = '23514';
    end if;
    return new;
  end if;
  if new.order_ref is distinct from old.order_ref or new.plan is distinct from old.plan
     or new.with_trial is distinct from old.with_trial
     or (new.user_id is distinct from old.user_id and new.user_id is not null) then
    raise exception 'WEB_SUBSCRIPTION_IMMUTABLE_FIELD' using errcode = '23514';
  end if;
  if new.cycle < old.cycle then
    raise exception 'WEB_SUBSCRIPTION_CYCLE_DECREASE' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'incomplete' and new.status in ('trialing','active','incomplete_expired'))
    or (old.status = 'trialing'   and new.status in ('active','past_due','expired','refunded'))
    or (old.status = 'active'     and new.status in ('past_due','expired','refunded'))
    or (old.status = 'past_due'   and new.status in ('active','expired','refunded'))) then
    raise exception 'WEB_SUBSCRIPTION_INVALID_TRANSITION % -> %', old.status, new.status using errcode = '23514';
  end if;
  if old.status in ('expired','refunded','incomplete_expired') and new.access_until is distinct from old.access_until then
    raise exception 'WEB_SUBSCRIPTION_TERMINAL_ACCESS_FROZEN' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists web_subscription_guard on public.web_subscriptions;
create trigger web_subscription_guard before insert or update on public.web_subscriptions
  for each row execute function huddle_ops.web_subscription_guard();

-- A decided charge never becomes undecided or flips outcome (a succeeded row
-- turning 'failed' would re-open its cycle for a second charge).
create or replace function huddle_ops.web_payment_attempt_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.subscription_id is distinct from old.subscription_id or new.cycle is distinct from old.cycle
     or new.kind is distinct from old.kind or new.amount_minor is distinct from old.amount_minor
     or new.reference_order_id is distinct from old.reference_order_id
     or (new.user_id is distinct from old.user_id and new.user_id is not null) then
    raise exception 'WEB_PAYMENT_IMMUTABLE_FIELD' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'pending' and new.status in ('succeeded','failed','unknown'))
    or (old.status = 'unknown' and new.status in ('succeeded','failed'))) then
    raise exception 'WEB_PAYMENT_INVALID_TRANSITION % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists web_payment_attempt_guard on public.web_payment_attempts;
create trigger web_payment_attempt_guard before update on public.web_payment_attempts
  for each row execute function huddle_ops.web_payment_attempt_guard();

-- Refunds only against a succeeded charge, and all non-failed refunds of one
-- charge never exceed it. The charge row lock serializes concurrent requests.
create or replace function huddle_ops.web_refund_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_amount integer;
  v_status text;
  v_other  bigint;
begin
  select a.amount_minor, a.status into v_amount, v_status
    from public.web_payment_attempts a where a.id = new.payment_attempt_id for update;
  if v_status is distinct from 'succeeded' then
    raise exception 'WEB_REFUND_REQUIRES_SUCCEEDED_PAYMENT' using errcode = '23514';
  end if;
  select coalesce(sum(r.amount_minor), 0) into v_other from public.web_refunds r
   where r.payment_attempt_id = new.payment_attempt_id and r.status <> 'failed' and r.id <> new.id;
  if new.status <> 'failed' and v_other + new.amount_minor > v_amount then
    raise exception 'WEB_REFUND_EXCEEDS_PAYMENT' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists web_refund_guard on public.web_refunds;
create trigger web_refund_guard before insert or update of payment_attempt_id, amount_minor, status on public.web_refunds
  for each row execute function huddle_ops.web_refund_guard();

-- ── 3. Unified "paid until" ────────────────────────────────────────────────
-- NOTE the name clash: the dispatch('self') JSON key `paid_until` stays
-- Apple-only. This SQL function is Apple OR web (whichever is later).
create or replace function huddle_ops.web_paid_until(p_user uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(w.access_until) from public.web_subscriptions w where w.user_id = p_user
$$;
comment on function huddle_ops.web_paid_until(uuid) is
  'Latest access_until of the member''s website subscriptions (null if none).';

create or replace function huddle_ops.paid_until(p_user uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(
    (select b.expires_at from public.billing_entitlements b where b.user_id = p_user and b.entitlement = 'pro'),
    huddle_ops.web_paid_until(p_user))
$$;
comment on function huddle_ops.paid_until(uuid) is
  'Paid coverage end: later of Apple (billing_entitlements) and website subscriptions. '
  'NOT the same as the dispatch(''self'') JSON key paid_until, which stays Apple-only.';

-- ── 4. Existing readers switched to paid_until ─────────────────────────────
-- Copied from the last repo definition (identical to production, see header);
-- the only change in each is marked "web billing".

-- From 20260927120000_task_assignments_orgs.sql.
create or replace function huddle_ops.has_pro(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(huddle_ops.paid_until(p_user) > now(), false) -- web billing: Apple or web
      or exists(select 1 from huddle_ops.grants g
                where g.user_id = p_user and g.revoked_at is null and g.expires_at > now())
$$;

-- From 20261001200000_pro_limits.sql.
create or replace function huddle_ops.pro_until(p_user uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(now(),
    (select max(g.expires_at) from huddle_ops.grants g where g.user_id = p_user and g.revoked_at is null),
    huddle_ops.paid_until(p_user)) -- web billing: Apple or web
$$;

-- From 20260925075939_operations_referrals.sql (still SECURITY INVOKER: only
-- definer functions call it). Gifts start after paid coverage, web included.
create or replace function huddle_ops.give_days(u uuid, d integer, src text, k text, why text)
returns uuid language plpgsql set search_path='' as $$
declare g uuid; base timestamptz;
begin
  if d=0 then return null; end if;
  select id into g from huddle_ops.grants where source_key=k;
  if found then
    if exists(select 1 from huddle_ops.grants where id=g and (user_id<>u or days<>d or source<>src)) then raise exception '操作識別碼已使用，請重新開啟會員頁'; end if;
    return g;
  end if;
  perform 1 from huddle_ops.members where user_id=u for update;
  select greatest(now(),
    (select max(expires_at) from huddle_ops.grants where user_id=u and revoked_at is null),
    huddle_ops.paid_until(u)) into base; -- web billing: Apple or web
  insert into huddle_ops.grants(user_id,days,source,source_key,starts_at,expires_at,reason)
    values(u,d,src,k,base,base+make_interval(days=>d),why) returning id into g;
  return g;
end $$;

-- From 20260925075939_operations_referrals.sql. Shared by both paid tables:
-- unspent gift time always sits behind ALL paid coverage. When coverage
-- shrinks (refund), deferred gifts move forward again.
create or replace function huddle_ops.defer_gifts() returns trigger language plpgsql security definer set search_path='' as $$
declare g record; cursor_at timestamptz; remaining interval;
begin
  perform 1 from huddle_ops.members where user_id=new.user_id for update;
  cursor_at:=greatest(now(),huddle_ops.paid_until(new.user_id)); -- web billing: Apple or web
  for g in select * from huddle_ops.grants where user_id=new.user_id and revoked_at is null and expires_at>now() order by starts_at,id for update loop
    remaining:=g.expires_at-greatest(g.starts_at,now());
    update huddle_ops.grants set starts_at=cursor_at,expires_at=cursor_at+remaining where id=g.id;
    cursor_at:=cursor_at+remaining;
  end loop;
  return new;
end $$;
drop trigger if exists operations_defer_gifts_web on public.web_subscriptions;
create trigger operations_defer_gifts_web after insert or update of access_until on public.web_subscriptions
  for each row execute function huddle_ops.defer_gifts();

-- ── 5. dispatch: rewrite the LIVE definition, fragment by fragment ─────────
-- dispatch is ~23 KB; copying it whole risks silently reverting a production
-- hotfix. Like 20261001200000 §8/§10, read the live definition, replace each
-- fragment that must appear EXACTLY once, else abort the migration.
--   1 'self'            pro_until includes web; new key web_paid_until.
--                       (key paid_until untouched: Apple only, iOS card)
--   2 admin_revoke      re-queue gifts behind web coverage too
--   3 admin_analytics   "paid" counts web subscribers
--   4-6 admin_overview  paid / gifted / converted_trials count web subscribers
--   7 admin_members     extra column web_paid_until (paid_until stays Apple)
-- admin_coupons / admin_billing stay Apple-only (design §1.4, P5).
do $$
declare
  v_def text := pg_get_functiondef('huddle_ops.dispatch(text,jsonb)'::regprocedure);
  v_old text[] := array[
    $f$'pro_until',greatest((select max(expires_at) from huddle_ops.grants where user_id=u and revoked_at is null),(select expires_at from public.billing_entitlements where user_id=u and entitlement='pro')),$f$,
    $f$cursor_at:=greatest(now(),(select expires_at from public.billing_entitlements where user_id=target));$f$,
    $f$count(*) filter(where exists(select 1 from public.billing_entitlements b where b.user_id=cohort.id and b.expires_at>now())) as paid$f$,
    $f$'paid',(select count(*) from public.billing_entitlements where expires_at>now()),$f$,
    $f$and not exists(select 1 from public.billing_entitlements b where b.user_id=g.user_id and b.expires_at>now())),$f$,
    $f$(select count(distinct g.user_id) from huddle_ops.grants g join public.billing_entitlements b using(user_id) where g.source='trial' and g.revoked_at is null and g.expires_at<=now() and b.expires_at>now()),$f$,
    $f$(select expires_at from public.billing_entitlements where user_id=au.id) as paid_until,$f$];
  v_new text[] := array[
    $f$'pro_until',greatest((select max(expires_at) from huddle_ops.grants where user_id=u and revoked_at is null),huddle_ops.paid_until(u)),
      'web_paid_until',huddle_ops.web_paid_until(u),$f$,
    $f$cursor_at:=greatest(now(),huddle_ops.paid_until(target));$f$,
    $f$count(*) filter(where huddle_ops.paid_until(cohort.id)>now()) as paid$f$,
    $f$'paid',(select count(*) from (select b.user_id from public.billing_entitlements b where b.expires_at>now() union select w.user_id from public.web_subscriptions w where w.user_id is not null and w.access_until>now()) paid_members),$f$,
    $f$and not coalesce(huddle_ops.paid_until(g.user_id)>now(),false)),$f$,
    $f$(select count(distinct g.user_id) from huddle_ops.grants g where g.source='trial' and g.revoked_at is null and g.expires_at<=now() and huddle_ops.paid_until(g.user_id)>now()),$f$,
    $f$(select expires_at from public.billing_entitlements where user_id=au.id) as paid_until,
        huddle_ops.web_paid_until(au.id) as web_paid_until,$f$];
  v_hits integer;
begin
  for i in 1 .. array_length(v_old, 1) loop
    v_hits := (length(v_def) - length(replace(v_def, v_old[i], ''))) / length(v_old[i]);
    if v_hits <> 1 then
      raise exception 'dispatch fragment % found % times (expected 1); review web billing migration', i, v_hits;
    end if;
    v_def := replace(v_def, v_old[i], v_new[i]);
  end loop;
  -- Exactly 5 Apple reads may remain: 'self' paid_until, the Apple half of
  -- admin_overview paid, admin_members paid_until, admin_coupons, admin_billing.
  if (length(v_def) - length(replace(v_def, 'public.billing_entitlements', ''))) / length('public.billing_entitlements') <> 5
     or position($f$'paid_until',(select expires_at from public.billing_entitlements where user_id=u and entitlement='pro'),$f$ in v_def) = 0 then
    raise exception 'dispatch Apple-only readers changed shape; review web billing migration';
  end if;
  execute v_def;
end $$;

-- ── 6. The one client read: my own website billing, fixed shape ────────────
-- No table grants for clients; this returns only display fields (no SLP ids,
-- order refs, email, failure details). checkout_available is the server half
-- of the gate: the web client additionally hides everything in the native app.
create or replace function public.my_web_billing() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  c     public.web_billing_config;
  s     public.web_subscriptions;
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into c from public.web_billing_config where id;
  select * into s from public.web_subscriptions w
   where w.user_id = v_uid and w.status <> 'incomplete_expired'
   order by (w.status in ('incomplete','trialing','active','past_due')) desc, w.created_at desc, w.id
   limit 1;
  return jsonb_build_object(
    'checkout_available', coalesce(c.checkout_mode = 'on'
        or (c.checkout_mode = 'testers' and exists (select 1 from public.web_billing_testers t where t.user_id = v_uid)), false),
    'trial_eligible', not exists (select 1 from public.web_trial_usage t where t.user_id = v_uid),
    'apple_active', exists (select 1 from public.billing_entitlements b
                             where b.user_id = v_uid and b.entitlement = 'pro' and b.expires_at > now()),
    'prices', jsonb_build_object('monthly', c.price_monthly_minor, 'annual', c.price_annual_minor, 'currency', 'TWD'),
    'trial_days', c.trial_days,
    'subscription', case when s.id is null then null else jsonb_build_object(
        'plan', s.plan, 'status', s.status, 'trial_end', s.trial_end,
        'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end,
        'needs_customer_action', s.needs_customer_action, 'grace_until', s.grace_until,
        'price_minor', s.price_minor) end,
    'card', (select jsonb_build_object('brand', pm.brand, 'last4', pm.last4)
               from public.web_payment_methods pm where pm.id = s.payment_method_id and pm.status = 'active'),
    'payments', coalesce((select jsonb_agg(to_jsonb(q) order by q.date desc, q.id) from (
        select a.id, coalesce(a.finished_at, a.created_at) as date, a.amount_minor, a.status, a.refunded_minor,
               case when a.status = 'succeeded' and a.cooling_off_eligible and a.refunded_minor = 0
                         and a.refund_deadline > now()
                         and not exists (select 1 from public.web_refunds r
                                          where r.payment_attempt_id = a.id and r.status <> 'failed')
                    then a.refund_deadline end as refundable_until
          from public.web_payment_attempts a
         where a.user_id = v_uid and a.kind <> 'card_bind'
         order by coalesce(a.finished_at, a.created_at) desc, a.id
         limit 24) q), '[]'::jsonb),
    'open_refund', (select jsonb_build_object('status', r.status, 'due_by', r.due_by)
                      from public.web_refunds r
                     where r.user_id = v_uid and r.status in ('requested','processing','needs_review')
                     order by r.requested_at desc, r.id limit 1));
end $$;

-- ── 7. Privileges ──────────────────────────────────────────────────────────
revoke all on function
  huddle_ops.web_paid_until(uuid),
  huddle_ops.paid_until(uuid),
  huddle_ops.web_subscription_guard(),
  huddle_ops.web_payment_attempt_guard(),
  huddle_ops.web_refund_guard(),
  public.my_web_billing()
from public, anon, authenticated;
grant execute on function public.my_web_billing() to authenticated;

reset statement_timeout;
reset lock_timeout;
