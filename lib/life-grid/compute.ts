/**
 * 人生年曆 (life grid) — pure date math, no React / Supabase / path aliases.
 *
 * Kept dependency-free on purpose so node can import it directly in
 * scripts/e2e/life-grid-compute-verify.mjs (Node strips the types). Dates are
 * plain `YYYY-MM-DD` strings throughout: they compare correctly as strings,
 * map 1:1 onto `journal_entries.date`, and never drift across time zones.
 */

export type Mood = 'great' | 'good' | 'neutral' | 'bad' | 'terrible'

/** Brightest → heaviest. Also the order of the mood picker. */
export const MOODS: readonly Mood[] = ['great', 'good', 'neutral', 'bad', 'terrible']

/** One line a day — short enough to stay a "sentence", not a diary entry. */
export const DAILY_LINE_MAX = 140

export type CellState = 'past' | 'today' | 'future'

export interface GridDay {
  date: string
  day: number
  state: CellState
}

export interface GridMonth {
  /** 1–12 */
  month: number
  days: GridDay[]
}

/**
 * "Today" for the life grid, in Asia/Taipei — the same shared day the daily
 * check-in uses (lib/daily-check-in.ts `checkInDate`, duplicated here so this
 * file stays importable from plain node).
 */
export function taipeiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** `month` is 1–12. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

export function dateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Strict parse: rejects 2026-02-30, 2025-02-29, malformed strings. */
export function parseDateKey(s: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

export function cellState(date: string, today: string): CellState {
  if (date === today) return 'today'
  return date < today ? 'past' : 'future'
}

/** 12 rows (Jan–Dec), each holding only the days that exist that month. */
export function buildYearGrid(year: number, today: string): GridMonth[] {
  const months: GridMonth[] = []
  for (let month = 1; month <= 12; month++) {
    const days: GridDay[] = []
    for (let day = 1; day <= daysInMonth(year, month); day++) {
      const date = dateKey(year, month, day)
      days.push({ date, day, state: cellState(date, today) })
    }
    months.push({ month, days })
  }
  return months
}

/** 1-based position of `date` within its year (Jan 1 = 1, Dec 31 = 365/366). */
export function dayOfYear(date: string): number {
  const p = parseDateKey(date)
  if (!p) return 0
  let n = p.day
  for (let m = 1; m < p.month; m++) n += daysInMonth(p.year, m)
  return n
}

/** How many days of `year` have arrived by `today` (today included). */
export function daysArrived(year: number, today: string): number {
  const t = parseDateKey(today)
  if (!t) return 0
  if (year < t.year) return daysInYear(year)
  if (year > t.year) return 0
  return dayOfYear(today)
}

/** Only today and earlier can be written; tomorrow hasn't happened yet. */
export function isWritableDate(date: string, today: string): boolean {
  return parseDateKey(date) !== null && date <= today
}

/** Number of distinct written dates that fall inside `year`. */
export function countWrittenInYear(dates: Iterable<string>, year: number): number {
  const prefix = `${String(year).padStart(4, '0')}-`
  const seen = new Set<string>()
  for (const d of dates) if (d.startsWith(prefix) && parseDateKey(d)) seen.add(d)
  return seen.size
}

/**
 * Tidy a typed line for storage: single line (newlines → spaces), collapsed
 * whitespace, trimmed, capped at DAILY_LINE_MAX characters (code points, so
 * an emoji never gets split in half).
 */
export function normalizeLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return Array.from(flat).slice(0, DAILY_LINE_MAX).join('')
}

export function isMood(v: unknown): v is Mood {
  return typeof v === 'string' && (MOODS as readonly string[]).includes(v)
}
