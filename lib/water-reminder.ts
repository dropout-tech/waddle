// Water reminder preferences. Lives in localStorage (per device) — same
// pattern as the meeting-reminder lead. Default cadence is 60 minutes
// once enabled; the user can dial it between 30/60/90/120 in settings.
//
// `nextDueAt` is the wall-clock ms when the next popup should appear.
// We persist it (rather than recomputing on mount) so closing/reopening
// the tab doesn't reset the clock — otherwise a quick tab-restart would
// silently push the next nudge a full hour out.

import { deferOutOfQuietWindow, isInQuietWindow, type QuietWindow } from '@/lib/quiet-hours'

export const WATER_REMINDER_ENABLED_KEY = 'waddle.waterReminder.enabled'
export const WATER_REMINDER_INTERVAL_KEY = 'waddle.waterReminder.intervalMinutes'
export const WATER_REMINDER_NEXT_DUE_KEY = 'waddle.waterReminder.nextDueAt'

export const WATER_REMINDER_INTERVALS = [30, 60, 90, 120] as const
export type WaterReminderInterval = (typeof WATER_REMINDER_INTERVALS)[number]
export const DEFAULT_WATER_INTERVAL: WaterReminderInterval = 60
export const SNOOZE_MINUTES = 5
/** After a focus stretch ends the popup waits this long, so the timer's own farewell/screen change lands first. */
export const WATER_AFTER_FOCUS_DELAY_MS = 4_000

/** Any change to the schedule (drink / snooze / toggle / interval) asks the native sync to re-plan
 *  the background reminders now instead of at its next 30 s poll (components/widgets/widget-sync.tsx). */
function requestReminderResync() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new Event('huddle-widget-refresh'))
  } catch {}
}

export function getWaterReminderEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(WATER_REMINDER_ENABLED_KEY)
    // Default ON — the feature is the point; users who don't want it can
    // toggle it off in settings. Treat "never set" as enabled.
    if (raw === null) return true
    return raw === '1'
  } catch {
    return false
  }
}

export function setWaterReminderEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WATER_REMINDER_ENABLED_KEY, enabled ? '1' : '0')
  } catch {}
  requestReminderResync()
}

export function getWaterReminderInterval(): WaterReminderInterval {
  if (typeof window === 'undefined') return DEFAULT_WATER_INTERVAL
  try {
    const raw = window.localStorage.getItem(WATER_REMINDER_INTERVAL_KEY)
    if (!raw) return DEFAULT_WATER_INTERVAL
    const n = parseInt(raw, 10) as WaterReminderInterval
    if ((WATER_REMINDER_INTERVALS as readonly number[]).includes(n)) return n
    return DEFAULT_WATER_INTERVAL
  } catch {
    return DEFAULT_WATER_INTERVAL
  }
}

export function setWaterReminderInterval(minutes: WaterReminderInterval) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WATER_REMINDER_INTERVAL_KEY, String(minutes))
  } catch {}
  requestReminderResync()
}

export function getWaterNextDueAt(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(WATER_REMINDER_NEXT_DUE_KEY)
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function setWaterNextDueAt(ms: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WATER_REMINDER_NEXT_DUE_KEY, String(ms))
  } catch {}
  requestReminderResync()
}

export function scheduleNextWaterReminder(minutes: number = getWaterReminderInterval()): number {
  const next = Date.now() + minutes * 60 * 1000
  setWaterNextDueAt(next)
  return next
}

/** A glass logged on the home-screen widget at `at` (ms): same as tapping
 *  「喝了」 in the app at that moment — the next reminder is one interval later.
 *  Never pulls an already-later reminder (e.g. a newer in-app tap) earlier. */
export function recordWaterFromWidget(at: number) {
  const next = at + getWaterReminderInterval() * 60 * 1000
  const current = getWaterNextDueAt()
  if (current === null || next > current) setWaterNextDueAt(next)
}

// ── Pure scheduling rules (no storage, no React): shared by the in-app popup
//    (hooks/use-water-reminder.ts) and the iOS background chain
//    (lib/widgets/reminders.ts), and unit-tested in scripts/tests/water-reminder-schedule.test.mjs.

/** A focus stretch is on: the pomodoro work phase or the stopwatch, actually counting (not paused, not a break). */
export function isFocusRunning(state: string | undefined, phase: string | undefined): boolean {
  return state === 'running' && phase === 'work'
}

export type WaterVerdict = 'wait' | 'quiet' | 'focus' | 'show'

/**
 * What the popup should do right now.
 *  wait  — not due yet
 *  quiet — due, but inside the quiet window: keep the stored due time, show when the window ends
 *  focus — due, but a focus stretch is running (or just ended): hold it, show after
 *  show  — due and free to appear
 * Quiet outranks focus so nothing is shown (or marked "after focus") at night.
 */
export function waterReminderVerdict(p: { now: number; due: number; quiet: QuietWindow; focusBusy: boolean }): WaterVerdict {
  if (p.now < p.due) return 'wait'
  if (isInQuietWindow(p.now, p.quiet)) return 'quiet'
  if (p.focusBusy) return 'focus'
  return 'show'
}

/** The stored due time, pushed to the end of the quiet window when it lands inside one (what widgets display). */
export function effectiveWaterDueAt(due: number | null, quiet: QuietWindow): number | null {
  return due === null ? null : deferOutOfQuietWindow(due, quiet)
}

/**
 * Times (ms) to pre-schedule as iOS background notifications, soonest first.
 * One every `intervalMin`, each one pushed out of the quiet window (a step that lands
 * inside it becomes the window's end, and the next step counts from there — the same
 * thing that happens in-app when the user taps 喝了 at that moment).
 *  - already due: it is on screen in the app, so the chain starts one interval from now;
 *  - a focus stretch ending at `focusEndsAt` (pomodoro, running) holds anything earlier
 *    until just after it ends.
 */
export function planWaterReminders(p: {
  nextDueAt: number | null
  now: number
  intervalMin: number
  quiet: QuietWindow | null
  max: number
  focusEndsAt?: number | null
}): number[] {
  if (p.nextDueAt === null || p.max <= 0) return []
  const step = Math.max(1, p.intervalMin) * 60_000
  let t = p.nextDueAt
  if (p.focusEndsAt != null && p.focusEndsAt > p.now) t = Math.max(t, p.focusEndsAt + WATER_AFTER_FOCUS_DELAY_MS)
  if (t <= p.now) t = p.now + step
  t = deferOutOfQuietWindow(t, p.quiet)
  const out: number[] = []
  while (out.length < p.max) {
    out.push(t)
    t = deferOutOfQuietWindow(t + step, p.quiet)
  }
  return out
}
