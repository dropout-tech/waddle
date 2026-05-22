// DB row ↔ app type mappers.
// DB uses snake_case, the app uses camelCase. These functions are a single,
// authoritative translation layer so the rest of the app can stay strongly typed.

import type { Database } from './database.types'
import type {
  Task,
  Category,
  Workspace,
  TimeBlock,
  JournalEntry,
  UserSettings,
} from '@/lib/types'

type TaskRow = Database['public']['Tables']['tasks']['Row']
type TaskInsert = Database['public']['Tables']['tasks']['Insert']
type CategoryRow = Database['public']['Tables']['categories']['Row']
type WorkspaceRow = Database['public']['Tables']['workspaces']['Row']
type TimeBlockRow = Database['public']['Tables']['time_blocks']['Row']
type TimeBlockInsert = Database['public']['Tables']['time_blocks']['Insert']
type JournalRow = Database['public']['Tables']['journal_entries']['Row']
type SettingsRow = Database['public']['Tables']['user_settings']['Row']

// Postgres `time` columns come back as "HH:MM:SS" (or "HH:MM:SS+TZ"). The
// rest of the app stores and displays times as "HH:MM", so normalize at
// the read boundary. Idempotent — values already in HH:MM pass through.
function normalizeTimeString(t: string | null | undefined): string | undefined {
  if (!t) return undefined
  const m = t.match(/^(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : t
}

// ─────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────
export function rowToTask(
  row: TaskRow,
  workspaceName: string,
  workspaceColor: string,
  categoryName: string
): Task {
  return {
    id: row.id,
    categoryId: row.category_id,
    workspaceId: row.workspace_id,
    workspaceName,
    workspaceColor,
    categoryName,
    title: row.title,
    description: row.description ?? undefined,
    taskType: row.task_type,
    urgency: row.urgency,
    estimatedMinutes: row.estimated_minutes ?? undefined,
    actualMinutes: row.actual_minutes ?? undefined,
    dueDate: row.due_date ?? undefined,
    scheduledDate: row.scheduled_date ?? undefined,
    scheduledStartTime: normalizeTimeString(row.scheduled_start_time),
    scheduledEndTime: normalizeTimeString(row.scheduled_end_time),
    calendarColor: row.calendar_color,
    isCompleted: row.is_completed,
    completedAt: row.completed_at ?? undefined,
    isArchived: row.is_archived,
    archivedAt: row.archived_at ?? undefined,
    notes: row.notes ?? undefined,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isRecurring: row.is_recurring,
    // Default true if column doesn't exist yet (pre-migration deployment).
    showInTaskList: row.show_in_task_list ?? true,
    // Migration 0008 — meeting fields. Default to false / undefined if the
    // columns don't exist yet, so the app still works pre-migration.
    isMeeting: row.is_meeting ?? false,
    attendees: row.attendees ?? undefined,
    location: row.location ?? undefined,
    meetingUrl: row.meeting_url ?? undefined,
    recurrence: row.recurrence_type
      ? {
          type: row.recurrence_type,
          interval: row.recurrence_interval ?? 1,
          daysOfWeek: row.recurrence_days_of_week ?? undefined,
          endDate: row.recurrence_end_date ?? undefined,
        }
      : undefined,
  }
}

/**
 * Convert a Task (full or partial) into the columns shape used by Supabase
 * insert/update. Drops UI-only fields (workspaceName/workspaceColor/categoryName)
 * since those are joined in at read time.
 */
export function taskToRow(
  task: Partial<Task>
): Partial<TaskInsert> {
  const out: Partial<TaskInsert> = {}
  if (task.id !== undefined) out.id = task.id
  if (task.categoryId !== undefined) out.category_id = task.categoryId
  if (task.workspaceId !== undefined) out.workspace_id = task.workspaceId
  if (task.title !== undefined) out.title = task.title
  // For nullable string/date/time columns we use `|| null` (not `?? null`)
  // so an empty string from a "cleared" form field is persisted as DB NULL
  // rather than written back as ''. An empty `''` in a `date` / `time`
  // column would also throw a Postgres type error.
  if (task.description !== undefined) out.description = task.description || null
  if (task.taskType !== undefined) out.task_type = task.taskType
  if (task.urgency !== undefined) out.urgency = task.urgency
  if (task.estimatedMinutes !== undefined) out.estimated_minutes = task.estimatedMinutes ?? null
  if (task.actualMinutes !== undefined) out.actual_minutes = task.actualMinutes ?? null
  if (task.dueDate !== undefined) out.due_date = task.dueDate || null
  if (task.scheduledDate !== undefined) out.scheduled_date = task.scheduledDate || null
  if (task.scheduledStartTime !== undefined) out.scheduled_start_time = task.scheduledStartTime || null
  if (task.scheduledEndTime !== undefined) out.scheduled_end_time = task.scheduledEndTime || null
  if (task.calendarColor !== undefined) out.calendar_color = task.calendarColor
  if (task.isCompleted !== undefined) out.is_completed = task.isCompleted
  if (task.completedAt !== undefined) out.completed_at = task.completedAt || null
  if (task.isArchived !== undefined) out.is_archived = task.isArchived
  if (task.archivedAt !== undefined) out.archived_at = task.archivedAt || null
  if (task.notes !== undefined) out.notes = task.notes || null
  if (task.sortOrder !== undefined) out.sort_order = task.sortOrder
  if (task.isRecurring !== undefined) out.is_recurring = task.isRecurring
  if (task.showInTaskList !== undefined) out.show_in_task_list = task.showInTaskList
  if (task.isMeeting !== undefined) out.is_meeting = task.isMeeting
  if (task.attendees !== undefined) out.attendees = task.attendees || null
  if (task.location !== undefined) out.location = task.location || null
  if (task.meetingUrl !== undefined) out.meeting_url = task.meetingUrl || null
  if (task.recurrence !== undefined) {
    if (task.recurrence) {
      out.recurrence_type = task.recurrence.type
      out.recurrence_interval = task.recurrence.interval
      out.recurrence_days_of_week = task.recurrence.daysOfWeek ?? null
      out.recurrence_end_date = task.recurrence.endDate || null
    } else {
      out.recurrence_type = null
      out.recurrence_interval = null
      out.recurrence_days_of_week = null
      out.recurrence_end_date = null
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────
export function rowToCategory(row: CategoryRow, tasks: Task[]): Category {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    sortOrder: row.sort_order,
    isCollapsed: row.is_collapsed,
    isArchived: row.is_archived,
    tasks,
  }
}

// ─────────────────────────────────────────────────────────
// Workspaces
// ─────────────────────────────────────────────────────────
export function rowToWorkspace(row: WorkspaceRow, categories: Category[]): Workspace {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order,
    isArchived: row.is_archived,
    categories,
  }
}

// ─────────────────────────────────────────────────────────
// Time Blocks
// ─────────────────────────────────────────────────────────
export function rowToTimeBlock(row: TimeBlockRow): TimeBlock {
  return {
    id: row.id,
    date: row.date,
    startTime: normalizeTimeString(row.start_time) ?? row.start_time,
    endTime: normalizeTimeString(row.end_time) ?? row.end_time,
    type: row.type,
    label: row.label,
    color: row.color,
    isRecurring: row.is_recurring,
    recurrenceRule: row.recurrence_rule ?? undefined,
  }
}

export function timeBlockToRow(tb: Partial<TimeBlock>): Partial<TimeBlockInsert> {
  const out: Partial<TimeBlockInsert> = {}
  if (tb.id !== undefined) out.id = tb.id
  if (tb.date !== undefined) out.date = tb.date
  if (tb.startTime !== undefined) out.start_time = tb.startTime
  if (tb.endTime !== undefined) out.end_time = tb.endTime
  if (tb.type !== undefined) out.type = tb.type
  if (tb.label !== undefined) out.label = tb.label
  if (tb.color !== undefined) out.color = tb.color
  if (tb.isRecurring !== undefined) out.is_recurring = tb.isRecurring
  if (tb.recurrenceRule !== undefined) out.recurrence_rule = tb.recurrenceRule ?? null
  return out
}

// ─────────────────────────────────────────────────────────
// Journal
// ─────────────────────────────────────────────────────────
export function rowToJournal(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    date: row.date,
    content: row.content ?? undefined,
    mood: row.mood ?? undefined,
    photos: [], // joined separately
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ─────────────────────────────────────────────────────────
// User Settings
// ─────────────────────────────────────────────────────────
export function rowToSettings(
  row: SettingsRow,
  fallbackSettings: UserSettings
): UserSettings {
  // notifications and lunch_break/buffer_time live as JSONB; merge with defaults
  // so partially-filled rows still hydrate cleanly.
  const notifications = (row.notifications && Object.keys(row.notifications as object).length > 0)
    ? (row.notifications as unknown as UserSettings['notifications'])
    : fallbackSettings.notifications

  return {
    calendarStartHour: row.calendar_start_hour,
    calendarEndHour: row.calendar_end_hour,
    defaultView: row.default_view,
    weekStartDay: row.week_start_day,
    // Migration 0006 added these — fall back to defaults if the row pre-dates
    // the migration so the app keeps working before the user re-runs schema.
    dayViewDays: row.day_view_days ?? fallbackSettings.dayViewDays,
    weekViewDays: row.week_view_days ?? fallbackSettings.weekViewDays,
    // Migration 0007 — same graceful-fallback pattern. If the column is
    // missing on the DB, we use the default (true) and surface the value
    // from localStorage if it exists.
    keepCompletedTodayInList:
      row.keep_completed_today_in_list ?? fallbackSettings.keepCompletedTodayInList,
    // Migration 0009 — JSONB array. Default to fallback (typically `[]`)
    // when the column is absent so older deployments degrade cleanly.
    quickLinks: Array.isArray(row.quick_links)
      ? (row.quick_links as unknown as UserSettings['quickLinks'])
      : fallbackSettings.quickLinks,
    weatherCity: row.weather_city,
    weatherUnit: row.weather_unit,
    lunchBreak: row.lunch_break as unknown as UserSettings['lunchBreak'],
    bufferTime: row.buffer_time as unknown as UserSettings['bufferTime'],
    defaultTaskColors: row.default_task_colors as unknown as UserSettings['defaultTaskColors'],
    slotTypes: fallbackSettings.slotTypes, // slot_types lives in its own table; merge later
    notifications,
  }
}
