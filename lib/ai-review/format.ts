import type { Lang } from '@/lib/i18n'
import type { PeriodKey } from './api'

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Period labels. Written as a language branch instead of t() because the shared
 * dictionary already maps '上週'/'上月' to lower-case mid-sentence English
 * ("last week"), which is wrong for a button label.
 */
export function periodLabel(period: PeriodKey, lang: Lang): string {
  if (lang === 'en') {
    return { this_week: 'This week', last_week: 'Last week', this_month: 'This month', last_month: 'Last month' }[period]
  }
  return { this_week: '本週', last_week: '上週', this_month: '本月', last_month: '上月' }[period]
}

/** "2026-11-01" -> "11 月 1 日" / "Nov 1". Falls back to the raw string. */
export function formatResetDate(ymd: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!m) return ymd
  const month = Number(m[2])
  const day = Number(m[3])
  if (!month || !day) return ymd
  return lang === 'en' ? `${MONTH_ABBR[month - 1] ?? month} ${day}` : `${month} 月 ${day} 日`
}

/** Local-time "m/d" of an ISO timestamp (browser time zone). */
export function shortDate(iso: string, lang: Lang): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return lang === 'en' ? `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}` : `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * Range chip text such as "9/26 – 10/3". `end` is the exclusive end for the
 * `last_*` periods and "now" for the `this_*` ones; for display we show the
 * last day that is actually covered.
 */
export function periodRange(startIso: string, endIso: string, lang: Lang): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  // The window ends at an instant; step one second back so a midnight boundary
  // is not shown as an extra day.
  const lastDay = new Date(end.getTime() - 1000)
  return `${shortDate(start.toISOString(), lang)} – ${shortDate(lastDay.toISOString(), lang)}`
}

/** "HH:mm" in the browser's time zone, or '' if unparsable. */
export function clockTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Same rounding as the Review page: `components/reports/report-dashboard.tsx` hoursText(). */
export function hoursText(minutes: number): string {
  return String(Math.round((minutes / 60) * 10) / 10)
}
