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
//  - Water reminders are never "urgent": they stay quiet during the built-in night
//    (22:00–08:00, always) AND during the user's own 勿擾時段 when that is on — the
//    UNION of the two. (A 12:00–13:00 lunch window must not switch the night off.)
//    If that union would leave no free minute at all (e.g. the user sleeps 08:00–22:00),
//    the built-in night is dropped and the user's window alone applies, so the
//    reminder can still appear when they are awake.
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

/** Water reminders stay quiet at night whatever the user's 勿擾時段 says. */
export const WATER_NIGHT_WINDOW: QuietWindow = { startMin: 22 * 60, endMin: 8 * 60 }

/** One window, several (their union), or none. */
export type QuietSpec = QuietWindow | readonly QuietWindow[] | null

const windowsOf = (w: QuietSpec): readonly QuietWindow[] => (w === null ? [] : 'startMin' in w ? [w] : w)

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

function inWindowAt(minute: number, w: QuietWindow): boolean {
  if (w.startMin === w.endMin) return false
  return w.startMin < w.endMin ? minute >= w.startMin && minute < w.endMin : minute >= w.startMin || minute < w.endMin
}

/** Do these windows together cover every minute of the day? */
function coversWholeDay(ws: readonly QuietWindow[]): boolean {
  for (let m = 0; m < 24 * 60; m++) if (!ws.some((w) => inWindowAt(m, w))) return false
  return true
}

/**
 * Windows the water reminder obeys: the built-in night, plus the user's own 勿擾時段 when it is on
 * (union — see the header). Falls back to the user's window alone if the union would cover the whole day.
 */
export function waterQuietWindows(q: QuietHoursSetting): readonly QuietWindow[] {
  const mine = quietWindowOf(q)
  if (!mine) return [WATER_NIGHT_WINDOW]
  const both = [WATER_NIGHT_WINDOW, mine]
  return coversWholeDay(both) ? [mine] : both
}

function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** Is local time `ms` inside the window (or any of them)? [start, end), crossing midnight when end < start. */
export function isInQuietWindow(ms: number, w: QuietSpec): boolean {
  const minute = minuteOfDay(new Date(ms))
  return windowsOf(w).some((x) => inWindowAt(minute, x))
}

/** The moment the window containing `ms` ends: the next `endMin` on the local clock. Calendar arithmetic, not "+N hours". */
function endOfWindow(ms: number, w: QuietWindow): number {
  const d = new Date(ms)
  // Crossing window and we are before midnight → it ends tomorrow; otherwise today.
  const dayOffset = w.startMin > w.endMin && minuteOfDay(d) >= w.startMin ? 1 : 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, Math.floor(w.endMin / 60), w.endMin % 60, 0, 0).getTime()
}

/**
 * `ms` itself when it is outside every window; otherwise the first moment after `ms` that is outside all of
 * them (month/year rollover and DST days land on the right wall-clock time). Windows that touch or overlap
 * chain: 06:00 with a 22–08 night and a 07–09 user window resolves to 09:00.
 */
export function deferOutOfQuietWindow(ms: number, w: QuietSpec): number {
  const list = windowsOf(w)
  let t = ms
  for (let hop = 0; hop < 8; hop++) {
    const minute = minuteOfDay(new Date(t))
    const hit = list.find((x) => inWindowAt(minute, x))
    if (!hit) return t
    t = endOfWindow(t, hit)
  }
  return t
}

/**
 * Should a meeting reminder that would fire at `fireAtMs` be dropped?
 * Only when 勿擾時段 is on, the window is usable, 允許緊急通知 is off, and the fire time is inside it.
 */
export function meetingReminderSuppressed(fireAtMs: number, q: QuietHoursSetting): boolean {
  if (q.allowUrgent) return false
  return isInQuietWindow(fireAtMs, quietWindowOf(q))
}
