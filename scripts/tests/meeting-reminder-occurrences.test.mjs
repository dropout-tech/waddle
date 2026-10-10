// Meeting reminders for REPEATING meetings (lib/meeting-reminder.ts collectMeetings and friends).
// Before: collectMeetings read only the master task's own scheduledDate, so a weekly meeting was
// reminded once (its first week) and never again; the web "already reminded" key ignored the lead
// time; the penguin announced at most one meeting per DAY.
// Run: node --test scripts/tests/meeting-reminder-occurrences.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { installReminderTestEnv } from './reminder-test-env.mjs'

installReminderTestEnv()
const M = await import('../../lib/meeting-reminder.ts')
const Q = await import('../../lib/quiet-hours.ts')

// Saturday 2026-10-10 09:00, local. Mondays: 9/21, 9/28, 10/5, 10/12, 10/19. Wednesday 10/14.
const NOW = new Date(2026, 9, 10, 9, 0, 0, 0)
const at = (day, h, m = 0, month = 9) => new Date(2026, month, day, h, m, 0, 0).getTime()
/** Time of day on Saturday 2026-10-10. */
const tod = (h, m = 0, s = 0) => new Date(2026, 9, 10, h, m, s, 0).getTime()

const meeting = (over = {}) => ({
  id: 'weekly',
  title: '週會',
  isMeeting: true,
  isCompleted: false,
  scheduledDate: '2026-09-21', // a Monday, three weeks back
  scheduledStartTime: '10:00',
  scheduledEndTime: '11:00',
  isRecurring: true,
  recurrence: { type: 'weekly', interval: 1 },
  ...over,
})
const tree = (...tasks) => [{ id: 'w', name: '工作', color: '#abc', isArchived: false, categories: [{ id: 'c', name: '會議', isArchived: false, tasks }] }]
const dates = (refs) => refs.map((r) => r.scheduledDate)

test('weekly meeting: the next occurrence in the window is returned with its own date (old code: only the master\'s first date, long past)', () => {
  const refs = M.collectMeetings(tree(meeting()), { now: NOW })
  assert.deepEqual(dates(refs), ['2026-10-12'])
  assert.equal(refs[0].id, 'weekly', 'id stays the series master\'s so the task can still be opened')
  assert.equal(refs[0].scheduledStartTime, '10:00')
  assert.equal(refs[0].title, '週會')
})

test('a longer window finds every week; each occurrence has its own key', () => {
  const refs = M.collectMeetings(tree(meeting()), { now: NOW, days: 22 })
  assert.deepEqual(dates(refs), ['2026-10-12', '2026-10-19', '2026-10-26'])
  assert.equal(new Set(refs.map(M.meetingOccurrenceKey)).size, 3)
  assert.equal(M.meetingOccurrenceKey(refs[1]), 'weekly@2026-10-19T10:00')
})

test('today\'s occurrence is included (a meeting later today still gets its reminder)', () => {
  const sat = meeting({ scheduledDate: '2026-09-26', scheduledStartTime: '15:00', scheduledEndTime: '16:00' }) // Saturdays
  assert.deepEqual(dates(M.collectMeetings(tree(sat), { now: NOW })), ['2026-10-10'])
})

test('weekly with chosen weekdays, daily, and "every 2 weeks"', () => {
  const monWed = meeting({ recurrence: { type: 'weekly', interval: 1, daysOfWeek: [1, 3] } })
  assert.deepEqual(dates(M.collectMeetings(tree(monWed), { now: NOW })), ['2026-10-12', '2026-10-14'])
  const daily = meeting({ scheduledDate: '2026-10-01', recurrence: { type: 'daily', interval: 1 } })
  assert.equal(M.collectMeetings(tree(daily), { now: NOW }).length, 7)
  assert.deepEqual(dates(M.collectMeetings(tree(daily), { now: NOW })).slice(0, 2), ['2026-10-10', '2026-10-11'])
  // 9/21 + 2 weeks = 10/5, +4 weeks = 11/2: no occurrence at all in 10/10–10/16.
  const biweekly = meeting({ recurrence: { type: 'weekly', interval: 2 } })
  assert.deepEqual(dates(M.collectMeetings(tree(biweekly), { now: NOW })), [])
})

test('exdates (a deleted / moved single occurrence) and the series end date are honoured', () => {
  assert.deepEqual(dates(M.collectMeetings(tree(meeting({ exdates: ['2026-10-12'] })), { now: NOW, days: 14 })), ['2026-10-19'])
  assert.deepEqual(dates(M.collectMeetings(tree(meeting({ recurrence: { type: 'weekly', interval: 1, endDate: '2026-10-12' } })), { now: NOW, days: 22 })), ['2026-10-12'])
})

test('a moved single occurrence is its own one-off meeting and the master skips that date', () => {
  const master = meeting({ exdates: ['2026-10-12'] })
  const moved = { ...meeting(), id: 'moved', isRecurring: false, recurrence: undefined, parentId: 'weekly', exdates: undefined, scheduledDate: '2026-10-13', scheduledStartTime: '14:00', scheduledEndTime: '15:00' }
  const refs = M.collectMeetings(tree(master, moved), { now: NOW })
  assert.deepEqual(refs.map((r) => [r.id, r.scheduledDate, r.scheduledStartTime]), [['moved', '2026-10-13', '14:00']])
})

test('one-off meetings behave as before: past and far-future ones are returned untouched', () => {
  const past = meeting({ id: 'past', isRecurring: false, recurrence: undefined, scheduledDate: '2026-10-01' })
  const far = meeting({ id: 'far', isRecurring: false, recurrence: undefined, scheduledDate: '2027-02-01' })
  assert.deepEqual(M.collectMeetings(tree(past, far), { now: NOW }).map((r) => r.id), ['past', 'far'])
})

test('a series whose first meeting is still beyond the window keeps that first meeting; a finished/ended one does not', () => {
  const future = meeting({ scheduledDate: '2026-11-02' })
  assert.deepEqual(dates(M.collectMeetings(tree(future), { now: NOW })), ['2026-11-02'])
  const ended = meeting({ recurrence: { type: 'weekly', interval: 1, endDate: '2026-10-05' } })
  assert.deepEqual(dates(M.collectMeetings(tree(ended), { now: NOW, days: 30 })), [])
})

test('completed, archived and non-meeting tasks are left out; incomplete scheduling is ignored', () => {
  const refs = M.collectMeetings(
    tree(
      meeting({ id: 'done', isCompleted: true }),
      meeting({ id: 'arch', isArchived: true }),
      meeting({ id: 'task', isMeeting: false }),
      meeting({ id: 'notime', scheduledStartTime: undefined }),
      meeting({ id: 'ok' }),
    ),
    { now: NOW },
  )
  assert.deepEqual(refs.map((r) => r.id), ['ok'])
})

test('window edges: 7 calendar days starting today (DST-safe local dates)', () => {
  const daily = meeting({ scheduledDate: '2026-10-01', recurrence: { type: 'daily', interval: 1 } })
  const refs = M.collectMeetings(tree(daily), { now: new Date(2026, 9, 10, 23, 59, 0, 0) })
  assert.deepEqual(dates(refs), ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'])
})

// ── web / desktop "already reminded" bookkeeping ────────────────────────────────────────

test('fired key = occurrence + lead: next week reminds again, changing 15 → 10 minutes reminds again', () => {
  const [wk1, wk2] = M.collectMeetings(tree(meeting()), { now: NOW, days: 14 })
  const fired = new Set([M.meetingFiredKey(wk1, 15)])
  assert.equal(M.wasMeetingReminded(fired, wk1, 15), true)
  assert.equal(M.wasMeetingReminded(fired, wk1, 10), false, 'lead changed → remind again (old key ignored the lead)')
  assert.equal(M.wasMeetingReminded(fired, wk2, 15), false, 'next week\'s occurrence is a new reminder')
})

test('keys written by the previous version (no lead suffix) still count, so an update never double-reminds', () => {
  const [wk1] = M.collectMeetings(tree(meeting()), { now: NOW })
  assert.equal(M.wasMeetingReminded(new Set([M.meetingOccurrenceKey(wk1)]), wk1, 10), true)
})

test('fired keys keep the "<id>@<date>" shape the 7-day pruning reads', () => {
  const store = new Map()
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } }
  try {
    const today = new Date()
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const old = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 20)
    const fresh = M.meetingFiredKey({ id: 'a', scheduledDate: iso(today), scheduledStartTime: '10:00' }, 10)
    const stale = M.meetingFiredKey({ id: 'a', scheduledDate: iso(old), scheduledStartTime: '10:00' }, 10)
    store.set(M.MEETING_REMINDER_FIRED_KEY, JSON.stringify([fresh, stale]))
    const kept = M.getFiredRemindersAndPrune()
    assert.equal(kept.has(fresh), true)
    assert.equal(kept.has(stale), false)
  } finally {
    delete globalThis.window
  }
})

test('isMeetingReminderDue: window [start − lead, start)', () => {
  const quiet = Q.resolveQuietHours(undefined)
  const p = { startMs: tod(12, 10), lead: 10, quiet }
  assert.equal(M.isMeetingReminderDue({ ...p, now: tod(11, 59, 59) }), false)
  assert.equal(M.isMeetingReminderDue({ ...p, now: tod(12, 0) }), true)
  assert.equal(M.isMeetingReminderDue({ ...p, now: tod(12, 9, 59) }), true)
  assert.equal(M.isMeetingReminderDue({ ...p, now: tod(12, 10) }), false, 'already started')
})

test('isMeetingReminderDue: 勿擾時段 swallows it only with 允許緊急通知 off, judged at the reminder time', () => {
  const night = (allowUrgent) => Q.resolveQuietHours({ enabled: true, startTime: '22:00', endTime: '08:00', allowUrgent })
  // 22:30 meeting, 10 min lead → reminder due 22:20, inside the window.
  const p = { startMs: tod(22, 30), lead: 10, now: tod(22, 25) }
  assert.equal(M.isMeetingReminderDue({ ...p, quiet: night(true) }), true)
  assert.equal(M.isMeetingReminderDue({ ...p, quiet: night(false) }), false)
  // 08:05 meeting, 10 min lead → due 07:55 (inside). At 08:01 the window is over, but the reminder's own time was quiet: still dropped.
  const early = { startMs: at(11, 8, 5), lead: 10, now: at(11, 8, 1), quiet: night(false) }
  assert.equal(M.isMeetingReminderDue(early), false)
  // 08:30 meeting → due 08:20, outside → fine even with urgent off.
  assert.equal(M.isMeetingReminderDue({ startMs: at(11, 8, 30), lead: 10, now: at(11, 8, 25), quiet: night(false) }), true)
})

// ── the penguin's "meeting soon" line ────────────────────────────────────────────────────

const TEN_MIN = 10 * 60_000
const ref = (id, date, time) => ({ id, title: id, scheduledDate: date, scheduledStartTime: time, scheduledEndTime: '23:59' })

test('penguin: two meetings the same day each get a line (old code: one per day)', () => {
  const a = ref('a', '2026-10-10', '10:00')
  const b = ref('b', '2026-10-10', '14:00')
  const first = M.pickMeetingNudge([a, b], undefined, at(10, 9, 55, 9), TEN_MIN)
  assert.equal(first.meeting.id, 'a')
  assert.equal(Math.ceil(first.untilMs / 60_000), 5)
  const remembered = M.rememberNudgedMeeting(undefined, M.meetingOccurrenceKey(a), '2026-10-10')
  assert.equal(M.pickMeetingNudge([a, b], remembered, at(10, 9, 57, 9), TEN_MIN), null, 'a is not announced twice')
  const second = M.pickMeetingNudge([a, b], remembered, at(10, 13, 55, 9), TEN_MIN)
  assert.equal(second.meeting.id, 'b', 'the afternoon meeting still gets its own line')
})

test('penguin: next week\'s occurrence of the same series is a new announcement', () => {
  const wk1 = ref('weekly', '2026-10-12', '10:00')
  const wk2 = ref('weekly', '2026-10-19', '10:00')
  const kept = M.rememberNudgedMeeting(undefined, M.meetingOccurrenceKey(wk1), '2026-10-12')
  assert.equal(M.pickMeetingNudge([wk2], kept, at(19, 9, 55, 9), TEN_MIN).meeting.scheduledDate, '2026-10-19')
})

test('penguin: only meetings that start within the lead, earliest first, never past ones', () => {
  const soon = ref('soon', '2026-10-10', '10:05')
  const sooner = ref('sooner', '2026-10-10', '10:02')
  const later = ref('later', '2026-10-10', '10:30')
  const past = ref('past', '2026-10-10', '09:58')
  const now = at(10, 10, 0, 9)
  assert.equal(M.pickMeetingNudge([later, past], undefined, now, TEN_MIN), null)
  assert.equal(M.pickMeetingNudge([soon, sooner, later, past], undefined, now, TEN_MIN).meeting.id, 'sooner')
})

test('rememberNudgedMeeting: drops entries dated before today and stays small', () => {
  const kept = M.rememberNudgedMeeting(['x@2026-10-01T09:00', 'y@2026-10-10T09:00'], 'z@2026-10-11T09:00', '2026-10-10')
  assert.deepEqual(kept, ['y@2026-10-10T09:00', 'z@2026-10-11T09:00'])
  let keys = []
  for (let i = 0; i < 100; i++) keys = M.rememberNudgedMeeting(keys, `m${i}@2026-10-12T09:00`, '2026-10-10')
  assert.equal(keys.length, 40)
  assert.equal(keys.at(-1), 'm99@2026-10-12T09:00')
})
