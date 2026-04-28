import type { Task, ColorStatus } from './types'

/**
 * Returns inline CSS color values for the entire task row based on urgency
 * (1–10) and date state (overdue / today / upcoming / normal / completed).
 *
 * State priority: completed > overdue > urgency (10 highest to 1 lowest)
 */
export function getUrgencyColor(task: Task): {
  /** Full row background colour (rgba string) */
  rowBg: string
  /** Left accent border colour */
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

  // --- Completed ---
  if (task.isCompleted) {
    return {
      rowBg: 'transparent',
      accentColor: 'oklch(0.80 0.01 85)',
      badgeBg: 'oklch(0.92 0.008 85)',
      badgeText: 'oklch(0.55 0.02 55)',
      dot: 'oklch(0.80 0.01 85)',
      label: null,
      isOverdue: false,
    }
  }

  // --- Overdue (dueDate is strictly before today) ---
  if (task.dueDate && task.dueDate < today) {
    return {
      rowBg: 'oklch(0.62 0.18 25 / 0.08)',
      accentColor: 'oklch(0.58 0.20 25)',
      badgeBg: 'oklch(0.58 0.20 25 / 0.15)',
      badgeText: 'oklch(0.45 0.18 25)',
      dot: 'oklch(0.58 0.20 25)',
      label: '已過期',
      isOverdue: true,
    }
  }

  // --- Urgency-based colouring (1 = low → 10 = critical) ---
  const urgency = task.urgency

  // 9-10: Critical (deep red)
  if (urgency >= 9) {
    return {
      rowBg: 'oklch(0.55 0.22 25 / 0.08)',
      accentColor: 'oklch(0.55 0.22 25)',
      badgeBg: 'oklch(0.55 0.22 25 / 0.16)',
      badgeText: 'oklch(0.40 0.20 25)',
      dot: 'oklch(0.55 0.22 25)',
      label: '極度緊急',
      isOverdue: false,
    }
  }

  // 7-8: High (warm orange-red)
  if (urgency >= 7) {
    return {
      rowBg: 'oklch(0.62 0.18 35 / 0.07)',
      accentColor: 'oklch(0.60 0.18 35)',
      badgeBg: 'oklch(0.60 0.18 35 / 0.14)',
      badgeText: 'oklch(0.42 0.16 35)',
      dot: 'oklch(0.60 0.18 35)',
      label: '高度緊急',
      isOverdue: false,
    }
  }

  // 5-6: Medium (amber/yellow)
  if (urgency >= 5) {
    return {
      rowBg: 'oklch(0.75 0.14 70 / 0.07)',
      accentColor: 'oklch(0.70 0.14 70)',
      badgeBg: 'oklch(0.70 0.14 70 / 0.14)',
      badgeText: 'oklch(0.45 0.12 70)',
      dot: 'oklch(0.70 0.14 70)',
      label: '中等',
      isOverdue: false,
    }
  }

  // 3-4: Normal (sage green)
  if (urgency >= 3) {
    return {
      rowBg: 'oklch(0.75 0.10 145 / 0.06)',
      accentColor: 'oklch(0.68 0.12 145)',
      badgeBg: 'oklch(0.68 0.12 145 / 0.14)',
      badgeText: 'oklch(0.40 0.10 145)',
      dot: 'oklch(0.68 0.12 145)',
      label: '一般',
      isOverdue: false,
    }
  }

  // 1-2: Low (calm blue)
  return {
    rowBg: 'oklch(0.78 0.08 230 / 0.05)',
    accentColor: 'oklch(0.65 0.10 230)',
    badgeBg: 'oklch(0.65 0.10 230 / 0.12)',
    badgeText: 'oklch(0.40 0.10 230)',
    dot: 'oklch(0.65 0.10 230)',
    label: '輕鬆',
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
