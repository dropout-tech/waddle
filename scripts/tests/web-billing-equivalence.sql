-- Web billing P1: with the web_* tables EMPTY, every existing reader must give
-- byte-identical answers before and after 20261002230100_web_billing_foundation.
-- Before and after run in ONE transaction, so now() is the same instant and
-- even now()-based values (pro_until, give_days base) compare exactly.
-- Run by scripts/tests/web-billing-database.sh on a database migrated up to,
-- but not including, that migration. Disposable local cluster only.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function public.t_ok(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'FAILED: %', msg; end if; raise notice 'PASS: %', msg; end $$;

-- ── Fixture members covering every Pro source combination ──────────────────
insert into auth.users(id, email) values
 ('00000000-0000-4000-8000-0000000000a1','free@example.invalid'),
 ('00000000-0000-4000-8000-0000000000a2','apple-active@example.invalid'),
 ('00000000-0000-4000-8000-0000000000a3','apple-expired@example.invalid'),
 ('00000000-0000-4000-8000-0000000000a4','gift-only@example.invalid'),
 ('00000000-0000-4000-8000-0000000000a5','apple-and-gift@example.invalid'),
 ('00000000-0000-4000-8000-0000000000a6','apple-revoked@example.invalid'),
 ('00000000-0000-4000-8000-0000000000a7','admin@example.invalid'),
 ('00000000-0000-4000-8000-0000000000a8','suspended@example.invalid'),
 ('00000000-0000-4000-8000-0000000000a9','converted-trial@example.invalid'),
 ('00000000-0000-4000-8000-0000000000aa','unverified@example.invalid');
update auth.users set email_confirmed_at = null where id = '00000000-0000-4000-8000-0000000000aa';
insert into huddle_ops.admin_users(user_id) values ('00000000-0000-4000-8000-0000000000a7');
update huddle_ops.settings set trial_enabled = true, gifts_enabled = true;
insert into huddle_ops.members(user_id, alias, suspended)
  select id, 'm ' || right(id::text, 2), id = '00000000-0000-4000-8000-0000000000a8' from auth.users;

select public.apply_billing_snapshot('fx-1', jsonb_build_array(
  jsonb_build_object('user_id','00000000-0000-4000-8000-0000000000a2','expires_at',now() + interval '30 days','observed_at_ms',1),
  jsonb_build_object('user_id','00000000-0000-4000-8000-0000000000a3','expires_at',now() - interval '5 days','observed_at_ms',1),
  jsonb_build_object('user_id','00000000-0000-4000-8000-0000000000a5','expires_at',now() + interval '20 days','observed_at_ms',1),
  jsonb_build_object('user_id','00000000-0000-4000-8000-0000000000a6','expires_at',null,'observed_at_ms',1),
  jsonb_build_object('user_id','00000000-0000-4000-8000-0000000000a9','expires_at',now() + interval '9 days','observed_at_ms',1)));
select huddle_ops.give_days('00000000-0000-4000-8000-0000000000a4', 10, 'manual', 'fx:a4', 'fixture');
select huddle_ops.give_days('00000000-0000-4000-8000-0000000000a5', 7, 'manual', 'fx:a5a', 'fixture');
select huddle_ops.give_days('00000000-0000-4000-8000-0000000000a5', 3, 'coupon', 'fx:a5b', 'fixture');
select huddle_ops.give_days('00000000-0000-4000-8000-0000000000a7', 5, 'manual', 'fx:a7', 'fixture');
insert into huddle_ops.grants(user_id, days, source, source_key, starts_at, expires_at, reason) values
 ('00000000-0000-4000-8000-0000000000a9', 14, 'trial', 'trial:a9', now() - interval '20 days', now() - interval '6 days', 'fixture');

-- First 'self' has side effects (member row, signup trial): warm up first.
do $$ declare u record; begin
  for u in select id from auth.users order by id loop
    perform set_config('request.jwt.claim.sub', u.id::text, false);
    begin perform huddle_ops.dispatch('self'); exception when others then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- ── Snapshot helpers ───────────────────────────────────────────────────────
create table public.t_snap(phase text, uid uuid, item text, val jsonb, primary key (phase, uid, item));
create table public.t_defs(phase text, sig text, md5 text, primary key (phase, sig));

create or replace function public.t_val(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin execute p_sql into r; return coalesce(r, 'null'::jsonb);
exception when others then return jsonb_build_object('error', sqlerrm);
end $$;

-- Run p_action, read p_read, then roll the action back (savepoint semantics).
create or replace function public.t_sim(p_action text, p_read text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  begin
    execute p_action;
    execute p_read into r;
    raise exception using errcode = 'ZT001', message = 'rollback simulation';
  exception
    when sqlstate 'ZT001' then null;
    when others then r := jsonb_build_object('error', sqlerrm);
  end;
  return coalesce(r, 'null'::jsonb);
end $$;

create or replace function public.t_defs_capture(p_phase text) returns void language sql as $$
  insert into public.t_defs
  select p_phase, s, md5(pg_get_functiondef(s::regprocedure))
  from unnest(array['huddle_ops.dispatch(text,jsonb)','huddle_ops.has_pro(uuid)','huddle_ops.pro_until(uuid)',
                    'huddle_ops.give_days(uuid,integer,text,text,text)','huddle_ops.defer_gifts()']) s
$$;

create or replace function public.t_capture(p_phase text) returns void language plpgsql as $$
declare u record; v_limits boolean; k text;
  v_admin constant text := '00000000-0000-4000-8000-0000000000a7';
begin
  foreach v_limits in array array[false, true] loop
    update huddle_ops.settings set limits_enforced = v_limits;
    k := case when v_limits then 'on:' else 'off:' end;
    for u in select id from auth.users order by id loop
      perform set_config('request.jwt.claim.sub', u.id::text, true);
      insert into public.t_snap values
        (p_phase, u.id, k || 'has_pro',      public.t_val(format('select to_jsonb(huddle_ops.has_pro(%L))', u.id))),
        (p_phase, u.id, k || 'plan_allows',  public.t_val(format('select to_jsonb(huddle_ops.plan_allows(%L))', u.id))),
        (p_phase, u.id, k || 'plan_limits',  public.t_val(format('select huddle_ops.plan_limits(%L)', u.id))),
        (p_phase, u.id, k || 'pro_until',    public.t_val(format('select to_jsonb(huddle_ops.pro_until(%L))', u.id))),
        (p_phase, u.id, k || 'days_to_reach',public.t_val(format('select to_jsonb(huddle_ops.days_to_reach(%L, now() + interval ''40 days''))', u.id))),
        (p_phase, u.id, k || 'my_plan_usage',public.t_val('select public.my_plan_usage()')),
        (p_phase, u.id, k || 'self',         public.t_val('select huddle_ops.dispatch(''self'')')),
        (p_phase, u.id, k || 'give_days',    public.t_sim(
            format('select huddle_ops.give_days(%L, 7, ''manual'', ''eqv:%s'', ''eqv'')', u.id, u.id),
            format('select jsonb_build_object(''starts_at'', starts_at, ''expires_at'', expires_at) from huddle_ops.grants where source_key = ''eqv:%s''', u.id))),
        -- Apple renewal arriving: defer_gifts re-queues gifts behind it.
        (p_phase, u.id, k || 'defer_gifts',  public.t_sim(
            format('select public.apply_billing_snapshot(''eqv-%s'', jsonb_build_array(jsonb_build_object(''user_id'', %L, ''expires_at'', now() + interval ''15 days'', ''observed_at_ms'', 99)))', u.id, u.id),
            format('select jsonb_agg(jsonb_build_array(starts_at, expires_at) order by starts_at, id) from huddle_ops.grants where user_id = %L and revoked_at is null', u.id)));
    end loop;
    -- Back office (as administrator).
    perform set_config('request.jwt.claim.sub', v_admin, true);
    insert into public.t_snap values
      (p_phase, v_admin::uuid, k || 'admin_overview',  public.t_val('select huddle_ops.dispatch(''admin_overview'')')),
      (p_phase, v_admin::uuid, k || 'admin_members',   public.t_val('select huddle_ops.dispatch(''admin_members'')')),
      (p_phase, v_admin::uuid, k || 'admin_analytics', public.t_val('select huddle_ops.dispatch(''admin_analytics'')')),
      (p_phase, v_admin::uuid, k || 'admin_coupons',   public.t_val('select huddle_ops.dispatch(''admin_coupons'')')),
      (p_phase, v_admin::uuid, k || 'admin_billing',   public.t_val('select huddle_ops.dispatch(''admin_billing'')')),
      -- Revoking a gift re-queues the remaining gifts behind paid coverage.
      (p_phase, v_admin::uuid, k || 'admin_revoke',    public.t_sim(
          format('select huddle_ops.dispatch(''admin_revoke'', jsonb_build_object(''id'', %L, ''reason'', ''eqv test''))',
                 (select id from huddle_ops.grants where source_key = 'fx:a5a')),
          'select jsonb_agg(jsonb_build_array(starts_at, expires_at, revoked_at) order by source_key) from huddle_ops.grants where user_id = ''00000000-0000-4000-8000-0000000000a5''::uuid'));
  end loop;
  update huddle_ops.settings set limits_enforced = false;
end $$;

-- ── Before → migrate → after, one transaction ──────────────────────────────
begin;
select public.t_defs_capture('pre');
select public.t_capture('pre');
\ir ../../supabase/migrations/20261002230100_web_billing_foundation.sql
select public.t_defs_capture('up1');
select public.t_capture('post');

select public.t_ok((select count(*) from public.t_snap where phase = 'pre') = (select count(*) from public.t_snap where phase = 'post')
  and (select count(*) from public.t_snap where phase = 'pre') >= 190,
  format('snapshot sizes match (%s values per phase, 10 members x 9 readers x limits off/on + 6 back-office x 2)',
         (select count(*) from public.t_snap where phase = 'pre')));
select public.t_ok((select count(*) from public.t_snap where phase = 'pre' and val ? 'error') between 1 and 40,
  format('fixture includes rejected callers (suspended / unverified): %s error results compared too',
         (select count(*) from public.t_snap where phase = 'pre' and val ? 'error')));

-- Everything except 'self' / admin_members is byte-identical.
select public.t_ok(not exists (
  select 1 from public.t_snap a join public.t_snap b on b.phase = 'post' and b.uid = a.uid and b.item = a.item
  where a.phase = 'pre' and a.item !~ ':(self|admin_members)$' and a.val is distinct from b.val),
  'has_pro / plan_allows / plan_limits / pro_until / days_to_reach / my_plan_usage / give_days / defer_gifts / admin_overview / admin_analytics / admin_coupons / admin_billing / admin_revoke identical');
-- 'self': identical once the one new key is removed, and that key is null.
select public.t_ok(not exists (
  select 1 from public.t_snap a join public.t_snap b on b.phase = 'post' and b.uid = a.uid and b.item = a.item
  where a.phase = 'pre' and a.item ~ ':self$' and not (a.val ? 'error')
    and ((b.val - 'web_paid_until') is distinct from a.val or b.val -> 'web_paid_until' <> 'null'::jsonb or not (b.val ? 'web_paid_until'))),
  'dispatch(self) identical except the new key web_paid_until = null (paid_until still Apple only)');
select public.t_ok(not exists (
  select 1 from public.t_snap a join public.t_snap b on b.phase = 'post' and b.uid = a.uid and b.item = a.item
  where a.phase = 'pre' and a.item ~ ':self$' and a.val ? 'error' and a.val is distinct from b.val),
  'dispatch(self) rejections unchanged (suspended / unverified)');
select public.t_ok(not exists (
  select 1 from public.t_snap a join public.t_snap b on b.phase = 'post' and b.uid = a.uid and b.item = a.item
  where a.phase = 'pre' and a.item ~ ':admin_members$'
    and ((select jsonb_agg(e - 'web_paid_until') from jsonb_array_elements(b.val) e) is distinct from a.val
         or exists (select 1 from jsonb_array_elements(b.val) e where not (e ? 'web_paid_until') or e -> 'web_paid_until' <> 'null'::jsonb))),
  'admin_members identical except the new column web_paid_until = null');
-- Sanity: the fixture really exercises Pro on and off.
select public.t_ok((select count(distinct val) from public.t_snap where phase = 'post' and item = 'on:has_pro') = 2
  and (select count(distinct val) from public.t_snap where phase = 'post' and item = 'on:my_plan_usage') >= 2,
  'fixture has both Pro and free members (comparison is not vacuous)');
commit;
