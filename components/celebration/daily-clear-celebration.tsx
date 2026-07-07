'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DAILY_CLEAR_EVENT } from '@/lib/daily-clear'
import { SkatingPenguin } from './skating-penguin'

// Matches the CSS animation duration below (2.2s, see the
// daily-clear-skate keyframes in app/globals.css) plus a small buffer so
// the overlay unmounts just after the slide fully exits rather than
// mid-frame.
const ANIMATION_MS = 2300

// Warm, unhurried, a little penguin-flavored — never exclaiming. Picked
// at random each time so the delight doesn't go stale on repeat days.
const CELEBRATION_MESSAGES = [
  '今天的清單清空了，企鵝替你滑了一圈冰。',
  '今日事項都做完了，可以慢慢喘口氣。',
  '今天份都收工了，企鵝說辛苦了。',
  '清單見底，企鵝溜出一個漂亮的弧線。',
  '今天的任務都做完了，剩下的時間是你的。',
]

/**
 * Listens for the 'waddle:daily-clear' custom event — dispatched from
 * hooks/use-waddle-data.ts's toggleTaskComplete once per calendar day, the
 * moment the last task due today gets checked off — and plays a one-shot
 * belly-slide across the screen plus a warm toast.
 *
 * Mounted once near the app root (app/page.tsx, alongside <Toaster>) so it
 * covers both the desktop three-column layout and the mobile single-panel
 * layout without any per-layout wiring.
 */
export function DailyClearCelebration() {
  const [playKey, setPlayKey] = useState(0)
  const [visible, setVisible] = useState(false)
  const hideTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const handleDailyClear = () => {
      const message = CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)]
      toast.success(message)

      // Respect prefers-reduced-motion: toast only, no slide animation.
      // (Global CSS also collapses animation-duration to ~0 under this
      // media query, but skipping the mount entirely avoids even a
      // near-instant flash for vestibular-sensitive users.)
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduceMotion) return

      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
      setPlayKey((k) => k + 1)
      setVisible(true)
      hideTimerRef.current = window.setTimeout(() => setVisible(false), ANIMATION_MS)
    }

    window.addEventListener(DAILY_CLEAR_EVENT, handleDailyClear)
    return () => {
      window.removeEventListener(DAILY_CLEAR_EVENT, handleDailyClear)
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      data-testid="daily-clear-celebration"
      aria-hidden="true"
      className="fixed inset-0 z-popover pointer-events-none overflow-hidden"
    >
      {/* top: 62% rides the emptier lower band of the screen — below the
          sidebar's task rows and calendar headers, still well clear of the
          mobile bottom tab bar (~64px + safe-area-inset-bottom) on every
          realistic viewport height. */}
      <div
        key={playKey}
        className="absolute left-0 w-28 sm:w-36"
        style={{
          top: '62%',
          // Gentle symmetric curve, NOT the brand ease-out token: this is a
          // traveling character, and a steep ease-out shoots it off-screen
          // in the first ~0.4s (see the keyframes' comment in globals.css).
          animation: 'daily-clear-skate 2.2s cubic-bezier(0.33, 0, 0.67, 1) forwards',
        }}
      >
        <div style={{ animation: 'daily-clear-glide-bob 0.55s ease-in-out 4' }}>
          <SkatingPenguin className="w-full h-auto" />
        </div>
      </div>
    </div>
  )
}
