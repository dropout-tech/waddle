-- E1: App Review / Test Store sandbox purchases (20261002150000_billing_review_sandbox.sql).
-- DISPOSABLE DATABASE ONLY. Run with: bash scripts/tests/billing-review-sandbox.sh
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create or replace function public.t_ok(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'FAILED: %',msg; end if; raise notice 'PASS: %',msg; end $$;
create or replace function public.t_err(stmt text, fragment text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if position(fragment in sqlerrm)>0 then raise notice 'PASS: %',msg; return; end if;
    raise exception 'FAILED: % (unexpected error: %)',msg,sqlerrm;
  end;
  raise exception 'FAILED: % (no error raised)',msg;
end $$;
grant execute on function public.t_ok(boolean,text), public.t_err(text,text,text) to authenticated, service_role;

\set R '00000000-0000-4000-8000-0000000000b1'
\set P '00000000-0000-4000-8000-0000000000b2'
\set X '00000000-0000-4000-8000-0000000000b3'
insert into auth.users(id,email) values (:'R','reviewer@example.invalid'),(:'P','paid@example.invalid');

-- ── Shape and privileges ──
select public.t_ok((select accept_sandbox_purchases from huddle_ops.settings),'switch exists and defaults to ON');
select public.t_ok(not has_table_privilege('authenticated','public.billing_sandbox_entitlements','SELECT')
  and not has_table_privilege('anon','public.billing_sandbox_entitlements','SELECT'),'clients cannot read the sandbox table');
select public.t_ok(not has_function_privilege('authenticated','public.apply_billing_snapshots(text,jsonb,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.apply_billing_snapshots(text,jsonb,jsonb)','EXECUTE'),'only the webhook (service role) can write snapshots');
select public.t_ok(not has_function_privilege('authenticated','huddle_ops.review_sandbox_until(uuid)','EXECUTE'),'clients cannot call review_sandbox_until directly');
select public.t_ok(not huddle_ops.has_pro(:'R'),'reviewer starts without Pro');

-- ── A sandbox purchase unlocks Pro ──
set role service_role;
select public.apply_billing_snapshots('sbx-1','[]'::jsonb,
  jsonb_build_array(jsonb_build_object('user_id',:'R','expires_at',now()+interval '5 minutes','observed_at_ms',100)));
reset role;
select public.t_ok(huddle_ops.has_pro(:'R'),'sandbox purchase → has_pro');
select public.t_ok(not exists(select 1 from public.billing_entitlements where user_id=:'R'),'sandbox purchase never lands in billing_entitlements');
select public.t_ok((select count(*)=0 from huddle_ops.grants where user_id=:'R'),'sandbox purchase creates no grant / gift');
set role authenticated;
set request.jwt.claim.sub = :'R';
select public.huddle_operations('self') as me \gset
reset role;
select public.t_ok((:'me'::jsonb->>'paid_until')::timestamptz > now(),'membership self.paid_until shows the sandbox purchase (purchase card stops "syncing")');
select public.t_ok((:'me'::jsonb->>'pro_until')::timestamptz > now(),'membership self.pro_until shows it too');

-- ── Never longer than 24 hours, even if the payload says otherwise ──
set role service_role;
select public.apply_billing_snapshots('sbx-2','[]'::jsonb,
  jsonb_build_array(jsonb_build_object('user_id',:'R','expires_at','2030-01-01T00:00:00Z','observed_at_ms',200)));
reset role;
select public.t_ok((select expires_at <= now()+interval '24 hours' from public.billing_sandbox_entitlements where user_id=:'R'),'stored expiry capped at 24 hours');

-- ── Dedupe and stale snapshots ──
set role service_role;
select public.apply_billing_snapshots('sbx-2','[]'::jsonb,
  jsonb_build_array(jsonb_build_object('user_id',:'R','expires_at',null,'observed_at_ms',900)));
select public.apply_billing_snapshots('sbx-old','[]'::jsonb,
  jsonb_build_array(jsonb_build_object('user_id',:'R','expires_at',null,'observed_at_ms',150)));
reset role;
select public.t_ok(huddle_ops.has_pro(:'R') and (select observed_at_ms=200 from public.billing_sandbox_entitlements where user_id=:'R'),
  'a repeated event id or an older snapshot changes nothing');

-- ── Emergency switch ──
update huddle_ops.settings set accept_sandbox_purchases=false;
select public.t_ok(not huddle_ops.has_pro(:'R'),'switch OFF → sandbox Pro stops immediately');
set role authenticated;
set request.jwt.claim.sub = :'R';
select public.huddle_operations('self') as off \gset
reset role;
select public.t_ok((:'off'::jsonb->>'paid_until') is null,'switch OFF → membership shows no paid period');
update huddle_ops.settings set accept_sandbox_purchases=true;
select public.t_ok(huddle_ops.has_pro(:'R'),'switch back ON → restored');

-- ── Expiry / revocation ──
set role service_role;
select public.apply_billing_snapshots('sbx-3','[]'::jsonb,
  jsonb_build_array(jsonb_build_object('user_id',:'R','expires_at',null,'observed_at_ms',300)));
reset role;
select public.t_ok(not huddle_ops.has_pro(:'R'),'sandbox expiry / refund (null) removes Pro');

-- ── Real purchases through the new RPC are unchanged, and sandbox cannot touch them ──
set role service_role;
select public.apply_billing_snapshots('prod-1',
  jsonb_build_array(jsonb_build_object('user_id',:'P','expires_at',now()+interval '30 days','observed_at_ms',100)),
  jsonb_build_array(jsonb_build_object('user_id',:'P','expires_at',null,'observed_at_ms',100)));
reset role;
select public.t_ok(huddle_ops.has_pro(:'P') and (select expires_at > now()+interval '29 days' from public.billing_entitlements where user_id=:'P'),
  'production snapshot still written; a null sandbox row next to it does not remove real Pro');
select public.t_ok(huddle_ops.pro_until(:'P') > now()+interval '29 days' and huddle_ops.pro_until(:'R') <= now()+interval '1 minute',
  'gift base pro_until() ignores sandbox rows');

-- ── Deleted / unknown accounts are skipped, not fatal ──
set role service_role;
select public.apply_billing_snapshots('sbx-ghost','[]'::jsonb,
  jsonb_build_array(jsonb_build_object('user_id',:'X','expires_at',now()+interval '5 minutes','observed_at_ms',100)));
reset role;
select public.t_ok(not exists(select 1 from public.billing_sandbox_entitlements where user_id=:'X'),'unknown account is skipped');
delete from auth.users where id=:'R';
select public.t_ok(not exists(select 1 from public.billing_sandbox_entitlements where user_id=:'R'),'deleting the account deletes its sandbox row');
