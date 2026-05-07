-- Per-user "how many days are visible at once" controls for the day and
-- week calendar views. Distinct columns (rather than a JSONB blob) so we
-- can validate ranges at the schema level — day view stays in 1-3 (focus
-- mode) and week view stays in 5-7 (overview), enforcing the user-facing
-- promise that the two modes don't logically overlap.

alter table public.user_settings
  add column if not exists day_view_days smallint not null default 1
    check (day_view_days between 1 and 3),
  add column if not exists week_view_days smallint not null default 7
    check (week_view_days between 5 and 7);
