-- Harden account suspension (operations back office, PR #65 follow-up).
--  1. Suspended accounts were only blocked at the calendar-sharing RPCs and on
--     tables that existed when 20260925075939 ran. Meeting RPCs, daily check-in
--     and the service-role meeting-import RPCs are SECURITY DEFINER / service
--     paths that bypass RLS, so each now checks huddle_ops.access_allowed().
--     Tables created afterwards also receive the restrictive RLS policy.
--  2. Coupon redemption no longer reveals whether a code exists, and failed
--     attempts are rate limited per account.
--  3. The 'self' action (called on every page load) no longer takes the global
--     settings row lock; only first-visit trial checks lock that member's row.
-- Function bodies below are the latest definitions with only the guard added.

-- Same rule as huddle_ops.access_allowed(), for trusted callers that act on
-- behalf of an explicit user (Edge Functions using the service role key).
create or replace function huddle_ops.access_allowed(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_user is not null and exists(select 1 from auth.users where id=p_user)
    and not exists(select 1 from huddle_ops.members where user_id=p_user and suspended)
$$;
create or replace function huddle_ops.access_allowed() returns boolean
language sql stable security definer set search_path='' as $$
  select huddle_ops.access_allowed(auth.uid())
$$;
grant usage on schema huddle_ops to service_role;
revoke all on function huddle_ops.access_allowed(uuid) from public, anon, authenticated;
grant execute on function huddle_ops.access_allowed(uuid) to service_role;
grant execute on function huddle_ops.access_allowed() to authenticated;

-- Edge Function entry check (service role only; members cannot probe others).
create or replace function public.account_access_allowed(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select huddle_ops.access_allowed(p_user)
$$;
revoke all on function public.account_access_allowed(uuid) from public, anon, authenticated;
grant execute on function public.account_access_allowed(uuid) to service_role;

-- Restrictive policy for every RLS table created after the original sweep.
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
      and not exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='operations_account_active') loop
    execute format('create policy operations_account_active on public.%I as restrictive for all to authenticated using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()))',t.relname);
  end loop;
end $$;

-- Failed coupon attempts, kept per account for rate limiting (private table).
create table if not exists huddle_ops.coupon_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists coupon_attempts_user_time on huddle_ops.coupon_attempts(user_id, attempted_at);
alter table huddle_ops.coupon_attempts enable row level security;
revoke all on huddle_ops.coupon_attempts from public, anon, authenticated;

-- Operations dispatcher: identical to 20260925075939 except the 'self' lock and 'redeem'.
create or replace function huddle_ops.dispatch(p_action text, p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=auth.uid(); s huddle_ops.settings%rowtype; m huddle_ops.members%rowtype;
  v_coupon huddle_ops.coupons%rowtype; ref uuid; gid uuid; rid uuid; target uuid;
  v_code text; a text; result jsonb; admin boolean; n integer; used integer; d integer;
  user_created timestamptz; v_reason text; v_grant record; cursor_at timestamptz; remaining interval; off integer:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),1000000));
begin
  if u is null or not exists(select 1 from auth.users where id=u and (email_confirmed_at is not null or phone_confirmed_at is not null)) then
    raise exception '請先完成帳號驗證並重新登入' using errcode='42501';
  end if;
  select exists(select 1 from auth.users a join huddle_ops.admin_emails e on e.email=lower(a.email)
    where a.id=u and a.email_confirmed_at is not null) into admin;
  if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
  select * into s from huddle_ops.settings where id=true;
  select created_at into user_created from auth.users where id=u;
  insert into huddle_ops.members(user_id,alias) values(u,'旅人 '||upper(substr(replace(u::text,'-',''),1,8))) on conflict do nothing;
  -- All promotional writes take settings first, then member locks. Serializes
  -- cap checks, coupon quotas and double-click/retry across different sessions.
  if p_action in ('redeem','refer','admin_coupon','admin_update_coupon','admin_toggle_coupon','admin_settings','admin_grant','admin_revoke','admin_referral') then
    select * into s from huddle_ops.settings where id=true for update;
  end if;
  select * into m from huddle_ops.members where user_id=u;
  if p_action like 'admin_%' and not admin then raise exception '此帳號沒有營運後台權限' using errcode='42501'; end if;

  if p_action='self' then
    -- Page loads never queue behind other members. The one-time trial check
    -- locks only this member's row ('refer' also locks it before reading
    -- trial days), then re-reads the flag so concurrent tabs grant once.
    if not m.trial_checked then
      select * into m from huddle_ops.members where user_id=u for update;
      if not m.trial_checked then
        update huddle_ops.members set trial_checked=true where user_id=u;
        if s.trial_enabled and user_created>=s.launched_at and user_created>now()-interval '7 days' then
          perform huddle_ops.give_days(u,s.trial_days,'trial','trial:'||u,'新戶體驗');
        end if;
      end if;
    end if;
    return jsonb_build_object('member',to_jsonb(m),'admin',admin,
      'settings',to_jsonb(s)-'launched_at',
      'paid_until',(select expires_at from public.billing_entitlements where user_id=u and entitlement='pro'),
      'pro_until',greatest((select max(expires_at) from huddle_ops.grants where user_id=u and revoked_at is null),(select expires_at from public.billing_entitlements where user_id=u and entitlement='pro')),
      'grants',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (select g.id,g.days,g.source,g.reason,g.created_at,g.expires_at,g.revoked_at from huddle_ops.grants g where user_id=u order by created_at desc limit 100) q),'[]'),
      'referral_count',(select count(*) from huddle_ops.referrals where referrer_id=u and status='valid'),
      'reward_days',(select coalesce(sum(reward_days),0) from huddle_ops.referrals where referrer_id=u and status='valid'),
      'referred',exists(select 1 from huddle_ops.referrals where referred_id=u));
  elsif p_action='profile' then
    a:=btrim(p_data->>'alias');
    if a is null or char_length(a) not between 2 and 24 or a ~ '[[:cntrl:]@<>]' then raise exception '化名請使用 2–24 個字，勿填 Email 或特殊控制字元'; end if;
    update huddle_ops.members set alias=a,leaderboard_visible=coalesce((p_data->>'visible')::boolean,false) where user_id=u;
    update public.profiles set display_name=a where id=u;
  elsif p_action='generate' then
    update huddle_ops.members set referral_code=coalesce(referral_code,'H'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))) where user_id=u returning referral_code into v_code;
    return jsonb_build_object('code',v_code);
  elsif p_action='leaderboard' then
    if not s.leaderboard_enabled then return '[]'; end if;
    return coalesce((select jsonb_agg(to_jsonb(q)) from (
      select dense_rank() over(order by count(*) desc) as rank,mm.alias,count(*) as referrals,mm.user_id=u as is_self
      from huddle_ops.members mm join huddle_ops.referrals rr on rr.referrer_id=mm.user_id and rr.status='valid'
      where mm.leaderboard_visible and not mm.suspended
      group by mm.user_id,mm.alias order by count(*) desc,mm.alias,mm.user_id limit 100
    ) q),'[]');
  elsif p_action='redeem' then
    if not s.coupons_enabled then raise exception '優惠碼活動目前暫停'; end if;
    -- Failed attempts are rate limited per account. They must survive this
    -- call, so failures are returned as {ok:false,error} instead of raised
    -- (a raise would roll back the attempt row). The client turns them into
    -- errors. Missing, inactive, full and ineligible codes share one message
    -- so responses never reveal whether a guessed code exists.
    if (select count(*) from huddle_ops.coupon_attempts where user_id=u and attempted_at>now()-interval '1 hour')>=10 then
      raise exception '嘗試次數過多，請一小時後再試' using errcode='54000';
    end if;
    v_code:=upper(btrim(p_data->>'code'));
    select * into v_coupon from huddle_ops.coupons where coupons.code=v_code for update;
    if v_coupon.id is not null and exists(select 1 from huddle_ops.redemptions where coupon_id=v_coupon.id and user_id=u) then return jsonb_build_object('message','這個優惠碼已兌換過，時間不會重複發放'); end if;
    v_reason:=null;
    if v_coupon.id is null or not v_coupon.enabled or now()<v_coupon.starts_at or now()>=v_coupon.expires_at
      or (select count(*) from huddle_ops.redemptions where coupon_id=v_coupon.id)>=v_coupon.max_uses
      or (v_coupon.audience='new' and user_created<now()-interval '7 days') or (v_coupon.audience='existing' and user_created>=v_coupon.created_at) or (v_coupon.audience='specific' and v_coupon.target_user_id is distinct from u) then
      v_reason:='優惠碼無效、已過期、名額已滿或不適用於你的帳號，請確認後再試';
    elsif not v_coupon.stackable and exists(select 1 from huddle_ops.grants where user_id=u and source in ('coupon','friend') and revoked_at is null and expires_at>now()) then
      v_reason:='此優惠不能與尚未到期的活動或推薦體驗疊加';
    end if;
    if v_reason is not null then
      delete from huddle_ops.coupon_attempts where user_id=u and attempted_at<now()-interval '1 day';
      insert into huddle_ops.coupon_attempts(user_id) values(u);
      return jsonb_build_object('ok',false,'error',v_reason,'message',v_reason);
    end if;
    gid:=huddle_ops.give_days(u,v_coupon.days,'coupon','coupon:'||v_coupon.id||':'||u,v_coupon.name);
    insert into huddle_ops.redemptions values(v_coupon.id,u,gid,now());
    insert into huddle_ops.audit(actor_id,action,target,detail) values(u,'redeem',v_coupon.id::text,jsonb_build_object('days',v_coupon.days));
    return jsonb_build_object('message','兌換成功，已增加 '||v_coupon.days||' 天');
  elsif p_action='refer' then
    if not s.referrals_enabled then raise exception '推薦獎勵活動目前暫停'; end if;
    if exists(select 1 from huddle_ops.referrals where referred_id=u) then return jsonb_build_object('message','此帳號已綁定推薦人，不會重複發放'); end if;
    if user_created<s.launched_at or user_created<now()-interval '7 days' then raise exception '推薦碼限註冊後 7 天內的新會員使用'; end if;
    select user_id into ref from huddle_ops.members where referral_code=upper(btrim(p_data->>'code')) and not suspended;
    if ref is null or ref=u then raise exception '推薦碼無效，或不能推薦自己'; end if;
    -- Stable lock order also coordinates with paid entitlement updates.
    perform 1 from huddle_ops.members where user_id in (u,ref) order by user_id for update;
    select coalesce(sum(reward_days),0) into used from huddle_ops.referrals where referrer_id=ref and status='valid'
      and (created_at at time zone 'Asia/Taipei')::date>=date_trunc('year',now() at time zone 'Asia/Taipei')::date;
    d:=least(s.referral_days,greatest(0,s.annual_reward_cap-used));
    rid:=gen_random_uuid();
    gid:=huddle_ops.give_days(ref,d,'referral','referral:'||u,'成功推薦新會員');
    insert into huddle_ops.referrals(id,referrer_id,referred_id,reward_days,grant_id) values(rid,ref,u,d,gid);
    -- Friend's 30-day total includes any unspent signup trial; campaign gifts
    -- take precedence instead of stacking two new-member incentives.
    if not exists(select 1 from huddle_ops.grants where user_id=u and source='coupon' and revoked_at is null and expires_at>now()) then
      select coalesce(sum(days),0) into n from huddle_ops.grants where user_id=u and source='trial' and revoked_at is null;
      perform huddle_ops.give_days(u,greatest(0,s.friend_days-n),'friend','friend:'||u,'推薦新戶體驗');
    end if;
    update huddle_ops.members set trial_checked=true where user_id=u;
    insert into huddle_ops.audit(actor_id,action,target,detail) values(u,'refer',rid::text,jsonb_build_object('reward_days',d));
    return jsonb_build_object('message','推薦碼已生效，使用時間已更新');
  elsif p_action='announcements' then
    return coalesce((select jsonb_agg(to_jsonb(q)) from (select id,title,body,kind from huddle_ops.announcements where enabled and now()>=starts_at and now()<expires_at order by starts_at desc limit 3) q),'[]');
  elsif p_action='admin_announcements' then
    return coalesce((select jsonb_agg(to_jsonb(q)) from (select * from huddle_ops.announcements order by created_at desc limit 50 offset off) q),'[]');
  elsif p_action='admin_announcement' then
    insert into huddle_ops.announcements(id,title,body,kind,starts_at,expires_at,enabled)
      values(coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid()),p_data->>'title',p_data->>'body',p_data->>'kind',
      (p_data->>'starts_at')::timestamptz,(p_data->>'expires_at')::timestamptz,(p_data->>'enabled')::boolean)
      on conflict(id) do update set title=excluded.title,body=excluded.body,kind=excluded.kind,starts_at=excluded.starts_at,expires_at=excluded.expires_at,enabled=excluded.enabled;
  elsif p_action='admin_analytics' then
    return coalesce((select jsonb_agg(to_jsonb(q)) from (
      with cohort as (
        select au.id,au.created_at,
          case when exists(select 1 from huddle_ops.redemptions r where r.user_id=au.id) then '活動優惠碼'
          when exists(select 1 from huddle_ops.referrals r where r.referred_id=au.id and r.status='valid') then '會員推薦'
          else '自然註冊' end as channel
        from auth.users au where au.created_at>=s.launched_at
      )
      select channel,count(*) as registrations,
        count(*) filter(where exists(select 1 from huddle_ops.activity a where a.user_id=cohort.id)) as activated,
        count(*) filter(where created_at<=now()-interval '8 days') as retention_eligible,
        count(*) filter(where created_at<=now()-interval '8 days' and exists(select 1 from huddle_ops.activity a where a.user_id=cohort.id and a.day between (cohort.created_at at time zone 'Asia/Taipei')::date+6 and (cohort.created_at at time zone 'Asia/Taipei')::date+8)) as retained,
        count(*) filter(where exists(select 1 from public.billing_entitlements b where b.user_id=cohort.id and b.expires_at>now())) as paid
      from cohort group by channel order by channel
    ) q),'[]');
  elsif p_action='admin_settings' then
    update huddle_ops.settings set gifts_enabled=(p_data->>'gifts_enabled')::boolean,
      trial_enabled=(p_data->>'trial_enabled')::boolean,trial_days=(p_data->>'trial_days')::integer,
      coupons_enabled=(p_data->>'coupons_enabled')::boolean,referrals_enabled=(p_data->>'referrals_enabled')::boolean,
      referral_days=(p_data->>'referral_days')::integer,friend_days=(p_data->>'friend_days')::integer,
      annual_reward_cap=(p_data->>'annual_reward_cap')::integer,leaderboard_enabled=(p_data->>'leaderboard_enabled')::boolean,
      reminder_enabled=coalesce((p_data->>'reminder_enabled')::boolean,false),reminder_days=coalesce((p_data->>'reminder_days')::integer,3),updated_at=now() where id;
  elsif p_action='admin_coupon' then
    if p_data->>'audience'='specific' and not exists(select 1 from auth.users where id=nullif(p_data->>'target_user_id','')::uuid) then raise exception '請選擇有效的指定會員'; end if;
    v_code:=upper(btrim(p_data->>'code'));
    insert into huddle_ops.coupons(code,name,days,audience,target_user_id,max_uses,starts_at,expires_at,stackable,notes)
      values(v_code,btrim(p_data->>'name'),(p_data->>'days')::integer,p_data->>'audience',nullif(p_data->>'target_user_id','')::uuid,
      (p_data->>'max_uses')::integer,(p_data->>'starts_at')::timestamptz,(p_data->>'expires_at')::timestamptz,coalesce((p_data->>'stackable')::boolean,false),left(coalesce(p_data->>'notes',''),500));
  elsif p_action='admin_update_coupon' then
    if p_data->>'audience'='specific' and not exists(select 1 from auth.users where id=nullif(p_data->>'target_user_id','')::uuid) then raise exception '請選擇有效的指定會員'; end if;
    select * into v_coupon from huddle_ops.coupons where id=(p_data->>'id')::uuid for update;
    if not found then raise exception '找不到優惠碼'; end if;
    if (p_data->>'max_uses')::integer < (select count(*) from huddle_ops.redemptions where coupon_id=v_coupon.id) then raise exception '名額不能少於已兌換人數'; end if;
    update huddle_ops.coupons set name=btrim(p_data->>'name'),days=(p_data->>'days')::integer,
      audience=p_data->>'audience',target_user_id=nullif(p_data->>'target_user_id','')::uuid,
      max_uses=(p_data->>'max_uses')::integer,starts_at=(p_data->>'starts_at')::timestamptz,
      expires_at=(p_data->>'expires_at')::timestamptz,stackable=(p_data->>'stackable')::boolean,
      notes=left(coalesce(p_data->>'notes',''),500) where id=v_coupon.id;
  elsif p_action='admin_toggle_coupon' then
    update huddle_ops.coupons set enabled=(p_data->>'enabled')::boolean where id=(p_data->>'id')::uuid;
    if not found then raise exception '找不到優惠碼'; end if;
  elsif p_action='admin_grant' then
    if not s.gifts_enabled then raise exception '請先開啟手動贈送'; end if;
    target:=(p_data->>'user_id')::uuid; v_reason:=btrim(p_data->>'reason');
    if v_reason is null or char_length(v_reason) not between 2 and 500 then raise exception '請填寫贈送原因'; end if;
    if (p_data->>'request_id') is null then raise exception '缺少操作識別碼'; end if;
    insert into huddle_ops.members(user_id,alias) values(target,'旅人 '||substr(target::text,1,8)) on conflict do nothing;
    perform huddle_ops.give_days(target,(p_data->>'days')::integer,'manual','manual:'||(p_data->>'request_id')::uuid,v_reason);
  elsif p_action='admin_revoke' then
    v_reason:=btrim(p_data->>'reason');
    if v_reason is null or char_length(v_reason) not between 2 and 500 then raise exception '請填寫撤銷原因'; end if;
    gid:=(p_data->>'id')::uuid;
    select user_id into target from huddle_ops.grants where id=gid;
    perform 1 from huddle_ops.members where user_id=target for update;
    update huddle_ops.grants set revoked_at=now(),revoked_reason=v_reason where id=gid and revoked_at is null;
    if not found then raise exception '找不到可撤銷的贈送紀錄'; end if;
    update huddle_ops.referrals set status='revoked' where grant_id=gid;
    cursor_at:=greatest(now(),(select expires_at from public.billing_entitlements where user_id=target));
    for v_grant in select * from huddle_ops.grants where user_id=target and revoked_at is null and expires_at>now() order by starts_at,id loop
      remaining:=v_grant.expires_at-greatest(v_grant.starts_at,now());
      update huddle_ops.grants set starts_at=cursor_at,expires_at=cursor_at+remaining where id=v_grant.id;
      cursor_at:=cursor_at+remaining;
    end loop;
  elsif p_action='admin_referral' then
    v_reason:=btrim(p_data->>'reason');
    if v_reason is null or char_length(v_reason) not between 2 and 500 then raise exception '請填寫撤銷原因'; end if;
    select grant_id,referred_id into gid,target from huddle_ops.referrals where id=(p_data->>'id')::uuid and status='valid';
    if not found then raise exception '找不到有效推薦紀錄'; end if;
    if gid is not null and exists(select 1 from huddle_ops.grants where id=gid and revoked_at is null) then
      perform huddle_ops.dispatch('admin_revoke',jsonb_build_object('id',gid,'reason',v_reason));
    end if;
    select id into gid from huddle_ops.grants where source_key='friend:'||target and revoked_at is null;
    if gid is not null then perform huddle_ops.dispatch('admin_revoke',jsonb_build_object('id',gid,'reason',v_reason)); end if;
    update huddle_ops.referrals set status='revoked' where id=(p_data->>'id')::uuid;
  elsif p_action='admin_suspend' then
    target:=(p_data->>'user_id')::uuid; v_reason:=btrim(p_data->>'reason');
    if target=u then raise exception '不能停用自己的帳號'; end if;
    if v_reason is null or char_length(v_reason) not between 2 and 500 then raise exception '請填寫操作原因'; end if;
    insert into huddle_ops.members(user_id,alias,suspended) values(target,'旅人 '||substr(target::text,1,8),(p_data->>'suspended')::boolean)
      on conflict(user_id) do update set suspended=excluded.suspended;
  elsif p_action='admin_overview' then
    return jsonb_build_object(
      'members',(select count(*) from auth.users),
      'new_30',(select count(*) from auth.users where created_at>=now()-interval '30 days'),
      'dau',(select count(distinct user_id) from huddle_ops.activity where day=(now() at time zone 'Asia/Taipei')::date),
      'wau',(select count(distinct user_id) from huddle_ops.activity where day>=(now() at time zone 'Asia/Taipei')::date-6),
      'mau',(select count(distinct user_id) from huddle_ops.activity where day>=(now() at time zone 'Asia/Taipei')::date-29),
      'paid',(select count(*) from public.billing_entitlements where expires_at>now()),
      'gifted',(select count(distinct user_id) from huddle_ops.grants g where revoked_at is null and expires_at>now() and not exists(select 1 from public.billing_entitlements b where b.user_id=g.user_id and b.expires_at>now())),
      'referrals',(select count(*) from huddle_ops.referrals where status='valid'),
      'redemptions',(select count(*) from huddle_ops.redemptions),
      'ended_trials',(select count(distinct user_id) from huddle_ops.grants where source='trial' and revoked_at is null and expires_at<=now()),
      'converted_trials',(select count(distinct g.user_id) from huddle_ops.grants g join public.billing_entitlements b using(user_id) where g.source='trial' and g.revoked_at is null and g.expires_at<=now() and b.expires_at>now()),
      'settings',to_jsonb(s));
  elsif p_action='admin_members' then
    return coalesce((select jsonb_agg(to_jsonb(q)) from (
      select au.id,au.email,au.created_at,mm.alias,coalesce(mm.suspended,false) as suspended,
        (select max(last_at) from huddle_ops.activity where user_id=au.id) as last_active,
        (select expires_at from public.billing_entitlements where user_id=au.id) as paid_until,
        (select max(expires_at) from huddle_ops.grants where user_id=au.id and revoked_at is null) as gift_until,
        (select count(*) from huddle_ops.referrals where referrer_id=au.id and status='valid') as referrals
      from auth.users au left join huddle_ops.members mm on mm.user_id=au.id
      where coalesce(au.email,'') ilike '%'||left(coalesce(p_data->>'search',''),100)||'%' or mm.alias ilike '%'||left(coalesce(p_data->>'search',''),100)||'%'
      order by au.created_at desc,au.id limit 50 offset off
    ) q),'[]');
  elsif p_action='admin_member' then
    target:=(p_data->>'user_id')::uuid;
    return jsonb_build_object('grants',coalesce((select jsonb_agg(to_jsonb(q)) from (select * from huddle_ops.grants where user_id=target order by created_at desc limit 100) q),'[]'),
      'referrer',(select mm.alias from huddle_ops.referrals r join huddle_ops.members mm on mm.user_id=r.referrer_id where r.referred_id=target),
      'referrals',coalesce((select jsonb_agg(to_jsonb(q)) from (select id,referred_id,reward_days,status,created_at from huddle_ops.referrals where referrer_id=target order by created_at desc limit 100) q),'[]'));
  elsif p_action='admin_coupons' then
    return coalesce((select jsonb_agg(to_jsonb(q)) from (
      select coupon_row.*,(select count(*) from huddle_ops.redemptions where coupon_id=coupon_row.id) as used,
      (select count(distinct r.user_id) from huddle_ops.redemptions r join huddle_ops.activity ac on ac.user_id=r.user_id where r.coupon_id=coupon_row.id and ac.day>=greatest((r.created_at at time zone 'Asia/Taipei')::date,(now() at time zone 'Asia/Taipei')::date-6)) as active,
      (select count(*) from huddle_ops.redemptions r join public.billing_entitlements b on b.user_id=r.user_id where r.coupon_id=coupon_row.id and b.expires_at>now() and b.observed_at_ms>=extract(epoch from r.created_at)*1000) as paid
      from huddle_ops.coupons coupon_row order by created_at desc limit 50 offset off
    ) q),'[]');
  elsif p_action='admin_redemptions' then
    return coalesce((select jsonb_agg(to_jsonb(q)) from (select r.user_id,au.email,mm.alias,r.created_at from huddle_ops.redemptions r join auth.users au on au.id=r.user_id left join huddle_ops.members mm on mm.user_id=r.user_id where coupon_id=(p_data->>'id')::uuid order by r.created_at desc limit 50 offset off) q),'[]');
  elsif p_action='admin_referrals' then
    return coalesce((select jsonb_agg(to_jsonb(q)) from (select r.*,mm.alias as referrer,nn.alias as friend from huddle_ops.referrals r join huddle_ops.members mm on mm.user_id=r.referrer_id join huddle_ops.members nn on nn.user_id=r.referred_id order by r.created_at desc limit 50 offset off) q),'[]');
  elsif p_action='admin_billing' then
    return coalesce((select jsonb_agg(to_jsonb(q)) from (select b.user_id,au.email,b.entitlement,b.expires_at,b.observed_at_ms from public.billing_entitlements b join auth.users au on au.id=b.user_id order by observed_at_ms desc limit 50 offset off) q),'[]');
  elsif p_action='admin_audit' then
    return coalesce((select jsonb_agg(to_jsonb(q)) from (select * from huddle_ops.audit order by id desc limit 50 offset off) q),'[]');
  else raise exception '不支援的操作'; end if;
  if p_action like 'admin_%' then
    insert into huddle_ops.audit(actor_id,action,target,detail) values(u,p_action,coalesce(p_data->>'user_id',p_data->>'id',p_data->>'code'),p_data);
  end if;
  return jsonb_build_object('message','已儲存');
end $$;

-- Meeting, check-in and meeting-import entry points: suspension guard added.
CREATE OR REPLACE FUNCTION public.claim_daily_check_in()
 RETURNS TABLE(check_in_date date, checked_in boolean, total_points bigint, daily_points integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_day date := (statement_timestamp() at time zone 'Asia/Taipei')::date;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
 if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
  insert into public.daily_check_ins(user_id, check_in_date) values (v_user, v_day)
    on conflict on constraint daily_check_ins_pkey do nothing;
  insert into public.points_ledger(user_id, kind, source_key, points_delta, check_in_date, description)
    values (v_user, 'daily_check_in', 'daily_check_in:' || v_day::text, 1, v_day, '每日簽到')
    on conflict (user_id, source_key) do nothing;
  return query select s.* from public.get_daily_check_in_status() s;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_check_in_leaderboard()
 RETURNS TABLE(rank_position bigint, penguin_alias text, total_points bigint, is_current_user boolean, in_top_50 boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare viewer uuid := auth.uid();
begin
  if viewer is null then raise exception 'Authentication required' using errcode = '42501'; end if;
 if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
  return query
  with ranked as (
    select a.user_id, a.total_points,
      rank() over (order by a.total_points desc) as standing,
      row_number() over (order by a.total_points desc, a.user_id) as row_index
    from public.points_accounts a where a.total_points > 0
  ), visible as (
    select r.standing, r.user_id, r.total_points, r.row_index <= 50 as listed
    from ranked r where r.row_index <= 50 or r.user_id = viewer
    union all
    select null::bigint, viewer, 0::bigint, false
    where not exists (select 1 from ranked r where r.user_id = viewer)
  )
  select v.standing, substr(md5(v.user_id::text), 1, 12), v.total_points,
    v.user_id = viewer, v.listed
  from visible v order by v.standing nulls last, v.user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.import_meeting_tasks(p_user uuid, p_id uuid, p_category uuid, p_tasks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.meeting_imports; c public.categories; w public.workspaces; item jsonb;
  idx integer; task_id uuid; mapping jsonb; source text;
begin
  if not huddle_ops.access_allowed(p_user) then raise exception 'ACCOUNT_SUSPENDED' using errcode='42501'; end if;
  select * into r from public.meeting_imports where id=p_id and user_id=p_user and status='succeeded' for update;
  if not found then raise exception 'MEETING_NOT_FOUND'; end if;
  select * into c from public.categories where id=p_category and user_id=p_user and not is_archived;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  select * into w from public.workspaces where id=c.workspace_id and user_id=p_user and not is_archived;
  if not found then raise exception 'WORKSPACE_NOT_FOUND'; end if;
  if jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) not between 1 and 20 then raise exception 'INVALID_TASKS'; end if;
  mapping := r.imported_tasks;
  for item in select value from jsonb_array_elements(p_tasks) loop
    idx := (item->>'index')::integer;
    if idx is null or idx < 0 or idx >= jsonb_array_length(r.result->'tasks') then raise exception 'INVALID_INDEX'; end if;
    if mapping ? idx::text then continue; end if;
    if coalesce(char_length(trim(item->>'title')),0) not between 1 and 200
      or coalesce(char_length(item->>'owner'),0)>100 then raise exception 'INVALID_TASK'; end if;
    source := r.result->'tasks'->idx->>'source';
    task_id := gen_random_uuid();
    insert into public.tasks(id,user_id,workspace_id,category_id,title,description,due_date,calendar_color)
    values(task_id,p_user,w.id,c.id,trim(item->>'title'),
      '會議：'||r.title||'（'||r.meeting_date::text||'）'||E'\n負責人（文字備註）：'||coalesce(nullif(trim(item->>'owner'),''),'待確認')||E'\n來源原文：'||source,
      nullif(item->>'dueDate','')::date,w.color);
    mapping := mapping || jsonb_build_object(idx::text,task_id);
  end loop;
  update public.meeting_imports set imported_tasks=mapping where id=p_id;
  return mapping;
end $function$
;

CREATE OR REPLACE FUNCTION public.reserve_meeting_import(p_user uuid, p_id uuid, p_title text, p_date date, p_transcript text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.meeting_imports; m date := date_trunc('month', now() at time zone 'Asia/Taipei')::date;
begin
  if not huddle_ops.access_allowed(p_user) then raise exception 'ACCOUNT_SUSPENDED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 726));
  update public.meeting_imports set status='failed', finished_at=now()
    where user_id=p_user and status='pending' and created_at < now()-interval '5 minutes';
  select * into r from public.meeting_imports where id=p_id;
  if found then
    if r.user_id <> p_user or r.transcript <> p_transcript or r.title <> p_title or r.meeting_date <> p_date then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return jsonb_build_object('claimed',false,'meeting',to_jsonb(r));
  end if;
  if (select count(*) from public.meeting_imports where user_id=p_user and month=m and status in ('pending','succeeded')) >= 20 then
    raise exception 'MONTHLY_LIMIT';
  end if;
  if (select count(*) from public.meeting_imports where user_id=p_user and created_at>now()-interval '1 hour') >= 30 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into public.meeting_imports(id,user_id,title,meeting_date,transcript) values(p_id,p_user,p_title,p_date,p_transcript) returning * into r;
  return jsonb_build_object('claimed',true,'meeting',to_jsonb(r));
end $function$
;

CREATE OR REPLACE FUNCTION public.reserve_meeting_import_v2(p_user uuid, p_id uuid, p_title text, p_date date, p_transcript text, p_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare reservation jsonb; old_context jsonb;
begin
  if not huddle_ops.access_allowed(p_user) then raise exception 'ACCOUNT_SUSPENDED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,726));
  select context into old_context from public.meeting_imports where id=p_id and user_id=p_user;
  if found and old_context<>p_context then raise exception 'REQUEST_CONFLICT'; end if;
  reservation:=public.reserve_meeting_import(p_user,p_id,p_title,p_date,p_transcript);
  if (reservation->>'claimed')::boolean then
    update public.meeting_imports set context=p_context where id=p_id and user_id=p_user;
  end if;
  return reservation;
end $function$
;

CREATE OR REPLACE FUNCTION public.respond_meeting_assignment(p_user uuid, p_id uuid, p_accept boolean, p_category uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.meeting_task_assignments; c public.categories; w public.workspaces; v_task_id uuid;
begin
  if not huddle_ops.access_allowed(p_user) then raise exception 'ACCOUNT_SUSPENDED' using errcode='42501'; end if;
  select * into a from public.meeting_task_assignments where id=p_id and recipient_id=p_user for update;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  if a.status<>'pending' then return to_jsonb(a); end if;
  if p_accept then
    select * into c from public.categories where id=p_category and user_id=p_user and not is_archived;
    if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
    select * into w from public.workspaces where id=c.workspace_id and user_id=p_user and not is_archived;
    if not found then raise exception 'WORKSPACE_NOT_FOUND'; end if;
    perform 1 from public.calendar_shares where user_lo=least(a.sender_id,p_user) and user_hi=greatest(a.sender_id,p_user) for share;
    if not found then raise exception 'RECIPIENT_NOT_CONNECTED'; end if;
    insert into public.tasks(user_id,workspace_id,category_id,title,due_date,description,calendar_color)
    values(p_user,w.id,c.id,a.title,a.due_date,'指派人：'||a.sender_name||E'\n會議：'||a.meeting_title||'（'||a.meeting_date::text||'）'||E'\n來源原文：'||a.source,w.color)
    returning id into v_task_id;
  end if;
  update public.meeting_task_assignments set status=case when p_accept then 'accepted' else 'rejected' end,
    task_id=v_task_id,responded_at=now() where id=p_id returning * into a;
  return to_jsonb(a);
end $function$
;

CREATE OR REPLACE FUNCTION public.route_meeting_tasks(p_user uuid, p_id uuid, p_category uuid, p_tasks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.meeting_imports; item jsonb; idx integer; recipient uuid; assignment uuid;
  edited jsonb; task_map jsonb; sender text;
begin
  if not huddle_ops.access_allowed(p_user) then raise exception 'ACCOUNT_SUSPENDED' using errcode='42501'; end if;
  select * into r from public.meeting_imports where id=p_id and user_id=p_user and status='succeeded' for update;
  if not found then raise exception 'MEETING_NOT_FOUND'; end if;
  if jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks) not between 1 and 20 then raise exception 'INVALID_TASKS'; end if;
  edited:=r.checklist;
  select coalesce(nullif(display_name,''),'Huddle 使用者') into sender from public.profiles where id=p_user;
  for item in select value from jsonb_array_elements(p_tasks) loop
    idx:=(item->>'index')::integer;
    if idx is null or idx<0 or idx>=jsonb_array_length(r.result->'tasks') then raise exception 'INVALID_INDEX'; end if;
    if r.imported_tasks ? idx::text or exists(select 1 from public.meeting_task_assignments where meeting_id=p_id and source_index=idx) then continue; end if;
    if coalesce(char_length(trim(item->>'title')),0) not between 1 and 200 or coalesce(char_length(item->>'owner'),0)>100 then raise exception 'INVALID_TASK'; end if;
    recipient:=nullif(item->>'assigneeId','')::uuid;
    -- Cast even for unassigned drafts so malformed dates never become durable.
    perform nullif(item->>'dueDate','')::date;
    if recipient=p_user then
      task_map:=public.import_meeting_tasks(p_user,p_id,p_category,jsonb_build_array(item));
      r.imported_tasks:=task_map;
    elsif recipient is not null then
      perform 1 from public.calendar_shares where user_lo=least(p_user,recipient) and user_hi=greatest(p_user,recipient) for share;
      if not found then raise exception 'RECIPIENT_NOT_CONNECTED'; end if;
      insert into public.meeting_task_assignments(meeting_id,source_index,sender_id,recipient_id,sender_name,title,due_date,source,meeting_title,meeting_date)
      values(p_id,idx,p_user,recipient,coalesce(sender,'Huddle 使用者'),trim(item->>'title'),nullif(item->>'dueDate','')::date,
        r.result->'tasks'->idx->>'source',r.title,r.meeting_date) returning id into assignment;
    end if;
    edited:=edited||jsonb_build_object(idx::text,item);
  end loop;
  update public.meeting_imports set checklist=edited where id=p_id;
  return jsonb_build_object('importedTasks',r.imported_tasks,'checklist',edited);
end $function$
;

CREATE OR REPLACE FUNCTION meeting_private.cancel(p_meeting_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
 perform 1 from public.meeting_invitations where id=p_meeting_id and organizer_id=u for update;
 if not found then raise exception 'invitation unavailable' using errcode='42501'; end if;
 update public.meeting_invitations set status='cancelled' where id=p_meeting_id;
end $function$
;

CREATE OR REPLACE FUNCTION meeting_private.create_invitation(p_title text, p_description text, p_location text, p_start timestamp with time zone, p_end timestamp with time zone, p_time_zone text, p_invitees uuid[], p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); peers uuid[]; payload jsonb; existing public.meeting_invitations; mid uuid;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
 select array_agg(distinct x order by x) into peers from unnest(p_invitees) x;
 if p_request_id is null or peers is null or cardinality(peers) not between 1 and 10 or array_position(peers,null) is not null or u=any(peers) then raise exception 'invalid invitees or request id' using errcode='22023'; end if;
 if p_title is null or length(trim(p_title)) not between 1 and 200 or length(coalesce(p_description,''))>2000 or length(coalesce(p_location,''))>500 or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end<=p_start or p_end>p_start+interval '24 hours' or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone) then raise exception 'invalid meeting details' using errcode='22023'; end if;
 payload:=jsonb_build_object('title',trim(p_title),'description',coalesce(p_description,''),'location',coalesce(p_location,''),'start',extract(epoch from p_start),'end',extract(epoch from p_end),'time_zone',p_time_zone,'invitees',peers);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||p_request_id::text,0));
 select * into existing from public.meeting_invitations where organizer_id=u and client_request_id=p_request_id;
 if found then
  if existing.request_payload<>payload then raise exception 'request id already used with different details' using errcode='22023'; end if;
  return existing.id;
 end if;
 if p_start<=now() then raise exception 'meeting must start in the future' using errcode='22023'; end if;
 if exists(select 1 from unnest(peers) x where not exists(select 1 from public.calendar_shares s where s.user_lo=least(u,x) and s.user_hi=greatest(u,x))) then raise exception 'invitees must be shared calendar partners' using errcode='42501'; end if;
 insert into public.meeting_invitations(organizer_id,title,description,location,starts_at,ends_at,time_zone,client_request_id,request_payload) values(u,trim(p_title),coalesce(p_description,''),coalesce(p_location,''),p_start,p_end,p_time_zone,p_request_id,payload) returning id into mid;
 insert into public.meeting_attendees(meeting_id,user_id,response) values(mid,u,'accepted');
 insert into public.meeting_attendees(meeting_id,user_id) select mid,x from unnest(peers) x;
 return mid;
end $function$
;

CREATE OR REPLACE FUNCTION meeting_private.get_invitation(p_meeting_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); m public.meeting_invitations; result jsonb;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
 select * into m from public.meeting_invitations i where i.id=p_meeting_id and exists(select 1 from public.meeting_attendees a where a.meeting_id=i.id and a.user_id=u);
 if not found then raise exception 'invitation unavailable' using errcode='42501'; end if;
 select value into result from jsonb_array_elements(meeting_private.list_invitations(m.starts_at,m.ends_at)) where value->>'id'=p_meeting_id::text;
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION meeting_private.get_invitation_by_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); mid uuid;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
 select id into mid from public.meeting_invitations where organizer_id=u and client_request_id=p_request_id;
 if mid is null then return null; end if;
 return meeting_private.get_invitation(mid);
end $function$
;

CREATE OR REPLACE FUNCTION meeting_private.list_invitations(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<=p_from or p_to>p_from+interval '366 days' then raise exception 'invalid range' using errcode='22023'; end if;
 select coalesce(jsonb_agg(rowdata order by starts_at),'[]'::jsonb) into result from (
 select m.starts_at,jsonb_build_object('id',m.id,'organizer_id',m.organizer_id,'title',m.title,'description',m.description,'location',m.location,'starts_at',m.starts_at,'ends_at',m.ends_at,'time_zone',m.time_zone,'status',m.status,'created_at',m.created_at,
 'participants',(select jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',coalesce(p.display_name,'Huddle member'),'response',a.response) order by a.user_id) from public.meeting_attendees a left join public.profiles p on p.id=a.user_id where a.meeting_id=m.id),
 'email_status',case when m.organizer_id=u then (select jsonb_build_object('pending',count(*) filter(where o.status='pending'),'sent',count(*) filter(where o.status='sent'),'failed',count(*) filter(where o.status='failed')) from public.meeting_email_outbox o where o.meeting_id=m.id and o.event_type=case when m.status='cancelled' then 'cancellation' else 'invitation' end) else null end) rowdata
 from public.meeting_invitations m where m.starts_at<p_to and m.ends_at>p_from and exists(select 1 from public.meeting_attendees a where a.meeting_id=m.id and a.user_id=u)
 ) q;
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION meeting_private.list_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
 select jsonb_build_object('unread_count',count(*)) into result
 from public.meeting_notifications where recipient_id=u and read_at is null;
 return result || jsonb_build_object('items',coalesce((select jsonb_agg(rowdata order by created_at desc,id desc) from (
 select n.id,n.created_at,jsonb_build_object('id',n.id,'meeting_id',n.meeting_id,'kind',n.kind,'response',n.response,
 'title',m.title,'actor_name',coalesce(p.display_name,'Huddle member'),'created_at',n.created_at) rowdata
 from public.meeting_notifications n join public.meeting_invitations m on m.id=n.meeting_id
 left join public.profiles p on p.id=n.actor_id
 where n.recipient_id=u and n.read_at is null order by n.created_at desc,n.id desc limit 50
 ) q),'[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION meeting_private.read_notification(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
 update public.meeting_notifications set read_at=coalesce(read_at,now()) where id=p_id and recipient_id=auth.uid();
 if not found then raise exception 'notification unavailable' using errcode='42501'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION meeting_private.respond(p_meeting_id uuid, p_response text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); m public.meeting_invitations;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
 select * into m from public.meeting_invitations where id=p_meeting_id for update;
 if not found or not exists(select 1 from public.meeting_attendees where meeting_id=p_meeting_id and user_id=u) then raise exception 'invitation unavailable' using errcode='42501'; end if;
 if m.status<>'active' or m.organizer_id=u or p_response is null or p_response not in ('accepted','tentative','declined') then raise exception 'invalid response' using errcode='22023'; end if;
 update public.meeting_attendees set response=p_response,updated_at=now() where meeting_id=p_meeting_id and user_id=u;
end $function$
;

CREATE OR REPLACE FUNCTION meeting_private.shared_busy(p_peers uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<=p_from or p_to>p_from+interval '366 days' or p_peers is null or cardinality(p_peers)>11 or array_position(p_peers,null) is not null then raise exception 'invalid range or peers' using errcode='22023'; end if;
 if exists(select 1 from unnest(p_peers) x where x<>u and not exists(select 1 from public.calendar_shares s where s.user_lo=least(u,x) and s.user_hi=greatest(u,x))) then raise exception 'calendar sharing required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'starts_at',m.starts_at,'ends_at',m.ends_at) order by m.starts_at),'[]'::jsonb) into result from public.meeting_attendees a join public.meeting_invitations m on m.id=a.meeting_id where a.user_id=any(p_peers) and (a.user_id=u or exists(select 1 from public.meeting_attendees own where own.meeting_id=m.id and own.user_id=u)) and a.response='accepted' and m.status='active' and m.starts_at<p_to and m.ends_at>p_from;
 return result;
end $function$
;
