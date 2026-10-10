// The bell's per-day memory for its two daily cards ("今天的摘要" and the planning card):
// which of them the user has already seen today (the badge stops counting them) and which
// they dismissed. It resets by itself when the local date changes. Stored per account in
// localStorage (with an in-memory fallback when storage is blocked). The parse / change helpers are pure (a string
// in, a string out); the small store at the bottom is what lets React read it with useSyncExternalStore, so the
// component never needs a setState inside an effect.

export interface DailyBellState {
  /** Local "YYYY-MM-DD" this state belongs to. */
  date: string
  /** Daily card ids the user has seen (opened the bell while they were there). */
  seen: string[]
  /** Daily card ids the user closed with the X. */
  dismissed: string[]
}

export const dailyBellKey = (userId: string | null | undefined): string => `huddle.bell-daily:${userId ?? 'anon'}`

export const emptyDailyBell = (date: string): DailyBellState => ({ date, seen: [], dismissed: [] })

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Stored text → today's state; another day's (or unreadable) state counts as empty. */
export function parseDailyBell(raw: string | null | undefined, today: string): DailyBellState {
  if (!raw) return emptyDailyBell(today)
  try {
    const v = JSON.parse(raw) as Partial<DailyBellState> | null
    if (!v || typeof v !== 'object' || v.date !== today) return emptyDailyBell(today)
    return { date: today, seen: strings(v.seen), dismissed: strings(v.dismissed) }
  } catch {
    return emptyDailyBell(today)
  }
}

export const serializeDailyBell = (state: DailyBellState): string => JSON.stringify(state)

/** Mark ids as seen; returns the same object when nothing changes (so React can skip the update). */
export function markSeen(state: DailyBellState, ids: string[]): DailyBellState {
  const fresh = ids.filter((id) => !state.seen.includes(id))
  return fresh.length === 0 ? state : { ...state, seen: [...state.seen, ...fresh] }
}

export function markDismissed(state: DailyBellState, id: string): DailyBellState {
  return state.dismissed.includes(id) ? state : { ...state, dismissed: [...state.dismissed, id] }
}

// ── tiny external store (localStorage + in-memory fallback) ──

const listeners = new Set<() => void>()
const memory = new Map<string, string>()
const notify = () => listeners.forEach((fn) => fn())

/** For useSyncExternalStore. Also follows other tabs (the 'storage' event). */
export function subscribeDailyBell(listener: () => void): () => void {
  listeners.add(listener)
  if (typeof window !== 'undefined') window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') window.removeEventListener('storage', listener)
  }
}

/** The stored text for `key`, or null. A primitive, so it is a stable snapshot for React. */
export function readDailyBellRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null
  } catch {
    return memory.get(key) ?? null
  }
}

/**
 * Read today's state, let `change` edit it, and store the result (only when something changed).
 * Reads from storage itself, so callers can run from an effect or an event without a stale closure.
 */
export function updateDailyBell(key: string, today: string, change: (state: DailyBellState) => DailyBellState): void {
  const current = parseDailyBell(readDailyBellRaw(key), today)
  const next = change(current)
  if (next === current) return
  const raw = serializeDailyBell(next)
  memory.set(key, raw)
  try {
    window.localStorage.setItem(key, raw)
  } catch {
    /* private mode etc.: the memory then lasts until reload */
  }
  notify()
}
