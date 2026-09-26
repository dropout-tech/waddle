/**
 * Per-device pet state (localStorage). Everything here is a convenience:
 * if storage is unavailable the pet simply forgets and may repeat itself.
 */

const KEY = 'huddle-pet-local-v1'

export interface PetLocalState {
  /** Epoch ms — auto-speech muted until then (「安靜 1 小時」). */
  mutedUntil?: number
  /** Local YYYY-MM-DD — auto-speech muted for that day (「今天先別吵」). */
  mutedDate?: string
  /** Local YYYY-MM-DD stamps so once-a-day nudges stay once a day. */
  checkInNudged?: string
  nightNudged?: string
  /** Local YYYY-MM-DD of the last overdue nudge (once a day). */
  overdueNudged?: string
  /** Local YYYY-MM-DD of the last meeting nudge (once a day). */
  meetingNudged?: string
  /** Idle chatter budget: how many idle lines were said on `idleDate`. */
  idleDate?: string
  idleCount?: number
  /** Epoch ms of the last automatic line of any kind. */
  lastSpokeAt?: number
  /** Adoption card dismissed without deciding ("稍後") — local YYYY-MM-DD. */
  adoptSnoozed?: string
}

export function localDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function readPetLocal(): PetLocalState {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PetLocalState) : {}
  } catch {
    return {}
  }
}

export function writePetLocal(patch: Partial<PetLocalState>): PetLocalState {
  const next = { ...readPetLocal(), ...patch }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

export function isPetMuted(s: PetLocalState = readPetLocal(), now = Date.now()): boolean {
  if (s.mutedUntil && s.mutedUntil > now) return true
  if (s.mutedDate && s.mutedDate === localDate(new Date(now))) return true
  return false
}
