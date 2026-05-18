'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_WATER_INTERVAL,
  SNOOZE_MINUTES,
  getWaterNextDueAt,
  getWaterReminderEnabled,
  getWaterReminderInterval,
  scheduleNextWaterReminder,
  setWaterNextDueAt,
} from '@/lib/water-reminder'

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
 */
export function useWaterReminder() {
  const [isOpen, setIsOpen] = useState(false)
  const [enabled, setEnabledState] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setEnabledState(getWaterReminderEnabled())

    // First-run scheduling: don't fire on app open.
    if (getWaterNextDueAt() === null) {
      scheduleNextWaterReminder()
    }

    const check = () => {
      if (!getWaterReminderEnabled()) return
      const due = getWaterNextDueAt()
      if (due === null) return
      if (Date.now() >= due) {
        setIsOpen((prev) => prev || true)
      }
    }

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

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const dismiss = useCallback(() => {
    scheduleNextWaterReminder()
    setIsOpen(false)
  }, [])

  const snooze = useCallback(() => {
    setWaterNextDueAt(Date.now() + SNOOZE_MINUTES * 60 * 1000)
    setIsOpen(false)
  }, [])

  return { isOpen, enabled, dismiss, snooze }
}

export { DEFAULT_WATER_INTERVAL }
