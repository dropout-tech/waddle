// 勿擾時段 / 夜間保護 pure rules (lib/quiet-hours.ts).
// Run: node --test scripts/tests/quiet-hours.test.mjs
// Every time below is built with the LOCAL-time Date constructor, so the suite is timezone independent.
import test from 'node:test'
import assert from 'node:assert/strict'
import { installReminderTestEnv } from './reminder-test-env.mjs'

installReminderTestEnv()
const Q = await import('../../lib/quiet-hours.ts')

const at = (h, m = 0, s = 0, day = 10, month = 9, year = 2026) => new Date(year, month, day, h, m, s, 0).getTime()
const hhmm = (ms) => {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const NIGHT = { startMin: 22 * 60, endMin: 8 * 60 }

test('parseClockMinutes: valid 24h clock times only', () => {
  assert.equal(Q.parseClockMinutes('00:00'), 0)
  assert.equal(Q.parseClockMinutes('08:30'), 510)
  assert.equal(Q.parseClockMinutes('8:05'), 485)
  assert.equal(Q.parseClockMinutes('23:59'), 1439)
  for (const bad of ['24:00', '12:60', '', 'abc', '12', '12:5', null, undefined, 1200]) assert.equal(Q.parseClockMinutes(bad), null, String(bad))
})

test('resolveQuietHours: missing / partial / garbage settings fall back to "off, urgent allowed"', () => {
  for (const raw of [undefined, null, 'x', 5, []]) assert.deepEqual(Q.resolveQuietHours(raw), Q.DEFAULT_QUIET_HOURS)
  assert.deepEqual(Q.resolveQuietHours({}), Q.DEFAULT_QUIET_HOURS)
  const r = Q.resolveQuietHours({ enabled: true, startTime: '23:00', endTime: '99:99', allowUrgent: false })
  assert.equal(r.enabled, true)
  assert.equal(r.startTime, '23:00')
  assert.equal(r.endTime, '08:00', 'unparseable end time falls back to the default')
  assert.equal(r.allowUrgent, false)
  assert.equal(Q.resolveQuietHours({ enabled: 'yes' }).enabled, false, 'only a real true enables it')
  assert.equal(Q.resolveQuietHours({ enabled: true }).allowUrgent, true, 'allowUrgent defaults to true')
})

test('isInQuietWindow: 22:00–08:00 crosses midnight, start inclusive / end exclusive', () => {
  assert.equal(Q.isInQuietWindow(at(21, 59, 59), NIGHT), false)
  assert.equal(Q.isInQuietWindow(at(22, 0), NIGHT), true)
  assert.equal(Q.isInQuietWindow(at(23, 59), NIGHT), true)
  assert.equal(Q.isInQuietWindow(at(0, 0, 0, 11), NIGHT), true)
  assert.equal(Q.isInQuietWindow(at(3, 30, 0, 11), NIGHT), true)
  assert.equal(Q.isInQuietWindow(at(7, 59, 59, 11), NIGHT), true)
  assert.equal(Q.isInQuietWindow(at(8, 0, 0, 11), NIGHT), false)
  assert.equal(Q.isInQuietWindow(at(12, 0), NIGHT), false)
})

test('isInQuietWindow: same-day window, empty window, null window', () => {
  const lunch = { startMin: 13 * 60, endMin: 14 * 60 }
  assert.equal(Q.isInQuietWindow(at(12, 59), lunch), false)
  assert.equal(Q.isInQuietWindow(at(13, 0), lunch), true)
  assert.equal(Q.isInQuietWindow(at(13, 59), lunch), true)
  assert.equal(Q.isInQuietWindow(at(14, 0), lunch), false)
  const same = { startMin: 600, endMin: 600 }
  for (const h of [0, 10, 15, 23]) assert.equal(Q.isInQuietWindow(at(h), same), false, 'start === end is an empty window')
  assert.equal(Q.isInQuietWindow(at(23), null), false)
})

test('deferOutOfQuietWindow: outside → unchanged; inside → the window end, on the right day', () => {
  assert.equal(Q.deferOutOfQuietWindow(at(15, 20), NIGHT), at(15, 20))
  assert.equal(Q.deferOutOfQuietWindow(at(21, 59, 59), NIGHT), at(21, 59, 59))
  assert.equal(hhmm(Q.deferOutOfQuietWindow(at(22, 0), NIGHT)), '10/11 08:00', '22:00 sharp is already quiet → tomorrow 08:00')
  assert.equal(hhmm(Q.deferOutOfQuietWindow(at(23, 30), NIGHT)), '10/11 08:00', 'before midnight → tomorrow morning')
  assert.equal(hhmm(Q.deferOutOfQuietWindow(at(3, 0, 0, 11), NIGHT)), '10/11 08:00', 'after midnight → this morning')
  assert.equal(hhmm(Q.deferOutOfQuietWindow(at(7, 59, 59, 11), NIGHT)), '10/11 08:00')
  assert.equal(Q.deferOutOfQuietWindow(at(8, 0, 0, 11), NIGHT), at(8, 0, 0, 11), '08:00 sharp is free')
  const lunch = { startMin: 13 * 60, endMin: 14 * 60 + 30 }
  assert.equal(hhmm(Q.deferOutOfQuietWindow(at(13, 10), lunch)), '10/10 14:30', 'same-day window ends the same day')
  assert.equal(Q.deferOutOfQuietWindow(at(23, 0), null), at(23, 0))
})

test('deferOutOfQuietWindow: month and year rollover', () => {
  assert.equal(hhmm(Q.deferOutOfQuietWindow(at(23, 30, 0, 31, 11, 2026), NIGHT)), '1/1 08:00')
  assert.equal(new Date(Q.deferOutOfQuietWindow(at(23, 30, 0, 31, 11, 2026), NIGHT)).getFullYear(), 2027)
  assert.equal(hhmm(Q.deferOutOfQuietWindow(at(22, 5, 0, 28, 1, 2028), NIGHT)), '2/29 08:00', 'leap day')
})

test('deferOutOfQuietWindow: lands on 08:00 wall-clock across a DST change (America/New_York, 2026-03-08)', () => {
  const before = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    const evening = new Date(2026, 2, 7, 23, 30, 0, 0).getTime()
    const r = new Date(Q.deferOutOfQuietWindow(evening, NIGHT))
    assert.equal(r.getDate(), 8)
    assert.equal(r.getHours(), 8)
    assert.equal(r.getMinutes(), 0)
  } finally {
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
})

test('waterQuietWindow: built-in night when quiet hours are off, the user\'s window when on', () => {
  assert.deepEqual(Q.waterQuietWindow(Q.resolveQuietHours(undefined)), NIGHT)
  assert.deepEqual(Q.waterQuietWindow(Q.resolveQuietHours({ enabled: false, startTime: '13:00', endTime: '14:00' })), NIGHT, 'a saved-but-disabled window is ignored')
  assert.deepEqual(Q.waterQuietWindow(Q.resolveQuietHours({ enabled: true, startTime: '23:30', endTime: '07:00' })), { startMin: 23 * 60 + 30, endMin: 7 * 60 })
  assert.deepEqual(Q.waterQuietWindow(Q.resolveQuietHours({ enabled: true, startTime: '12:00', endTime: '12:00' })), NIGHT, 'empty user window → night protection stays')
})

test('meetingReminderSuppressed: meetings are urgent — only dropped when 允許緊急通知 is off AND the fire time is inside the window', () => {
  const on = (extra) => Q.resolveQuietHours({ enabled: true, startTime: '22:00', endTime: '08:00', ...extra })
  const inside = at(23, 0), outside = at(15, 0)
  assert.equal(Q.meetingReminderSuppressed(inside, on({ allowUrgent: true })), false, 'urgent allowed: always reminded')
  assert.equal(Q.meetingReminderSuppressed(inside, on({})), false, 'allowUrgent defaults to true')
  assert.equal(Q.meetingReminderSuppressed(inside, on({ allowUrgent: false })), true)
  assert.equal(Q.meetingReminderSuppressed(outside, on({ allowUrgent: false })), false)
  assert.equal(Q.meetingReminderSuppressed(at(7, 59, 0, 11), on({ allowUrgent: false })), true)
  assert.equal(Q.meetingReminderSuppressed(at(8, 0, 0, 11), on({ allowUrgent: false })), false)
  // Quiet hours switched off: nothing is suppressed, whatever allowUrgent says.
  assert.equal(Q.meetingReminderSuppressed(inside, Q.resolveQuietHours({ enabled: false, allowUrgent: false })), false)
  // Meetings get NO built-in night: only the water reminder does.
  assert.equal(Q.meetingReminderSuppressed(inside, Q.resolveQuietHours(undefined)), false)
  // An empty window never suppresses.
  assert.equal(Q.meetingReminderSuppressed(inside, on({ startTime: '09:00', endTime: '09:00', allowUrgent: false })), false)
})
