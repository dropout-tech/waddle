-- RevenueCat customers still to delete after their Huddle account is gone (legal review 2026-10-02:
-- an outage at RevenueCat must not block a member's account deletion — 個資法 §3 / Apple's account
-- deletion guidance allow finishing the third-party part later, as long as it does finish).
-- delete-account tries RevenueCat a few times; if it still fails, the account is deleted anyway and
-- the id lands here. delete-account and revenuecat-deletion-retry drain the queue.
-- Holds only the pseudonymous user id (no email, no FK to auth.users — the account is already gone),
-- and only until RevenueCat confirms the deletion.
create table if not exists public.revenuecat_deletion_queue (
  app_user_id uuid primary key,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz
);
alter table public.revenuecat_deletion_queue enable row level security;
revoke all on public.revenuecat_deletion_queue from public, anon, authenticated;
grant all on public.revenuecat_deletion_queue to service_role;
-- Every public RLS table carries the suspended-account policy (20261002090000 sweep).
create policy operations_account_active on public.revenuecat_deletion_queue as restrictive
  for all to authenticated using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()));
