// iOS background reminders, driven through the REAL schedulers against a fake Capacitor
// LocalNotifications plugin (lib/notifications/index.ts, lib/widgets/reminders.ts):
//   · repeating meetings: one notification per occurrence, stable ids
//   · 喝水提醒 is a chain (not a single note) that skips the night / 勿擾時段
//   · all kinds together never exceed iOS's 64 pending notifications
//   · signing out / switching account removes the previous account's meeting + follow-up notes
//   · 勿擾時段 applies to meetings only when 允許緊急通知 is off
// Run: node --test scripts/tests/native-reminder-budget.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { installFakeLocalNotifications, installFakeLocalStorage, installReminderTestEnv } from './reminder-test-env.mjs'

installReminderTestEnv()
const plugin = installFakeLocalNotifications()
installFakeLocalStorage()

const N = await import('../../lib/notifications/index.ts')
const Budget = await import('../../lib/notifications/budget.ts')
const Meetings = await import('../../lib/meeting-reminder.ts')
const Quiet = await import('../../lib/quiet-hours.ts')
const Water = await import('../../lib/water-reminder.ts')
const Widgets = await import('../../lib/widgets/reminders.ts')
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
const oneOff = (id, offsetDays, start = '09:00') => ({ id, title: `會議 ${id}`, isMeeting: true, isCompleted: false, scheduledDate: dayStr(offsetDays), scheduledStartTime: start, scheduledEndTime: '23:59' })
const kind = (k) => plugin.pending.filter((n) => n.extra?.kind === k)
const reset = () => { plugin.pending = []; plugin.permission = 'granted' }

test('budget constants: every kind\'s share adds up to at most the iOS limit of 64', () => {
  const total =
    Budget.MAX_MEETING_REMINDERS + Budget.MAX_FOLLOWUP_REMINDERS + Budget.MAX_FOCUS_REMINDERS + Budget.MAX_WATER_REMINDERS + Budget.MAX_DAILY_PLANNING_REMINDERS
  assert.equal(Budget.IOS_PENDING_NOTIFICATION_LIMIT, 64)
  assert.ok(total <= 63, `total ${total} (one slot is kept spare)`)
  assert.equal(Budget.MAX_DAILY_PLANNING_REMINDERS, 1, 'a slot is reserved for the upcoming 每日規劃提醒')
  assert.equal(Budget.MAX_MEETING_REMINDERS, 39, 'meetings were 48; lowered for the water chain, and once more for the reserved daily-planning slot')
})

test('weekly meeting: one notification per upcoming occurrence, each with its own stable id (old code: one, for the first week only)', async () => {
  reset()
  await N.setReminderAccount('acct-A')
  const weekly = {
    id: 'weekly', title: '週會', isMeeting: true, isCompleted: false,
    scheduledDate: dayStr(-28), scheduledStartTime: '23:30', scheduledEndTime: '23:59',
    isRecurring: true, recurrence: { type: 'weekly', interval: 1 },
  }
  const refs = Meetings.collectMeetings(tree(weekly), { days: 15 })
  const expected = refs.filter((m) => Meetings.meetingStartAsDate(m).getTime() - 10 * MIN > Date.now())
  assert.ok(expected.length >= 2, `expected ≥2 upcoming occurrences, got ${expected.length}`)

  await N.syncMeetingReminders(refs, 10)
  const ids1 = kind('meeting').map((n) => n.id).sort((a, b) => a - b)
  assert.equal(ids1.length, expected.length)
  assert.equal(new Set(ids1).size, ids1.length, 'ids are distinct per occurrence')

  await N.syncMeetingReminders(Meetings.collectMeetings(tree(weekly), { days: 15 }), 10)
  assert.deepEqual(kind('meeting').map((n) => n.id).sort((a, b) => a - b), ids1, 'ids are stable across re-syncs')

  // Each notification fires `lead` minutes before ITS occurrence.
  for (const m of expected) {
    const note = kind('meeting').find((n) => n.body.includes(m.scheduledStartTime) && new Date(n.schedule.at).getTime() === Meetings.meetingStartAsDate(m).getTime() - 10 * MIN)
    assert.ok(note, `notification for ${m.scheduledDate}`)
  }
})

test('all kinds together stay within 64 pending notifications, even with far more reminders than room', async () => {
  reset()
  await N.setReminderAccount('acct-B')
  const tasks = Array.from({ length: 100 }, (_, i) => oneOff(`m${i}`, i + 1))
  await N.syncMeetingReminders(Meetings.collectMeetings(tree(...tasks)), 10)
  const followups = Array.from({ length: 30 }, (_, i) => ({ task_id: `f${i}`, title: `追 ${i}`, due_date: dayStr(i + 1), is_completed: false, counterpart: '王經理' }))
  await N.syncFollowupReminders(followups)
  // Widget kind: a running pomodoro (focus note) + water chain.
  await Widgets.clearWidgetReminders('acct-B')
  await Widgets.enableWidgetReminders('acct-B')
  const now = Date.now()
  await Widgets.syncWidgetReminders({
    accountId: 'acct-B', pet: null,
    water: { enabled: true, nextAt: now + 30 * MIN, count: 0 },
    focus: { mode: 'pomodoro', state: 'running', phase: 'work', title: 'x', seconds: 1500, note: '', endAt: now + 25 * MIN },
  }, { waterIntervalMin: 60 })

  assert.equal(kind('meeting').length, Budget.MAX_MEETING_REMINDERS)
  assert.equal(kind('followup').length, Budget.MAX_FOLLOWUP_REMINDERS)
  assert.equal(kind('huddle-widget').length, Budget.MAX_FOCUS_REMINDERS + Budget.MAX_WATER_REMINDERS)
  assert.ok(plugin.pending.length <= 64, `pending ${plugin.pending.length}`)
  // Everything that exists today plus the reserved daily-planning slot still fits.
  assert.ok(plugin.pending.length + Budget.MAX_DAILY_PLANNING_REMINDERS <= 64, 'room left for the repeating daily-planning reminder')
  assert.equal(new Set(plugin.pending.map((n) => n.id)).size, plugin.pending.length, 'no two notifications share an id (a clash would silently drop one)')
  // The soonest 40 meetings are the ones kept.
  const fireTimes = kind('meeting').map((n) => new Date(n.schedule.at).getTime())
  assert.ok(fireTimes.every((t) => t < Meetings.meetingStartAsDate(oneOff('x', 41)).getTime()), 'later meetings were the ones left out')
})

test('water: a chain of reminders (old code: one), spaced by the interval, none inside the night', async () => {
  reset()
  await N.setReminderAccount('acct-C')
  await Widgets.clearWidgetReminders('acct-C')
  await Widgets.enableWidgetReminders('acct-C')
  const now = Date.now()
  const snap = (nextAt, extra = {}) => ({
    accountId: 'acct-C', pet: null,
    water: { enabled: true, nextAt, count: 0 },
    focus: { mode: 'pomodoro', state: 'idle', title: 'x', seconds: 0, note: '', endAt: null },
    ...extra,
  })
  await Widgets.syncWidgetReminders(snap(now + 40 * MIN), { waterIntervalMin: 60 })
  let water = kind('huddle-widget').filter((n) => n.extra.destination === 'water').sort((a, b) => new Date(a.schedule.at) - new Date(b.schedule.at))
  assert.equal(water.length, Budget.MAX_WATER_REMINDERS)
  const times = water.map((n) => new Date(n.schedule.at).getTime())
  // (If "in 40 minutes" happens to be night, the first one waits for morning — the test must not depend on the hour it runs.)
  assert.equal(times[0], Quiet.deferOutOfQuietWindow(now + 40 * MIN, Quiet.WATER_NIGHT_WINDOW))
  for (const t of times) assert.equal(Quiet.isInQuietWindow(t, Quiet.WATER_NIGHT_WINDOW), false, `${new Date(t)} must not be inside 22:00–08:00`)
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 60 * MIN, 'at least one interval apart')

  // 喝了: the app publishes a later nextAt → the chain moves with it.
  await Widgets.syncWidgetReminders(snap(now + 100 * MIN), { waterIntervalMin: 60 })
  water = kind('huddle-widget').filter((n) => n.extra.destination === 'water').sort((a, b) => new Date(a.schedule.at) - new Date(b.schedule.at))
  assert.equal(water.length, Budget.MAX_WATER_REMINDERS)
  assert.equal(new Date(water[0].schedule.at).getTime(), Quiet.deferOutOfQuietWindow(now + 100 * MIN, Quiet.WATER_NIGHT_WINDOW))
})

test('water: the user\'s 勿擾時段 is added to the built-in night; switching the reminder off clears the chain', async () => {
  reset()
  await N.setReminderAccount('acct-D')
  await Widgets.clearWidgetReminders('acct-D')
  await Widgets.enableWidgetReminders('acct-D')
  const now = Date.now()
  const quietHours = { enabled: true, startTime: '12:00', endTime: '18:00', allowUrgent: true }
  const snap = (enabled, nextAt) => ({
    accountId: 'acct-D', pet: null,
    water: { enabled, nextAt, count: 0 },
    focus: { mode: 'pomodoro', state: 'idle', title: 'x', seconds: 0, note: '', endAt: null },
  })
  await Widgets.syncWidgetReminders(snap(true, now + 5 * MIN), { waterIntervalMin: 30, quietHours })
  const water = kind('huddle-widget').filter((n) => n.extra.destination === 'water')
  assert.equal(water.length, Budget.MAX_WATER_REMINDERS)
  const mine = Quiet.waterQuietWindows(Quiet.resolveQuietHours(quietHours)) // night ∪ 12:00–18:00
  for (const n of water) {
    const t = new Date(n.schedule.at).getTime()
    assert.equal(Quiet.isInQuietWindow(t, mine), false)
    const h = new Date(t).getHours()
    assert.ok(h >= 8 && h < 12 || h >= 18 && h < 22, `${new Date(t)} must be in neither the custom window nor the night`)
  }
  await Widgets.syncWidgetReminders(snap(false, now + 5 * MIN), { waterIntervalMin: 30, quietHours })
  assert.equal(kind('huddle-widget').filter((n) => n.extra.destination === 'water').length, 0)
})

test('water: a running pomodoro holds the background reminder until just after it ends', async () => {
  reset()
  await N.setReminderAccount('acct-E')
  await Widgets.clearWidgetReminders('acct-E')
  await Widgets.enableWidgetReminders('acct-E')
  const now = Date.now()
  const focusEnd = now + 25 * MIN
  await Widgets.syncWidgetReminders({
    accountId: 'acct-E', pet: null,
    water: { enabled: true, nextAt: now + 10 * MIN, count: 0 },
    focus: { mode: 'pomodoro', state: 'running', phase: 'work', title: 'x', seconds: 1500, note: '', endAt: focusEnd },
  }, { waterIntervalMin: 60 })
  const first = Math.min(...kind('huddle-widget').filter((n) => n.extra.destination === 'water').map((n) => new Date(n.schedule.at).getTime()))
  assert.equal(first, Quiet.deferOutOfQuietWindow(focusEnd + Water.WATER_AFTER_FOCUS_DELAY_MS, Quiet.WATER_NIGHT_WINDOW))
  assert.ok(first > focusEnd, 'never during the focus stretch')
  // A BREAK running does not hold it back.
  await Widgets.syncWidgetReminders({
    accountId: 'acct-E', pet: null,
    water: { enabled: true, nextAt: now + 10 * MIN, count: 0 },
    focus: { mode: 'pomodoro', state: 'running', phase: 'break', title: 'x', seconds: 300, note: '', endAt: now + 5 * MIN },
  }, { waterIntervalMin: 60 })
  const during = Math.min(...kind('huddle-widget').filter((n) => n.extra.destination === 'water').map((n) => new Date(n.schedule.at).getTime()))
  assert.equal(during, Quiet.deferOutOfQuietWindow(now + 10 * MIN, Quiet.WATER_NIGHT_WINDOW))
})

test('stopwatch focus has no end time: while it runs the water chain is NOT scheduled (and a pending one is cancelled); pause / stop brings it back', async () => {
  reset()
  await N.setReminderAccount('acct-S')
  await Widgets.clearWidgetReminders('acct-S')
  await Widgets.enableWidgetReminders('acct-S')
  const now = Date.now()
  const water = () => kind('huddle-widget').filter((n) => n.extra.destination === 'water').length
  const snap = (focus) => ({
    accountId: 'acct-S', pet: null,
    water: { enabled: true, nextAt: now + 30 * MIN, count: 0 },
    focus: { mode: 'stopwatch', state: 'idle', phase: undefined, title: 'x', seconds: 0, note: '', endAt: null, ...focus },
  })
  const sync = (focus) => Widgets.syncWidgetReminders(snap(focus), { waterIntervalMin: 60 })

  await sync({})
  assert.equal(water(), Budget.MAX_WATER_REMINDERS, 'idle: chain scheduled')
  await sync({ state: 'running', phase: 'work', seconds: 12 })
  assert.equal(water(), 0, 'stopwatch running: the chain is cancelled and not re-added (old code kept all 12)')
  assert.equal(kind('huddle-widget').length, 0, 'a stopwatch has no end-of-focus note either')
  await sync({ state: 'running', phase: 'work', seconds: 300 })
  assert.equal(water(), 0, 'still running a few minutes later (the ticking seconds are not part of the signature)')
  await sync({ state: 'paused', phase: 'work', seconds: 300 })
  assert.equal(water(), Budget.MAX_WATER_REMINDERS, 'paused: chain back')
  await sync({ state: 'running', phase: 'work', seconds: 301 })
  assert.equal(water(), 0, 'resumed: cancelled again')
  await sync({ state: 'idle' })
  assert.equal(water(), Budget.MAX_WATER_REMINDERS, 'stopped: chain back')
})

test('pomodoro focus is unchanged: the chain waits until the focus ends instead of disappearing', async () => {
  reset()
  await N.setReminderAccount('acct-P')
  await Widgets.clearWidgetReminders('acct-P')
  await Widgets.enableWidgetReminders('acct-P')
  const now = Date.now()
  await Widgets.syncWidgetReminders({
    accountId: 'acct-P', pet: null,
    water: { enabled: true, nextAt: now + 10 * MIN, count: 0 },
    focus: { mode: 'pomodoro', state: 'running', phase: 'work', title: 'x', seconds: 1500, note: '', endAt: now + 25 * MIN },
  }, { waterIntervalMin: 60 })
  assert.equal(kind('huddle-widget').filter((n) => n.extra.destination === 'water').length, Budget.MAX_WATER_REMINDERS)
})

test('meetings are "urgent": 勿擾時段 drops a meeting reminder only with 允許緊急通知 off', async () => {
  reset()
  await N.setReminderAccount('acct-F')
  const late = oneOff('late', 1, '22:30') // reminder at 22:20 tomorrow — inside 22:00–08:00
  const noon = oneOff('noon', 1, '15:00')
  const meetings = Meetings.collectMeetings(tree(late, noon))
  const q = (over) => ({ enabled: true, startTime: '22:00', endTime: '08:00', allowUrgent: true, ...over })
  const titles = () => kind('meeting').map((n) => n.title).join('|')

  await N.syncMeetingReminders(meetings, 10, q({ allowUrgent: true }))
  assert.equal(kind('meeting').length, 2, 'urgent allowed (the default): both reminded')
  await N.syncMeetingReminders(meetings, 10, q({ allowUrgent: false }))
  assert.equal(kind('meeting').length, 1, 'urgent not allowed: the 22:20 one is dropped')
  assert.ok(titles().includes('noon') && !titles().includes('late'))
  await N.syncMeetingReminders(meetings, 10, q({ allowUrgent: false, enabled: false }))
  assert.equal(kind('meeting').length, 2, 'quiet hours off: nothing is dropped, whatever allowUrgent says')
  await N.syncMeetingReminders(meetings, 10, undefined)
  assert.equal(kind('meeting').length, 2, 'no setting saved: meetings are never dropped (no built-in night for meetings)')
})

// ── signing out / switching accounts ─────────────────────────────────────────────────────

test('foreignReminderIds: everything account-scoped that is not the current account\'s (untagged included)', () => {
  const pending = [
    { id: 1, extra: { kind: 'meeting', accountId: 'A' } },
    { id: 2, extra: { kind: 'followup', accountId: 'B' } },
    { id: 3, extra: { kind: 'meeting' } },
    { id: 4, extra: { kind: 'huddle-widget', accountId: 'A' } },
    { id: 5, extra: null },
  ]
  assert.deepEqual(N.foreignReminderIds(pending, 'A'), [2, 3])
  assert.deepEqual(N.foreignReminderIds(pending, null), [1, 2, 3], 'signed out: all meeting + follow-up notes go; widget notes have their own cleanup')
})

test('sign-out removes meeting and follow-up notifications; the next account never sees them', async () => {
  reset()
  await N.setReminderAccount('acct-G')
  await N.syncMeetingReminders(Meetings.collectMeetings(tree(oneOff('secret', 1))), 10)
  await N.syncFollowupReminders([{ task_id: 'f1', title: '報價', due_date: dayStr(2), is_completed: false, counterpart: '甲公司' }])
  assert.equal(kind('meeting').length + kind('followup').length, 2)
  assert.equal(kind('meeting')[0].extra.accountId, 'acct-G')

  await N.setReminderAccount(null) // sign out
  assert.equal(kind('meeting').length + kind('followup').length, 0)

  // Nobody signed in: syncing must not schedule anything.
  await N.syncMeetingReminders(Meetings.collectMeetings(tree(oneOff('secret', 1))), 10)
  await N.syncFollowupReminders([{ task_id: 'f1', title: '報價', due_date: dayStr(2), is_completed: false, counterpart: '甲公司' }])
  assert.equal(plugin.pending.length, 0)
})

test('switching straight from account A to B drops A\'s notes; a sync that was already in flight for A schedules nothing', async () => {
  reset()
  await N.setReminderAccount('acct-H1')
  await N.syncMeetingReminders(Meetings.collectMeetings(tree(oneOff('a-meeting', 1))), 10)
  assert.equal(kind('meeting').length, 1)

  // A's sync is queued, then the session flips to B before it gets to run.
  const inFlight = N.syncMeetingReminders(Meetings.collectMeetings(tree(oneOff('a-late', 2))), 10)
  const switched = N.setReminderAccount('acct-H2')
  await Promise.all([inFlight, switched])
  assert.equal(plugin.pending.filter((n) => n.extra?.accountId === 'acct-H1').length, 0, 'nothing of A is left')
  assert.equal(kind('meeting').length, 0)

  await N.syncMeetingReminders(Meetings.collectMeetings(tree(oneOff('b-meeting', 1))), 10)
  assert.deepEqual(kind('meeting').map((n) => n.extra.accountId), ['acct-H2'])
})

test('leftovers from an older app version (no account tag) are cleaned up at the next sign-in', async () => {
  reset()
  plugin.pending = [
    { id: 11, extra: { kind: 'meeting', meetingUrl: null } },
    { id: 12, extra: { kind: 'followup', route: '/meetings/' } },
    { id: 2100000001, extra: { kind: 'huddle-widget', accountId: 'acct-I' } },
  ]
  await N.setReminderAccount('acct-I')
  assert.deepEqual(plugin.pending.map((n) => n.id), [2100000001])
})
