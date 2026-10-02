import { taskOccursOnDate, timeToMinutes } from '@/lib/calendar-utils'
import { addDays, dateKey } from '@/lib/brain-dump/parse'
import type { BusyInterval } from '@/lib/brain-dump/types'
import type { Task, TimeBlock, Workspace } from '@/lib/types'

type T = (text: string, vars?: Record<string, string | number>) => string

/** Everything already on `day`: timed tasks (incl. recurring occurrences
 *  and tasks assigned to me) and time blocks. Both count as busy. */
export function collectBusy(workspaces: Workspace[], assigned: Task[], timeBlocks: TimeBlock[], day: Date): BusyInterval[] {
  const key = dateKey(day)
  const out: BusyInterval[] = []
  const span = (start: string, end: string, label: string) => {
    const s = timeToMinutes(start)
    let e = timeToMinutes(end)
    if (!Number.isFinite(s) || !Number.isFinite(e)) return
    if (e <= s) e = 24 * 60
    out.push({ start: s, end: e, label })
  }
  const tasks: Task[] = [
    ...workspaces.filter((w) => !w.isArchived).flatMap((w) => w.categories.flatMap((c) => c.tasks)),
    ...assigned,
  ]
  for (const task of tasks) {
    if (task.isArchived || !task.scheduledStartTime || !task.scheduledEndTime) continue
    if (!taskOccursOnDate(task, day)) continue
    span(task.scheduledStartTime, task.scheduledEndTime, task.title)
  }
  for (const block of timeBlocks) {
    if (block.date !== key) continue
    span(block.startTime, block.endTime, block.label)
  }
  return out
}

export function formatDuration(minutes: number, t: T): string {
  if (minutes < 60) return t('{n} 分鐘', { n: minutes })
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? t('{h} 小時 {m} 分', { h, m }) : t('{h} 小時', { h })
}

const WEEK_ZH = '日一二三四五六'
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** 10/9（五） / Fri 10/9 */
export function formatMonthDay(date: string, lang: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const wd = new Date(y, m - 1, d).getDay()
  return lang === 'en' ? `${WEEK_EN[wd]} ${m}/${d}` : `${m}/${d}（${WEEK_ZH[wd]}）`
}

/** 今天 / 明天 / 10/9（五） */
export function formatDay(date: string, now: Date, lang: string, t: T): string {
  if (date === dateKey(now)) return t('今天')
  if (date === dateKey(addDays(now, 1))) return t('明天')
  return formatMonthDay(date, lang)
}

/** The category with the most tasks created in the 7 days before `now`. */
export function busiestRecentCategory(workspaces: Workspace[], now: number): string | undefined {
  const since = now - 7 * 24 * 3600 * 1000
  let best: { id: string; n: number } | undefined
  for (const w of workspaces) {
    if (w.isArchived) continue
    for (const c of w.categories) {
      if (c.isArchived) continue
      const n = c.tasks.filter((x) => Date.parse(x.createdAt) >= since).length
      if (n && (!best || n > best.n)) best = { id: c.id, n }
    }
  }
  return best?.id
}
