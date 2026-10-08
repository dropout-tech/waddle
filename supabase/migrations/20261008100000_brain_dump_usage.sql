-- 丟給企鵝 (brain-dump Edge Function): daily AI usage per member.
--
-- Nothing the member types is stored — only how many AI splits they used on
-- a given day and an estimated cost for the owner.
--   * DAILY_LIMIT  free members: 20 splits per day (the member's local date,
--                  accepted only within ±1 day of Asia/Taipei). Pro members
--                  (huddle_ops.has_pro — paid entitlement or unrevoked grant,
--                  independent of the limits_enforced switch) have no daily cap.
--   * RATE_LIMIT   everyone, Pro too: at most 8 calls per rolling minute
--                  (anti-abuse; a person typing never gets near it).
--   * AI_PAUSED    site-wide fuse: at most huddle_ops.settings.brain_dump_daily_cap
--                  calls per day for all members together. 0 = kill switch.
-- A failed generation is refunded by the Edge Function (refund_brain_dump),
-- so the member only spends a try when they get AI results.
-- All functions are service_role only (called by the Edge Function).
-- Rollback: supabase/rollback/20261008100000_brain_dump_usage_down.sql

set lock_timeout = '5s';
set statement_timeout = '60s';

create table public.brain_dump_usage (
  user_id      uuid not null references auth.users(id) on delete cascade,
  day          date not null,
  calls        integer not null default 0 check (calls >= 0),
  cost_usd     numeric(12, 6) not null default 0 check (cost_usd >= 0),
  window_start timestamptz not null default now(),
  window_calls integer not null default 0 check (window_calls >= 0),
  updated_at   timestamptz not null default now(),
  primary key (user_id, day)
);
create index brain_dump_usage_day_idx on public.brain_dump_usage(day);

alter table public.brain_dump_usage enable row level security;
create policy brain_dump_usage_read_own on public.brain_dump_usage for select to authenticated
  using (user_id = (select auth.uid()));
create policy operations_account_active on public.brain_dump_usage as restrictive for all to authenticated
  using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()));
revoke all on public.brain_dump_usage from public, anon, authenticated, service_role;
grant select on public.brain_dump_usage to authenticated;
grant select, insert, update on public.brain_dump_usage to service_role;

alter table huddle_ops.settings
  add column if not exists brain_dump_daily_cap integer not null default 3000
    check (brain_dump_daily_cap between 0 and 1000000);

-- The member's day must be "today" somewhere reasonable: Taipei ±1.
create function huddle_ops.brain_dump_day_ok(p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_day is not null and abs(p_day - (now() at time zone 'Asia/Taipei')::date) <= 1
$$;

create function public.reserve_brain_dump(p_user uuid, p_day date) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row   public.brain_dump_usage;
  v_pro   boolean;
  v_cap   integer;
  v_limit constant integer := 20;
begin
  if p_user is null or not huddle_ops.brain_dump_day_ok(p_day) then
    raise exception 'INVALID_INPUT';
  end if;
  select s.brain_dump_daily_cap into v_cap from huddle_ops.settings s where s.id;
  if coalesce(v_cap, 0) <= 0 then
    raise exception 'AI_PAUSED';
  end if;
  v_pro := huddle_ops.has_pro(p_user);

  insert into public.brain_dump_usage(user_id, day) values (p_user, p_day)
    on conflict (user_id, day) do nothing;
  select * into v_row from public.brain_dump_usage u
    where u.user_id = p_user and u.day = p_day for update;

  if v_row.window_start > now() - interval '1 minute' then
    if v_row.window_calls >= 8 then
      raise exception 'RATE_LIMIT';
    end if;
  else
    v_row.window_start := now();
    v_row.window_calls := 0;
  end if;

  if not v_pro and v_row.calls >= v_limit then
    raise exception 'DAILY_LIMIT';
  end if;

  -- Site-wide fuse (one lock so concurrent members can't all take the last slot).
  perform pg_advisory_xact_lock(hashtextextended('brain_dump_daily_cap', 728));
  if (select coalesce(sum(u.calls), 0) from public.brain_dump_usage u where u.day = p_day) >= v_cap then
    raise exception 'AI_PAUSED';
  end if;

  update public.brain_dump_usage u
     set calls = u.calls + 1,
         window_start = v_row.window_start,
         window_calls = v_row.window_calls + 1,
         updated_at = now()
   where u.user_id = p_user and u.day = p_day;

  return jsonb_build_object('used', v_row.calls + 1, 'limit', case when v_pro then null else v_limit end);
end;
$$;

-- The generation failed after reserving: give the try back.
create function public.refund_brain_dump(p_user uuid, p_day date) returns void
language sql volatile security definer set search_path = '' as $$
  update public.brain_dump_usage u
     set calls = greatest(u.calls - 1, 0), updated_at = now()
   where u.user_id = p_user and u.day = p_day
$$;

-- Success: add the estimated OpenAI cost (owner's bookkeeping).
create function public.finish_brain_dump(p_user uuid, p_day date, p_cost numeric) returns void
language sql volatile security definer set search_path = '' as $$
  update public.brain_dump_usage u
     set cost_usd = u.cost_usd + greatest(coalesce(p_cost, 0), 0), updated_at = now()
   where u.user_id = p_user and u.day = p_day
$$;

create function public.brain_dump_status(p_user uuid, p_day date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'used', coalesce((select u.calls from public.brain_dump_usage u where u.user_id = p_user and u.day = p_day), 0),
    'limit', case when huddle_ops.has_pro(p_user) then null else 20 end,
    'enabled', coalesce((select s.brain_dump_daily_cap > 0 from huddle_ops.settings s where s.id), false)
  )
$$;

revoke all on function huddle_ops.brain_dump_day_ok(date) from public, anon, authenticated;
revoke all on function public.reserve_brain_dump(uuid, date) from public, anon, authenticated;
revoke all on function public.refund_brain_dump(uuid, date) from public, anon, authenticated;
revoke all on function public.finish_brain_dump(uuid, date, numeric) from public, anon, authenticated;
revoke all on function public.brain_dump_status(uuid, date) from public, anon, authenticated;
grant execute on function huddle_ops.brain_dump_day_ok(date) to service_role;
grant execute on function public.reserve_brain_dump(uuid, date) to service_role;
grant execute on function public.refund_brain_dump(uuid, date) to service_role;
grant execute on function public.finish_brain_dump(uuid, date, numeric) to service_role;
grant execute on function public.brain_dump_status(uuid, date) to service_role;
