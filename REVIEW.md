---
reviewed: 2026-07-07T14:39:02Z
base: f3633f2
head: 338fc82
files_reviewed_list:
  - .gitignore
  - DESIGN.md
  - README.md
  - app/(auth)/layout.tsx
  - app/(auth)/login/page.tsx
  - app/(auth)/signup/page.tsx
  - app/globals.css
  - components/calendar/calendar-export-modal.tsx
  - components/calendar/calendar-export-view.tsx
  - components/calendar/calendar-header.tsx
  - components/calendar/calendar-panel.tsx
  - components/calendar/day-scroll-view.tsx
  - components/calendar/month-view.tsx
  - components/calendar/slot-icon.tsx
  - components/calendar/task-block.tsx
  - components/calendar/time-grid.tsx
  - components/calendar/week-view.tsx
  - components/command-palette.tsx
  - components/keyboard-shortcuts.tsx
  - components/layout/main-layout.tsx
  - components/modals/journal-modal.tsx
  - components/modals/modal-shell.tsx
  - components/modals/recurrence-choice-modal.tsx
  - components/modals/report-modal.tsx
  - components/modals/settings-modal.tsx
  - components/modals/task-detail-modal.tsx
  - components/modals/time-block-modal.tsx
  - components/modals/water-reminder-modal.tsx
  - components/modals/workspace-settings-modal.tsx
  - components/notebook/editor-toolbar.tsx
  - components/notifications/notification-center.tsx
  - components/onboarding-tour.tsx
  - components/quick-links/quick-link-edit-modal.tsx
  - components/quick-links/quick-links-bar.tsx
  - components/reports/report-dashboard.tsx
  - components/scratchpad/focus-scratchpad.tsx
  - components/task-panel/full-screen-task-view.tsx
  - components/task-panel/panel-header.tsx
  - components/task-panel/task-row.tsx
  - components/task-panel/today-meetings-popover.tsx
  - components/task-panel/workspace-section.tsx
  - components/timer/focus-timer-immersive.tsx
  - components/timer/focus-timer.tsx
  - components/ui/alert-dialog.tsx
  - components/ui/button-group.tsx
  - components/ui/button.tsx
  - components/ui/calendar.tsx
  - components/ui/context-menu.tsx
  - components/ui/date-time-field.tsx
  - components/ui/dialog.tsx
  - components/ui/drawer.tsx
  - components/ui/dropdown-menu.tsx
  - components/ui/hover-card.tsx
  - components/ui/input-otp.tsx
  - components/ui/menubar.tsx
  - components/ui/navigation-menu.tsx
  - components/ui/popover.tsx
  - components/ui/resizable.tsx
  - components/ui/select.tsx
  - components/ui/sheet.tsx
  - components/ui/sidebar.tsx
  - components/ui/toast.tsx
  - components/ui/toaster.tsx
  - components/ui/toggle-group.tsx
  - components/ui/tooltip.tsx
  - components/ui/use-mobile.tsx
  - components/ui/use-toast.ts
  - components/user-menu.tsx
  - docs/WEB_UX_PLAN.md
  - eslint.config.mjs
  - hooks/use-display-color.ts
  - hooks/use-toast.ts
  - hooks/use-waddle-data.ts
  - hooks/use-wide-screen.ts
  - lib/demo-data.ts
  - lib/mock-data.ts
  - lib/palette.ts
  - lib/task-utils.ts
  - lib/utils.ts
  - next-env.d.ts
  - package.json
  - pnpm-lock.yaml
  - scripts/e2e/README.md
  - scripts/e2e/smoke.mjs
  - supabase/migrations/0014_brand_palette_migration.sql
findings:
  critical: 0
  warning: 4
  total: 4
status: issues_found
---

# Code Review

**Status:** issues_found — 4 findings (0 critical, 4 warning).

**Files reviewed:** 85
**Diff range:** `f3633f2..338fc82`
**Intent:** Web desktop UX overhaul phases 0-3 per docs/WEB_UX_PLAN.md: guardrails (ModalShell, z-index tokens, e2e), brand palette + dark-mode color adaptation, keyboard/cmd-K, week-view fix, seeding idempotency guard, report redesign, third review column, task-edit drawer.

> Note: this repo has no CLAUDE.md; the citation source for the adherence lens is DESIGN.md/PRODUCT.md. Five review agents (bugs-security / rules-adherence / git-history / plan-adherence / quality-architecture) produced 15 candidates; per-finding confidence scoring kept 4 at ≥80. Five sub-threshold-but-verified items were fixed opportunistically alongside (see the session report's Updates section).

## Git History

### WR-01 — time-block modal lost its mobile Vaul bottom sheet

**File:** `components/modals/time-block-modal.tsx:358`
**Severity:** Warning
**Confidence:** 90
**Historical context:** commit 94905cc deliberately introduced the Vaul bottom-sheet presentation for this modal ("time-block-modal renders as a Vaul bottom sheet on mobile with drag handle + safe-area-bottom; desktop stays a centered dialog").
**Issue:** The ModalShell conversion (5da35ac) replaced the dual presentation with a single full-screen shell on all sizes, regressing the mobile drag-handle/swipe-dismiss interaction and contradicting DESIGN.md's "手機 sheet 一律從底部上滑".
**Fix:** Restore the `useIsMobile()` Vaul branch around the current body; keep ModalShell for desktop.

## CLAUDE.md Adherence

### WR-02 — report time-share bar animates `width`

**File:** `components/reports/report-dashboard.tsx:442`
**Severity:** Warning
**Confidence:** 85
**CLAUDE.md rule:** "動畫只用於 `transform`、`opacity`、`filter`，**不要** animate `width`、`height`、`top`、`left`。" (`DESIGN.md`)
**Issue:** New workspace time-share bar transitions `width` (500ms), causing layout reflow and violating the explicit motion rule.
**Fix:** Drop the width transition (entrance is already covered by the stagger fade) or animate `transform: scaleX()`.

## Plan Adherence

### WR-03 — export modal missing promised Esc + standard backdrop

**Plan section:** "W2.1 Esc 行為全站一致：任務 modal、設定 modal、專注白板、匯出 modal 全部可 Esc 關閉（配合 W0.6 的 ModalShell 一次到位），含焦點返回" (`docs/WEB_UX_PLAN.md`)
**File:** `components/calendar/calendar-export-modal.tsx:207`
**Severity:** Warning
**Confidence:** 90
**Issue:** calendar-export-modal remains a hand-rolled overlay: zero Escape handling and a `bg-black/50` backdrop instead of the ModalShell standard (0.25 + blur). Not listed among the plan changelog's deferred items.
**Fix:** Adopt ModalShell (or add Esc handling + standard backdrop).

### WR-04 — W0.5 acceptance criterion deviation not recorded

**Plan section:** "W0.5 z-index token 化 … 驗收：… z-index grep 斷言無硬編殘留" (`docs/WEB_UX_PLAN.md`)
**File:** `components/layout/main-layout.tsx:420`
**Severity:** Warning
**Confidence:** 85
**Issue:** ~18 raw z-index utilities were deliberately retained (local stacking contexts where semantic tokens would mislead), but the plan changelog was never amended, so the stated acceptance criterion reads as met when it was consciously deviated from.
**Fix:** Record the retention decision (count + rationale) in docs/WEB_UX_PLAN.md changelog.
