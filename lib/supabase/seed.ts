// Seed a brand-new user's account on first login.
// - Owner email gets the personal mockWorkspaces (real data).
// - Everyone else gets demoWorkspaces (a friendly tutorial-style starter set)
//   that pairs with the spotlight onboarding tour.
// Mock IDs ('ws-1', 'cat-1-1', 'task-1', ...) get remapped to fresh UUIDs so
// foreign-key references stay intact across workspaces → categories → tasks.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import type { Workspace, TimeBlock } from '@/lib/types'
import { mockWorkspaces, mockTimeBlocks } from '@/lib/mock-data'
import { demoWorkspaces, demoTimeBlocks } from '@/lib/demo-data'
import { t } from '@/lib/i18n'

type SB = SupabaseClient<Database>

/**
 * Email of the workspace owner. Anyone signing in with this email gets the
 * full personal dataset; everyone else gets generic demo content.
 */
export const OWNER_EMAIL = 'lazy@dreamcube.tw'

export function pickSeedSet(email: string): {
  workspaces: Workspace[]
  timeBlocks: TimeBlock[]
  isOwner: boolean
} {
  const isOwner = email.toLowerCase() === OWNER_EMAIL.toLowerCase()
  return {
    workspaces: isOwner ? mockWorkspaces : demoWorkspaces,
    timeBlocks: isOwner ? mockTimeBlocks : demoTimeBlocks,
    isOwner,
  }
}

export async function seedUserData(
  userId: string,
  email: string,
  supabase: SB,
): Promise<{ isOwner: boolean }> {
  const { workspaces, timeBlocks, isOwner } = pickSeedSet(email)
  const workspaceIdMap = new Map<string, string>()
  const categoryIdMap = new Map<string, string>()

  // ─── Workspaces ───────────────────────────────────────
  const workspaceRows = workspaces.map((ws) => {
    const newId = crypto.randomUUID()
    workspaceIdMap.set(ws.id, newId)
    return {
      id: newId,
      user_id: userId,
      name: t(ws.name),
      color: ws.color,
      icon: ws.icon,
      sort_order: ws.sortOrder,
      is_archived: ws.isArchived,
    }
  })

  const { error: wsError } = await supabase.from('workspaces').insert(workspaceRows)
  if (wsError) throw new Error(`seed workspaces failed: ${wsError.message}`)

  // ─── Categories ───────────────────────────────────────
  const categoryRows = workspaces.flatMap((ws) =>
    ws.categories.map((cat) => {
      const newId = crypto.randomUUID()
      categoryIdMap.set(cat.id, newId)
      return {
        id: newId,
        user_id: userId,
        workspace_id: workspaceIdMap.get(ws.id)!,
        name: t(cat.name),
        sort_order: cat.sortOrder,
        is_collapsed: cat.isCollapsed,
        is_archived: cat.isArchived,
      }
    })
  )

  if (categoryRows.length) {
    const { error: catError } = await supabase.from('categories').insert(categoryRows)
    if (catError) throw new Error(`seed categories failed: ${catError.message}`)
  }

  // ─── Tasks ────────────────────────────────────────────
  const taskRows = workspaces.flatMap((ws) =>
    ws.categories.flatMap((cat) =>
      cat.tasks.map((task) => ({
        id: crypto.randomUUID(),
        user_id: userId,
        workspace_id: workspaceIdMap.get(ws.id)!,
        category_id: categoryIdMap.get(cat.id)!,
        title: t(task.title),
        description: task.description ? t(task.description) : null,
        task_type: task.taskType,
        urgency: task.urgency,
        estimated_minutes: task.estimatedMinutes ?? null,
        actual_minutes: task.actualMinutes ?? null,
        due_date: task.dueDate ?? null,
        scheduled_date: task.scheduledDate ?? null,
        scheduled_start_time: task.scheduledStartTime ?? null,
        scheduled_end_time: task.scheduledEndTime ?? null,
        calendar_color: task.calendarColor,
        is_completed: task.isCompleted,
        completed_at: task.completedAt ?? null,
        is_archived: task.isArchived ?? false,
        archived_at: task.archivedAt ?? null,
        notes: task.notes ?? null,
        sort_order: task.sortOrder,
        is_recurring: task.isRecurring ?? false,
        recurrence_type: task.recurrence?.type ?? null,
        recurrence_interval: task.recurrence?.interval ?? null,
        recurrence_days_of_week: task.recurrence?.daysOfWeek ?? null,
        recurrence_end_date: task.recurrence?.endDate ?? null,
      }))
    )
  )

  if (taskRows.length) {
    const { error: taskError } = await supabase.from('tasks').insert(taskRows)
    if (taskError) throw new Error(`seed tasks failed: ${taskError.message}`)
  }

  // ─── Time Blocks ──────────────────────────────────────
  const timeBlockRows = timeBlocks.map((tb) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    date: tb.date,
    start_time: tb.startTime,
    end_time: tb.endTime,
    type: tb.type,
    label: t(tb.label),
    color: tb.color,
    is_recurring: tb.isRecurring,
    recurrence_rule: tb.recurrenceRule ?? null,
  }))

  if (timeBlockRows.length) {
    const { error: tbError } = await supabase.from('time_blocks').insert(timeBlockRows)
    if (tbError) throw new Error(`seed time_blocks failed: ${tbError.message}`)
  }

  // Owner already knows the tool — skip the tour.
  if (isOwner) {
    await supabase
      .from('user_settings')
      .update({ onboarding_completed: true })
      .eq('user_id', userId)
  }

  return { isOwner }
}
