// Calendar drag math (e2edrag 高-1 / 低-1) and the week-start / hour-range
// helpers behind 每週開始日 and 日曆顯示時間範圍.
// Before: the grid treated the pointer's pixel offset as minutes, so any zoom
// other than 60 px/hour wrote the wrong time, and a move dragged to the bottom
// edge was squeezed to 15 minutes.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeDragRange,
  daysSinceWeekStart,
  orderedWeekdays,
  isValidHourRange,
  parseDateString,
} from '../../lib/calendar-utils.ts'

const MIN = 0
const MAX = 24 * 60
const base = { min: MIN, max: MAX, originalStart: 9 * 60, originalEnd: 10 * 60, currentStart: 9 * 60, currentEnd: 10 * 60 }
// Pointer Y (px from grid top) for a given minute at a zoom level.
const y = (minutes, hh) => ((minutes - MIN) / 60) * hh

for (const hh of [40, 60, 80, 100]) {
  test(`move: 09:00 block dragged 2 visual hours lands on 11:00 at ${hh}px/h`, () => {
    const grab = 15 // grabbed 15px below the block's top edge
    const r = computeDragRange({ ...base, hourHeight: hh, dragType: 'move', grabOffsetY: grab, pointerY: y(11 * 60, hh) + grab })
    assert.deepEqual(r, { start: 11 * 60, end: 12 * 60 })
  })

  test(`resize-bottom: dragging the bottom edge to the 13:00 line ends at 13:00 at ${hh}px/h`, () => {
    const r = computeDragRange({ ...base, hourHeight: hh, dragType: 'resize-bottom', grabOffsetY: 0, pointerY: y(13 * 60, hh) })
    assert.deepEqual(r, { start: 9 * 60, end: 13 * 60 })
  })

  test(`resize-top: dragging the top edge to 08:15 starts at 08:15 at ${hh}px/h`, () => {
    const r = computeDragRange({ ...base, hourHeight: hh, dragType: 'resize-top', grabOffsetY: 0, pointerY: y(8 * 60 + 15, hh) })
    assert.deepEqual(r, { start: 8 * 60 + 15, end: 10 * 60 })
  })
}

test('the reported 80px/h case no longer lands at 12:45', () => {
  // e2edrag: zoom in (80 px/h), drag 09:00-10:00 down 160px → was 12:45-13:45.
  const r = computeDragRange({ ...base, hourHeight: 80, dragType: 'move', grabOffsetY: 15, pointerY: y(9 * 60, 80) + 15 + 160 })
  assert.deepEqual(r, { start: 11 * 60, end: 12 * 60 })
})

test('snaps to 15 minutes', () => {
  // 7 minutes past 11:00 at 60px/h → 11:00; 8 minutes → 11:15.
  assert.equal(computeDragRange({ ...base, hourHeight: 60, dragType: 'move', grabOffsetY: 0, pointerY: y(11 * 60 + 7, 60) }).start, 11 * 60)
  assert.equal(computeDragRange({ ...base, hourHeight: 60, dragType: 'move', grabOffsetY: 0, pointerY: y(11 * 60 + 8, 60) }).start, 11 * 60 + 15)
})

test('move to the bottom edge keeps the full length and sits flush with the end', () => {
  const r = computeDragRange({ ...base, min: 6 * 60, max: 23 * 60, hourHeight: 60, dragType: 'move', grabOffsetY: 10, pointerY: 10_000 })
  assert.deepEqual(r, { start: 22 * 60, end: 23 * 60 })
})

test('move above the top edge clamps to the first visible minute, length kept', () => {
  const r = computeDragRange({ ...base, min: 6 * 60, max: 23 * 60, hourHeight: 80, dragType: 'move', grabOffsetY: 10, pointerY: -500 })
  assert.deepEqual(r, { start: 6 * 60, end: 7 * 60 })
})

test('a block longer than the visible range is shrunk to fit, never past max', () => {
  const r = computeDragRange({ ...base, min: 8 * 60, max: 10 * 60, originalStart: 8 * 60, originalEnd: 12 * 60, hourHeight: 60, dragType: 'move', grabOffsetY: 0, pointerY: 300 })
  assert.deepEqual(r, { start: 8 * 60, end: 10 * 60 })
})

test('resize keeps at least 15 minutes', () => {
  const top = computeDragRange({ ...base, hourHeight: 60, dragType: 'resize-top', grabOffsetY: 0, pointerY: y(11 * 60, 60) })
  assert.deepEqual(top, { start: 9 * 60 + 45, end: 10 * 60 })
  const bottom = computeDragRange({ ...base, hourHeight: 60, dragType: 'resize-bottom', grabOffsetY: 0, pointerY: y(7 * 60, 60) })
  assert.deepEqual(bottom, { start: 9 * 60, end: 9 * 60 + 15 })
})

test('daysSinceWeekStart: Friday 2026-10-02', () => {
  const fri = parseDateString('2026-10-02')
  assert.equal(daysSinceWeekStart(fri, 0), 5) // week starts Sunday 9/27
  assert.equal(daysSinceWeekStart(fri, 1), 4) // week starts Monday 9/28
  assert.equal(daysSinceWeekStart(parseDateString('2026-09-27'), 1), 6) // Sunday in a Monday week
  assert.equal(daysSinceWeekStart(parseDateString('2026-09-28'), 1), 0)
})

test('orderedWeekdays', () => {
  assert.deepEqual(orderedWeekdays(0), [0, 1, 2, 3, 4, 5, 6])
  assert.deepEqual(orderedWeekdays(1), [1, 2, 3, 4, 5, 6, 0])
})

test('month grid leading days: October 2026 starts on a Thursday', () => {
  const first = parseDateString('2026-10-01')
  assert.equal(daysSinceWeekStart(first, 0), 4) // Sun Mon Tue Wed from September
  assert.equal(daysSinceWeekStart(first, 1), 3) // Mon Tue Wed from September
})

test('isValidHourRange', () => {
  assert.equal(isValidHourRange(8, 20), true)
  assert.equal(isValidHourRange(0, 24), true)
  assert.equal(isValidHourRange(20, 8), false)
  assert.equal(isValidHourRange(9, 9), false)
  assert.equal(isValidHourRange(-1, 10), false)
  assert.equal(isValidHourRange(0, 25), false)
})
