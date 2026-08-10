import type { Task, Workspace } from './types'
import { toDateString } from './calendar-utils'
import { forEachTask, getTaskOverdueDate } from './task-utils'

// ─────────────────────────────────────────────────────────
// Current Focus ("當前重點")
//
// A pinned line at the top of the task panel answering one question:
// *what is the single most important thing right now?* The user can
// pin it by hand (free text like "推進講師資源站", or a real task), or
// leave it on `auto` and let us pick.
//
// This module is deliberately pure — no React, no Supabase. The panel,
// the editor modal and (later) any dashboard all resolve focus through
// `resolveFocus` so the ranking rules live in exactly one place.
// ─────────────────────────────────────────────────────────

/**
 * How a focus slot gets its content.
 * - `auto` — we pick the most pressing task (see {@link pickAutoTask}).
 * - `text` — user typed a free-form status line ("等對方回信").
 * - `task` — user pinned a specific task by id.
 * - `off`  — slot is intentionally empty (workspace slots default here
 *            so a 15-workspace account doesn't get 15 noisy rows).
 */
export type FocusMode = 'auto' | 'text' | 'task' | 'off'

export interface FocusPin {
  mode: FocusMode
  /** Used when `mode === 'text'`. */
  text?: string
  /** Used when `mode === 'task'`. */
  taskId?: string
  /** ISO timestamp of the last edit — shown as "更新於…" for text pins. */
  updatedAt?: string
}

/**
 * Persisted as a single JSONB blob on `user_settings.focus_board` so
 * adding fields later needs no migration (same trick as `quickLinks`).
 */
export interface FocusSettings {
  /** Master switch for the whole block. */
  enabled: boolean
  /** The one headline focus shown at the very top. */
  global: FocusPin
  /** Per-workspace focus, keyed by workspace id. Missing ≡ `{ mode: 'off' }`. */
  byWorkspace: Record<string, FocusPin>
}

export const DEFAULT_FOCUS_PIN: FocusPin = { mode: 'auto' }

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  enabled: true,
  global: { mode: 'auto' },
  byWorkspace: {},
}

/** Why the auto-picker chose this task — drives the little status label. */
export type FocusReason = 'overdue' | 'today' | 'urgency' | 'manual' | null

export interface ResolvedFocus {
  /** `'global'` for the headline slot, `'workspace'` for a per-workspace row. */
  scope: 'global' | 'workspace'
  /** Present when `scope === 'workspace'`. */
  workspaceId?: string
  /** Where the displayed title came from. `'empty'` ⇒ render the empty state. */
  source: 'text' | 'task' | 'auto' | 'empty'
  /** The line to show in bold. Empty string when `source === 'empty'`. */
  title: string
  /** The underlying task when one exists — lets the row open the detail modal. */
  task: Task | null
  workspaceName?: string
  workspaceColor?: string
  categoryName?: string
  reason: FocusReason
  /** Whole days overdue (≥1) when `reason === 'overdue'`. */
  overdueDays?: number
  /** Up to `nextLimit` sibling tasks to list underneath. */
  nextTasks: Task[]
  /** True when a pinned task went missing / completed and we fell back to auto. */
  pinFellBack: boolean
}

/**
 * Tasks that may appear as a focus. Meetings and calendar-only tasks are
 * excluded — the block is about work to push forward, not about the day's
 * agenda (which the calendar already shows).
 */
function isFocusCandidate(task: Task): boolean {
  if (task.isCompleted || task.isArchived) return false
  if (task.showInTaskList === false) return false
  if (task.isMeeting) return false
  return true
}

/**
 * Ranking used by the auto-picker, in the order the user chose:
 * overdue (longest first) → scheduled today (earliest first) → urgency.
 * Returns a sortable tuple; lower sorts first.
 */
function rankOf(task: Task, today: string): [number, string, number] {
  const overdueOn = getTaskOverdueDate(task, today)
  if (overdueOn) {
    // Tier 0. Earlier overdue date ⇒ longer overdue ⇒ sorts first.
    return [0, overdueOn, -task.urgency]
  }
  if (task.scheduledDate === today) {
    // Tier 1. Earliest start time first; untimed tasks sort after timed ones.
    return [1, task.scheduledStartTime || '99:99', -task.urgency]
  }
  // Tier 2. Highest urgency first, then nearest due date, then manual order.
  return [2, String(10 - task.urgency).padStart(2, '0') + (task.dueDate || '9999-12-31'), task.sortOrder]
}

function compareByRank(a: Task, b: Task, today: string): number {
  const ra = rankOf(a, today)
  const rb = rankOf(b, today)
  if (ra[0] !== rb[0]) return ra[0] - rb[0]
  if (ra[1] !== rb[1]) return ra[1] < rb[1] ? -1 : 1
  return ra[2] - rb[2]
}

function reasonOf(task: Task, today: string): FocusReason {
  if (getTaskOverdueDate(task, today)) return 'overdue'
  if (task.scheduledDate === today) return 'today'
  return 'urgency'
}

function overdueDaysOf(task: Task, today: string): number | undefined {
  const overdueOn = getTaskOverdueDate(task, today)
  if (!overdueOn) return undefined
  const ms = new Date(today).getTime() - new Date(overdueOn).getTime()
  const days = Math.round(ms / 86_400_000)
  return days > 0 ? days : undefined
}

/**
 * Pick the most pressing task, optionally restricted to one workspace.
 * Returns null when there is nothing to do — the caller renders the
 * "今天很輕鬆" empty state rather than inventing work.
 */
export function pickAutoTask(
  workspaces: Workspace[],
  today: string,
  workspaceId?: string,
): Task | null {
  let best: Task | null = null
  forEachTask(workspaces, (task, _category, workspace) => {
    if (workspaceId && workspace.id !== workspaceId) return
    if (!isFocusCandidate(task)) return
    if (!best || compareByRank(task, best, today) < 0) best = task
  })
  return best
}

/**
 * The 1-2 follow-up lines shown under the headline (the "任務1 / 任務2"
 * in the sketch). Siblings from the same category, same ranking rules.
 */
function pickNextTasks(
  workspaces: Workspace[],
  focus: Task,
  today: string,
  limit: number,
): Task[] {
  const siblings: Task[] = []
  forEachTask(workspaces, (task, category) => {
    if (category.id !== focus.categoryId) return
    if (task.id === focus.id) return
    if (!isFocusCandidate(task)) return
    siblings.push(task)
  })
  siblings.sort((a, b) => compareByRank(a, b, today))
  return siblings.slice(0, limit)
}

function findTask(workspaces: Workspace[], id: string): Task | null {
  let found: Task | null = null
  forEachTask(workspaces, (task) => {
    if (task.id === id) found = task
  })
  return found
}

const EMPTY_FOCUS: Omit<ResolvedFocus, 'scope' | 'workspaceId'> = {
  source: 'empty',
  title: '',
  task: null,
  reason: null,
  nextTasks: [],
  pinFellBack: false,
}

/**
 * Turn a stored {@link FocusPin} into something renderable.
 *
 * Never throws and never returns stale data: a pinned task that was
 * completed, archived or deleted silently falls back to `auto`
 * (flagged via `pinFellBack` so the UI can hint "已完成，已換下一個").
 */
export function resolveFocus(
  pin: FocusPin | undefined,
  workspaces: Workspace[],
  options: {
    scope: 'global' | 'workspace'
    workspaceId?: string
    today?: string
    nextLimit?: number
  },
): ResolvedFocus {
  const { scope, workspaceId } = options
  const today = options.today ?? toDateString(new Date())
  const nextLimit = options.nextLimit ?? 2
  const base = { ...EMPTY_FOCUS, scope, workspaceId }

  const mode = pin?.mode ?? (scope === 'global' ? 'auto' : 'off')
  if (mode === 'off') return base

  // ── Free-text pin: show it verbatim, no task attached.
  if (mode === 'text') {
    const text = (pin?.text ?? '').trim()
    if (!text) return base
    const ws = workspaceId ? workspaces.find((w) => w.id === workspaceId) : undefined
    return {
      ...base,
      source: 'text',
      title: text,
      reason: 'manual',
      workspaceName: ws?.name,
      workspaceColor: ws?.color,
    }
  }

  // ── Task pin: honour it while the task is still live, else fall back.
  let pinFellBack = false
  let task: Task | null = null
  if (mode === 'task' && pin?.taskId) {
    const pinned = findTask(workspaces, pin.taskId)
    if (pinned && isFocusCandidate(pinned)) {
      task = pinned
    } else {
      pinFellBack = true
    }
  }

  if (!task) task = pickAutoTask(workspaces, today, workspaceId)
  if (!task) return { ...base, pinFellBack }

  const ws = workspaces.find((w) => w.id === task!.workspaceId)
  return {
    scope,
    workspaceId,
    source: mode === 'task' && !pinFellBack ? 'task' : 'auto',
    title: task.title,
    task,
    workspaceName: task.workspaceName || ws?.name,
    workspaceColor: task.workspaceColor || ws?.color,
    categoryName: task.categoryName,
    reason: mode === 'task' && !pinFellBack ? 'manual' : reasonOf(task, today),
    overdueDays: overdueDaysOf(task, today),
    nextTasks: pickNextTasks(workspaces, task, today, nextLimit),
    pinFellBack,
  }
}

/**
 * Resolve every workspace row for the second tier of the block.
 *
 * Ordering keeps the list short and meaningful on accounts with many
 * workspaces: hand-set focuses first (the user said these matter), then
 * `auto` workspaces that actually have something pressing. Workspaces
 * whose slot is `off` — the default — are skipped entirely.
 */
export function resolveWorkspaceFocuses(
  settings: FocusSettings,
  workspaces: Workspace[],
  today: string = toDateString(new Date()),
): ResolvedFocus[] {
  const manual: ResolvedFocus[] = []
  const auto: ResolvedFocus[] = []

  for (const ws of workspaces) {
    if (ws.isArchived) continue
    const pin = settings.byWorkspace?.[ws.id]
    if (!pin || pin.mode === 'off') continue
    const resolved = resolveFocus(pin, workspaces, {
      scope: 'workspace',
      workspaceId: ws.id,
      today,
      nextLimit: 0,
    })
    if (resolved.source === 'empty') continue
    resolved.workspaceName = resolved.workspaceName || ws.name
    resolved.workspaceColor = resolved.workspaceColor || ws.color
    if (pin.mode === 'auto') auto.push(resolved)
    else manual.push(resolved)
  }

  return [...manual, ...auto]
}

/**
 * Merge a partial blob read from the DB with defaults. Settings written
 * by an older build (or a row predating the migration) must not crash
 * the panel, so every field is defensively defaulted.
 */
export function normalizeFocusSettings(raw: unknown): FocusSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FOCUS_SETTINGS, byWorkspace: {} }
  const obj = raw as Partial<FocusSettings>
  const normalizePin = (pin: unknown): FocusPin => {
    if (!pin || typeof pin !== 'object') return { ...DEFAULT_FOCUS_PIN }
    const p = pin as Partial<FocusPin>
    const mode: FocusMode =
      p.mode === 'text' || p.mode === 'task' || p.mode === 'off' || p.mode === 'auto'
        ? p.mode
        : 'auto'
    return {
      mode,
      text: typeof p.text === 'string' ? p.text : undefined,
      taskId: typeof p.taskId === 'string' ? p.taskId : undefined,
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : undefined,
    }
  }
  const byWorkspace: Record<string, FocusPin> = {}
  if (obj.byWorkspace && typeof obj.byWorkspace === 'object') {
    for (const [id, pin] of Object.entries(obj.byWorkspace)) {
      byWorkspace[id] = normalizePin(pin)
    }
  }
  return {
    enabled: obj.enabled !== false,
    global: normalizePin(obj.global),
    byWorkspace,
  }
}
