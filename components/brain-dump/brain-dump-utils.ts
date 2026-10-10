import { parseDateString, taskOccursOnDate, timeToMinutes } from '@/lib/calendar-utils'
import { addDays, dateKey } from '@/lib/brain-dump/parse'
import type { ScheduleSlot } from '@/lib/brain-dump/schedule'
import type { BusyInterval } from '@/lib/brain-dump/types'
import type { Task, TimeBlock, Workspace } from '@/lib/types'

type T = (text: string, vars?: Record<string, string | number>) => string

/** Everything already on `date` (YYYY-MM-DD): timed tasks — recurring
 *  occurrences and tasks assigned to me included — and time blocks. Both
 *  count as busy for scheduling. Read-only; never sent anywhere. */
export function collectBusy(
  workspaces: Workspace[],
  assigned: Task[],
  timeBlocks: TimeBlock[],
  date: string,
): BusyInterval[] {
  const day = parseDateString(date)
  const out: BusyInterval[] = []
  const span = (start: string, end: string, label: string) => {
    const s = timeToMinutes(start)
    let e = timeToMinutes(end)
    if (!Number.isFinite(s) || !Number.isFinite(e)) return
    if (e <= s) e = 24 * 60 // runs past midnight
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
    if (block.date !== date) continue
    span(block.startTime, block.endTime, block.label)
  }
  return out
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

/** 今天 15:00–15:30 */
export function formatSlot(slot: ScheduleSlot, now: Date, lang: string, t: T): string {
  return t('{day} {start}–{end}', { day: formatDay(slot.date, now, lang, t), start: slot.start, end: slot.end })
}
