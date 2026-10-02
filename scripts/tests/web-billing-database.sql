-- Web billing P1 behaviour: rollback round trip, unified paid_until, state
-- machine guards, gift deferral, back office, client read path, RLS.
-- Run by scripts/tests/web-billing-database.sh after web-billing-equivalence.sql.
-- Disposable local cluster only.
\set ON_ERROR_STOP on

create or replace function public.t_err(p_sql text, p_fragment text, p_msg text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(p_fragment in sqlerrm) > 0 then raise notice 'PASS: %', p_msg; return; end if;
    raise exception 'FAILED: % (unexpected error: %)', p_msg, sqlerrm;
  end;
  raise exception 'FAILED: % (no error raised)', p_msg;
end $$;

-- ── 1. Rollback round trip: up → down → identical defs → up again ──────────
\ir ../../supabase/rollback/20261002230100_web_billing_foundation_down.sql
select public.t_defs_capture('down');
select public.t_ok(not exists (
  select 1 from public.t_defs p join public.t_defs d on d.sig = p.sig and d.phase = 'down'
  where p.phase = 'pre' and p.md5 is distinct from d.md5)
  and (select count(*) from public.t_defs where phase = 'down') = 5,
  'down restores dispatch / has_pro / pro_until / give_days / defer_gifts byte-for-byte (md5 of pg_get_functiondef)');
select public.t_ok(to_regprocedure('huddle_ops.paid_until(uuid)') is null and to_regprocedure('public.my_web_billing()') is null
  and to_regclass('public.web_subscriptions') is not null
  and not exists (select 1 from pg_trigger where tgname in ('operations_defer_gifts_web','web_subscription_guard')),
  'down drops new functions and triggers but keeps the web_* tables (billing records)');
\ir ../../supabase/migrations/20261002230100_web_billing_foundation.sql
select public.t_defs_capture('up2');
select public.t_ok(not exists (
  select 1 from public.t_defs a join public.t_defs b on b.sig = a.sig and b.phase = 'up2'
  where a.phase = 'up1' and a.md5 is distinct from b.md5),
  're-applying up after down gives the same definitions as the first up');
select public.t_ok((select count(*) from public.web_billing_config) = 1, 're-apply keeps the single config row');

-- ── 2. Config defaults: everything off, prices in one place ────────────────
select public.t_ok((select checkout_mode = 'off' and not renewals_enabled and price_monthly_minor = 15000
  and price_annual_minor = 99000 and trial_days = 14 and auto_refund_limit = 1 from public.web_billing_config),
  'config defaults: checkout off, renewals off, NT$150 = 15000 / NT$990 = 99000, 14-day trial');
select public.t_err($$insert into public.web_billing_config(id, price_monthly_minor, price_annual_minor) values (false, 1, 1)$$,
  'violates check constraint', 'config is a single row');
select public.t_ok(not exists (select 1 from information_schema.columns where table_schema = 'huddle_ops'
  and table_name = 'settings' and column_name ~ '(price|checkout|renewal)'),
  'nothing billing-related was added to huddle_ops.settings (dispatch self returns that row)');

-- ── 3. Fixture members ─────────────────────────────────────────────────────
update huddle_ops.settings set trial_enabled = false;
insert into auth.users(id, email) values
 ('00000000-0000-4000-8000-0000000000b0','b-admin@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b1','web-active@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b2','apple-only@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b3','both-web-later@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b4','both-apple-later@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b5','past-due@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b6','canceled@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b7','expired@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b8','apple-lapses@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b9','trialing@example.invalid'),
 ('00000000-0000-4000-8000-0000000000ba','incomplete@example.invalid'),
 ('00000000-0000-4000-8000-0000000000bb','gift-then-web@example.invalid'),
 ('00000000-0000-4000-8000-0000000000bc','web-then-gift@example.invalid'),
 ('00000000-0000-4000-8000-0000000000bd','revoke@example.invalid'),
 ('00000000-0000-4000-8000-0000000000be','suspended-web@example.invalid');
insert into huddle_ops.admin_users(user_id) values ('00000000-0000-4000-8000-0000000000b0');
insert into huddle_ops.members(user_id, alias, trial_checked, suspended)
  select id, 'w ' || right(id::text, 2), true, id = '00000000-0000-4000-8000-0000000000be'
  from auth.users where id::text like '%0000000000b%' on conflict do nothing;

-- Walks a subscription through the real transitions as service_role.
-- p_end = trial_end (trialing) / current_period_end (active, expired) / grace_until (past_due).
create or replace function public.t_sub(p_user uuid, p_state text, p_end timestamptz, p_canceled boolean default false)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid(); v_buffer interval := case when p_canceled then interval '0' else interval '24 hours' end;
begin
  insert into public.web_subscriptions(id, order_ref, user_id, plan, price_minor, with_trial)
  values (v_id, substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), p_user, 'monthly', 15000, p_state = 'trialing');
  if p_state = 'incomplete' then return v_id; end if;
  if p_state = 'trialing' then
    update public.web_subscriptions set status = 'trialing', trial_start = now() - interval '1 hour', trial_end = p_end,
      anchor_at = p_end, current_period_end = p_end, cancel_at_period_end = p_canceled,
      canceled_at = case when p_canceled then now() end, access_until = p_end + v_buffer where id = v_id;
    return v_id;
  end if;
  update public.web_subscriptions set status = 'active', cycle = 1, anchor_at = p_end - interval '1 month',
    current_period_start = p_end - interval '1 month', current_period_end = p_end,
    cancel_at_period_end = p_canceled, canceled_at = case when p_canceled then now() end,
    access_until = p_end + v_buffer where id = v_id;
  if p_state = 'past_due' then
    update public.web_subscriptions set status = 'past_due', grace_until = p_end, access_until = p_end,
      retry_count = 1, next_retry_at = now() + interval '1 day' where id = v_id;
  elsif p_state = 'expired' then
    update public.web_subscriptions set status = 'expired', ended_at = now(), cancel_reason = 'grace_exhausted' where id = v_id;
  end if;
  return v_id;
end $$;
grant execute on function public.t_sub(uuid, text, timestamptz, boolean) to service_role;

set role service_role;
select public.t_sub('00000000-0000-4000-8000-0000000000b1', 'active',   now() + interval '10 days');
select public.t_sub('00000000-0000-4000-8000-0000000000b3', 'active',   now() + interval '40 days');
select public.t_sub('00000000-0000-4000-8000-0000000000b4', 'active',   now() + interval '10 days');
select public.t_sub('00000000-0000-4000-8000-0000000000b5', 'past_due', now() + interval '3 days');
select public.t_sub('00000000-0000-4000-8000-0000000000b6', 'active',   now() + interval '2 days', true);
select public.t_sub('00000000-0000-4000-8000-0000000000b7', 'expired',  now() - interval '2 days');
select public.t_sub('00000000-0000-4000-8000-0000000000b8', 'active',   now() + interval '20 days');
select public.t_sub('00000000-0000-4000-8000-0000000000b9', 'trialing', now() + interval '5 days');
select public.t_sub('00000000-0000-4000-8000-0000000000ba', 'incomplete', null);
select public.t_sub('00000000-0000-4000-8000-0000000000be', 'active',   now() + interval '10 days');
select public.apply_billing_snapshot('w-1', jsonb_build_array(
  jsonb_build_object('user_id','00000000-0000-4000-8000-0000000000b2','expires_at',now() + interval '30 days','observed_at_ms',1),
  jsonb_build_object('user_id','00000000-0000-4000-8000-0000000000b3','expires_at',now() + interval '5 days','observed_at_ms',1),
  jsonb_build_object('user_id','00000000-0000-4000-8000-0000000000b4','expires_at',now() + interval '60 days','observed_at_ms',1),
  jsonb_build_object('user_id','00000000-0000-4000-8000-0000000000b8','expires_at',now() + interval '20 days','observed_at_ms',1)));
reset role;

create or replace function public.t_web(p_user text) returns timestamptz language sql as
$$ select max(access_until) from public.web_subscriptions where user_id = p_user::uuid $$;
create or replace function public.t_apple(p_user text) returns timestamptz language sql as
$$ select expires_at from public.billing_entitlements where user_id = p_user::uuid $$;
create or replace function public.t_self(p_user text) returns jsonb language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user, true); return huddle_ops.dispatch('self'); end $$;
create or replace function public.t_usage(p_user text) returns jsonb language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user, true); return public.my_plan_usage(); end $$;
create or replace function public.t_mwb(p_user text) returns jsonb language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user, true); return public.my_web_billing(); end $$;
update huddle_ops.settings set limits_enforced = true;

-- ── 4. Unified paid_until / has_pro ────────────────────────────────────────
select public.t_ok(huddle_ops.has_pro('00000000-0000-4000-8000-0000000000b1')
  and huddle_ops.paid_until('00000000-0000-4000-8000-0000000000b1') = public.t_web('00000000-0000-4000-8000-0000000000b1')
  and public.t_web('00000000-0000-4000-8000-0000000000b1') = (select current_period_end + interval '24 hours' from public.web_subscriptions where user_id = '00000000-0000-4000-8000-0000000000b1')
  and huddle_ops.plan_allows('00000000-0000-4000-8000-0000000000b1')
  and (public.t_usage('00000000-0000-4000-8000-0000000000b1')->>'pro')::boolean,
  'web only (active): Pro, paid_until = period end + 24h buffer, plan_allows and my_plan_usage.pro true');
select public.t_ok(huddle_ops.has_pro('00000000-0000-4000-8000-0000000000b2')
  and huddle_ops.paid_until('00000000-0000-4000-8000-0000000000b2') = public.t_apple('00000000-0000-4000-8000-0000000000b2')
  and huddle_ops.web_paid_until('00000000-0000-4000-8000-0000000000b2') is null,
  'Apple only: Pro, paid_until = Apple expiry, web_paid_until null');
select public.t_ok(huddle_ops.paid_until('00000000-0000-4000-8000-0000000000b3') = public.t_web('00000000-0000-4000-8000-0000000000b3')
  and huddle_ops.paid_until('00000000-0000-4000-8000-0000000000b4') = public.t_apple('00000000-0000-4000-8000-0000000000b4')
  and huddle_ops.pro_until('00000000-0000-4000-8000-0000000000b3') = public.t_web('00000000-0000-4000-8000-0000000000b3'),
  'Apple + web: paid_until / pro_until take the later of the two (both directions)');
select public.t_ok(huddle_ops.has_pro('00000000-0000-4000-8000-0000000000b5')
  and huddle_ops.paid_until('00000000-0000-4000-8000-0000000000b5') = (select grace_until from public.web_subscriptions where user_id = '00000000-0000-4000-8000-0000000000b5'),
  'past_due inside the 7-day grace: still Pro until grace_until');
select public.t_ok(huddle_ops.has_pro('00000000-0000-4000-8000-0000000000b6')
  and public.t_web('00000000-0000-4000-8000-0000000000b6') = (select current_period_end from public.web_subscriptions where user_id = '00000000-0000-4000-8000-0000000000b6'),
  'canceled but period not over: still Pro, access ends exactly at period end (no buffer)');
select public.t_ok(not huddle_ops.has_pro('00000000-0000-4000-8000-0000000000b7')
  and not huddle_ops.plan_allows('00000000-0000-4000-8000-0000000000b7')
  and not (public.t_usage('00000000-0000-4000-8000-0000000000b7')->>'pro')::boolean
  and huddle_ops.paid_until('00000000-0000-4000-8000-0000000000b7') < now()
  and huddle_ops.pro_until('00000000-0000-4000-8000-0000000000b7') = now(),
  'expired: not Pro, plan_allows false (limits on), my_plan_usage.pro false');
select public.t_ok(huddle_ops.has_pro('00000000-0000-4000-8000-0000000000b9')
  and public.t_web('00000000-0000-4000-8000-0000000000b9') = (select trial_end + interval '24 hours' from public.web_subscriptions where user_id = '00000000-0000-4000-8000-0000000000b9'),
  'trialing: Pro until trial end + 24h buffer');
select public.t_ok(not huddle_ops.has_pro('00000000-0000-4000-8000-0000000000ba')
  and huddle_ops.paid_until('00000000-0000-4000-8000-0000000000ba') is null,
  'incomplete (card not bound yet): not Pro, paid_until null');

-- Apple lapsing / being revoked never touches web coverage.
set role service_role;
select public.apply_billing_snapshot('w-2', '[{"user_id":"00000000-0000-4000-8000-0000000000b8","expires_at":null,"observed_at_ms":2}]');
reset role;
select public.t_ok(huddle_ops.has_pro('00000000-0000-4000-8000-0000000000b8')
  and public.t_apple('00000000-0000-4000-8000-0000000000b8') is null
  and huddle_ops.paid_until('00000000-0000-4000-8000-0000000000b8') = public.t_web('00000000-0000-4000-8000-0000000000b8'),
  'Apple revoked (expires_at null): web subscription still Pro, paid_until = web');
set role service_role;
select public.apply_billing_snapshot('w-3', jsonb_build_array(jsonb_build_object('user_id','00000000-0000-4000-8000-0000000000b8','expires_at',now() - interval '1 day','observed_at_ms',3)));
reset role;
select public.t_ok(huddle_ops.has_pro('00000000-0000-4000-8000-0000000000b8')
  and huddle_ops.paid_until('00000000-0000-4000-8000-0000000000b8') = public.t_web('00000000-0000-4000-8000-0000000000b8'),
  'Apple expired (in the past): web expiry unaffected');

-- ── 5. dispatch('self'): paid_until stays Apple only ───────────────────────
select public.t_ok(public.t_self('00000000-0000-4000-8000-0000000000b1') -> 'paid_until' = 'null'::jsonb
  and (public.t_self('00000000-0000-4000-8000-0000000000b1') ->> 'web_paid_until')::timestamptz = public.t_web('00000000-0000-4000-8000-0000000000b1')
  and (public.t_self('00000000-0000-4000-8000-0000000000b1') ->> 'pro_until')::timestamptz = public.t_web('00000000-0000-4000-8000-0000000000b1'),
  'self (web only): paid_until null (iOS card must not see Apple), web_paid_until + pro_until = web');
select public.t_ok((public.t_self('00000000-0000-4000-8000-0000000000b3') ->> 'paid_until')::timestamptz = public.t_apple('00000000-0000-4000-8000-0000000000b3')
  and (public.t_self('00000000-0000-4000-8000-0000000000b3') ->> 'web_paid_until')::timestamptz = public.t_web('00000000-0000-4000-8000-0000000000b3')
  and (public.t_self('00000000-0000-4000-8000-0000000000b3') ->> 'pro_until')::timestamptz = public.t_web('00000000-0000-4000-8000-0000000000b3'),
  'self (Apple + web, web later): paid_until = Apple exactly, pro_until = web');

-- ── 6. Gifts always sit behind paid coverage, web included ─────────────────
select huddle_ops.give_days('00000000-0000-4000-8000-0000000000bb', 7, 'manual', 'w:bb', 'test');
set role service_role;
select public.t_sub('00000000-0000-4000-8000-0000000000bb', 'trialing', now() + interval '14 days');
reset role;
-- (the few ms the gift was already running before the trial started are spent)
select public.t_ok((select starts_at = public.t_web('00000000-0000-4000-8000-0000000000bb')
    and expires_at - starts_at between interval '7 days' - interval '1 minute' and interval '7 days'
  from huddle_ops.grants where source_key = 'w:bb'),
  'web trial starting: the unspent gift is moved behind it (defer_gifts trigger on web_subscriptions)');
set role service_role;
update public.web_subscriptions set status = 'refunded', ended_at = now(), access_until = now(), cancel_reason = 'refund'
 where user_id = '00000000-0000-4000-8000-0000000000bb';
reset role;
select public.t_ok((select starts_at <= now() + interval '1 second' and expires_at between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days' + interval '1 minute'
  from huddle_ops.grants where source_key = 'w:bb') and huddle_ops.has_pro('00000000-0000-4000-8000-0000000000bb'),
  'web coverage shrinking (refund): the deferred gift moves back to now, full 7 days kept');
set role service_role;
select public.t_sub('00000000-0000-4000-8000-0000000000bc', 'active', now() + interval '10 days');
reset role;
select huddle_ops.give_days('00000000-0000-4000-8000-0000000000bc', 5, 'manual', 'w:bc', 'test');
select public.t_ok((select starts_at = public.t_web('00000000-0000-4000-8000-0000000000bc') from huddle_ops.grants where source_key = 'w:bc'),
  'give_days for a web subscriber starts after web coverage');
set role service_role;
select public.t_sub('00000000-0000-4000-8000-0000000000bd', 'active', now() + interval '10 days');
reset role;
select huddle_ops.give_days('00000000-0000-4000-8000-0000000000bd', 7, 'manual', 'w:bd1', 'test');
select huddle_ops.give_days('00000000-0000-4000-8000-0000000000bd', 5, 'manual', 'w:bd2', 'test');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b0', false);
select huddle_ops.dispatch('admin_revoke', jsonb_build_object('id', (select id from huddle_ops.grants where source_key = 'w:bd1'), 'reason', 'test revoke'));
select public.t_ok((select starts_at = public.t_web('00000000-0000-4000-8000-0000000000bd') and expires_at = starts_at + interval '5 days'
  from huddle_ops.grants where source_key = 'w:bd2'),
  'admin_revoke re-queues remaining gifts behind web coverage (not into it)');

-- ── 7. Back office counts web subscribers ──────────────────────────────────
select public.t_ok((huddle_ops.dispatch('admin_overview') ->> 'paid')::integer =
  (select count(*) from auth.users au where huddle_ops.paid_until(au.id) > now()),
  'admin_overview.paid = members whose unified paid_until is in the future');
select public.t_ok((huddle_ops.dispatch('admin_overview') ->> 'gifted')::integer =
  (select count(distinct g.user_id) from huddle_ops.grants g where g.revoked_at is null and g.expires_at > now()
     and not coalesce(huddle_ops.paid_until(g.user_id) > now(), false)),
  'admin_overview.gifted excludes web subscribers');
select public.t_ok(exists (select 1 from jsonb_array_elements(huddle_ops.dispatch('admin_members', '{"search":"web-active"}')) e
  where (e ->> 'web_paid_until')::timestamptz = public.t_web('00000000-0000-4000-8000-0000000000b1') and e -> 'paid_until' = 'null'::jsonb),
  'admin_members: web_paid_until column, paid_until still Apple');
select set_config('request.jwt.claim.sub', '', false);

-- ── 8. State machine and money guards ──────────────────────────────────────
set role service_role;
select public.t_err($$insert into public.web_subscriptions(order_ref, user_id, plan, price_minor, with_trial, status) values ('AAAAAAAAAAAAAAA1', '00000000-0000-4000-8000-0000000000b2', 'monthly', 15000, false, 'active')$$,
  'WEB_SUBSCRIPTION_MUST_START_INCOMPLETE', 'a subscription cannot be created already active (T2)');
select public.t_err($$update public.web_subscriptions set status = 'past_due', grace_until = now(), access_until = now() where user_id = '00000000-0000-4000-8000-0000000000ba'$$,
  'WEB_SUBSCRIPTION_INVALID_TRANSITION', 'incomplete -> past_due rejected');
select public.t_err($$update public.web_subscriptions set status = 'active', ended_at = null, access_until = current_period_end + interval '24 hours' where user_id = '00000000-0000-4000-8000-0000000000b7'$$,
  'WEB_SUBSCRIPTION_INVALID_TRANSITION', 'expired is final (cannot be re-activated)');
select public.t_err($$update public.web_subscriptions set access_until = now() + interval '1 year' where user_id = '00000000-0000-4000-8000-0000000000b7'$$,
  'WEB_SUBSCRIPTION_TERMINAL_ACCESS_FROZEN', 'terminal access_until is frozen');
select public.t_err($$update public.web_subscriptions set access_until = current_period_end + interval '3 days' where user_id = '00000000-0000-4000-8000-0000000000b1'$$,
  'web_subscriptions_access_rule', 'active access_until must equal period end + 24h');
select public.t_err($$update public.web_subscriptions set access_until = null where user_id = '00000000-0000-4000-8000-0000000000b1'$$,
  'web_subscriptions_access_rule', 'active access_until cannot be null (NULL must not pass the check)');
select public.t_err($$update public.web_subscriptions set status = 'trialing', trial_start = now(), trial_end = now() + interval '1 day', access_until = null where user_id = '00000000-0000-4000-8000-0000000000ba'$$,
  'web_subscriptions_access_rule', 'trialing without access_until rejected');
select public.t_err($$insert into public.web_subscriptions(order_ref, user_id, plan, price_minor, with_trial) values ('AAAAAAAAAAAAAAA2', '00000000-0000-4000-8000-0000000000b1', 'annual', 99000, false)$$,
  'web_subscriptions_one_open_per_user', 'second in-progress subscription for the same member rejected');
select public.t_err($$update public.web_subscriptions set plan = 'annual' where user_id = '00000000-0000-4000-8000-0000000000b1'$$,
  'WEB_SUBSCRIPTION_IMMUTABLE_FIELD', 'plan cannot be switched in place (D10)');
select public.t_err($$update public.web_subscriptions set user_id = '00000000-0000-4000-8000-0000000000b2' where user_id = '00000000-0000-4000-8000-0000000000b1'$$,
  'WEB_SUBSCRIPTION_IMMUTABLE_FIELD', 'a subscription cannot move to another member');
select public.t_err($$insert into public.web_subscriptions(order_ref, user_id, plan, price_minor, with_trial) values ('short', '00000000-0000-4000-8000-0000000000b2', 'monthly', 15000, false)$$,
  'violates check constraint', 'order_ref must be 16 alphanumerics');

insert into public.web_payment_methods(id, user_id, slp_customer_id, slp_instrument_id, brand, issuer_country, last4)
values ('00000000-0000-4000-8000-00000000c0c1', '00000000-0000-4000-8000-0000000000b1', 'SLPCUSTSECRET01', 'SLPINSTSECRET01', 'VISA', 'TW', '4242');
update public.web_subscriptions set payment_method_id = '00000000-0000-4000-8000-00000000c0c1' where user_id = '00000000-0000-4000-8000-0000000000b1';
select public.t_err($$insert into public.web_payment_methods(user_id, slp_customer_id, slp_instrument_id, last4) values ('00000000-0000-4000-8000-0000000000b1', 'x', 'y', '42a2')$$,
  'violates check constraint', 'last4 must be four digits');
insert into public.web_payment_attempts(id, subscription_id, user_id, kind, cycle, attempt_no, reference_order_id, amount_minor,
  status, finished_at, cooling_off_eligible, refund_deadline, slp_trade_order_id)
select '00000000-0000-4000-8000-00000000c0a1', id, user_id, 'recurring', 1, 1, 'hpREFSECRET0000001c0001a01', 15000,
  'succeeded', now(), true, now() + interval '7 days', 'SLPTRADESECRET01'
from public.web_subscriptions where user_id = '00000000-0000-4000-8000-0000000000b1';
select public.t_err($$insert into public.web_payment_attempts(subscription_id, user_id, kind, cycle, attempt_no, reference_order_id, amount_minor, status, finished_at)
  select id, user_id, 'recurring', 1, 2, 'hpX2', 15000, 'succeeded', now() from public.web_subscriptions where user_id = '00000000-0000-4000-8000-0000000000b1'$$,
  'web_payment_attempts_one_success_per_cycle', 'second successful charge for the same cycle rejected (no double charge)');
insert into public.web_payment_attempts(subscription_id, user_id, kind, cycle, attempt_no, reference_order_id, amount_minor)
select id, user_id, 'recurring', 2, 1, 'hpP1', 15000 from public.web_subscriptions where user_id = '00000000-0000-4000-8000-0000000000b1';
select public.t_err($$insert into public.web_payment_attempts(subscription_id, user_id, kind, cycle, attempt_no, reference_order_id, amount_minor)
  select id, user_id, 'recurring', 2, 2, 'hpP2', 15000 from public.web_subscriptions where user_id = '00000000-0000-4000-8000-0000000000b1'$$,
  'web_payment_attempts_one_open_per_cycle', 'second undecided charge for the same cycle rejected');
update public.web_payment_attempts set status = 'failed', finished_at = now(), failure_code = '4900' where reference_order_id = 'hpP1';
select public.t_err($$update public.web_payment_attempts set status = 'succeeded' where reference_order_id = 'hpP1'$$,
  'WEB_PAYMENT_INVALID_TRANSITION', 'a decided charge cannot flip outcome');
select public.t_err($$update public.web_payment_attempts set amount_minor = 1 where reference_order_id = 'hpP1'$$,
  'WEB_PAYMENT_IMMUTABLE_FIELD', 'charge amount is immutable');
select public.t_err($$insert into public.web_payment_attempts(subscription_id, user_id, kind, cycle, attempt_no, reference_order_id, amount_minor)
  select id, user_id, 'recurring', 3, 1, repeat('x', 33), 15000 from public.web_subscriptions where user_id = '00000000-0000-4000-8000-0000000000b1'$$,
  'violates check constraint', 'SLP order id longer than 32 rejected');
select public.t_err($$insert into public.web_payment_attempts(subscription_id, user_id, kind, cycle, attempt_no, reference_order_id, amount_minor)
  select id, user_id, 'card_bind', 1, 1, 'hpCB', 100 from public.web_subscriptions where user_id = '00000000-0000-4000-8000-0000000000b1'$$,
  'violates check constraint', 'card binding is always cycle 0');
select public.t_err($$insert into public.web_refunds(payment_attempt_id, user_id, reference_order_id, amount_minor, reason, requested_by, due_by)
  values ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000b1', 'hpR0', 15001, 'cooling_off', 'user', now() + interval '15 days')$$,
  'WEB_REFUND_EXCEEDS_PAYMENT', 'refund larger than the charge rejected');
insert into public.web_refunds(payment_attempt_id, user_id, reference_order_id, amount_minor, reason, requested_by, due_by)
values ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000b1', 'hpR1', 10000, 'duplicate', 'admin', now() + interval '15 days');
select public.t_err($$insert into public.web_refunds(payment_attempt_id, user_id, reference_order_id, amount_minor, reason, requested_by, due_by)
  values ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000b1', 'hpR2', 5001, 'duplicate', 'admin', now() + interval '15 days')$$,
  'WEB_REFUND_EXCEEDS_PAYMENT', 'partial refunds together cannot exceed the charge');
select public.t_err($$insert into public.web_refunds(payment_attempt_id, user_id, reference_order_id, amount_minor, reason, requested_by, due_by)
  select id, user_id, 'hpR3', 100, 'duplicate', 'admin', now() from public.web_payment_attempts where reference_order_id = 'hpP1'$$,
  'WEB_REFUND_REQUIRES_SUCCEEDED_PAYMENT', 'refund of a failed charge rejected');
insert into public.web_payment_attempts(subscription_id, user_id, kind, cycle, attempt_no, reference_order_id, amount_minor,
  status, finished_at, cooling_off_eligible, refund_deadline)
select id, user_id, 'first_purchase', 1, 1, 'hpB3FIRST', 15000, 'succeeded', now(), true, now() + interval '7 days'
from public.web_subscriptions where user_id = '00000000-0000-4000-8000-0000000000b3';
reset role;

-- ── 9. Client read path: my_web_billing() ──────────────────────────────────
select public.t_ok((select r -> 'subscription' ->> 'status' = 'active' and r -> 'subscription' ->> 'plan' = 'monthly'
    and (r -> 'subscription' ->> 'price_minor')::integer = 15000
    and (r -> 'prices' ->> 'monthly')::integer = 15000 and (r -> 'prices' ->> 'annual')::integer = 99000
    and (r ->> 'trial_days')::integer = 14
    and not (r ->> 'checkout_available')::boolean and (r ->> 'trial_eligible')::boolean and not (r ->> 'apple_active')::boolean
    and r -> 'card' = '{"brand":"VISA","last4":"4242"}'::jsonb
    and jsonb_array_length(r -> 'payments') = 2
    and r -> 'open_refund' ->> 'status' = 'requested'
    and not exists (select 1 from jsonb_array_elements(r -> 'payments') e where e -> 'refundable_until' <> 'null'::jsonb)
  from public.t_mwb('00000000-0000-4000-8000-0000000000b1') r),
  'my_web_billing (own data): subscription, prices, card brand+last4, payments, open refund; no refund button once a refund is open');
select public.t_ok((select position('SECRET' in r::text) = 0 and position('hpREF' in r::text) = 0
    and position((select order_ref from public.web_subscriptions where user_id = '00000000-0000-4000-8000-0000000000b1') in r::text) = 0
    and position('example.invalid' in r::text) = 0
    and (select array_agg(k order by k) from jsonb_object_keys(r) k) = array['apple_active','card','checkout_available','open_refund','payments','prices','subscription','trial_days','trial_eligible']
    and (select array_agg(k order by k) from jsonb_object_keys(r -> 'subscription') k) = array['cancel_at_period_end','current_period_end','grace_until','needs_customer_action','plan','price_minor','status','trial_end']
    and not exists (select 1 from jsonb_array_elements(r -> 'payments') e
                     where (select array_agg(k order by k) from jsonb_object_keys(e) k) <> array['amount_minor','date','id','refundable_until','refunded_minor','status'])
  from public.t_mwb('00000000-0000-4000-8000-0000000000b1') r),
  'my_web_billing has a fixed whitelist shape: no SLP ids, order refs, email or failure codes');
select public.t_ok((select r -> 'subscription' = 'null'::jsonb and r -> 'card' = 'null'::jsonb and r -> 'payments' = '[]'::jsonb
    and (r ->> 'apple_active')::boolean from public.t_mwb('00000000-0000-4000-8000-0000000000b2') r),
  'another member sees none of it (Apple-only member: subscription null, apple_active true)');
select public.t_ok((select (r -> 'payments' -> 0 ->> 'refundable_until')::timestamptz > now()
  from public.t_mwb('00000000-0000-4000-8000-0000000000b3') r),
  'cooling-off charge without a refund: refundable_until shown');
update public.web_billing_config set checkout_mode = 'testers';
insert into public.web_billing_testers(user_id) values ('00000000-0000-4000-8000-0000000000b2');
select public.t_ok((public.t_mwb('00000000-0000-4000-8000-0000000000b2') ->> 'checkout_available')::boolean
  and not (public.t_mwb('00000000-0000-4000-8000-0000000000b3') ->> 'checkout_available')::boolean,
  'checkout_mode testers: only listed testers can check out');
update public.web_billing_config set checkout_mode = 'off';
insert into public.web_trial_usage(user_id, source) values ('00000000-0000-4000-8000-0000000000b2', 'apple');
select public.t_ok(not (public.t_mwb('00000000-0000-4000-8000-0000000000b2') ->> 'trial_eligible')::boolean,
  'trial used (any source) -> trial_eligible false');
select public.t_err($$select public.t_mwb('00000000-0000-4000-8000-0000000000be')$$, 'authentication required', 'suspended member cannot read billing');
select public.t_err($$select public.t_mwb('')$$, 'authentication required', 'no session cannot read billing');

-- ── 10. Privileges / RLS (Supabase-style default grants are ON in this cluster)
select public.t_ok((select bool_and(c.relrowsecurity)
  and bool_and(not has_table_privilege(r.rolname, c.oid, 'SELECT') and not has_table_privilege(r.rolname, c.oid, 'INSERT')
           and not has_table_privilege(r.rolname, c.oid, 'UPDATE') and not has_table_privilege(r.rolname, c.oid, 'DELETE'))
  and bool_and(has_table_privilege('service_role', c.oid, 'SELECT') and has_table_privilege('service_role', c.oid, 'INSERT'))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  cross join (values ('anon'), ('authenticated')) r(rolname)
  where c.relname like 'web\_%' and c.relkind = 'r'
  having count(*) = 20),
  'all 10 web_* tables: RLS on, no anon/authenticated privileges at all (despite default grants), service_role writes');
select public.t_ok(not has_function_privilege('authenticated', 'huddle_ops.paid_until(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'huddle_ops.web_paid_until(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.my_web_billing()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.my_web_billing()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'huddle_ops.web_refund_guard()', 'EXECUTE'),
  'functions: only my_web_billing is client-callable (authenticated, not anon)');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b1';
select public.t_err('select count(*) from public.web_subscriptions', 'permission denied', 'member cannot read web_subscriptions directly (even own row)');
select public.t_err('select count(*) from public.web_payment_attempts', 'permission denied', 'member cannot read payment attempts directly');
select public.t_err($$update public.web_subscriptions set access_until = now() + interval '10 years'$$, 'permission denied', 'member cannot extend own access');
select public.t_err($$insert into public.web_trial_usage(user_id, source) values ('00000000-0000-4000-8000-0000000000b1', 'web')$$, 'permission denied', 'member cannot write trial usage');
select public.t_err($$update public.web_billing_config set checkout_mode = 'on'$$, 'permission denied', 'member cannot flip the checkout switch');
select public.t_err($$select huddle_ops.paid_until('00000000-0000-4000-8000-0000000000b2')$$, 'permission denied', 'member cannot probe someone else''s paid_until');
select public.t_ok((public.my_web_billing() -> 'subscription' ->> 'status') = 'active', 'member reads own billing through my_web_billing (as authenticated)');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
select public.t_ok(public.my_web_billing() -> 'subscription' = 'null'::jsonb, 'as authenticated, another member gets null subscription');
select public.t_ok(public.huddle_operations('self') ->> 'paid_until' is not null and public.huddle_operations('self') ? 'web_paid_until',
  'huddle_operations(self) still callable by members, has web_paid_until key');
reset role;
set role anon;
select public.t_err('select public.my_web_billing()', 'permission denied', 'anon cannot call my_web_billing');
reset role;

-- ── 11. Account deletion keeps billing records ─────────────────────────────
delete from auth.users where id in ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2');
select public.t_ok((select count(*) from public.web_subscriptions where order_ref in (select order_ref from public.web_subscriptions where user_id is null)) >= 1
  and (select user_id is null from public.web_payment_attempts where id = '00000000-0000-4000-8000-00000000c0a1')
  and (select user_id is null from public.web_payment_methods where id = '00000000-0000-4000-8000-00000000c0c1')
  and (select count(*) from public.web_refunds where reference_order_id = 'hpR1' and user_id is null) = 1
  and not exists (select 1 from public.web_trial_usage where user_id = '00000000-0000-4000-8000-0000000000b2')
  and not exists (select 1 from public.web_billing_testers where user_id = '00000000-0000-4000-8000-0000000000b2'),
  'deleting an account keeps subscriptions / charges / cards / refunds (user_id set null), drops trial usage + tester row');
update huddle_ops.settings set limits_enforced = false;
\echo 'Web billing database suite finished.'
