import type { Task, ColorStatus } from './types'

/**
 * Returns inline CSS color values for the entire task row.
 *
 * Primary color is always the workspace color (task.workspaceColor).
 * Urgency (1–10) only affects background opacity and the label text shown in the badge.
 * Overdue state overrides to a red warning color.
 * Completed state desaturates everything.
 */
export function getUrgencyColor(task: Task): {
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
  const today = new Date().toISOString().split('T')[0]
  const base = task.workspaceColor // always the workspace hex color

  // Background opacity increases with urgency (0.04 at low, 0.12 at critical)
  const urgency = task.urgency
  const bgOpacity =
    urgency >= 9 ? 0.13
    : urgency >= 7 ? 0.10
    : urgency >= 5 ? 0.08
    : urgency >= 3 ? 0.06
    : 0.04

  const urgencyLabel =
    urgency >= 9 ? '極度緊急'
    : urgency >= 7 ? '高度緊急'
    : urgency >= 5 ? '中等'
    : urgency >= 3 ? '一般'
    : '輕鬆'

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
      label: '已過期',
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
  const today = new Date().toISOString().split('T')[0]

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
  const days = ['日', '一', '二', '三', '四', '五', '六']
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
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

// Calculate task block height in pixels (1 minute = 1 pixel)
export function calculateBlockHeight(
  startTime: string,
  endTime: string
): number {
  const startMinutes = timeToMinutes(startTime)
  const endMinutes = timeToMinutes(endTime)
  return Math.max(endMinutes - startMinutes, 30) // Minimum 30px height
}

// Calculate task block position from top (relative to start hour)
export function calculateBlockTop(
  startTime: string,
  calendarStartHour: number = 7
): number {
  const startMinutes = timeToMinutes(startTime)
  const calendarStartMinutes = calendarStartHour * 60
  return startMinutes - calendarStartMinutes
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
