---
reviewed: 2026-05-11T07:05:00.000Z
base: 128813a1b080d599586da75bd550f68906d1b61a
head: feec9aee19a64994f111471a17c5579deaf9ec47
files_reviewed_list:
  - app/page.tsx
  - components/calendar/calendar-export-modal.tsx
  - components/calendar/calendar-export-view.tsx
  - components/calendar/calendar-header.tsx
  - components/calendar/calendar-panel.tsx
  - components/calendar/task-block.tsx
  - components/layout/main-layout.tsx
  - components/modals/settings-modal.tsx
  - components/modals/task-detail-modal.tsx
  - components/onboarding-tour.tsx
  - components/reports/report-dashboard.tsx
  - components/task-panel/completed-tasks-drawer.tsx
  - components/task-panel/task-panel.tsx
  - components/task-panel/task-row.tsx
  - components/task-panel/today-meetings-popover.tsx
  - hooks/use-meeting-reminders.ts
  - hooks/use-waddle-data.ts
  - lib/meeting-reminder.ts
  - lib/meeting-utils.ts
  - lib/supabase/database.types.ts
  - lib/supabase/mappers.ts
  - lib/task-sound.ts
  - lib/task-utils.ts
  - lib/types.ts
  - lib/utils.ts
  - package.json
  - supabase/migrations/0007_completed_tasks_view.sql
  - supabase/migrations/0008_meeting_fields.sql
findings:
  critical: 4
  warning: 0
  total: 4
status: issues_found
---

# Code Review

**Status:** issues_found — 4 findings (4 critical, 0 warning).

**Files reviewed:** 28
**Diff range:** `128813a..feec9ae`
**Intent:** Add calendar export functionality with date range selection, implement meeting reminders system with browser notifications, and introduce a completed tasks drawer with KPI reporting alongside enhanced report dashboard features.

## Bugs & Security

### CR-01 — Today-completed filter compares UTC date against local todayStr

**File:** `components/task-panel/task-panel.tsx:152`
**Severity:** Critical
**Confidence:** 100
**Issue:** `task.completedAt` is set via `new Date().toISOString()` (UTC), but `todayStr` is derived via `toDateString(new Date())` (local). For users in Asia/Taipei (UTC+8), a task completed at any local time before 08:00 has a UTC date of the previous day. `split('T')[0]` returns that previous UTC day, mismatches `todayStr`, and the task is silently filtered out of the inline today-list even though the user just completed it.
**Fix:**
```ts
// Replace string-split with a proper local-date extraction.
const completedDay = toDateString(new Date(task.completedAt))
if (completedDay !== todayStr) return false
```

### CR-02 — todayStr frozen at mount across midnight

**File:** `components/task-panel/task-panel.tsx:102`
**Severity:** Critical
**Confidence:** 100
**Issue:** `const todayStr = useMemo(() => toDateString(new Date()), [])` with empty deps captures the date once at mount and never recomputes. The neighboring comment claims it "recomputes once per render" — that's factually wrong for `useMemo([])`. A panel left mounted across midnight keeps filtering completed-today against yesterday's date, so today's completions never appear and yesterday's never leave. Same bug pattern was explicitly fixed in `components/task-panel/today-meetings-popover.tsx:41` in this same commit (`feec9ae` review fix #4) by adding a `nowTick` interval — that fix didn't get applied to the panel.
**Fix:**
```ts
const [nowTick, setNowTick] = useState(0)
useEffect(() => {
  const id = window.setInterval(() => setNowTick((n) => n + 1), 60_000)
  return () => window.clearInterval(id)
}, [])
const todayStr = useMemo(() => toDateString(new Date()), [nowTick])
```

### CR-03 — Midnight-crossing meeting filtered as already-ended

**File:** `components/task-panel/today-meetings-popover.tsx:51`
**Severity:** Critical
**Confidence:** 100
**Issue:** `const end = new Date(now); end.setHours(eh, em, 0, 0)` builds the end timestamp on **today's** calendar date and only overrides the hour/minute. For a meeting with start `23:00` and end `01:00`, end resolves to today at 01:00 — which is in the past for any current time past 01:00. The meeting reads as already-ended and disappears from "今日會議" while it's still actively running.
**Fix:**
```ts
const [sh, sm] = m.scheduledStartTime.split(':').map(Number)
const [eh, em] = m.scheduledEndTime.split(':').map(Number)
const startMin = sh * 60 + sm
const endMin = eh * 60 + em
const end = new Date(now)
end.setHours(eh, em, 0, 0)
// If end is logically before start, the meeting crosses midnight — push end forward.
if (endMin < startMin) end.setDate(end.getDate() + 1)
return end.getTime() > now.getTime()
```

## Quality & Architecture

### CR-04 — Inconsistent migration-fallback pattern within the same module

**File:** `hooks/use-waddle-data.ts:34-56, 626-639, 731-741, 1080-1098`
**Severity:** Critical
**Confidence:** 100
**Anchor:** `hooks/use-waddle-data.ts:34` `let meetingColsKnownMissing = false` (module-level latch used by createTask + updateTask).
**Issue:** This diff introduces a clean session-latch pattern for the PGRST204 / 42703 column-missing fallback in `createTask` and `updateTask` (lines 626-639, 731-741): on first failure, set `meetingColsKnownMissing = true` so subsequent writes skip the failed roundtrip. But `saveSettings` (lines 1080-1098), modified in the same diff, uses an inline regex check without any latch — every settings save pays the failed-write cost. Either both should use the latch or both should retry inline; mixing them in the same file is the kind of inconsistency that drifts over time as one branch evolves.
**Fix:** Either (a) introduce a parallel `migrationColsKnownMissing` map keyed by column name and use it in both writers, or (b) drop the latch from createTask/updateTask and accept the per-call cost. (a) is more invasive but matches the existing latch's intent.

---

## Notes on the review

- `plan-adherence` agent: no plan file existed at `~/.claude/plans/`, `docs/plans/`, `docs/specs/`, or repo root. Aspect returned empty.
- `claude-md` agent: no CLAUDE.md files at repo root or in any directory touched by the diff. Aspect returned empty.
- 10 candidate findings (3 bugs-security, 7 quality-architecture) scored below the 80 confidence threshold and were dropped — they include the URL.revokeObjectURL Safari race, the two-tab Notification TOCTOU race, the unused `filterTasks` export, the duplicate `timeToMinutes` helpers, the duplicate week-range helper, the `alert()` vs `toast` inconsistency, the `forEachTask` callsite the new export view didn't adopt, the inconsistent `split('T')[0]` vs `toDateString(new Date(iso))` strategy, and the `useEffect([workspaces])` interval reinstall. These are real but either rare or stylistic; surface them only if you want a polish pass.
