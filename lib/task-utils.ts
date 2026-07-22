import type { Task, ColorStatus, Workspace, Category } from './types'
import { toDateString } from './calendar-utils'
import { t, getLang } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────
// Workspace-tree traversal helpers
//
// The workspaces→categories→tasks shape gets walked in five-plus
// places (completed drawer, today-meetings popover, meeting reminder
// scanner, panel counters, app-level lookup). Each callsite had its
// own triple-nested loop with subtly different filtering — these
// helpers consolidate the walk so changes (e.g. "skip archived") apply
// once instead of being copy-pasted into drift.
// ─────────────────────────────────────────────────────────

/**
 * Walk every task in the workspace tree. Archived workspaces /
 * categories are skipped — every caller did this manually, so it's
 * baked into the helper. `cb` returns void; use `findTaskById` /
 * `filterTasks` for read-style queries.
 */
export function forEachTask(
  workspaces: Workspace[],
  cb: (task: Task, category: Category, workspace: Workspace) => void,
): void {
  for (const ws of workspaces) {
    if (ws.isArchived) continue
    for (const cat of ws.categories) {
      if (cat.isArchived) continue
      for (const t of cat.tasks) {
        if (t.isArchived) continue
        cb(t, cat, ws)
      }
    }
  }
}

/** Linear lookup by id. Returns null when not found. */
export function findTaskById(workspaces: Workspace[], id: string): Task | null {
  for (const ws of workspaces) {
    for (const cat of ws.categories) {
      for (const t of cat.tasks) {
        if (t.id === id) return t
      }
    }
  }
  return null
}

/** Filtered flatten — returns matching tasks paired with their ws/category. */
export function filterTasks(
  workspaces: Workspace[],
  predicate: (task: Task) => boolean,
): Array<{ task: Task; category: Category; workspace: Workspace }> {
  const out: Array<{ task: Task; category: Category; workspace: Workspace }> = []
  forEachTask(workspaces, (task, category, workspace) => {
    if (predicate(task)) out.push({ task, category, workspace })
  })
  return out
}

/**
 * The date that makes an active, one-off task eligible for the overdue
 * cleanup flow. A missed calendar slot takes precedence over a due date,
 * because the cleanup is primarily about removing stale time commitments
 * from the calendar. Recurring masters and meetings stay in their dedicated
 * calendar workflows so a bulk action can never rewrite a whole series.
 */
export function getTaskOverdueDate(task: Task, today = toDateString(new Date())): string | null {
  if (task.isCompleted || task.isArchived || task.isRecurring || task.isMeeting) return null
  if (task.scheduledDate && task.scheduledDate < today) return task.scheduledDate
  if (task.dueDate && task.dueDate < today) return task.dueDate
  return null
}

export function isTaskOverdue(task: Task, today = toDateString(new Date())): boolean {
  return getTaskOverdueDate(task, today) !== null
}

/**
 * Returns inline CSS color values for the entire task row.
 *
 * Primary color is always the workspace color (task.workspaceColor).
 * Urgency (1–10) only affects background opacity and the label text shown in the badge.
 * Overdue state overrides to a red warning color.
 * Completed state desaturates everything.
 *
 * @param displayColorOverride Pass the theme-adjusted display color (see
 * hooks/use-display-color.ts) when calling from a component that renders in
 * both light and dark mode. `task.workspaceColor` is always the persisted
 * *light-mode* hex; without this override, every color-mix derived here
 * (rowBg/accentColor/badgeBg/badgeText/dot) would carry that light-mode
 * saturation straight onto the dark card and read as neon. Defaults to the
 * raw workspace color so non-UI callers (tests, etc.) keep working.
 */
export function getUrgencyColor(task: Task, displayColorOverride?: string): {
  /** Full row background colour */
  rowBg: string
  /** Left accent border colour — matches workspace color */
  accentColor: string
  /** Small badge background */
  badgeBg: string
  /** Small badge text colour */
  badgeText: string
  /** Dot indicator colour */
  dot: string
  /** Human-readable status label */
  label: string | null
  /** Whether the task is overdue */
  isOverdue: boolean
} {
  const today = toDateString(new Date())
  const base = displayColorOverride ?? task.workspaceColor // theme-adjusted display color, or the raw workspace hex

  // Background opacity increases with urgency (0.04 at low, 0.12 at critical)
  const urgency = task.urgency
  const bgOpacity =
    urgency >= 9 ? 0.13
    : urgency >= 7 ? 0.10
    : urgency >= 5 ? 0.08
    : urgency >= 3 ? 0.06
    : 0.04

  const urgencyLabel =
    urgency >= 9 ? t('極度緊急')
    : urgency >= 7 ? t('高度緊急')
    : urgency >= 5 ? t('中等')
    : urgency >= 3 ? t('一般')
    : t('輕鬆')

  // --- Completed ---
  if (task.isCompleted) {
    return {
      rowBg: 'transparent',
      accentColor: `color-mix(in srgb, ${base} 35%, #aaa)`,
      badgeBg: `color-mix(in srgb, ${base} 12%, transparent)`,
      badgeText: `color-mix(in srgb, ${base} 40%, #888)`,
      dot: `color-mix(in srgb, ${base} 35%, #aaa)`,
      label: null,
      isOverdue: false,
    }
  }

  // --- Overdue (dueDate strictly before today) — red override ---
  if (task.dueDate && task.dueDate < today) {
    return {
      rowBg: `color-mix(in srgb, ${base} ${bgOpacity * 100}%, oklch(0.62 0.18 25 / 0.10))`,
      accentColor: 'oklch(0.58 0.20 25)',
      badgeBg: 'oklch(0.58 0.20 25 / 0.15)',
      badgeText: 'oklch(0.42 0.18 25)',
      dot: 'oklch(0.58 0.20 25)',
      label: t('已過期'),
      isOverdue: true,
    }
  }

  // --- Normal: workspace color drives everything ---
  return {
    rowBg: `color-mix(in srgb, ${base} ${Math.round(bgOpacity * 100)}%, transparent)`,
    accentColor: base,
    badgeBg: `color-mix(in srgb, ${base} 18%, transparent)`,
    badgeText: `color-mix(in srgb, ${base} 80%, #222)`,
    dot: base,
    label: urgencyLabel,
    isOverdue: false,
  }
}

export function getColorStatus(task: Task): ColorStatus {
  const today = toDateString(new Date())

  if (task.isCompleted) return 'completed'
  if (task.dueDate && task.dueDate < today) return 'overdue'
  if (task.scheduledDate === today) return 'today'

  if (task.dueDate) {
    const dueDate = new Date(task.dueDate)
    const todayDate = new Date(today)
    const diffDays = Math.ceil(
      (dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (diffDays <= 3 && diffDays > 0) return 'upcoming'
  }

  if (!task.dueDate) return 'no_deadline'
  return 'normal'
}

// Format time display
export function formatTime(time: string): string {
  return time // Already in HH:mm format
}

// Format date for display
export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  if (getLang() === 'en') {
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' })
    return `${year}/${month}/${day} (${weekday})`
  }
  const days = ['日', '一', '二', '三', '四', '五', '六']
  const weekday = days[date.getDay()]
  return `${year}/${month}/${day} 週${weekday}`
}

// Format estimated time
export function formatEstimatedTime(minutes?: number): string {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// Convert time string to minutes from midnight
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// Convert minutes from midnight to time string
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

// Calculate task block height in pixels
export function calculateBlockHeight(
  startTime: string,
  endTime: string,
  hourHeight: number = 60 // pixels per hour
): number {
  const startMinutes = timeToMinutes(startTime)
  const endMinutes = timeToMinutes(endTime)
  const durationMinutes = endMinutes - startMinutes
  const height = (durationMinutes / 60) * hourHeight
  return Math.max(height, hourHeight / 2) // Minimum half hour height
}

// Calculate task block position from top (relative to start hour)
export function calculateBlockTop(
  startTime: string,
  calendarStartHour: number = 0,
  hourHeight: number = 60 // pixels per hour
): number {
  const startMinutes = timeToMinutes(startTime)
  const calendarStartMinutes = calendarStartHour * 60
  return ((startMinutes - calendarStartMinutes) / 60) * hourHeight
}

// Snap time to 15-minute intervals
export function snapToInterval(minutes: number, interval: number = 15): number {
  return Math.round(minutes / interval) * interval
}

// Get workspace count of pending tasks
export function getWorkspacePendingCount(
  workspaceId: string,
  tasks: Task[]
): number {
  return tasks.filter(
    (t) => t.workspaceId === workspaceId && !t.isCompleted && !t.isArchived
  ).length
}
