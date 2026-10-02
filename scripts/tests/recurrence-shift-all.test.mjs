// Dragging one occurrence of a recurring series and choosing "all
// occurrences" moves the whole series by the drag's day offset
// (use-waddle-data rescheduleTask → shiftSeries). For 每週幾 series the
// weekdays must move too: shifting only the start left the series on the old
// weekdays plus a stray occurrence on the new start day.
import test from 'node:test'
import assert from 'node:assert/strict'
import { shiftSeries, taskOccursOnDate, parseDateString, toDateString, overridesFollowingShift } from '../../lib/calendar-utils.ts'

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
    ...(s.exdates ? { exdates: s.exdates } : {}),
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

// ── every 2+ weeks with several weekdays (review r2 F3) ──
import { seriesShiftIsExact } from '../../lib/calendar-utils.ts'

test('biweekly Fri+Sat dragged Fri 10/02 → Sat 10/03 is refused (Sun would land in the wrong week)', () => {
  const t = series('2026-10-02', { type: 'weekly', interval: 2, daysOfWeek: [5, 6] })
  assert.equal(seriesShiftIsExact(t, '2026-10-02', '2026-10-03'), false)
  // What saving it anyway would have produced: 10/04 and 10/18 missing.
  const moved = moveAll(t, '2026-10-02', '2026-10-03')
  assert.equal(taskOccursOnDate(moved, parseDateString('2026-10-04')), false)
})

test('biweekly Mon+Wed dragged Wed → Thu stays in the same week: allowed and exact', () => {
  const t = series('2026-10-05', { type: 'weekly', interval: 2, daysOfWeek: [1, 3] })
  assert.equal(seriesShiftIsExact(t, '2026-10-07', '2026-10-08'), true)
  assertWholeSeriesMoved(t, '2026-10-07', '2026-10-08')
})

test('biweekly single weekday across the weekend is still exact', () => {
  const t = series('2026-10-03', { type: 'weekly', interval: 2, daysOfWeek: [6] })
  assert.equal(seriesShiftIsExact(t, '2026-10-03', '2026-10-04'), true)
  assertWholeSeriesMoved(t, '2026-10-03', '2026-10-04')
})

test('every-week, daily and monthly series are never refused', () => {
  assert.equal(seriesShiftIsExact(series('2026-10-02', { type: 'weekly', daysOfWeek: [5, 6] }), '2026-10-02', '2026-10-03'), true)
  assert.equal(seriesShiftIsExact(series('2026-10-02', { type: 'daily', interval: 2 }), '2026-10-02', '2026-10-03'), true)
  assert.equal(seriesShiftIsExact(series('2026-10-02', { type: 'monthly', interval: 2 }), '2026-10-02', '2026-10-05'), true)
})

// Skipped days move with the series: a deleted occurrence stays deleted and
// an overridden one doesn't come back as a second copy.
test('exdates move with the series (deleted day stays deleted)', () => {
  // 每週一、三; Wed 10-14 deleted. Drag Mon 10-12 → Tue 10-13 (+1).
  const t = { ...series('2026-10-05', { type: 'weekly', daysOfWeek: [1, 3] }), exdates: ['2026-10-14'] }
  const moved = assertWholeSeriesMoved(t, '2026-10-12', '2026-10-13')
  assert.deepEqual(moved.exdates, ['2026-10-15'])
  assert.equal(taskOccursOnDate(moved, parseDateString('2026-10-15')), false) // the deleted one, moved
  assert.equal(taskOccursOnDate(moved, parseDateString('2026-10-22')), true) // its neighbours still there
  // Undo (opposite shift) restores the skipped day exactly.
  const back = moveAll(moved, '2026-10-13', '2026-10-12')
  assert.deepEqual(back.exdates, ['2026-10-14'])
})

test('series without exdates gets none added', () => {
  const s = shiftSeries(series('2026-10-01', { type: 'daily' }), '2026-10-03', '2026-10-05')
  assert.equal(s.exdates, undefined)
  assert.equal(s.offset, 2)
})

test('overrides on their original day follow the shift; moved ones stay', () => {
  const master = { ...series('2026-10-05', { type: 'weekly', daysOfWeek: [1, 3] }), exdates: ['2026-10-14', '2026-10-19'] }
  const tasks = [
    master,
    { id: 'o1', parentId: 's', scheduledDate: '2026-10-14' }, // only the time changed → follows
    { id: 'o2', parentId: 's', scheduledDate: '2026-10-23' }, // user dragged it to Fri → stays
    { id: 'x', parentId: 'other', scheduledDate: '2026-10-14' }, // another series' override
    { id: 'y', scheduledDate: '2026-10-14' }, // ordinary task
  ]
  assert.deepEqual(overridesFollowingShift(master, tasks).map((t) => t.id), ['o1'])
  assert.deepEqual(overridesFollowingShift({ id: 's' }, tasks), [])
})
