-- Security hardening checks (20260928120000_security_hardening.sql):
--   admin by user id, display-name guard, referral alias detection.
--
-- DISPOSABLE DATABASE ONLY (inserts fake auth.users rows). Run with:
--   bash scripts/tests/security-hardening.sh
-- which boots a throwaway local cluster, applies EVERY migration in order and
-- then runs this file. Any failed expectation aborts with "FAILED: ...".
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
-- Like t_err but also asserts the SQLSTATE the client receives.
create or replace function public.t_state(stmt text, state text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if sqlstate=state then raise notice 'PASS: %',msg; return; end if;
    raise exception 'FAILED: % (sqlstate % / %)',msg,sqlstate,sqlerrm;
  end;
  raise exception 'FAILED: % (no error raised)',msg;
end $$;
grant execute on function public.t_ok(boolean,text), public.t_err(text,text,text), public.t_state(text,text,text) to authenticated;
-- Supabase grants table privileges to authenticated by default; the bare
-- cluster does not, so emulate it for profiles (RLS still applies).
grant select, update on public.profiles to authenticated;

-- ════ 1. Administrators by user id ═════════════════════════════════════════
select public.t_ok((select count(*)=0 from huddle_ops.admin_users),
  'migration applied with zero matching admin accounts (seed skips, no abort)');
select public.t_ok(not has_table_privilege('authenticated','huddle_ops.admin_users','SELECT')
  and not has_table_privilege('authenticated','huddle_ops.admin_users','INSERT')
  and not has_table_privilege('anon','huddle_ops.admin_users','SELECT'),
  'admin_users is not readable/writable by anon or authenticated');
select public.t_ok(position('admin_emails' in (select prosrc from pg_proc where oid='huddle_ops.dispatch(text,jsonb)'::regprocedure))=0,
  'dispatch no longer consults admin_emails');

-- X uses an approved admin EMAIL but its id is not in admin_users.
-- Y has an ordinary email and its id IS in admin_users.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000000f1','lazy@dreamcube.tw'),
 ('00000000-0000-4000-8000-0000000000f2','ops-owner@example.invalid'),
 ('00000000-0000-4000-8000-0000000000f3','lazydragon0247@gmail.com');
insert into huddle_ops.admin_users(user_id) values ('00000000-0000-4000-8000-0000000000f2');

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-0000000000f1';
select public.t_ok((public.huddle_operations('self')->>'admin')::boolean=false,'admin email without admin_users id: self.admin=false');
select public.t_err($q$select public.huddle_operations('admin_overview')$q$,'沒有營運後台權限','admin email without admin_users id: admin_overview rejected');
select public.t_err($q$select public.huddle_operations('admin_members','{}')$q$,'沒有營運後台權限','admin email without admin_users id: admin_members rejected');
select public.t_state($q$select public.huddle_operations('admin_settings','{}')$q$,'42501','rejection carries errcode 42501');
select public.t_err($q$insert into huddle_ops.admin_users(user_id) values ('00000000-0000-4000-8000-0000000000f1')$q$,'permission denied','member cannot self-insert into admin_users');
set request.jwt.claim.sub='00000000-0000-4000-8000-0000000000f3';
select public.t_err($q$select public.huddle_operations('admin_audit')$q$,'沒有營運後台權限','second admin email without id also rejected');
set request.jwt.claim.sub='00000000-0000-4000-8000-0000000000f2';
select public.t_ok((public.huddle_operations('self')->>'admin')::boolean,'admin_users id: self.admin=true');
select public.t_ok(public.huddle_operations('admin_overview') ? 'members','admin_users id: admin_overview allowed');
select public.huddle_operations('admin_settings','{"gifts_enabled":true,"trial_enabled":false,"trial_days":14,"coupons_enabled":true,"referrals_enabled":true,"referral_days":30,"friend_days":30,"annual_reward_cap":60,"leaderboard_enabled":true}') \gset q_
select public.t_ok((public.huddle_operations('self')->'settings'->>'referrals_enabled')::boolean,'admin_users id: admin_settings write succeeded');
reset role;
-- Binding is by id: changing the admin's email keeps access; removing the id revokes it.
update auth.users set email='renamed@example.invalid' where id='00000000-0000-4000-8000-0000000000f2';
set role authenticated;
select public.t_ok(public.huddle_operations('admin_overview') ? 'members','admin keeps access after email change');
reset role;
delete from huddle_ops.admin_users where user_id='00000000-0000-4000-8000-0000000000f2';
set role authenticated;
select public.t_err($q$select public.huddle_operations('admin_overview')$q$,'沒有營運後台權限','removing the id revokes admin');
reset role;
insert into huddle_ops.admin_users(user_id) values ('00000000-0000-4000-8000-0000000000f2');

-- ════ 2. Display name guard ════════════════════════════════════════════════
-- Signup path (handle_new_user INSERT): invalid names become NULL, sign-up never fails.
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-0000000000e1','victim@example.invalid','{}'),
 ('00000000-0000-4000-8000-0000000000e2','phisher@example.invalid','{"name":"Huddle 官方客服"}'),
 ('00000000-0000-4000-8000-0000000000e3','admin@corp.example','{}'),
 ('00000000-0000-4000-8000-0000000000e4','ok@example.invalid','{"full_name":"王小明 Real Name"}');
select public.t_ok((select display_name is null from public.profiles where id='00000000-0000-4000-8000-0000000000e2'),'signup with reserved name: profile created, name dropped to NULL');
select public.t_ok((select display_name is null from public.profiles where id='00000000-0000-4000-8000-0000000000e3'),'signup whose email prefix is "admin": profile created, name NULL');
select public.t_ok((select display_name='王小明 Real Name' from public.profiles where id='00000000-0000-4000-8000-0000000000e4'),'signup with normal name keeps it');

-- Legacy row created before the guard: must stay untouched by unrelated updates.
alter table public.profiles disable trigger guard_profile_display_name;
update public.profiles set display_name='Legacy Huddle Staff Name 27' where id='00000000-0000-4000-8000-0000000000e1';
alter table public.profiles enable trigger guard_profile_display_name;
select public.t_ok((select char_length(display_name)=27 from public.profiles where id='00000000-0000-4000-8000-0000000000e1'),'legacy 27-char row prepared');

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-0000000000e1';
update public.profiles set avatar_url='https://example.invalid/a.png' where id='00000000-0000-4000-8000-0000000000e1';
select public.t_ok((select avatar_url='https://example.invalid/a.png' and display_name='Legacy Huddle Staff Name 27' from public.profiles where id='00000000-0000-4000-8000-0000000000e1'),'other-column update on legacy row not blocked');
update public.profiles set display_name=display_name, avatar_url=null where id='00000000-0000-4000-8000-0000000000e1';
select public.t_ok((select avatar_url is null from public.profiles where id='00000000-0000-4000-8000-0000000000e1'),'SET display_name to its current value is not re-validated');

set request.jwt.claim.sub='00000000-0000-4000-8000-0000000000e4';
select public.t_err($q$update public.profiles set display_name='Huddle 官方客服' where id='00000000-0000-4000-8000-0000000000e4'$q$,'保留字','direct UPDATE to "Huddle 官方客服" rejected');
select public.t_state($q$update public.profiles set display_name='Huddle 官方客服' where id='00000000-0000-4000-8000-0000000000e4'$q$,'23514','rejection carries errcode 23514');
select public.t_err($q$update public.profiles set display_name='客服中心' where id='00000000-0000-4000-8000-0000000000e4'$q$,'保留字','"客服" rejected');
select public.t_err($q$update public.profiles set display_name='系統管理員' where id='00000000-0000-4000-8000-0000000000e4'$q$,'保留字','"管理員" rejected');
select public.t_err($q$update public.profiles set display_name='官 方 帳 號' where id='00000000-0000-4000-8000-0000000000e4'$q$,'保留字','spaced "官 方" rejected');
select public.t_err($q$update public.profiles set display_name='ＨＵＤＤＬＥ Team' where id='00000000-0000-4000-8000-0000000000e4'$q$,'保留字','full-width HUDDLE rejected (NFKC)');
select public.t_err($q$update public.profiles set display_name='H.u.d.d.l.e' where id='00000000-0000-4000-8000-0000000000e4'$q$,'保留字','dotted h.u.d.d.l.e rejected');
select public.t_err($q$update public.profiles set display_name='Admin Chen' where id='00000000-0000-4000-8000-0000000000e4'$q$,'保留字','"Admin" rejected');
select public.t_err($q$update public.profiles set display_name='Administrator' where id='00000000-0000-4000-8000-0000000000e4'$q$,'保留字','"Administrator" rejected');
select public.t_err($q$update public.profiles set display_name='Customer SUPPORT' where id='00000000-0000-4000-8000-0000000000e4'$q$,'保留字','"SUPPORT" rejected (case-insensitive)');
select public.t_err($q$update public.profiles set display_name='Team-Staff' where id='00000000-0000-4000-8000-0000000000e4'$q$,'保留字','"Staff" rejected');
select public.t_err($q$update public.profiles set display_name='a@b.co' where id='00000000-0000-4000-8000-0000000000e4'$q$,'不能包含 @','name containing @ rejected');
select public.t_err($q$update public.profiles set display_name='小明＠家' where id='00000000-0000-4000-8000-0000000000e4'$q$,'不能包含 @','full-width ＠ rejected');
select public.t_err($q$update public.profiles set display_name='<b>Bob</b>' where id='00000000-0000-4000-8000-0000000000e4'$q$,'不能包含 @','name containing < > rejected');
select public.t_err($q$update public.profiles set display_name=E'Bob\nSmith' where id='00000000-0000-4000-8000-0000000000e4'$q$,'控制字元','control character rejected');
select public.t_err($q$update public.profiles set display_name=E'Hud​dle' where id='00000000-0000-4000-8000-0000000000e4'$q$,'隱形字元','zero-width space rejected');
select public.t_err($q$update public.profiles set display_name=E'Bob‮evil' where id='00000000-0000-4000-8000-0000000000e4'$q$,'隱形字元','bidi override rejected');
select public.t_err($q$update public.profiles set display_name=repeat('長',33) where id='00000000-0000-4000-8000-0000000000e4'$q$,'1–32','33 characters rejected');
select public.t_err($q$update public.profiles set display_name='   ' where id='00000000-0000-4000-8000-0000000000e4'$q$,'1–32','blank name rejected');
select public.t_ok((select display_name='王小明 Real Name' from public.profiles where id='00000000-0000-4000-8000-0000000000e4'),'rejected updates left the name unchanged');
update public.profiles set display_name='企鵝小隊長' where id='00000000-0000-4000-8000-0000000000e4';
select public.t_ok((select display_name='企鵝小隊長' from public.profiles where id='00000000-0000-4000-8000-0000000000e4'),'normal rename succeeds');
update public.profiles set display_name='Badminton Fan' where id='00000000-0000-4000-8000-0000000000e4';
select public.t_ok((select display_name='Badminton Fan' from public.profiles where id='00000000-0000-4000-8000-0000000000e4'),'"Badminton" (contains admin mid-word) allowed');
update public.profiles set display_name=repeat('名',32) where id='00000000-0000-4000-8000-0000000000e4';
select public.t_ok((select char_length(display_name)=32 from public.profiles where id='00000000-0000-4000-8000-0000000000e4'),'32 characters allowed');
update public.profiles set display_name=null where id='00000000-0000-4000-8000-0000000000e4';
select public.t_ok((select display_name is null from public.profiles where id='00000000-0000-4000-8000-0000000000e4'),'clearing the name (NULL) allowed');
-- The in-app alias form goes through dispatch('profile'), which also writes profiles.
select public.t_err($q$select public.huddle_operations('profile','{"alias":"Huddle客服","visible":false}')$q$,'保留字','dispatch profile with reserved alias rejected by the guard');
select public.t_ok(public.huddle_operations('self')->'member'->>'alias' not like '%Huddle%','rejected alias rolled back in members too');
select public.huddle_operations('profile','{"alias":"小企鵝","visible":false}') \gset q_
select public.t_ok((select display_name='小企鵝' from public.profiles where id='00000000-0000-4000-8000-0000000000e4'),'dispatch profile with normal alias succeeds');
reset role;

-- ════ 3. normalize_email ═══════════════════════════════════════════════════
select public.t_ok(huddle_ops.normalize_email('A.B+promo@Gmail.com')='ab@gmail.com','gmail: lower + drop dots + drop +tag');
select public.t_ok(huddle_ops.normalize_email('a.b@googlemail.com')='ab@gmail.com','googlemail.com unified to gmail.com');
select public.t_ok(huddle_ops.normalize_email('a+1+2@gmail.com')='a@gmail.com','multiple + tags dropped');
select public.t_ok(huddle_ops.normalize_email('John.Doe+x@Example.COM')='john.doe@example.com','non-gmail: dots kept, +tag dropped, lower-cased');
select public.t_ok(huddle_ops.normalize_email('  x@y.io ')='x@y.io','surrounding whitespace trimmed');
select public.t_ok(huddle_ops.normalize_email('no-at-sign')='no-at-sign','no @: returned lower-cased as is');
select public.t_ok(huddle_ops.normalize_email(null) is null,'NULL stays NULL (phone-only accounts)');
select public.t_ok(huddle_ops.normalize_email('a.b@gmail.com.evil.io')='a.b@gmail.com.evil.io','look-alike domain not treated as gmail');
select public.t_ok((select provolatile='i' from pg_proc where oid='huddle_ops.normalize_email(text)'::regprocedure),'normalize_email is IMMUTABLE');
select public.t_ok(not has_function_privilege('authenticated','huddle_ops.normalize_email(text)','EXECUTE'),'normalize_email not callable by members');

-- ════ 3. Referral alias farming ════════════════════════════════════════════
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000000d0','a@gmail.com'),        -- referrer
 ('00000000-0000-4000-8000-0000000000d1','a+1@gmail.com'),      -- referrer alias
 ('00000000-0000-4000-8000-0000000000d2','A.@GoogleMail.com'),  -- referrer alias (dot, domain, case)
 ('00000000-0000-4000-8000-0000000000d3','bob@example.invalid'),
 ('00000000-0000-4000-8000-0000000000d4','bob+2@example.invalid'),
 ('00000000-0000-4000-8000-0000000000d5','carol@gmail.com');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-0000000000d0';
select public.huddle_operations('generate')->>'code' as ref_code \gset
select set_config('test.ref_code', :'ref_code', false) \gset q_
set request.jwt.claim.sub='00000000-0000-4000-8000-0000000000d1';
select public.t_err($q$select public.huddle_operations('refer',jsonb_build_object('code',current_setting('test.ref_code')))$q$,'同一人的其他帳號','a+1@gmail.com cannot use a@gmail.com''s code');
set request.jwt.claim.sub='00000000-0000-4000-8000-0000000000d2';
select public.t_err($q$select public.huddle_operations('refer',jsonb_build_object('code',current_setting('test.ref_code')))$q$,'同一人的其他帳號','A.@GoogleMail.com cannot use a@gmail.com''s code');
set request.jwt.claim.sub='00000000-0000-4000-8000-0000000000d3';
select public.t_ok(public.huddle_operations('refer',jsonb_build_object('code',current_setting('test.ref_code')))->>'message' like '推薦碼已生效%','different person (bob) referral succeeds');
set request.jwt.claim.sub='00000000-0000-4000-8000-0000000000d4';
select public.t_err($q$select public.huddle_operations('refer',jsonb_build_object('code',current_setting('test.ref_code')))$q$,'同一人的其他帳號','bob+2 (alias of an already-referred friend) rejected');
set request.jwt.claim.sub='00000000-0000-4000-8000-0000000000d5';
select public.t_ok(public.huddle_operations('refer',jsonb_build_object('code',current_setting('test.ref_code')))->>'message' like '推薦碼已生效%','another different person (carol@gmail.com) succeeds');
reset role;
select public.t_ok((select count(*)=2 from huddle_ops.referrals where referrer_id='00000000-0000-4000-8000-0000000000d0'),'exactly 2 referrals recorded (bob, carol)');
select public.t_ok((select count(*)=0 from huddle_ops.referrals where referred_id in ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000d4')),'no referral or reward rows for rejected aliases');
select public.t_ok((select count(*)=0 from huddle_ops.grants where user_id in ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000d4') and source='friend'),'no friend-day grants for rejected aliases');

select 'Security hardening checks: all assertions passed' as done;
