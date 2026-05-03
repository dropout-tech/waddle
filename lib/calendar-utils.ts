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
