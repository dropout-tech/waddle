/**
 * 企鵝的冰屋 — pure brick maths. No imports, no globals, no storage: every
 * number the igloo shows is re-derived from data the app already has, so it
 * can be recomputed any time (idempotent) and needs no new table.
 *
 * One brick per completed task (deduped by id, dated by `completedAt` in the
 * device's local time zone) + one brick per finished focus session
 * (pomodoro). Bricks never go away: the caller merges a local ledger of
 * tasks it has already counted (lib/igloo/local.ts), so deleting or
 * un-completing a task does not take a brick back (DESIGN.md: 不催促).
 *
 * Plain TypeScript with erasable syntax only, so node can import it directly
 * (scripts/e2e/igloo-compute-verify.mjs).
 */

/**
 * Bricks per course, bottom → top. 35 bricks = about a week of 5 done things
 * a day. The bottom courses take few, big blocks so the dome's shape shows
 * up after the first day or two.
 */
export const IGLOO_LAYERS: readonly number[] = [6, 7, 8, 8, 6]
export const BRICKS_PER_IGLOO = IGLOO_LAYERS.reduce((a, b) => a + b, 0)
/** Days without a new brick before the penguin sits down to wait. */
export const WAITING_AFTER_DAYS = 2
/** Local hours the penguin is asleep (23:00–04:59). */
export const isSleepyHour = (h: number) => h >= 23 || h < 5

export type IglooMood = 'building' | 'proud' | 'waiting' | 'sleeping'

export interface IglooTaskInput {
  id: string
  /** Missing/undefined = treat as completed (ledger rows only carry done tasks). */
  isCompleted?: boolean
  completedAt?: string | null
}

/** Local YYYY-MM-DD → finished focus sessions that day. */
export type IglooFocusLog = Record<string, number>

export interface IglooState {
  totalBricks: number
  bricksToday: number
  /** 0-based index of the igloo under construction (= igloos already finished). */
  iglooIndex: number
  completedIgloos: number
  /** Bricks already on the igloo under construction (0 = a fresh one just started). */
  bricksInCurrent: number
  bricksPerIgloo: number
  /** Local YYYY-MM-DD of the newest dated brick, null when there is none. */
  lastActiveDate: string | null
  /** Whole local days since lastActiveDate (0 = today), null when never active. */
  daysIdle: number | null
  /** An igloo was finished with today's bricks. */
  finishedToday: boolean
  mood: IglooMood
}

export function localDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000)
}

/** Which course (0 = bottom) and which slot in it the n-th brick (0-based) of an igloo goes into. */
export function brickSlot(n: number): { layer: number; index: number } {
  let rest = Math.max(0, Math.floor(n))
  for (let layer = 0; layer < IGLOO_LAYERS.length; layer++) {
    if (rest < IGLOO_LAYERS[layer]) return { layer, index: rest }
    rest -= IGLOO_LAYERS[layer]
  }
  return { layer: IGLOO_LAYERS.length - 1, index: IGLOO_LAYERS[IGLOO_LAYERS.length - 1] - 1 }
}

export function computeIgloo(
  tasks: readonly IglooTaskInput[],
  focusSessions: IglooFocusLog,
  now: Date,
  bricksPerIgloo: number = BRICKS_PER_IGLOO,
): IglooState {
  const per = Math.max(1, Math.floor(bricksPerIgloo))
  const today = localDay(now)
  const byId = new Map<string, string | null>()
  for (const t of tasks) {
    if (!t || !t.id || t.isCompleted === false) continue
    let day: string | null = null
    if (t.completedAt) {
      const d = new Date(t.completedAt)
      if (!Number.isNaN(d.getTime())) day = localDay(d)
    }
    // Same id twice (ledger + live list): keep the dated copy.
    if (!byId.has(t.id) || (byId.get(t.id) === null && day)) byId.set(t.id, day)
  }

  let total = 0
  let todayBricks = 0
  let last: string | null = null
  const bump = (day: string | null, n: number) => {
    if (n <= 0) return
    // A brick "from the future" (clock skew) counts, but as today's.
    const d = day && day > today ? today : day
    total += n
    if (d === today) todayBricks += n
    if (d && (!last || d > last)) last = d
  }
  for (const day of byId.values()) bump(day, 1)
  for (const [day, n] of Object.entries(focusSessions ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
    bump(day, Math.max(0, Math.floor(Number(n) || 0)))
  }

  const completedIgloos = Math.floor(total / per)
  const bricksInCurrent = total % per
  const finishedToday = completedIgloos > 0 && total - todayBricks < completedIgloos * per
  const daysIdle = last ? Math.max(0, dayNumber(today) - dayNumber(last)) : null

  let mood: IglooMood = 'building'
  if (finishedToday) mood = 'proud'
  else if (isSleepyHour(now.getHours())) mood = 'sleeping'
  else if (daysIdle !== null && daysIdle >= WAITING_AFTER_DAYS) mood = 'waiting'

  return {
    totalBricks: total,
    bricksToday: todayBricks,
    iglooIndex: completedIgloos,
    completedIgloos,
    bricksInCurrent,
    bricksPerIgloo: per,
    lastActiveDate: last,
    daysIdle,
    finishedToday,
    mood,
  }
}
