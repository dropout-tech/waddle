import type { Task } from './types'

export const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const

export const SNAP_MINUTES = 15

/**
 * Format a Date as a local-time YYYY-MM-DD string.
 *
 * Important: never use `date.toISOString().split('T')[0]` for app-internal
 * date keys — that returns the UTC date, which differs from the local date
 * by ±1 day for users east/west of UTC. Tasks dropped on a column would be
 * saved against a different day than the column label and could appear in
 * the wrong week.
 */
export function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function snap(minutes: number, step: number = SNAP_MINUTES): number {
  return Math.round(minutes / step) * step
}

/**
 * Result of hit-testing a viewport coordinate against the calendar's day
 * grid + pending zones. Used by external drag sources (e.g. dragging a task
 * row from the left panel onto the calendar) to figure out where the drop
 * should land without each source needing knowledge of the calendar's
 * internal layout. Day columns and pending zones expose the data
 * attributes consumed below.
 */
export type CalendarHit =
  | { kind: 'pending'; date: string }
  | { kind: 'grid'; date: string; minutes: number }
  | null

export function calendarHitTest(clientX: number, clientY: number): CalendarHit {
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  if (!el) return null

  // Pending zone takes precedence — it sits in the calendar header above the
  // grid, so a cursor at the same X but in the header should resolve here.
  const pendingEl = el.closest('[data-pending-zone]') as HTMLElement | null
  if (pendingEl) {
    const date = pendingEl.getAttribute('data-pending-zone-date')
    if (date) return { kind: 'pending', date }
  }

  const gridEl = el.closest('[data-day-grid]') as HTMLElement | null
  if (gridEl) {
    const date = gridEl.getAttribute('data-day-date')
    const hourHeight = Number(gridEl.getAttribute('data-hour-height') ?? 0)
    const startMinute = Number(gridEl.getAttribute('data-start-minute') ?? 0)
    if (date && hourHeight > 0) {
      const rect = gridEl.getBoundingClientRect()
      const yInGrid = clientY - rect.top
      const minutes = startMinute + (yInGrid / hourHeight) * 60
      const snapped = Math.max(startMinute, snap(minutes))
      return { kind: 'grid', date, minutes: snapped }
    }
  }

  return null
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

export function overlaps(a: Task, b: Task): boolean {
  if (!a.scheduledStartTime || !a.scheduledEndTime || !b.scheduledStartTime || !b.scheduledEndTime) {
    return false
  }
  const aStart = timeToMinutes(a.scheduledStartTime)
  const aEnd = timeToMinutes(a.scheduledEndTime)
  const bStart = timeToMinutes(b.scheduledStartTime)
  const bEnd = timeToMinutes(b.scheduledEndTime)
  return aStart < bEnd && aEnd > bStart
}

/**
 * Greedy column packing for overlapping tasks.
 * Returns column index + total columns for each task in its overlap group.
 */
export function calculateTaskColumns(
  tasks: Task[]
): Map<string, { column: number; totalColumns: number }> {
  const result = new Map<string, { column: number; totalColumns: number }>()
  const valid = tasks.filter((t) => t.scheduledStartTime && t.scheduledEndTime)
  if (!valid.length) return result

  const sorted = [...valid].sort((a, b) => {
    const startDiff = timeToMinutes(a.scheduledStartTime!) - timeToMinutes(b.scheduledStartTime!)
    if (startDiff !== 0) return startDiff
    const aDur = timeToMinutes(a.scheduledEndTime!) - timeToMinutes(a.scheduledStartTime!)
    const bDur = timeToMinutes(b.scheduledEndTime!) - timeToMinutes(b.scheduledStartTime!)
    return bDur - aDur
  })

  const visited = new Set<string>()
  const groups: Task[][] = []

  for (const task of sorted) {
    if (visited.has(task.id)) continue
    const group: Task[] = []
    const queue = [task]
    while (queue.length) {
      const cur = queue.shift()!
      if (visited.has(cur.id)) continue
      visited.add(cur.id)
      group.push(cur)
      for (const other of sorted) {
        if (!visited.has(other.id) && overlaps(cur, other)) queue.push(other)
      }
    }
    groups.push(group)
  }

  for (const group of groups) {
    group.sort(
      (a, b) => timeToMinutes(a.scheduledStartTime!) - timeToMinutes(b.scheduledStartTime!)
    )
    const columnEnds: number[] = []
    for (const task of group) {
      const taskStart = timeToMinutes(task.scheduledStartTime!)
      let placed = false
      for (let col = 0; col < columnEnds.length; col++) {
        if (columnEnds[col] <= taskStart) {
          result.set(task.id, { column: col, totalColumns: 0 })
          columnEnds[col] = timeToMinutes(task.scheduledEndTime!)
          placed = true
          break
        }
      }
      if (!placed) {
        result.set(task.id, { column: columnEnds.length, totalColumns: 0 })
        columnEnds.push(timeToMinutes(task.scheduledEndTime!))
      }
    }
    const total = columnEnds.length
    for (const task of group) {
      const e = result.get(task.id)!
      result.set(task.id, { column: e.column, totalColumns: total })
    }
  }
  return result
}
