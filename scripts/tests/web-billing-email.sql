-- Web billing module C: reminder enqueueing, outbox claim / finish, privileges,
-- rollback round trip. Run by scripts/tests/web-billing-email.sh after every
-- migration is applied. Disposable local cluster only.
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

-- Walks a subscription through the real transitions (guard trigger + access rule apply).
create or replace function public.t_sub(p_user uuid, p_plan text, p_state text, p_end timestamptz,
                                        p_canceled boolean default false, p_card text default '4242')
returns uuid language plpgsql as $$
declare
  v_id uuid := gen_random_uuid(); v_pm uuid;
  v_buf interval := case when p_canceled then interval '0' else interval '24 hours' end;
  v_unit interval := case p_plan when 'annual' then interval '1 year' else interval '1 month' end;
begin
  if p_card is not null then
    v_pm := gen_random_uuid();
    insert into public.web_payment_methods(id, user_id, slp_customer_id, slp_instrument_id, brand, last4)
    values (v_pm, p_user, 'cus-' || v_id, 'ins-' || v_id, 'VISA', p_card);
  end if;
  insert into public.web_subscriptions(id, order_ref, user_id, plan, price_minor, with_trial, payment_method_id)
  values (v_id, substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), p_user, p_plan,
          case p_plan when 'annual' then 99000 else 15000 end, p_state = 'trialing', v_pm);
  if p_state = 'incomplete' then return v_id; end if;
  if p_state = 'trialing' then
    update public.web_subscriptions set status = 'trialing', trial_start = p_end - interval '14 days', trial_end = p_end,
      anchor_at = p_end, current_period_end = p_end, cancel_at_period_end = p_canceled,
      canceled_at = case when p_canceled then p_end - interval '10 days' end, access_until = p_end + v_buf where id = v_id;
    return v_id;
  end if;
  update public.web_subscriptions set status = 'active', cycle = 1, anchor_at = p_end - v_unit,
    current_period_start = p_end - v_unit, current_period_end = p_end, cancel_at_period_end = p_canceled,
    canceled_at = case when p_canceled then p_end - interval '10 days' end, access_until = p_end + v_buf where id = v_id;
  if p_state = 'past_due' then
    update public.web_subscriptions set status = 'past_due', grace_until = p_end, access_until = p_end,
      retry_count = 1, next_retry_at = p_end where id = v_id;
  end if;
  return v_id;
end $$;

\set base '''2026-10-10 12:00:00+00'''
create or replace function public.t_u(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || p)::uuid $$;
grant execute on function public.t_u(text) to anon, authenticated, service_role;

insert into auth.users(id, email) values
 (public.t_u('c1'), 'trial-in@example.invalid'),   (public.t_u('c2'), 'trial-out@example.invalid'),
 (public.t_u('c3'), 'trial-canceled@example.invalid'), (public.t_u('c4'), 'trial-hold@example.invalid'),
 (public.t_u('c5'), 'trial-over@example.invalid'), (public.t_u('c6'), 'incomplete@example.invalid'),
 (public.t_u('c7'), null),                          (public.t_u('c8'), 'trial-edge@example.invalid'),
 (public.t_u('d1'), 'annual-in@example.invalid'),  (public.t_u('d2'), 'annual-early@example.invalid'),
 (public.t_u('d3'), 'annual-late@example.invalid'), (public.t_u('d4'), 'monthly-in@example.invalid'),
 (public.t_u('d5'), 'annual-canceled@example.invalid'), (public.t_u('d6'), 'annual-pastdue@example.invalid'),
 (public.t_u('d7'), 'annual-edge@example.invalid'), (public.t_u('d8'), '');

-- trial_ending candidates
select public.t_sub(public.t_u('c1'), 'monthly', 'trialing', :base::timestamptz + interval '36 hours');
select public.t_sub(public.t_u('c2'), 'monthly', 'trialing', :base::timestamptz + interval '49 hours');
select public.t_sub(public.t_u('c3'), 'monthly', 'trialing', :base::timestamptz + interval '20 hours', true);
select public.t_sub(public.t_u('c5'), 'monthly', 'trialing', :base::timestamptz - interval '1 hour');
select public.t_sub(public.t_u('c6'), 'monthly', 'incomplete', null);
select public.t_sub(public.t_u('c7'), 'monthly', 'trialing', :base::timestamptz + interval '10 hours');
select public.t_sub(public.t_u('c8'), 'annual',  'trialing', :base::timestamptz + interval '48 hours', false, null);
create temp table t_ids as select public.t_sub(public.t_u('c4'), 'monthly', 'trialing', :base::timestamptz + interval '20 hours') as id;
update public.web_subscriptions set billing_hold = true where id = (select id from t_ids);
-- renewal_reminder candidates
select public.t_sub(public.t_u('d1'), 'annual',  'active', :base::timestamptz + interval '7 days 12 hours');
select public.t_sub(public.t_u('d2'), 'annual',  'active', :base::timestamptz + interval '6 days 12 hours');
select public.t_sub(public.t_u('d3'), 'annual',  'active', :base::timestamptz + interval '8 days 12 hours');
select public.t_sub(public.t_u('d4'), 'monthly', 'active', :base::timestamptz + interval '7 days 12 hours');
select public.t_sub(public.t_u('d5'), 'annual',  'active', :base::timestamptz + interval '7 days 12 hours', true);
select public.t_sub(public.t_u('d6'), 'annual',  'past_due', :base::timestamptz + interval '7 days 12 hours');
select public.t_sub(public.t_u('d7'), 'annual',  'active', :base::timestamptz + interval '8 days');
select public.t_sub(public.t_u('d8'), 'annual',  'active', :base::timestamptz + interval '7 days 12 hours');

set role service_role;

-- ── 1. Enqueueing ──────────────────────────────────────────────────────────
create temp table t_first as select huddle_ops.web_enqueue_reminders(:base::timestamptz) as n;
select public.t_ok((select n from t_first) = 4, 'first run enqueues 4 mails (trial in 36h, trial at exactly 48h, annual at 7.5 days, annual at exactly 8 days)');
reset role;
select public.t_ok((select count(*) from public.web_email_outbox where kind = 'trial_ending') = 2
  and exists (select 1 from public.web_email_outbox o join public.web_subscriptions s on o.dedupe_key = 'trial_ending:' || s.id where s.user_id = public.t_u('c1'))
  and exists (select 1 from public.web_email_outbox o join public.web_subscriptions s on o.dedupe_key = 'trial_ending:' || s.id where s.user_id = public.t_u('c8')),
  'trial_ending: trial ending within 2 days is queued (incl. the exact 48h edge)');
select public.t_ok(not exists (select 1 from public.web_email_outbox o
    where o.user_id in (public.t_u('c2'), public.t_u('c3'), public.t_u('c4'), public.t_u('c5'), public.t_u('c6'), public.t_u('c7'))),
  'trial_ending: trial 49h away, canceled, on billing hold, already ended, incomplete, or user without email are NOT queued');
select public.t_ok((select count(*) from public.web_email_outbox where kind = 'renewal_reminder') = 2
  and exists (select 1 from public.web_email_outbox where user_id = public.t_u('d1') and kind = 'renewal_reminder')
  and exists (select 1 from public.web_email_outbox where user_id = public.t_u('d7') and kind = 'renewal_reminder'),
  'renewal_reminder: annual active 7-8 days before renewal is queued');
select public.t_ok(not exists (select 1 from public.web_email_outbox where user_id in (public.t_u('d2'), public.t_u('d3'), public.t_u('d4'), public.t_u('d5'), public.t_u('d6'), public.t_u('d8'))),
  'renewal_reminder: 6.5 days, 8.5 days, monthly plan, canceled, past_due, and blank email are NOT queued');
select public.t_ok((select o.payload = jsonb_build_object('plan', 'monthly', 'amount_minor', 15000, 'trial_end', '2026-10-12T00:00:00Z',
      'first_charge_at', '2026-10-12T00:00:00Z', 'card_last4', '4242')
    and o.to_email = 'trial-in@example.invalid' and o.status = 'queued' and o.attempts = 0 and o.claimed_at is null and o.kind = 'trial_ending'
    and o.dedupe_key = 'trial_ending:' || s.id
  from public.web_email_outbox o join public.web_subscriptions s on s.user_id = o.user_id where o.user_id = public.t_u('c1')),
  'trial_ending row: payload keys per contract (UTC ISO, minor units, last4), email snapshot, queued');
select public.t_ok((select o.payload = jsonb_build_object('plan', 'annual', 'amount_minor', 99000, 'renews_at', '2026-10-18T00:00:00Z', 'card_last4', '4242')
    and o.to_email = 'annual-in@example.invalid' and o.dedupe_key = 'renewal:' || s.id || ':1'
  from public.web_email_outbox o join public.web_subscriptions s on s.user_id = o.user_id
  where o.user_id = public.t_u('d1') and o.kind = 'renewal_reminder'),
  'renewal_reminder row: payload keys per contract, dedupe key = subscription + cycle');
select public.t_ok((select o.payload -> 'card_last4' = 'null'::jsonb from public.web_email_outbox o where o.user_id = public.t_u('c8')),
  'a subscription without a stored card still gets its reminder (card_last4 null)');

set role service_role;
select public.t_ok(huddle_ops.web_enqueue_reminders(:base::timestamptz) = 0, 'same moment again: dedupe, nothing new');
select public.t_ok(huddle_ops.web_enqueue_reminders(:base::timestamptz + interval '30 minutes') = 0, '30 minutes later (still inside the window): dedupe, nothing new');
reset role;
select public.t_ok((select count(*) from public.web_email_outbox) = 4, 'outbox still has exactly 4 rows after reruns');

-- the renewal went through: next cycle, a year later, must mail again (same cycle must not).
update public.web_subscriptions set cycle = 2, current_period_start = current_period_end,
  current_period_end = current_period_end + interval '1 year', access_until = current_period_end + interval '1 year' + interval '24 hours'
  where user_id = public.t_u('d1');
set role service_role;
select public.t_ok(huddle_ops.web_enqueue_reminders(:base::timestamptz + interval '1 year') = 1, 'a year later (next cycle, 7.5 days out): exactly the new renewal is queued');
reset role;
select public.t_ok((select count(*) from public.web_email_outbox where user_id = public.t_u('d1') and kind = 'renewal_reminder') = 2
  and exists (select 1 from public.web_email_outbox o join public.web_subscriptions s on s.user_id = o.user_id
              where o.user_id = public.t_u('d1') and o.dedupe_key = 'renewal:' || s.id || ':2'),
  'cycle 2 gets its own mail (dedupe key renewal:<sub>:2); cycle 1 mail was kept');
set role service_role;
select public.t_ok(pg_typeof(huddle_ops.web_enqueue_reminders())::text = 'integer', 'default p_now works and returns integer');
reset role;
-- email changes after enqueue do not rewrite the snapshot
update auth.users set email = 'changed@example.invalid' where id = public.t_u('c1');
select public.t_ok((select to_email from public.web_email_outbox where user_id = public.t_u('c1')) = 'trial-in@example.invalid',
  'to_email is the snapshot taken at enqueue time');

-- ── 2. Claim / finish ──────────────────────────────────────────────────────
truncate public.web_email_outbox;
insert into public.web_email_outbox(id, kind, dedupe_key, to_email, payload, created_at)
select ('00000000-0000-4000-8000-00000000e00' || i)::uuid, 'receipt', 'q' || i, 'q' || i || '@example.invalid', '{}'::jsonb, now() - (10 - i) * interval '1 minute'
from generate_series(1, 5) i;
insert into public.web_email_outbox(kind, dedupe_key, to_email, status) values
 ('receipt', 's-sent', 'x@example.invalid', 'sent'), ('receipt', 's-skipped', 'x@example.invalid', 'skipped'), ('receipt', 's-failed', 'x@example.invalid', 'failed');

set role service_role;
create temp table c1 as select * from huddle_ops.web_claim_outbox(2);
create temp table c2 as select * from huddle_ops.web_claim_outbox(2);
reset role;
select public.t_ok((select array_agg(dedupe_key order by created_at) from c1) = array['q1', 'q2'], 'claim(2) returns the two oldest queued rows');
select public.t_ok((select bool_and(attempts = 1 and status = 'queued' and claimed_at is not null) from c1), 'claimed rows come back with attempts + 1 and a claim stamp');
select public.t_ok((select array_agg(dedupe_key order by created_at) from c2) = array['q3', 'q4'], 'second claim never returns rows the first claim took');
set role service_role;
select public.t_ok((select count(*) from huddle_ops.web_claim_outbox(10)) = 1, 'claim(10) takes the one remaining queued row; sent / skipped / failed rows are never claimed');
select public.t_ok((select count(*) from huddle_ops.web_claim_outbox(10)) = 0, 'nothing left to claim');
select public.t_ok((select count(*) from huddle_ops.web_claim_outbox(0)) = 0 and (select count(*) from huddle_ops.web_claim_outbox(-3)) = 0
  and (select count(*) from huddle_ops.web_claim_outbox(null)) = 0, 'limit 0 / negative / null claims nothing');
reset role;
select public.t_ok((select count(*) from public.web_email_outbox where attempts = 1) = 5, 'every row was claimed exactly once');

-- finish: sent / skipped / failed-and-requeued
set role service_role;
select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000e001', true, 'em_abc');
select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000e001', true, 'em_other');
select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000e002', false, null, true);
select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000e003', false);
select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000e004', true, 'em_skipwins', true);
select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000ffff', true, 'nobody');
reset role;
select public.t_ok((select status = 'sent' and sent_at is not null and provider_id = 'em_abc' and claimed_at is null
  from public.web_email_outbox where id = '00000000-0000-4000-8000-00000000e001'),
  'finish(ok): sent + sent_at + provider id; a second finish on the same row changes nothing');
select public.t_ok((select status = 'skipped' and sent_at is null from public.web_email_outbox where id = '00000000-0000-4000-8000-00000000e002'),
  'finish(skip): skipped, no sent_at');
select public.t_ok((select status = 'queued' and attempts = 1 and claimed_at is null and sent_at is null from public.web_email_outbox where id = '00000000-0000-4000-8000-00000000e003'),
  'finish(fail) with attempts < 5: back to queued and claimable at once');
select public.t_ok((select status = 'skipped' and sent_at is null from public.web_email_outbox where id = '00000000-0000-4000-8000-00000000e004'),
  'skip wins over ok (an explicit do-not-send is never recorded as sent)');
set role service_role;
select public.t_ok((select array_agg(id) from huddle_ops.web_claim_outbox(10)) = array['00000000-0000-4000-8000-00000000e003'::uuid],
  'only the re-queued row is claimable again (attempts now 2)');
-- attempts climb to 5 -> failed
select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000e003', false);
select count(*) from huddle_ops.web_claim_outbox(10);   -- attempts 3
select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000e003', false);
select count(*) from huddle_ops.web_claim_outbox(10);   -- attempts 4
select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000e003', false);
select public.t_ok((select attempts = 4 and status = 'queued' from public.web_email_outbox where id = '00000000-0000-4000-8000-00000000e003'), 'after 4 failed attempts the row is still queued');
select count(*) from huddle_ops.web_claim_outbox(10);   -- attempts 5
select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000e003', false);
reset role;
select public.t_ok((select attempts = 5 and status = 'failed' and sent_at is null from public.web_email_outbox where id = '00000000-0000-4000-8000-00000000e003'),
  'the 5th failed attempt marks the row failed (abnormal list)');
set role service_role;
select public.t_ok((select count(*) from huddle_ops.web_claim_outbox(10)) = 0, 'a failed row is not claimed again');
select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000e003', true, 'late');
reset role;
select public.t_ok((select status = 'failed' and provider_id is null from public.web_email_outbox where id = '00000000-0000-4000-8000-00000000e003'),
  'finishing a row that is no longer queued is a no-op');

-- visibility timeout
truncate public.web_email_outbox;
insert into public.web_email_outbox(id, kind, dedupe_key, to_email, attempts, claimed_at) values
 ('00000000-0000-4000-8000-00000000f001', 'receipt', 'v1', 'v1@example.invalid', 1, now() - interval '5 minutes'),
 ('00000000-0000-4000-8000-00000000f002', 'receipt', 'v2', 'v2@example.invalid', 1, now() - interval '20 minutes'),
 ('00000000-0000-4000-8000-00000000f003', 'receipt', 'v3', 'v3@example.invalid', 5, now() - interval '20 minutes'),
 ('00000000-0000-4000-8000-00000000f004', 'receipt', 'v4', 'v4@example.invalid', 5, now() - interval '5 minutes');
set role service_role;
select public.t_ok((select array_agg(id) from huddle_ops.web_claim_outbox(10)) = array['00000000-0000-4000-8000-00000000f002'::uuid],
  'a row claimed 5 minutes ago is left alone; one whose worker died 20 minutes ago is claimable again');
reset role;
select public.t_ok((select attempts = 2 from public.web_email_outbox where id = '00000000-0000-4000-8000-00000000f002')
  and (select status = 'failed' from public.web_email_outbox where id = '00000000-0000-4000-8000-00000000f003')
  and (select status = 'queued' from public.web_email_outbox where id = '00000000-0000-4000-8000-00000000f004'),
  'a stale row that already used 5 attempts is closed as failed, not retried forever; a fresh one is untouched');

-- ── 3. Privileges / hardening ──────────────────────────────────────────────
select public.t_ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
    where pronamespace = 'huddle_ops'::regnamespace and proname in ('web_enqueue_reminders', 'web_claim_outbox', 'web_finish_outbox')),
  'all three functions are SECURITY DEFINER with an empty search_path');
select public.t_ok(
  not has_function_privilege('anon', 'huddle_ops.web_enqueue_reminders(timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'huddle_ops.web_enqueue_reminders(timestamptz)', 'execute')
  and not has_function_privilege('anon', 'huddle_ops.web_claim_outbox(integer)', 'execute')
  and not has_function_privilege('authenticated', 'huddle_ops.web_claim_outbox(integer)', 'execute')
  and not has_function_privilege('anon', 'huddle_ops.web_finish_outbox(uuid,boolean,text,boolean)', 'execute')
  and not has_function_privilege('authenticated', 'huddle_ops.web_finish_outbox(uuid,boolean,text,boolean)', 'execute')
  and has_function_privilege('service_role', 'huddle_ops.web_enqueue_reminders(timestamptz)', 'execute')
  and has_function_privilege('service_role', 'huddle_ops.web_claim_outbox(integer)', 'execute')
  and has_function_privilege('service_role', 'huddle_ops.web_finish_outbox(uuid,boolean,text,boolean)', 'execute'),
  'privilege catalog: service_role may execute all three, anon / authenticated none');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
select public.t_err('select huddle_ops.web_enqueue_reminders()', 'permission denied', 'authenticated cannot enqueue reminders');
select public.t_err('select * from huddle_ops.web_claim_outbox(5)', 'permission denied', 'authenticated cannot claim the outbox');
select public.t_err($$select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000f002', true)$$, 'permission denied', 'authenticated cannot finish outbox rows');
select public.t_err('select count(*) from public.web_email_outbox', 'permission denied', 'authenticated cannot read the outbox table');
reset role;
set role anon;
select public.t_err('select huddle_ops.web_enqueue_reminders()', 'permission denied', 'anon cannot enqueue reminders');
select public.t_err('select * from huddle_ops.web_claim_outbox(5)', 'permission denied', 'anon cannot claim the outbox');
select public.t_err($$select huddle_ops.web_finish_outbox('00000000-0000-4000-8000-00000000f002', true)$$, 'permission denied', 'anon cannot finish outbox rows');
reset role;

-- ── 4. Rollback round trip ─────────────────────────────────────────────────
select md5(string_agg(pg_get_functiondef(p.oid), '' order by p.proname)) as defs_before
  from pg_proc p where pronamespace = 'huddle_ops'::regnamespace and proname in ('web_enqueue_reminders', 'web_claim_outbox', 'web_finish_outbox') \gset
\ir ../../supabase/rollback/20261002230200_web_billing_email_down.sql
select public.t_ok(to_regprocedure('huddle_ops.web_enqueue_reminders(timestamptz)') is null
  and to_regprocedure('huddle_ops.web_claim_outbox(integer)') is null
  and to_regprocedure('huddle_ops.web_finish_outbox(uuid,boolean,text,boolean)') is null
  and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'web_email_outbox' and column_name = 'claimed_at'),
  'down drops the three functions and claimed_at');
select public.t_ok((select count(*) from public.web_email_outbox) = 4 and to_regclass('public.web_subscriptions') is not null
  and (select count(*) from public.web_subscriptions) > 0, 'down keeps the outbox rows and the foundation tables');
\ir ../../supabase/migrations/20261002230200_web_billing_email.sql
select md5(string_agg(pg_get_functiondef(p.oid), '' order by p.proname)) as defs_after
  from pg_proc p where pronamespace = 'huddle_ops'::regnamespace and proname in ('web_enqueue_reminders', 'web_claim_outbox', 'web_finish_outbox') \gset
select public.t_ok(:'defs_before' = :'defs_after', 're-applying up gives byte-identical function definitions');
select public.t_ok(has_function_privilege('service_role', 'huddle_ops.web_claim_outbox(integer)', 'execute')
  and not has_function_privilege('anon', 'huddle_ops.web_claim_outbox(integer)', 'execute')
  and not has_function_privilege('authenticated', 'huddle_ops.web_enqueue_reminders(timestamptz)', 'execute'),
  'after down -> up the privileges are the same');
set role service_role;
select public.t_ok((select count(*) from huddle_ops.web_claim_outbox(10)) = 2, 'after down -> up the queue works again (the two claimable rows come back)');
reset role;
truncate public.web_email_outbox;
\echo 'Web billing email database suite finished.'
