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
 * A system notification for "plan your day" only makes sense near the time the user picked: opening Huddle at 9 pm
 * must not say 「排一下今天」. So the web / Mac notification is only sent within this long after the set time.
 * (The bell card is not limited by it: it appears at the set time and stays until dismissed.)
 */
export const PLANNING_NOTIFY_WINDOW_MS = 4 * 60 * 60 * 1000

/**
 * The latest occurrence of the set time that is not in the future (today's, or yesterday's if today's has not come yet —
 * which is what makes a late-evening time like 23:00 still count after midnight), the "YYYY-MM-DD" of that occurrence
 * (the key stored once it fired), and whether `now` is still inside the notification window.
 */
export function planningFireWindow(
  now: Date,
  cfg: Pick<PlanningReminderConfig, 'hour' | 'minute'>,
): { start: Date; key: string; inWindow: boolean } {
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), cfg.hour, cfg.minute, 0, 0)
  if (start.getTime() > now.getTime()) start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, cfg.hour, cfg.minute, 0, 0)
  return { start, key: toDateString(start), inWindow: now.getTime() - start.getTime() < PLANNING_NOTIFY_WINDOW_MS }
}

/**
 * Web / Mac (the app is open): send the system notification once, the first time we look within
 * PLANNING_NOTIFY_WINDOW_MS after the set time — never twice for the same occurrence, and not at all when Huddle is
 * only opened later than that. `lastFiredDate` is the key stored the last time it fired.
 */
export function planningReminderDue(args: {
  now: Date
  cfg: Pick<PlanningReminderConfig, 'enabled' | 'hour' | 'minute'>
  lastFiredDate: string | null
}): boolean {
  if (!args.cfg.enabled) return false
  const w = planningFireWindow(args.now, args.cfg)
  return w.inWindow && args.lastFiredDate !== w.key
}

/** localStorage key (per account) holding the day the web / Mac reminder last fired. */
export const planningLastFiredKey = (userId: string | null | undefined): string =>
  `huddle.planning-reminder.last:${userId ?? 'anon'}`
