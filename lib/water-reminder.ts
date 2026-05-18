// Water reminder preferences. Lives in localStorage (per device) — same
// pattern as the meeting-reminder lead. Default cadence is 60 minutes
// once enabled; the user can dial it between 30/60/90/120 in settings.
//
// `nextDueAt` is the wall-clock ms when the next popup should appear.
// We persist it (rather than recomputing on mount) so closing/reopening
// the tab doesn't reset the clock — otherwise a quick tab-restart would
// silently push the next nudge a full hour out.

export const WATER_REMINDER_ENABLED_KEY = 'waddle.waterReminder.enabled'
export const WATER_REMINDER_INTERVAL_KEY = 'waddle.waterReminder.intervalMinutes'
export const WATER_REMINDER_NEXT_DUE_KEY = 'waddle.waterReminder.nextDueAt'

export const WATER_REMINDER_INTERVALS = [30, 60, 90, 120] as const
export type WaterReminderInterval = (typeof WATER_REMINDER_INTERVALS)[number]
export const DEFAULT_WATER_INTERVAL: WaterReminderInterval = 60
export const SNOOZE_MINUTES = 5

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
}

export function scheduleNextWaterReminder(minutes: number = getWaterReminderInterval()): number {
  const next = Date.now() + minutes * 60 * 1000
  setWaterNextDueAt(next)
  return next
}
