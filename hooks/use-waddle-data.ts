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
import { toDateString, parseDateString } from '@/lib/calendar-utils'
import { playTaskCompleteSound } from '@/lib/task-sound'
import type {
  Workspace,
  Category,
  Task,
  TimeBlock,
  UserSettings,
  ScratchpadItem,
} from '@/lib/types'

// ─────────────────────────────────────────────────────────
// Migration-aware write helpers
//
// When a migration ships a new column, an older deployment can still
// have task / settings writes hitting a DB without that column. Rather
// than crashing every write, we detect the "column not found" error
// and retry without the new fields. Module-level latches keyed by
// concern (`meeting`, `settings`) record which columns are known to be
// missing in the current session so subsequent writes strip them
// upfront — no per-call failed-roundtrip cost.
// ─────────────────────────────────────────────────────────

/** PGRST204 = "column not found in schema cache". 42703 = "undefined column". */
const MISSING_COL_CODES = new Set(['PGRST204', '42703'])

function hasCode(err: unknown): err is { code?: string; message?: string } {
  return !!err && typeof err === 'object'
}

/**
 * True when the error signals a missing column AND the message names
 * one of the columns in `regex`. Requiring both avoids silently
 * swallowing unrelated errors whose message happens to contain a
 * matching token.
 */
function isMissingColumnError(err: unknown, regex: RegExp): boolean {
  if (!hasCode(err)) return false
  if (!err.code || !MISSING_COL_CODES.has(err.code)) return false
  return regex.test(err.message ?? '')
}

// Meeting columns — migration 0008.
const MEETING_COL_KEYS = ['is_meeting', 'attendees', 'location', 'meeting_url'] as const
const MEETING_COL_RE = /is_meeting|attendees|location|meeting_url/
let meetingColsKnownMissing = false
const isMissingMeetingColumnError = (err: unknown) => isMissingColumnError(err, MEETING_COL_RE)

function stripMeetingCols<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row }
  for (const k of MEETING_COL_KEYS) delete out[k]
  return out
}

// Build an insert payload from a fully-formed Task. taskToRow returns a
// Partial so the required-field types stay `string | undefined` — we
// re-assert them here so supabase-js's insert signature is happy.
function buildTaskInsert(task: Task, userId: string) {
  return {
    ...taskToRow(task),
    id: task.id,
    user_id: userId,
    workspace_id: task.workspaceId,
    category_id: task.categoryId,
    title: task.title,
  }
}

// User-settings extension columns — migrations 0006 (view-range), 0007
// (keep_completed_today_in_list), and 0009 (quick_links). Same latch
// shape so saveSettings matches createTask/updateTask instead of paying
// the failed-write cost on every save.
const SETTINGS_EXT_COL_RE = /day_view_days|week_view_days|keep_completed_today_in_list|quick_links/
let settingsExtColsKnownMissing = false
const isMissingSettingsExtColumnError = (err: unknown) => isMissingColumnError(err, SETTINGS_EXT_COL_RE)

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
  quickLinks: [],
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
  reorderCategories: (workspaceId: string, orderedCategoryIds: string[]) => Promise<void>
  // Task
  addTask: (categoryId: string, title: string) => Promise<void>
  updateTask: (taskId: string, updates: Partial<Task>, newCategoryId?: string, recurrenceChoice?: import('@/components/modals/recurrence-choice-modal').RecurrenceChoice, targetDate?: string) => Promise<void>
  toggleTaskComplete: (taskId: string) => Promise<void>
  deleteTask: (taskId: string, targetDate?: string, recurrenceChoice?: import('@/components/modals/recurrence-choice-modal').RecurrenceChoice) => Promise<void>
  rescheduleTask: (taskId: string, date: string | undefined, startTime: string, endTime: string, recurrenceChoice?: import('@/components/modals/recurrence-choice-modal').RecurrenceChoice, targetDate?: string) => Promise<void>
  /**
   * Send a task back to the unscheduled (all-day / 待排程) bucket. Clears
   * the time fields and, if a date is provided, sets scheduledDate to it
   * so the task lands in that day's pending area.
   */
  unscheduleTask: (taskId: string, date?: string, recurrenceChoice?: import('@/components/modals/recurrence-choice-modal').RecurrenceChoice, targetDate?: string) => Promise<void>
  createTask: (task: Task) => Promise<void>
  // Time blocks
  addTimeBlock: (block: Omit<TimeBlock, 'id'>) => Promise<void>
  updateTimeBlock: (id: string, updates: Partial<TimeBlock>) => Promise<void>
  deleteTimeBlock: (id: string) => Promise<void>
  // Settings
  saveSettings: (newSettings: UserSettings, newTimeBlocks: TimeBlock[]) => Promise<void>
  /**
   * Narrow mutation for the bottom quick-links bar. Updates only the
   * `quick_links` column so we don't pay the time-block-replace cost on
   * every add/edit/delete from the bar.
   */
  setQuickLinks: (next: import('@/lib/types').QuickLink[]) => Promise<void>
  // Scratchpad (focus board). Items are stored per-date in the DB so
  // history navigation works across devices; the localStorage-only
  // implementation it replaced lost everything on a browser switch.
  scratchpadByDate: Record<string, ScratchpadItem[]>
  addScratchpadItem: (date: string, item: ScratchpadItem) => Promise<void>
  deleteScratchpadItem: (id: string) => Promise<void>
  clearScratchpadDate: (date: string) => Promise<void>
}

export function useWaddleData(): UseWaddleData {
  const supabase = useMemo(() => createClient(), [])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [scratchpadByDate, setScratchpadByDate] = useState<Record<string, ScratchpadItem[]>>({})
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

  // Mirrors `workspaces` so mutation callbacks can read the current task
  // tree without listing `workspaces` in their dependency arrays — which
  // would re-create the callbacks on every state change and bust the
  // memoization chain through TaskBlock + calendar views.
  const workspacesRef = useRef<Workspace[]>([])
  useEffect(() => {
    workspacesRef.current = workspaces
  }, [workspaces])

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

        const dbQuickLinks = settingsRow?.quick_links
        if (dbQuickLinks === undefined) {
          try {
            const raw = window.localStorage.getItem('waddle-quick-links-v1')
            if (raw) {
              const parsed = JSON.parse(raw)
              if (Array.isArray(parsed)) {
                builtSettings.quickLinks = parsed as UserSettings['quickLinks']
              }
            }
          } catch {
            /* ignore corrupt localStorage */
          }
        }
      }

      // Scratchpad items — fetched flat then grouped by date for the
      // focus-board UI. One-time localStorage migration: if the user has
      // legacy `scratchpad-YYYY-MM-DD` keys and the cloud row count for
      // that date is 0, we push them up and remove the keys so the next
      // device sees them too.
      const { data: scratchRows } = await supabase
        .from('scratchpad_items')
        .select('*')
        .order('created_at', { ascending: false })

      const builtScratchpad: Record<string, ScratchpadItem[]> = {}
      for (const r of scratchRows ?? []) {
        const item: ScratchpadItem = {
          id: r.id,
          type: r.type,
          content: r.content,
          title: r.title ?? undefined,
          createdAt: r.created_at,
        }
        ;(builtScratchpad[r.date] ??= []).push(item)
      }

      if (initial && typeof window !== 'undefined') {
        const MIGRATED_KEY = 'waddle-scratchpad-migrated-v1'
        const alreadyMigrated = window.localStorage.getItem(MIGRATED_KEY) === '1'
        if (!alreadyMigrated) {
          // created_at is server-defaulted (Insert type forbids it), so
          // legacy items will get a fresh timestamp at migration time
          // rather than their original ones. The items themselves
          // survive — only the relative ordering within a day changes.
          const legacyRows: { id: string; user_id: string; date: string; type: 'text' | 'image' | 'link'; content: string; title: string | null }[] = []
          const legacyKeys: string[] = []
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i)
            if (!key?.startsWith('scratchpad-')) continue
            const date = key.replace('scratchpad-', '')
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
            // Skip dates that already have cloud rows so we don't double-insert.
            if (builtScratchpad[date]?.length) continue
            try {
              const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]') as ScratchpadItem[]
              for (const it of parsed) {
                legacyRows.push({
                  id: it.id,
                  user_id: user.id,
                  date,
                  type: it.type,
                  content: it.content,
                  title: it.title ?? null,
                })
              }
              legacyKeys.push(key)
            } catch {
              /* ignore corrupt localStorage entry */
            }
          }
          if (legacyRows.length > 0) {
            const { error: migErr } = await supabase
              .from('scratchpad_items')
              .insert(legacyRows)
            if (migErr) {
              console.warn('[scratchpad] localStorage migration failed — will retry next load', migErr)
            } else {
              const nowIso = new Date().toISOString()
              for (const r of legacyRows) {
                const item: ScratchpadItem = {
                  id: r.id,
                  type: r.type,
                  content: r.content,
                  title: r.title ?? undefined,
                  createdAt: nowIso,
                }
                ;(builtScratchpad[r.date] ??= []).push(item)
              }
              for (const k of legacyKeys) window.localStorage.removeItem(k)
              window.localStorage.setItem(MIGRATED_KEY, '1')
            }
          } else {
            // Nothing to migrate; mark complete so we don't scan again.
            window.localStorage.setItem(MIGRATED_KEY, '1')
          }
        }
      }

      if (isStale()) return
      setWorkspaces(builtWorkspaces)
      setTimeBlocks(builtTimeBlocks)
      setSettings(builtSettings)
      setScratchpadByDate(builtScratchpad)
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

    pendingWritesRef.current += 1
    try {
      const { error: e1 } = await supabase.from('workspaces').insert({
        id: wsId, user_id: userId, name, color, icon, sort_order: workspaces.length,
      })
      if (e1) return handleDbError('新增工作區')(e1)

      const { error: e2 } = await supabase.from('categories').insert({
        id: catId, user_id: userId, workspace_id: wsId, name: '一般', sort_order: 0,
      })
      if (e2) handleDbError('新增分類')(e2)
    } finally {
      pendingWritesRef.current -= 1
    }
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

    pendingWritesRef.current += 1
    try {
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
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  const updateWorkspaceColor = useCallback(async (workspaceId: string, newColor: string) => {
    return updateWorkspace(workspaceId, { color: newColor })
  }, [updateWorkspace])

  const archiveWorkspace = useCallback(async (workspaceId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === workspaceId ? { ...w, isArchived: true } : w))
    )
    pendingWritesRef.current += 1
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({ is_archived: true })
        .eq('id', workspaceId)
      if (error) handleDbError('封存工作區')(error)
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  const deleteWorkspace = useCallback(async (workspaceId: string) => {
    setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId))
    pendingWritesRef.current += 1
    try {
      const { error } = await supabase.from('workspaces').delete().eq('id', workspaceId)
      if (error) handleDbError('刪除工作區')(error)
    } finally {
      pendingWritesRef.current -= 1
    }
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

    pendingWritesRef.current += 1
    try {
      const { error } = await supabase.from('categories').insert({
        id, user_id: userId, workspace_id: workspaceId, name, sort_order: sortOrder,
      })
      if (error) handleDbError('新增分類')(error)
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  const deleteCategory = useCallback(async (categoryId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => ({
        ...w,
        categories: w.categories.filter((c) => c.id !== categoryId),
      }))
    )
    pendingWritesRef.current += 1
    try {
      // Tasks in this category cascade-delete via the FK in the schema.
      const { error } = await supabase.from('categories').delete().eq('id', categoryId)
      if (error) handleDbError('刪除分類')(error)
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  const reorderCategories = useCallback(async (workspaceId: string, orderedCategoryIds: string[]) => {
    const orderIndex = new Map(orderedCategoryIds.map((id, idx) => [id, idx]))
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w
        return {
          ...w,
          categories: w.categories.map((c) => {
            const next = orderIndex.get(c.id)
            return next === undefined ? c : { ...c, sortOrder: next }
          }),
        }
      })
    )

    pendingWritesRef.current += 1
    try {
      const updates = orderedCategoryIds.map((id, idx) =>
        supabase.from('categories').update({ sort_order: idx }).eq('id', id)
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) handleDbError('調整分類順序')(failed.error)
    } finally {
      pendingWritesRef.current -= 1
    }
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

    pendingWritesRef.current += 1
    try {
      const { error } = await supabase
        .from('categories')
        .update({ is_collapsed: nextValue })
        .eq('id', categoryId)
      if (error) handleDbError('切換分類折疊')(error)
    } finally {
      pendingWritesRef.current -= 1
    }
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

    pendingWritesRef.current += 1
    try {
      const { error } = await supabase.from('tasks').insert({
        id, user_id: userId, workspace_id: workspaceId, category_id: categoryId,
        title, urgency: 5, calendar_color: workspaceColor, sort_order: sortOrder,
      })
      if (error) handleDbError('新增任務')(error)
    } finally {
      pendingWritesRef.current -= 1
    }
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
    pendingWritesRef.current += 1
    try {
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
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  const updateTask = useCallback(async (
    taskId: string,
    updates: Partial<Task>,
    newCategoryId?: string,
    recurrenceChoice?: import('@/components/modals/recurrence-choice-modal').RecurrenceChoice,
    targetDate?: string
  ) => {
    // Find the task in local state via ref so the callback doesn't need
    // to depend on `workspaces` (which would re-create it on every keystroke).
    let existing: Task | null = null
    for (const w of workspacesRef.current) for (const c of w.categories) {
      const t = c.tasks.find((x) => x.id === taskId)
      if (t) { existing = t; break }
    }
    if (!existing) return

    // Non-recurring or "all" or missing choice
    if (!existing.isRecurring || recurrenceChoice === 'all' || !recurrenceChoice) {
      const isMove = newCategoryId !== undefined

      setWorkspaces((prev) => {
        if (isMove && newCategoryId !== existing!.categoryId) {
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

      pendingWritesRef.current += 1
      try {
        if (isMove && newCategoryId) {
          dbUpdates.category_id = newCategoryId
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
          const retry = await runUpdate(true)
          error = retry.error
        }
        if (error) handleDbError('更新任務')(error)
      } finally {
        pendingWritesRef.current -= 1
      }
      return
    }

    // "Only this"
    if (recurrenceChoice === 'only_this' && targetDate) {
      if (existing.parentId) {
        // Already detached. Just update in place.
        // For simplicity, we use the same update logic as "all" but targeted to this ID
        // (which is already detached).
        setWorkspaces((prev) => prev.map((w) => ({
          ...w,
          categories: w.categories.map((c) => ({
            ...c,
            tasks: c.tasks.map((t) => t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t)
          }))
        })))
        pendingWritesRef.current += 1
        try {
          const dbUpdates = taskToRow(updates)
          const { error } = await supabase.from('tasks').update(dbUpdates).eq('id', taskId)
          if (error) handleDbError('更新任務')(error)
        } finally {
          pendingWritesRef.current -= 1
        }
      } else {
        // Virtual occurrence — materialize as a detached child task.
        // showInTaskList:false keeps the unified task list showing one entry
        // (the master); the override is calendar-only.
        const nextExdates = [...(existing.exdates || []), targetDate]
        const newTask: Task = {
          ...existing,
          ...updates,
          id: crypto.randomUUID(),
          isRecurring: false,
          recurrence: undefined,
          parentId: existing.id,
          exdates: undefined,
          showInTaskList: false,
          scheduledDate: targetDate,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        setWorkspaces((prev) => prev.map((w) => ({
          ...w,
          categories: w.categories.map((c) => {
            if (c.tasks.some(t => t.id === taskId)) {
              return {
                ...c,
                tasks: [
                  ...c.tasks.map(t => t.id === taskId ? { ...t, exdates: nextExdates } : t),
                  newTask
                ]
              }
            }
            return c
          })
        })))

        pendingWritesRef.current += 1
        try {
          await supabase.from('tasks').update({ exdates: nextExdates }).eq('id', taskId)
          const userId = (await supabase.auth.getUser()).data.user?.id
          await supabase.from('tasks').insert(buildTaskInsert(newTask, userId!))
        } finally {
          pendingWritesRef.current -= 1
        }
      }
      return
    }

    // "This and following"
    if (recurrenceChoice === 'this_and_following' && targetDate) {
      const dayBefore = new Date(parseDateString(targetDate))
      dayBefore.setDate(dayBefore.getDate() - 1)
      const endDate = toDateString(dayBefore)

      const newTask: Task = {
        ...existing,
        ...updates,
        id: crypto.randomUUID(),
        scheduledDate: targetDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recurrence: {
          ...existing.recurrence!,
          ...(updates.recurrence || {}),
        }
      }

      setWorkspaces((prev) => prev.map((w) => ({
        ...w,
        categories: w.categories.map((c) => {
          if (c.tasks.some(t => t.id === taskId)) {
            return {
              ...c,
              tasks: [
                ...c.tasks.map(t => t.id === taskId ? { ...t, recurrence: { ...t.recurrence!, endDate } } : t),
                newTask
              ]
            }
          }
          return c
        })
      })))

      pendingWritesRef.current += 1
      try {
        const userId = (await supabase.auth.getUser()).data.user?.id
        await supabase.from('tasks').update({ recurrence_end_date: endDate }).eq('id', taskId)
        await supabase.from('tasks').insert(buildTaskInsert(newTask, userId!))
      } finally {
        pendingWritesRef.current -= 1
      }
    }
  }, [supabase])

  const toggleTaskComplete = useCallback(async (taskId: string) => {
    // Capture the previous state so we can roll back on a silent failure.
    let previousCompleted: boolean | undefined
    let previousCompletedAt: string | undefined
    let nextValue = false
    let completedAt: string | null = null
    setWorkspaces((prev) =>
      prev.map((w) => ({
        ...w,
        categories: w.categories.map((c) => ({
          ...c,
          tasks: c.tasks.map((t) => {
            if (t.id !== taskId) return t
            previousCompleted = t.isCompleted
            previousCompletedAt = t.completedAt
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

    // Block any cross-device/tab-focus refetch from clobbering the optimistic
    // toggle. Without this guard, a refetch that lands between the local
    // setWorkspaces above and the DB write below replays the pre-toggle row
    // and the checkbox visibly bounces back to its old state.
    pendingWritesRef.current += 1
    try {
      // Use .select() so PostgREST returns the affected rows. If RLS silently
      // blocks the update (auth.uid() mismatch / expired JWT) PostgREST returns
      // an empty array with no error — that's the bug pattern we're hunting.
      const { data, error } = await supabase
        .from('tasks')
        .update({ is_completed: nextValue, completed_at: completedAt })
        .eq('id', taskId)
        .select('id, is_completed, user_id')

      const rollback = () => {
        setWorkspaces((prev) =>
          prev.map((w) => ({
            ...w,
            categories: w.categories.map((c) => ({
              ...c,
              tasks: c.tasks.map((t) =>
                t.id === taskId
                  ? { ...t, isCompleted: previousCompleted ?? false, completedAt: previousCompletedAt }
                  : t,
              ),
            })),
          })),
        )
      }

      if (error) {
        console.error('[toggleTaskComplete] supabase error', { taskId, error })
        rollback()
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
        rollback()
        toast.error('儲存失敗：無法寫入這個任務（可能登入逾時，請重新整理或登出再登入）')
        return
      }
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  const deleteTask = useCallback(async (taskId: string, targetDate?: string, recurrenceChoice?: import('@/components/modals/recurrence-choice-modal').RecurrenceChoice) => {
    // Find the task in local state via ref so this callback is stable.
    let task: Task | null = null
    for (const w of workspacesRef.current) {
      for (const c of w.categories) {
        const t = c.tasks.find((x) => x.id === taskId)
        if (t) { task = t; break }
      }
      if (task) break
    }

    if (!task) return

    // If it's a non-recurring task or they chose 'all'
    if (!task.isRecurring || recurrenceChoice === 'all' || !recurrenceChoice) {
      // If this is a detached child of a recurring master, also remove its
      // date from the master's exdates so the master re-occupies that day.
      // (Otherwise "delete this override" leaves the day permanently blank.)
      let parentExdateCleanup: { parentId: string; nextExdates: string[] } | null = null
      if (task.parentId && task.scheduledDate) {
        let parent: Task | null = null
        for (const w of workspacesRef.current) for (const c of w.categories) {
          const p = c.tasks.find((x) => x.id === task!.parentId)
          if (p) { parent = p; break }
        }
        if (parent?.exdates?.includes(task.scheduledDate)) {
          parentExdateCleanup = {
            parentId: parent.id,
            nextExdates: parent.exdates.filter((d) => d !== task!.scheduledDate),
          }
        }
      }

      setWorkspaces((prev) =>
        prev.map((w) => ({
          ...w,
          categories: w.categories.map((c) => ({
            ...c,
            tasks: c.tasks
              .filter((t) => t.id !== taskId)
              .map((t) =>
                parentExdateCleanup && t.id === parentExdateCleanup.parentId
                  ? { ...t, exdates: parentExdateCleanup.nextExdates }
                  : t
              ),
          })),
        }))
      )
      pendingWritesRef.current += 1
      try {
        const { error } = await supabase.from('tasks').delete().eq('id', taskId)
        if (error) handleDbError('刪除任務')(error)
        if (parentExdateCleanup) {
          await supabase
            .from('tasks')
            .update({ exdates: parentExdateCleanup.nextExdates })
            .eq('id', parentExdateCleanup.parentId)
        }
      } finally {
        pendingWritesRef.current -= 1
      }
      return
    }

    // "Only this"
    if (recurrenceChoice === 'only_this' && targetDate) {
      // If it's already a detached task, just delete it.
      if (task.parentId) {
        setWorkspaces((prev) =>
          prev.map((w) => ({
            ...w,
            categories: w.categories.map((c) => ({
              ...c,
              tasks: c.tasks.filter((t) => t.id !== taskId),
            })),
          }))
        )
        pendingWritesRef.current += 1
        try {
          const { error } = await supabase.from('tasks').delete().eq('id', taskId)
          if (error) handleDbError('刪除任務')(error)
        } finally {
          pendingWritesRef.current -= 1
        }
      } else {
        // It's a virtual occurrence of a master task.
        // Add targetDate to exdates.
        const nextExdates = [...(task.exdates || []), targetDate]
        setWorkspaces((prev) =>
          prev.map((w) => ({
            ...w,
            categories: w.categories.map((c) => ({
              ...c,
              tasks: c.tasks.map((t) =>
                t.id === taskId ? { ...t, exdates: nextExdates } : t
              ),
            })),
          }))
        )
        pendingWritesRef.current += 1
        try {
          const { error } = await supabase
            .from('tasks')
            .update({ exdates: nextExdates })
            .eq('id', taskId)
          if (error) handleDbError('更新重複任務例外')(error)
        } finally {
          pendingWritesRef.current -= 1
        }
      }
      return
    }

    // "This and following"
    if (recurrenceChoice === 'this_and_following' && targetDate) {
      // If the targetDate is the original scheduledDate, it's effectively "all"
      if (targetDate === task.scheduledDate) {
        // Reuse "all" logic
        setWorkspaces((prev) =>
          prev.map((w) => ({
            ...w,
            categories: w.categories.map((c) => ({
              ...c,
              tasks: c.tasks.filter((t) => t.id !== taskId),
            })),
          }))
        )
        pendingWritesRef.current += 1
        try {
          const { error } = await supabase.from('tasks').delete().eq('id', taskId)
          if (error) handleDbError('刪除任務')(error)
        } finally {
          pendingWritesRef.current -= 1
        }
        return
      }

      // 1. Cap the master task
      const dayBefore = new Date(parseDateString(targetDate))
      dayBefore.setDate(dayBefore.getDate() - 1)
      const endDate = toDateString(dayBefore)

      setWorkspaces((prev) =>
        prev.map((w) => ({
          ...w,
          categories: w.categories.map((c) => ({
            ...c,
            tasks: c.tasks.map((t) =>
              t.id === taskId
                ? { ...t, recurrence: { ...t.recurrence!, endDate } }
                : t
            ),
          })),
        }))
      )

      pendingWritesRef.current += 1
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ recurrence_end_date: endDate })
          .eq('id', taskId)
        if (error) handleDbError('更新重複任務結束日')(error)
        
        // 2. We don't need to create a new task since it's a delete.
        // But we should re-parent or delete detached tasks past targetDate.
        // For simplicity, we just delete the master's "future" via endDate.
      } finally {
        pendingWritesRef.current -= 1
      }
    }
  }, [supabase])

  const rescheduleTask = useCallback(async (
    taskId: string,
    date: string | undefined,
    startTime: string,
    endTime: string,
    recurrenceChoice?: import('@/components/modals/recurrence-choice-modal').RecurrenceChoice,
    targetDate?: string
  ) => {
    // Find the task in local state via ref so this callback is stable.
    let task: Task | null = null
    for (const w of workspacesRef.current) {
      for (const c of w.categories) {
        const t = c.tasks.find((x) => x.id === taskId)
        if (t) { task = t; break }
      }
      if (task) break
    }

    if (!task) return

    // Non-recurring or "all" or missing choice
    if (!task.isRecurring || recurrenceChoice === 'all' || !recurrenceChoice) {
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

      pendingWritesRef.current += 1
      try {
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
      } finally {
        pendingWritesRef.current -= 1
      }
      return
    }

    // "Only this"
    if (recurrenceChoice === 'only_this' && targetDate && date) {
      if (task.parentId) {
        // Already detached. Just update.
        setWorkspaces((prev) =>
          prev.map((w) => ({
            ...w,
            categories: w.categories.map((c) => ({
              ...c,
              tasks: c.tasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      scheduledDate: date,
                      scheduledStartTime: startTime,
                      scheduledEndTime: endTime,
                      updatedAt: new Date().toISOString(),
                    }
                  : t
              ),
            })),
          }))
        )
        pendingWritesRef.current += 1
        try {
          const { error } = await supabase
            .from('tasks')
            .update({
              scheduled_date: date,
              scheduled_start_time: startTime,
              scheduled_end_time: endTime,
            })
            .eq('id', taskId)
          if (error) handleDbError('重新排程')(error)
        } finally {
          pendingWritesRef.current -= 1
        }
      } else {
        // Virtual occurrence — materialize as a detached child task. See
        // updateTask above for why showInTaskList:false.
        const nextExdates = [...(task.exdates || []), targetDate]
        const newTask: Task = {
          ...task,
          id: crypto.randomUUID(),
          isRecurring: false,
          recurrence: undefined,
          parentId: task.id,
          exdates: undefined,
          showInTaskList: false,
          scheduledDate: date,
          scheduledStartTime: startTime,
          scheduledEndTime: endTime,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        setWorkspaces((prev) =>
          prev.map((w) => ({
            ...w,
            categories: w.categories.map((c) => {
              if (c.tasks.some((t) => t.id === taskId)) {
                return {
                  ...c,
                  tasks: [
                    ...c.tasks.map((t) =>
                      t.id === taskId ? { ...t, exdates: nextExdates } : t
                    ),
                    newTask,
                  ],
                }
              }
              return c
            }),
          }))
        )

        pendingWritesRef.current += 1
        try {
          const { error: updateError } = await supabase
            .from('tasks')
            .update({ exdates: nextExdates })
            .eq('id', taskId)
          if (updateError) handleDbError('更新重複任務例外')(updateError)

          const userId = (await supabase.auth.getUser()).data.user?.id
          const { error: insertError } = await supabase
            .from('tasks')
            .insert(buildTaskInsert(newTask, userId!))
          if (insertError) handleDbError('建立任務例外')(insertError)
        } finally {
          pendingWritesRef.current -= 1
        }
      }
      return
    }

    // "This and following"
    if (recurrenceChoice === 'this_and_following' && targetDate && date) {
      const dayBefore = new Date(parseDateString(targetDate))
      dayBefore.setDate(dayBefore.getDate() - 1)
      const endDate = toDateString(dayBefore)

      const newTask: Task = {
        ...task,
        id: crypto.randomUUID(),
        scheduledDate: date,
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recurrence: {
          ...task.recurrence!,
          // Note: we should potentially adjust daysOfWeek if moved to different day.
        }
      }

      setWorkspaces((prev) =>
        prev.map((w) => ({
          ...w,
          categories: w.categories.map((c) => {
            if (c.tasks.some((t) => t.id === taskId)) {
              return {
                ...c,
                tasks: [
                  ...c.tasks.map((t) =>
                    t.id === taskId
                      ? { ...t, recurrence: { ...t.recurrence!, endDate } }
                      : t
                  ),
                  newTask,
                ],
              }
            }
            return c
          }),
        }))
      )

      pendingWritesRef.current += 1
      try {
        const userId = (await supabase.auth.getUser()).data.user?.id
        await supabase.from('tasks').update({ recurrence_end_date: endDate }).eq('id', taskId)
        await supabase.from('tasks').insert(buildTaskInsert(newTask, userId!))
      } finally {
        pendingWritesRef.current -= 1
      }
    }
  }, [supabase])

  const unscheduleTask = useCallback(async (
    taskId: string,
    date?: string,
    recurrenceChoice?: import('@/components/modals/recurrence-choice-modal').RecurrenceChoice,
    targetDate?: string
  ) => {
    // Find the task via ref to stay decoupled from `workspaces`.
    let task: Task | null = null
    for (const w of workspacesRef.current) {
      for (const c of w.categories) {
        const t = c.tasks.find((x) => x.id === taskId)
        if (t) { task = t; break }
      }
      if (task) break
    }
    if (!task) return

    // Non-recurring or "all" → clear the master's time fields (and date if
    // fully unscheduled). Earlier delegation to rescheduleTask with `''`
    // times wrote empty strings into the DB; we explicitly null them here.
    if (!task.isRecurring || recurrenceChoice === 'all' || !recurrenceChoice) {
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
                    scheduledDate: date ?? undefined,
                    updatedAt: new Date().toISOString(),
                  }
                : t
            ),
          })),
        }))
      )

      const update = {
        scheduled_start_time: null as string | null,
        scheduled_end_time: null as string | null,
        scheduled_date: date ?? null,
      }

      pendingWritesRef.current += 1
      try {
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
      } finally {
        pendingWritesRef.current -= 1
      }
      return
    }

    // Recurring + only_this/this_and_following → materialize an override
    // and clear its time fields. Detached child carries showInTaskList:false
    // so the unified list still shows a single entry (the master).
    if (recurrenceChoice === 'only_this' && targetDate) {
      if (task.parentId) {
        // Already detached — clear its time/date in place.
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
                      scheduledDate: date ?? undefined,
                      updatedAt: new Date().toISOString(),
                    }
                  : t
              ),
            })),
          }))
        )
        pendingWritesRef.current += 1
        try {
          await supabase
            .from('tasks')
            .update({
              scheduled_start_time: null,
              scheduled_end_time: null,
              scheduled_date: date ?? null,
            })
            .eq('id', taskId)
        } finally {
          pendingWritesRef.current -= 1
        }
      } else {
        // Virtual occurrence — detach with null times.
        const nextExdates = [...(task.exdates || []), targetDate]
        const newTask: Task = {
          ...task,
          id: crypto.randomUUID(),
          isRecurring: false,
          recurrence: undefined,
          parentId: task.id,
          exdates: undefined,
          showInTaskList: false,
          scheduledDate: date,
          scheduledStartTime: undefined,
          scheduledEndTime: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        setWorkspaces((prev) =>
          prev.map((w) => ({
            ...w,
            categories: w.categories.map((c) => {
              if (c.tasks.some(t => t.id === taskId)) {
                return {
                  ...c,
                  tasks: [
                    ...c.tasks.map(t => t.id === taskId ? { ...t, exdates: nextExdates } : t),
                    newTask,
                  ],
                }
              }
              return c
            }),
          }))
        )
        pendingWritesRef.current += 1
        try {
          await supabase.from('tasks').update({ exdates: nextExdates }).eq('id', taskId)
          const userId = (await supabase.auth.getUser()).data.user?.id
          await supabase.from('tasks').insert(buildTaskInsert(newTask, userId!))
        } finally {
          pendingWritesRef.current -= 1
        }
      }
      return
    }

    // this_and_following — unschedule from this date onward: cap the master
    // and start a continuation that's already unscheduled.
    if (recurrenceChoice === 'this_and_following' && targetDate) {
      const dayBefore = new Date(parseDateString(targetDate))
      dayBefore.setDate(dayBefore.getDate() - 1)
      const endDate = toDateString(dayBefore)

      const newTask: Task = {
        ...task,
        id: crypto.randomUUID(),
        scheduledDate: date,
        scheduledStartTime: undefined,
        scheduledEndTime: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recurrence: { ...task.recurrence! },
      }

      setWorkspaces((prev) =>
        prev.map((w) => ({
          ...w,
          categories: w.categories.map((c) => {
            if (c.tasks.some(t => t.id === taskId)) {
              return {
                ...c,
                tasks: [
                  ...c.tasks.map(t => t.id === taskId ? { ...t, recurrence: { ...t.recurrence!, endDate } } : t),
                  newTask,
                ],
              }
            }
            return c
          }),
        }))
      )

      pendingWritesRef.current += 1
      try {
        const userId = (await supabase.auth.getUser()).data.user?.id
        await supabase.from('tasks').update({ recurrence_end_date: endDate }).eq('id', taskId)
        await supabase.from('tasks').insert(buildTaskInsert(newTask, userId!))
      } finally {
        pendingWritesRef.current -= 1
      }
    }
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
        window.localStorage.setItem(
          'waddle-quick-links-v1',
          JSON.stringify(newSettings.quickLinks),
        )
      } catch {
        /* localStorage unavailable; ignore */
      }
    }

    // Same session-latch pattern used by createTask / updateTask for
    // meeting columns: once we know the migration columns are missing,
    // strip them upfront so every settings save afterward skips the
    // failed-write roundtrip. CR-04 from the multi-agent review.
    const fullSettingsRow = settingsExtColsKnownMissing
      ? baseSettingsRow
      : {
          ...baseSettingsRow,
          day_view_days: newSettings.dayViewDays,
          week_view_days: newSettings.weekViewDays,
          keep_completed_today_in_list: newSettings.keepCompletedTodayInList,
          quick_links: newSettings.quickLinks as unknown as Json,
        }
    let { error } = await supabase.from('user_settings').upsert(fullSettingsRow)
    if (error && isMissingSettingsExtColumnError(error)) {
      settingsExtColsKnownMissing = true
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

  /**
   * Quick-links mutation surface for the bottom drawer. We could route
   * everything through `saveSettings`, but that path also rewrites
   * time_blocks + slot_types on every call — wasteful when the user is
   * just toggling a single shortcut. Narrowing to a single column upsert
   * keeps the write small and avoids the pending-writes throttle hitting
   * unrelated surfaces.
   */
  const setQuickLinks = useCallback(async (next: import('@/lib/types').QuickLink[]) => {
    const userId = requireUserId()
    setSettings((prev) => ({ ...prev, quickLinks: next }))

    // Mirror to localStorage so the bar still works pre-migration-0009
    // and recovers on page reload even if the DB write fails.
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('waddle-quick-links-v1', JSON.stringify(next))
      } catch {
        /* ignore */
      }
    }

    pendingWritesRef.current += 1
    try {
      // Upsert (not update) — the row is normally created by the
      // `handle_new_user` trigger, but defensively upserting means a
      // missing row never silently swallows the user's links.
      let { error } = await supabase
        .from('user_settings')
        .upsert(
          { user_id: userId, quick_links: next as unknown as Json },
          { onConflict: 'user_id' },
        )
      if (error && isMissingSettingsExtColumnError(error)) {
        settingsExtColsKnownMissing = true
        console.warn('[setQuickLinks] quick_links column missing — kept in localStorage only. Run migration 0009.', error)
        // Already mirrored to localStorage; nothing more to do.
        return
      }
      if (error) handleDbError('儲存常用連結')(error)
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  // ═════════════════════════════════════════════════════
  // Scratchpad mutations
  // ═════════════════════════════════════════════════════

  const addScratchpadItem = useCallback(async (date: string, item: ScratchpadItem) => {
    const userId = requireUserId()
    setScratchpadByDate((prev) => ({
      ...prev,
      [date]: [item, ...(prev[date] ?? [])],
    }))
    pendingWritesRef.current += 1
    try {
      // created_at is server-defaulted (Insert type omits it); the
      // optimistic state above keeps the client-generated timestamp so
      // the new item slots into the list at the right spot until the
      // next refetch reconciles with the server-stamped row.
      const { error } = await supabase.from('scratchpad_items').insert({
        id: item.id,
        user_id: userId,
        date,
        type: item.type,
        content: item.content,
        title: item.title ?? null,
      })
      if (error) {
        // Roll back the optimistic insert so the UI matches reality
        // instead of showing a phantom item that vanishes on refetch.
        setScratchpadByDate((prev) => ({
          ...prev,
          [date]: (prev[date] ?? []).filter((i) => i.id !== item.id),
        }))
        handleDbError('儲存白板')(error)
      }
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  const deleteScratchpadItem = useCallback(async (id: string) => {
    let removedFromDate: string | null = null
    let removedItem: ScratchpadItem | null = null
    setScratchpadByDate((prev) => {
      const next: Record<string, ScratchpadItem[]> = {}
      for (const [date, items] of Object.entries(prev)) {
        const found = items.find((i) => i.id === id)
        if (found) {
          removedFromDate = date
          removedItem = found
          next[date] = items.filter((i) => i.id !== id)
        } else {
          next[date] = items
        }
      }
      return next
    })
    pendingWritesRef.current += 1
    try {
      const { error } = await supabase.from('scratchpad_items').delete().eq('id', id)
      if (error) {
        if (removedFromDate && removedItem) {
          setScratchpadByDate((prev) => ({
            ...prev,
            [removedFromDate!]: [removedItem!, ...(prev[removedFromDate!] ?? [])],
          }))
        }
        handleDbError('刪除白板項目')(error)
      }
    } finally {
      pendingWritesRef.current -= 1
    }
  }, [supabase])

  const clearScratchpadDate = useCallback(async (date: string) => {
    const userId = requireUserId()
    let snapshot: ScratchpadItem[] = []
    setScratchpadByDate((prev) => {
      snapshot = prev[date] ?? []
      const next = { ...prev }
      delete next[date]
      return next
    })
    pendingWritesRef.current += 1
    try {
      const { error } = await supabase
        .from('scratchpad_items')
        .delete()
        .eq('user_id', userId)
        .eq('date', date)
      if (error) {
        setScratchpadByDate((prev) => ({ ...prev, [date]: snapshot }))
        handleDbError('清空白板')(error)
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
    reorderCategories,
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
    setQuickLinks,
    scratchpadByDate,
    addScratchpadItem,
    deleteScratchpadItem,
    clearScratchpadDate,
  }
}

// Re-export so callers don't have to know we depend on toDateString.
export { toDateString }
