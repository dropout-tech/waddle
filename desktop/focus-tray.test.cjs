const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createFocusTray, trayTitle, TRAY_GUID, POSITION_KEY } = require('./focus-tray.cjs')
function setup(platform = 'darwin', defaults = {}) {
  const trays = []; let focused = 0; let time = 1_000_000; const pending = []
  class Tray extends EventEmitter {
    constructor(image, guid) { super(); this.image = image; this.guid = guid; this.titles = []; trays.push(this) }
    setToolTip(t) { this.tip = t }
    setTitle(t, o) { this.titles.push(t); this.options = o }
    destroy() { this.destroyed = true }
  }
  const timers = { setTimeout: (fn, ms) => { const h = { fn, ms }; pending.push(h); return h }, clearTimeout: h => { const i = pending.indexOf(h); if (i >= 0) pending.splice(i, 1) } }
  const systemPreferences = { getUserDefault: k => defaults[k] ?? 0, setUserDefault: (k, type, v) => { defaults[k] = v } }
  const api = createFocusTray({ Tray, nativeImage: { createEmpty: () => 'empty' }, systemPreferences, platform, trusted: e => e === 'main-frame', focus: () => focused++, now: () => time, timers })
  return { api, trays, defaults, pending, focused: () => focused, advance: ms => { time += ms }, now: () => time }
}
const running = (start, extra = {}) => ({ state: 'running', mode: 'pomodoro', startedAt: start, pausedMs: 0, pausedAt: null, targetSeconds: 1500, prefix: '專注', ...extra })
test('pomodoro counts down, stopwatch counts up, pauses freeze, completion shows only the word', () => {
  const t0 = 5_000_000
  assert.equal(trayTitle(running(t0), t0), '專注 25:00')
  assert.equal(trayTitle(running(t0), t0 + 1_999), '專注 24:59')
  assert.equal(trayTitle(running(t0, { mode: 'stopwatch', targetSeconds: 0 }), t0 + 3_725_000), '專注 1:02:05')
  assert.equal(trayTitle(running(t0, { state: 'paused', pausedAt: t0 + 60_000, prefix: '已暫停' }), t0 + 999_000), '已暫停 24:00')
  assert.equal(trayTitle(running(t0, { pausedMs: 30_000 }), t0 + 90_000), '專注 24:00')
  assert.equal(trayTitle(running(t0), t0 + 9_999_000), '專注 00:00')
  assert.equal(trayTitle(running(t0, { state: 'completed', prefix: '休息結束' }), t0), '休息結束')
})
test('untrusted callers are rejected and malformed payloads never reach the menu bar', () => {
  const { api, trays } = setup()
  assert.throws(() => api.set('iframe', running(0)))
  for (const bad of [{}, running(0, { state: 'idle' }), running(0, { startedAt: NaN }), running(0, { pausedAt: 'x' }), running(0, { prefix: 'x'.repeat(41) }), running(0, { targetSeconds: 1e9 })]) {
    assert.throws(() => api.set('main-frame', bad))
  }
  assert.equal(trays.length, 0)
})
test('shows a text-only status item, ticks on the second boundary, and clears on stop', () => {
  const { api, trays, pending, advance, now, focused } = setup()
  api.set('main-frame', running(now() - 400))
  assert.equal(trays.length, 1); assert.equal(trays[0].image, 'empty')
  assert.equal(trays[0].titles.at(-1), '專注 25:00'); assert.equal(trays[0].options.fontType, 'monospacedDigit')
  assert.equal(pending.length, 1); assert.equal(pending[0].ms, 620)
  advance(620); pending.shift().fn()
  assert.equal(trays[0].titles.at(-1), '專注 24:59'); assert.equal(pending.length, 1)
  trays[0].emit('click'); assert.equal(focused(), 1)
  api.set('main-frame', running(now() - 400, { state: 'paused', pausedAt: now(), prefix: '已暫停' }))
  assert.equal(pending.length, 0, 'paused title is static')
  api.set('main-frame', null)
  assert.equal(trays[0].destroyed, true); assert.equal(api.title(), null)
})
test('clear() removes the item when the main window goes away; other platforms are a no-op', () => {
  const mac = setup()
  mac.api.set('main-frame', running(mac.now()))
  mac.api.clear()
  assert.equal(mac.trays[0].destroyed, true); assert.equal(mac.pending.length, 0)
  const win = setup('win32')
  assert.deepEqual(win.api.set('main-frame', running(win.now())), { status: 'unsupported' })
  assert.equal(win.trays.length, 0)
})
test('keeps one stable identity and seeds a right-side spot only when the user has none', () => {
  const fresh = setup()
  fresh.api.set('main-frame', running(fresh.now()))
  assert.equal(fresh.trays[0].guid, TRAY_GUID)
  assert.equal(fresh.defaults[POSITION_KEY], 400)
  const moved = setup('darwin', { [POSITION_KEY]: 1234 })
  moved.api.set('main-frame', running(moved.now()))
  moved.api.set('main-frame', null); moved.api.set('main-frame', running(moved.now()))
  assert.equal(moved.defaults[POSITION_KEY], 1234, 'never overrides where the user dragged it')
  assert.equal(moved.trays.length, 2); assert.equal(moved.trays[1].guid, TRAY_GUID)
})
