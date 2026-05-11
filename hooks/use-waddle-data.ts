'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { seedUserData } from '@/lib/supabase/seed'
import type { Json } from '@/lib/supabase/database.types'
import {
  rowToTask,
  rowToTimeBlock,
  taskToRow,
  timeBlockToRow,
  rowToSettings,
} from '@/lib/supabase/mappers'
import { toDateString } from '@/lib/calendar-utils'
import { playTaskCompleteSound } from '@/lib/task-sound'
import type {
  Workspace,
  Category,
  Task,
  TimeBlock,
  UserSettings,
} from '@/lib/types'

// ─────────────────────────────────────────────────────────
// Migration-aware write helpers
//
// When a migration ships a new column, an older deployment can still
// have task / settings writes hitting a DB without that column. Rather
// than crashing every write, we detect the "column not found" error
// and retry without the new fields. This module-level flag latches once
// per session so we don't pay the failed-roundtrip cost on every call.
// ─────────────────────────────────────────────────────────
let meetingColsKnownMissing = false
const MEETING_COL_KEYS = ['is_meeting', 'attendees', 'location', 'meeting_url'] as const
const MEETING_COL_RE = /is_meeting|attendees|location|meeting_url/

/**
 * PGRST204 = "column not found in schema cache".
 * 42703    = "undefined column" (raw Postgres code).
 * We require BOTH a known code and a message that names the missing
 * column — keeping it strict avoids silently swallowing unrelated
 * errors whose message happens to mention one of these tokens.
 */
function isMissingMeetingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  if (e.code !== 'PGRST204' && e.code !== '42703') return false
  return MEETING_COL_RE.test(e.message ?? '')
}

function stripMeetingCols<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row }
  for (const k of MEETING_COL_KEYS) delete out[k]
  return out
}

// ─────────────────────────────────────────────────────────
// Default settings — used as fallback for partial DB rows
// ─────────────────────────────────────────────────────────
export const DEFAULT_SETTINGS: UserSettings = {
  calendarStartHour: 0,
  calendarEndHour: 24,
  defaultView: 'day',
  weekStartDay: 0,
  dayViewDays: 1,
  weekViewDays: 7,
  keepCompletedTodayInList: true,
  weatherCity: 'Taipei',
  weatherUnit: 'celsius',
  lunchBreak: { enabled: true, startTime: '12:00', endTime: '13:00', color: '#F5F5F5' },
  bufferTime: { enabled: true, defaultDuration: 30, color: '#FFF8E1' },
  defaultTaskColors: {},
  slotTypes: [],
  notifications: {
    enabled: true,
    overdue: { enabled: true, criticalDays: 7, showInBell: true, dailyDigest: true },
    dueSoon: { enabled: true, daysBeforeDue: 3, notifyOnDueDay: true, notifyDayBefore: true },
    staleTasks: { enabled: true, daysUntilStale: 14, includeUnscheduled: true, includeNoDueDate: true },
    highPriority: { enabled: true, minUrgency: 8, alertWhenTooMany: true, maxBeforeAlert: 5 },
    scheduling: {
      enabled: true,
      remindUnscheduled: true,
      percentThreshold: 50,
      dailyPlanningReminder: false,
      planningReminderTime: '08:00',
    },
    workspaceOverrides: {},
    quietHours: { enabled: false, startTime: '22:00', endTime: '08:00', allowUrgent: true },
    appearance: { showBadgeCount: true, groupByType: true, autoCollapse: false, maxVisible: 10 },
  },
}

interface UseWaddleData {
  workspaces: Workspace[]
  timeBlocks: TimeBlock[]
  settings: UserSettings
  isLoading: boolean
  /** True until the spotlight onboarding tour is completed (or skipped). */
  onboardingCompleted: boolean
  /** Mark the onboarding tour as complete and persist it. */
  completeOnboarding: () => Promise<void>
  /** Final-step callback: wipe demo data and seed a starter set or empty workspace. */
  applyOnboardingChoice: (choice: 'template' | 'blank') => Promise<void>
  // Workspace
  addWorkspace: (name: string, color: string, icon: string) => Promise<void>
  updateWorkspace: (
    workspaceId: string,
    updates: Partial<Pick<Workspace, 'name' | 'color' | 'icon'>>
  ) => Promise<void>
  updateWorkspaceColor: (workspaceId: string, newColor: string) => Promise<void>
  archiveWorkspace: (workspaceId: string) => Promise<void>
  deleteWorkspace: (workspaceId: string) => Promise<void>
  // Category
  addCategory: (workspaceId: string, name: string) => Promise<void>
  deleteCategory: (categoryId: string) => Promise<void>
  toggleCategoryCollapse: (categoryId: string) => Promise<void>
  // Task
  addTask: (categoryId: string, title: string) => Promise<void>
  updateTask: (taskId: string, updates: Partial<Task>, newCategoryId?: string) => Promise<void>
  toggleTaskComplete: (taskId: string) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  rescheduleTask: (taskId: string, date: string | undefined, startTime: string, endTime: string) => Promise<void>
  /**
   * Send a task back to the unscheduled (all-day / 待排程) bucket. Clears
   * the time fields and, if a date is provided, sets scheduledDate to it
   * so the task lands in that day's pending area.
   */
  unscheduleTask: (taskId: string, date?: string) => Promise<void>
  createTask: (task: Task) => Promise<void>
  // Time blocks
  addTimeBlock: (block: Omit<TimeBlock, 'id'>) => Promise<void>
  updateTimeBlock: (id: string, updates: Partial<TimeBlock>) => Promise<void>
  deleteTimeBlock: (id: string) => Promise<void>
  // Settings
  saveSettings: (newSettings: UserSettings, newTimeBlocks: TimeBlock[]) => Promise<void>
}

export function useWaddleData(): UseWaddleData {
  const supabase = useMemo(() => createClient(), [])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [onboardingCompleted, setOnboardingCompleted] = useState(true)
  const userIdRef = useRef<string | null>(null)
  // Monotonic counter so a fresh load() can invalidate any in-flight older
  // load() — only the latest call gets to commit state. Used by both the
  // initial mount and the on-focus refetch path.
  const loadVersionRef = useRef(0)
  const lastRefetchRef = useRef(0)
  // Number of writes currently in flight. Visibility/focus refetch checks
  // this and skips when > 0 — otherwise an auto-refetch landing between a
  // local optimistic update and the DB confirming the write can clobber the
  // unsaved-yet state. Decrement happens in `finally` so a failed write
  // still releases the lock.
  const pendingWritesRef = useRef(0)

  const loadData = useCallback(
    async ({ initial = false }: { initial?: boolean } = {}) => {
      const myVersion = ++loadVersionRef.current
      const isStale = () => myVersion !== loadVersionRef.current

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (initial && !isStale()) setIsLoading(false)
        return
      }
      userIdRef.current = user.id

      let { data: wsRows } = await supabase
        .from('workspaces')
        .select('*')
        .order('sort_order', { ascending: true })

      // Seed only on the very first mount — on a refetch we can safely
      // assume workspaces already exist (user has been using the app).
      if (initial && (!wsRows || wsRows.length === 0)) {
        try {
          await seedUserData(user.id, user.email ?? '', supabase)
        } catch (err) {
          console.error('[seed] failed:', err)
          toast.error('初始化資料失敗，請重新整理')
          if (!isStale()) setIsLoading(false)
          return
        }
        const re = await supabase
          .from('workspaces')
          .select('*')
          .order('sort_order', { ascending: true })
        wsRows = re.data
      }

      const { data: catRows } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })

      const { data: taskRows } = await supabase
        .from('tasks')
        .select('*')
        .order('sort_order', { ascending: true })

      const wsById = new Map(wsRows?.map((w) => [w.id, w]) ?? [])
      const catById = new Map(catRows?.map((c) => [c.id, c]) ?? [])

      const tasksByCategory = new Map<string, Task[]>()
      for (const t of taskRows ?? []) {
        const ws = wsById.get(t.workspace_id)
        const cat = catById.get(t.category_id)
        if (!ws || !cat) continue
        const task = rowToTask(t, ws.name, ws.color, cat.name)
        const arr = tasksByCategory.get(t.category_id) ?? []
        arr.push(task)
        tasksByCategory.set(t.category_id, arr)
      }

      const categoriesByWorkspace = new Map<string, Category[]>()
      for (const c of catRows ?? []) {
        const cat: Category = {
          id: c.id,
          workspaceId: c.workspace_id,
          name: c.name,
          sortOrder: c.sort_order,
          isCollapsed: c.is_collapsed,
          isArchived: c.is_archived,
          tasks: tasksByCategory.get(c.id) ?? [],
        }
        const arr = categoriesByWorkspace.get(c.workspace_id) ?? []
        arr.push(cat)
        categoriesByWorkspace.set(c.workspace_id, arr)
      }

      const builtWorkspaces: Workspace[] = (wsRows ?? []).map((w) => ({
        id: w.id,
        name: w.name,
        color: w.color,
        icon: w.icon,
        sortOrder: w.sort_order,
        isArchived: w.is_archived,
        categories: categoriesByWorkspace.get(w.id) ?? [],
      }))

      const { data: tbRows } = await supabase
        .from('time_blocks')
        .select('*')
        .order('date', { ascending: true })

      const builtTimeBlocks = (tbRows ?? []).map(rowToTimeBlock)

      const { data: settingsRow } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      const { data: slotTypeRows } = await supabase
        .from('slot_types')
        .select('*')
        .order('sort_order', { ascending: true })

      const customSlotTypes = (slotTypeRows ?? []).map((r) => ({
        id: r.id,
        key: r.key,
        label: r.label,
        description: r.description,
        icon: r.icon,
        iconType: r.icon_type,
        color: r.color,
        parentId: r.parent_key ?? r.parent_id ?? undefined,
        sortOrder: r.sort_order,
        isBuiltIn: r.is_built_in,
        workspaceId: r.workspace_id ?? undefined,
      }))

      const builtSettings = settingsRow
        ? { ...rowToSettings(settingsRow, DEFAULT_SETTINGS), slotTypes: customSlotTypes }
        : { ...DEFAULT_SETTINGS, slotTypes: customSlotTypes }

      // Optional-column fallbacks: when the DB row pre-dates a migration
      // and the column doesn't exist, hydrate from localStorage. DB takes
      // precedence when the column IS present, so once the migration ships
      // the localStorage copy effectively becomes a no-op.
      if (typeof window !== 'undefined') {
        const dbDay = (settingsRow as { day_view_days?: number } | null)?.day_view_days
        const dbWeek = (settingsRow as { week_view_days?: number } | null)?.week_view_days
        if (dbDay === undefined || dbWeek === undefined) {
          try {
            const raw = window.localStorage.getItem('waddle-view-range-v1')
            if (raw) {
              const parsed = JSON.parse(raw) as { dayViewDays?: number; weekViewDays?: number }
              if (dbDay === undefined && typeof parsed.dayViewDays === 'number') {
                builtSettings.dayViewDays = parsed.dayViewDays
              }
              if (dbWeek === undefined && typeof parsed.weekViewDays === 'number') {
                builtSettings.weekViewDays = parsed.weekViewDays
              }
            }
          } catch {
            /* ignore corrupt localStorage */
          }
        }

        const dbKeep = settingsRow?.keep_completed_today_in_list
        if (dbKeep === undefined) {
          try {
            const raw = window.localStorage.getItem('waddle-completed-pref-v1')
            if (raw) {
              const parsed = JSON.parse(raw) as { keepCompletedTodayInList?: boolean }
              if (typeof parsed.keepCompletedTodayInList === 'boolean') {
                builtSettings.keepCompletedTodayInList = parsed.keepCompletedTodayInList
              }
            }
          } catch {
            /* ignore corrupt localStorage */
          }
        }
      }

      if (isStale()) return
      setWorkspaces(builtWorkspaces)
      setTimeBlocks(builtTimeBlocks)
      setSettings(builtSettings)
      if (initial) {
        setOnboardingCompleted(settingsRow?.onboarding_completed ?? true)
        setIsLoading(false)
      }
    },
    [supabase],
  )

  // ─── Initial load ────────────────────────────────────
  useEffect(() => {
    void loadData({ initial: true })
  }, [loadData])

  // ─── Cross-device sync: refetch when tab becomes visible / regains focus.
  // This catches the common "I changed something on phone, switch to laptop,
  // it's still showing the old version" pattern. Throttled to once per 3s
  // so a quick alt-tab / cmd-tab burst doesn't hammer Supabase. We
  // intentionally do NOT toggle isLoading on refetch so the UI doesn't
  // flash the loading spinner.
  useEffect(() => {
    const REFETCH_THROTTLE_MS = 3000
    const tryRefetch = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      // Skip refetch while local writes are in flight — otherwise a refetch
      // landing between optimistic-update and DB-confirm clobbers the new
      // state with the pre-write DB snapshot.
      if (pendingWritesRef.current > 0) return
      const now = Date.now()
      if (now - lastRefetchRef.current < REFETCH_THROTTLE_MS) return
      lastRefetchRef.current = now
      void loadData({ initial: false })
    }
    document.addEventListener('visibilitychange', tryRefetch)
    window.addEventListener('focus', tryRefetch)
    return () => {
      document.removeEventListener('visibilitychange', tryRefetch)
      window.removeEventListener('focus', tryRefetch)
    }
  }, [loadData])

  // ─── Helpers ─────────────────────────────────────────
  const requireUserId = () => {
    const id = userIdRef.current
    if (!id) throw new Error('No authenticated user')
    return id
  }

  const handleDbError = (op: string) => (err: unknown) => {
    console.error(`[${op}]`, err)
    toast.error(`儲存失敗：${op}`)
  }

  // ═════════════════════════════════════════════════════
  // Workspace mutations
  // ═════════════════════════════════════════════════════

  const addWorkspace = useCallback(async (name: string, color: string, icon: string) => {
    const userId = requireUserId()
    const wsId = crypto.randomUUID()
    const catId = crypto.randomUUID()

    setWorkspaces((prev) => [
      ...prev,
      {
        id: wsId,
        name,
        color,
        icon,
        sortOrder: prev.length,
        isArchived: false,
        categories: [
          {
            id: catId,
            workspaceId: wsId,
            name: '一般',
            sortOrder: 0,
            isCollapsed: false,
            isArchived: false,
            tasks: [],
          },
        ],
      },
    ])

    const { error: e1 } = await supabase.from('workspaces').insert({
      id: wsId, user_id: userId, name, color, icon, sort_order: workspaces.length,
    })
    if (e1) return handleDbError('新增工作區')(e1)

    const { error: e2 } = await supabase.from('categories').insert({
      id: catId, user_id: userId, workspace_id: wsId, name: '一般', sort_order: 0,
    })
    if (e2) handleDbError('新增分類')(e2)
  }, [supabase, workspaces.length])

  const updateWorkspace = useCallback(async (
    workspaceId: string,
    updates: Partial<Pick<Workspace, 'name' | 'color' | 'icon'>>
  ) => {
    let oldColor = ''
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w
        oldColor = w.color
        const newColor = updates.color ?? w.color
        return {
          ...w,
          ...updates,
          categories: w.categories.map((c) => ({
            ...c,
            tasks: c.tasks.map((t) => ({
              ...t,
              workspaceName: updates.name ?? t.workspaceName,
              workspaceColor: newColor,
              calendarColor: t.calendarColor === oldColor ? newColor : t.calendarColor,
            })),
          })),
        }
      })
    )

    const dbUpdates: { name?: string; color?: string; icon?: string } = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.color !== undefined) dbUpdates.color = updates.color
    if (updates.icon !== undefined) dbUpdates.icon = updates.icon

    const { error } = await supabase.from('workspaces').update(dbUpdates).eq('id', workspaceId)
    if (error) return handleDbError('更新工作區')(error)

    // If color changed, cascade calendar_color on matching tasks
    if (updates.color !== undefined && oldColor && updates.color !== oldColor) {
      await supabase
        .from('tasks')
        .update({ calendar_color: updates.color })
        .eq('workspace_id', workspaceId)
        .eq('calendar_color', oldColor)
    }
  }, [supabase])

  const updateWorkspaceColor = useCallback(async (workspaceId: string, newColor: string) => {
    return updateWorkspace(workspaceId, { color: newColor })
  }, [updateWorkspace])

  const archiveWorkspace = useCallback(async (workspaceId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === workspaceId ? { ...w, isArchived: true } : w))
    )
    const { error } = await supabase
      .from('workspaces')
      .update({ is_archived: true })
      .eq('id', workspaceId)
    if (error) handleDbError('封存工作區')(error)
  }, [supabase])

  const deleteWorkspace = useCallback(async (workspaceId: string) => {
    setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId))
    const { error } = await supabase.from('workspaces').delete().eq('id', workspaceId)
    if (error) handleDbError('刪除工作區')(error)
  }, [supabase])

  // ═════════════════════════════════════════════════════
  // Category mutations
  // ═════════════════════════════════════════════════════

  const addCategory = useCallback(async (workspaceId: string, name: string) => {
    const userId = requireUserId()
    const id = crypto.randomUUID()

    let sortOrder = 0
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w
        sortOrder = w.categories.length
        return {
          ...w,
          categories: [
            ...w.categories,
            {
              id, workspaceId, name, sortOrder,
              isCollapsed: false, isArchived: false, tasks: [],
            },
          ],
        }
      })
    )

    const { error } = await supabase.from('categories').insert({
      id, user_id: userId, workspace_id: workspaceId, name, sort_order: sortOrder,
    })
    if (error) handleDbError('新增分類')(error)
  }, [supabase])

  const deleteCategory = useCallback(async (categoryId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => ({
        ...w,
        categories: w.categories.filter((c) => c.id !== categoryId),
      }))
    )
    // Tasks in this category cascade-delete via the FK in the schema.
    const { error } = await supabase.from('categories').delete().eq('id', categoryId)
    if (error) handleDbError('刪除分類')(error)
  }, [supabase])

  const toggleCategoryCollapse = useCallback(async (categoryId: string) => {
    let nextValue = false
    setWorkspaces((prev) =>
      prev.map((w) => ({
        ...w,
        categories: w.categories.map((c) => {
          if (c.id !== categoryId) return c
          nextValue = !c.isCollapsed
          return { ...c, isCollapsed: nextValue }
        }),
      }))
    )

    const { error } = await supabase
      .from('categories')
      .update({ is_collapsed: nextValue })
      .eq('id', categoryId)
    if (error) handleDbError('切換分類折疊')(error)
  }, [supabase])

  // ═════════════════════════════════════════════════════
  // Task mutations
  // ═════════════════════════════════════════════════════

  const addTask = useCallback(async (categoryId: string, title: string) => {
    const userId = requireUserId()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    let workspaceId = ''
    let workspaceName = ''
    let workspaceColor = ''
    let categoryName = ''
    let sortOrder = 0

    setWorkspaces((prev) =>
      prev.map((w) => ({
        ...w,
        categories: w.categories.map((c) => {
          if (c.id !== categoryId) return c
          workspaceId = w.id
          workspaceName = w.name
          workspaceColor = w.color
          categoryName = c.name
          sortOrder = c.tasks.length
          const newTask: Task = {
            id, categoryId, workspaceId, workspaceName, workspaceColor, categoryName,
            title, taskType: 'one_time', urgency: 5,
            calendarColor: workspaceColor, isCompleted: false,
            sortOrder, createdAt: now, updatedAt: now,
          }
          return { ...c, tasks: [...c.tasks, newTask] }
        }),
      }))
    )

    if (!workspaceId) return // category not found

    const { error } = await supabase.from('tasks').insert({
      id, user_id: userId, workspace_id: workspaceId, category_id: categoryId,
      title, urgency: 5, calendar_color: workspaceColor, sort_order: sortOrder,
    })
    if (error) handleDbError('新增任務')(error)
  }, [supabase])

  /**
   * Persist a fully-formed Task (the create flow assembles a draft first,
   * then commits it via this method when the user hits Save in the modal).
   */
  const createTask = useCallback(async (task: Task) => {
    const userId = requireUserId()

    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id !== task.workspaceId
          ? w
          : {
              ...w,
              categories: w.categories.map((c) =>
                c.id !== task.categoryId
                  ? c
                  : { ...c, tasks: [...c.tasks, task] }
              ),
            }
      )
    )

    const row = taskToRow(task)
    const buildPayload = (strip: boolean) => {
      const base = {
        ...(strip ? stripMeetingCols(row) : row),
        id: task.id,
        user_id: userId,
        workspace_id: task.workspaceId,
        category_id: task.categoryId,
        title: task.title,
        urgency: task.urgency,
        calendar_color: task.calendarColor,
      }
      return base
    }
    let { error } = await supabase
      .from('tasks')
      .insert(buildPayload(meetingColsKnownMissing))
    // Pre-migration-0008 fallback: retry without meeting columns once we
    // detect the column is unknown, then latch the flag for the rest of
    // the session.
    if (error && isMissingMeetingColumnError(error)) {
      meetingColsKnownMissing = true
      console.warn('[createTask] meeting columns missing — falling back. Run migration 0008.', error)
      const retry = await supabase.from('tasks').insert(buildPayload(true))
      error = retry.error
    }
    if (error) handleDbError('建立任務')(error)
  }, [supabase])

  const updateTask = useCallback(async (
    taskId: string,
    updates: Partial<Task>,
    newCategoryId?: string
  ) => {
    const isMove = newCategoryId !== undefined

    setWorkspaces((prev) => {
      // Find the existing task across the tree
      let existing: Task | null = null
      for (const w of prev) for (const c of w.categories) {
        const t = c.tasks.find((x) => x.id === taskId)
        if (t) { existing = t; break }
      }
      if (!existing) return prev

      if (isMove && newCategoryId !== existing.categoryId) {
        // Detach from old category, attach to new
        let targetWs = ''
        let targetWsName = ''
        let targetWsColor = ''
        let targetCatName = ''
        for (const w of prev) for (const c of w.categories) {
          if (c.id === newCategoryId) {
            targetWs = w.id
            targetWsName = w.name
            targetWsColor = w.color
            targetCatName = c.name
          }
        }
        return prev.map((w) => ({
          ...w,
          categories: w.categories.map((c) => {
            if (c.id === existing!.categoryId) {
              return { ...c, tasks: c.tasks.filter((t) => t.id !== taskId) }
            }
            if (c.id === newCategoryId) {
              return {
                ...c,
                tasks: [
                  ...c.tasks,
                  {
                    ...existing!,
                    ...updates,
                    categoryId: newCategoryId,
                    workspaceId: targetWs,
                    workspaceName: targetWsName,
                    workspaceColor: targetWsColor,
                    categoryName: targetCatName,
                    updatedAt: new Date().toISOString(),
                  },
                ],
              }
            }
            return c
          }),
        }))
      }

      // In-place update
      return prev.map((w) => ({
        ...w,
        categories: w.categories.map((c) => ({
          ...c,
          tasks: c.tasks.map((t) =>
            t.id === taskId
              ? { ...t, ...updates, updatedAt: new Date().toISOString() }
              : t
          ),
        })),
      }))
    })

    const dbUpdates = taskToRow(updates)
    if (isMove && newCategoryId) {
      dbUpdates.category_id = newCategoryId
      // Find the workspace_id for the new category from local state
      // (the move already happened in setWorkspaces above so we just re-resolve)
      // Note: we can't read workspaces here because closures capture old value;
      // so instead let Supabase enforce via FK and update both fields.
      const { data: catRow } = await supabase
        .from('categories')
        .select('workspace_id')
        .eq('id', newCategoryId)
        .maybeSingle()
      if (catRow) dbUpdates.workspace_id = catRow.workspace_id
    }

    const runUpdate = (strip: boolean) =>
      supabase
        .from('tasks')
        .update(strip ? stripMeetingCols(dbUpdates) : dbUpdates)
        .eq('id', taskId)
    let { error } = await runUpdate(meetingColsKnownMissing)
    if (error && isMissingMeetingColumnError(error)) {
      meetingColsKnownMissing = true
      console.warn('[updateTask] meeting columns missing — falling back. Run migration 0008.', error)
      const retry = await runUpdate(true)
      error = retry.error
    }
    if (error) handleDbError('更新任務')(error)
  }, [supabase])

  const toggleTaskComplete = useCallback(async (taskId: string) => {
    let nextValue = false
    let completedAt: string | null = null
    setWorkspaces((prev) =>
      prev.map((w) => ({
        ...w,
        categories: w.categories.map((c) => ({
          ...c,
          tasks: c.tasks.map((t) => {
            if (t.id !== taskId) return t
            nextValue = !t.isCompleted
            completedAt = nextValue ? new Date().toISOString() : null
            return {
              ...t,
              isCompleted: nextValue,
              completedAt: completedAt ?? undefined,
            }
          }),
        })),
      }))
    )

    // Play the cute completion chime right after the optimistic flip so it
    // feels instant. Only on the off→on transition; un-completing is silent.
    if (nextValue) playTaskCompleteSound()

    // Use .select() so PostgREST returns the affected rows. If RLS silently
    // blocks the update (auth.uid() mismatch / expired JWT) PostgREST returns
    // an empty array with no error — that's the bug pattern we're hunting.
    const { data, error } = await supabase
      .from('tasks')
      .update({ is_completed: nextValue, completed_at: completedAt })
      .eq('id', taskId)
      .select('id, is_completed, user_id')
    if (error) {
      console.error('[toggleTaskComplete] supabase error', { taskId, error })
      handleDbError('切換任務狀態')(error)
      return
    }
    if (!data || data.length === 0) {
      const { data: { user } } = await supabase.auth.getUser()
      console.error('[toggleTaskComplete] 0 rows updated — RLS or stale session?', {
        taskId,
        nextValue,
        jwtUserId: user?.id ?? null,
      })
      toast.error('儲存失敗：無法寫入這個任務（可能登入逾時，請重新整理或登出再登入）')
      return
    }
  }, [supabase])

  const deleteTask = useCallback(async (taskId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => ({
        ...w,
        categories: w.categories.map((c) => ({
          ...c,
          tasks: c.tasks.filter((t) => t.id !== taskId),
        })),
      }))
    )
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) handleDbError('刪除任務')(error)
  }, [supabase])

  const rescheduleTask = useCallback(async (
    taskId: string,
    date: string | undefined,
    startTime: string,
    endTime: string,
  ) => {
    setWorkspaces((prev) =>
      prev.map((w) => ({
        ...w,
        categories: w.categories.map((c) => ({
          ...c,
          tasks: c.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  scheduledStartTime: startTime,
                  scheduledEndTime: endTime,
                  ...(date ? { scheduledDate: date } : {}),
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        })),
      }))
    )

    const update: { scheduled_start_time: string; scheduled_end_time: string; scheduled_date?: string } = {
      scheduled_start_time: startTime,
      scheduled_end_time: endTime,
    }
    if (date) update.scheduled_date = date
    // .select() so PostgREST returns the rows the UPDATE touched. If RLS
    // or a stale session silently filters the row out, error stays null
    // but data is empty — exactly the "task disappears" failure mode.
    const { data, error } = await supabase
      .from('tasks')
      .update(update)
      .eq('id', taskId)
      .select('id, scheduled_date, scheduled_start_time, scheduled_end_time')
    if (error) {
      console.error('[rescheduleTask] supabase error', { taskId, update, error })
      handleDbError('重新排程')(error)
      return
    }
    if (!data || data.length === 0) {
      const { data: { user } } = await supabase.auth.getUser()
      console.error('[rescheduleTask] 0 rows updated — RLS / stale session?', {
        taskId,
        attemptedUpdate: update,
        jwtUserId: user?.id ?? null,
      })
      toast.error('任務排程沒寫入：可能登入逾時，請重新整理或登出再登入')
      return
    }
    console.log('[rescheduleTask] OK', { taskId, persisted: data[0] })
  }, [supabase])

  const unscheduleTask = useCallback(async (taskId: string, date?: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => ({
        ...w,
        categories: w.categories.map((c) => ({
          ...c,
          tasks: c.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  scheduledStartTime: undefined,
                  scheduledEndTime: undefined,
                  ...(date ? { scheduledDate: date } : {}),
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        })),
      }))
    )

    const update: { scheduled_start_time: null; scheduled_end_time: null; scheduled_date?: string } = {
      scheduled_start_time: null,
      scheduled_end_time: null,
    }
    if (date) update.scheduled_date = date
    const { data, error } = await supabase
      .from('tasks')
      .update(update)
      .eq('id', taskId)
      .select('id, scheduled_date')
    if (error) {
      console.error('[unscheduleTask] supabase error', { taskId, update, error })
      handleDbError('取消排程')(error)
      return
    }
    if (!data || data.length === 0) {
      const { data: { user } } = await supabase.auth.getUser()
      console.error('[unscheduleTask] 0 rows updated — RLS / stale session?', {
        taskId,
        attemptedUpdate: update,
        jwtUserId: user?.id ?? null,
      })
      toast.error('任務排程沒寫入：可能登入逾時，請重新整理或登出再登入')
      return
    }
    console.log('[unscheduleTask] OK', { taskId, persisted: data[0] })
  }, [supabase])

  // ═════════════════════════════════════════════════════
  // Time-block mutations
  // ═════════════════════════════════════════════════════

  const addTimeBlock = useCallback(async (block: Omit<TimeBlock, 'id'>) => {
    const userId = requireUserId()
    const id = crypto.randomUUID()
    const newBlock: TimeBlock = { ...block, id }

    setTimeBlocks((prev) => [...prev, newBlock])

    pendingWritesRef.current += 1
    try {
      const row = timeBlockToRow(newBlock)
      // .select() so PostgREST returns the inserted row; 0 rows here means
      // RLS or a session issue silently dropped the write — the same pattern
      // that caused time blocks to "disappear" after a tab focus refetch
      // wiped local state back to the DB snapshot.
      const { data, error } = await supabase
        .from('time_blocks')
        .insert({
          id, user_id: userId,
          date: row.date!, start_time: row.start_time!, end_time: row.end_time!,
          type: row.type!, label: row.label!, color: row.color!,
          is_recurring: row.is_recurring,
          recurrence_rule: row.recurrence_rule ?? null,
        })
        .select('id')
      if (error) {
        handleDbError('建立時間區塊')(error)
        return
      }
      if (!data || data.length === 0) {
        const { data: { user } } = await supabase.auth.getUser()
        console.error('[addTimeBlock] 0 rows inserted — RLS or stale session?', {
          blockId: id, jwtUserId: user?.id ?? null,
        })
        // Roll back the optimistic insert so it doesn't survive briefly
        // and then vanish on the next refetch (the user-visible "blink and
        // gone" pattern).
        setTimeBlocks((prev) => prev.filter((b) => b.id !== id))
        toast.error('儲存失敗：無法建立時間區塊（可能登入逾時，請重新整理或登出再登入）')
      }
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  const updateTimeBlock = useCallback(async (id: string, updates: Partial<TimeBlock>) => {
    // Capture the pre-update copy so we can roll back on a silent RLS drop.
    let previous: TimeBlock | undefined
    setTimeBlocks((prev) => {
      previous = prev.find((b) => b.id === id)
      return prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
    })

    pendingWritesRef.current += 1
    try {
      const { data, error } = await supabase
        .from('time_blocks')
        .update(timeBlockToRow(updates))
        .eq('id', id)
        .select('id')
      if (error) {
        handleDbError('更新時間區塊')(error)
        return
      }
      if (!data || data.length === 0) {
        console.error('[updateTimeBlock] 0 rows updated — RLS or stale session?', { id })
        if (previous) setTimeBlocks((prev) => prev.map((b) => (b.id === id ? previous! : b)))
        toast.error('儲存失敗：無法更新時間區塊（可能登入逾時，請重新整理或登出再登入）')
      }
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  const deleteTimeBlock = useCallback(async (id: string) => {
    let removed: TimeBlock | undefined
    setTimeBlocks((prev) => {
      removed = prev.find((b) => b.id === id)
      return prev.filter((b) => b.id !== id)
    })

    pendingWritesRef.current += 1
    try {
      const { data, error } = await supabase
        .from('time_blocks')
        .delete()
        .eq('id', id)
        .select('id')
      if (error) {
        handleDbError('刪除時間區塊')(error)
        return
      }
      if (!data || data.length === 0) {
        console.error('[deleteTimeBlock] 0 rows deleted — RLS or stale session?', { id })
        if (removed) setTimeBlocks((prev) => [...prev, removed!])
        toast.error('儲存失敗：無法刪除時間區塊（可能登入逾時，請重新整理或登出再登入）')
      }
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  // ═════════════════════════════════════════════════════
  // Settings
  // ═════════════════════════════════════════════════════

  const saveSettings = useCallback(async (
    newSettings: UserSettings,
    newTimeBlocks: TimeBlock[],
  ) => {
    const userId = requireUserId()
    setSettings(newSettings)
    setTimeBlocks(newTimeBlocks)
    pendingWritesRef.current += 1
    try {

    // Settings rows we attempt with all fields. If the migration-0006
    // columns aren't on the DB yet, we strip them and retry — view-range
    // values will fall back to localStorage so the feature still works
    // before the migration ships.
    const baseSettingsRow = {
      user_id: userId,
      calendar_start_hour: newSettings.calendarStartHour,
      calendar_end_hour: newSettings.calendarEndHour,
      default_view: newSettings.defaultView,
      week_start_day: newSettings.weekStartDay,
      weather_city: newSettings.weatherCity,
      weather_unit: newSettings.weatherUnit,
      // JSONB columns — UserSettings shapes are richer than the generic Json
      // type but they're plain serializable objects. Round-trip through unknown
      // is safe and avoids a leaky `any`.
      lunch_break: newSettings.lunchBreak as unknown as Json,
      buffer_time: newSettings.bufferTime as unknown as Json,
      default_task_colors: newSettings.defaultTaskColors as unknown as Json,
      notifications: newSettings.notifications as unknown as Json,
    }
    // Always mirror view-range + completed-list values to localStorage so
    // they persist even if the DB rejects them (pre-migration) or only the
    // local device updated. Load logic prefers DB → localStorage in that order.
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          'waddle-view-range-v1',
          JSON.stringify({
            dayViewDays: newSettings.dayViewDays,
            weekViewDays: newSettings.weekViewDays,
          }),
        )
        window.localStorage.setItem(
          'waddle-completed-pref-v1',
          JSON.stringify({
            keepCompletedTodayInList: newSettings.keepCompletedTodayInList,
          }),
        )
      } catch {
        /* localStorage unavailable; ignore */
      }
    }

    let { error } = await supabase.from('user_settings').upsert({
      ...baseSettingsRow,
      day_view_days: newSettings.dayViewDays,
      week_view_days: newSettings.weekViewDays,
      keep_completed_today_in_list: newSettings.keepCompletedTodayInList,
    })
    // PostgREST signals an unknown column with code PGRST204 / 42703.
    // We require both a recognized error code AND a message that names
    // one of the migration columns — keeping it strict avoids swallowing
    // unrelated errors whose message happens to mention a column token.
    if (
      error &&
      (error.code === 'PGRST204' || error.code === '42703') &&
      /day_view_days|week_view_days|keep_completed_today_in_list/.test(error.message ?? '')
    ) {
      console.warn('[settings] migration columns missing — falling back to localStorage. Run latest migration.', error)
      const retry = await supabase.from('user_settings').upsert(baseSettingsRow)
      error = retry.error
    }
    if (error) {
      handleDbError('儲存設定')(error)
      return
    }

    // Non-destructive write for time blocks: upsert all the rows we want
    // present, then delete only the rows whose id is NOT in that list. The
    // previous DELETE-then-INSERT pattern wiped everything if the INSERT
    // failed for any reason (constraint, RLS, malformed row), and left a
    // window where the user's DB had zero rows — if a refetch landed there,
    // the UI flashed empty too.
    if (newTimeBlocks.length === 0) {
      const { error: tbError } = await supabase
        .from('time_blocks').delete().eq('user_id', userId)
      if (tbError) handleDbError('儲存時間區塊')(tbError)
    } else {
      const rows = newTimeBlocks.map((tb) => ({
        id: tb.id || crypto.randomUUID(),
        user_id: userId,
        date: tb.date,
        start_time: tb.startTime,
        end_time: tb.endTime,
        type: tb.type,
        label: tb.label,
        color: tb.color,
        is_recurring: tb.isRecurring,
        recurrence_rule: tb.recurrenceRule ?? null,
      }))
      const { error: upsertError } = await supabase
        .from('time_blocks').upsert(rows, { onConflict: 'id' })
      if (upsertError) {
        handleDbError('儲存時間區塊')(upsertError)
      } else {
        const keepIds = rows.map((r) => r.id).join(',')
        const { error: pruneError } = await supabase
          .from('time_blocks').delete()
          .eq('user_id', userId)
          .not('id', 'in', `(${keepIds})`)
        if (pruneError) handleDbError('儲存時間區塊')(pruneError)
      }
    }

    // Slot types: same non-destructive pattern. Only persist user-customs —
    // built-in types (workspace tabs, 時間區塊/午休/緩衝/專注) are
    // synthesized at runtime in app/page.tsx, so we don't write them.
    const customSlotTypes = newSettings.slotTypes.filter((s) => !s.isBuiltIn)
    if (customSlotTypes.length === 0) {
      const { error: stError } = await supabase
        .from('slot_types').delete().eq('user_id', userId)
      if (stError) handleDbError('儲存時間區塊類型')(stError)
    } else {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const slotRows = customSlotTypes.map((s) => {
        // parent_id has a uuid FK to slot_types.id, so it can only hold
        // strings that look like UUIDs and reference real rows. Synthetic
        // parents ('timeblock', 'ws-<id>') go in parent_key instead.
        const parentIsRealUuid = !!s.parentId && UUID_RE.test(s.parentId)
        return {
          id: s.id,
          user_id: userId,
          key: s.key,
          label: s.label,
          description: s.description,
          icon: s.icon,
          icon_type: s.iconType,
          color: s.color,
          parent_id: parentIsRealUuid ? s.parentId! : null,
          parent_key: !parentIsRealUuid && s.parentId ? s.parentId : null,
          workspace_id: s.workspaceId ?? null,
          sort_order: s.sortOrder,
          is_built_in: s.isBuiltIn,
        }
      })
      const { error: upsertError } = await supabase
        .from('slot_types').upsert(slotRows, { onConflict: 'id' })
      if (upsertError) {
        handleDbError('儲存時間區塊類型')(upsertError)
      } else {
        const keepIds = slotRows.map((r) => r.id).join(',')
        // Built-ins (is_built_in = true) live in the same table; don't prune
        // them. We only prune user-custom rows that are no longer present.
        const { error: pruneError } = await supabase
          .from('slot_types').delete()
          .eq('user_id', userId)
          .eq('is_built_in', false)
          .not('id', 'in', `(${keepIds})`)
        if (pruneError) handleDbError('儲存時間區塊類型')(pruneError)
      }
    }
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  const completeOnboarding = useCallback(async () => {
    const userId = requireUserId()
    setOnboardingCompleted(true)
    const { error } = await supabase
      .from('user_settings')
      .update({ onboarding_completed: true })
      .eq('user_id', userId)
    if (error) handleDbError('儲存導覽進度')(error)
  }, [supabase])

  /**
   * Replace the demo content seeded during signup with the user's chosen
   * starting point. Called from the final step of the onboarding tour.
   *
   * - 'template': three workspaces with categories only (no tasks)
   * - 'blank': one empty workspace with one default category
   *
   * Both options wipe the existing demo workspaces (cascade deletes the
   * categories and tasks under them).
   */
  const applyOnboardingChoice = useCallback(async (choice: 'template' | 'blank') => {
    const userId = requireUserId()

    const TEMPLATES: { name: string; color: string; icon: string; categories: string[] }[] =
      choice === 'template'
        ? [
            { name: '工作', color: '#3b82f6', icon: '💼', categories: ['本週', '進行中', '完成'] },
            { name: '個人', color: '#10b981', icon: '🏠', categories: ['生活', '健康'] },
            { name: '學習', color: '#a855f7', icon: '📚', categories: ['課程', '閱讀'] },
          ]
        : [
            { name: '我的工作區', color: '#6366f1', icon: '📌', categories: ['一般'] },
          ]

    // Build everything in memory first so the optimistic UI matches what we
    // ultimately persist; if anything fails downstream, we can leave the local
    // state alone and the toast will tell the user to retry.
    type WsBuild = { id: string; name: string; color: string; icon: string; sortOrder: number; categories: { id: string; name: string; sortOrder: number }[] }
    const newWorkspaces: WsBuild[] = TEMPLATES.map((t, wsIdx) => ({
      id: crypto.randomUUID(),
      name: t.name,
      color: t.color,
      icon: t.icon,
      sortOrder: wsIdx,
      categories: t.categories.map((catName, catIdx) => ({
        id: crypto.randomUUID(),
        name: catName,
        sortOrder: catIdx,
      })),
    }))

    // Optimistic local update
    setWorkspaces(
      newWorkspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        color: ws.color,
        icon: ws.icon,
        sortOrder: ws.sortOrder,
        isArchived: false,
        categories: ws.categories.map((c) => ({
          id: c.id,
          workspaceId: ws.id,
          name: c.name,
          sortOrder: c.sortOrder,
          isCollapsed: false,
          isArchived: false,
          tasks: [],
        })),
      }))
    )
    setTimeBlocks([])

    // Wipe existing data (workspaces cascade-delete categories + tasks).
    // time_blocks have no FK from workspaces so we delete them separately.
    const { error: delWsError } = await supabase.from('workspaces').delete().eq('user_id', userId)
    if (delWsError) return handleDbError('清空工作區')(delWsError)
    await supabase.from('time_blocks').delete().eq('user_id', userId)

    // Insert workspaces
    const wsRows = newWorkspaces.map((ws) => ({
      id: ws.id,
      user_id: userId,
      name: ws.name,
      color: ws.color,
      icon: ws.icon,
      sort_order: ws.sortOrder,
    }))
    const { error: wsError } = await supabase.from('workspaces').insert(wsRows)
    if (wsError) return handleDbError('建立工作區')(wsError)

    // Insert categories
    const catRows = newWorkspaces.flatMap((ws) =>
      ws.categories.map((c) => ({
        id: c.id,
        user_id: userId,
        workspace_id: ws.id,
        name: c.name,
        sort_order: c.sortOrder,
      }))
    )
    if (catRows.length) {
      const { error: catError } = await supabase.from('categories').insert(catRows)
      if (catError) return handleDbError('建立分類')(catError)
    }
  }, [supabase])

  return {
    workspaces,
    timeBlocks,
    settings,
    isLoading,
    onboardingCompleted,
    completeOnboarding,
    applyOnboardingChoice,
    addWorkspace,
    updateWorkspace,
    updateWorkspaceColor,
    archiveWorkspace,
    deleteWorkspace,
    addCategory,
    deleteCategory,
    toggleCategoryCollapse,
    addTask,
    createTask,
    updateTask,
    toggleTaskComplete,
    deleteTask,
    rescheduleTask,
    unscheduleTask,
    addTimeBlock,
    updateTimeBlock,
    deleteTimeBlock,
    saveSettings,
  }
}

// Re-export so callers don't have to know we depend on toDateString.
export { toDateString }
