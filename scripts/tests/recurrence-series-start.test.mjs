// "This and following" on a recurring series (revback M1).
// Splitting a series ends the old master the day before targetDate and starts
// a new master on targetDate. On the series' first day that left the old
// master with endDate < scheduledDate, and taskOccursOnDate still returned
// true for its original date — two entries on that day.
import test from 'node:test'
import assert from 'node:assert/strict'
import { taskOccursOnDate, isSeriesStart, parseDateString, toDateString } from '../../lib/calendar-utils.ts'

const daily = (scheduledDate, endDate) => ({
  id: crypto.randomUUID(),
  title: 'daily',
  scheduledDate,
  isRecurring: true,
  recurrence: { type: 'daily', interval: 1, ...(endDate ? { endDate } : {}) },
})

const dayBefore = (date) => {
  const d = parseDateString(date)
  d.setDate(d.getDate() - 1)
  return toDateString(d)
}

// Same split as use-waddle-data's this_and_following branches.
const split = (master, targetDate) => [
  { ...master, recurrence: { ...master.recurrence, endDate: dayBefore(targetDate) } },
  { ...master, id: crypto.randomUUID(), scheduledDate: targetDate, recurrence: { ...master.recurrence } },
]

const countOn = (tasks, date) => tasks.filter((t) => taskOccursOnDate(t, parseDateString(date))).length

test('a master cut off before its first day no longer occurs on that day', () => {
  const oldMaster = daily('2026-10-05', '2026-10-04')
  assert.equal(taskOccursOnDate(oldMaster, parseDateString('2026-10-05')), false)
  assert.equal(taskOccursOnDate(oldMaster, parseDateString('2026-10-06')), false)
})

test('the original date still counts for ordinary series and one-off tasks', () => {
  assert.equal(taskOccursOnDate(daily('2026-10-05'), parseDateString('2026-10-05')), true)
  assert.equal(taskOccursOnDate(daily('2026-10-05', '2026-10-05'), parseDateString('2026-10-05')), true)
  assert.equal(taskOccursOnDate(daily('2026-10-05', '2026-10-10'), parseDateString('2026-10-05')), true)
  const oneOff = { id: 'x', title: 'once', scheduledDate: '2026-10-05', isRecurring: false }
  assert.equal(taskOccursOnDate(oneOff, parseDateString('2026-10-05')), true)
})

test('isSeriesStart: only the first occurrence (or earlier) is the whole series', () => {
  const m = daily('2026-10-05')
  assert.equal(isSeriesStart(m, '2026-10-05'), true)
  assert.equal(isSeriesStart(m, '2026-10-04'), true)
  assert.equal(isSeriesStart(m, '2026-10-06'), false)
  assert.equal(isSeriesStart(m, undefined), false)
  assert.equal(isSeriesStart({ scheduledDate: undefined }, '2026-10-05'), false)
})

test('splitting on the first day (data written before the fix) shows each day once', () => {
  const tasks = split(daily('2026-10-05'), '2026-10-05')
  for (const d of ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-12']) {
    assert.equal(countOn(tasks, d), d < '2026-10-05' ? 0 : 1, d)
  }
})

test('splitting mid-series shows each day exactly once on both sides', () => {
  const tasks = split(daily('2026-10-05'), '2026-10-08')
  for (let i = 5; i <= 14; i++) {
    const d = `2026-10-${String(i).padStart(2, '0')}`
    assert.equal(countOn(tasks, d), 1, d)
  }
})
