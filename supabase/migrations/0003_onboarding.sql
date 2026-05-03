-- Add onboarding flag to user_settings.
-- New users start at false; the spotlight tour flips it to true on completion.
-- Existing users get the default (false), but the tour respects per-email
-- overrides (owner email skips it regardless).

alter table public.user_settings
  add column if not exists onboarding_completed boolean not null default false;
