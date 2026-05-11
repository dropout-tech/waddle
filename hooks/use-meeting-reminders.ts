'use client'

import { useEffect } from 'react'
import type { Workspace } from '@/lib/types'
import {
  collectMeetings,
  getReminderLead,
  getFiredRemindersAndPrune,
  persistFiredReminders,
  meetingStartAsDate,
} from '@/lib/meeting-reminder'
import { detectMeetingProvider } from '@/lib/meeting-utils'

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
 * - We haven't already fired for this meeting (deduped via localStorage)
 */
export function useMeetingReminders(workspaces: Workspace[]) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return

    const check = () => {
      const lead = getReminderLead()
      if (lead === null) return
      if (Notification.permission !== 'granted') return

      const meetings = collectMeetings(workspaces)
      if (meetings.length === 0) return

      const now = Date.now()
      const fired = getFiredRemindersAndPrune()
      let changed = false

      for (const m of meetings) {
        const start = meetingStartAsDate(m)
        if (!start) continue
        const startMs = start.getTime()
        const reminderAt = startMs - lead * 60 * 1000

        // Window: reminder time has been reached AND meeting hasn't started.
        if (now < reminderAt) continue
        if (now >= startMs) continue

        const reminderId = `${m.id}@${m.scheduledDate}T${m.scheduledStartTime}`
        if (fired.has(reminderId)) continue

        const minutesUntil = Math.round((startMs - now) / 60000)
        // Trim user-controlled text before sending to the OS toast.
        // Long attendee strings (a 500-name CSV, say) or newline-laden
        // notes can break rendering across browsers; cap each field and
        // strip newlines so the body stays one cohesive paragraph.
        const trim = (s: string, max: number) =>
          s.replace(/\s+/g, ' ').trim().slice(0, max)
        const bodyLines: string[] = []
        bodyLines.push(`${m.scheduledStartTime} 開始（${minutesUntil} 分鐘後）`)
        if (m.location) bodyLines.push(`地點：${trim(m.location, 80)}`)
        if (m.attendees) bodyLines.push(`參與者：${trim(m.attendees, 120)}`)
        const safeTitle = trim(m.title, 80) || '會議'

        // Only treat the URL as "openable" if it parses as a known video
        // provider (or matches the http(s) catch-all). Anything else —
        // including the dangerous `javascript:` / `data:` / `file:`
        // schemes — falls back to just focusing the Waddle tab. This is
        // belt-and-suspenders: the detail-modal also validates on save,
        // but the notification path runs even if a URL leaked in via
        // direct DB write / shared-workspace edit.
        const provider = detectMeetingProvider(m.meetingUrl)
        const openable = !!m.meetingUrl && provider !== null

        try {
          const n = new Notification(`會議提醒 · ${safeTitle}`, {
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
    return () => window.clearInterval(id)
  }, [workspaces])
}
