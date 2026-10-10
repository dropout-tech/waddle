// 喝水提醒 A＋C glue (lib/water-moment.ts): what an ignored drop does to the schedule, and the tiny
// pet ⇄ host store. Run: node --test scripts/tests/water-moment.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { installReminderTestEnv } from './reminder-test-env.mjs'

installReminderTestEnv()
const M = await import('../../lib/water-moment.ts')
const MIN = 60_000
const now = new Date(2026, 9, 10, 14, 0, 0).getTime()

test('first ignore → ask again in 15 min and remember the streak', () => {
  const p = M.planAfterIgnore({ ignoredBefore: false, now, intervalMin: 60 })
  assert.equal(p.nextDueAt - now, 15 * MIN)
  assert.equal(p.ignoredOnce, true)
})

test('second ignore in a row → the round ends: a full interval, streak cleared', () => {
  for (const interval of [30, 60, 90, 120]) {
    const p = M.planAfterIgnore({ ignoredBefore: true, now, intervalMin: interval })
    assert.equal(p.nextDueAt - now, interval * MIN, `interval ${interval}`)
    assert.equal(p.ignoredOnce, false)
  }
})

test('a broken interval value never schedules in the past', () => {
  const p = M.planAfterIgnore({ ignoredBefore: true, now, intervalMin: 0 })
  assert.ok(p.nextDueAt > now)
})

test('the retry is shorter than every interval the user can pick (it is a nudge, not a new round)', () => {
  assert.ok(M.WATER_IGNORE_RETRY_MINUTES < 30)
  assert.equal(M.WATER_DROP_VISIBLE_MS, 60_000)
})

test('store: readiness and requests notify subscribers only on change', () => {
  let calls = 0
  const off = M.subscribeWaterMoment(() => { calls++ })
  M.setPetWaterReady(true)
  M.setPetWaterReady(true)
  assert.equal(M.getPetWaterReady(), true)
  assert.equal(calls, 1)
  const req = { id: 1, afterFocus: true, handlers: { drink() {}, later() {}, disable() {} } }
  M.setWaterPetRequest(req)
  M.setWaterPetRequest(req)
  assert.equal(M.getWaterPetRequest(), req)
  assert.equal(calls, 2)
  M.setWaterPetRequest(null)
  M.setPetWaterReady(false)
  assert.equal(calls, 4)
  off()
  M.setPetWaterReady(true)
  assert.equal(calls, 4, 'unsubscribed listeners stay quiet')
  M.setPetWaterReady(false)
})
