// 自動 settings (lib/settings-auto.ts): null = the behaviour before PR #131,
// for both DB schemas (before / after migration 20261002110000).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveDefaultView, monthGridStartDay, weekViewAlignDay, resolveTaskMinutes,
  prefsFromRow, prefsToRow, AUTO_TASK_MINUTES,
} from '../../lib/settings-auto.ts'

test('自動 view: desktop 日, phones 週; an explicit pick wins on every device', () => {
  assert.equal(resolveDefaultView(null, false), 'day')
  assert.equal(resolveDefaultView(null, true), 'week')
  assert.equal(resolveDefaultView(undefined, true), 'week')
  for (const v of ['day', 'week', 'month']) {
    assert.equal(resolveDefaultView(v, false), v)
    assert.equal(resolveDefaultView(v, true), v)
  }
  assert.equal(resolveDefaultView('bogus', false), 'day')
})

test('自動 week start: month grid from Sunday, week view not aligned', () => {
  assert.equal(monthGridStartDay(null), 0)
  assert.equal(weekViewAlignDay(null), null)
  assert.equal(monthGridStartDay(1), 1)
  assert.equal(weekViewAlignDay(1), 1)
  assert.equal(monthGridStartDay(0), 0)
  assert.equal(weekViewAlignDay(0), 0) // explicit 週日 aligns, unlike 自動
  assert.equal(weekViewAlignDay(7), null)
})

test('自動 task length is 30; explicit 15-240 is used', () => {
  assert.equal(resolveTaskMinutes(null), AUTO_TASK_MINUTES)
  assert.equal(AUTO_TASK_MINUTES, 30)
  assert.equal(resolveTaskMinutes(60), 60)
  assert.equal(resolveTaskMinutes(15), 15)
  assert.equal(resolveTaskMinutes(5), 30)
  assert.equal(resolveTaskMinutes(999), 30)
})

const legacyRow = (o = {}) => ({ default_view: 'week', week_start_day: 1, buffer_time: { defaultDuration: 15 }, ...o })
const newRow = (o = {}) => ({ default_view: null, week_start_day: null, default_task_minutes: null, ...o })

test('before the migration: the old DB defaults read as 自動, other values as picked', () => {
  const p = prefsFromRow(legacyRow())
  assert.deepEqual(p, { defaultView: null, weekStartDay: null, defaultTaskMinutes: null, autoColumns: false })
  // buffer_time.defaultDuration is the buffer length, never the task length.
  assert.equal(prefsFromRow(legacyRow({ buffer_time: { defaultDuration: 60 } })).defaultTaskMinutes, null)
  const picked = prefsFromRow(legacyRow({ default_view: 'month', week_start_day: 0 }))
  assert.equal(picked.defaultView, 'month')
  assert.equal(picked.weekStartDay, 0)
})

test('after the migration: null is 自動 and every value is taken literally', () => {
  assert.deepEqual(prefsFromRow(newRow()), { defaultView: null, weekStartDay: null, defaultTaskMinutes: null, autoColumns: true })
  const p = prefsFromRow(newRow({ default_view: 'week', week_start_day: 1, default_task_minutes: 60 }))
  assert.deepEqual(p, { defaultView: 'week', weekStartDay: 1, defaultTaskMinutes: 60, autoColumns: true })
})

test('writing: nulls on the new schema, old defaults (no minutes column) on the old one', () => {
  assert.deepEqual(prefsToRow({ defaultView: null, weekStartDay: null, defaultTaskMinutes: null, autoColumns: true }),
    { default_view: null, week_start_day: null, default_task_minutes: null })
  assert.deepEqual(prefsToRow({ defaultView: null, weekStartDay: null, defaultTaskMinutes: 60, autoColumns: false }),
    { default_view: 'week', week_start_day: 1 })
  assert.deepEqual(prefsToRow({ defaultView: 'month', weekStartDay: 0, defaultTaskMinutes: null, autoColumns: false }),
    { default_view: 'month', week_start_day: 0 })
  // Round trip on the old schema: 自動 stays 自動.
  assert.deepEqual(prefsFromRow({ ...prefsToRow({ defaultView: null, weekStartDay: null, defaultTaskMinutes: null, autoColumns: false }) }),
    { defaultView: null, weekStartDay: null, defaultTaskMinutes: null, autoColumns: false })
})
