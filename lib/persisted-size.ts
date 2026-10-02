// Per-device layout sizes (sidebar width, all-day zone height) kept in
// localStorage so a refresh doesn't snap them back to the default.
// Every access is wrapped: private mode / disabled storage just means
// "not remembered", never a crash.

export const PANEL_WIDTH_KEY = 'huddle.layout.panelWidth'
export const ALL_DAY_HEIGHT_DAY_KEY = 'huddle.calendar.allDayHeight.day'
export const ALL_DAY_HEIGHT_WEEK_KEY = 'huddle.calendar.allDayHeight.week'

/** Stored number for `key`, clamped to [min, max]; null when absent or invalid. */
export function readStoredSize(key: string, min: number, max: number): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return null
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    return Math.min(max, Math.max(min, Math.round(n)))
  } catch {
    return null
  }
}

export function writeStoredSize(key: string, value: number) {
  if (typeof window === 'undefined' || !Number.isFinite(value)) return
  try {
    window.localStorage.setItem(key, String(Math.round(value)))
  } catch {
    /* private mode etc. */
  }
}
