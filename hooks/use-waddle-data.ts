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
import type {
  Workspace,
  Category,
  Task,
  TimeBlock,
  UserSettings,
} from '@/lib/types'

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

      // View-range fields fall back to localStorage when the DB doesn't
      // have those columns yet (pre-migration-0006). DB takes precedence
      // when the columns ARE present, so once the migration ships the
      // localStorage copy becomes a no-op.
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
    const { error } = await supabase.from('tasks').insert({
      ...row,
      id: task.id,
      user_id: userId,
      workspace_id: task.workspaceId,
      category_id: task.categoryId,
      title: task.title,
      urgency: task.urgency,
      calendar_color: task.calendarColor,
    })
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

    const { error } = await supabase.from('tasks').update(dbUpdates).eq('id', taskId)
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
    const { error } = await supabase.from('tasks').update(update).eq('id', taskId)
    if (error) handleDbError('重新排程')(error)
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
    const { error } = await supabase.from('tasks').update(update).eq('id', taskId)
    if (error) handleDbError('取消排程')(error)
  }, [supabase])

  // ═════════════════════════════════════════════════════
  // Time-block mutations
  // ═════════════════════════════════════════════════════

  const addTimeBlock = useCallback(async (block: Omit<TimeBlock, 'id'>) => {
    const userId = requireUserId()
    const id = crypto.randomUUID()
    const newBlock: TimeBlock = { ...block, id }

    setTimeBlocks((prev) => [...prev, newBlock])

    const row = timeBlockToRow(newBlock)
    const { error } = await supabase.from('time_blocks').insert({
      id, user_id: userId,
      date: row.date!, start_time: row.start_time!, end_time: row.end_time!,
      type: row.type!, label: row.label!, color: row.color!,
      is_recurring: row.is_recurring,
      recurrence_rule: row.recurrence_rule ?? null,
    })
    if (error) handleDbError('建立時間區塊')(error)
  }, [supabase])

  const updateTimeBlock = useCallback(async (id: string, updates: Partial<TimeBlock>) => {
    setTimeBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
    )
    const { error } = await supabase
      .from('time_blocks')
      .update(timeBlockToRow(updates))
      .eq('id', id)
    if (error) handleDbError('更新時間區塊')(error)
  }, [supabase])

  const deleteTimeBlock = useCallback(async (id: string) => {
    setTimeBlocks((prev) => prev.filter((b) => b.id !== id))
    const { error } = await supabase.from('time_blocks').delete().eq('id', id)
    if (error) handleDbError('刪除時間區塊')(error)
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
    // Always mirror view-range values to localStorage so they persist even
    // if the DB rejects them (pre-migration) or only the local device
    // updated. Load logic prefers DB → localStorage in that order.
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          'waddle-view-range-v1',
          JSON.stringify({
            dayViewDays: newSettings.dayViewDays,
            weekViewDays: newSettings.weekViewDays,
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
    })
    // PostgREST signals an unknown column with code PGRST204 / 42703 etc.
    // Detect by message text — if it complains about either of the two
    // migration-0006 columns, retry the upsert without them so the rest
    // of the settings still save.
    if (error && /day_view_days|week_view_days/.test(error.message ?? '')) {
      console.warn('[settings] view-range columns missing — falling back to localStorage. Run migration 0006.', error)
      const retry = await supabase.from('user_settings').upsert(baseSettingsRow)
      error = retry.error
    }
    if (error) {
      handleDbError('儲存設定')(error)
      return
    }

    // For time blocks: cheap full-replace strategy. Settings save is
    // infrequent and the row count is small, so simplicity wins over diffing.
    await supabase.from('time_blocks').delete().eq('user_id', userId)
    if (newTimeBlocks.length > 0) {
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
      const { error: tbError } = await supabase.from('time_blocks').insert(rows)
      if (tbError) handleDbError('儲存時間區塊')(tbError)
    }

    // Slot types: same full-replace pattern. Only persist user-customs —
    // built-in types (workspace tabs, 時間區塊/午休/緩衝/專注) are
    // synthesized at runtime in app/page.tsx, so we don't write them.
    await supabase.from('slot_types').delete().eq('user_id', userId)
    const customSlotTypes = newSettings.slotTypes.filter((s) => !s.isBuiltIn)
    if (customSlotTypes.length > 0) {
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
      const { error: stError } = await supabase.from('slot_types').insert(slotRows)
      if (stError) handleDbError('儲存時間區塊類型')(stError)
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
