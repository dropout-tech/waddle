// Meeting reminder preferences + scanning. Reminder lead time is stored
// in localStorage (per device, like the timer-sound pref) — the actual
// notifications fire via the browser Notification API while the tab is
// open. Service-worker-based "fire even when tab is closed" is out of
// scope for v1.

import type { Task, Workspace } from '@/lib/types'

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
 */
export function getFiredRemindersAndPrune(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(MEETING_REMINDER_FIRED_KEY)
    if (!raw) return new Set()
    const all = JSON.parse(raw) as string[]
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const fresh = all.filter((id) => {
      // ID shape: "<taskId>@YYYY-MM-DDTHH:mm" — extract the date.
      const dateStart = id.indexOf('@')
      if (dateStart < 0) return true
      const dateStr = id.slice(dateStart + 1, dateStart + 11)
      return dateStr >= cutoffStr
    })
    if (fresh.length !== all.length) {
      window.localStorage.setItem(MEETING_REMINDER_FIRED_KEY, JSON.stringify(fresh))
    }
    return new Set(fresh)
  } catch {
    return new Set()
  }
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

/** Pull every meeting (with scheduled date + time) out of the workspace tree. */
export function collectMeetings(workspaces: Workspace[]): MeetingTaskRef[] {
  const out: MeetingTaskRef[] = []
  for (const ws of workspaces) {
    if (ws.isArchived) continue
    for (const cat of ws.categories) {
      if (cat.isArchived) continue
      for (const t of cat.tasks) {
        if (!t.isMeeting) continue
        if (t.isCompleted) continue
        if (!t.scheduledDate || !t.scheduledStartTime || !t.scheduledEndTime) continue
        out.push({
          id: t.id,
          title: t.title,
          scheduledDate: t.scheduledDate,
          scheduledStartTime: t.scheduledStartTime,
          scheduledEndTime: t.scheduledEndTime,
          attendees: t.attendees,
          location: t.location,
          meetingUrl: t.meetingUrl,
          workspaceColor: ws.color,
          workspaceName: ws.name,
          categoryName: cat.name,
        })
      }
    }
  }
  return out
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
