// planDay — drop parsed brain-dump drafts into today's free time.
//
// Pure function (no React, no '@/' imports) so the node verify script can
// run it. The caller passes "what's already on today" as busy minutes
// (tasks + time blocks); this never reads the calendar itself.
//
// Order of placement
//   1. fixedTime   — exactly where the user said (may overlap → conflict)
//   2. preferredPart — earliest gap inside 早上 / 下午 / 晚上
//   3. everything else — urgency ↓, deadline ↑, shorter first, then input order
// Placed items keep a buffer (default 10 min) from each other and from
// existing events; starts snap to 15 minutes like the calendar does.
// Anything for a later day, or that doesn't fit, becomes 待排 (pending):
// it gets a date but no time, and lands in the calendar's pending zone.

import { addDays, dateKey, dayToken, dayTokenToDate } from './parse'
import type { BrainDumpDraft, BusyInterval, DayPart, DayPlan, PlannedItem } from './types'

export interface PlanOptions {
  now: Date
  /** Minutes from 00:00. Default 09:00. */
  workStart?: number
  /** Minutes from 00:00. Default 22:00. */
  workEnd?: number
  /** Gap kept around placed items. Default 10. */
  buffer?: number
}

export const STEP = 15
export const LATE_THRESHOLD = 30
const PART_WINDOW: Record<DayPart, [number, number]> = {
  morning: [0, 12 * 60],
  afternoon: [12 * 60, 18 * 60],
  evening: [18 * 60, 24 * 60],
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function toHHmm(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

const ceilStep = (m: number) => Math.ceil(m / STEP) * STEP

/** Earliest start ≥ from (snapped) where [start, start+dur] avoids every
 *  busy span (each already widened by its buffer) and ends by `to`. */
export function findSlot(busy: BusyInterval[], from: number, to: number, dur: number): number | null {
  let t = ceilStep(from)
  const sorted = [...busy].sort((a, b) => a.start - b.start)
  for (const b of sorted) {
    if (b.end <= t) continue
    if (t + dur <= b.start) break
    t = ceilStep(Math.max(t, b.end))
  }
  return t + dur <= to ? t : null
}

export function overlapsAny(busy: BusyInterval[], start: number, end: number): boolean {
  return busy.some((b) => start < b.end && end > b.start)
}

/** Where today's search starts: now rounded up to 15 min, never before the window. */
export function windowStartFor(now: Date, workStart: number): number {
  return Math.max(workStart, ceilStep(now.getHours() * 60 + now.getMinutes()))
}

export function planDay(drafts: BrainDumpDraft[], occupied: BusyInterval[], opts: PlanOptions): DayPlan {
  const { now, workStart = 9 * 60, workEnd = 22 * 60, buffer = 10 } = opts
  const today = dateKey(now)
  const tomorrow = dateKey(addDays(now, 1))
  const windowStart = windowStartFor(now, workStart)
  const late = workEnd - windowStart < LATE_THRESHOLD

  const existing = occupied.filter((b) => b.end > b.start)
  // Items placed so far (raw spans; buffers are applied per search).
  const placed: BusyInterval[] = []
  const busyWith = (pad: number): BusyInterval[] =>
    [...existing, ...placed].map((b) => ({ start: b.start - pad, end: b.end + pad }))

  const result = new Map<string, PlannedItem>()
  const pending = (d: BrainDumpDraft, date: string, reason: PlannedItem['reason']) =>
    result.set(d.id, { draft: d, date, status: 'pending', reason })

  const todays: BrainDumpDraft[] = []
  for (const d of drafts) {
    const date = dayTokenToDate(d.day, now)
    if (date !== today) {
      // A later day with an explicit time keeps it; otherwise 待排 on that day.
      if (d.fixedTime && date > today) {
        const s = toMinutes(d.fixedTime)
        result.set(d.id, { draft: d, date, status: 'scheduled', start: d.fixedTime, end: toHHmm(s + d.estimatedMinutes) })
      } else {
        pending(d, date < today ? today : date, 'future')
      }
      continue
    }
    if (late) {
      pending(d, tomorrow, 'late')
      continue
    }
    todays.push(d)
  }

  // 1 — fixed times
  for (const d of todays.filter((x) => x.fixedTime)) {
    const s = toMinutes(d.fixedTime!)
    if (s < now.getHours() * 60 + now.getMinutes()) {
      pending(d, today, 'past-time')
      continue
    }
    const e = Math.min(24 * 60 - 1, s + d.estimatedMinutes)
    const conflict = overlapsAny([...existing, ...placed], s, e)
    placed.push({ start: s, end: e })
    result.set(d.id, { draft: d, date: today, status: 'scheduled', start: toHHmm(s), end: toHHmm(e), ...(conflict ? { conflict } : {}) })
  }

  const place = (d: BrainDumpDraft, from: number, to: number): boolean => {
    for (const pad of buffer > 0 ? [buffer, 0] : [0]) {
      const s = findSlot(busyWith(pad), from, to, d.estimatedMinutes)
      if (s !== null) {
        placed.push({ start: s, end: s + d.estimatedMinutes })
        result.set(d.id, { draft: d, date: today, status: 'scheduled', start: toHHmm(s), end: toHHmm(s + d.estimatedMinutes) })
        return true
      }
    }
    return false
  }

  // 2 — day parts
  for (const d of todays.filter((x) => !x.fixedTime && x.preferredPart)) {
    const [ps, pe] = PART_WINDOW[d.preferredPart!]
    const from = Math.max(windowStart, ps)
    // 「晚上」 was said out loud, so it may run past a short work window
    // (up to 22:00); morning / afternoon stop at their own edge.
    const to = d.preferredPart === 'evening' ? Math.min(pe, Math.max(workEnd, 22 * 60)) : Math.min(pe, workEnd)
    if (from >= to || !place(d, from, to)) pending(d, today, 'part-passed')
  }

  // 3 — the rest
  const order = new Map(drafts.map((d, i) => [d.id, i]))
  const flexible = todays
    .filter((x) => !x.fixedTime && !x.preferredPart)
    .sort((a, b) =>
      (b.urgency ?? 5) - (a.urgency ?? 5) ||
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
      a.estimatedMinutes - b.estimatedMinutes ||
      order.get(a.id)! - order.get(b.id)!)
  for (const d of flexible) {
    if (!place(d, windowStart, workEnd)) pending(d, today, 'full')
  }

  const items = drafts.map((d) => result.get(d.id)!).filter(Boolean)
  items.sort((a, b) => {
    const rank = (x: PlannedItem) => (x.status === 'scheduled' ? (x.date === today ? 0 : 1) : 2)
    return rank(a) - rank(b) ||
      a.date.localeCompare(b.date) ||
      (a.start ?? '').localeCompare(b.start ?? '') ||
      order.get(a.draft.id)! - order.get(b.draft.id)!
  })
  const todayCount = todays.length
  const full = !late && todayCount > 0 && items.every((x) => x.date !== today || x.status === 'pending')
  return { today, windowStart, windowEnd: workEnd, items, late, full }
}

/**
 * The date changed while the preview was open (past midnight): turn the
 * planned items back into drafts anchored on the new `now`. Anything dated
 * before the new today moves to today; later dates stay. Hand-picked times
 * are dropped (fixed times written in the text are kept) so planDay can
 * place everything again.
 */
export function rebaseDrafts(items: PlannedItem[], now: Date): BrainDumpDraft[] {
  const today = dateKey(now)
  return items.map(({ draft, date }) => ({ ...draft, day: dayToken(date < today ? today : date, now) }))
}

/** Re-check conflicts after the user edits one item by hand. */
export function markConflicts(items: PlannedItem[], occupied: BusyInterval[], today: string, included: (id: string) => boolean): PlannedItem[] {
  return items.map((item) => {
    if (item.status !== 'scheduled' || item.date !== today || !item.start || !item.end) {
      return item.conflict ? { ...item, conflict: false } : item
    }
    const s = toMinutes(item.start)
    const e = toMinutes(item.end)
    const others = items
      .filter((o) => o !== item && included(o.draft.id) && o.status === 'scheduled' && o.date === today && o.start && o.end)
      .map((o) => ({ start: toMinutes(o.start!), end: toMinutes(o.end!) }))
    const conflict = overlapsAny([...occupied, ...others], s, e)
    return conflict === !!item.conflict ? item : { ...item, conflict }
  })
}
