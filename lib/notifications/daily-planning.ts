// 每日規劃提醒 (設定 › 提醒設定 › 排程提醒): pure rules shared by the iOS scheduler
// (lib/notifications/index.ts), the web / Mac poll (hooks/use-daily-planning-reminder.ts) and the bell
// (lib/notifications/task-reminders.ts).
//
// It is the user's own alarm at a time THEY picked, so 勿擾時段 does not apply to it (unlike the water
// reminder) — nothing here reads quiet hours.

import { mergeNotificationSettings } from '@/lib/notifications/settings'
import { parseClockMinutes } from '@/lib/quiet-hours'
import { toDateString } from '@/lib/calendar-utils'

export interface PlanningReminderConfig {
  /** Master switch ∧ the scheduling section ∧ the 每日規劃提醒 switch. */
  enabled: boolean
  /** "HH:mm", always a valid clock time (a broken value falls back to 08:00). */
  time: string
  hour: number
  minute: number
}

/** Read the planning reminder out of a stored (possibly partial) notifications blob. */
export function planningReminderConfig(raw: unknown): PlanningReminderConfig {
  const s = mergeNotificationSettings(raw)
  const minutes = parseClockMinutes(s.scheduling.planningReminderTime) ?? 8 * 60
  return {
    enabled: s.enabled && s.scheduling.enabled && s.scheduling.dailyPlanningReminder,
    time: s.scheduling.planningReminderTime,
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
  }
}

/** Has today's reminder time passed? (local clock) */
export function planningTimePassed(now: Date, cfg: Pick<PlanningReminderConfig, 'hour' | 'minute'>): boolean {
  return now.getHours() * 60 + now.getMinutes() >= cfg.hour * 60 + cfg.minute
}

/**
 * Web / Mac (the app is open): fire once, the first time we look after today's reminder time — and never
 * twice on the same local day. `lastFiredDate` is the "YYYY-MM-DD" stored the last time it fired.
 */
export function planningReminderDue(args: {
  now: Date
  cfg: Pick<PlanningReminderConfig, 'enabled' | 'hour' | 'minute'>
  lastFiredDate: string | null
}): boolean {
  if (!args.cfg.enabled) return false
  if (args.lastFiredDate === toDateString(args.now)) return false
  return planningTimePassed(args.now, args.cfg)
}

/** localStorage key (per account) holding the day the web / Mac reminder last fired. */
export const planningLastFiredKey = (userId: string | null | undefined): string =>
  `huddle.planning-reminder.last:${userId ?? 'anon'}`
