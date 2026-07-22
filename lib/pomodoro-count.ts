// Tracks "how many work pomodoros completed today" — used by the immersive
// view's progress dots (B6) so users get a quiet sense of momentum.
//
// Storage layout: keyed by local YYYY-MM-DD so the count rolls over at the
// user's midnight rather than UTC. Stored as { date, count } so we can detect
// stale entries from a previous day and reset.

const STORAGE_KEY = 'huddle-pomodoro-count-v1'
const LEGACY_STORAGE_KEY = 'waddle-pomodoro-count-v1'
export const HUDDLE_POMODORO_COUNT_EVENT = 'huddle:pomodoro-count'

export interface PomodoroDayCount {
  date: string  // YYYY-MM-DD, local
  count: number
}

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function loadPomodoroCount(): PomodoroDayCount {
  const today = todayKey()
  if (typeof window === 'undefined') return { date: today, count: 0 }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return { date: today, count: 0 }
    const parsed = JSON.parse(raw) as Partial<PomodoroDayCount>
    if (parsed.date === today && typeof parsed.count === 'number') {
      const value = { date: today, count: Math.max(0, Math.floor(parsed.count)) }
      // One-way compatibility migration: preserve existing progress while all
      // new writes use the Huddle key.
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch {}
      }
      return value
    }
  } catch {
    /* fall through to zero */
  }
  return { date: today, count: 0 }
}

/** Increment today's count by one and return the new value. */
export function recordPomodoroCompletion(): PomodoroDayCount {
  const current = loadPomodoroCount()
  const next: PomodoroDayCount = { date: current.date, count: current.count + 1 }
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
    window.dispatchEvent(new CustomEvent(HUDDLE_POMODORO_COUNT_EVENT, { detail: next }))
  }
  return next
}
