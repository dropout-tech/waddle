// What the notification bell (components/notifications/notification-center.tsx) shows about the user's
// tasks, as pure functions: tasks + 設定 › 提醒設定 + "now" in → reminder items out. No React, no
// translated text (the component words each item), so every setting can be unit-tested
// (scripts/tests/task-reminders.test.mjs).
//
// Before this file the bell hard-coded 7 / 3 / 14 days, urgency 8, "5 or more" and "more than 50%",
// and only read the on/off switches — the numbers and most of the toggles on the settings page did nothing.
//
// What each setting does now:
//   overdue.enabled / showInBell   the 逾期 cards (showInBell off → no cards; the digest below is separate)
//   overdue.criticalDays           overdue by at least N days → "放了一陣子" (high), fewer → "剛過了預定日" (medium)
//   overdue.dailyDigest            one "今天的摘要" card on top: N overdue / M due today / K due tomorrow
//                                  (the two due parts follow dueSoon.enabled / notifyOnDueDay / notifyDayBefore)
//   dueSoon.daysBeforeDue          tasks due within N days (today included) are listed
//   dueSoon.notifyOnDueDay         on: tasks due today get their own high-priority card; off: they appear nowhere (as before)
//   dueSoon.notifyDayBefore        on: tasks due tomorrow get their own card;              off: they stay in the general list
//   staleTasks.enabled / daysUntilStale   no due date, not on the calendar, created at least N days ago
//   highPriority.*                 tasks with urgency ≥ minUrgency; more than maxBeforeAlert of them → one "急件有點多" card
//   scheduling.remindUnscheduled / percentThreshold   unscheduled share ≥ threshold (and at least 5 tasks) → one card
//   scheduling.dailyPlanningReminder / planningReminderTime   after that time of day, a planning card appears
//   workspaceOverrides[ws].enabled        that workspace's tasks never produce a reminder
//   workspaceOverrides[ws].overduePriority   priority of overdue cards that contain that workspace's tasks
//   appearance.groupByType / maxVisible   how the bell lists them (arrangeBell below)
// (appearance.showBadgeCount is the bell icon's badge and is handled by the component.)

import type { NotificationSettings, Task, Workspace } from '@/lib/types'
import { getTaskOverdueDate, isTaskOverdue } from '@/lib/task-utils'
import { toDateString } from '@/lib/calendar-utils'
import { mergeNotificationSettings } from '@/lib/notifications/settings'
import { planningReminderConfig, planningTimePassed } from '@/lib/notifications/daily-planning'

export type ReminderType = 'digest' | 'planning' | 'overdue' | 'due_soon' | 'stale' | 'insight' | 'reminder'
export type ReminderPriority = 'high' | 'medium' | 'low'
export type ReminderId =
  | 'daily-digest'
  | 'daily-planning'
  | 'critical-overdue'
  | 'recent-overdue'
  | 'due-today'
  | 'due-tomorrow'
  | 'due-soon'
  | 'stale-tasks'
  | 'too-many-urgent'
  | 'unscheduled-tasks'

export interface TaskReminderItem {
  id: ReminderId
  type: ReminderType
  priority: ReminderPriority
  /** Tasks the card lists (the component previews the first few). */
  tasks: Task[]
  /** The headline number of the card (tasks in it; for the unscheduled card all of them, not just the preview). */
  count: number
  /** Digest / planning: shown on top and only "unread" until the bell is opened that day. */
  daily: boolean
  /** Numbers the wording needs. */
  meta: {
    oldestDays?: number
    windowDays?: number
    staleDays?: number
    level?: number
    percent?: number
    majority?: boolean
    overdue?: number
    dueToday?: number
    dueTomorrow?: number
  }
}

/** A handful of unscheduled tasks is normal; the "most tasks are unscheduled" card needs at least this many. */
export const MIN_UNSCHEDULED_TO_NUDGE = 5

const DAY_MS = 86_400_000
const RANK: Record<ReminderPriority, number> = { low: 0, medium: 1, high: 2 }
const BY_RANK: ReminderPriority[] = ['low', 'medium', 'high']

/** "YYYY-MM-DD…" → whole days since the epoch (calendar arithmetic, no DST / timezone drift); NaN when unusable. */
function dayNumber(ymd: string | undefined | null): number {
  if (!ymd) return NaN
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS) : NaN
}

/** Open (not done, not archived) tasks of every live workspace / category — what the reminders look at. */
export function collectOpenTasks(workspaces: Workspace[] | undefined | null): Task[] {
  const tasks: Task[] = []
  for (const ws of workspaces ?? []) {
    if (ws.isArchived) continue
    for (const cat of ws.categories ?? []) {
      if (cat.isArchived) continue
      for (const task of cat.tasks ?? []) if (!task.isCompleted && !task.isArchived) tasks.push(task)
    }
  }
  return tasks
}

/**
 * The reminder items for `tasks` under `settings` (a stored blob — partial is fine) at `now`.
 * Order: daily items first (digest, planning), then overdue → due → stale → insights.
 */
export function computeTaskReminders(input: { tasks: Task[]; settings: unknown; now: Date }): TaskReminderItem[] {
  const cfg: NotificationSettings = mergeNotificationSettings(input.settings)
  if (!cfg.enabled) return []

  const todayStr = toDateString(input.now)
  const today = dayNumber(todayStr)
  const overrides = cfg.workspaceOverrides
  // A muted workspace never produces a reminder of any kind.
  const open = input.tasks.filter((t) => !t.isCompleted && !t.isArchived && overrides[t.workspaceId]?.enabled !== false)
  const cards: TaskReminderItem[] = []

  // ── overdue ──
  // Always computed: the digest needs it even when the overdue cards are off.
  const overdueAll = open.filter((t) => isTaskOverdue(t, todayStr))
  const overdueDays = (t: Task) => today - dayNumber(getTaskOverdueDate(t, todayStr))
  const overduePriority = (tasks: Task[], base: ReminderPriority): ReminderPriority => {
    // Each task takes its workspace's 逾期優先度 when one is set; the card is as urgent as its most urgent task.
    let best = -1
    for (const t of tasks) {
      const own = overrides[t.workspaceId]?.overduePriority
      best = Math.max(best, RANK[own && own !== 'default' ? own : base])
    }
    return BY_RANK[best]
  }
  if (cfg.overdue.enabled && cfg.overdue.showInBell && overdueAll.length > 0) {
    const critical = overdueAll.filter((t) => overdueDays(t) >= cfg.overdue.criticalDays)
    const recent = overdueAll.filter((t) => overdueDays(t) < cfg.overdue.criticalDays)
    if (critical.length > 0) {
      cards.push({
        id: 'critical-overdue',
        type: 'overdue',
        priority: overduePriority(critical, 'high'),
        tasks: critical,
        count: critical.length,
        daily: false,
        meta: { oldestDays: Math.max(...critical.map(overdueDays)) },
      })
    }
    if (recent.length > 0) {
      cards.push({
        id: 'recent-overdue',
        type: 'overdue',
        priority: overduePriority(recent, 'medium'),
        tasks: recent,
        count: recent.length,
        daily: false,
        meta: {},
      })
    }
  }

  // ── due soon ──
  const windowDays = cfg.dueSoon.daysBeforeDue
  const due = cfg.dueSoon.enabled
    ? open
        .map((task) => ({ task, days: dayNumber(task.dueDate) - today }))
        .filter(({ days }) => days >= 0 && days <= windowDays)
        .sort((a, b) => a.days - b.days)
    : []
  const dueToday = due.filter((d) => d.days === 0).map((d) => d.task)
  const dueTomorrow = due.filter((d) => d.days === 1).map((d) => d.task)
  const dueLater = due.filter((d) => d.days >= 2).map((d) => d.task)
  // 到期當天提醒 off: tasks due today are listed nowhere in the bell (what the old bell did) — not folded into the
  // general card. 到期前一天提醒 off: tomorrow's tasks just stay in the general card (the old bell never split them out).
  const general: Task[] = [...(cfg.dueSoon.notifyDayBefore ? [] : dueTomorrow), ...dueLater]
  if (cfg.dueSoon.notifyOnDueDay && dueToday.length > 0) {
    cards.push({ id: 'due-today', type: 'due_soon', priority: 'high', tasks: dueToday, count: dueToday.length, daily: false, meta: {} })
  }
  if (cfg.dueSoon.notifyDayBefore && dueTomorrow.length > 0) {
    cards.push({ id: 'due-tomorrow', type: 'due_soon', priority: 'medium', tasks: dueTomorrow, count: dueTomorrow.length, daily: false, meta: {} })
  }
  if (general.length > 0) {
    // Sorted by due date again: tomorrow's tasks may have been folded in.
    const sorted = [...general].sort((a, b) => dayNumber(a.dueDate) - dayNumber(b.dueDate))
    cards.push({ id: 'due-soon', type: 'due_soon', priority: 'low', tasks: sorted, count: sorted.length, daily: false, meta: { windowDays } })
  }

  // ── stale ──
  // "靜靜躺著的任務" = open, no due date, not on the calendar, created at least daysUntilStale days ago (the old
  // definition). A due date means it is not forgotten: past ones are the overdue cards, near ones the due cards.
  // (staleTasks.includeUnscheduled / includeNoDueDate are no longer used — see lib/types.ts.)
  if (cfg.staleTasks.enabled) {
    const stale = open
      .filter((t) => {
        if (t.scheduledDate || t.dueDate) return false
        const age = today - dayNumber(toDateString(new Date(t.createdAt)))
        return Number.isFinite(age) && age >= cfg.staleTasks.daysUntilStale
      })
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    if (stale.length > 0) {
      cards.push({
        id: 'stale-tasks',
        type: 'stale',
        priority: 'low',
        tasks: stale,
        count: stale.length,
        daily: false,
        meta: { staleDays: cfg.staleTasks.daysUntilStale },
      })
    }
  }

  // ── high priority ──
  if (cfg.highPriority.enabled && cfg.highPriority.alertWhenTooMany) {
    const urgent = open.filter((t) => t.urgency >= cfg.highPriority.minUrgency)
    if (urgent.length > cfg.highPriority.maxBeforeAlert) {
      cards.push({
        id: 'too-many-urgent',
        type: 'insight',
        priority: 'medium',
        tasks: urgent,
        count: urgent.length,
        daily: false,
        meta: { level: cfg.highPriority.minUrgency },
      })
    }
  }

  // ── unscheduled ──
  if (cfg.scheduling.enabled && cfg.scheduling.remindUnscheduled && open.length > 0) {
    const none = open.filter((t) => !t.scheduledDate && !t.dueDate)
    const percent = (none.length / open.length) * 100
    if (none.length >= MIN_UNSCHEDULED_TO_NUDGE && percent >= cfg.scheduling.percentThreshold) {
      cards.push({
        id: 'unscheduled-tasks',
        type: 'reminder',
        priority: 'low',
        tasks: none.slice(0, 5),
        count: none.length,
        daily: false,
        meta: { percent: Math.round(percent), majority: percent > 50 },
      })
    }
  }

  // ── daily items, pinned on top ──
  const pinned: TaskReminderItem[] = []
  if (cfg.overdue.enabled && cfg.overdue.dailyDigest) {
    const tomorrow = today + 1
    // The due-today / due-tomorrow parts follow the same switches as the cards they summarise.
    const todayCount = cfg.dueSoon.enabled && cfg.dueSoon.notifyOnDueDay ? open.filter((t) => dayNumber(t.dueDate) === today).length : 0
    const tomorrowCount = cfg.dueSoon.enabled && cfg.dueSoon.notifyDayBefore ? open.filter((t) => dayNumber(t.dueDate) === tomorrow).length : 0
    if (overdueAll.length + todayCount + tomorrowCount > 0) {
      pinned.push({
        id: 'daily-digest',
        type: 'digest',
        priority: 'medium',
        tasks: [],
        count: overdueAll.length + todayCount + tomorrowCount,
        daily: true,
        meta: { overdue: overdueAll.length, dueToday: todayCount, dueTomorrow: tomorrowCount },
      })
    }
  }
  const planning = planningReminderConfig(cfg)
  if (planning.enabled && planningTimePassed(input.now, planning)) {
    pinned.push({ id: 'daily-planning', type: 'planning', priority: 'medium', tasks: [], count: 1, daily: true, meta: {} })
  }

  return [...pinned, ...cards]
}

// ── how the bell lists them (設定 › 顯示設定) ──

export type BellGroup = 'today' | 'overdue' | 'due_soon' | 'stale' | 'suggest'
const GROUP_ORDER: BellGroup[] = ['today', 'overdue', 'due_soon', 'stale', 'suggest']

export function bellGroupOf(item: Pick<TaskReminderItem, 'type'>): BellGroup {
  switch (item.type) {
    case 'digest':
    case 'planning':
      return 'today'
    case 'overdue':
      return 'overdue'
    case 'due_soon':
      return 'due_soon'
    case 'stale':
      return 'stale'
    default:
      return 'suggest'
  }
}

export type BellRow = { kind: 'header'; group: BellGroup } | { kind: 'item'; item: TaskReminderItem }

/**
 * Order and cut the list for display.
 *   groupByType on   one section per kind (today · overdue · due soon · stale · suggestions), each with a header row
 *   groupByType off  one flat list, most urgent first
 *   maxVisible       at most that many cards; `hidden` says how many were left out (showAll lifts the cut)
 * The daily items (digest, planning) stay on top either way.
 */
export function arrangeBell(
  items: TaskReminderItem[],
  appearance: { groupByType: boolean; maxVisible: number },
  showAll = false,
): { rows: BellRow[]; total: number; hidden: number } {
  const pinned = items.filter((i) => i.daily)
  const rest = items.filter((i) => !i.daily)
  const ordered = appearance.groupByType
    ? [...pinned, ...[...rest].sort((a, b) => GROUP_ORDER.indexOf(bellGroupOf(a)) - GROUP_ORDER.indexOf(bellGroupOf(b)))]
    : [...pinned, ...[...rest].sort((a, b) => RANK[b.priority] - RANK[a.priority])]
  const shown = showAll ? ordered : ordered.slice(0, Math.max(1, appearance.maxVisible))

  const rows: BellRow[] = []
  let last: BellGroup | null = null
  for (const item of shown) {
    const group = bellGroupOf(item)
    if (appearance.groupByType && group !== last) rows.push({ kind: 'header', group })
    last = group
    rows.push({ kind: 'item', item })
  }
  return { rows, total: ordered.length, hidden: ordered.length - shown.length }
}
