// Platform-branching notification facade.
//
// Web keeps the existing "fire a Notification while the tab is open" behaviour
// (see hooks/use-meeting-reminders.ts). Native (Capacitor) instead SCHEDULES
// local notifications ahead of time, so meeting reminders fire even when the
// app is backgrounded or closed — the genuine native capability that makes the
// iOS build more than a wrapped website (App Store Guideline 4.2).

import { isNative } from '@/lib/platform'
import {
  ensureNotificationPermission,
  meetingStartAsDate,
  type MeetingTaskRef,
  type ReminderLead,
} from '@/lib/meeting-reminder'

// iOS allows at most 64 pending local notifications; stay comfortably under.
const MAX_SCHEDULED = 60

/** Stable positive 31-bit int from a reminder-id string (LocalNotifications needs integer ids). */
function hashId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  }
  return (Math.abs(h) % 2147483646) + 1
}

const trim = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Request notification permission. Branches to the native permission prompt on
 * Capacitor, or the Web Notification API prompt on web. Must be called from a
 * user gesture (the settings toggle).
 */
export async function requestReminderPermission(): Promise<boolean> {
  if (isNative()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const res = await LocalNotifications.requestPermissions()
    return res.display === 'granted'
  }
  return ensureNotificationPermission()
}

let tapHandlerRegistered = false

/** Open the meeting URL (if any) when a scheduled reminder is tapped. */
async function ensureTapHandler() {
  if (tapHandlerRegistered) return
  tapHandlerRegistered = true
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  await LocalNotifications.addListener('localNotificationActionPerformed', async (action) => {
    const url = action.notification.extra?.meetingUrl as string | undefined
    if (url) {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url }).catch(() => {})
    }
  })
}

/**
 * Reconcile scheduled native reminders with the current set of meetings.
 * Cancels all previously scheduled reminders and re-schedules the upcoming
 * ones (future fire-times only, capped at MAX_SCHEDULED). No-op on web.
 */
export async function syncMeetingReminders(
  meetings: MeetingTaskRef[],
  lead: ReminderLead,
): Promise<void> {
  if (!isNative()) return

  const { LocalNotifications } = await import('@capacitor/local-notifications')

  // Always clear what we previously scheduled (this app only uses local
  // notifications for meeting reminders, so clearing all pending is safe).
  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    })
  }

  if (lead === null) return

  const perm = await LocalNotifications.checkPermissions()
  if (perm.display !== 'granted') return

  const now = Date.now()
  const leadMs = lead * 60 * 1000

  const upcoming = meetings
    .map((m) => {
      const start = meetingStartAsDate(m)
      return start ? { m, fireAt: start.getTime() - leadMs } : null
    })
    .filter((x): x is { m: MeetingTaskRef; fireAt: number } => x !== null && x.fireAt > now)
    .sort((a, b) => a.fireAt - b.fireAt)
    .slice(0, MAX_SCHEDULED)

  if (upcoming.length === 0) return

  await ensureTapHandler()

  await LocalNotifications.schedule({
    notifications: upcoming.map(({ m, fireAt }) => {
      const reminderId = `${m.id}@${m.scheduledDate}T${m.scheduledStartTime}`
      const bodyLines = [`${m.scheduledStartTime} 開始（${lead} 分鐘後）`]
      if (m.location) bodyLines.push(`地點：${trim(m.location, 80)}`)
      if (m.attendees) bodyLines.push(`參與者：${trim(m.attendees, 120)}`)
      return {
        id: hashId(reminderId),
        title: `會議提醒 · ${trim(m.title, 80) || '會議'}`,
        body: bodyLines.join('\n'),
        schedule: { at: new Date(fireAt) },
        extra: { kind: 'meeting', meetingUrl: m.meetingUrl ?? null },
      }
    }),
  })
}
