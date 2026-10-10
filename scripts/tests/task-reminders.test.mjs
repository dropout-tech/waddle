// 設定 › 提醒設定 → what the bell shows (lib/notifications/task-reminders.ts, settings.ts, daily-bell.ts,
// daily-planning.ts). Every setting on that page must change the output; the old bell ignored all the numbers.
// Run: node --test scripts/tests/task-reminders.test.mjs
// Dates are built with the LOCAL-time constructor, so the suite is timezone independent.
import test from 'node:test'
import assert from 'node:assert/strict'
import { installFakeLocalStorage, installReminderTestEnv } from './reminder-test-env.mjs'

installReminderTestEnv()
const R = await import('../../lib/notifications/task-reminders.ts')
const S = await import('../../lib/notifications/settings.ts')
const Bell = await import('../../lib/notifications/daily-bell.ts')
const Plan = await import('../../lib/notifications/daily-planning.ts')

const NOW = new Date(2026, 9, 10, 12, 0, 0) // Sat 2026-10-10 12:00 local
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const day = (offset) => ymd(new Date(2026, 9, 10 + offset))
/** ISO timestamp of "N days ago at 10:00 local". */
const ago = (n) => new Date(2026, 9, 10 - n, 10, 0, 0).toISOString()

let seq = 0
const task = (over = {}) => ({
  id: `t${++seq}`, title: `task ${seq}`, workspaceId: 'w1', categoryId: 'c1', urgency: 5,
  isCompleted: false, createdAt: ago(1), ...over,
})
const run = (tasks, settings = {}, now = NOW) => R.computeTaskReminders({ tasks, settings, now })
const ids = (items) => items.map((i) => i.id)
const item = (items, id) => items.find((i) => i.id === id)
/** Settings = the defaults with `patch` merged one level deep per section. */
const cfg = (patch = {}) => {
  const base = JSON.parse(JSON.stringify(S.DEFAULT_NOTIFICATION_SETTINGS))
  for (const [k, v] of Object.entries(patch)) base[k] = v && typeof v === 'object' && !Array.isArray(v) && k !== 'workspaceOverrides' ? { ...base[k], ...v } : v
  return base
}

// ── the old bell, transcribed from components/notifications/notification-center.tsx @86fbf31 (:145-319) ──
// It has no settings input at all apart from on/off switches; 7, 3, 14, urgency 8, ">= 5" and "> 50%" are literals.
// One deliberate difference: the original did `new Date('YYYY-MM-DD')` (midnight UTC), which puts a due date a day
// early west of UTC — see the timezone test below — so this copy parses dates as local midnight.
function legacyIds(tasks, now) {
  const todayStr = ymd(now)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dd = (a, b) => Math.floor((a.getTime() - b.getTime()) / 86400000)
  const D = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : new Date(s))
  const out = []
  const overdue = tasks.filter((t) => !t.isRecurring && !t.isMeeting && ((t.scheduledDate && t.scheduledDate < todayStr) || (t.dueDate && t.dueDate < todayStr)))
  const od = (t) => dd(today, new Date(`${(t.scheduledDate && t.scheduledDate < todayStr ? t.scheduledDate : t.dueDate)}T00:00:00`))
  if (overdue.some((t) => od(t) >= 7)) out.push('critical-overdue')
  if (overdue.some((t) => od(t) < 7)) out.push('recent-overdue')
  const soon = tasks.filter((t) => t.dueDate && dd(D(t.dueDate), today) >= 0 && dd(D(t.dueDate), today) <= 3)
  if (soon.some((t) => dd(D(t.dueDate), today) === 0)) out.push('due-today')
  if (soon.some((t) => dd(D(t.dueDate), today) > 0)) out.push('due-soon')
  if (tasks.some((t) => !t.dueDate && !t.scheduledDate && dd(today, new Date(t.createdAt)) >= 14)) out.push('stale-tasks')
  if (tasks.filter((t) => t.urgency >= 8).length >= 5) out.push('too-many-urgent')
  const none = tasks.filter((t) => !t.scheduledDate && !t.dueDate)
  if (none.length > tasks.length * 0.5 && none.length >= 5) out.push('unscheduled-tasks')
  return out
}

test('defaults: with the stock settings the new bell lists what the old one did (plus the daily digest)', () => {
  const tasks = [
    task({ scheduledDate: day(-9) }),                          // overdue 9 days → critical
    task({ dueDate: day(-2) }),                                // overdue 2 days → recent
    task({ dueDate: day(0) }),                                 // due today
    task({ dueDate: day(2) }),                                 // due in 2 days
    task({ createdAt: ago(20) }),                              // stale
    ...Array.from({ length: 4 }, () => task({ urgency: 9, scheduledDate: day(1) })),
  ]
  const now = ids(run(tasks, S.DEFAULT_NOTIFICATION_SETTINGS))
  assert.equal(now[0], 'daily-digest', 'the digest is pinned on top')
  assert.deepEqual(now.slice(1), ['critical-overdue', 'recent-overdue', 'due-today', 'due-soon', 'stale-tasks'])
  assert.deepEqual(legacyIds(tasks, NOW), now.slice(1), 'same cards as the old bell')
})

// ── overdue ──
test('overdue.criticalDays decides which overdue tasks are "critical" (old: hard-coded 7)', () => {
  const tasks = [task({ dueDate: day(-5) })]
  assert.deepEqual(ids(run(tasks, cfg({ overdue: { dailyDigest: false, criticalDays: 7 } }))), ['recent-overdue'])
  assert.deepEqual(ids(run(tasks, cfg({ overdue: { dailyDigest: false, criticalDays: 5 } }))), ['critical-overdue'], 'exactly N days late counts')
  assert.deepEqual(ids(run(tasks, cfg({ overdue: { dailyDigest: false, criticalDays: 3 } }))), ['critical-overdue'])
  assert.equal(item(run(tasks, cfg({ overdue: { criticalDays: 3 } })), 'critical-overdue').meta.oldestDays, 5)
  assert.deepEqual(legacyIds(tasks, NOW), ['recent-overdue'], 'old logic: same answer whatever the setting')
})

test('overdue.showInBell off hides the overdue cards but not the digest; overdue.enabled off removes both', () => {
  const tasks = [task({ dueDate: day(-2) }), task({ dueDate: day(-9) })]
  assert.deepEqual(ids(run(tasks, cfg({ overdue: { showInBell: false } }))), ['daily-digest'])
  assert.equal(item(run(tasks, cfg({ overdue: { showInBell: false } })), 'daily-digest').meta.overdue, 2)
  assert.deepEqual(ids(run(tasks, cfg({ overdue: { enabled: false } }))), [])
})

test('overdue.dailyDigest: one card on top counting overdue / due today / due tomorrow; nothing to say → no card', () => {
  const tasks = [task({ dueDate: day(-1) }), task({ scheduledDate: day(-3) }), task({ dueDate: day(0) }), task({ dueDate: day(0) }), task({ dueDate: day(1) }), task({ dueDate: day(2) })]
  const on = run(tasks, cfg())
  assert.equal(on[0].id, 'daily-digest')
  assert.equal(on[0].type, 'digest')
  assert.equal(on[0].daily, true)
  assert.deepEqual(on[0].meta, { overdue: 2, dueToday: 2, dueTomorrow: 1 })
  assert.equal(item(run(tasks, cfg({ overdue: { dailyDigest: false } })), 'daily-digest'), undefined)
  assert.equal(item(run([task({ dueDate: day(9) })], cfg()), 'daily-digest'), undefined, 'a quiet day has no digest')
})

test('a muted master switch (enabled: false) produces nothing at all', () => {
  assert.deepEqual(run([task({ dueDate: day(-9) })], cfg({ enabled: false })), [])
})

// ── due soon ──
test('dueSoon.daysBeforeDue sets the window (old: hard-coded 3)', () => {
  const tasks = [task({ dueDate: day(5) })]
  assert.equal(item(run(tasks, cfg({ dueSoon: { daysBeforeDue: 3 } })), 'due-soon'), undefined)
  assert.equal(item(run(tasks, cfg({ dueSoon: { daysBeforeDue: 5 } })), 'due-soon').count, 1, 'a task due exactly N days away is inside')
  assert.equal(item(run(tasks, cfg({ dueSoon: { daysBeforeDue: 5 } })), 'due-soon').meta.windowDays, 5)
  assert.equal(item(run([task({ dueDate: day(1) })], cfg({ dueSoon: { daysBeforeDue: 1 } })), 'due-tomorrow').count, 1)
  assert.deepEqual(legacyIds(tasks, NOW), [], 'old logic never looks past 3 days, whatever the setting')
  assert.deepEqual(ids(run([task({ dueDate: day(1) })], cfg({ dueSoon: { enabled: false }, overdue: { dailyDigest: false } }))), [])
})

test('dueSoon.notifyOnDueDay: on → its own high-priority card; off → the same tasks fold into the general card', () => {
  const t0 = task({ dueDate: day(0) })
  const t2 = task({ dueDate: day(2) })
  const on = run([t0, t2], cfg({ overdue: { dailyDigest: false } }))
  assert.deepEqual(ids(on), ['due-today', 'due-soon'])
  assert.equal(item(on, 'due-today').priority, 'high')
  const off = run([t0, t2], cfg({ overdue: { dailyDigest: false }, dueSoon: { notifyOnDueDay: false } }))
  assert.deepEqual(ids(off), ['due-soon'])
  assert.deepEqual(item(off, 'due-soon').tasks.map((t) => t.id), [t0.id, t2.id], 'today first, then by due date')
})

test('dueSoon.notifyDayBefore: on → a "due tomorrow" card; off → folded into the general card', () => {
  const t1 = task({ dueDate: day(1) })
  const t3 = task({ dueDate: day(3) })
  const base = { overdue: { dailyDigest: false } }
  const on = run([t1, t3], cfg(base))
  assert.deepEqual(ids(on), ['due-tomorrow', 'due-soon'])
  assert.equal(item(on, 'due-tomorrow').priority, 'medium')
  assert.deepEqual(item(on, 'due-soon').tasks.map((t) => t.id), [t3.id])
  const off = run([t1, t3], cfg({ ...base, dueSoon: { notifyDayBefore: false } }))
  assert.deepEqual(ids(off), ['due-soon'])
  assert.deepEqual(item(off, 'due-soon').tasks.map((t) => t.id), [t1.id, t3.id])
})

test('due dates are calendar dates: "due today" is found in every timezone (old: new Date(\'YYYY-MM-DD\') = UTC midnight, a day early west of UTC)', () => {
  const before = process.env.TZ
  try {
    for (const tz of ['Asia/Taipei', 'America/Los_Angeles', 'Pacific/Honolulu', 'Pacific/Kiritimati']) {
      process.env.TZ = tz
      const now = new Date(2026, 9, 10, 12, 0)
      const d = (n) => ymd(new Date(2026, 9, 10 + n))
      const out = R.computeTaskReminders({ tasks: [task({ dueDate: d(0) }), task({ dueDate: d(1) }), task({ dueDate: d(-1) })], settings: undefined, now })
      assert.deepEqual(item(out, 'daily-digest').meta, { overdue: 1, dueToday: 1, dueTomorrow: 1 }, tz)
      assert.equal(item(out, 'due-today').count, 1, tz)
      assert.equal(item(out, 'due-tomorrow').count, 1, tz)
    }
  } finally {
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
})

// ── stale ──
test('staleTasks.daysUntilStale (old: hard-coded 14)', () => {
  const tasks = [task({ createdAt: ago(20) })]
  const base = { overdue: { dailyDigest: false } }
  assert.deepEqual(ids(run(tasks, cfg({ ...base, staleTasks: { daysUntilStale: 14 } }))), ['stale-tasks'])
  assert.deepEqual(ids(run(tasks, cfg({ ...base, staleTasks: { daysUntilStale: 30 } }))), [])
  assert.deepEqual(ids(run(tasks, cfg({ ...base, staleTasks: { daysUntilStale: 20 } }))), ['stale-tasks'], 'exactly N days old counts')
  assert.equal(item(run(tasks, cfg(base)), 'stale-tasks').meta.staleDays, 14)
  assert.deepEqual(legacyIds([task({ createdAt: ago(20) })], NOW), ['stale-tasks'])
  assert.deepEqual(legacyIds([task({ createdAt: ago(10) })], NOW), [])
})

test('staleTasks.includeUnscheduled / includeNoDueDate decide which tasks count', () => {
  const base = { overdue: { dailyDigest: false } }
  const plain = task({ createdAt: ago(30) })                                 // not scheduled, no due date
  const dated = task({ createdAt: ago(30), dueDate: day(20) })               // not scheduled, due far away
  const planned = task({ createdAt: ago(30), scheduledDate: day(2) })        // on the calendar → never "forgotten"
  const all = [plain, dated, planned]
  const listed = (settings) => item(run(all, cfg({ ...base, staleTasks: settings })), 'stale-tasks')?.tasks.map((t) => t.id)
  assert.deepEqual(listed({}), [plain.id, dated.id], 'default: everything that is off the calendar; the planned one is left alone')
  assert.deepEqual(listed({ includeNoDueDate: false }), [dated.id], 'no-due-date tasks drop out')
  assert.equal(listed({ includeUnscheduled: false }), undefined, 'tasks that are not on the calendar are what "stale" means → off = no card')
})

test('stale never repeats a task already shown as overdue or due soon', () => {
  const tasks = [task({ createdAt: ago(30), dueDate: day(-1) }), task({ createdAt: ago(30), dueDate: day(2) })]
  assert.equal(item(run(tasks, cfg({ overdue: { dailyDigest: false } })), 'stale-tasks'), undefined)
  // …but with due-soon switched off the near-due one has no other card, so it is listed.
  assert.equal(item(run(tasks, cfg({ overdue: { dailyDigest: false }, dueSoon: { enabled: false } })), 'stale-tasks').count, 1)
})

// ── high priority ──
test('highPriority.minUrgency / maxBeforeAlert / alertWhenTooMany (old: urgency 8, ">= 5")', () => {
  const base = { overdue: { dailyDigest: false } }
  const tasks = [...Array.from({ length: 3 }, () => task({ urgency: 9, scheduledDate: day(1) })), ...Array.from({ length: 3 }, () => task({ urgency: 6, scheduledDate: day(1) }))]
  const run2 = (hp) => item(run(tasks, cfg({ ...base, highPriority: hp })), 'too-many-urgent')
  assert.equal(run2({ minUrgency: 8, maxBeforeAlert: 2 }).count, 3)
  assert.equal(run2({ minUrgency: 8, maxBeforeAlert: 3 }), undefined, '超過 3 個 means more than 3: three is fine')
  assert.equal(run2({ minUrgency: 6, maxBeforeAlert: 5 }).count, 6, 'a lower bar counts more tasks')
  assert.equal(run2({ minUrgency: 6, maxBeforeAlert: 5 }).meta.level, 6)
  assert.equal(run2({ minUrgency: 10, maxBeforeAlert: 2 }), undefined)
  assert.equal(run2({ minUrgency: 8, maxBeforeAlert: 2, alertWhenTooMany: false }), undefined)
  assert.equal(run2({ minUrgency: 8, maxBeforeAlert: 2, enabled: false }), undefined)
  assert.deepEqual(legacyIds(tasks, NOW), [], 'old logic: needs five at urgency 8+, no matter the settings')
})

// ── unscheduled ──
test('scheduling.percentThreshold / remindUnscheduled (old: "more than 50%")', () => {
  const base = { overdue: { dailyDigest: false }, staleTasks: { enabled: false } }
  // 10 open tasks, 6 with no date at all → 60 %
  const tasks = [...Array.from({ length: 6 }, () => task()), ...Array.from({ length: 4 }, () => task({ scheduledDate: day(1) }))]
  const at = (sched) => item(run(tasks, cfg({ ...base, scheduling: sched })), 'unscheduled-tasks')
  assert.equal(at({ percentThreshold: 50 }).count, 6)
  assert.equal(at({ percentThreshold: 50 }).meta.majority, true)
  assert.equal(at({ percentThreshold: 60 }).count, 6, 'exactly at the threshold counts')
  assert.equal(at({ percentThreshold: 70 }), undefined)
  assert.equal(at({ percentThreshold: 30 }).count, 6)
  assert.equal(at({ percentThreshold: 50, remindUnscheduled: false }), undefined)
  assert.equal(at({ percentThreshold: 50, enabled: false }), undefined)
  // 7 of 20 = 35 %: below the old fixed 50 %, inside a 30 % setting.
  const few = [...Array.from({ length: 7 }, () => task()), ...Array.from({ length: 13 }, () => task({ scheduledDate: day(1) }))]
  const f = (p) => item(run(few, cfg({ ...base, scheduling: { percentThreshold: p } })), 'unscheduled-tasks')
  assert.equal(f(30).meta.majority, false)
  assert.equal(f(50), undefined)
  assert.deepEqual(legacyIds(few, NOW), [], 'old logic: only above 50 %')
  // A handful of undated tasks is normal: fewer than 5 never nags, whatever the percentage.
  assert.equal(item(run(Array.from({ length: 4 }, () => task()), cfg({ ...base, scheduling: { percentThreshold: 10 } })), 'unscheduled-tasks'), undefined)
})

// ── workspaces ──
test('workspaceOverrides.enabled: a muted workspace produces no reminder of any kind', () => {
  const mine = task({ workspaceId: 'w1', dueDate: day(-1) })
  const muted = [task({ workspaceId: 'w2', dueDate: day(-1) }), task({ workspaceId: 'w2', dueDate: day(0) })]
  const settings = cfg({ overdue: { dailyDigest: true }, workspaceOverrides: { w2: { enabled: false, overduePriority: 'default' } } })
  const out = run([mine, ...muted], settings)
  assert.deepEqual(item(out, 'recent-overdue').tasks.map((t) => t.id), [mine.id])
  assert.deepEqual(item(out, 'daily-digest').meta, { overdue: 1, dueToday: 0, dueTomorrow: 0 })
  assert.equal(item(out, 'due-today'), undefined)
  assert.equal(item(run([mine, ...muted], cfg()), 'due-today').count, 1, 'unmuted, the same tasks show')
})

test('workspaceOverrides.overduePriority: the card is as urgent as its most urgent task', () => {
  const lateLow = task({ workspaceId: 'w2', dueDate: day(-2) })
  const lateDefault = task({ workspaceId: 'w1', dueDate: day(-2) })
  const o = (p) => ({ w2: { enabled: true, overduePriority: p } })
  const prio = (tasks, over) => item(run(tasks, cfg({ overdue: { dailyDigest: false }, workspaceOverrides: over })), 'recent-overdue').priority
  assert.equal(prio([lateLow], {}), 'medium', 'no override: the old priority')
  assert.equal(prio([lateLow], o('high')), 'high')
  assert.equal(prio([lateLow], o('low')), 'low')
  assert.equal(prio([lateLow, lateDefault], o('low')), 'medium', 'a default-priority task keeps the card at its normal level')
  assert.equal(prio([lateLow], o('default')), 'medium')
})

// ── daily planning card in the bell ──
test('scheduling.dailyPlanningReminder / planningReminderTime: the planning card appears from that time on', () => {
  const at = (h, m, sched) => item(run([], cfg({ scheduling: sched }), new Date(2026, 9, 10, h, m)), 'daily-planning')
  assert.equal(at(12, 0, { dailyPlanningReminder: false }), undefined, 'off by default')
  assert.equal(at(7, 59, { dailyPlanningReminder: true, planningReminderTime: '08:00' }), undefined)
  assert.equal(at(8, 0, { dailyPlanningReminder: true, planningReminderTime: '08:00' }).daily, true)
  assert.equal(at(12, 0, { dailyPlanningReminder: true, planningReminderTime: '13:30' }), undefined, 'a later time moves it later')
  assert.ok(at(13, 30, { dailyPlanningReminder: true, planningReminderTime: '13:30' }))
  assert.equal(item(run([], cfg({ enabled: false, scheduling: { dailyPlanningReminder: true } })), 'daily-planning'), undefined, 'master switch off')
})

// ── tolerant reader ──
test('mergeNotificationSettings: a blob missing quietHours (or anything) no longer breaks; garbage falls back per field', () => {
  const D = S.DEFAULT_NOTIFICATION_SETTINGS
  for (const raw of [undefined, null, 'x', 5, [], {}]) assert.deepEqual(S.mergeNotificationSettings(raw), D, String(raw))
  const noQuiet = S.mergeNotificationSettings({ enabled: true, overdue: { enabled: true, criticalDays: 3, showInBell: true, dailyDigest: false } })
  assert.deepEqual(noQuiet.quietHours, D.quietHours)
  assert.equal(noQuiet.overdue.criticalDays, 3, 'what IS stored is kept')
  assert.equal(noQuiet.overdue.dailyDigest, false)
  assert.deepEqual(noQuiet.appearance, D.appearance)
  const messy = S.mergeNotificationSettings({
    overdue: { criticalDays: 'x', showInBell: 'yes' }, dueSoon: { daysBeforeDue: 9999 }, highPriority: { minUrgency: -4 },
    scheduling: { planningReminderTime: '99:99', percentThreshold: NaN }, quietHours: { startTime: 'late', allowUrgent: false },
    appearance: { maxVisible: 0 }, workspaceOverrides: { a: { overduePriority: 'urgent!' }, b: 'nope', c: { enabled: false, overduePriority: 'low' } },
    someNewerField: { keep: 1 },
  })
  assert.equal(messy.overdue.criticalDays, 7)
  assert.equal(messy.overdue.showInBell, true)
  assert.equal(messy.dueSoon.daysBeforeDue, 60, 'clamped')
  assert.equal(messy.highPriority.minUrgency, 1)
  assert.equal(messy.scheduling.planningReminderTime, '08:00')
  assert.equal(messy.scheduling.percentThreshold, 50)
  assert.equal(messy.quietHours.startTime, '22:00')
  assert.equal(messy.quietHours.allowUrgent, false)
  assert.equal(messy.appearance.maxVisible, 1)
  assert.deepEqual(messy.workspaceOverrides, { a: { enabled: true, overduePriority: 'default' }, c: { enabled: false, overduePriority: 'low' } })
  assert.deepEqual(messy.someNewerField, { keep: 1 }, 'unknown keys survive a round trip')
  // Idempotent: merging an already-merged blob changes nothing.
  assert.deepEqual(S.mergeNotificationSettings(messy), messy)
})

test('computeTaskReminders accepts a blob with sections missing (the bell used to read these straight off the object)', () => {
  assert.doesNotThrow(() => run([task({ dueDate: day(-1) })], { enabled: true }))
  assert.doesNotThrow(() => run([task({ dueDate: day(-1) })], undefined))
  assert.deepEqual(ids(run([task({ dueDate: day(-9) })], undefined)), ['daily-digest', 'critical-overdue'])
})

test('collectOpenTasks skips completed / archived tasks and archived workspaces and categories', () => {
  const live = task()
  const ws = [
    { id: 'w1', isArchived: false, categories: [
      { id: 'c1', isArchived: false, tasks: [live, task({ isCompleted: true }), task({ isArchived: true })] },
      { id: 'c2', isArchived: true, tasks: [task()] },
    ] },
    { id: 'w2', isArchived: true, categories: [{ id: 'c3', isArchived: false, tasks: [task()] }] },
    { id: 'w3', isArchived: false },
  ]
  assert.deepEqual(R.collectOpenTasks(ws).map((t) => t.id), [live.id])
  assert.deepEqual(R.collectOpenTasks(undefined), [])
})

// ── how the bell lists them ──
const mk = (id, type, priority, daily = false) => ({ id, type, priority, tasks: [], count: 1, daily, meta: {} })
test('appearance.groupByType: sections in a fixed order with headers; off → one flat list, most urgent first', () => {
  const items = [mk('unscheduled-tasks', 'reminder', 'low'), mk('stale-tasks', 'stale', 'low'), mk('due-today', 'due_soon', 'high'), mk('recent-overdue', 'overdue', 'medium'), mk('too-many-urgent', 'insight', 'medium'), mk('daily-digest', 'digest', 'medium', true)]
  const grouped = R.arrangeBell(items, { groupByType: true, maxVisible: 10 })
  assert.deepEqual(grouped.rows.map((r) => (r.kind === 'header' ? `# ${r.group}` : r.item.id)),
    ['# today', 'daily-digest', '# overdue', 'recent-overdue', '# due_soon', 'due-today', '# stale', 'stale-tasks', '# suggest', 'unscheduled-tasks', 'too-many-urgent'])
  const flat = R.arrangeBell(items, { groupByType: false, maxVisible: 10 })
  assert.equal(flat.rows.some((r) => r.kind === 'header'), false)
  assert.deepEqual(flat.rows.map((r) => r.item.id), ['daily-digest', 'due-today', 'recent-overdue', 'too-many-urgent', 'unscheduled-tasks', 'stale-tasks'])
})

test('appearance.maxVisible cuts the list (headers only for what is shown) and showAll lifts the cut', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((id) => mk(id, 'overdue', 'medium'))
  const cut = R.arrangeBell(items, { groupByType: true, maxVisible: 3 })
  assert.equal(cut.rows.filter((r) => r.kind === 'item').length, 3)
  assert.equal(cut.hidden, 2)
  assert.equal(cut.total, 5)
  assert.equal(R.arrangeBell(items, { groupByType: true, maxVisible: 3 }, true).hidden, 0)
  assert.equal(R.arrangeBell(items, { groupByType: false, maxVisible: 10 }).hidden, 0)
  // the daily cards come first, so a tight limit never cuts the digest
  const withDaily = R.arrangeBell([...items, mk('daily-digest', 'digest', 'medium', true)], { groupByType: false, maxVisible: 1 })
  assert.deepEqual(withDaily.rows.map((r) => r.item.id), ['daily-digest'])
})

// ── the bell's per-day memory ──
test('daily-bell: seen / dismissed are remembered for today only', () => {
  const today = '2026-10-10'
  let s = Bell.emptyDailyBell(today)
  assert.deepEqual(Bell.markSeen(s, []), s)
  assert.equal(Bell.markSeen(s, []), s, 'nothing new → the same object (no re-render)')
  s = Bell.markSeen(s, ['daily-digest'])
  assert.equal(Bell.markSeen(s, ['daily-digest']), s)
  s = Bell.markDismissed(s, 'daily-planning')
  const back = Bell.parseDailyBell(Bell.serializeDailyBell(s), today)
  assert.deepEqual(back, { date: today, seen: ['daily-digest'], dismissed: ['daily-planning'] })
  assert.deepEqual(Bell.parseDailyBell(Bell.serializeDailyBell(s), '2026-10-11'), Bell.emptyDailyBell('2026-10-11'), 'a new day starts clean')
  for (const bad of [null, '', 'nope', '[]', '{"date":5}']) assert.deepEqual(Bell.parseDailyBell(bad, today), Bell.emptyDailyBell(today), String(bad))
  assert.notEqual(Bell.dailyBellKey('a'), Bell.dailyBellKey('b'), 'per account')
})

test('daily-bell store: an update is written through, subscribers are told, another day starts clean, blocked storage falls back to memory', () => {
  const store = installFakeLocalStorage()
  globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {} }
  try {
    const key = Bell.dailyBellKey('user-1')
    let told = 0
    const off = Bell.subscribeDailyBell(() => told++)
    assert.equal(Bell.readDailyBellRaw(key), null)
    Bell.updateDailyBell(key, '2026-10-10', (s) => Bell.markSeen(s, ['daily-digest']))
    assert.equal(told, 1)
    assert.deepEqual(Bell.parseDailyBell(store.get(key), '2026-10-10').seen, ['daily-digest'], 'persisted in localStorage')
    Bell.updateDailyBell(key, '2026-10-10', (s) => Bell.markSeen(s, ['daily-digest']))
    assert.equal(told, 1, 'nothing changed → nothing written, nobody woken')
    Bell.updateDailyBell(key, '2026-10-10', (s) => Bell.markDismissed(s, 'daily-planning'))
    assert.deepEqual(Bell.parseDailyBell(Bell.readDailyBellRaw(key), '2026-10-10'), { date: '2026-10-10', seen: ['daily-digest'], dismissed: ['daily-planning'] })
    Bell.updateDailyBell(key, '2026-10-11', (s) => Bell.markSeen(s, ['daily-digest']))
    assert.deepEqual(Bell.parseDailyBell(store.get(key), '2026-10-11'), { date: '2026-10-11', seen: ['daily-digest'], dismissed: [] }, 'the next day does not inherit yesterday\'s dismissals')
    off()
    Bell.updateDailyBell(key, '2026-10-11', (s) => Bell.markDismissed(s, 'x'))
    assert.equal(told, 3, 'unsubscribed')
    // Storage that throws (private mode): the in-memory copy still answers.
    const blocked = Bell.dailyBellKey('user-2')
    globalThis.window.localStorage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
    Bell.updateDailyBell(blocked, '2026-10-10', (s) => Bell.markSeen(s, ['daily-digest']))
    assert.deepEqual(Bell.parseDailyBell(Bell.readDailyBellRaw(blocked), '2026-10-10').seen, ['daily-digest'])
  } finally {
    delete globalThis.window
  }
})

// ── 每日規劃提醒: config + the web / Mac once-a-day rule ──
test('planningReminderConfig: master ∧ section ∧ switch; time falls back to 08:00', () => {
  const c = (n) => Plan.planningReminderConfig(n)
  assert.equal(c(undefined).enabled, false)
  assert.deepEqual(c(cfg({ scheduling: { dailyPlanningReminder: true, planningReminderTime: '21:05' } })), { enabled: true, time: '21:05', hour: 21, minute: 5 })
  assert.equal(c(cfg({ enabled: false, scheduling: { dailyPlanningReminder: true } })).enabled, false)
  assert.equal(c(cfg({ scheduling: { enabled: false, dailyPlanningReminder: true } })).enabled, false)
  assert.deepEqual(c({ scheduling: { dailyPlanningReminder: true, planningReminderTime: 'oops' } }), { enabled: true, time: '08:00', hour: 8, minute: 0 })
})

test('planningReminderDue: after the time, once per local day, never when off (quiet hours are not consulted)', () => {
  const on = Plan.planningReminderConfig(cfg({ scheduling: { dailyPlanningReminder: true, planningReminderTime: '08:00' }, quietHours: { enabled: true, startTime: '00:00', endTime: '23:00' } }))
  const due = (h, m, last) => Plan.planningReminderDue({ now: new Date(2026, 9, 10, h, m), cfg: on, lastFiredDate: last })
  assert.equal(due(7, 59, null), false)
  assert.equal(due(8, 0, null), true)
  assert.equal(due(15, 0, null), true, 'the app opened late in the day: still fires once')
  assert.equal(due(15, 0, '2026-10-10'), false, 'already fired today')
  assert.equal(due(8, 0, '2026-10-09'), true, 'yesterday does not count')
  assert.equal(Plan.planningReminderDue({ now: new Date(2026, 9, 10, 9, 0), cfg: { ...on, enabled: false }, lastFiredDate: null }), false)
  assert.equal(Plan.planningLastFiredKey('u1') === Plan.planningLastFiredKey('u2'), false)
})
