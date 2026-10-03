// Platform-branching notification facade.
//
// Web keeps the existing "fire a Notification while the tab is open" behaviour
// (see hooks/use-meeting-reminders.ts). Native (Capacitor) instead SCHEDULES
// local notifications ahead of time, so meeting reminders fire even when the
// app is backgrounded or closed — the genuine native capability that makes the
// iOS build more than a wrapped website (App Store Guideline 4.2).

import { desktopNotificationsEnabled } from '@/lib/desktop-notifications'
import { isNative } from '@/lib/platform'
import {
  ensureNotificationPermission,
  meetingStartAsDate,
  type MeetingTaskRef,
  type ReminderLead,
} from '@/lib/meeting-reminder'
import { t } from '@/lib/i18n'
import { petVoiced } from '@/lib/pet/voice'

// iOS allows at most 64 pending local notifications; stay comfortably under.
const MAX_SCHEDULED = 48

// Notification id ranges are disjoint by construction so kinds can never overwrite
// each other: meeting reminders 1..2_000_000_000, follow-up reminders
// 2_000_000_001..2_099_999_999, widget reminders 2_100_000_001 and up (lib/widgets/reminders.ts).
const MEETING_ID_SPAN = 2_000_000_000
const FOLLOWUP_ID_BASE = 2_000_000_001
const FOLLOWUP_ID_SPAN = 99_999_999

function rawHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Stable positive int from a reminder-id string (LocalNotifications needs integer ids). */
function hashId(s: string): number {
  return (rawHash(s) % (MEETING_ID_SPAN - 1)) + 1
}

const trim = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Request notification permission. Branches to the native permission prompt on
 * Capacitor, or the Web Notification API prompt on web. Must be called from a
 * user gesture (the settings toggle).
 */
export async function requestReminderPermission(): Promise<boolean> {
  if (typeof window !== 'undefined' && window.huddleDesktop?.isDesktop) return desktopNotificationsEnabled()
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
    const route = action.notification.extra?.route as string | undefined
    if (route && route.startsWith('/') && !route.startsWith('//')) {
      window.location.assign(route)
      return
    }
    const url = action.notification.extra?.meetingUrl as string | undefined
    if (url) {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url }).catch(() => {})
    }
  })
}

/**
 * Reconcile scheduled native reminders with the current set of meetings.
 * Cancels previously scheduled meeting reminders and re-schedules the upcoming
 * ones (future fire-times only, capped at MAX_SCHEDULED). No-op on web.
 */
export async function syncMeetingReminders(
  meetings: MeetingTaskRef[],
  lead: ReminderLead,
): Promise<void> {
  if (!isNative()) return

  const { LocalNotifications } = await import('@capacitor/local-notifications')

  // Reconcile only meetings; focus and water reminders have their own namespace.
  const pending = await LocalNotifications.getPending()
  const meetingsOnly = pending.notifications.filter(n => n.extra?.kind === 'meeting')
  if (meetingsOnly.length > 0) {
    await LocalNotifications.cancel({
      notifications: meetingsOnly.map((n) => ({ id: n.id })),
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
      const bodyLines = [t('{time} 開始（{lead} 分鐘後）', { time: m.scheduledStartTime, lead })]
      if (m.location) bodyLines.push(t('地點：{location}', { location: trim(m.location, 80) }))
      if (m.attendees) bodyLines.push(t('參與者：{attendees}', { attendees: trim(m.attendees, 120) }))
      // Said by the adopted penguin when there is one (lib/pet/voice.ts); wording only.
      const text = petVoiced({ title: t('會議提醒 · {title}', { title: trim(m.title, 80) || t('會議') }), body: bodyLines.join('\n') })
      return {
        id: hashId(reminderId),
        title: text.title,
        body: text.body,
        schedule: { at: new Date(fireAt) },
        extra: { kind: 'meeting', meetingUrl: m.meetingUrl ?? null },
      }
    }),
  })
}

// iOS keeps at most 64 pending local notifications: 48 meeting + 2 widget + this cap stays under.
const MAX_FOLLOWUPS = 10
const FOLLOWUP_HOUR = 9

export interface FollowupReminderItem {
  task_id: string
  title: string
  due_date: string | null
  is_completed: boolean
  counterpart: string | null
}

/**
 * Reconcile native "chase it today" notifications with the open meeting follow-ups:
 * one per follow-up task that has a due date and is not done, at 09:00 on the due day
 * (only if that moment is still ahead). Everything of kind 'followup' is cancelled and
 * re-scheduled as a batch, so a finished / deleted task or a changed due date disappears
 * on the next sync (app open, or any data refetch). No-op on web. Needs the existing
 * notification permission; never asks for it.
 */
export async function syncFollowupReminders(items: FollowupReminderItem[]): Promise<void> {
  if (!isNative()) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')

  const pending = await LocalNotifications.getPending()
  const mine = pending.notifications.filter((n) => n.extra?.kind === 'followup')
  if (mine.length > 0) {
    await LocalNotifications.cancel({ notifications: mine.map((n) => ({ id: n.id })) })
  }

  const perm = await LocalNotifications.checkPermissions()
  if (perm.display !== 'granted') return

  const now = Date.now()
  const due = items
    .filter((f) => f.due_date && !f.is_completed && /^\d{4}-\d{2}-\d{2}$/.test(f.due_date))
    .map((f) => {
      const at = new Date(`${f.due_date}T${String(FOLLOWUP_HOUR).padStart(2, '0')}:00:00`)
      return { f, at }
    })
    .filter(({ at }) => at.getTime() > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_FOLLOWUPS)
  if (due.length === 0) return

  await ensureTapHandler()
  await LocalNotifications.schedule({
    notifications: due.map(({ f, at }) => {
      const who = trim(f.counterpart ?? '', 40)
      const what = trim(f.title, 80)
      const text = petVoiced({
        title: t('追蹤提醒'),
        body: who
          ? t('今天要追：{who} — {what}', { who, what })
          : t('今天要追：{what}', { what }),
      })
      return {
        id: FOLLOWUP_ID_BASE + (rawHash(`followup:${f.task_id}`) % FOLLOWUP_ID_SPAN),
        title: text.title,
        body: text.body,
        schedule: { at },
        extra: { kind: 'followup', route: '/meetings/' },
      }
    }),
  })
}
