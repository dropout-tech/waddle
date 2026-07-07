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
