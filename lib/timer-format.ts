// Pure time-formatting helpers shared by the focus timer controller
// (focus-timer-provider.tsx) and its idle setup card (focus-timer.tsx).
// Extracted verbatim from focus-timer.tsx during the cross-route provider
// refactor — no behavior change, just a shared home so both files agree.
import { toDateString } from '@/lib/calendar-utils'

/** "24:13" / "1:02:05" — pomodoro/stopwatch digit display. */
export function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/** "HH:mm" — used for the calendar time-block start/end and the immersive
 *  「開始於」 chip. */
export function formatTimeHHMM(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

/** "YYYY-MM-DD" (local) — the calendar time-block's date field. */
export function formatDateISO(date: Date): string {
  return toDateString(date)
}

/** Translate function shape shared by both `t` (lib/i18n) and useI18n()'s `t`. */
type Translate = (text: string, vars?: Record<string, string | number>) => string

/** "25 分鐘" / "1 小時" / "1 小時 30 分鐘" — human duration for the random
 *  post-session praise line and the session-log dialog's subtitle. Rounds to
 *  the nearest whole minute, floored at 1 (a >=60s session always reads as
 *  at least "1 分鐘", never "0 分鐘"). */
export function formatFocusDuration(seconds: number, t: Translate): string {
  const m = Math.max(1, Math.round(seconds / 60))
  if (m < 60) return t('{m} 分鐘', { m })
  const h = Math.floor(m / 60)
  const r = m % 60
  if (r === 0) return t('{h} 小時', { h })
  return t('{h} 小時 {m} 分鐘', { h, m: r })
}
