-- Runs against a fresh database with every migration applied (see .sh).
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
create function public.t_ok(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'FAILED: %',msg; end if; raise notice 'PASS: %',msg; end $$;
create function public.t_err(stmt text, fragment text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if position(fragment in sqlerrm)>0 then raise notice 'PASS: %',msg; return; end if;
    raise exception 'FAILED: % (unexpected error: %)',msg,sqlerrm;
  end;
  raise exception 'FAILED: % (no error raised)',msg;
end $$;
grant execute on function public.t_ok(boolean,text), public.t_err(text,text,text) to authenticated, service_role;

-- A = administrator, B = will be suspended, C/D = ordinary active members.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-00000000000a','lazy@dreamcube.tw'),
 ('00000000-0000-4000-8000-00000000000b','suspended@example.invalid'),
 ('00000000-0000-4000-8000-00000000000c','active@example.invalid'),
 ('00000000-0000-4000-8000-00000000000d','fresh@example.invalid');
insert into public.calendar_shares(user_lo,user_hi) values
 ('00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000000b'),
 ('00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000000c'),
 ('00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-00000000000c');

select public.t_ok(not exists(
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
    and not exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='operations_account_active')),
  'every public RLS table carries the suspension policy (incl. check-in, points, meeting tables)');

-- Baseline while B is still active: B can invite, check in and import.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000a';
select public.huddle_operations('admin_settings','{"gifts_enabled":true,"trial_enabled":true,"trial_days":14,"coupons_enabled":true,"referrals_enabled":true,"referral_days":30,"friend_days":30,"annual_reward_cap":60,"leaderboard_enabled":true}') \gset q_
select public.huddle_operations('admin_coupon',jsonb_build_object('code','REAL30','name','Real','days',30,'audience','all','max_uses',100,'starts_at',now()-interval '1 day','expires_at',now()+interval '10 days')) \gset q_
select public.huddle_operations('admin_coupon',jsonb_build_object('code','FULL01','name','Full','days',5,'audience','all','max_uses',1,'starts_at',now()-interval '1 day','expires_at',now()+interval '10 days')) \gset q_
select public.huddle_operations('admin_coupon',jsonb_build_object('code','OLD001','name','Old','days',5,'audience','all','max_uses',9,'starts_at',now()-interval '3 day','expires_at',now()-interval '1 day')) \gset q_
select public.huddle_operations('redeem','{"code":"FULL01"}') \gset q_
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000b';
select public.t_ok(public.create_meeting_invitation('Before','','',now()+interval '1 day',now()+interval '25 hours','Asia/Taipei',array['00000000-0000-4000-8000-00000000000c'::uuid],'00000000-0000-4000-8000-0000000000b1') is not null,'active member can create invitation');
select public.t_ok((select checked_in from public.claim_daily_check_in()),'active member can check in');
reset role;
set role service_role;
select public.t_ok((public.reserve_meeting_import_v2('00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000000b2','Before','2026-09-26','This transcript is long enough to be accepted.','{}')->>'claimed')::boolean,'active member can reserve a meeting import');
reset role;
select meeting_id as b_meeting from public.meeting_attendees where user_id='00000000-0000-4000-8000-00000000000b' limit 1 \gset
select id as c_notification from public.meeting_notifications where recipient_id='00000000-0000-4000-8000-00000000000c' limit 1 \gset
insert into public.meeting_notifications(recipient_id,meeting_id,actor_id,kind) values('00000000-0000-4000-8000-00000000000b',:'b_meeting','00000000-0000-4000-8000-00000000000c','response');
select id as b_notification from public.meeting_notifications where recipient_id='00000000-0000-4000-8000-00000000000b' limit 1 \gset

-- Suspend B.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000a';
select public.huddle_operations('admin_suspend','{"user_id":"00000000-0000-4000-8000-00000000000b","suspended":true,"reason":"停用測試"}') \gset q_

set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000b';
select public.t_err($$select public.create_meeting_invitation('After','','',now()+interval '2 day',now()+interval '49 hours','Asia/Taipei',array['00000000-0000-4000-8000-00000000000c'::uuid],'00000000-0000-4000-8000-0000000000b3')$$,'帳號已停用','suspended: create_meeting_invitation rejected');
select public.t_err($$select public.get_meeting_invitations(now()-interval '1 day',now()+interval '30 days')$$,'帳號已停用','suspended: get_meeting_invitations rejected');
select public.t_err(format('select public.get_meeting_invitation(%L)',:'b_meeting'),'帳號已停用','suspended: get_meeting_invitation rejected');
select public.t_err($$select public.get_meeting_invitation_by_request('00000000-0000-4000-8000-0000000000b1')$$,'帳號已停用','suspended: get_meeting_invitation_by_request rejected');
select public.t_err(format('select public.cancel_meeting_invitation(%L)',:'b_meeting'),'帳號已停用','suspended: cancel_meeting_invitation rejected');
select public.t_err(format('select public.respond_meeting_invitation(%L,%L)',:'b_meeting','declined'),'帳號已停用','suspended: respond_meeting_invitation rejected');
select public.t_err($$select public.get_shared_meeting_busy(array['00000000-0000-4000-8000-00000000000c'::uuid],now(),now()+interval '30 days')$$,'帳號已停用','suspended: get_shared_meeting_busy (peer busy times) rejected');
select public.t_err($$select public.get_meeting_notifications()$$,'帳號已停用','suspended: get_meeting_notifications rejected');
select public.t_err(format('select public.read_meeting_notification(%L)',:'b_notification'),'帳號已停用','suspended: read_meeting_notification rejected');
select public.t_err($$select * from public.claim_daily_check_in()$$,'帳號已停用','suspended: claim_daily_check_in (points) rejected');
select public.t_err($$select * from public.get_check_in_leaderboard()$$,'帳號已停用','suspended: get_check_in_leaderboard rejected');
select public.t_err($$select public.huddle_operations('self')$$,'帳號已停用','suspended: operations self still rejected');
select public.t_ok((select count(*)=0 from public.daily_check_ins) and (select count(*)=0 from public.points_ledger) and (select count(*)=0 from public.points_accounts),'suspended: own check-in and points rows hidden by RLS');
select public.t_ok((select count(*)=0 from public.meeting_imports),'suspended: own meeting imports hidden by RLS');
select public.t_ok((select count(*)=0 from public.get_daily_check_in_status() s where s.total_points>0),'suspended: check-in status reveals no points');
reset role;
select public.t_ok((select count(*)=1 from public.points_ledger where user_id='00000000-0000-4000-8000-00000000000b'),'suspension did not delete or add points');

set role service_role;
select public.t_ok(public.account_access_allowed('00000000-0000-4000-8000-00000000000b') is false,'edge check: suspended account refused');
select public.t_ok(public.account_access_allowed('00000000-0000-4000-8000-00000000000c') is true,'edge check: active account allowed');
select public.t_err($$select public.reserve_meeting_import_v2('00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000000b4','After','2026-09-26','This transcript is long enough to be accepted.','{}')$$,'ACCOUNT_SUSPENDED','suspended: service reserve_meeting_import_v2 rejected');
select public.t_err($$select public.reserve_meeting_import('00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000000b5','After','2026-09-26','This transcript is long enough to be accepted.')$$,'ACCOUNT_SUSPENDED','suspended: service reserve_meeting_import rejected');
select public.t_err($$select public.route_meeting_tasks('00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000000b2',null,'[]')$$,'ACCOUNT_SUSPENDED','suspended: service route_meeting_tasks rejected');
select public.t_err($$select public.import_meeting_tasks('00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000000b2',null,'[]')$$,'ACCOUNT_SUSPENDED','suspended: service import_meeting_tasks rejected');
select public.t_err($$select public.respond_meeting_assignment('00000000-0000-4000-8000-00000000000b',gen_random_uuid(),false,null)$$,'ACCOUNT_SUSPENDED','suspended: service respond_meeting_assignment rejected');
select public.t_ok((public.reserve_meeting_import_v2('00000000-0000-4000-8000-00000000000c','00000000-0000-4000-8000-0000000000c1','Active','2026-09-26','This transcript is long enough to be accepted.','{}')->>'claimed')::boolean,'active: service reserve_meeting_import_v2 still works');
reset role;
select public.t_ok(not has_function_privilege('authenticated','public.account_access_allowed(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','huddle_ops.access_allowed(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.account_access_allowed(uuid)','EXECUTE'),'members cannot probe other accounts'' suspension state');

-- Active member C is unaffected everywhere.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000c';
select public.t_ok(public.create_meeting_invitation('Active','','',now()+interval '3 day',now()+interval '73 hours','Asia/Taipei',array['00000000-0000-4000-8000-00000000000a'::uuid],'00000000-0000-4000-8000-0000000000c2') is not null,'active: create_meeting_invitation works');
select public.t_ok(jsonb_array_length(public.get_meeting_invitations(now()-interval '1 day',now()+interval '30 days'))>=2,'active: get_meeting_invitations works');
select public.t_ok(public.get_shared_meeting_busy(array['00000000-0000-4000-8000-00000000000a'::uuid],now(),now()+interval '30 days') is not null,'active: get_shared_meeting_busy works');
select public.t_ok((public.get_meeting_notifications()->>'unread_count')::int>=1,'active: get_meeting_notifications works');
select public.read_meeting_notification(:'c_notification');
select public.t_ok((select checked_in from public.claim_daily_check_in()),'active: claim_daily_check_in works');
select public.t_ok((select total_points=1 from public.get_daily_check_in_status()),'active: own points visible');
select public.t_ok((select count(*)>=1 from public.get_check_in_leaderboard()),'active: leaderboard works');
select public.t_ok(public.huddle_operations('self') ? 'member','active: operations self works');

-- Coupon enumeration: one message for missing / expired / full / ineligible.
select public.huddle_operations('redeem','{"code":"NOPE0001"}') as r_missing \gset
select public.huddle_operations('redeem','{"code":"OLD001"}') as r_expired \gset
select public.huddle_operations('redeem','{"code":"FULL01"}') as r_full \gset
select public.t_ok((:'r_missing'::jsonb->>'ok')='false' and :'r_missing'::jsonb->>'error' is not null,'missing coupon returns ok=false with an error message');
select public.t_ok(:'r_missing'::jsonb = :'r_expired'::jsonb and :'r_missing'::jsonb = :'r_full'::jsonb,'missing, expired and full coupons are indistinguishable');
select public.t_ok(position('不存在' in :'r_missing')=0,'response never says the code does not exist');
select count(*) as q_guesses from (select public.huddle_operations('redeem',jsonb_build_object('code','GUESS'||n)) from generate_series(1,7) n) x \gset
select public.t_err($$select public.huddle_operations('redeem','{"code":"REAL30"}')$$,'嘗試次數過多','10 failed attempts within an hour: further redemption blocked (even a valid code)');
reset role;
select public.t_ok((select count(*)=10 from huddle_ops.coupon_attempts where user_id='00000000-0000-4000-8000-00000000000c'),'failed attempts persisted despite error responses');
select public.t_ok((select count(*)=0 from huddle_ops.redemptions r join huddle_ops.coupons c on c.id=r.coupon_id where c.code='REAL30'),'rate-limited attempt granted nothing');
update huddle_ops.coupon_attempts set attempted_at=now()-interval '61 minutes' where user_id='00000000-0000-4000-8000-00000000000c';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000c';
select public.t_ok(public.huddle_operations('redeem','{"code":"real30"}')->>'message' like '兌換成功%','after the window expires a valid code redeems normally');
select public.t_ok(public.huddle_operations('redeem','{"code":"REAL30"}')->>'message' like '%已兌換過%','repeat redemption keeps its friendly message');
set request.jwt.claim.sub='00000000-0000-4000-8000-00000000000d';
select public.t_ok(public.huddle_operations('redeem','{"code":"REAL30"}')->>'message' like '兌換成功%','other members unaffected by C''s attempts');
select public.t_ok((select public.huddle_operations('redeem','{"code":"FULL01"}')->>'error') like '%無效%','fresh member still sees the friendly generic message');
reset role;
select public.t_ok(not has_table_privilege('authenticated','huddle_ops.coupon_attempts','SELECT'),'attempt log is private');
