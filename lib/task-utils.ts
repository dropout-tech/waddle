import type { Task, ColorStatus } from './types'

// Get urgency color based on task state and urgency level
export function getUrgencyColor(task: Task): {
  bg: string
  border: string
  dot: string
  text: string
} {
  const today = new Date().toISOString().split('T')[0]

  // Priority 1 - Completed
  if (task.isCompleted) {
    return {
      bg: 'bg-muted/50',
      border: 'border-muted',
      dot: 'bg-muted-foreground/50',
      text: 'text-muted-foreground line-through',
    }
  }

  // Priority 2 - Overdue
  if (task.dueDate && task.dueDate < today) {
    return {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      dot: 'bg-red-500',
      text: 'text-foreground',
    }
  }

  // Priority 3 - Today (scheduled for today)
  if (task.scheduledDate === today) {
    return {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      dot: 'bg-amber-500',
      text: 'text-foreground',
    }
  }

  // Priority 4 - Upcoming (due within 3 days)
  if (task.dueDate) {
    const dueDate = new Date(task.dueDate)
    const todayDate = new Date(today)
    const diffDays = Math.ceil(
      (dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (diffDays <= 3 && diffDays > 0) {
      return {
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        dot: 'bg-orange-500',
        text: 'text-foreground',
      }
    }
  }

  // Priority 5 - No deadline (green, flexible)
  if (!task.dueDate && !task.scheduledDate) {
    return {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      dot: 'bg-emerald-500',
      text: 'text-foreground',
    }
  }

  // Priority 6 - Normal (default)
  return {
    bg: 'bg-card',
    border: 'border-border',
    dot: 'bg-muted-foreground/50',
    text: 'text-foreground',
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
