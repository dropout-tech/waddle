import type { Task, TimeBlock } from './types'

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

/**
 * Parse a YYYY-MM-DD date string as local midnight (matching toDateString).
 * Avoid `new Date(str)` which interprets bare YYYY-MM-DD as UTC midnight,
 * shifting it by ±1 day depending on timezone.
 */
export function parseDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 86_400_000
  // Normalize to local midnight to avoid DST off-by-one.
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((bMid - aMid) / MS_PER_DAY)
}

/**
 * Whether a recurring task should appear on the given date — including
 * future occurrences derived from `task.recurrence`.
 *
 * Returns true for the task's original `scheduledDate`, plus every
 * date that matches its recurrence pattern up to `recurrence.endDate`
 * (inclusive). Non-recurring tasks return true only for their exact date.
 */
export function taskOccursOnDate(task: Task, date: Date): boolean {
  if (!task.scheduledDate) return false
  const dateStr = toDateString(date)

  // If this date is explicitly excluded, it never occurs.
  if (task.exdates?.includes(dateStr)) return false

  // Original occurrence — always counts.
  if (task.scheduledDate === dateStr) return true

  if (!task.isRecurring || !task.recurrence) return false

  const start = parseDateString(task.scheduledDate)
  if (date.getTime() < start.getTime()) return false

  if (task.recurrence.endDate && dateStr > task.recurrence.endDate) return false

  const interval = Math.max(1, task.recurrence.interval || 1)
  const days = daysBetween(start, date)
  if (days <= 0) return false

  switch (task.recurrence.type) {
    case 'daily':
      return days % interval === 0

    case 'weekly': {
      // For weekly: only same week-positions every `interval` weeks count.
      // If daysOfWeek is set, the task fires on each chosen weekday in those
      // weeks. Otherwise it fires on the original weekday.
      const startOfWeek = (d: Date) => {
        const day = d.getDay()
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day)
        return monday
      }
      const weeksSince = Math.floor(daysBetween(startOfWeek(start), startOfWeek(date)) / 7)
      if (weeksSince % interval !== 0) return false
      const dow = task.recurrence.daysOfWeek
      if (dow && dow.length > 0) {
        return dow.includes(date.getDay())
      }
      return date.getDay() === start.getDay()
    }

    case 'monthly': {
      const months = (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth())
      if (months <= 0 || months % interval !== 0) return false
      return date.getDate() === start.getDate()
    }

    case 'custom':
      // Custom = every `interval` days.
      return days % interval === 0
  }

  return false
}

/**
 * True iff the date is a *future* (virtual) occurrence — i.e. the task
 * recurs on this date but `task.scheduledDate` is a different day. Use
 * this to disable drag/resize on derived instances and to render a
 * subtle "🔁" indicator.
 */
export function isVirtualOccurrence(task: Task, date: Date): boolean {
  if (!task.isRecurring) return false
  return task.scheduledDate !== toDateString(date) && taskOccursOnDate(task, date)
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

/**
 * Fit a task of `durationMinutes` into a visible calendar range.
 *
 * Pending tasks use this when they are dragged from the all-day header onto
 * the timeline. Clamping only the start to `max - 15` can produce an end such
 * as 24:45 for a 60-minute task, which Postgres `time` rejects and which the
 * calendar cannot render inside the visible grid.
 */
export function fitTaskTimeRange(
  startMinutes: number,
  durationMinutes: number,
  minMinutes: number,
  maxMinutes: number,
): { start: number; end: number; duration: number } {
  const available = Math.max(SNAP_MINUTES, maxMinutes - minMinutes)
  const requestedDuration = Number.isFinite(durationMinutes) && durationMinutes > 0
    ? Math.round(durationMinutes)
    : 30
  const duration = clamp(requestedDuration, SNAP_MINUTES, available)
  const start = clamp(snap(startMinutes), minMinutes, maxMinutes - duration)
  return { start, end: start + duration, duration }
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

/**
 * Scroll the given container towards the cursor when the cursor is near
 * the top or bottom edge — used during a drag so users can drop on
 * times currently scrolled off-screen. Idempotent: calling it on every
 * pointermove during a drag does the right thing.
 */
export function autoScrollContainerNearEdge(container: HTMLElement, clientY: number) {
  const rect = container.getBoundingClientRect()
  const distFromTop = clientY - rect.top
  const distFromBottom = rect.bottom - clientY
  const edge = 80
  const maxSpeed = 12
  if (distFromTop < edge && distFromTop > -10) {
    const factor = Math.max(0, (edge - distFromTop) / edge)
    container.scrollTop -= maxSpeed * factor
  } else if (distFromBottom < edge && distFromBottom > -10) {
    const factor = Math.max(0, (edge - distFromBottom) / edge)
    container.scrollTop += maxSpeed * factor
  }
}

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

const MIN_TASK_LAYOUT_DURATION_MINUTES = 30
const MIN_OVERLAY_LAYOUT_DURATION_MINUTES = 15

/**
 * Calendar task cards keep a 30-minute visual height so a 15-minute task is
 * still readable and draggable. Column packing must use that same visual
 * footprint; otherwise back-to-back short tasks are assigned to one column
 * and the taller card from the earlier task covers the next one.
 */
function withMinimumLayoutDuration(task: Task, minimumMinutes: number): Task {
  if (!task.scheduledStartTime || !task.scheduledEndTime || minimumMinutes <= 0) {
    return task
  }

  const start = timeToMinutes(task.scheduledStartTime)
  const end = timeToMinutes(task.scheduledEndTime)
  if (end - start >= minimumMinutes) return task

  return {
    ...task,
    scheduledEndTime: minutesToTime(start + minimumMinutes),
  }
}

/**
 * Greedy column packing for overlapping task cards.
 *
 * By default the overlap calculation follows TaskBlock's 30-minute minimum
 * rendered height, not only the persisted duration. Callers that have already
 * normalized mixed item types can pass a different minimum (including 0).
 * Returns column index + total columns for each task in its overlap group.
 */
export function calculateTaskColumns(
  tasks: Task[],
  minimumLayoutDurationMinutes: number = MIN_TASK_LAYOUT_DURATION_MINUTES,
): Map<string, { column: number; totalColumns: number }> {
  const result = new Map<string, { column: number; totalColumns: number }>()
  const valid = tasks
    .filter((t) => t.scheduledStartTime && t.scheduledEndTime)
    .map((task) => withMinimumLayoutDuration(task, minimumLayoutDurationMinutes))
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

/**
 * Pack tasks AND TimeBlocks into the same column layout so a block that
 * shares a time range with a task gets a sibling column instead of
 * stacking underneath. Returns two maps keyed by their respective ids
 * (Task.id and TimeBlock.id); each map only contains the items it owns,
 * so callers can look up "what column does this task / block live in"
 * without worrying about id collisions.
 *
 * Blocks are converted to a Task-shaped shim with a `__block__` id prefix
 * to keep them separable in the packed result.
 */
export function calculateUnifiedColumns(
  tasks: Task[],
  blocks: TimeBlock[],
  /**
   * Shared-calendar peer events (Task-shaped shims from
   * use-calendar-sharing). They join the same packing so a peer's event
   * fans out into a sibling column instead of covering the user's own
   * task. Their ids are already prefixed (`peer:`) so they can't collide
   * with real task ids. Optional — existing callers are unaffected.
   */
  peerEvents: Task[] = []
): {
  tasks: Map<string, { column: number; totalColumns: number }>
  blocks: Map<string, { column: number; totalColumns: number }>
  peers: Map<string, { column: number; totalColumns: number }>
} {
  const BLOCK_PREFIX = '__block__'
  // TaskBlock renders tasks at a minimum 30-minute height. Time blocks and
  // peer overlays use a 15-minute minimum, so normalize each item to the
  // footprint its component actually paints before sharing one column grid.
  const taskShims = tasks.map((task) =>
    withMinimumLayoutDuration(task, MIN_TASK_LAYOUT_DURATION_MINUTES)
  )
  const blockShims = blocks.map(
    (b) =>
      withMinimumLayoutDuration(
        ({
          id: `${BLOCK_PREFIX}${b.id}`,
          scheduledStartTime: b.startTime,
          scheduledEndTime: b.endTime,
        }) as unknown as Task,
        MIN_OVERLAY_LAYOUT_DURATION_MINUTES,
      )
  )
  const peerShims = peerEvents.map((event) =>
    withMinimumLayoutDuration(event, MIN_OVERLAY_LAYOUT_DURATION_MINUTES)
  )
  const packed = calculateTaskColumns([...taskShims, ...blockShims, ...peerShims], 0)

  const taskCols = new Map<string, { column: number; totalColumns: number }>()
  const blockCols = new Map<string, { column: number; totalColumns: number }>()
  const peerCols = new Map<string, { column: number; totalColumns: number }>()
  for (const t of tasks) {
    const v = packed.get(t.id)
    if (v) taskCols.set(t.id, v)
  }
  for (const b of blocks) {
    const v = packed.get(`${BLOCK_PREFIX}${b.id}`)
    if (v) blockCols.set(b.id, v)
  }
  for (const p of peerEvents) {
    const v = packed.get(p.id)
    if (v) peerCols.set(p.id, v)
  }
  return { tasks: taskCols, blocks: blockCols, peers: peerCols }
}
