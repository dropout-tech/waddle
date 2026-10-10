// macOS menu-bar countdown for the focus timer ("專注 24:59").
// The renderer only sends wall-clock inputs on start/pause/resume/stop; the
// main process ticks the title itself, so it stays exact while minimized.
// Only numbers, a mode/state enum and one short translated word cross the boundary.
function shownSeconds(s, now) {
  const runningSec = Math.max(0, Math.floor(((s.pausedAt ?? now) - s.startedAt - s.pausedMs) / 1000))
  return s.mode === 'pomodoro' ? Math.max(0, s.targetSeconds - runningSec) : runningSec
}
// Same digits as formatTime() in lib/timer-format.ts.
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
function trayTitle(s, now) {
  return s.state === 'completed' ? s.prefix : `${s.prefix} ${formatTime(shownSeconds(s, now))}`.trim()
}
// A fixed id lets macOS keep the spot the user ⌘-drags it to. On first run we
// seed that spot toward the right: a crowded menu bar otherwise puts a new item
// at the far left, where the frontmost app's menus hide it.
const TRAY_GUID = 'c6f3a1d8-2b7e-4e59-9a14-7d0b5e2f8c31'
const POSITION_KEY = `NSStatusItem Preferred Position ${TRAY_GUID}`
const DEFAULT_POSITION = 400 // points from the right edge of the menu bar
const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
function parse(payload) {
  if (payload === null) return null
  const p = payload
  if (!p || !['running', 'paused', 'completed'].includes(p.state) || !['pomodoro', 'stopwatch'].includes(p.mode) ||
      !finite(p.startedAt, 0, 8.64e15) || !finite(p.pausedMs, 0, 8.64e15) ||
      !(p.pausedAt === null || finite(p.pausedAt, 0, 8.64e15)) || !finite(p.targetSeconds, 0, 86400) ||
      typeof p.prefix !== 'string' || p.prefix.length > 40) throw new Error('Invalid focus status')
  const prefix = p.prefix.replace(/\s+/g, ' ').trim().slice(0, 20)
  return { state: p.state, mode: p.mode, startedAt: p.startedAt, pausedMs: p.pausedMs, pausedAt: p.pausedAt, targetSeconds: p.targetSeconds, prefix }
}
function createFocusTray({ Tray, nativeImage, systemPreferences, platform, trusted, focus, now = Date.now, timers = { setTimeout, clearTimeout } }) {
  let tray = null
  let seeded = false
  function seedPosition() {
    if (seeded || !systemPreferences) return
    seeded = true
    try {
      if (!systemPreferences.getUserDefault(POSITION_KEY, 'double')) systemPreferences.setUserDefault(POSITION_KEY, 'double', DEFAULT_POSITION)
    } catch {}
  }
  let status = null
  let timer = null
  function stopTicking() { if (timer) { timers.clearTimeout(timer); timer = null } }
  function render() {
    stopTicking()
    if (!status) { if (tray) { tray.destroy(); tray = null } return }
    if (!tray) {
      // Text-only status item: an empty image keeps it to "專注 24:59".
      seedPosition()
      tray = new Tray(nativeImage.createEmpty(), TRAY_GUID)
      tray.setToolTip('Huddle')
      tray.on('click', focus)
    }
    const time = now()
    tray.setTitle(trayTitle(status, time), { fontType: 'monospacedDigit' })
    if (status.state !== 'running') return
    // Re-render right after the next whole second of the session clock.
    const ms = time - status.startedAt - status.pausedMs
    timer = timers.setTimeout(render, 1000 - (((ms % 1000) + 1000) % 1000) + 20)
    timer.unref?.()
  }
  function set(event, payload) {
    if (!trusted(event)) throw new Error('Untrusted focus status caller')
    if (platform !== 'darwin') return { status: 'unsupported' }
    status = parse(payload)
    render()
    return { status: 'ok' }
  }
  // Main window reloaded, crashed or closed: the timer that fed us is gone.
  function clear() { status = null; render() }
  return { set, clear, title: () => (status ? trayTitle(status, now()) : null) }
}
module.exports = { createFocusTray, trayTitle, formatTime, TRAY_GUID, POSITION_KEY }
