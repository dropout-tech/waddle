// Waddle Type Definitions

// Scratchpad (Focus Capture) Types
export interface ScratchpadItem {
  id: string
  // Phase 1 block types. heading/divider/callout/toggle/rich_text are deferred
  // (they belong to a vertical-document layout, not the card grid); the DB
  // column is `text`, so future phases can widen this without a migration.
  type: 'text' | 'image' | 'link' | 'todo'
  content: string // text content, image data URL, or link URL
  title?: string // for links
  isChecked?: boolean // for todos
  sortOrder: number
  parentId?: string // reserved: toggles/nesting (schema forward-compat)
  metadata?: Record<string, any> // reserved: callouts, link previews, etc.
  createdAt: string
}

export interface ScratchpadDay {
  date: string // ISO date string YYYY-MM-DD
  items: ScratchpadItem[]
}

// Notebook (記事本) — Notion-style rich-text documents, separate from the daily
// scratchpad. Each note's body lives in `content` as a Tiptap/ProseMirror JSON
// document, so the editor owns all formatting (bold/italic/headings/lists/
// todo/toggle/quote) with no per-block schema.
export interface NotebookNote {
  id: string
  title: string
  icon?: string // optional leading emoji
  content: TiptapDoc | null // Tiptap/ProseMirror document JSON; null = empty note
  categoryId: string | null // notebook_categories FK; null = 未分類
  sortOrder: number
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

// A notebook-only folder (independent of task workspaces/categories).
export interface NotebookCategory {
  id: string
  name: string
  color: string
  icon?: string // optional leading emoji
  sortOrder: number
  isArchived: boolean
}

// Minimal structural shape of a Tiptap/ProseMirror document. The editor is the
// source of truth for the full node/mark vocabulary; this just gives us a typed
// handle instead of `any` at the data boundary.
export interface TiptapDoc {
  type: 'doc'
  content?: TiptapNode[]
}

export interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

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
  isArchived?: boolean
  archivedAt?: string
  notes?: string
  /** When false, the task is hidden from the left task panel (依分類 / 依時間 /
   * 依急迫程度) and only appears on the calendar. Used for recurring meetings
   * the user doesn't want cluttering the to-do list. Undefined ≡ true. */
  showInTaskList?: boolean
  /**
   * When true, this task is rendered as a meeting: distinct calendar
   * block style, Users icon in the task list, and the attendees /
   * location / meetingUrl fields are surfaced in the detail modal.
   */
  isMeeting?: boolean
  /** Comma-separated names or free-form text. Optional. */
  attendees?: string
  /** Physical room or address. Optional. */
  location?: string
  /**
   * Video conference URL. We auto-detect the provider (Zoom / Meet /
   * Teams) at render time to pick the right icon — no schema change
   * needed when a new provider is added.
   */
  meetingUrl?: string
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
  /** The master recurring task this occurrence belongs to. */
  parentId?: string
  /** Dates (YYYY-MM-DD) to exclude from the master recurrence rule. */
  exdates?: string[]
}

export interface TimeBlock {
  id: string
  date: string
  startTime: string // HH:mm
  endTime: string // HH:mm
  type: string // now references SlotType.key
  label: string
  color: string
  isRecurring: boolean
  recurrenceRule?: string
}

// Customizable slot type for time blocks
export interface SlotType {
  id: string
  key: string // unique identifier
  label: string
  description: string
  icon: string // icon name from lucide-react OR custom image URL
  iconType: 'lucide' | 'custom' | 'emoji' // type of icon
  color: string
  parentId?: string // for nested categories
  sortOrder: number
  isBuiltIn: boolean // true for default types that can't be deleted
  workspaceId?: string // if set, tasks created with this type sync to this workspace
}

// Default slot type categories
export interface SlotTypeCategory {
  id: string
  key: string
  label: string
  icon: string
  children: SlotType[]
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
  /** Day-mode visible days (1-3). Focus / planning scope. */
  dayViewDays: number
  /** Week-mode visible days (5-7). Overview scope. */
  weekViewDays: number
  /**
   * When true (default), tasks completed today stay greyed-out in the
   * main task list until the date rolls over. When false they vanish
   * from the list as soon as they're completed. Either way they live
   * in the "已完成" drawer keyed by completedAt.
   */
  keepCompletedTodayInList: boolean
  /**
   * When true (default), task titles in the calendar are shown prefixed with
   * their category name, e.g. "Let's Play｜夏令營". The stored title stays
   * clean — this is a display-only decoration so renaming a category updates
   * every event at once and titles never accumulate prefixes. The top-level
   * workspace (company) name is intentionally omitted; the left task panel
   * already groups by category so the prefix is redundant there.
   */
  showCategoryPrefix: boolean
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
  // Custom slot types for time blocks
  slotTypes: SlotType[]
  // Notification and reminder settings
  notifications: NotificationSettings
  // User's pinned shortcuts surfaced in the bottom quick-links bar.
  quickLinks: QuickLink[]
}

/**
 * Pinned shortcut shown in the bottom quick-links drawer. Stored as
 * a JSONB blob on user_settings so adding more fields later doesn't
 * require a migration.
 */
export interface QuickLink {
  id: string
  title: string
  url: string
  /**
   * Optional icon. Free-form string — typically an emoji (e.g. "📝")
   * but a single letter or short text works. When empty the UI falls
   * back to the first character of the title.
   */
  icon?: string
  /** Optional hex color for the card's accent. Falls back to a default. */
  color?: string
  sortOrder: number
}

export interface NotificationSettings {
  // Master toggle
  enabled: boolean
  
  // Overdue task notifications
  overdue: {
    enabled: boolean
    criticalDays: number // Days overdue to consider "critical" (default: 7)
    showInBell: boolean // Show in notification center
    dailyDigest: boolean // Show daily summary
  }
  
  // Due soon notifications
  dueSoon: {
    enabled: boolean
    daysBeforeDue: number // How many days before to notify (default: 3)
    notifyOnDueDay: boolean // Special notification on due day
    notifyDayBefore: boolean // Notify the day before
  }
  
  // Stale/forgotten tasks
  staleTasks: {
    enabled: boolean
    daysUntilStale: number // Days without activity to consider stale (default: 14)
    includeUnscheduled: boolean // Include tasks without schedule
    includeNoDueDate: boolean // Include tasks without due date
  }
  
  // High priority alerts
  highPriority: {
    enabled: boolean
    minUrgency: number // Minimum urgency level to notify (default: 8)
    alertWhenTooMany: boolean // Alert when too many high priority tasks
    maxBeforeAlert: number // Max high priority before alerting (default: 5)
  }
  
  // Scheduling reminders
  scheduling: {
    enabled: boolean
    remindUnscheduled: boolean // Remind about unscheduled tasks
    percentThreshold: number // Alert when this % of tasks are unscheduled (default: 50)
    dailyPlanningReminder: boolean // Remind to plan the day
    planningReminderTime: string // Time for planning reminder (default: "08:00")
  }
  
  // Workspace-specific settings
  workspaceOverrides: Record<string, {
    enabled: boolean // Enable/disable notifications for this workspace
    overduePriority: 'high' | 'medium' | 'low' | 'default'
    muteUntil?: string // ISO date string to temporarily mute
  }>
  
  // Quiet hours
  quietHours: {
    enabled: boolean
    startTime: string // e.g., "22:00"
    endTime: string // e.g., "08:00"
    allowUrgent: boolean // Allow critical notifications during quiet hours
  }
  
  // Sound and visual
  appearance: {
    showBadgeCount: boolean
    groupByType: boolean // Group notifications by type
    autoCollapse: boolean // Auto-collapse read notifications
    maxVisible: number // Max notifications to show at once (default: 10)
  }
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
