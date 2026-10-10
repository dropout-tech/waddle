'use client'

import { notifyDesktop } from '@/lib/desktop-notifications'
import { t } from '@/lib/i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusTimer } from '@/components/timer/focus-timer-provider'
import { resolveQuietHours, waterQuietWindows } from '@/lib/quiet-hours'
import {
  DEFAULT_WATER_INTERVAL,
  SNOOZE_MINUTES,
  WATER_AFTER_FOCUS_DELAY_MS,
  getWaterNextDueAt,
  getWaterReminderEnabled,
  getWaterReminderInterval,
  isFocusRunning,
  scheduleNextWaterReminder,
  setWaterNextDueAt,
  setWaterReminderEnabled,
  waterReminderVerdict,
} from '@/lib/water-reminder'
import { getWaterIgnoredOnce, planAfterIgnore, setWaterIgnoredOnce } from '@/lib/water-moment'

/**
 * Polls every 30s to see whether the next water reminder is due, and
 * exposes an `isOpen` flag plus dismiss/snooze callbacks for the popup.
 *
 * Implementation notes:
 * - Poll loop instead of setTimeout so the reminder survives laptop sleep
 *   (same reasoning as use-meeting-reminders).
 * - On first mount with no stored next-due time, we *schedule one full
 *   interval out* rather than firing immediately — opening the app should
 *   not nag you the same second.
 * - Once shown, we don't auto-reschedule until the user actively
 *   dismisses or snoozes, so we don't pile up multiple popups while one
 *   is on screen.
 * - `storage` event lets a settings change in another tab disable the
 *   reminder live without a refresh.
 * - `paused` (the onboarding tour is on screen) *defers* the popup instead of
 *   dropping it: nothing is checked, notified or rescheduled while paused, so
 *   the stored due time is untouched and the effect's own re-run picks the
 *   reminder up the moment the pause lifts. A widget-triggered open that
 *   arrives while paused is held in state the same way.
 * - Two more reasons to hold a due reminder back (both keep the stored due
 *   time, so nothing is lost — the next poll shows it once the reason is gone):
 *     · quiet window — the user's 勿擾時段 when it is on, otherwise a built-in
 *       22:00–08:00 night (lib/quiet-hours.ts). Shown when the window ends.
 *     · a focus stretch is running (pomodoro work phase / stopwatch, not paused,
 *       not a break). Shown WATER_AFTER_FOCUS_DELAY_MS after it ends, once the
 *       timer's own farewell is out of the way. Breaks do not hold it back.
 *   `dueAfterFocus` is true when the popup that opened had been held back by
 *   focus, so the copy can say "剛好休息，喝口水".
 */
export const WATER_OPEN_EVENT = 'huddle-water-open'

export function useWaterReminder({
  paused = false,
  quietHours,
}: {
  paused?: boolean
  /** Raw saved `notifications.quietHours` (may be missing/partial). */
  quietHours?: unknown
} = {}) {
  const [isOpen, setIsOpen] = useState(false)
  const [enabled, setEnabledState] = useState(false)
  const [dueAfterFocus, setDueAfterFocus] = useState(false)

  const { state: timerState, session } = useFocusTimer()
  const focusRunning = isFocusRunning(timerState, session?.phase)

  // The poll below lives in an effect keyed only on `paused`; it reads these
  // through refs so a timer or settings change is seen without re-arming it.
  const quiet = resolveQuietHours(quietHours)
  const quietRef = useRef(waterQuietWindows(quiet))
  const focusRunningRef = useRef(focusRunning)
  const focusEndedAtRef = useRef(0)
  /** The due time (ms) that was held back by focus — the flag only applies to that very reminder. */
  const heldByFocusDueRef = useRef<number | null>(null)
  const shownForDueRef = useRef<number | null>(null)
  const webNotifiedDueRef = useRef<number | null>(null)
  const checkRef = useRef<() => void>(() => {})

  // Declared before the poll effect so a settings change is already in the ref when it runs.
  const { enabled: quietOn, startTime: quietStart, endTime: quietEnd, allowUrgent: quietUrgent } = quiet
  useEffect(() => {
    quietRef.current = waterQuietWindows({ enabled: quietOn, startTime: quietStart, endTime: quietEnd, allowUrgent: quietUrgent })
  }, [quietOn, quietStart, quietEnd, quietUrgent])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setEnabledState(getWaterReminderEnabled())

    // First-run scheduling: don't fire on app open.
    if (getWaterNextDueAt() === null) {
      scheduleNextWaterReminder()
    }

    const check = () => {
      if (paused) return
      if (!getWaterReminderEnabled()) return
      const due = getWaterNextDueAt()
      if (due === null) return
      const now = Date.now()
      const focusBusy = focusRunningRef.current || now - focusEndedAtRef.current < WATER_AFTER_FOCUS_DELAY_MS
      const verdict = waterReminderVerdict({ now, due, quiet: quietRef.current, focusBusy })
      if (verdict === 'focus') heldByFocusDueRef.current = due
      if (verdict !== 'show') return

      void notifyDesktop({ kind: 'water', id: String(due), title: t('喝水提醒'), body: t('該喝水囉') })
      // Browser tab in the background and the user already granted notifications:
      // a system notification so the reminder isn't missed. Never asks for permission here.
      if (
        webNotifiedDueRef.current !== due &&
        document.visibilityState === 'hidden' &&
        !window.huddleDesktop?.showNotification &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        webNotifiedDueRef.current = due
        try {
          const n = new Notification(t('喝水提醒'), { body: t('該喝水囉'), tag: 'huddle-water' })
          n.onclick = () => {
            window.focus()
            n.close()
          }
        } catch {
          /* some browsers throw on construction; the in-app popup still shows */
        }
      }
      if (shownForDueRef.current !== due) {
        shownForDueRef.current = due
        setDueAfterFocus(heldByFocusDueRef.current === due)
      }
      setIsOpen((prev) => prev || true)
    }
    checkRef.current = check

    check()
    const id = window.setInterval(check, 30 * 1000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    const onStorage = (e: StorageEvent) => {
      if (!e.key) return
      if (e.key.startsWith('waddle.waterReminder.')) {
        setEnabledState(getWaterReminderEnabled())
        check()
      }
    }
    window.addEventListener('storage', onStorage)
    // The 喝水提醒 home-screen widget opens this popup directly (drink / snooze).
    const onOpen = () => setIsOpen(true)
    window.addEventListener(WATER_OPEN_EVENT, onOpen)

    return () => {
      window.removeEventListener(WATER_OPEN_EVENT, onOpen)
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
    }
  }, [paused])

  // Focus stretch ended (finished, stopped or switched to a break): look again once
  // the timer's own screen change has settled, instead of waiting for the next 30s poll.
  useEffect(() => {
    const was = focusRunningRef.current
    focusRunningRef.current = focusRunning
    if (!was || focusRunning) return undefined
    focusEndedAtRef.current = Date.now()
    const id = window.setTimeout(() => checkRef.current(), WATER_AFTER_FOCUS_DELAY_MS + 250)
    return () => window.clearTimeout(id)
  }, [focusRunning])

  // The popup is gone (drunk / snoozed / switched off): the next one starts clean.
  const resetShown = useCallback(() => {
    heldByFocusDueRef.current = null
    shownForDueRef.current = null
    setDueAfterFocus(false)
  }, [])

  const dismiss = useCallback(() => {
    setWaterIgnoredOnce(false)
    scheduleNextWaterReminder()
    resetShown()
    setIsOpen(false)
  }, [resetShown])

  const snooze = useCallback(() => {
    setWaterIgnoredOnce(false)
    setWaterNextDueAt(Date.now() + SNOOZE_MINUTES * 60 * 1000)
    resetShown()
    setIsOpen(false)
  }, [resetShown])

  /** The drop (C) evaporated untouched: ask again in 15 min; a second ignore in a row ends the
   *  round (full interval). See lib/water-moment.ts planAfterIgnore. */
  const ignore = useCallback(() => {
    const plan = planAfterIgnore({ ignoredBefore: getWaterIgnoredOnce(), now: Date.now(), intervalMin: getWaterReminderInterval() })
    setWaterIgnoredOnce(plan.ignoredOnce)
    setWaterNextDueAt(plan.nextDueAt)
    resetShown()
    setIsOpen(false)
  }, [resetShown])

  /** Turn the whole feature off from inside the popup (the popup's gear).
   *  Settings can re-enable it later; its own toggle re-arms the schedule. */
  const disable = useCallback(() => {
    setWaterIgnoredOnce(false)
    setWaterReminderEnabled(false)
    setEnabledState(false)
    resetShown()
    setIsOpen(false)
  }, [resetShown])

  return { isOpen: isOpen && !paused, enabled, dueAfterFocus, dismiss, snooze, disable, ignore }
}

export { DEFAULT_WATER_INTERVAL }
