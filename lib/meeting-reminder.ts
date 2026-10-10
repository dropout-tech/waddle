// Meeting reminder preferences + scanning. Reminder lead time is stored
// in localStorage (per device, like the timer-sound pref) — the actual
// notifications fire via the browser Notification API while the tab is
// open. Service-worker-based "fire even when tab is closed" is out of
// scope for v1.

import type { Task, Workspace } from '@/lib/types'
import { forEachTask } from '@/lib/task-utils'
import { parseDateString, taskOccursOnDate, toDateString } from '@/lib/calendar-utils'
import { meetingReminderSuppressed, type QuietHoursSetting } from '@/lib/quiet-hours'

export const MEETING_REMINDER_PREF_KEY = 'waddle.meetingReminder.minutes'
export const MEETING_REMINDER_FIRED_KEY = 'waddle.meetingReminder.fired'

/** Allowed lead times (minutes). null = off. */
export type ReminderLead = 5 | 10 | 15 | null

export function getReminderLead(): ReminderLead {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(MEETING_REMINDER_PREF_KEY)
    if (!raw) return null
    const n = parseInt(raw, 10)
    if (n === 5 || n === 10 || n === 15) return n
    return null
  } catch {
    return null
  }
}

export function setReminderLead(lead: ReminderLead) {
  if (typeof window === 'undefined') return
  try {
    if (lead === null) {
      window.localStorage.removeItem(MEETING_REMINDER_PREF_KEY)
    } else {
      window.localStorage.setItem(MEETING_REMINDER_PREF_KEY, String(lead))
    }
  } catch {}
}

/**
 * Read the set of reminder IDs we've already fired. We also prune anything
 * older than 7 days on every read so localStorage doesn't grow unbounded
 * over time. Reminder IDs encode the meeting date, so old entries are
 * easy to date-check.
 *
 * If the stored JSON is corrupted, we *delete* the key (rather than
 * silently returning an empty set on every call). Otherwise the same
 * parse failure on every 30-second poll would mean every in-window
 * meeting re-fires forever until the user dismisses the start time.
 */
export function getFiredRemindersAndPrune(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  const raw = (() => {
    try {
      return window.localStorage.getItem(MEETING_REMINDER_FIRED_KEY)
    } catch {
      return null
    }
  })()
  if (!raw) return new Set()
  let all: string[]
  try {
    all = JSON.parse(raw) as string[]
    if (!Array.isArray(all)) throw new Error('not an array')
  } catch {
    // Corrupted blob — wipe so the next poll starts clean rather than
    // re-firing every meeting every 30 seconds.
    try {
      window.localStorage.removeItem(MEETING_REMINDER_FIRED_KEY)
    } catch {}
    return new Set()
  }
  // Cutoff date in LOCAL time. Reminder IDs encode the meeting's
  // scheduledDate which is local-Y-M-D — using toISOString() would
  // shift by up to a day in non-UTC zones (Taiwan is UTC+8).
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  const cutoffStr = toDateString(cutoff)
  const fresh = all.filter((id) => {
    // ID shape: "<taskId>@YYYY-MM-DDTHH:mm" — extract the date.
    const dateStart = id.indexOf('@')
    if (dateStart < 0) return true
    const dateStr = id.slice(dateStart + 1, dateStart + 11)
    return dateStr >= cutoffStr
  })
  if (fresh.length !== all.length) {
    try {
      window.localStorage.setItem(MEETING_REMINDER_FIRED_KEY, JSON.stringify(fresh))
    } catch {}
  }
  return new Set(fresh)
}

export function persistFiredReminders(set: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MEETING_REMINDER_FIRED_KEY, JSON.stringify([...set]))
  } catch {}
}

export interface MeetingTaskRef {
  id: string
  title: string
  scheduledDate: string
  scheduledStartTime: string
  scheduledEndTime: string
  attendees?: string
  location?: string
  meetingUrl?: string
  workspaceColor: string
  workspaceName: string
  categoryName: string
}

/** How many days ahead (today included) recurring meetings are expanded into separate occurrences. */
export const MEETING_LOOKAHEAD_DAYS = 7

/**
 * Pull every meeting (with scheduled date + time) out of the workspace tree.
 *
 * A recurring series is stored once, as its first meeting, and the calendar draws
 * the later ones virtually (calendar-utils `taskOccursOnDate`). Reminders and the
 * penguin need every occurrence, so a recurring master is expanded here into one
 * ref per occurrence in the next `days` days (default MEETING_LOOKAHEAD_DAYS, today
 * included): `scheduledDate` is the occurrence's own date, `id` stays the series
 * master's so callers can still look the task up. Deleted/moved occurrences
 * (`exdates`) and the series end date are honoured by the same rule the calendar uses.
 * Past occurrences of a series are dropped; a series whose first meeting is further
 * out than the window keeps that first meeting. One-off meetings are returned as before.
 */
export function collectMeetings(
  workspaces: Workspace[],
  opts: { now?: Date; days?: number } = {},
): MeetingTaskRef[] {
  const days = Math.max(1, opts.days ?? MEETING_LOOKAHEAD_DAYS)
  const now = opts.now ?? new Date()
  const windowDates: Date[] = []
  for (let i = 0; i < days; i++) windowDates.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i))
  const windowStrs = windowDates.map(toDateString)
  const lastDay = windowStrs[windowStrs.length - 1]

  const out: MeetingTaskRef[] = []
  forEachTask(workspaces, (t, cat, ws) => {
    if (!t.isMeeting) return
    if (t.isCompleted) return
    if (!t.scheduledDate || !t.scheduledStartTime || !t.scheduledEndTime) return
    const ref = (scheduledDate: string): MeetingTaskRef => ({
      id: t.id,
      title: t.title,
      scheduledDate,
      scheduledStartTime: t.scheduledStartTime!,
      scheduledEndTime: t.scheduledEndTime!,
      attendees: t.attendees,
      location: t.location,
      meetingUrl: t.meetingUrl,
      workspaceColor: ws.color,
      workspaceName: ws.name,
      categoryName: cat.name,
    })
    if (!t.isRecurring || !t.recurrence) {
      out.push(ref(t.scheduledDate))
      return
    }
    // Series master. Its own first meeting only matters when it lies beyond the
    // window (inside the window the loop below emits it); past ones are over.
    if (t.scheduledDate > lastDay && taskOccursOnDate(t, parseDateString(t.scheduledDate))) out.push(ref(t.scheduledDate))
    for (let i = 0; i < windowDates.length; i++) {
      if (taskOccursOnDate(t, windowDates[i])) out.push(ref(windowStrs[i]))
    }
  })
  return out
}

/** "<task id>@YYYY-MM-DDTHH:mm" — one meeting occurrence (a series' task id repeats, its date does not). */
export function meetingOccurrenceKey(m: Pick<MeetingTaskRef, 'id' | 'scheduledDate' | 'scheduledStartTime'>): string {
  return `${m.id}@${m.scheduledDate}T${m.scheduledStartTime}`
}

/**
 * Web/desktop "already reminded" key: the occurrence plus the lead time it was
 * reminded at, so changing 5→15 minutes can remind again. The `<id>@<date>` prefix
 * is what getFiredRemindersAndPrune() reads the date from — keep it first.
 */
export function meetingFiredKey(m: Pick<MeetingTaskRef, 'id' | 'scheduledDate' | 'scheduledStartTime'>, lead: number): string {
  return `${meetingOccurrenceKey(m)}#${lead}`
}

/** Fired-set lookup that also honours keys written before the lead was part of the key. */
export function wasMeetingReminded(fired: ReadonlySet<string>, m: Pick<MeetingTaskRef, 'id' | 'scheduledDate' | 'scheduledStartTime'>, lead: number): boolean {
  return fired.has(meetingFiredKey(m, lead)) || fired.has(meetingOccurrenceKey(m))
}

/**
 * Is it time to remind about a meeting starting at `startMs`, `lead` minutes ahead?
 * Inside [start − lead, start), and not dropped by 勿擾時段 (judged at the moment the
 * reminder is *due*, so every platform makes the same call for the same meeting).
 */
export function isMeetingReminderDue(p: { startMs: number; lead: number; now: number; quiet: QuietHoursSetting }): boolean {
  const reminderAt = p.startMs - p.lead * 60_000
  if (p.now < reminderAt || p.now >= p.startMs) return false
  return !meetingReminderSuppressed(reminderAt, p.quiet)
}

/**
 * The penguin's "a meeting is about to start" line: the earliest meeting that begins
 * within `leadMs` and has not been announced yet. Announcements are tracked per
 * occurrence (not per day), so a second meeting the same day still gets its own line.
 */
export function pickMeetingNudge(
  meetings: MeetingTaskRef[],
  nudgedKeys: readonly string[] | undefined,
  nowMs: number,
  leadMs: number,
): { meeting: MeetingTaskRef; untilMs: number } | null {
  const done = new Set(nudgedKeys ?? [])
  let best: { meeting: MeetingTaskRef; untilMs: number } | null = null
  for (const m of meetings) {
    const start = meetingStartAsDate(m)?.getTime()
    if (start === undefined) continue
    const untilMs = start - nowMs
    if (untilMs <= 0 || untilMs > leadMs) continue
    if (done.has(meetingOccurrenceKey(m))) continue
    if (!best || untilMs < best.untilMs) best = { meeting: m, untilMs }
  }
  return best
}

/** Add an announced occurrence to the remembered list, dropping entries dated before `todayStr` (and capping the size). */
export function rememberNudgedMeeting(keys: readonly string[] | undefined, key: string, todayStr: string): string[] {
  const kept = (keys ?? []).filter((k) => {
    const at = k.indexOf('@')
    return at < 0 || k.slice(at + 1, at + 11) >= todayStr
  })
  if (!kept.includes(key)) kept.push(key)
  return kept.slice(-40)
}

/** Parse "YYYY-MM-DD" + "HH:mm" into a Date in local time. */
export function meetingStartAsDate(m: Pick<Task, 'scheduledDate' | 'scheduledStartTime'>): Date | null {
  if (!m.scheduledDate || !m.scheduledStartTime) return null
  const [y, mo, d] = m.scheduledDate.split('-').map(Number)
  const [hh, mm] = m.scheduledStartTime.split(':').map(Number)
  return new Date(y, mo - 1, d, hh, mm, 0, 0)
}

/**
 * Browsers gate Notification.requestPermission() on a user gesture — call
 * this from a button click handler, not on mount. Returns whether
 * permission is now granted.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}
