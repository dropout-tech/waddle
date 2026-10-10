'use client'

import { useEffect } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import type { Workspace } from '@/lib/types'
import {
  collectMeetings,
  getReminderLead,
  getFiredRemindersAndPrune,
  isMeetingReminderDue,
  meetingFiredKey,
  persistFiredReminders,
  meetingStartAsDate,
  wasMeetingReminded,
} from '@/lib/meeting-reminder'
import { resolveQuietHours } from '@/lib/quiet-hours'
import { detectMeetingProvider } from '@/lib/meeting-utils'
import { isNative } from '@/lib/platform'
import { syncMeetingReminders } from '@/lib/notifications'
import { desktopNotificationsEnabled, notifyDesktop } from '@/lib/desktop-notifications'
import { t } from '@/lib/i18n'

/**
 * Watches all meetings in the workspace tree and fires a browser
 * notification N minutes before each one starts (per the user's
 * reminder-lead pref in localStorage). Uses a 30-second poll loop
 * rather than per-meeting setTimeouts so it survives laptop sleep —
 * setTimeout drifts (or fires late) across suspend/resume cycles,
 * which would miss reminders for meetings during a multi-hour sleep.
 *
 * Notifications only fire when:
 * - The reminder pref is set (5/10/15)
 * - Notification permission is 'granted'
 * - The reminder window has been reached (now ≥ startTime − lead)
 * - The meeting hasn't started yet (now < startTime)
 * - We haven't already fired for this occurrence at this lead (deduped via
 *   localStorage; a repeating meeting has one occurrence per date, and changing
 *   the lead re-arms it)
 * - Not dropped by 勿擾時段: meetings are "urgent", so only with 允許緊急通知
 *   off are reminders that fall inside the quiet window skipped
 */
const quietField = (q: unknown, key: string): unknown =>
  q && typeof q === 'object' ? (q as Record<string, unknown>)[key] : undefined

/**
 * `petVoice` = the adopted penguin's name (lib/pet/voice.ts): a change re-schedules native reminders in its voice.
 * `quietHours` = the raw saved `notifications.quietHours` (may be missing/partial).
 */
export function useMeetingReminders(workspaces: Workspace[], petVoice: string | null = null, quietHours?: unknown) {
  const { user } = useAuth()
  const sourceAccount = user?.id ?? null
  // Primitives so an unrelated settings save doesn't re-run the effect (and re-schedule iOS notifications).
  const quietEnabled = quietField(quietHours, 'enabled')
  const quietStart = quietField(quietHours, 'startTime')
  const quietEnd = quietField(quietHours, 'endTime')
  const quietUrgent = quietField(quietHours, 'allowUrgent')
  useEffect(() => {
    if (typeof window === 'undefined') return
    const quiet = resolveQuietHours({ enabled: quietEnabled, startTime: quietStart, endTime: quietEnd, allowUrgent: quietUrgent })

    // Native: schedule local notifications ahead of time so reminders fire even
    // when the app is backgrounded/closed. Re-sync whenever the meeting set
    // changes. (The lead-time pref is re-synced from the settings modal.)
    if (isNative()) {
      void syncMeetingReminders(collectMeetings(workspaces), getReminderLead(), quiet)
      return
    }

    // Web: poll every 30s and fire a browser Notification while the tab is open.
    if (!window.huddleDesktop?.showNotification && !('Notification' in window)) return

    const inFlight = new Set<string>()
    const attempts = new Map<string, number>()
    let disposed = false
    const check = () => {
      const lead = getReminderLead()
      if (lead === null) return
      if (window.huddleDesktop?.showNotification ? !desktopNotificationsEnabled() : Notification.permission !== 'granted') return

      const meetings = collectMeetings(workspaces)
      if (meetings.length === 0) return

      const now = Date.now()
      const fired = getFiredRemindersAndPrune()
      let changed = false

      for (const m of meetings) {
        const start = meetingStartAsDate(m)
        if (!start) continue
        const startMs = start.getTime()

        // Window: reminder time has been reached AND meeting hasn't started
        // (and 勿擾時段 doesn't swallow it — same rule the iOS pre-scheduling uses).
        if (!isMeetingReminderDue({ startMs, lead, now, quiet })) continue

        // One key per occurrence AND lead: a weekly meeting is reminded every week, and
        // switching 5→15 minutes can remind again. Keys saved before the lead was part of the key still count.
        const reminderId = meetingFiredKey(m, lead)
        if (wasMeetingReminded(fired, m, lead)) continue

        const minutesUntil = Math.round((startMs - now) / 60000)
        // Trim user-controlled text before sending to the OS toast.
        // Long attendee strings (a 500-name CSV, say) or newline-laden
        // notes can break rendering across browsers; cap each field and
        // strip newlines so the body stays one cohesive paragraph.
        const trim = (s: string, max: number) =>
          s.replace(/\s+/g, ' ').trim().slice(0, max)
        const bodyLines: string[] = []
        bodyLines.push(t('{time} 開始（{lead} 分鐘後）', { time: m.scheduledStartTime, lead: minutesUntil }))
        if (m.location) bodyLines.push(t('地點：{location}', { location: trim(m.location, 80) }))
        if (m.attendees) bodyLines.push(t('參與者：{attendees}', { attendees: trim(m.attendees, 120) }))
        const safeTitle = trim(m.title, 80) || t('會議')

        // Only treat the URL as "openable" if it parses as a known video
        // provider (or matches the http(s) catch-all). Anything else —
        // including the dangerous `javascript:` / `data:` / `file:`
        // schemes — falls back to just focusing the Waddle tab. This is
        // belt-and-suspenders: the detail-modal also validates on save,
        // but the notification path runs even if a URL leaked in via
        // direct DB write / shared-workspace edit.
        const provider = detectMeetingProvider(m.meetingUrl)
        const openable = !!m.meetingUrl && provider !== null

        if (window.huddleDesktop?.showNotification) {
          if (inFlight.has(reminderId) || (attempts.get(reminderId) || 0) >= 3) continue
          inFlight.add(reminderId)
          attempts.set(reminderId, (attempts.get(reminderId) || 0) + 1)
          void notifyDesktop({ kind: 'meeting', expectedAccount: sourceAccount, id: reminderId, title: t('會議提醒 · {title}', { title: safeTitle }), body: bodyLines.join(' ') }).then(sent => {
            if (sent && !disposed) {
              const latest = getFiredRemindersAndPrune()
              latest.add(reminderId)
              persistFiredReminders(latest)
            }
          }).finally(() => inFlight.delete(reminderId))
          continue
        } else try {
          const n = new Notification(t('會議提醒 · {title}', { title: safeTitle }), {
            body: bodyLines.join('\n'),
            // Tag dedupes within the OS notification center — re-firing
            // the same id swaps the visible notification instead of
            // stacking duplicates.
            tag: reminderId,
            silent: false,
          })
          if (openable) {
            n.onclick = () => {
              window.open(m.meetingUrl, '_blank', 'noopener,noreferrer')
              n.close()
            }
          } else {
            n.onclick = () => {
              window.focus()
              n.close()
            }
          }
        } catch (err) {
          // Some browsers throw if construction fails (e.g., quota). We
          // still mark as fired so we don't loop attempting the same
          // failing notification every 30s.
          console.error('[meeting-reminder] notify failed', err)
        }

        fired.add(reminderId)
        changed = true
      }

      if (changed) persistFiredReminders(fired)
    }

    // Immediate check on mount + every 30s. 30s is fine because reminders
    // are at 1-minute resolution; the user won't perceive a few extra
    // seconds of delay.
    check()
    const id = window.setInterval(check, 30 * 1000)
    return () => { disposed = true; window.clearInterval(id) }
  }, [workspaces, sourceAccount, petVoice, quietEnabled, quietStart, quietEnd, quietUrgent])
}
