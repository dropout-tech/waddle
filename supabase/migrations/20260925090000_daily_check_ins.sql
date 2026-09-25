-- Manual check-ins are separate from historic, automatically earned footprints.
create table public.daily_check_ins (
  user_id uuid not null references auth.users(id) on delete cascade,
  check_in_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, check_in_date)
);

alter table public.daily_check_ins enable row level security;
revoke all on public.daily_check_ins from anon, authenticated;
grant select, insert on public.daily_check_ins to authenticated;

create policy "daily_check_ins_select_own" on public.daily_check_ins
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "daily_check_ins_insert_own" on public.daily_check_ins
  for insert to authenticated with check ((select auth.uid()) = user_id);

comment on table public.daily_check_ins is
  'Explicit daily check-ins using the user local calendar date; one per account per day.';
