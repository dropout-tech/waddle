// Shared types for 「亂丟一句話，企鵝幫你排好今天」(brain dump → day plan).
// Pure data — no React, no '@/' imports — so the node verify script
// (scripts/e2e/brain-dump-parse-verify.mjs) can transpile and run it.

export type BrainDumpLang = 'zh-TW' | 'en'

export type DayPart = 'morning' | 'afternoon' | 'evening'

/**
 * WHEN something should happen, as a *kind of expression* — never a
 * computed date. Mirrors the `dueSchema` design in
 * supabase/functions/meeting-import/contract.ts: whoever reads the text
 * (the local rules or, later, an AI model) only classifies the wording;
 * `resolveWhen()` turns it into YYYY-MM-DD deterministically, anchored on
 * the device clock. Models are bad at weekday arithmetic.
 */
export type BrainDumpWhen =
  | { kind: 'today' }
  /** 明天 = 1, 後天 = 2 … */
  | { kind: 'relative_days'; days: number }
  /** 1 = Monday … 7 = Sunday. 'this' = the next one on/after today
   *  (bare 週五 / Friday); 'next' = that weekday in next week (下週五). */
  | { kind: 'weekday'; weekday: number; week: 'this' | 'next' }
  /** A literal calendar date written by the user. */
  | { kind: 'date'; date: string }

export interface BrainDumpDraft {
  /** Stable key for React lists and edits. */
  id: string
  /** The fragment of the original text this came from. */
  source: string
  title: string
  estimatedMinutes: number
  /** True when no duration was written and we guessed from keywords. */
  minutesGuessed: boolean
  /** 'today' | 'tomorrow' | YYYY-MM-DD (any other day). */
  day: string
  /** YYYY-MM-DD — from 「週五前」/"by Friday". */
  dueDate?: string
  preferredPart?: DayPart
  /** HH:mm — from 「下午3點」/"at 3pm". */
  fixedTime?: string
  /** 1–10, same scale as Task.urgency. Undefined = normal (5). */
  urgency?: number
}

/** A busy span on the planned day, in minutes from 00:00. */
export interface BusyInterval {
  start: number
  end: number
  label?: string
}

export type PendingReason =
  /** Belongs to a later day — goes to that day's pending zone. */
  | 'future'
  /** No free slot big enough today. */
  | 'full'
  /** Less than 30 minutes left in today's window — moved to tomorrow. */
  | 'late'
  /** Asked for 下午/晚上 but that part of the day is gone or full. */
  | 'part-passed'
  /** A fixed time that has already passed today. */
  | 'past-time'

export interface PlannedItem {
  draft: BrainDumpDraft
  /** YYYY-MM-DD the task is scheduled / pending on. */
  date: string
  status: 'scheduled' | 'pending'
  /** HH:mm, only when scheduled. */
  start?: string
  end?: string
  reason?: PendingReason
  /** Scheduled on top of something already in the calendar (only fixed
   *  times or manual edits can do that — the planner never overlaps). */
  conflict?: boolean
}

export interface DayPlan {
  today: string
  /** The usable window actually searched, minutes from 00:00. */
  windowStart: number
  windowEnd: number
  items: PlannedItem[]
  /** Under 30 minutes of today's window left — everything went to tomorrow. */
  late: boolean
  /** Something was meant for today but nothing of it fit. */
  full: boolean
}
