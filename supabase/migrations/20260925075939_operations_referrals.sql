-- Operations data stays outside the exposed API schema. Only authenticated,
-- explicitly authorized functions can mutate rewards or inspect other members.
create schema if not exists huddle_ops;
revoke all on schema huddle_ops from public, anon, authenticated;
grant usage on schema huddle_ops to authenticated;
alter default privileges in schema huddle_ops revoke execute on functions from public;

create table huddle_ops.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table huddle_ops.settings (
  id boolean primary key default true check(id),
  launched_at timestamptz not null default now(),
  gifts_enabled boolean not null default false,
  trial_enabled boolean not null default false,
  trial_days integer not null default 14 check(trial_days between 1 and 365),
  coupons_enabled boolean not null default false,
  referrals_enabled boolean not null default false,
  referral_days integer not null default 30 check(referral_days between 1 and 365),
  friend_days integer not null default 30 check(friend_days between 0 and 365),
  annual_reward_cap integer not null default 360 check(annual_reward_cap between 0 and 3650),
  leaderboard_enabled boolean not null default true,
  reminder_enabled boolean not null default false,
  reminder_days integer not null default 3 check(reminder_days between 1 and 30),
  updated_at timestamptz not null default now()
);
insert into huddle_ops.settings(id) values(true);
create table huddle_ops.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  alias text not null check(char_length(alias) between 2 and 24),
  referral_code text unique,
  leaderboard_visible boolean not null default false,
  suspended boolean not null default false,
  trial_checked boolean not null default false,
  created_at timestamptz not null default now()
);
create table huddle_ops.grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  days integer not null check(days between 1 and 3650),
  source text not null check(source in ('trial','coupon','referral','friend','manual')),
  source_key text not null unique,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  reason text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text
);
create index on huddle_ops.grants(user_id, expires_at);
create table huddle_ops.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^[A-Z0-9][A-Z0-9_-]{3,31}$'),
  name text not null check(char_length(name) between 1 and 80),
  days integer not null check(days between 1 and 365),
  audience text not null check(audience in ('all','new','existing','specific')),
  target_user_id uuid references auth.users(id) on delete set null,
  max_uses integer not null check(max_uses between 1 and 1000000),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stackable boolean not null default false,
  enabled boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  check(expires_at > starts_at),
  check(audience='specific' or target_user_id is null)
);
create table huddle_ops.redemptions (
  coupon_id uuid not null references huddle_ops.coupons(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid not null references huddle_ops.grants(id),
  created_at timestamptz not null default now(),
  primary key(coupon_id,user_id)
);
create table huddle_ops.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null unique references auth.users(id) on delete cascade,
  reward_days integer not null,
  grant_id uuid references huddle_ops.grants(id),
  status text not null default 'valid' check(status in ('valid','revoked')),
  created_at timestamptz not null default now(),
  check(referrer_id <> referred_id)
);
create index on huddle_ops.referrals(referrer_id,created_at);
create table huddle_ops.activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default ((now() at time zone 'Asia/Taipei')::date),
  kind text not null,
  last_at timestamptz not null default now(),
  primary key(user_id,day,kind)
);
create table huddle_ops.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check(char_length(title) between 1 and 100),
  body text not null check(char_length(body) between 1 and 2000),
  kind text not null default 'notice' check(kind in ('notice','maintenance')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  check(expires_at>starts_at)
);
create table huddle_ops.audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
-- Private tables also have RLS for defense in depth. No browser table grants.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='huddle_ops' loop
    execute format('alter table huddle_ops.%I enable row level security',t.tablename);
    execute format('revoke all on huddle_ops.%I from public, anon, authenticated',t.tablename);
  end loop;
end $$;

-- Internal writer; not executable by API roles. Callers lock the member row.
create function huddle_ops.give_days(u uuid, d integer, src text, k text, why text)
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

create function huddle_ops.access_allowed() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid())
    and not exists(select 1 from huddle_ops.members where user_id=auth.uid() and suspended)
$$;
grant execute on function huddle_ops.access_allowed() to authenticated;
-- Restrictive policies compose with incumbent ownership/sharing policies.
do $$ declare t record; begin
  for t in select distinct table_name from information_schema.columns
    where table_schema='public' and column_name='user_id' loop
    execute format('create policy operations_account_active on public.%I as restrictive for all to authenticated using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()))',t.table_name);
  end loop;
end $$;

create function huddle_ops.record_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and new.user_id=auth.uid() and huddle_ops.access_allowed() then
    insert into huddle_ops.activity(user_id,kind) values(new.user_id,TG_TABLE_NAME)
      on conflict(user_id,day,kind) do update set last_at=now();
  end if;
  return new;
end $$;
create trigger operations_task_activity after insert or update on public.tasks for each row execute function huddle_ops.record_activity();
create trigger operations_time_activity after insert or update on public.time_blocks for each row execute function huddle_ops.record_activity();

-- Move unspent gift time behind incoming paid coverage. Store billing itself
-- remains authoritative: gifts never claim to change an App Store renewal date.
create function huddle_ops.defer_gifts() returns trigger language plpgsql security definer set search_path='' as $$
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
create trigger operations_defer_gifts after insert or update on public.billing_entitlements for each row execute function huddle_ops.defer_gifts();

-- One narrow RPC dispatcher: all identities come from auth.uid(), never payload.
create function huddle_ops.dispatch(p_action text, p_data jsonb default '{}') returns jsonb
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
  select exists(select 1 from huddle_ops.admins where user_id=u) into admin;
  if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode='42501'; end if;
  select * into s from huddle_ops.settings where id=true;
  select created_at into user_created from auth.users where id=u;
  insert into huddle_ops.members(user_id,alias) values(u,'旅人 '||upper(substr(replace(u::text,'-',''),1,8))) on conflict do nothing;
  -- All promotional writes take settings first, then member locks. Serializes
  -- cap checks, coupon quotas and double-click/retry across different sessions.
  if p_action in ('redeem','refer','admin_coupon','admin_update_coupon','admin_toggle_coupon','admin_settings','admin_grant','admin_revoke','admin_referral','self') then
    select * into s from huddle_ops.settings where id=true for update;
  end if;
  select * into m from huddle_ops.members where user_id=u;
  if p_action like 'admin_%' and not admin then raise exception '此帳號沒有營運後台權限' using errcode='42501'; end if;

  if p_action='self' then
    if not m.trial_checked then
      update huddle_ops.members set trial_checked=true where user_id=u;
      if s.trial_enabled and user_created>=s.launched_at and user_created>now()-interval '7 days' then
        perform huddle_ops.give_days(u,s.trial_days,'trial','trial:'||u,'新戶體驗');
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
    v_code:=upper(btrim(p_data->>'code'));
    select * into v_coupon from huddle_ops.coupons where coupons.code=v_code for update;
    if not found then raise exception '優惠碼不存在'; end if;
    if exists(select 1 from huddle_ops.redemptions where coupon_id=v_coupon.id and user_id=u) then return jsonb_build_object('message','這個優惠碼已兌換過，時間不會重複發放'); end if;
    if not v_coupon.enabled or now()<v_coupon.starts_at or now()>=v_coupon.expires_at then raise exception '優惠碼尚未開始、已過期或已停用'; end if;
    if (select count(*) from huddle_ops.redemptions where coupon_id=v_coupon.id)>=v_coupon.max_uses then raise exception '優惠碼名額已滿'; end if;
    if (v_coupon.audience='new' and user_created<now()-interval '7 days') or (v_coupon.audience='existing' and user_created>=v_coupon.created_at) or (v_coupon.audience='specific' and v_coupon.target_user_id is distinct from u) then raise exception '此優惠碼不適用於你的帳號'; end if;
    if not v_coupon.stackable and exists(select 1 from huddle_ops.grants where user_id=u and source in ('coupon','friend') and revoked_at is null and expires_at>now()) then raise exception '此優惠不能與尚未到期的活動或推薦體驗疊加'; end if;
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
revoke all on function huddle_ops.dispatch(text,jsonb) from public,anon,authenticated;
grant execute on function huddle_ops.dispatch(text,jsonb) to authenticated;
create function public.huddle_operations(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select huddle_ops.dispatch(p_action,p_data) $$;
revoke all on function public.huddle_operations(text,jsonb) from public,anon,authenticated;
grant execute on function public.huddle_operations(text,jsonb) to authenticated;
-- Explicit revocation is required even if a global default ACL still grants
-- function execution to PUBLIC (schema-level defaults cannot subtract it).
revoke all on all functions in schema huddle_ops from public, anon, authenticated;
grant execute on function huddle_ops.access_allowed() to authenticated;
grant execute on function huddle_ops.dispatch(text,jsonb) to authenticated;

-- Existing sharing endpoints intentionally bypass RLS for cross-account reads;
-- suspension must therefore also be enforced at their authenticated entry point.
do $$ declare f record; definition text; begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('create_share_invite','preview_share_invite','accept_share_invite','get_share_peers','get_shared_calendar') loop
    definition:=pg_get_functiondef(f.oid);
    if position('if v_uid is null then' in lower(definition))=0 then
      raise exception 'Sharing auth guard changed; review suspension integration before migrating';
    end if;
    execute regexp_replace(definition,'if v_uid is null then','if v_uid is null or not huddle_ops.access_allowed() then','i');
  end loop;
end $$;
do $$ declare t text; begin
  foreach t in array array['public.profiles','public.calendar_share_invites','public.calendar_shares','public.calendar_share_grants','storage.objects'] loop
    if to_regclass(t) is not null then
      execute format('create policy operations_account_active on %s as restrictive for all to authenticated using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()))',t);
    end if;
  end loop;
end $$;
