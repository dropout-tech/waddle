-- Points are earned only through the server-authoritative check-in RPC.
-- Existing pre-points check-ins are retained; no historical points backfill.
begin;

create table public.points_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_points bigint not null default 0 check (total_points >= 0),
  updated_at timestamptz not null default now()
);
create index points_accounts_ranking_idx on public.points_accounts (total_points desc, user_id);

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind = 'daily_check_in'),
  source_key text not null check (length(source_key) between 1 and 200),
  points_delta bigint not null check (points_delta > 0),
  check_in_date date not null,
  description text not null,
  created_at timestamptz not null default now(),
  unique (user_id, source_key),
  unique (user_id, check_in_date),
  foreign key (user_id, check_in_date) references public.daily_check_ins(user_id, check_in_date) on delete cascade
);
create index points_ledger_user_created_idx on public.points_ledger (user_id, created_at desc, id);

alter table public.points_accounts enable row level security;
alter table public.points_ledger enable row level security;
revoke all on public.points_accounts, public.points_ledger from public, anon, authenticated, service_role;
grant select on public.points_accounts, public.points_ledger to authenticated, service_role;
-- Only the check-in RPC appends score events; no spend, refund, or adjustment API.
create policy points_accounts_read_own on public.points_accounts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy points_ledger_read_own on public.points_ledger for select to authenticated
  using ((select auth.uid()) = user_id);

-- The atomic UPDATE keeps the cumulative score in sync with each awarded event.
create function public.apply_points_ledger_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.points_accounts(user_id) values (new.user_id) on conflict do nothing;
  update public.points_accounts set
    total_points = total_points + new.points_delta,
    updated_at = now()
  where user_id = new.user_id;
  return new;
end;
$$;
revoke all on function public.apply_points_ledger_entry() from public, anon, authenticated, service_role;
create trigger apply_points_ledger_entry after insert on public.points_ledger
  for each row execute function public.apply_points_ledger_entry();

-- A client may read its own status, but cannot choose a date or amount.
create function public.get_daily_check_in_status()
returns table(check_in_date date, checked_in boolean, total_points bigint, daily_points integer)
language sql stable security invoker set search_path = '' as $$
  select
    (statement_timestamp() at time zone 'Asia/Taipei')::date,
    exists(select 1 from public.points_ledger l where l.user_id = (select auth.uid())
      and l.kind = 'daily_check_in'
      and l.check_in_date = (statement_timestamp() at time zone 'Asia/Taipei')::date),
    coalesce(a.total_points, 0), 1
  from (select auth.uid() as user_id) u
  left join public.points_accounts a on a.user_id = u.user_id
  where u.user_id is not null;
$$;
revoke all on function public.get_daily_check_in_status() from public, anon;
grant execute on function public.get_daily_check_in_status() to authenticated;

-- Definer is intentional: clients have no table write privileges. The only
-- writable identity is auth.uid(), and the date/award are computed here.
create function public.claim_daily_check_in()
returns table(check_in_date date, checked_in boolean, total_points bigint, daily_points integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_day date := (statement_timestamp() at time zone 'Asia/Taipei')::date;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.daily_check_ins(user_id, check_in_date) values (v_user, v_day)
    on conflict on constraint daily_check_ins_pkey do nothing;
  insert into public.points_ledger(user_id, kind, source_key, points_delta, check_in_date, description)
    values (v_user, 'daily_check_in', 'daily_check_in:' || v_day::text, 1, v_day, '每日簽到')
    on conflict (user_id, source_key) do nothing;
  return query select s.* from public.get_daily_check_in_status() s;
end;
$$;
revoke all on function public.claim_daily_check_in() from public, anon;
grant execute on function public.claim_daily_check_in() to authenticated;

-- Close the old arbitrary-date insertion route (including old app versions).
revoke insert, update, delete on public.daily_check_ins from authenticated;
drop policy daily_check_ins_insert_own on public.daily_check_ins;
comment on table public.points_ledger is 'Positive daily check-in score events only. No monetary value or redemption. No historical automatic backfill.';
comment on table public.points_accounts is 'Cumulative score, indexed for future ranking, not publicly exposed.';
commit;
