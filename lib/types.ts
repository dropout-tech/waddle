// FlowDesk Type Definitions

export interface Workspace {
  id: string
  name: string
  color: string
  icon: string
  sortOrder: number
  isArchived: boolean
  categories: Category[]
}

export interface Category {
  id: string
  workspaceId: string
  name: string
  sortOrder: number
  isCollapsed: boolean
  isArchived: boolean
  tasks: Task[]
}

export interface Task {
  id: string
  categoryId: string
  workspaceId: string
  workspaceName: string
  workspaceColor: string
  categoryName: string
  title: string
  description?: string
  taskType: 'one_time' | 'routine' | 'project'
  urgency: number // 1-10
  estimatedMinutes?: number
  actualMinutes?: number
  dueDate?: string // ISO date string
  scheduledDate?: string // ISO date string
  scheduledStartTime?: string // HH:mm format
  scheduledEndTime?: string // HH:mm format
  calendarColor: string
  isCompleted: boolean
  completedAt?: string
  notes?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  // Recurrence settings
  isRecurring?: boolean
  recurrence?: {
    type: 'daily' | 'weekly' | 'monthly' | 'custom'
    interval: number // every N days/weeks/months
    daysOfWeek?: number[] // 0-6 for weekly (0=Sunday)
    endDate?: string // ISO date string
  }
}

export interface TimeBlock {
  id: string
  date: string
  startTime: string // HH:mm
  endTime: string // HH:mm
  type: 'buffer' | 'break' | 'personal' | 'focus'
  label: string
  color: string
  isRecurring: boolean
  recurrenceRule?: string
}

export interface JournalEntry {
  id: string
  date: string
  content?: string
  mood?: 'great' | 'good' | 'neutral' | 'bad' | 'terrible'
  photos: JournalPhoto[]
  createdAt: string
  updatedAt: string
}

export interface JournalPhoto {
  id: string
  journalId: string
  url: string
  caption?: string
  sortOrder: number
}

export interface UserSettings {
  calendarStartHour: number
  calendarEndHour: number
  defaultView: 'day' | 'week' | 'month'
  weekStartDay: number
  weatherCity: string
  weatherUnit: 'celsius' | 'fahrenheit'
  // Time block defaults
  lunchBreak: {
    enabled: boolean
    startTime: string
    endTime: string
    color: string
  }
  bufferTime: {
    enabled: boolean
    defaultDuration: number // minutes
    color: string
  }
  // Default calendar colors for new tasks (by workspace)
  defaultTaskColors: Record<string, string>
}

// UI State Types
export type ColorStatus = 'completed' | 'overdue' | 'today' | 'upcoming' | 'no_deadline' | 'normal'

export interface TaskWithStatus extends Task {
  colorStatus: ColorStatus
}

export interface DragItem {
  type: 'task' | 'pending-task' | 'calendar-block'
  task: Task
}

// API Response Types for future backend integration
export interface TasksResponse {
  workspaces: Workspace[]
  success: boolean
  error?: string
}

export interface TaskCreatePayload {
  categoryId: string
  title: string
  urgency?: number
  estimatedMinutes?: number
  dueDate?: string
  scheduledDate?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
}

export interface TaskUpdatePayload {
  id: string
  title?: string
  description?: string
  urgency?: number
  estimatedMinutes?: number
  actualMinutes?: number
  dueDate?: string
  scheduledDate?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
  isCompleted?: boolean
  notes?: string
}

export interface CalendarViewState {
  selectedDate: Date
  viewMode: 'day' | 'week' | 'month'
}

// Export data types for future AI/API consumption
export interface ExportableTask {
  id: string
  workspace: string
  category: string
  title: string
  urgency: number
  estimatedMinutes?: number
  dueDate?: string
  scheduledDate?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
  isCompleted: boolean
  completedAt?: string
}

export interface ExportDataPayload {
  exportDate: string
  dateRange: {
    start: string
    end: string
  }
  tasks: ExportableTask[]
  completionStats: {
    total: number
    completed: number
    rate: number
  }
  timeStats: {
    totalEstimated: number
    totalActual: number
    byWorkspace: Record<string, number>
  }
}
