/* eslint-disable no-console -- CLI test script */
/**
 * 企鵝的冰屋 — pure-function checks for lib/igloo/compute.ts (+ lines/ledger).
 *
 *   node scripts/e2e/igloo-compute-verify.mjs
 *
 * Needs Node ≥ 22.6 (built-in TypeScript type stripping; Node 23.6+ does it
 * without a flag). No network, no browser.
 */
process.env.TZ = 'Asia/Taipei'
import assert from 'node:assert/strict'

const { computeIgloo, brickSlot, BRICKS_PER_IGLOO, IGLOO_LAYERS, localDay } = await import('../../lib/igloo/compute.ts')
const { iglooLine, catchUpLine } = await import('../../lib/igloo/lines.ts')
const { mergeIglooLedger, ledgerTasks, startFocusCounting } = await import('../../lib/igloo/local.ts')

let passed = 0
const results = []
function check(name, fn) {
  try {
    fn()
    passed++
    results.push(`PASS  ${name}`)
  } catch (e) {
    results.push(`FAIL  ${name} — ${e.message}`)
  }
}

// Local Taipei times (UTC+8).
const at = (day, hm = '14:00') => new Date(`${day}T${hm}:00+08:00`)
const NOW = at('2026-10-03', '15:00')
const done = (id, day, hm = '10:00') => ({ id, isCompleted: true, completedAt: at(day, hm).toISOString() })
const many = (n, day, prefix = 't') => Array.from({ length: n }, (_, i) => done(`${prefix}${i}`, day))

check('constants: 35 bricks in 5 courses, bottom courses fill first', () => {
  assert.equal(BRICKS_PER_IGLOO, 35)
  assert.deepEqual([...IGLOO_LAYERS], [6, 7, 8, 8, 6])
})

check('0 bricks → fresh igloo, building, no last active day', () => {
  const s = computeIgloo([], {}, NOW)
  assert.equal(s.totalBricks, 0)
  assert.equal(s.bricksToday, 0)
  assert.equal(s.iglooIndex, 0)
  assert.equal(s.bricksInCurrent, 0)
  assert.equal(s.lastActiveDate, null)
  assert.equal(s.daysIdle, null)
  assert.equal(s.mood, 'building')
})

check('ignores not-completed tasks', () => {
  const s = computeIgloo([{ id: 'a', isCompleted: false, completedAt: null }, done('b', '2026-10-03')], {}, NOW)
  assert.equal(s.totalBricks, 1)
  assert.equal(s.bricksToday, 1)
})

check('exactly one igloo finished today → proud, next igloo empty', () => {
  const s = computeIgloo(many(35, '2026-10-03'), {}, NOW)
  assert.equal(s.totalBricks, 35)
  assert.equal(s.completedIgloos, 1)
  assert.equal(s.iglooIndex, 1)
  assert.equal(s.bricksInCurrent, 0)
  assert.equal(s.finishedToday, true)
  assert.equal(s.mood, 'proud')
})

check('igloo finished yesterday → today it is just building again', () => {
  const s = computeIgloo(many(35, '2026-10-02'), {}, NOW)
  assert.equal(s.completedIgloos, 1)
  assert.equal(s.finishedToday, false)
  assert.equal(s.mood, 'building')
  assert.equal(s.daysIdle, 1)
})

check('crossing into the third igloo (30 old + 45 today = 75)', () => {
  const s = computeIgloo([...many(30, '2026-09-28', 'old'), ...many(45, '2026-10-03', 'new')], {}, NOW)
  assert.equal(s.totalBricks, 75)
  assert.equal(s.completedIgloos, 2)
  assert.equal(s.iglooIndex, 2)
  assert.equal(s.bricksInCurrent, 5)
  assert.equal(s.bricksToday, 45)
  assert.equal(s.finishedToday, true)
  assert.equal(s.mood, 'proud')
})

check('today 0 but yesterday had bricks → building, daysIdle 1, quiet-today line', () => {
  const s = computeIgloo(many(4, '2026-10-02'), {}, NOW)
  assert.equal(s.bricksToday, 0)
  assert.equal(s.lastActiveDate, '2026-10-02')
  assert.equal(s.daysIdle, 1)
  assert.equal(s.mood, 'building')
  const zh = iglooLine(s, 'zh-TW', 'x')
  assert.ok(!/今天搬了/.test(zh), zh)
})

check('three days off → waiting (never sleeping in daytime), bricks kept', () => {
  const s = computeIgloo(many(12, '2026-09-30'), { '2026-09-30': 2 }, NOW)
  assert.equal(s.daysIdle, 3)
  assert.equal(s.totalBricks, 14)
  assert.equal(s.mood, 'waiting')
  const en = iglooLine(s, 'en', 'x')
  assert.ok(!/[㐀-鿿]/.test(en), 'english line has no CJK: ' + en)
})

check('late night (23:30 and 02:00) → sleeping', () => {
  const tasks = many(3, '2026-10-03')
  assert.equal(computeIgloo(tasks, {}, at('2026-10-03', '23:30')).mood, 'sleeping')
  assert.equal(computeIgloo(many(3, '2026-10-02'), {}, at('2026-10-03', '02:00')).mood, 'sleeping')
  assert.equal(computeIgloo(tasks, {}, at('2026-10-03', '05:00')).mood, 'building')
})

check('proud beats sleeping (finished an igloo at 23:40)', () => {
  const s = computeIgloo(many(35, '2026-10-03'), {}, at('2026-10-03', '23:40'))
  assert.equal(s.mood, 'proud')
})

check('focus sessions add bricks per day; bad keys/values ignored', () => {
  const s = computeIgloo([], { '2026-10-03': 3, '2026-10-01': 2, 'nope': 9, '2026-10-02': -4 }, NOW)
  assert.equal(s.totalBricks, 5)
  assert.equal(s.bricksToday, 3)
  assert.equal(s.lastActiveDate, '2026-10-03')
})

check('recompute is idempotent and duplicate ids count once', () => {
  const tasks = [...many(8, '2026-10-03'), ...many(8, '2026-10-03')]
  const a = computeIgloo(tasks, { '2026-10-03': 1 }, NOW)
  const b = computeIgloo(tasks, { '2026-10-03': 1 }, NOW)
  const c = computeIgloo(computeInputsCopy(tasks), { '2026-10-03': 1 }, NOW)
  assert.deepEqual(a, b)
  assert.deepEqual(a, c)
  assert.equal(a.totalBricks, 9)
})
function computeInputsCopy(t) { return JSON.parse(JSON.stringify(t)) }

check('local day boundary: 23:59 vs 00:01 Taipei land on different days', () => {
  const s = computeIgloo([done('late', '2026-10-02', '23:59'), done('early', '2026-10-03', '00:01')], {}, NOW)
  assert.equal(s.bricksToday, 1)
  assert.equal(localDay(at('2026-10-03', '00:01')), '2026-10-03')
})

check('ledger keeps bricks of deleted tasks; undated ledger rows still count', () => {
  let { next } = mergeIglooLedger({ tasks: {}, focus: {} }, many(3, '2026-10-03'), { date: '2026-10-03', count: 2 })
  // task t0 deleted from the live list; an undated legacy task appears
  const merged = mergeIglooLedger(next, [{ id: 'legacy', isCompleted: true }], { date: '2026-10-03', count: 1 })
  next = merged.next
  assert.equal(next.focus['2026-10-03'], 2, 'focus count never goes down')
  const s = computeIgloo(ledgerTasks(next), next.focus, NOW)
  assert.equal(s.totalBricks, 6)
  assert.equal(s.bricksToday, 5)
  const again = mergeIglooLedger(next, many(3, '2026-10-03'), next.focusSeen)
  assert.equal(again.changed, false, 'merging the same data twice changes nothing')
  // re-running the merge from the same loaded ledger is idempotent
  const loaded = { tasks: {}, focus: {}, focusSeen: { date: '2026-10-03', count: 1 } }
  const a = mergeIglooLedger(loaded, many(2, '2026-10-03'), { date: '2026-10-03', count: 4 })
  const b = mergeIglooLedger(loaded, many(2, '2026-10-03'), { date: '2026-10-03', count: 4 })
  assert.deepEqual(a, b)
  assert.equal(a.next.focus['2026-10-03'], 3)
})

check('pomodoros on a shared device go to the account that was signed in', () => {
  const D = '2026-10-03'
  const store = {} // userId → ledger, as in localStorage
  let device = 0 // lib/pomodoro-count.ts: one counter per device
  let active = null // the device-wide "last active account" key
  let session = null // { user, loaded } — what IglooHost holds in memory
  const signIn = (user) => {
    const local = store[user] ?? { tasks: {}, focus: {} }
    session = { user, loaded: startFocusCounting(local, active, user, { date: D, count: device }) }
    active = user
    sync()
  }
  const sync = () => { store[session.user] = mergeIglooLedger(session.loaded, [], { date: D, count: device }).next }
  const pomodoro = (n = 1) => { device += n; sync() }
  const reload = () => signIn(session.user)
  const focusOf = (user) => store[user]?.focus[D] ?? 0

  signIn('A'); pomodoro(3)
  assert.equal(focusOf('A'), 3)
  signIn('B'); pomodoro(2) // device counter 3 → 5
  assert.equal(focusOf('B'), 2, 'B gets only its own 2')
  assert.equal(focusOf('A'), 3, "A doesn't get B's")
  signIn('A'); pomodoro(1) // back to A: 5 → 6
  assert.equal(focusOf('A'), 4, 'A: 3 + 1')
  assert.equal(focusOf('B'), 2)
  reload(); reload() // same account reloading never double-counts
  assert.equal(focusOf('A'), 4)
  pomodoro(1)
  assert.equal(focusOf('A'), 5)
  // next day: the device counter restarts at 0
  const E = '2026-10-04'
  session.loaded = store['A']
  store['A'] = mergeIglooLedger(session.loaded, [], { date: E, count: 1 }).next
  assert.equal(store['A'].focus[E], 1)
  assert.equal(store['A'].focus[D], 5, 'yesterday untouched')
})

check('brick slots fill bottom course first and stay in range', () => {
  assert.deepEqual(brickSlot(0), { layer: 0, index: 0 })
  assert.deepEqual(brickSlot(5), { layer: 0, index: 5 })
  assert.deepEqual(brickSlot(6), { layer: 1, index: 0 })
  assert.deepEqual(brickSlot(13), { layer: 2, index: 0 })
  assert.deepEqual(brickSlot(34), { layer: 4, index: 5 })
  assert.deepEqual(brickSlot(99), { layer: 4, index: 5 })
})

check('catch-up line wording', () => {
  assert.equal(catchUpLine(2, 'zh-TW', false), '你不在的時候，我幫你搬了 2 塊。')
  assert.equal(catchUpLine(1, 'en', false), 'While you were away, I carried 1 brick for you.')
})

for (const r of results) console.log(r)
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
