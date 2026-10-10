// Quiet hours (勿擾時段) as pure functions — no storage, no React, no Capacitor —
// so the water reminder, the meeting reminders (web / desktop / iOS pre-scheduled)
// and the tests all share one definition of "is this moment quiet".
//
// The saved setting is `user_settings.notifications.quietHours` (lib/types.ts
// NotificationSettings): { enabled, startTime "HH:mm", endTime "HH:mm", allowUrgent }.
//
// Rules (decided with the owner's brief, 2026-10-10):
//  - A window is half-open [start, end) in LOCAL time and may cross midnight
//    (22:00 → 08:00). start === end is an EMPTY window (never quiet) — a
//    mistyped identical pair must not silence a reminder around the clock.
//  - Water reminders are never "urgent": they obey the user's window when quiet
//    hours are on, and a built-in night window (22:00–08:00) when they are off.
//  - Meeting reminders ARE urgent: with allowUrgent (the default) they ignore
//    quiet hours; with allowUrgent off a reminder whose fire time falls inside
//    the window is dropped (not delayed — a delayed meeting reminder would
//    usually land after the meeting started).

export interface QuietHoursSetting {
  enabled: boolean
  startTime: string
  endTime: string
  allowUrgent: boolean
}

/** Minutes after local midnight; end may be < start (window crosses midnight). */
export interface QuietWindow {
  startMin: number
  endMin: number
}

export const DEFAULT_QUIET_HOURS: QuietHoursSetting = {
  enabled: false,
  startTime: '22:00',
  endTime: '08:00',
  allowUrgent: true,
}

/** Water reminders stay quiet at night even when the user never turned 勿擾時段 on. */
export const WATER_NIGHT_WINDOW: QuietWindow = { startMin: 22 * 60, endMin: 8 * 60 }

/** "HH:mm" → minutes after midnight, or null when it is not a valid 24h clock time. */
export function parseClockMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Tolerant reader for the stored blob: older rows may lack `quietHours`, or hold
 * a half-edited value. Anything unusable falls back to the defaults (quiet hours off).
 */
export function resolveQuietHours(raw: unknown): QuietHoursSetting {
  if (!raw || typeof raw !== 'object') return DEFAULT_QUIET_HOURS
  const r = raw as Record<string, unknown>
  return {
    enabled: r.enabled === true,
    startTime: parseClockMinutes(r.startTime) === null ? DEFAULT_QUIET_HOURS.startTime : (r.startTime as string),
    endTime: parseClockMinutes(r.endTime) === null ? DEFAULT_QUIET_HOURS.endTime : (r.endTime as string),
    allowUrgent: r.allowUrgent !== false,
  }
}

/** The user's own window, or null when quiet hours are off / the window is empty. */
export function quietWindowOf(q: QuietHoursSetting): QuietWindow | null {
  if (!q.enabled) return null
  const startMin = parseClockMinutes(q.startTime)
  const endMin = parseClockMinutes(q.endTime)
  if (startMin === null || endMin === null || startMin === endMin) return null
  return { startMin, endMin }
}

/** Window the water reminder obeys: the user's when set, otherwise the built-in night. */
export function waterQuietWindow(q: QuietHoursSetting): QuietWindow {
  return quietWindowOf(q) ?? WATER_NIGHT_WINDOW
}

function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** Is local time `ms` inside the window? [start, end), crossing midnight when end < start. */
export function isInQuietWindow(ms: number, w: QuietWindow | null): boolean {
  if (!w || w.startMin === w.endMin) return false
  const m = minuteOfDay(new Date(ms))
  return w.startMin < w.endMin ? m >= w.startMin && m < w.endMin : m >= w.startMin || m < w.endMin
}

/**
 * `ms` itself when it is outside the window; otherwise the moment the window
 * ends (the next `endMin` on the local clock). Uses calendar arithmetic, not
 * "+N hours", so month/year rollover and DST days land on the right wall-clock time.
 */
export function deferOutOfQuietWindow(ms: number, w: QuietWindow | null): number {
  if (!w || !isInQuietWindow(ms, w)) return ms
  const d = new Date(ms)
  // Crossing window and we are before midnight → it ends tomorrow; otherwise today.
  const dayOffset = w.startMin > w.endMin && minuteOfDay(d) >= w.startMin ? 1 : 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, Math.floor(w.endMin / 60), w.endMin % 60, 0, 0).getTime()
}

/**
 * Should a meeting reminder that would fire at `fireAtMs` be dropped?
 * Only when 勿擾時段 is on, the window is usable, 允許緊急通知 is off, and the fire time is inside it.
 */
export function meetingReminderSuppressed(fireAtMs: number, q: QuietHoursSetting): boolean {
  if (q.allowUrgent) return false
  return isInQuietWindow(fireAtMs, quietWindowOf(q))
}
