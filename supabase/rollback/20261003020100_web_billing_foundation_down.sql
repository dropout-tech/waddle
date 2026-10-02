-- DOWN for 20261003020100_web_billing_foundation.sql. Run as ONE transaction
-- (psql -1 -f this_file) and only after the owner agreed (design §7 回滾).
--
-- Restores has_pro / pro_until / give_days / defer_gifts / dispatch to their
-- exact previous definitions (scripts/tests/web-billing-database.sh checks
-- that pg_get_functiondef md5 equals the pre-migration value) and removes the
-- new functions and triggers. The web_* TABLES AND THEIR ROWS ARE KEPT on
-- purpose: they are billing records. After this, website subscribers are NOT
-- Pro any more (has_pro is Apple + gifts again, + App Review sandbox when
-- 20261002150000 is present: that world is detected and restored exactly) — if any exist, decide with
-- the owner first. Re-applying the up migration afterwards works (tables use
-- "if not exists").

set lock_timeout = '5s';
set statement_timeout = '60s';

-- dispatch: reverse the seven fragment replacements (each must appear once).
do $$
declare
  v_def text := pg_get_functiondef('huddle_ops.dispatch(text,jsonb)'::regprocedure);
  v_old text[] := array[
    $f$'pro_until',greatest((select max(expires_at) from huddle_ops.grants where user_id=u and revoked_at is null),huddle_ops.paid_until(u)),
      'web_paid_until',huddle_ops.web_paid_until(u),$f$,
    $f$cursor_at:=greatest(now(),huddle_ops.paid_until(target));$f$,
    $f$count(*) filter(where huddle_ops.paid_until(cohort.id)>now()) as paid$f$,
    $f$'paid',(select count(*) from (select b.user_id from public.billing_entitlements b where b.expires_at>now() union select w.user_id from public.web_subscriptions w where w.user_id is not null and w.access_until>now()) paid_members),$f$,
    $f$and not coalesce(huddle_ops.paid_until(g.user_id)>now(),false)),$f$,
    $f$(select count(distinct g.user_id) from huddle_ops.grants g where g.source='trial' and g.revoked_at is null and g.expires_at<=now() and huddle_ops.paid_until(g.user_id)>now()),$f$,
    $f$(select expires_at from public.billing_entitlements where user_id=au.id) as paid_until,
        huddle_ops.web_paid_until(au.id) as web_paid_until,$f$];
  v_new text[] := array[
    $f$'pro_until',greatest((select max(expires_at) from huddle_ops.grants where user_id=u and revoked_at is null),(select expires_at from public.billing_entitlements where user_id=u and entitlement='pro')),$f$,
    $f$cursor_at:=greatest(now(),(select expires_at from public.billing_entitlements where user_id=target));$f$,
    $f$count(*) filter(where exists(select 1 from public.billing_entitlements b where b.user_id=cohort.id and b.expires_at>now())) as paid$f$,
    $f$'paid',(select count(*) from public.billing_entitlements where expires_at>now()),$f$,
    $f$and not exists(select 1 from public.billing_entitlements b where b.user_id=g.user_id and b.expires_at>now())),$f$,
    $f$(select count(distinct g.user_id) from huddle_ops.grants g join public.billing_entitlements b using(user_id) where g.source='trial' and g.revoked_at is null and g.expires_at<=now() and b.expires_at>now()),$f$,
    $f$(select expires_at from public.billing_entitlements where user_id=au.id) as paid_until,$f$];
  v_hits integer;
begin
  if to_regprocedure('huddle_ops.review_sandbox_until(uuid)') is not null then
    -- World B (#150 applied before the up migration): back to #150's keys.
    v_old[1] := $f$'pro_until',greatest((select max(expires_at) from huddle_ops.grants where user_id=u and revoked_at is null),huddle_ops.paid_until(u),huddle_ops.review_sandbox_until(u)),
      'web_paid_until',huddle_ops.web_paid_until(u),$f$;
    v_new[1] := $f$'pro_until',greatest((select max(expires_at) from huddle_ops.grants where user_id=u and revoked_at is null),(select expires_at from public.billing_entitlements where user_id=u and entitlement='pro'),huddle_ops.review_sandbox_until(u)),$f$;
  end if;
  for i in 1 .. array_length(v_old, 1) loop
    v_hits := (length(v_def) - length(replace(v_def, v_old[i], ''))) / length(v_old[i]);
    if v_hits <> 1 then
      raise exception 'dispatch fragment % found % times (expected 1); rollback aborted', i, v_hits;
    end if;
    v_def := replace(v_def, v_old[i], v_new[i]);
  end loop;
  if position('paid_until(' in v_def) > 0 then
    raise exception 'dispatch still calls paid_until after rollback; aborted';
  end if;
  execute v_def;
end $$;

-- The four small functions, verbatim from their previous migrations.
-- 20260927120000_task_assignments_orgs.sql
create or replace function huddle_ops.has_pro(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.billing_entitlements b
                where b.user_id = p_user and b.entitlement = 'pro' and b.expires_at > now())
      or exists(select 1 from huddle_ops.grants g
                where g.user_id = p_user and g.revoked_at is null and g.expires_at > now())
$$;
-- World B: #150's has_pro (20261002150000), verbatim.
do $do$
begin
  if to_regprocedure('huddle_ops.review_sandbox_until(uuid)') is not null then
    execute $sql$create or replace function huddle_ops.has_pro(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.billing_entitlements b
                where b.user_id = p_user and b.entitlement = 'pro' and b.expires_at > now())
      or exists(select 1 from huddle_ops.grants g
                where g.user_id = p_user and g.revoked_at is null and g.expires_at > now())
      or huddle_ops.review_sandbox_until(p_user) is not null
$$;$sql$;
  end if;
end $do$;

-- 20261001200000_pro_limits.sql
create or replace function huddle_ops.pro_until(p_user uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(now(),
    (select max(g.expires_at) from huddle_ops.grants g where g.user_id = p_user and g.revoked_at is null),
    (select b.expires_at from public.billing_entitlements b where b.user_id = p_user and b.entitlement = 'pro'))
$$;

-- 20260925075939_operations_referrals.sql
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
    (select expires_at from public.billing_entitlements where user_id=u and entitlement='pro')) into base;
  insert into huddle_ops.grants(user_id,days,source,source_key,starts_at,expires_at,reason)
    values(u,d,src,k,base,base+make_interval(days=>d),why) returning id into g;
  return g;
end $$;

-- 20260925075939_operations_referrals.sql
create or replace function huddle_ops.defer_gifts() returns trigger language plpgsql security definer set search_path='' as $$
declare g record; cursor_at timestamptz; remaining interval;
begin
  perform 1 from huddle_ops.members where user_id=new.user_id for update;
  cursor_at:=greatest(now(),new.expires_at);
  for g in select * from huddle_ops.grants where user_id=new.user_id and revoked_at is null and expires_at>now() order by starts_at,id for update loop
    remaining:=g.expires_at-greatest(g.starts_at,now());
    update huddle_ops.grants set starts_at=cursor_at,expires_at=cursor_at+remaining where id=g.id;
    cursor_at:=cursor_at+remaining;
  end loop;
  return new;
end $$;

drop trigger if exists operations_defer_gifts_web on public.web_subscriptions;
drop trigger if exists web_subscription_guard on public.web_subscriptions;
drop trigger if exists web_payment_attempt_guard on public.web_payment_attempts;
drop trigger if exists web_refund_guard on public.web_refunds;
drop function if exists public.my_web_billing();
drop function if exists huddle_ops.paid_until(uuid);
drop function if exists huddle_ops.web_paid_until(uuid);
drop function if exists huddle_ops.web_subscription_guard();
drop function if exists huddle_ops.web_payment_attempt_guard();
drop function if exists huddle_ops.web_refund_guard();

reset statement_timeout;
reset lock_timeout;
