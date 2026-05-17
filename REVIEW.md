---
reviewed: 2026-05-17T00:00:00Z
base: d00ce6c
head: working-tree
files_reviewed_list:
  - components/calendar/day-scroll-view.tsx
  - components/timer/focus-timer.tsx
  - lib/timer-bgm.ts
  - lib/timer-sound.ts
  - public/audio/README.md
  - README.md
findings:
  critical: 0
  warning: 0
  total: 0
status: clean
---

# Code Review

**Status:** clean — 6 files reviewed, no findings above the confidence threshold (80) after follow-up fixes.

**Files reviewed:** 6
**Diff range:** `d00ce6c..working-tree`
**Intent:** Fix two calendar bugs (desktop opening on past day, mobile day cell cut in half) and add background music + ambient overlay engine to the focus timer.

## Follow-up resolution log

The first review pass surfaced 1 critical + 6 warnings. All resolved:

| ID | Issue | Resolution |
|---|---|---|
| CR-01 | BGM reintroduces shipped-audio dependency that `7a63257` rejected | `lib/timer-sound.ts:7-15` comment block updated to reconcile the divergent tradeoff (BGM handles 404 gracefully + plays on user gesture, sidestepping autoplay) |
| WR-01 | `fadeTo` had no rAF cancellation; concurrent fades raced | `lib/timer-bgm.ts:92-115` — WeakMap stores handles, new fade cancels in-flight rAF |
| WR-02 | `getBgmEngine` returned null while typed as `BgmEngine` | `lib/timer-bgm.ts:213-217` — return type is now `BgmEngine \| null`; callers guard correctly |
| WR-03 | `subscribe`/`isAvailable` plumbing existed but UI never consumed it | `focus-timer.tsx:167-184` subscribes + preloads; picker buttons render disabled (`line-through`, `cursor-not-allowed`) with explanatory hint when src is unavailable |
| WR-04 | `validMusic` duplicated `BGM_MUSIC` ids | `focus-timer.tsx:65` derives `VALID_MUSIC_IDS` from `BGM_MUSIC.map(m => m.id)` |
| WR-05 | `validAmbient` + `DEFAULT_AMBIENT` duplicated `BGM_AMBIENT` ids | `focus-timer.tsx:62-66` — both derived from `BGM_AMBIENT` |
| WR-06 | `setAmbientVolume` was dead code | Deleted from `lib/timer-bgm.ts` |

Re-review pass also surfaced one new issue, fixed in-line:

| New issue | Fix |
|---|---|
| Lazy `getOrCreate` meant the "unavailable" UI didn't activate until first selection — the disabled state appeared only after the user clicked a missing track | Added `BgmEngine.preload()` (`lib/timer-bgm.ts:71-79`), called from the focus-timer mount effect (`focus-timer.tsx:178-181`). Audio elements + their `error` listeners are wired before any user gesture, so missing files surface immediately on panel open. |

## Findings noted but not fixed (sub-80 confidence)

For transparency:

- `setMusicVolume` fade may truncate an in-flight 300ms crossfade if the user drags the volume slider mid-mood-switch. Edge case; the WeakMap cancellation makes it sound clean even if "wrong".
- Disabled buttons use the HTML `disabled` attribute, which removes them from tab order. Screen reader users can't focus them to hear the `title` hint. Worth `aria-disabled="true"` + click guard in a later pass if accessibility audit demands.
- HTMLAudioElement + event listener accumulation in the module-level singleton — bounded by 7 tracks, only leaks across hot-reload.
- Magic constants `TIME_COL_WIDTH + 100` (mobile) vs `+ 200` (desktop) in `day-scroll-view.tsx` for the "real width arrived" gate.
