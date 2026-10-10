// 設定 › 提醒設定 (user_settings.notifications, type NotificationSettings in lib/types.ts):
// the defaults, and ONE tolerant reader every consumer goes through.
//
// Why a deep merge: the blob is stored as JSON and older rows were written before some sections
// existed (quietHours, scheduling.planningReminderTime …). The old loader only fell back to the defaults when
// the whole blob was empty, so a blob that lacked one sub-object crashed the settings tab
// (`notifications.quietHours.enabled` on undefined). Now every sub-object, every field and every
// number is checked: anything missing or unusable falls back to the default for THAT field only.
//
// Pure — no React, no storage — so the loader (lib/supabase/mappers.ts), the settings tab, the bell
// (lib/notifications/task-reminders.ts) and the node tests all share the same definition.

import type { NotificationSettings } from '@/lib/types'
import { parseClockMinutes } from '@/lib/quiet-hours'

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
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
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v)
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)
/** A whole number inside [min, max]; anything that is not a finite number gives the default. */
const int = (v: unknown, d: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d
const clock = (v: unknown, d: string): string => (parseClockMinutes(v) === null ? d : (v as string).trim())

const OVERRIDE_PRIORITIES = ['high', 'medium', 'low', 'default'] as const

/**
 * Read a stored `notifications` blob (anything: undefined, a half-filled object, garbage) into a complete,
 * usable NotificationSettings. Unknown keys survive (a newer app version's fields are not thrown away on save).
 */
export function mergeNotificationSettings(raw: unknown): NotificationSettings {
  const D = DEFAULT_NOTIFICATION_SETTINGS
  const r: Rec = isRec(raw) ? raw : {}
  const sec = (key: string): Rec => (isRec(r[key]) ? (r[key] as Rec) : {})
  const overdue = sec('overdue')
  const dueSoon = sec('dueSoon')
  const stale = sec('staleTasks')
  const high = sec('highPriority')
  const sched = sec('scheduling')
  const quiet = sec('quietHours')
  const look = sec('appearance')

  const workspaceOverrides: NotificationSettings['workspaceOverrides'] = {}
  for (const [id, value] of Object.entries(sec('workspaceOverrides'))) {
    if (!isRec(value)) continue
    const priority = (OVERRIDE_PRIORITIES as readonly unknown[]).includes(value.overduePriority)
      ? (value.overduePriority as (typeof OVERRIDE_PRIORITIES)[number])
      : 'default'
    workspaceOverrides[id] = {
      ...value,
      enabled: bool(value.enabled, true),
      overduePriority: priority,
    }
  }

  return {
    ...r,
    enabled: bool(r.enabled, D.enabled),
    overdue: {
      ...overdue,
      enabled: bool(overdue.enabled, D.overdue.enabled),
      criticalDays: int(overdue.criticalDays, D.overdue.criticalDays, 1, 365),
      showInBell: bool(overdue.showInBell, D.overdue.showInBell),
      dailyDigest: bool(overdue.dailyDigest, D.overdue.dailyDigest),
    },
    dueSoon: {
      ...dueSoon,
      enabled: bool(dueSoon.enabled, D.dueSoon.enabled),
      daysBeforeDue: int(dueSoon.daysBeforeDue, D.dueSoon.daysBeforeDue, 1, 60),
      notifyOnDueDay: bool(dueSoon.notifyOnDueDay, D.dueSoon.notifyOnDueDay),
      notifyDayBefore: bool(dueSoon.notifyDayBefore, D.dueSoon.notifyDayBefore),
    },
    staleTasks: {
      ...stale,
      enabled: bool(stale.enabled, D.staleTasks.enabled),
      daysUntilStale: int(stale.daysUntilStale, D.staleTasks.daysUntilStale, 1, 365),
      includeUnscheduled: bool(stale.includeUnscheduled, D.staleTasks.includeUnscheduled),
      includeNoDueDate: bool(stale.includeNoDueDate, D.staleTasks.includeNoDueDate),
    },
    highPriority: {
      ...high,
      enabled: bool(high.enabled, D.highPriority.enabled),
      minUrgency: int(high.minUrgency, D.highPriority.minUrgency, 1, 10),
      alertWhenTooMany: bool(high.alertWhenTooMany, D.highPriority.alertWhenTooMany),
      maxBeforeAlert: int(high.maxBeforeAlert, D.highPriority.maxBeforeAlert, 1, 100),
    },
    scheduling: {
      ...sched,
      enabled: bool(sched.enabled, D.scheduling.enabled),
      remindUnscheduled: bool(sched.remindUnscheduled, D.scheduling.remindUnscheduled),
      percentThreshold: int(sched.percentThreshold, D.scheduling.percentThreshold, 1, 100),
      dailyPlanningReminder: bool(sched.dailyPlanningReminder, D.scheduling.dailyPlanningReminder),
      planningReminderTime: clock(sched.planningReminderTime, D.scheduling.planningReminderTime),
    },
    workspaceOverrides,
    quietHours: {
      ...quiet,
      enabled: bool(quiet.enabled, D.quietHours.enabled),
      startTime: clock(quiet.startTime, D.quietHours.startTime),
      endTime: clock(quiet.endTime, D.quietHours.endTime),
      allowUrgent: bool(quiet.allowUrgent, D.quietHours.allowUrgent),
    },
    appearance: {
      ...look,
      showBadgeCount: bool(look.showBadgeCount, D.appearance.showBadgeCount),
      groupByType: bool(look.groupByType, D.appearance.groupByType),
      autoCollapse: bool(look.autoCollapse, D.appearance.autoCollapse),
      maxVisible: int(look.maxVisible, D.appearance.maxVisible, 1, 100),
    },
  }
}
