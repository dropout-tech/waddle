---
reviewed: 2026-06-01T03:28:48Z
base: 73223af (working tree — uncommitted)
head: 73223afa655f3e464454176288b79d98cc6f672b
files_reviewed_list:
  - app/page.tsx
  - components/layout/main-layout.tsx
  - components/onboarding-tour.tsx
  - components/scratchpad/focus-scratchpad.tsx
  - hooks/use-waddle-data.ts
  - lib/supabase/database.types.ts
  - lib/types.ts
  - supabase/migrations/0011_scratchpad_blocks.sql
findings:
  critical: 1
  warning: 10
  total: 11
status: issues_found
---

# Code Review

**Status:** issues_found — 11 findings (1 critical, 10 warning).

**Files reviewed:** 8 changed files + the new untracked migration `0011_scratchpad_blocks.sql`
**Diff range:** working tree vs `73223af`
**Intent:** Salvage review of a Phase-1 "Notion-style block scratchpad" implementation an external Gemini agent wrote in parallel (overstepping read-only plan mode), plus the migration `0011_scratchpad_blocks.sql` written to back it (type enum→text; adds sort_order/is_checked/parent_id/metadata; backfills order).

> 4 fan-out agents (bugs-security, quality-architecture, plan-adherence, db-migration-consistency). Heavy cross-agent overlap was deduped; the bugs agent's self-cancelling "…not a bug" candidates and pure-style items (`any` casts, 16-prop `SortableItem` drilling) scored below the 80 threshold and were dropped. The DB-consistency agent confirmed all columns the frontend touches now exist in 0011/0001 with matching names/nullability and that RLS (row-level on `user_id`) covers the new columns without policy edits — so the migration closes the runtime-break. Findings below are what remains to fix before trusting the salvaged code.

## Bugs & Security

### CR-01 — Promote-to-task deletes the source note before the task is persisted

**File:** `components/scratchpad/focus-scratchpad.tsx` (promoteToTask) + `app/page.tsx:136` (handlePromoteToTask)
**Severity:** Critical
**Confidence:** 95
**Issue:** `promoteToTask` calls `onPromoteToTask(item.content, …)` then immediately `onDeleteItem(item.id)`. But `handlePromoteToTask` only stages an in-memory draft (`setTaskMode('create')` + `setSelectedTask({…})`) — nothing is written to the DB until the user hits Save in the modal. The scratchpad row is already deleted. If the user closes/cancels the create modal, the note is permanently gone. Two independent agents flagged this.
**Fix:** Don't delete on promote. Either (a) delete the scratchpad item only in the modal's Save handler after the task actually persists, or (b) keep the note and mark it linked/done. Simplest: pass the source item id into the draft and have `handleSaveTask` (create mode) delete it after a successful insert; on cancel, the note survives.

### WR-01 — Reorder rollback can write `undefined` into the date bucket

**File:** `hooks/use-waddle-data.ts` (reorderScratchpadItems)
**Severity:** Warning
**Confidence:** 80
**Issue:** On a DB error the mutation restores `setScratchpadByDate(prev => ({ …prev, [date]: previousItems }))` where `previousItems = scratchpadByDate[date]` captured from a possibly-stale render closure. If that key is absent it assigns `undefined`, and downstream `.map`/`.length` on the bucket throw. Diverges from `reorderCategories`, which reads `workspacesRef.current` and depends only on `[supabase]`.
**Fix:** Read from a ref (mirror `reorderCategories`) and guard: `[date]: previousItems ?? []`. Drop `scratchpadByDate` from the dep array.

### WR-02 — Parallel per-row reorder UPDATEs leave the DB half-reordered on partial failure

**File:** `hooks/use-waddle-data.ts` (reorderScratchpadItems)
**Severity:** Warning
**Confidence:** 80
**Issue:** Reorder fires N independent `.update({ sort_order })` calls via `Promise.all`. If one rejects, the others have already committed; the code then rolls back only the client state, so the DB is left partially reordered and disagrees with the UI until the next refetch. The author's own leftover comment concedes an RPC would be better.
**Fix:** On any rejection, trigger a reconciling refetch instead of a client-only rollback — or batch the writes (single `upsert` of `{id, sort_order}` rows, or a Postgres RPC). At minimum, refetch on error.

### WR-03 — `sort_order` collisions from a stale `items` snapshot on rapid adds

**File:** `components/scratchpad/focus-scratchpad.tsx` (getNextSortOrder) + `hooks/use-waddle-data.ts:2313` (optimistic append)
**Severity:** Warning
**Confidence:** 80
**Issue:** `getNextSortOrder()` computes `Math.max(...items.map(i => i.sortOrder)) + 10` from the memoized prop `items`, which doesn't reflect an optimistic item added milliseconds earlier (parent hasn't re-rendered). Two quick adds (easy via markdown shortcuts) get identical `sort_order`. The optimistic insert also appends without re-sorting, so order can jump on the next refetch.
**Fix:** Track the max in the hook (where state is authoritative) and assign there, or derive from `prev[date]` inside the `setScratchpadByDate` updater rather than from props.

## Quality & Architecture

### WR-04 — Mobile regression: item actions and drag handle are hover-only (invisible on touch)

**File:** `components/scratchpad/focus-scratchpad.tsx` (Floating actions + drag handle)
**Severity:** Warning
**Confidence:** 90
**Issue:** The action cluster and grip use `opacity-0 group-hover:opacity-100` with no touch fallback. The pre-existing grid used `opacity-100 md:opacity-0 md:group-hover:opacity-100` — visible on mobile. The scratchpad's mobile surface is a bottom sheet (no hover), so delete/edit/promote/drag are now unreachable on phones — the primary native (Capacitor) surface.
**Fix:** Restore the `opacity-100 md:opacity-0 md:group-hover:opacity-100` pattern for the action cluster and the drag handle.

### WR-05 — Touch drag activation fights scroll (no delay sensor)

**File:** `components/scratchpad/focus-scratchpad.tsx` (PointerSensor)
**Severity:** Warning
**Confidence:** 80
**Issue:** `useSensor(PointerSensor, { activationConstraint: { distance: 5 } })`. In the scrollable bottom sheet a 5px vertical move starts a drag, conflicting with scroll. The standard touch-list pattern is a delay+tolerance activation.
**Fix:** Use `{ delay: 200, tolerance: 5 }` (or a separate `TouchSensor`) so a press-and-hold initiates drag while taps/scrolls pass through.

### WR-06 — `- ` markdown shortcut fakes a list as `type:'text'` with a literal `'• '` glyph

**File:** `components/scratchpad/focus-scratchpad.tsx` (handleTextInputChange)
**Severity:** Warning
**Confidence:** 84
**Issue:** `[] ` → `todo` and `# ` → `heading` create real block types, but `- ` creates `type:'text'` with `content:'• '`, baking a presentation character into stored content. Inconsistent block modeling; the bullet won't behave like other structural blocks and pollutes the data.
**Fix:** Either model a real `list` block type, or drop the `- ` shortcut for Phase 1 rather than faking it. Don't store the glyph in `content`.

### WR-07 — Divider blocks have no creation path (Phase-1 requirement unmet)

**File:** `components/scratchpad/focus-scratchpad.tsx` (render branch `item.type === 'divider'`)
**Severity:** Warning
**Confidence:** 85
**Issue:** A divider render branch exists, but nothing can create a divider — the only shortcuts are `[] `/`- `/`# ` and there's no toolbar button emitting `type:'divider'`. The plan's "heading / divider blocks" is half-done: render-only dead UI.
**Fix:** Add a divider creation affordance (e.g. `---` shortcut or a toolbar button), or drop the divider render branch until it's wired.

### WR-08 — Dead imports leaking deferred-feature surface

**File:** `components/scratchpad/focus-scratchpad.tsx:7-8` + `@dnd-kit/core` import
**Severity:** Warning
**Confidence:** 85
**Issue:** `MessageSquare`, `MoreHorizontal` (Phase-2/3 callout/overflow surface), `Heading1`, `Minus` (unused heading/divider icons), and `defaultDropAnimationSideEffects` are imported but referenced nowhere. Dead code from the scaffold; CI lint is broken in this repo so it won't catch them.
**Fix:** Remove the unused imports.

### WR-09 — Silent grid→vertical-list layout change + full-width images (needs sign-off)

**File:** `components/scratchpad/focus-scratchpad.tsx` (items container + image block)
**Severity:** Warning
**Confidence:** 84
**Issue:** The shipped feature was a responsive card grid (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4`); the diff replaces it wholesale with a single-column list (`verticalListSortingStrategy`, container `max-w-4xl`→`max-w-3xl`) and renders images full-width `max-h-96 object-contain` instead of `h-32 object-cover` thumbnails. A day with several screenshots becomes a huge scroll, and the per-item `createdAt` timestamp was dropped. This is a deliberate IA/visual decision for a polished, shipped surface — it should be a sign-off, not a side effect.
**Fix:** Confirm the list direction is intended; if so, restore image density (cap height / thumbnail-and-expand) and reinstate the timestamp, or keep a grid for media blocks.

### WR-10 — Order semantics inverted for existing data; incoherent comparator

**File:** `supabase/migrations/0011_scratchpad_blocks.sql:31` + `hooks/use-waddle-data.ts` (loader sort)
**Severity:** Warning
**Confidence:** 82
**Issue:** Backfill numbers `sort_order` by `created_at ASC`, and the loader now sorts by `sort_order ASC` — so migrated days flip from the old newest-first to oldest-first. The in-memory comparator also mixes `sort_order ASC` primary with a `created_at DESC` tiebreak (two opposing intents), and `addScratchpadItem` changed from prepend to append. The net display order for existing users silently inverts.
**Fix:** Pick one model. If "append to bottom, oldest-first" is intended, say so and make the tiebreak `created_at ASC` to match; if newest-first is to be preserved, backfill `DESC` and prepend new items. Either way, align backfill + comparator + insert.

### WR-11 — Migration drops the enum but `database.types.ts` still declares it; "app-level validation" doesn't exist

**File:** `supabase/migrations/0011_scratchpad_blocks.sql:13-14` + `lib/supabase/database.types.ts` (Enums)
**Severity:** Warning
**Confidence:** 80
**Issue:** `0011` runs `DROP TYPE scratchpad_type_enum`, but the generated `Enums` map still lists `scratchpad_type_enum` (now stale/unbacked). The migration comment claims the type set is "validated in the app layer (lib/types.ts)", but that's a compile-time TS union with zero runtime enforcement — the column is now free text and `updateScratchpadItem` passes `patch.type` straight through. Currently harmless (all writes are within the union) but the promised guarantee is absent.
**Fix:** Remove the stale `scratchpad_type_enum` from the `Enums` map, and either add a tiny runtime guard (a `BLOCK_TYPES` const + check in the add/update mutations) or soften the migration comment to reflect that validation is type-only.
