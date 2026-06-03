-- Evolve scratchpad_items from a flat text/image/link list into a block model
-- (Notion-style). Backs the Phase 1 block editor: ordering, checkable todos,
-- nesting, and per-block metadata (callout color/emoji, link preview, etc.).

-- 1. type: enum -> text.
-- The block editor keeps growing block types (todo/heading/divider/callout/
-- toggle/rich_text and more later). Postgres enums are painful to extend
-- (ALTER TYPE ADD VALUE has transaction restrictions), so switch to text. The
-- allowed set is constrained at compile time by the TS union in lib/types.ts
-- (not a runtime DB constraint) — all writers go through useWaddleData.
ALTER TABLE public.scratchpad_items
  ALTER COLUMN type TYPE text USING type::text;

DROP TYPE IF EXISTS scratchpad_type_enum;

-- 2. New structural columns.
ALTER TABLE public.scratchpad_items
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.scratchpad_items
  ADD COLUMN IF NOT EXISTS is_checked boolean NOT NULL DEFAULT false;
ALTER TABLE public.scratchpad_items
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.scratchpad_items(id) ON DELETE CASCADE;
ALTER TABLE public.scratchpad_items
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 3. Backfill sort_order for existing rows, preserving the current
-- newest-first visual order within each (user, date). Gaps of 10 leave room
-- to insert between blocks without renumbering (matches the client's idx*10).
WITH ordered AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id, date ORDER BY created_at ASC) * 10 AS rn
  FROM public.scratchpad_items
)
UPDATE public.scratchpad_items s
SET sort_order = ordered.rn
FROM ordered
WHERE ordered.id = s.id;

-- 4. Index for ordered fetch within a day.
CREATE INDEX IF NOT EXISTS scratchpad_items_sort_idx
  ON public.scratchpad_items(user_id, date, sort_order);

-- 5. Self-referential parent lookup (toggle children / nesting).
CREATE INDEX IF NOT EXISTS scratchpad_items_parent_idx
  ON public.scratchpad_items(parent_id);

-- RLS unchanged: existing policies are row-level on user_id (see 0002), so the
-- new columns are covered automatically — no policy edits needed.

COMMENT ON COLUMN public.scratchpad_items.type IS 'Block type: text|image|link|todo|heading|divider|callout|toggle|rich_text (validated in app, not a DB enum).';
COMMENT ON COLUMN public.scratchpad_items.sort_order IS 'Manual ordering within a (user_id, date); gaps of 10 for cheap inserts.';
COMMENT ON COLUMN public.scratchpad_items.is_checked IS 'Checked state for todo blocks.';
COMMENT ON COLUMN public.scratchpad_items.parent_id IS 'Parent block for nested/toggle children; cascades on delete.';
COMMENT ON COLUMN public.scratchpad_items.metadata IS 'Per-block extras: callout color/emoji, link preview (title/favicon/image), etc.';
