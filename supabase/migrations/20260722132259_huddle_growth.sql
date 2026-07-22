-- Huddle growth journey: gentle daily footprints, achievements, and
-- user-authored 7/14/30-day journeys. All tables are account-scoped and are
-- read directly by the browser client, so grants and RLS are both explicit.

create table public.growth_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  planned_count integer not null default 0 check (planned_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  focus_minutes integer not null default 0 check (focus_minutes >= 0),
  reflection_count integer not null default 0 check (reflection_count >= 0),
  footprint_earned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, activity_date)
);

create index growth_days_user_date_idx
  on public.growth_days(user_id, activity_date desc);

create table public.growth_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null check (char_length(achievement_key) between 1 and 80),
  unlocked_at timestamptz not null default now(),
  progress integer not null default 100 check (progress between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  primary key (user_id, achievement_key)
);

create table public.growth_journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  daily_step text not null check (char_length(btrim(daily_step)) between 1 and 120),
  duration_days smallint not null check (duration_days in (7, 14, 30)),
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index growth_journeys_one_active_idx
  on public.growth_journeys(user_id)
  where status = 'active';

create index growth_journeys_user_created_idx
  on public.growth_journeys(user_id, created_at desc);

create table public.growth_journey_days (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.growth_journeys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  is_complete boolean not null default false,
  note text check (note is null or char_length(note) <= 500),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, journey_id, entry_date)
);

create index growth_journey_days_user_date_idx
  on public.growth_journey_days(user_id, entry_date desc);

grant select, insert, update, delete on table
  public.growth_days,
  public.growth_achievements,
  public.growth_journeys,
  public.growth_journey_days
to authenticated;

alter table public.growth_days enable row level security;
alter table public.growth_achievements enable row level security;
alter table public.growth_journeys enable row level security;
alter table public.growth_journey_days enable row level security;

create policy "growth_days_select_own" on public.growth_days
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "growth_days_insert_own" on public.growth_days
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "growth_days_update_own" on public.growth_days
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "growth_days_delete_own" on public.growth_days
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "growth_achievements_select_own" on public.growth_achievements
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "growth_achievements_insert_own" on public.growth_achievements
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "growth_achievements_update_own" on public.growth_achievements
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "growth_achievements_delete_own" on public.growth_achievements
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "growth_journeys_select_own" on public.growth_journeys
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "growth_journeys_insert_own" on public.growth_journeys
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "growth_journeys_update_own" on public.growth_journeys
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "growth_journeys_delete_own" on public.growth_journeys
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "growth_journey_days_select_own" on public.growth_journey_days
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "growth_journey_days_insert_own" on public.growth_journey_days
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.growth_journeys journey
      where journey.id = growth_journey_days.journey_id
        and journey.user_id = (select auth.uid())
    )
  );
create policy "growth_journey_days_update_own" on public.growth_journey_days
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.growth_journeys journey
      where journey.id = growth_journey_days.journey_id
        and journey.user_id = (select auth.uid())
    )
  );
create policy "growth_journey_days_delete_own" on public.growth_journey_days
  for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.growth_days is
  'One gentle activity snapshot per account and local calendar day.';
comment on table public.growth_achievements is
  'Idempotent Huddle achievement unlocks keyed by stable product identifiers.';
comment on table public.growth_journeys is
  'User-authored 7, 14, or 30-day growth journeys; at most one active per user.';
comment on table public.growth_journey_days is
  'Daily check-ins for a growth journey, kept separate for future agent review.';
