-- Migration 0014: brand palette migration
--
-- Rewrites hardcoded pre-brand hex colors (leaked-in Tailwind defaults —
-- indigo/blue/emerald/purple/etc, see DESIGN.md's banned-hue list) into the
-- Huddle brand palette. Mirrors lib/palette.ts's OLD_COLOR_MIGRATION_MAP
-- exactly (that file is the single source of truth for the app; this SQL
-- can't import it, so keep the two in sync by hand if either changes).
--
-- Scope: only rows whose stored color is an EXACT match for one of the
-- legacy values below are touched. Any other color — including a user's
-- genuine custom pick — is left completely untouched.
--
-- Idempotent: safe to re-run. Every UPDATE is guarded with
-- "new value IS DISTINCT FROM old value", so a second run touches 0 rows.
--
-- IMPORTANT: this file is a draft for review. Nobody has run
-- `supabase db push` for it yet — do that only after a human has read
-- through it.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Legacy → brand color lookup, as a throwaway function scoped to this
--    migration only (dropped at the bottom of this file).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public._migrate_legacy_color_0014(hex text)
returns text
language sql
immutable
as $$
  select case lower(hex)
    -- lib/demo-data.ts workspaces
    when '#6366f1' then '#AE96DA' -- indigo → 霧薰衣草 dusty lavender (Workspace 4)
    when '#3b82f6' then '#259CCA' -- tailwind blue → 霧藍 low-chroma blue (Workspace 2)
    when '#10b981' then '#59B47D' -- emerald → 鼠尾草綠 sage (Workspace 3)
    -- onboarding TEMPLATES in hooks/use-waddle-data.ts ('學習' workspace)
    when '#a855f7' then '#AE96DA' -- purple (banned) → dusty lavender
    -- lib/mock-data.ts workspaces
    when '#ff6b6b' then '#E1755A' -- coral red → 赤陶 terracotta (Workspace 1)
    when '#4a90d9' then '#259CCA' -- blue → low-chroma blue
    when '#66bb6a' then '#59B47D' -- green → sage
    -- components/calendar/time-grid.tsx generic "task" slot-type default +
    -- week/day-view drag-preview fallback
    when '#6b7fd4' then '#AE96DA' -- indigo/periwinkle → dusty lavender
    -- duplicated PRESET_COLORS in settings-modal.tsx / task-detail-modal.tsx
    when '#ffb74d' then '#DDB049' -- amber → 蜂蜜黃 honey
    when '#9575cd' then '#AE96DA' -- purple → dusty lavender
    when '#4dd0e1' then '#259CCA' -- cyan → low-chroma blue
    when '#f06292' then '#E98092' -- pink → 玫瑰粉 rose
    when '#aed581' then '#59B47D' -- lime → sage
    when '#ffd54f' then '#DDB049' -- yellow → honey
    when '#90a4ae' then '#259CCA' -- slate (low-chroma blue-grey) → low-chroma blue
    -- 0001_initial_schema.sql's user_settings.lunch_break / buffer_time jsonb
    -- column defaults
    when '#fbbf24' then '#DDB049' -- amber (lunch_break default) → 蜂蜜黃 honey
    when '#94a3b8' then '#865634' -- slate-grey (buffer_time default) → 陶土棕 clay-brown (warm neutral, not cool grey)
    else hex
  end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Direct color columns
-- ─────────────────────────────────────────────────────────────────────────
update public.workspaces
   set color = public._migrate_legacy_color_0014(color)
 where public._migrate_legacy_color_0014(color) is distinct from color;

update public.tasks
   set calendar_color = public._migrate_legacy_color_0014(calendar_color)
 where public._migrate_legacy_color_0014(calendar_color) is distinct from calendar_color;

update public.time_blocks
   set color = public._migrate_legacy_color_0014(color)
 where public._migrate_legacy_color_0014(color) is distinct from color;

update public.slot_types
   set color = public._migrate_legacy_color_0014(color)
 where public._migrate_legacy_color_0014(color) is distinct from color;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) user_settings JSONB color fields
--    lunch_break / buffer_time each hold a top-level "color" key.
--    default_task_colors is a flat Record<string, string> (workspace/category
--    id → hex), per lib/types.ts's UserSettings.defaultTaskColors.
-- ─────────────────────────────────────────────────────────────────────────
update public.user_settings
   set lunch_break = jsonb_set(
         lunch_break,
         '{color}',
         to_jsonb(public._migrate_legacy_color_0014(lunch_break ->> 'color'))
       )
 where jsonb_typeof(lunch_break -> 'color') = 'string'
   and public._migrate_legacy_color_0014(lunch_break ->> 'color') is distinct from (lunch_break ->> 'color');

update public.user_settings
   set buffer_time = jsonb_set(
         buffer_time,
         '{color}',
         to_jsonb(public._migrate_legacy_color_0014(buffer_time ->> 'color'))
       )
 where jsonb_typeof(buffer_time -> 'color') = 'string'
   and public._migrate_legacy_color_0014(buffer_time ->> 'color') is distinct from (buffer_time ->> 'color');

update public.user_settings us
   set default_task_colors = (
         select jsonb_object_agg(kv.key, to_jsonb(public._migrate_legacy_color_0014(kv.value)))
           from jsonb_each_text(us.default_task_colors) as kv
       )
 where us.default_task_colors <> '{}'::jsonb
   and exists (
         select 1
           from jsonb_each_text(us.default_task_colors) as kv
          where public._migrate_legacy_color_0014(kv.value) is distinct from kv.value
       );

-- ─────────────────────────────────────────────────────────────────────────
-- 4) New-row defaults: stop seeding the old Tailwind blue for new tasks.
--    (lib/palette.ts DEFAULT_CALENDAR_COLOR = brand terracotta.)
--    Note: the task brief referred to this as "user_settings.calendar_color"
--    but per 0001_initial_schema.sql it's actually tasks.calendar_color —
--    altering the column that really exists.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.tasks
  alter column calendar_color set default '#E1755A';

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Cleanup — this function only exists to serve the updates above.
-- ─────────────────────────────────────────────────────────────────────────
drop function public._migrate_legacy_color_0014(text);
