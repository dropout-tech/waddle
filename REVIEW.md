---
reviewed: 2026-05-15T00:00:00+08:00
base: c345e65
head: working-tree
files_reviewed_list:
  - app/page.tsx
  - components/layout/main-layout.tsx
  - components/scratchpad/focus-scratchpad.tsx
  - hooks/use-waddle-data.ts
findings:
  critical: 0
  warning: 1
  total: 1
status: issues_found
---

# Code Review

**Status:** issues_found — 1 finding (0 critical, 1 warning).

**Files reviewed:** 4
**Diff range:** `c345e65..working-tree` (uncommitted)
**Intent:** Wire FocusScratchpad to the existing Supabase `scratchpad_items` table (replacing localStorage-only persistence), add scratchpad CRUD mutations + one-time localStorage→Supabase migration to `useWaddleData`, switch `setQuickLinks` from `.update()` to `.upsert()` defensively, and plumb the new props through `MainLayout` and `app/page.tsx`.

## Bugs & Security

### WR-01 — Paste / drop on a past-date scratchpad silently writes to today

**File:** `components/scratchpad/focus-scratchpad.tsx:189-238`
**Severity:** Warning
**Confidence:** 85
**Issue:** `handlePaste` and `handleDrop` stay wired on the panel root regardless of which date is selected, and both call `onAddItem(todayKey, newItem)`. The quick-add buttons (text / image / link) are correctly hidden when `!isToday` (line 423-451 branch), but the paste path and the drag-drop path remain active on past-date views. A user browsing yesterday's board who pastes an image (or drops a file) creates today's row without any feedback — the displayed list still shows `scratchpadByDate[selectedDate]` (yesterday), so the new item appears to vanish. The previous localStorage code had a symmetric bug (the item showed up locally but was never persisted); this rewrite traded one silent-loss mode for another.
**Fix:** Gate the paste/drop side of the inputs the same way the buttons are gated — short-circuit when `!isToday`:
```tsx
const handlePaste = async (e: React.ClipboardEvent) => {
  if (!isToday) return
  // ...existing body
}

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault()
  setIsDragging(false)
  if (!isToday) return
  // ...existing body
}
```
