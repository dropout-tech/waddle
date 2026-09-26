import type { Task, Workspace } from './types'
import { toDateString } from './calendar-utils'
import { forEachTask, getTaskOverdueDate } from './task-utils'

// ─────────────────────────────────────────────────────────
// 重點 board (focus board) settings + resolution
//
// Persisted on `user_settings.focus_board`. The older pinned "當前重點"
// block (global / per-workspace pins) was removed from the UI on
// 2026-09-26; its fields (`enabled`, `global`, `byWorkspace`) are kept in
// the stored shape so existing rows round-trip untouched.
//
// This module is deliberately pure — no React, no Supabase.
// ─────────────────────────────────────────────────────────

/**
 * How a focus slot gets its content.
 * - `auto` — pick the most pressing task automatically.
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
 * One card on the 重點 board — a category the user wants to keep an eye
 * on, optionally with a hand-typed line describing where it stands
 * ("推進講師資源站").
 */
export interface FocusCard {
  categoryId: string
  hidden?: boolean
  status?: FocusPin
  remarks?: string
  taskSort?: 'manual' | 'dueDate' | 'urgency' | 'created'
  showCompleted?: boolean
  /** Free-text status shown under the category name. Optional. */
  note?: string
  /** Position on the board, ascending. */
  sortOrder: number
  /** Pinned cards sit above every tier and never collapse. */
  pinned?: boolean
}

/**
 * Persisted as a single JSONB blob on `user_settings.focus_board` so
 * adding fields later needs no migration (same trick as `quickLinks`).
 */
export interface FocusSettings {
  /** Legacy master switch for the removed 當前重點 block (kept for round-trip). */
  enabled: boolean
  /** The one headline focus shown at the very top. */
  global: FocusPin
  /** Per-workspace focus, keyed by workspace id. Missing ≡ `{ mode: 'off' }`. */
  byWorkspace: Record<string, FocusPin>
  /**
   * Cards on the 重點 board, in display order. `undefined` means the user
   * has never curated it — {@link resolveFocusBoard} then falls back to
   * {@link defaultCards} so the page isn't blank on first visit. An empty
   * array is a real choice ("show nothing") and is honoured as such.
   */
  cards?: FocusCard[]
}

export const DEFAULT_FOCUS_PIN: FocusPin = { mode: 'auto' }

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  enabled: true,
  global: { mode: 'auto' },
  byWorkspace: {},
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
  let cards: FocusCard[] | undefined
  if (Array.isArray(obj.cards)) {
    cards = obj.cards
      .filter((c): c is FocusCard => !!c && typeof (c as FocusCard).categoryId === 'string')
      .map((c, i) => ({
        categoryId: c.categoryId,
        hidden: c.hidden === true,
        status: c.status ? normalizePin(c.status) : undefined,
        remarks: typeof c.remarks === 'string' ? c.remarks : undefined,
        taskSort: ['manual', 'dueDate', 'urgency', 'created'].includes(c.taskSort ?? '') ? c.taskSort : 'manual',
        showCompleted: c.showCompleted === true,
        note: typeof c.note === 'string' && c.note.trim() ? c.note : undefined,
        sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : i,
        pinned: c.pinned === true,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }

  return {
    enabled: obj.enabled !== false,
    global: normalizePin(obj.global),
    byWorkspace,
    cards,
  }
}

// ─────────────────────────────────────────────────────────
// The 重點 board — one card per category, grouped by workspace.
//
// This is the sketch the user drew at the start: workspace headings,
// each with a few cards, each card carrying its own next actions.
// ─────────────────────────────────────────────────────────

/**
 * Days without any activity before a category counts as stalled.
 *
 * "Activity" is the newest `updatedAt` across the category's tasks,
 * completed ones included — ticking something off is a sign of life.
 */
export const STALE_AFTER_DAYS = 14

/**
 * Which band a card falls into. The board renders these in order and only
 * collapses `other`, so nothing that needs a human ever hides itself.
 *
 * `stalled` exists as its own band rather than a badge for a specific
 * reason: a category nobody has touched in two weeks usually has no
 * overdue date either (nothing was ever scheduled), so a badge would end
 * up inside the collapsed bucket — invisible exactly when it matters.
 */
export type FocusTier = 'pinned' | 'attention' | 'stalled' | 'other'

export interface ResolvedCard {
  categoryId: string
  categoryName: string
  workspaceId: string
  workspaceName: string
  workspaceColor: string
  /** Hand-typed status line, when the user set one. */
  note?: string
  /** Top-ranked incomplete tasks, capped by `tasksPerCard`. */
  tasks: Task[]
  /** Incomplete tasks beyond the ones listed — drives "還有 N 個". */
  remainingCount: number
  /** How many of this category's tasks are overdue. */
  overdueCount: number
  /** Total incomplete tasks, shown in the compact list. */
  totalCount: number
  tier: FocusTier
  pinned: boolean
  /** Whole days since the last activity. `undefined` when unknown. */
  quietDays?: number
}

export interface ResolvedBoardGroup {
  workspaceId: string
  workspaceName: string
  workspaceColor: string
  cards: ResolvedCard[]
}

export interface ResolvedTier {
  tier: FocusTier
  cards: ResolvedCard[]
}

/** Every category that currently has something to do, best-ranked first. */
function rankedCategories(
  workspaces: Workspace[],
  today: string,
): Array<{ workspaceId: string; categoryId: string; best: Task }> {
  const byCategory = new Map<string, { workspaceId: string; categoryId: string; best: Task }>()
  forEachTask(workspaces, (task, category, workspace) => {
    if (!isFocusCandidate(task)) return
    const found = byCategory.get(category.id)
    if (!found) {
      byCategory.set(category.id, { workspaceId: workspace.id, categoryId: category.id, best: task })
    } else if (compareByRank(task, found.best, today) < 0) {
      found.best = task
    }
  })
  return [...byCategory.values()].sort((a, b) => compareByRank(a.best, b.best, today))
}

/**
 * What the board shows before the user has curated it: **every** category
 * that currently has something to do, most pressing first.
 *
 * This deliberately isn't capped. The user's ask was "每個任務的大項目都有"
 * — the board is the one place that answers *where does each line of work
 * stand*, and a card missing because it ranked 7th makes it answer that
 * question wrongly. Trimming is what the editor is for; `limit` stays
 * available for callers that need a preview.
 */
export function defaultCards(
  workspaces: Workspace[],
  today: string = toDateString(new Date()),
  limit = Number.POSITIVE_INFINITY,
): FocusCard[] {
  return rankedCategories(workspaces, today)
    .slice(0, limit)
    .map((entry, i) => ({ categoryId: entry.categoryId, sortOrder: i }))
}

/** Whole days between an ISO timestamp and `today`. Negative clamps to 0. */
function daysSince(iso: string | undefined, today: string): number | undefined {
  if (!iso) return undefined
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return undefined
  const days = Math.floor((new Date(`${today}T23:59:59`).getTime() - then) / 86_400_000)
  return days > 0 ? days : 0
}

/**
 * Resolve the board into tiers, in the order they should be rendered:
 * pinned → attention → stalled → other. Empty tiers are omitted.
 *
 * Cards pointing at a deleted or archived category are dropped silently —
 * curation shouldn't break because a category went away.
 *
 * Pinned cards keep the user's own `sortOrder`; every other tier sorts by
 * how pressing its best task is, so the top of each band is the thing
 * worth looking at first.
 */
export function resolveFocusBoard(
  settings: FocusSettings,
  workspaces: Workspace[],
  options: { today?: string; tasksPerCard?: number; staleAfterDays?: number } = {},
): ResolvedTier[] {
  const today = options.today ?? toDateString(new Date())
  const tasksPerCard = options.tasksPerCard ?? 3
  const staleAfter = options.staleAfterDays ?? STALE_AFTER_DAYS
  const cards = (settings.cards ?? defaultCards(workspaces, today)).filter((card) => !card.hidden)

  // Index every live category once so card lookup stays O(1).
  const index = new Map<
    string,
    { workspace: Workspace; categoryName: string; tasks: Task[]; lastActivity?: string }
  >()
  for (const ws of workspaces) {
    if (ws.isArchived) continue
    for (const cat of ws.categories) {
      if (cat.isArchived) continue
      // Activity looks at every live task, completed included — ticking
      // something off is a sign of life, and only counting open tasks
      // would mark a category "stalled" the moment it goes well.
      let lastActivity: string | undefined
      for (const task of cat.tasks) {
        if (task.isArchived) continue
        const stamp = task.updatedAt || task.createdAt
        if (stamp && (!lastActivity || stamp > lastActivity)) lastActivity = stamp
      }
      index.set(cat.id, {
        workspace: ws,
        categoryName: cat.name,
        tasks: cat.tasks.filter(isFocusCandidate).sort((a, b) => compareByRank(a, b, today)),
        lastActivity,
      })
    }
  }

  const resolved: ResolvedCard[] = []
  for (const card of [...cards].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const entry = index.get(card.categoryId)
    if (!entry) continue
    const { workspace, categoryName, tasks, lastActivity } = entry
    const overdueCount = tasks.filter((t) => !!getTaskOverdueDate(t, today)).length
    const dueToday = tasks.some((t) => t.scheduledDate === today || t.dueDate === today)
    const quietDays = daysSince(lastActivity, today)
    const pinned = card.pinned === true

    let tier: FocusTier
    if (pinned) tier = 'pinned'
    else if (overdueCount > 0 || dueToday) tier = 'attention'
    else if (quietDays !== undefined && quietDays >= staleAfter) tier = 'stalled'
    else tier = 'other'

    resolved.push({
      categoryId: card.categoryId,
      categoryName,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceColor: workspace.color,
      note: card.note,
      tasks: tasks.slice(0, tasksPerCard),
      remainingCount: Math.max(0, tasks.length - tasksPerCard),
      overdueCount,
      totalCount: tasks.length,
      tier,
      pinned,
      quietDays,
    })
  }

  const cardOrder = new Map(cards.map((c, i) => [c.categoryId, c.sortOrder ?? i]))
  const byPressure = (a: ResolvedCard, b: ResolvedCard) => {
    const ta = a.tasks[0]
    const tb = b.tasks[0]
    if (ta && tb) {
      const cmp = compareByRank(ta, tb, today)
      if (cmp !== 0) return cmp
    } else if (ta !== tb) {
      return ta ? -1 : 1
    }
    return (cardOrder.get(a.categoryId) ?? 0) - (cardOrder.get(b.categoryId) ?? 0)
  }

  const order: FocusTier[] = ['pinned', 'attention', 'stalled', 'other']
  return order
    .map((tier) => {
      const inTier = resolved.filter((c) => c.tier === tier)
      // Pinned is the user's own arrangement; don't second-guess it.
      if (tier !== 'pinned') inTier.sort(byPressure)
      else inTier.sort((a, b) => (cardOrder.get(a.categoryId) ?? 0) - (cardOrder.get(b.categoryId) ?? 0))
      return { tier, cards: inTier }
    })
    .filter((t) => t.cards.length > 0)
}

/**
 * Group cards under workspace headings. The board uses this for the
 * `other` band — once it's expanded there can be dozens of cards, and
 * workspace headings make that browsable. The urgent bands stay flat:
 * they're short, and there ordering by pressure beats tidiness.
 */
export function groupCardsByWorkspace(
  cards: ResolvedCard[],
  workspaces: Workspace[],
): ResolvedBoardGroup[] {
  const groups = new Map<string, ResolvedBoardGroup>()
  for (const card of cards) {
    let group = groups.get(card.workspaceId)
    if (!group) {
      group = {
        workspaceId: card.workspaceId,
        workspaceName: card.workspaceName,
        workspaceColor: card.workspaceColor,
        cards: [],
      }
      groups.set(card.workspaceId, group)
    }
    group.cards.push(card)
  }
  // Follow the user's own workspace ordering, so headings read the same
  // as everywhere else in the app.
  const order = new Map(workspaces.map((w, i) => [w.id, i]))
  return [...groups.values()].sort(
    (a, b) => (order.get(a.workspaceId) ?? 0) - (order.get(b.workspaceId) ?? 0),
  )
}

/**
 * Free-text filter across everything visible on a card: category, the
 * hand-typed note, the workspace, and the task titles. Matching a task
 * title keeps the card — you usually remember the task, not the bucket
 * it lives in.
 */
export function filterCards(cards: ResolvedCard[], query: string): ResolvedCard[] {
  const q = query.trim().toLowerCase()
  if (!q) return cards
  return cards.filter((card) => {
    const haystack = [
      card.categoryName,
      card.note ?? '',
      card.workspaceName,
      ...card.tasks.map((t) => t.title),
    ]
    return haystack.some((s) => s.toLowerCase().includes(q))
  })
}
