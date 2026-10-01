// Dragging one occurrence of a recurring series and choosing "all
// occurrences" moves the whole series by the drag's day offset
// (use-waddle-data rescheduleTask → shiftSeries). For 每週幾 series the
// weekdays must move too: shifting only the start left the series on the old
// weekdays plus a stray occurrence on the new start day.
import test from 'node:test'
import assert from 'node:assert/strict'
import { shiftSeries, taskOccursOnDate, parseDateString, toDateString } from '../../lib/calendar-utils.ts'

const series = (scheduledDate, recurrence) => ({
  id: 's', title: 'series', scheduledDate, isRecurring: true, recurrence: { interval: 1, ...recurrence },
})

// Same as rescheduleTask's "all" branch.
const moveAll = (task, targetDate, date) => {
  const s = shiftSeries(task, targetDate, date)
  return {
    ...task,
    scheduledDate: s.scheduledDate,
    recurrence: { ...task.recurrence, ...(s.daysOfWeek ? { daysOfWeek: s.daysOfWeek } : {}) },
  }
}

const addDays = (date, n) => {
  const d = parseDateString(date)
  d.setDate(d.getDate() + n)
  return toDateString(d)
}

const occurrences = (task, from, days) => {
  const out = []
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i)
    if (taskOccursOnDate(task, parseDateString(d))) out.push(d)
  }
  return out
}

// Every occurrence after the move = every occurrence before, shifted by the
// drag offset (checked over ~10 weeks).
const assertWholeSeriesMoved = (task, targetDate, date) => {
  const offset = Math.round((parseDateString(date) - parseDateString(targetDate)) / 86_400_000)
  const moved = moveAll(task, targetDate, date)
  const before = occurrences(task, '2026-09-01', 120).map((d) => addDays(d, offset))
  const after = occurrences(moved, '2026-09-01', 120 + Math.max(0, offset))
  const horizon = addDays('2026-09-01', 110)
  assert.deepEqual(after.filter((d) => d <= horizon), before.filter((d) => d <= horizon))
  return moved
}

test('weekly Mon+Wed: drag Wed 10/7 to Thu 10/8 → Tue+Thu, nothing left on Mon/Wed', () => {
  const t = series('2026-10-05', { type: 'weekly', daysOfWeek: [1, 3] }) // 10/5 is a Monday
  const moved = assertWholeSeriesMoved(t, '2026-10-07', '2026-10-08')
  assert.equal(moved.scheduledDate, '2026-10-06')
  assert.deepEqual(moved.recurrence.daysOfWeek, [2, 4])
  assert.deepEqual(occurrences(moved, '2026-10-05', 7), ['2026-10-06', '2026-10-08'])
  // The review's failure: a stray Tuesday plus Mon/Wed still there.
  assert.equal(taskOccursOnDate(moved, parseDateString('2026-10-12')), false)
  assert.equal(taskOccursOnDate(moved, parseDateString('2026-10-14')), false)
})

test('weekly Mon+Wed: drag across the week boundary (Wed 10/7 → Mon 10/12)', () => {
  const t = series('2026-10-05', { type: 'weekly', daysOfWeek: [1, 3] })
  const moved = assertWholeSeriesMoved(t, '2026-10-07', '2026-10-12')
  assert.equal(moved.scheduledDate, '2026-10-10')
  assert.deepEqual(moved.recurrence.daysOfWeek, [1, 6])
})

test('weekly Mon+Wed: drag backwards across the week boundary (Mon 10/12 → Sat 10/10)', () => {
  const t = series('2026-10-05', { type: 'weekly', daysOfWeek: [1, 3] })
  const moved = assertWholeSeriesMoved(t, '2026-10-12', '2026-10-10')
  assert.deepEqual(moved.recurrence.daysOfWeek, [1, 6])
  assert.equal(moved.scheduledDate, '2026-10-03')
})

test('weekly without chosen weekdays: start moves, no daysOfWeek written', () => {
  const t = series('2026-10-05', { type: 'weekly' })
  const moved = assertWholeSeriesMoved(t, '2026-10-12', '2026-10-15')
  assert.equal(moved.scheduledDate, '2026-10-08')
  assert.equal(shiftSeries(t, '2026-10-12', '2026-10-15').daysOfWeek, undefined)
})

test('daily: the series moves by the offset, weekdays untouched', () => {
  const t = series('2026-10-05', { type: 'daily', daysOfWeek: [1] }) // stray field must be ignored
  const s = shiftSeries(t, '2026-10-08', '2026-10-10')
  assert.equal(s.scheduledDate, '2026-10-07')
  assert.equal(s.daysOfWeek, undefined)
  assertWholeSeriesMoved(series('2026-10-05', { type: 'daily' }), '2026-10-08', '2026-10-10')
})

test('monthly: the series moves by the offset', () => {
  const t = series('2026-10-05', { type: 'monthly' })
  const moved = assertWholeSeriesMoved(t, '2026-11-05', '2026-11-07')
  assert.equal(moved.scheduledDate, '2026-10-07')
  assert.equal(shiftSeries(t, '2026-11-05', '2026-11-07').daysOfWeek, undefined)
})

test('undo is the opposite shift and restores start + weekdays exactly', () => {
  const t = series('2026-10-05', { type: 'weekly', daysOfWeek: [1, 3] })
  const moved = moveAll(t, '2026-10-07', '2026-10-08')
  // rescheduleTask undo: date = old start, targetDate = new start.
  const back = moveAll(moved, moved.scheduledDate, t.scheduledDate)
  assert.equal(back.scheduledDate, '2026-10-05')
  assert.deepEqual(back.recurrence.daysOfWeek, [1, 3])
})
