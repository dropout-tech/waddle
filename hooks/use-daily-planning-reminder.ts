'use client'

import { useEffect } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { useI18n } from '@/lib/i18n/react'
import { t } from '@/lib/i18n'
import { isNative } from '@/lib/platform'
import { toDateString } from '@/lib/calendar-utils'
import { syncDailyPlanningReminder } from '@/lib/notifications'
import { planningLastFiredKey, planningReminderConfig, planningReminderDue } from '@/lib/notifications/daily-planning'
import { notifyDesktop } from '@/lib/desktop-notifications'

/**
 * 每日規劃提醒 (設定 › 提醒設定 › 排程提醒). `notifications` is the saved `settings.notifications` (may be partial).
 *
 *  - iOS: ONE repeating local notification at the chosen time, kept in step with the settings
 *    (lib/notifications/index.ts syncDailyPlanningReminder) — it fires with the app closed.
 *  - Web / Mac: while Huddle is open, the first look after the chosen time that day fires it once (a Mac
 *    desktop notification through the existing notifyDesktop, or a browser Notification when permission is
 *    ALREADY granted — it never asks), at most once per local day (localStorage, per account). The bell shows the
 *    planning card from that time on whatever the permissions are (lib/notifications/task-reminders.ts).
 *
 * It is the user's own alarm: 勿擾時段 is not consulted.
 *
 * `ready` = the saved settings have really been loaded. Before that `notifications` is the default (switch off), and
 * acting on it would cancel the phone's pending reminder on every cold start that is slow or offline.
 */
export function useDailyPlanningReminder(notifications: unknown, petVoice: string | null = null, ready = true) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { lang } = useI18n()
  const { enabled, hour, minute } = planningReminderConfig(notifications)

  // iOS. petVoice / lang are only here to re-schedule when the notification's wording changes.
  useEffect(() => {
    if (!ready || !isNative()) return
    void syncDailyPlanningReminder({ enabled, hour, minute }).catch(() => {})
  }, [ready, enabled, hour, minute, userId, petVoice, lang])

  // Web / Mac.
  useEffect(() => {
    if (!ready || typeof window === 'undefined' || isNative() || !enabled || !userId) return
    const key = planningLastFiredKey(userId)
    const check = () => {
      const now = new Date()
      let last: string | null = null
      try {
        last = window.localStorage.getItem(key)
      } catch {
        /* unreadable storage: treated as "not fired yet" */
      }
      if (!planningReminderDue({ now, cfg: { enabled, hour, minute }, lastFiredDate: last })) return
      const today = toDateString(now)
      // Remember BEFORE showing, and give up when it cannot be remembered — otherwise a throwing
      // Notification (or blocked storage) would retry every 30 seconds for the rest of the day.
      try {
        window.localStorage.setItem(key, today)
      } catch {
        return
      }
      const title = t('Huddle · 每日規劃')
      const body = t('花一分鐘看看待辦，把接下來的時間排一排。')
      if (window.huddleDesktop?.showNotification) {
        // The packaged Mac app's main process only accepts the kinds meeting / focus / water / test
        // (desktop/notifications.cjs) and installed apps load the live site, so a new kind would be rejected until
        // they are re-packaged. 'water' carries no extra rules; here `kind` is just a namespace for the duplicate guard.
        void notifyDesktop({ kind: 'water', id: `planning:${today}`, title, body })
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const n = new Notification(title, { body, tag: 'huddle-planning' })
          n.onclick = () => {
            window.focus()
            n.close()
          }
        } catch {
          /* some browsers throw on construction; the bell still shows the card */
        }
      }
    }
    check()
    const id = window.setInterval(check, 30 * 1000)
    // A laptop waking up or a tab coming back should not wait for the next 30 s tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [ready, enabled, hour, minute, userId])
}
