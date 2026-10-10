// iOS keeps at most 64 pending local notifications and silently drops the rest
// (the soonest 64 survive — which could be the meeting reminders we care about most).
// Every kind that pre-schedules gets a fixed share here, and the meeting share is
// DERIVED from the others, so the total can never exceed the limit by construction
// (scripts/tests/native-reminder-budget.test.mjs drives the real schedulers to prove it).
//
//   focus          1   lib/widgets/reminders.ts — one 專注完成 / 休息結束 at the timer's end
//   follow-up      10  lib/notifications/index.ts — 追蹤提醒, 09:00 on the due day
//   water          12  lib/widgets/reminders.ts — a chain of up to 12 喝水提醒, one per interval;
//                      how far ahead that reaches depends on the interval (60 min → about 12 hours,
//                      30 min → 6 hours, 120 min → 24 hours), and the quiet night is skipped
//   dailyPlanning  1   reserved for the repeating 每日規劃提醒 (one repeating request = one slot);
//                      not scheduled by any code yet — whoever adds it uses this constant
//   meeting        39  everything left, minus one spare slot
//
// No Swift code schedules notifications, and no other TS file uses LocalNotifications.

export const IOS_PENDING_NOTIFICATION_LIMIT = 64
export const MAX_FOCUS_REMINDERS = 1
export const MAX_FOLLOWUP_REMINDERS = 10
export const MAX_WATER_REMINDERS = 12
export const MAX_DAILY_PLANNING_REMINDERS = 1
const SPARE_SLOTS = 1
export const MAX_MEETING_REMINDERS =
  IOS_PENDING_NOTIFICATION_LIMIT -
  MAX_FOCUS_REMINDERS -
  MAX_FOLLOWUP_REMINDERS -
  MAX_WATER_REMINDERS -
  MAX_DAILY_PLANNING_REMINDERS -
  SPARE_SLOTS
