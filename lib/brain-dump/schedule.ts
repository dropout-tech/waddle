// scheduleDrafts — which brain-dump to-dos go onto the calendar, and where.
//
// Pure (no React, no '@/' imports, no network) so a node test can run it. The
// caller hands in the drafts, the device clock and what is already on each
// day (tasks, time blocks, assigned tasks → BusyInterval[]); nothing here
// reads the calendar, and none of it is ever sent to the AI.
//
// Rules (decided by the owner, 2026-10-10)
//   R1  a clock time was said (「下午三點」「3點半」「15:00」「3pm」) → exactly that
//       time on the to-do's date. The date is its due date (「明天」「週五」「10/15」)
//       or, when there is none, today. It may overlap what is already there
//       (flagged `conflict`) — the member asked for that hour.
//   R2  only a part of the day was said (早上 / 中午 / 下午 / 傍晚 / 晚上) → the
//       EARLIEST free gap inside that part, avoiding the calendar and the
//       to-dos already placed in this same batch. No gap → not scheduled
//       ('no-room'); the to-do keeps its date.
//   R3  no time said → not scheduled (no outcome slot, no reason).
//   R4  length: the stated one, else 30 minutes (never the keyword guess in
//       `estimatedMinutes`). A to-do cannot run past midnight: it is cut at the
//       end of the day (stored as 23:59), and if the cut leaves under 15
//       minutes it is not scheduled.
//   R5  start earlier than now → not scheduled ('past'). A part of the day that
//       is only partly over is searched from the next 15-minute mark after
//       now; a part that is fully over is 'past'.
//   R6  deadlines (「三點前」 / "by 3pm") never reach this file as a time: the
//       Edge Function and the local parser both drop them.
//   R8  how an hour written without 上午/下午 is read lives in parse.ts
//       (normaliseClock: 1–7 點 = afternoon, 8–12 as written) and in the Edge
//       Function (clockTo24h) — by the time a draft gets here `fixedTime` is
//       already 24h "HH:mm".
//
// Part-of-day windows are plan.ts's: 早上 09:00–12:00, 下午 12:00–18:00,
// 晚上 18:00–22:00 (plan.ts' PART_WINDOW cut by its default work window), plus
// 中午 11:30–13:30 for the AI's bare 「中午」. A to-do must fit entirely inside
// its window.

import { dateKey, dayTokenToDate } from './parse'
import { PART_WINDOW, STEP, findSlot, overlapsAny, toHHmm } from './plan'
import type { BrainDumpDraft, BusyInterval, DayPart } from './types'

/** Length when the text did not say (R4). */
export const DEFAULT_MINUTES = 30
/** A to-do cut short by midnight must keep at least this much (R4). */
export const MIN_TRUNCATED_MINUTES = 15
const DAY_END = 24 * 60
/** plan.ts' default work window — where "earliest gap in the morning" starts. */
const SEARCH_START = 9 * 60
const EVENING_END = 22 * 60

export type NoSlotReason =
  /** The time (or the whole part of the day) is already behind us. */
  | 'past'
  /** Nothing free in that part of the day (or too close to midnight). */
  | 'no-room'

export interface ScheduleSlot {
  /** YYYY-MM-DD */
  date: string
  /** HH:mm */
  start: string
  /** HH:mm — never past 23:59. */
  end: string
  /** Real length in minutes (what end − start would be without the 23:59 cap). */
  minutes: number
  /** An explicit time that overlaps something already on the calendar. */
  conflict?: boolean
}

/** What happened to one draft. Neither `slot` nor `reason` = no time was said. */
export interface ScheduleOutcome {
  id: string
  slot?: ScheduleSlot
  reason?: NoSlotReason
}

/** What is already on each day: a map by YYYY-MM-DD, or a lookup function. */
export type BusyLookup = Record<string, BusyInterval[]> | ((date: string) => BusyInterval[])

export interface ScheduleOptions {
  /** Device "now" — decides today, and what is already past. */
  now: Date
  busy?: BusyLookup
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/

/** The day a to-do's time is meant for: its due date, else the day it was
 *  filed under (today unless the local parser read 「明天」). */
export function scheduleDateOf(d: BrainDumpDraft, now: Date): string {
  if (d.dueDate && ISO_DATE.test(d.dueDate)) return d.dueDate
  const date = dayTokenToDate(d.day, now)
  return ISO_DATE.test(date) ? date : dateKey(now)
}

/** Minutes of the explicit time, or null when the draft has none. */
function clockMinutes(d: BrainDumpDraft): number | null {
  const m = d.fixedTime ? CLOCK.exec(d.fixedTime) : null
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function lengthOf(d: BrainDumpDraft): number {
  const n = d.minutesGuessed ? DEFAULT_MINUTES : d.estimatedMinutes
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : DEFAULT_MINUTES
}

/** [start, end) minutes a to-do for this part of the day may occupy. */
export function partSearchWindow(part: DayPart): [number, number] {
  const [from, to] = PART_WINDOW[part]
  return [Math.max(from, SEARCH_START), part === 'evening' ? Math.min(to, EVENING_END) : to]
}

/** The next 15-minute mark strictly after `minutes` (16:30 → 16:45). */
function nextMark(minutes: number): number {
  return (Math.floor(minutes / STEP) + 1) * STEP
}

export function scheduleDrafts(drafts: BrainDumpDraft[], opts: ScheduleOptions): Map<string, ScheduleOutcome> {
  const { now, busy } = opts
  const today = dateKey(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const existing = (date: string): BusyInterval[] =>
    (typeof busy === 'function' ? busy(date) : busy?.[date] ?? []).filter((b) => b.end > b.start)

  // Spans taken by earlier drafts of this same batch, per date.
  const placed = new Map<string, BusyInterval[]>()
  const taken = (date: string): BusyInterval[] => [...existing(date), ...(placed.get(date) ?? [])]
  const claim = (date: string, start: number, end: number) => {
    placed.set(date, [...(placed.get(date) ?? []), { start, end }])
  }

  const out = new Map<string, ScheduleOutcome>(drafts.map((d) => [d.id, { id: d.id }]))
  const settle = (id: string, outcome: Omit<ScheduleOutcome, 'id'>) => out.set(id, { id, ...outcome })
  const slotOf = (date: string, start: number, end: number, conflict = false): ScheduleSlot => ({
    date,
    start: toHHmm(start),
    end: toHHmm(end), // clamps 24:00 to 23:59
    minutes: end - start,
    ...(conflict ? { conflict } : {}),
  })

  // R1 — explicit times go first, so a day part never takes their hour.
  for (const d of drafts) {
    const start = clockMinutes(d)
    if (start === null) continue
    const date = scheduleDateOf(d, now)
    if (date < today || (date === today && start < nowMinutes)) {
      settle(d.id, { reason: 'past' })
      continue
    }
    const wanted = start + lengthOf(d)
    const end = Math.min(wanted, DAY_END)
    if (wanted > DAY_END && end - start < MIN_TRUNCATED_MINUTES) {
      settle(d.id, { reason: 'no-room' })
      continue
    }
    const conflict = overlapsAny(taken(date), start, end)
    claim(date, start, end)
    settle(d.id, { slot: slotOf(date, start, end, conflict) })
  }

  // R2 — a part of the day: earliest free gap, in the order they were written.
  for (const d of drafts) {
    if (clockMinutes(d) !== null || !d.preferredPart || !(d.preferredPart in PART_WINDOW)) continue
    const date = scheduleDateOf(d, now)
    if (date < today) {
      settle(d.id, { reason: 'past' })
      continue
    }
    const [windowStart, windowEnd] = partSearchWindow(d.preferredPart)
    const from = date === today ? Math.max(windowStart, nextMark(nowMinutes)) : windowStart
    if (from >= windowEnd) {
      settle(d.id, { reason: 'past' })
      continue
    }
    const length = lengthOf(d)
    const start = findSlot(taken(date), from, windowEnd, length)
    if (start === null) {
      settle(d.id, { reason: 'no-room' })
      continue
    }
    claim(date, start, start + length)
    settle(d.id, { slot: slotOf(date, start, start + length) })
  }

  return out
}

/**
 * The member typed (or cleared) a time in the note editor. It replaces
 * whatever the text said: a valid "HH:mm" becomes the explicit time (R1, with
 * R4/R5 applied by the next scheduleDrafts); empty means "don't schedule".
 */
export function withManualTime(d: BrainDumpDraft, time: string): BrainDumpDraft {
  const next = { ...d }
  delete next.fixedTime
  delete next.preferredPart
  const m = CLOCK.exec(time)
  return m ? { ...next, fixedTime: `${m[1].padStart(2, '0')}:${m[2]}` } : next
}
