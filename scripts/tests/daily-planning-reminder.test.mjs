// iOS 每日規劃提醒, driven through the REAL scheduler (lib/notifications/index.ts syncDailyPlanningReminder)
// against a fake Capacitor LocalNotifications plugin:
//   · one notification that REPEATS every day at the chosen time (local wall-clock, UNCalendarNotificationTrigger)
//   · changing the time replaces it; switching it off (or signing out) removes it
//   · fixed text with no numbers; its own id, clear of every other kind; the 64-notification budget still holds
// Run: node --test scripts/tests/daily-planning-reminder.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { installFakeLocalNotifications, installFakeLocalStorage, installReminderTestEnv } from './reminder-test-env.mjs'

installReminderTestEnv()
const plugin = installFakeLocalNotifications()
installFakeLocalStorage()

const N = await import('../../lib/notifications/index.ts')
const Budget = await import('../../lib/notifications/budget.ts')
const Meetings = await import('../../lib/meeting-reminder.ts')
const Widgets = await import('../../lib/widgets/reminders.ts')
const Plan = await import('../../lib/notifications/daily-planning.ts')
const { setLang } = await import('../../lib/i18n/index.ts')
setLang('zh-TW')

const MIN = 60_000
const pad = (n) => String(n).padStart(2, '0')
const dayStr = (offset) => {
  const d = new Date()
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}
const tree = (...tasks) => [{ id: 'w', name: '工作', color: '#abc', isArchived: false, categories: [{ id: 'c', name: '會議', isArchived: false, tasks }] }]
const oneOff = (id, offsetDays) => ({ id, title: `會議 ${id}`, isMeeting: true, isCompleted: false, scheduledDate: dayStr(offsetDays), scheduledStartTime: '09:00', scheduledEndTime: '23:59' })
const planning = () => plugin.pending.filter((n) => n.extra?.kind === 'planning')
const reset = () => { plugin.pending = []; plugin.permission = 'granted' }
const cfgOf = (enabled, time) => ({ enabled, ...Plan.planningReminderConfig({ scheduling: { dailyPlanningReminder: enabled, planningReminderTime: time } }) })

test('before the signed-in account is known nothing is scheduled or cancelled (cold start / offline)', async () => {
  reset()
  plugin.pending = [{ id: N.PLANNING_REMINDER_ID, title: 'x', body: 'y', extra: { kind: 'planning', accountId: 'acct-A' } }]
  await N.syncDailyPlanningReminder({ enabled: false, hour: 8, minute: 0 })
  assert.equal(planning().length, 1, 'a pending reminder from the last run survives a start that does not know the account yet')
  await N.syncDailyPlanningReminder({ enabled: true, hour: 8, minute: 0 })
  assert.equal(planning().length, 1)
})

test('on: exactly one notification, repeating daily at the chosen time, tagged with the account', async () => {
  reset()
  await N.setReminderAccount('acct-A')
  await N.syncDailyPlanningReminder(cfgOf(true, '08:00'))
  const [n, ...rest] = planning()
  assert.equal(rest.length, 0)
  assert.equal(n.id, N.PLANNING_REMINDER_ID)
  assert.deepEqual(n.schedule, { on: { hour: 8, minute: 0 }, repeats: true }, 'a calendar trigger without a date = every day at 08:00 local time')
  assert.equal(n.schedule.at, undefined, 'not a one-off date that would expire')
  assert.equal(n.extra.accountId, 'acct-A')
  assert.equal(n.extra.route, '/', 'tapping it opens the home screen')
  assert.equal(plugin.pending.length, 1)
})

test('fixed wording, no numbers (a pre-scheduled number would be stale by the time it fires)', async () => {
  reset()
  await N.setReminderAccount('acct-A')
  await N.syncDailyPlanningReminder(cfgOf(true, '21:30'))
  const [n] = planning()
  assert.equal(n.title, 'Huddle · 每日規劃')
  assert.equal(n.body, '花一分鐘看看待辦，把接下來的時間排一排。')
  assert.equal(/\d/.test(n.title + n.body), false)
  setLang('en')
  await N.syncDailyPlanningReminder(cfgOf(true, '21:30'))
  const en = planning()[0]
  assert.equal(en.title, 'Huddle · Daily planning')
  assert.equal(/[一-鿿]/.test(en.title + en.body), false, 'English wording has no Chinese left')
  setLang('zh-TW')
})

test('changing the time replaces the reminder at once; switching off removes it', async () => {
  reset()
  await N.setReminderAccount('acct-A')
  await N.syncDailyPlanningReminder(cfgOf(true, '08:00'))
  await N.syncDailyPlanningReminder(cfgOf(true, '09:45'))
  assert.equal(planning().length, 1, 'still one')
  assert.deepEqual(planning()[0].schedule.on, { hour: 9, minute: 45 })
  await N.syncDailyPlanningReminder(cfgOf(true, '23:59'))
  assert.deepEqual(planning()[0].schedule.on, { hour: 23, minute: 59 })
  await N.syncDailyPlanningReminder(cfgOf(false, '23:59'))
  assert.equal(planning().length, 0, 'switched off → cancelled')
  assert.equal(plugin.pending.length, 0)
})

test('no notification permission → nothing is scheduled (and nothing throws); granting it later works', async () => {
  reset()
  await N.setReminderAccount('acct-A')
  plugin.permission = 'denied'
  await N.syncDailyPlanningReminder(cfgOf(true, '08:00'))
  assert.equal(planning().length, 0)
  plugin.permission = 'granted'
  await N.syncDailyPlanningReminder(cfgOf(true, '08:00'))
  assert.equal(planning().length, 1)
})

test('signing out removes it; switching account drops the other account\'s; the next account schedules its own', async () => {
  reset()
  await N.setReminderAccount('acct-A')
  await N.syncDailyPlanningReminder(cfgOf(true, '08:00'))
  assert.equal(planning()[0].extra.accountId, 'acct-A')
  await N.setReminderAccount('acct-B')
  assert.equal(planning().length, 0, 'A\'s reminder is gone as soon as B is the owner')
  await N.syncDailyPlanningReminder(cfgOf(true, '07:15'))
  assert.equal(planning()[0].extra.accountId, 'acct-B')
  await N.setReminderAccount(null)
  assert.equal(planning().length, 0, 'signed out → removed')
  await N.syncDailyPlanningReminder(cfgOf(true, '07:15'))
  assert.equal(planning().length, 0, 'nobody signed in → nothing scheduled')
  assert.deepEqual(N.foreignReminderIds([{ id: 7, extra: { kind: 'planning', accountId: 'acct-A' } }], 'acct-B'), [7])
  assert.deepEqual(N.foreignReminderIds([{ id: 7, extra: { kind: 'planning', accountId: 'acct-B' } }], 'acct-B'), [])
})

test('first-time permission: ask FIRST, schedule only once granted (the sync from saved settings alone never asks, so it schedules nothing)', async () => {
  reset()
  await N.setReminderAccount('acct-A')
  plugin.permission = 'prompt'
  plugin.promptAnswer = 'granted'
  await N.syncDailyPlanningReminder(cfgOf(true, '08:00'))
  assert.equal(planning().length, 0, 'the old toggle: permission still undecided when the sync ran → nothing scheduled (and nothing re-ran it later)')
  assert.equal(plugin.permission, 'prompt', 'the sync never prompts')
  const granted = await N.enableDailyPlanningReminder({ hour: 8, minute: 30 })
  assert.equal(granted, true)
  assert.equal(plugin.permission, 'granted', 'the prompt was shown and allowed')
  assert.equal(planning().length, 1, 'allowed → the reminder is pending right away')
  assert.deepEqual(planning()[0].schedule, { on: { hour: 8, minute: 30 }, repeats: true })
  assert.equal(planning()[0].extra.accountId, 'acct-A')
})

test('first-time permission denied: nothing scheduled, the caller is told so (the switch stays off); an earlier grant skips the prompt', async () => {
  reset()
  await N.setReminderAccount('acct-A')
  plugin.permission = 'prompt'
  plugin.promptAnswer = 'denied'
  assert.equal(await N.enableDailyPlanningReminder({ hour: 8, minute: 0 }), false)
  assert.equal(planning().length, 0)
  assert.equal(plugin.permission, 'denied')
  plugin.permission = 'granted'
  assert.equal(await N.enableDailyPlanningReminder({ hour: 21, minute: 5 }), true)
  assert.deepEqual(planning()[0].schedule.on, { hour: 21, minute: 5 })
  plugin.promptAnswer = 'granted'
})

test('unsaved draft: closing the settings page re-syncs the SAVED settings (enabled=false) and removes what the draft scheduled', async () => {
  reset()
  await N.setReminderAccount('acct-A')
  assert.equal(await N.enableDailyPlanningReminder({ hour: 8, minute: 0 }), true)
  assert.equal(planning().length, 1)
  await N.syncDailyPlanningReminder(cfgOf(false, '08:00')) // what the hook runs when the modal closes without 儲存
  assert.equal(planning().length, 0)
})

test('the id is its own: clear of meeting, follow-up, focus and water ids, and below 2^31', () => {
  const id = N.PLANNING_REMINDER_ID
  assert.ok(Number.isInteger(id) && id < 2 ** 31 - 1)
  assert.ok(id > 2_000_000_000, 'above the meeting range (1..2e9)')
  assert.ok(id > 2_099_999_999, 'above the follow-up range (2_000_000_001..2_099_999_999)')
  assert.ok(id > 2_100_000_001 + 1 + Budget.MAX_WATER_REMINDERS, 'above the widget range (focus 2_100_000_001, water chain right after it)')
})

test('with every other kind at its maximum the total is still within iOS\'s 64 (one slot to spare)', async () => {
  reset()
  await N.setReminderAccount('acct-Z')
  const tasks = Array.from({ length: 100 }, (_, i) => oneOff(`m${i}`, i + 1))
  await N.syncMeetingReminders(Meetings.collectMeetings(tree(...tasks)), 10)
  await N.syncFollowupReminders(Array.from({ length: 30 }, (_, i) => ({ task_id: `f${i}`, title: `追 ${i}`, due_date: dayStr(i + 1), is_completed: false, counterpart: '王經理' })))
  await Widgets.clearWidgetReminders('acct-Z')
  await Widgets.enableWidgetReminders('acct-Z')
  const now = Date.now()
  await Widgets.syncWidgetReminders({
    accountId: 'acct-Z', pet: null,
    water: { enabled: true, nextAt: now + 30 * MIN, count: 0 },
    focus: { mode: 'pomodoro', state: 'running', phase: 'work', title: 'x', seconds: 1500, note: '', endAt: now + 25 * MIN },
  }, { waterIntervalMin: 60 })
  await N.syncDailyPlanningReminder(cfgOf(true, '08:00'))

  assert.equal(planning().length, Budget.MAX_DAILY_PLANNING_REMINDERS)
  assert.ok(plugin.pending.length <= 63, `pending ${plugin.pending.length} (limit 64, one kept spare)`)
  assert.equal(plugin.pending.length, Budget.MAX_MEETING_REMINDERS + Budget.MAX_FOLLOWUP_REMINDERS + Budget.MAX_FOCUS_REMINDERS + Budget.MAX_WATER_REMINDERS + Budget.MAX_DAILY_PLANNING_REMINDERS)
  assert.equal(new Set(plugin.pending.map((n) => n.id)).size, plugin.pending.length, 'no two notifications share an id (a clash would silently drop one)')
  // Re-syncing the other kinds does not touch it, and re-syncing it does not touch them.
  await N.syncMeetingReminders(Meetings.collectMeetings(tree(...tasks)), 10)
  await N.syncFollowupReminders([])
  assert.equal(planning().length, 1)
  await N.syncDailyPlanningReminder(cfgOf(false, '08:00'))
  assert.equal(plugin.pending.filter((n) => n.extra?.kind === 'meeting').length, Budget.MAX_MEETING_REMINDERS)
})
