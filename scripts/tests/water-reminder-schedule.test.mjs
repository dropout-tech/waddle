// 喝水提醒 scheduling rules (lib/water-reminder.ts): when the popup may appear, and the chain of
// iOS background reminders. Quiet window + focus stretch + interval, all as pure functions.
// Run: node --test scripts/tests/water-reminder-schedule.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { installReminderTestEnv } from './reminder-test-env.mjs'

installReminderTestEnv()
const W = await import('../../lib/water-reminder.ts')
const Q = await import('../../lib/quiet-hours.ts')

const at = (h, m = 0, s = 0, day = 10, month = 9) => new Date(2026, month, day, h, m, s, 0).getTime()
const label = (ms) => {
  const d = new Date(ms)
  return `${d.getDate()}日${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const NIGHT = Q.WATER_NIGHT_WINDOW
const MIN = 60_000

// ── the popup's decision ──────────────────────────────────────────────────────────────────

test('verdict: not due → wait; due and free → show', () => {
  const base = { quiet: NIGHT, focusBusy: false }
  assert.equal(W.waterReminderVerdict({ ...base, now: at(14, 0), due: at(14, 30) }), 'wait')
  assert.equal(W.waterReminderVerdict({ ...base, now: at(14, 30), due: at(14, 30) }), 'show')
  assert.equal(W.waterReminderVerdict({ ...base, now: at(16, 0), due: at(14, 30) }), 'show', 'overdue by hours still shows')
})

test('verdict: due while the night window is on → quiet; the stored due time shows once the window ends', () => {
  const due = at(22, 10)
  assert.equal(W.waterReminderVerdict({ now: at(22, 10), due, quiet: NIGHT, focusBusy: false }), 'quiet')
  assert.equal(W.waterReminderVerdict({ now: at(3, 0, 0, 11), due, quiet: NIGHT, focusBusy: false }), 'quiet')
  assert.equal(W.waterReminderVerdict({ now: at(7, 59, 59, 11), due, quiet: NIGHT, focusBusy: false }), 'quiet')
  assert.equal(W.waterReminderVerdict({ now: at(8, 0, 0, 11), due, quiet: NIGHT, focusBusy: false }), 'show', 'deferred to the end of the window, not dropped')
})

test('verdict: a running focus stretch holds the reminder (kept, not consumed); a break does not', () => {
  const due = at(10, 0)
  assert.equal(W.waterReminderVerdict({ now: at(10, 5), due, quiet: NIGHT, focusBusy: true }), 'focus')
  assert.equal(W.waterReminderVerdict({ now: at(10, 6), due, quiet: NIGHT, focusBusy: false }), 'show')
  assert.equal(W.waterReminderVerdict({ now: at(9, 55), due, quiet: NIGHT, focusBusy: true }), 'wait', 'not due yet beats everything')
})

test('verdict: quiet outranks focus — nothing is shown (or flagged "after focus") at night', () => {
  assert.equal(W.waterReminderVerdict({ now: at(23, 0), due: at(22, 30), quiet: NIGHT, focusBusy: true }), 'quiet')
})

test('verdict follows the user\'s own 勿擾時段 instead of the built-in night', () => {
  const lunch = Q.waterQuietWindow(Q.resolveQuietHours({ enabled: true, startTime: '12:00', endTime: '13:00' }))
  assert.equal(W.waterReminderVerdict({ now: at(12, 30), due: at(12, 0), quiet: lunch, focusBusy: false }), 'quiet')
  assert.equal(W.waterReminderVerdict({ now: at(13, 0), due: at(12, 0), quiet: lunch, focusBusy: false }), 'show')
  assert.equal(W.waterReminderVerdict({ now: at(23, 0), due: at(22, 0), quiet: lunch, focusBusy: false }), 'show', 'night is no longer special once the user picked a window')
})

test('isFocusRunning: only a counting work phase (pomodoro or stopwatch)', () => {
  assert.equal(W.isFocusRunning('running', 'work'), true)
  assert.equal(W.isFocusRunning('running', 'break'), false)
  assert.equal(W.isFocusRunning('paused', 'work'), false)
  assert.equal(W.isFocusRunning('idle', undefined), false)
  assert.equal(W.isFocusRunning('completed', 'work'), false)
})

test('effectiveWaterDueAt: a due time inside the quiet window is shown as its end', () => {
  assert.equal(W.effectiveWaterDueAt(null, NIGHT), null)
  assert.equal(W.effectiveWaterDueAt(at(15, 0), NIGHT), at(15, 0))
  assert.equal(label(W.effectiveWaterDueAt(at(23, 15), NIGHT)), '11日08:00')
})

// ── the iOS background chain ──────────────────────────────────────────────────────────────

test('chain: hourly from the next due time, the night skipped (the old code scheduled exactly one)', () => {
  const plan = W.planWaterReminders({ nextDueAt: at(14, 0), now: at(13, 0), intervalMin: 60, quiet: NIGHT, max: 12 })
  assert.deepEqual(plan.map(label), [
    '10日14:00', '10日15:00', '10日16:00', '10日17:00', '10日18:00', '10日19:00', '10日20:00', '10日21:00',
    '11日08:00', '11日09:00', '11日10:00', '11日11:00',
  ])
})

test('chain: a step that lands in the night becomes the window end and the next step counts from there', () => {
  const plan = W.planWaterReminders({ nextDueAt: at(21, 30), now: at(20, 0), intervalMin: 90, quiet: NIGHT, max: 4 })
  assert.deepEqual(plan.map(label), ['10日21:30', '11日08:00', '11日09:30', '11日11:00'])
})

test('chain: honours the interval choices 30 / 60 / 90 / 120', () => {
  for (const every of [30, 60, 90, 120]) {
    const plan = W.planWaterReminders({ nextDueAt: at(9, 0), now: at(8, 30), intervalMin: every, quiet: NIGHT, max: 5 })
    for (let i = 1; i < plan.length; i++) assert.equal(plan[i] - plan[i - 1], every * MIN, `${every} min step ${i}`)
  }
})

test('chain: already due → the app shows it; the first background nudge is one interval from now', () => {
  const plan = W.planWaterReminders({ nextDueAt: at(13, 0), now: at(13, 20), intervalMin: 60, quiet: NIGHT, max: 3 })
  assert.deepEqual(plan.map(label), ['10日14:20', '10日15:20', '10日16:20'])
})

test('chain: nothing when there is no due time or no budget', () => {
  assert.deepEqual(W.planWaterReminders({ nextDueAt: null, now: at(9), intervalMin: 60, quiet: NIGHT, max: 12 }), [])
  assert.deepEqual(W.planWaterReminders({ nextDueAt: at(10), now: at(9), intervalMin: 60, quiet: NIGHT, max: 0 }), [])
})

test('chain: never more than `max`, strictly increasing, never inside the window — for every start minute and interval', () => {
  const windows = [NIGHT, { startMin: 23 * 60 + 30, endMin: 7 * 60 }, { startMin: 12 * 60, endMin: 13 * 60 + 30 }]
  for (const quiet of windows) {
    for (const every of [30, 60, 90, 120]) {
      for (let minute = 0; minute < 24 * 60; minute += 7) {
        const nextDueAt = at(Math.floor(minute / 60), minute % 60)
        const plan = W.planWaterReminders({ nextDueAt, now: nextDueAt - 5 * MIN, intervalMin: every, quiet, max: 12 })
        assert.equal(plan.length, 12)
        for (let i = 0; i < plan.length; i++) {
          assert.equal(Q.isInQuietWindow(plan[i], quiet), false, `${label(plan[i])} is inside ${JSON.stringify(quiet)} (every ${every}, start ${label(nextDueAt)})`)
          if (i > 0) assert.ok(plan[i] > plan[i - 1], 'strictly increasing')
        }
      }
    }
  }
})

test('chain: a running pomodoro holds everything before its end, then the chain continues from there', () => {
  // Focus ends 14:25, water was due 14:10 → first water note just after the focus-end note, then hourly.
  const plan = W.planWaterReminders({ nextDueAt: at(14, 10), now: at(14, 0), intervalMin: 60, quiet: NIGHT, max: 3, focusEndsAt: at(14, 25) })
  assert.deepEqual(plan.map(label), ['10日14:25', '10日15:25', '10日16:25'])
  assert.equal(plan[0], at(14, 25) + W.WATER_AFTER_FOCUS_DELAY_MS)
  // Due AFTER the focus ends: untouched.
  assert.equal(W.planWaterReminders({ nextDueAt: at(15, 0), now: at(14, 0), intervalMin: 60, quiet: NIGHT, max: 1, focusEndsAt: at(14, 25) })[0], at(15, 0))
  // Already overdue during focus: it waits for the end of the focus instead of "one interval from now".
  assert.equal(W.planWaterReminders({ nextDueAt: at(13, 50), now: at(14, 0), intervalMin: 60, quiet: NIGHT, max: 1, focusEndsAt: at(14, 25) })[0], at(14, 25) + W.WATER_AFTER_FOCUS_DELAY_MS)
  // A focus end in the past (or none) changes nothing.
  assert.equal(W.planWaterReminders({ nextDueAt: at(14, 10), now: at(14, 30), intervalMin: 60, quiet: NIGHT, max: 1, focusEndsAt: at(14, 25) })[0], at(14, 30) + 60 * MIN)
})

test('chain: a focus end that lands at night still respects the quiet window', () => {
  const plan = W.planWaterReminders({ nextDueAt: at(21, 50), now: at(21, 40), intervalMin: 60, quiet: NIGHT, max: 2, focusEndsAt: at(22, 15) })
  assert.deepEqual(plan.map(label), ['11日08:00', '11日09:00'])
})

// ── asking native to re-plan right away ─────────────────────────────────────────────────

test('every change to the schedule asks the widget sync to re-plan now (不等 30 秒輪詢)', () => {
  const store = new Map()
  const events = []
  globalThis.window = {
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    dispatchEvent: (e) => { events.push(e.type); return true },
  }
  try {
    W.scheduleNextWaterReminder(60) // 喝了
    assert.deepEqual(events, ['huddle-widget-refresh'])
    W.setWaterNextDueAt(Date.now() + 5 * MIN) // 稍後
    W.setWaterReminderEnabled(false) // 關閉
    W.setWaterReminderInterval(90) // 改間隔
    assert.equal(events.length, 4)
    W.recordWaterFromWidget(Date.now() + 10 * MIN) // 在小工具上喝了
    assert.equal(events.length, 5)
    assert.ok(events.every((e) => e === 'huddle-widget-refresh'))
  } finally {
    delete globalThis.window
  }
})
