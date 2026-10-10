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
  meetingOccurrenceKey,
  meetingStartAsDate,
  type MeetingTaskRef,
  type ReminderLead,
} from '@/lib/meeting-reminder'
import { meetingReminderSuppressed, resolveQuietHours, type QuietHoursSetting } from '@/lib/quiet-hours'
import { MAX_FOLLOWUP_REMINDERS, MAX_MEETING_REMINDERS } from '@/lib/notifications/budget'
import type { PlanningReminderConfig } from '@/lib/notifications/daily-planning'
import { t } from '@/lib/i18n'
import { petVoiced } from '@/lib/pet/voice'

// iOS allows at most 64 pending local notifications. Each kind's share lives in
// lib/notifications/budget.ts (the meeting share is derived so the sum cannot pass 64).

// Notification id ranges are disjoint by construction so kinds can never overwrite
// each other: meeting reminders 1..2_000_000_000, follow-up reminders
// 2_000_000_001..2_099_999_999, widget reminders 2_100_000_001..2_100_000_013 (focus + the water chain,
// lib/widgets/reminders.ts), and the one repeating 每日規劃提醒 at 2_110_000_001 (all below 2^31).
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

// ── Whose notifications are these? ──
// Meeting and follow-up reminders carry the title of someone's private meeting, and a
// scheduled iOS notification outlives the session that created it. Each one is tagged
// with the account that scheduled it (`extra.accountId`); setReminderAccount() — called
// by the auth provider — cancels the ones that are not the current account's.
//
// Three states, because "no session yet" is not "signed out":
//   undefined  not known (cold start before the session resolves, or it could not be read —
//              e.g. an expired token and no network). Everything pending is LEFT ALONE and
//              nothing is rescheduled, so a flaky start never wipes the user's reminders.
//   null       explicitly signed out (SIGNED_OUT). Their notifications are cancelled.
//   string     the signed-in user id. Other accounts' notifications are cancelled.
let reminderAccount: string | null | undefined = undefined

/** The plugin calls below run one job at a time, so a cancel can never interleave with a half-done schedule. */
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job)
  queue = run.catch(() => {})
  return run
}

const ACCOUNT_SCOPED_KINDS = ['meeting', 'followup', 'planning']

/** Which pending notifications must go when the signed-in account becomes `account` (null = nobody). Pure. */
export function foreignReminderIds(
  pending: { id: number; extra?: Record<string, unknown> | null }[],
  account: string | null,
): number[] {
  return pending
    .filter((n) => ACCOUNT_SCOPED_KINDS.includes(String(n.extra?.kind)) && (account === null || n.extra?.accountId !== account))
    .map((n) => n.id)
}

/**
 * Tell the reminder layer who is signed in (a user id), or that they explicitly signed out (null).
 * Cancels every pending meeting / follow-up notification that does not belong to that account — untagged
 * ones left by an older app version included. Repeating the same answer (every TOKEN_REFRESHED) costs nothing.
 * Native only (web schedules nothing ahead). Never call it with null just because a session is missing:
 * use onAuthEventForReminders().
 */
export async function setReminderAccount(account: string | null): Promise<void> {
  const unchanged = reminderAccount === account
  reminderAccount = account
  if (!isNative() || unchanged) return
  await serial(async () => {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const pending = await LocalNotifications.getPending()
    const ids = foreignReminderIds(pending.notifications, account)
    if (ids.length > 0) await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) })
  })
}

/** What an auth event means for the reminder owner. Pure. */
export function reminderAccountChange(event: string, userId: string | null | undefined): { kind: 'set'; id: string } | { kind: 'clear' } | { kind: 'keep' } {
  // Any event that carries a session names the user — TOKEN_REFRESHED included, which is how a cold
  // start that began offline (no session yet) recovers once the token is refreshed.
  if (userId) return { kind: 'set', id: userId }
  // No session is only "signed out" when Supabase says so; INITIAL_SESSION with null can simply mean
  // an expired token that could not be refreshed yet.
  return event === 'SIGNED_OUT' ? { kind: 'clear' } : { kind: 'keep' }
}

/** The auth provider's single entry point: apply reminderAccountChange() for an auth event (or the initial getSession). */
export async function onAuthEventForReminders(event: string, userId: string | null | undefined): Promise<void> {
  const change = reminderAccountChange(event, userId)
  if (change.kind === 'set') await setReminderAccount(change.id)
  else if (change.kind === 'clear') await setReminderAccount(null)
}

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
 * ones (future fire-times only, capped at MAX_MEETING_REMINDERS, soonest first).
 * `meetings` should come from collectMeetings(), which expands a recurring series
 * into one entry per occurrence; each occurrence gets its own stable notification
 * id (hash of "<task id>@<date>T<time>"). `quietHours` is the saved 勿擾時段:
 * meetings are "urgent", so only with 允許緊急通知 off are the reminders that would
 * fire inside the window left out. No-op on web.
 */
export function syncMeetingReminders(
  meetings: MeetingTaskRef[],
  lead: ReminderLead,
  quietHours?: unknown,
): Promise<void> {
  if (!isNative()) return Promise.resolve()
  const account = reminderAccount
  const quiet = resolveQuietHours(quietHours)
  return serial(() => scheduleMeetingReminders(meetings, lead, quiet, account))
}

async function scheduleMeetingReminders(
  meetings: MeetingTaskRef[],
  lead: ReminderLead,
  quiet: QuietHoursSetting,
  account: string | null | undefined,
): Promise<void> {
  // Who is signed in is not known yet: neither cancel nor reschedule — what is pending stays as it is.
  if (account === undefined) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')

  // Reconcile only meetings; focus and water reminders have their own namespace.
  const pending = await LocalNotifications.getPending()
  const meetingsOnly = pending.notifications.filter(n => n.extra?.kind === 'meeting')
  if (meetingsOnly.length > 0) {
    await LocalNotifications.cancel({
      notifications: meetingsOnly.map((n) => ({ id: n.id })),
    })
  }

  if (lead === null || !account) return

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
    .filter(({ fireAt }) => !meetingReminderSuppressed(fireAt, quiet))
    .sort((a, b) => a.fireAt - b.fireAt)
    .slice(0, MAX_MEETING_REMINDERS)

  if (upcoming.length === 0) return

  await ensureTapHandler()

  // Signed out (or switched account) while we waited on the plugin: schedule nothing.
  if (reminderAccount !== account) return

  await LocalNotifications.schedule({
    notifications: upcoming.map(({ m, fireAt }) => {
      const reminderId = meetingOccurrenceKey(m)
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
        extra: { kind: 'meeting', meetingUrl: m.meetingUrl ?? null, accountId: account },
      }
    }),
  })
}

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
export function syncFollowupReminders(items: FollowupReminderItem[]): Promise<void> {
  if (!isNative()) return Promise.resolve()
  const account = reminderAccount
  return serial(() => scheduleFollowupReminders(items, account))
}

async function scheduleFollowupReminders(items: FollowupReminderItem[], account: string | null | undefined): Promise<void> {
  if (account === undefined) return // see scheduleMeetingReminders
  const { LocalNotifications } = await import('@capacitor/local-notifications')

  const pending = await LocalNotifications.getPending()
  const mine = pending.notifications.filter((n) => n.extra?.kind === 'followup')
  if (mine.length > 0) {
    await LocalNotifications.cancel({ notifications: mine.map((n) => ({ id: n.id })) })
  }

  if (!account) return
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
    .slice(0, MAX_FOLLOWUP_REMINDERS)
  if (due.length === 0) return

  await ensureTapHandler()
  if (reminderAccount !== account) return
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
        extra: { kind: 'followup', route: '/meetings/', accountId: account },
      }
    }),
  })
}

// ── 每日規劃提醒 ──

/** The single repeating 每日規劃提醒 (one repeating request = one slot of the iOS budget). */
export const PLANNING_REMINDER_ID = 2_110_000_001
/** Opened by tapping the notification: the home screen. */
const PLANNING_ROUTE = '/'

/**
 * Keep the iOS 每日規劃提醒 in step with the saved settings: when `cfg.enabled`, ONE notification that repeats
 * every day at `cfg.time` (local wall-clock time, so travel and DST follow the phone); otherwise none. The text is
 * fixed and carries no numbers (a pre-scheduled number would be stale by the time it fires). It is the user's own
 * alarm, so 勿擾時段 is not consulted. Replaces whatever 'planning' notification is pending, so changing the time
 * or switching it off takes effect at once; signing out removes it (kind 'planning' is account-scoped, see
 * setReminderAccount). Needs the existing notification permission; never asks for it. No-op on web.
 */
export function syncDailyPlanningReminder(cfg: Pick<PlanningReminderConfig, 'enabled' | 'hour' | 'minute'>): Promise<void> {
  if (!isNative()) return Promise.resolve()
  const account = reminderAccount
  return serial(() => scheduleDailyPlanning(cfg, account))
}

async function scheduleDailyPlanning(
  cfg: Pick<PlanningReminderConfig, 'enabled' | 'hour' | 'minute'>,
  account: string | null | undefined,
): Promise<void> {
  if (account === undefined) return // see scheduleMeetingReminders
  const { LocalNotifications } = await import('@capacitor/local-notifications')

  const pending = await LocalNotifications.getPending()
  const mine = pending.notifications.filter((n) => n.extra?.kind === 'planning')
  if (mine.length > 0) await LocalNotifications.cancel({ notifications: mine.map((n) => ({ id: n.id })) })

  if (!account || !cfg.enabled) return
  const perm = await LocalNotifications.checkPermissions()
  if (perm.display !== 'granted') return

  await ensureTapHandler()
  if (reminderAccount !== account) return
  const text = petVoiced({ title: t('Huddle · 每日規劃'), body: t('花一分鐘看看待辦，把接下來的時間排一排。') })
  await LocalNotifications.schedule({
    notifications: [
      {
        id: PLANNING_REMINDER_ID,
        title: text.title,
        body: text.body,
        schedule: { on: { hour: cfg.hour, minute: cfg.minute }, repeats: true },
        extra: { kind: 'planning', route: PLANNING_ROUTE, accountId: account },
      },
    ],
  })
}

/**
 * The 每日規劃提醒 switch was turned ON in the settings page (a tap): ask for notification permission FIRST, and only
 * when it is granted schedule the reminder (the same order as the meeting-reminder buttons). Resolves false when the
 * user said no — nothing is scheduled and the caller should leave the switch off. Scheduling here, not later from the
 * saved settings, is what makes the very first grant work: the sync that follows 儲存 only checks the permission, and
 * the prompt may not have been answered when it ran. (If the settings are then not saved, the page re-syncs from the
 * saved settings when the modal closes — hooks/use-daily-planning-reminder.ts.) Native only; web / Mac have nothing to ask.
 */
export async function enableDailyPlanningReminder(cfg: Pick<PlanningReminderConfig, 'hour' | 'minute'>): Promise<boolean> {
  if (!isNative()) return true
  const granted = await requestReminderPermission()
  if (!granted) return false
  await syncDailyPlanningReminder({ enabled: true, hour: cfg.hour, minute: cfg.minute })
  return true
}
