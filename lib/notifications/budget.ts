// iOS keeps at most 64 pending local notifications and silently drops the rest
// (the soonest 64 survive — which could be the meeting reminders we care about most).
// Every kind that pre-schedules gets a fixed share here, and the meeting share is
// DERIVED from the others, so the total can never exceed the limit by construction
// (scripts/tests/native-reminder-budget.test.mjs drives the real schedulers to prove it).
//
//   focus     1   lib/widgets/reminders.ts — one 專注完成 / 休息結束 at the timer's end
//   follow-up 10  lib/notifications/index.ts — 追蹤提醒, 09:00 on the due day
//   water     12  lib/widgets/reminders.ts — chain of 喝水提醒 (12 h at the 60-min default)
//   meeting   40  everything left, minus one spare slot
//
// No Swift code schedules notifications, and no other TS file uses LocalNotifications.

export const IOS_PENDING_NOTIFICATION_LIMIT = 64
export const MAX_FOCUS_REMINDERS = 1
export const MAX_FOLLOWUP_REMINDERS = 10
export const MAX_WATER_REMINDERS = 12
const SPARE_SLOTS = 1
export const MAX_MEETING_REMINDERS =
  IOS_PENDING_NOTIFICATION_LIMIT - MAX_FOCUS_REMINDERS - MAX_FOLLOWUP_REMINDERS - MAX_WATER_REMINDERS - SPARE_SLOTS
