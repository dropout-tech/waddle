---
reviewed: 2026-05-18T00:00:00Z
base: 1540aaa72fc6fbce355c5d576af408889d761807
head: working-tree
files_reviewed_list:
  - components/calendar/calendar-header.tsx
  - components/calendar/current-time-line.tsx
  - components/calendar/month-view.tsx
  - components/modals/settings-modal.tsx
  - components/modals/task-detail-modal.tsx
  - components/modals/workspace-settings-modal.tsx
  - components/notifications/notification-center.tsx
  - components/onboarding-tour.tsx
  - components/scratchpad/focus-scratchpad.tsx
  - components/task-panel/filter-bar.tsx
  - components/timer/focus-timer.tsx
  - components/timer/focus-timer-immersive.tsx
findings:
  critical: 1
  warning: 10
  total: 11
status: issues_found
---

# Code Review

**Status:** issues_found — 11 findings (1 critical, 10 warning).

**Files reviewed:** 12
**Diff range:** `1540aaa..working-tree`
**Intent:** New mobile immersive focus timer overlay + token sweep replacing Tailwind preset colors with Waddle warm OKLCH tokens across 11 components + onboarding tour rebrand (indigo spotlight → terracotta, warm confetti palette).

**Note:** Only 2 of the 5 prescribed review agents ran (bugs-security, quality-architecture). No CLAUDE.md, no plan file, no commit history (all changes uncommitted) made the other three (claude-md, plan-adherence, git-history) inapplicable. Confidence scoring was applied judgmentally rather than via per-finding Haiku scorers, with the same ≥80 threshold.

## Bugs & Security

### CR-01 — Dark-mode tokens missing for every newly-used token

**File:** `app/globals.css:94-116` (the `.dark` block); affects all 11 modified files
**Severity:** Critical
**Confidence:** 95
**Issue:** The `.dark` override block defines only `--primary`, `--destructive`, etc., and has no overrides for `--urgency-low/medium/high/critical`, `--success`, `--info`, `--current-time`, or `--chart-1..5`. Every token swap introduced in this PR will inherit light-mode values in dark mode. Light-mode OKLCH lightness values (0.75-0.8) chosen against a cream background will look washed-out or fail contrast on `oklch(0.22 ...)` dark cards.
**Fix:** Add dark-mode overrides for each token in the `.dark` block:
```css
.dark {
  --urgency-low: oklch(0.65 0.1 155);
  --urgency-medium: oklch(0.68 0.12 95);
  --urgency-high: oklch(0.7 0.14 55);
  --urgency-critical: oklch(0.65 0.18 25);
  --success: oklch(0.65 0.12 155);
  --info: oklch(0.7 0.1 230);
  --current-time: oklch(0.72 0.14 35);
  --chart-1: oklch(0.72 0.14 35);
  /* chart-2..5 similar */
}
```

### WR-01 — RAF loop in long-press exit not cancelled on unmount

**File:** `components/timer/focus-timer-immersive.tsx:73-100`
**Severity:** Warning
**Confidence:** 90
**Issue:** `startExitHold` schedules `requestAnimationFrame(step)` and stores the id in `exitHoldRef.current.raf`, but there is no `useEffect` cleanup that cancels this RAF on unmount. If the parent unmounts the overlay during an active long-press (e.g., session auto-completes while user is holding exit), the RAF loop keeps running and eventually calls `setExitHoldProgress(...)` on an unmounted component AND `onExit()` (which calls `stopTimer(false)`), potentially double-firing.
**Fix:**
```tsx
useEffect(() => () => cancelExitHold(), [])
```

### WR-02 — `${color}33` hex-alpha concatenation breaks for non-hex colors

**File:** `components/timer/focus-timer-immersive.tsx:151, 304`
**Severity:** Warning
**Confidence:** 85
**Issue:** `radial-gradient(circle at 50% 42%, ${color}33 0%, ${color}11 38%, ...)` assumes `color` is a 6-digit hex like `#e07b5a`. If a workspace or category color is ever stored as `oklch(...)`, `rgb(...)`, or a CSS variable, the concatenation produces invalid CSS and the gradient silently fails. Today the input is always hex (POMODORO_PRESETS), but the assumption is undocumented and fragile.
**Fix:** Use `color-mix(in oklch, ${color} 20%, transparent)` instead of the hex-alpha trick.

### WR-03 — `text-white` on light urgency tokens risks WCAG AA failure

**File:** `components/timer/focus-timer-immersive.tsx:282, 312, 360`; `components/task-panel/filter-bar.tsx:163-169`
**Severity:** Warning
**Confidence:** 80
**Issue:** Play button, completion check, BGM play button, and all 4 filter-bar urgency pills paint `text-white` on a workspace or urgency-token background. `--urgency-low` (sage at oklch 0.78) and `--urgency-medium` (yellow-green at 0.8) are light enough that 10-12px white text likely fails 4.5:1 contrast.
**Fix:** Use `text-foreground` for low/medium pills and `text-white` for high/critical only, or pick `--primary-foreground` instead of `text-white`.

## Quality & Architecture

### WR-04 — Glassmorphism in BgmBar + completion overlay violates DESIGN.md ban

**File:** `components/timer/focus-timer-immersive.tsx:302, 347`
**Severity:** Warning
**Confidence:** 85
**Anchor:** `DESIGN.md` 重要禁區 — "glassmorphism 預設"
**Issue:** BgmBar uses `bg-card/70 backdrop-blur-md border border-border/60` and completion overlay uses `backdrop-blur-md` over a radial gradient. Both are textbook glassmorphism. DESIGN.md ban applies to glass-as-default; neither use here is justified by meaningful content behind.
**Fix:** Drop `backdrop-blur-md`; use solid `bg-card` for BgmBar and a solid tinted overlay for completion.

### WR-05 — Spotlight ring hardcodes terracotta hex instead of `--primary`

**File:** `components/onboarding-tour.tsx:490`
**Severity:** Warning
**Confidence:** 85
**Issue:** boxShadow uses `rgba(224, 123, 90, 0.85)` / `rgba(224, 123, 90, 0.4)` — an RGB approximation of `oklch(0.68 0.14 35)`. Will not flip in dark mode (`--primary` in dark is `oklch(0.72 0.14 35)`), and any future brand-hue tweak leaves this dead-coded. The dim layer at `:496` correctly uses `bg-foreground/45` which does theme-flip.
**Fix:**
```js
boxShadow: '0 0 0 9999px color-mix(in oklch, var(--foreground) 50%, transparent), 0 0 0 2px color-mix(in oklch, var(--primary) 85%, transparent), 0 0 32px 4px color-mix(in oklch, var(--primary) 40%, transparent)'
```

### WR-06 — `z-[60]` collides with menus and dropdowns

**File:** `components/timer/focus-timer-immersive.tsx:111`
**Severity:** Warning
**Confidence:** 82
**Anchor:** `components/user-menu.tsx:111`, `components/calendar/calendar-header.tsx:214`, `components/modals/task-detail-modal.tsx:202`, `components/quick-links/quick-link-edit-modal.tsx:109`, `components/scratchpad/focus-scratchpad.tsx:242` — all at or near `z-[60]`
**Issue:** A full-screen immersive timer at the same z-level as contextual menus creates stacking ambiguity. If a dropdown is open when the timer launches, pointer events and visual stacking are undefined.
**Fix:** Define a scale: menus `z-40`, sheets `z-50`, immersive timer `z-[80]`, toast `z-[90]`, onboarding `z-[100]`.

### WR-07 — Notification priority mapping shifts every level toward critical

**File:** `components/notifications/notification-center.tsx:225-227`
**Severity:** Warning
**Confidence:** 82
**Issue:** New mapping: `high → urgency-critical`, `medium → urgency-high`, `low → info`. The `medium` priority should map to `urgency-medium`, not `urgency-high`. As written, medium and high notifications use visually-similar warm-orange / terracotta tones.
**Fix:**
```ts
case 'high': return 'text-urgency-critical bg-urgency-critical/10'
case 'medium': return 'text-urgency-medium bg-urgency-medium/10'
case 'low': return 'text-info bg-info/10'
```

### WR-08 — `text-chart-2` reintroduces a cool blue into icon palette

**File:** `components/modals/settings-modal.tsx:1147`
**Severity:** Warning
**Confidence:** 80
**Anchor:** `app/globals.css:74` — `--chart-2: oklch(0.65 0.12 230)` (only "allowed cool color")
**Issue:** `--chart-2` is the project's one low-chroma blue reserved for data viz. Using it as a decorative section-icon color reintroduces a cool blue accent into Settings — the rest of the sweep is removing those. Also `text-chart-4` is reused for both 勿擾時段 (Moon) and 工作區設定 (Layers).
**Fix:** Pick `text-info` (semantically suited) or another warm chart token; pick distinct tokens for adjacent sections.

### WR-09 — URGENCY_BUCKETS range shift silently re-categorizes existing data

**File:** `components/modals/task-detail-modal.tsx:642-645`; `components/task-panel/filter-bar.tsx:162-169`
**Severity:** Warning
**Confidence:** 80
**Issue:** Buckets changed from 3-tier (1-3 / 4-6 / 7-10) to 4-tier (1-3 / 4-5 / 6-8 / 9-10). Tasks at level 6 visually move from 中 to 高; tasks at 9-10 are newly classified as 緊急. No data migration needed (numeric value unchanged), but UI labeling shifts for any user with saved tasks.
**Fix:** Acceptable if intentional; mention in commit message so the visual shift isn't surprising.

### WR-10 — Onboarding dim opacity dropped from 65% to 45%

**File:** `components/onboarding-tour.tsx:496`
**Severity:** Warning
**Confidence:** 80
**Issue:** `bg-black/65` → `bg-foreground/45`. In light mode `--foreground` is `oklch(0.28 0.025 55)` at 45% ≈ visually similar to black at 30%. Background bleeds through more, diluting the "focus user on tooltip" purpose of the dim layer.
**Fix:** Bump to `bg-foreground/55` to keep warmth but recover backdrop weight.

### WR-11 — Duplicated BgmBar UI between focus-timer.tsx and focus-timer-immersive.tsx

**File:** `components/timer/focus-timer-immersive.tsx:332-387` vs `components/timer/focus-timer.tsx:744-792`
**Severity:** Warning
**Confidence:** 78 (borderline, included for actionable refactor)
**Issue:** Both compute a `summary` string from `prefs.music` + `prefs.ambient`, track `hasSelection`, and render near-identical play/pause UI. They will drift over time.
**Fix:** Extract `useBgmSummary(prefs)` hook returning `{ summary, hasSelection, activeAmbients, musicMeta }`; optionally a shared `<BgmPlayChip>`.

---

## Summary

**CR-01 (dark-mode tokens missing) gates everything.** If shipped as-is, every dark-mode user sees regressed colors across 11 files. Fix this first.

The immersive timer has two structural issues (WR-01 RAF leak, WR-02 hex-alpha fragility) that should be patched before commit. Glassmorphism (WR-04) and z-index collision (WR-06) are visible-to-user but not blocking.

Onboarding rebrand is mostly correct but the hardcoded hex (WR-05) and dim opacity drop (WR-10) arguably overcorrected.

Recommended fix order: CR-01 → WR-01 → WR-02 → WR-07 → rest as time permits.
