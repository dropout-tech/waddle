// "今日全清" easter egg — trigger logic for the daily-clear celebration.
//
// Kept out of hooks/use-waddle-data.ts (and out of the celebration
// component) so the "is this the moment to celebrate?" rule reads as one
// small, obviously-correct function rather than being buried inside the
// much larger toggleTaskComplete callback. Mirrors the localStorage-guard
// shape used by lib/meeting-reminder.ts and lib/task-sound.ts.

import type { Workspace } from '@/lib/types'

/** Dispatched on `window` when the celebration should play. */
export const DAILY_CLEAR_EVENT = 'waddle:daily-clear'

/**
 * Per-device "already celebrated today" marker. Value is the YYYY-MM-DD
 * date string it last fired on (not just a boolean) so a stale '1' from a
 * previous day never suppresses today's celebration. Same
 * `waddle-<feature>-v1` key shape used elsewhere (e.g. waddle-density-v1).
 */
export const DAILY_CLEAR_FIRED_KEY = 'waddle-daily-clear-fired-v1'

/**
 * True exactly when finishing this one task just cleared the whole day.
 * A task's effective date is `scheduledDate || dueDate` — the same refDate
 * rule unified-task-list.tsx uses to build the "今天" group, so the
 * celebration agrees with what the user sees on screen:
 *
 * - the task that was just completed has an effective date on or before
 *   today (i.e. it belongs to the "今天" group — including overdue tasks
 *   that roll into today), AND
 * - every task in the snapshot with an effective date <= today is now
 *   complete (tasks with no date at all — unscheduled backlog — never
 *   block or count), AND
 * - at least one task's effective date === today, so clearing a day that
 *   only had stale overdue tasks (no real "today") doesn't trigger it.
 *
 * `todayStr` and the date fields are "YYYY-MM-DD", so plain string
 * comparison is correct (same trick toDateString callers rely on
 * elsewhere in this codebase).
 */
export function isDailyClearEligible(
  toggledTaskEffectiveDate: string | undefined,
  snapshot: Workspace[],
  todayStr: string,
): boolean {
  if (!toggledTaskEffectiveDate || toggledTaskEffectiveDate > todayStr) return false

  let hasTaskDueToday = false
  for (const w of snapshot) {
    for (const c of w.categories) {
      for (const t of c.tasks) {
        const effectiveDate = t.scheduledDate || t.dueDate
        if (!effectiveDate || effectiveDate > todayStr) continue
        if (!t.isCompleted) return false
        if (effectiveDate === todayStr) hasTaskDueToday = true
      }
    }
  }
  return hasTaskDueToday
}

/** Has the celebration already fired today, on this device? */
export function hasDailyClearFiredToday(todayStr: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(DAILY_CLEAR_FIRED_KEY) === todayStr
  } catch {
    // localStorage unavailable (private mode, etc.) — treat as "already
    // fired" so a flaky read never causes a duplicate celebration burst.
    return true
  }
}

/** Record that the celebration fired today, so it won't fire again until tomorrow. */
export function markDailyClearFired(todayStr: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DAILY_CLEAR_FIRED_KEY, todayStr)
  } catch {
    /* localStorage unavailable; worst case it fires again today */
  }
}
