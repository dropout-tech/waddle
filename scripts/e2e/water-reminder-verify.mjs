/**
 * Water + meeting reminders in the real app (hooks/use-water-reminder.ts, hooks/use-meeting-reminders.ts):
 * the glue the pure-function tests can't see.
 *
 *   pnpm exec next dev -p 3481          (separate terminal; this worktree)
 *   E2E_BASE_URL=http://localhost:3481 E2E_STATE_FILE=$TMPDIR/e2e-state.json node scripts/e2e/water-reminder-verify.mjs
 *
 * Uses the test account in .env.e2e.local (one login, then the saved session is reused). Reads go to the
 * account's data; EVERY Supabase write (REST non-GET, storage, functions) is intercepted and answered
 * locally — the script counts them and fails if any slipped through. The tasks list is replaced by two
 * synthetic daily meetings; user_settings is rewritten per scenario (quiet hours, tour done). Time is
 * controlled with Playwright's page.clock so "03:00" or "14:00" are deterministic — scenario times are all
 * EARLIER than the real current time so the stored login never looks expired (no token refresh happens).
 *
 * The reminder itself (老闆 2026-10-10): A = the adopted penguin walks over with a glass + a card
 * (乾杯 / 等等再喝 / ⋯), C = a water drop in the corner when there is no penguin to send (not adopted,
 * muted…). `dueAfterFocus` is checked through the copy on screen (「剛好休息…」).
 * Optional: E2E_SHOTS_DIR=docs/features/water-special/shots-impl saves screenshots (animations frozen first).
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3481'
const STATE_FILE = process.env.E2E_STATE_FILE
const SHOTS = process.env.E2E_SHOTS_DIR || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const ONLY = process.env.E2E_ONLY ? new Set(process.env.E2E_ONLY.split(',')) : null
const run = (id) => !ONLY || ONLY.has(id)
const PET = { adopted: true, enabled: true, name: 'Huddle', color: 'ink', accessory: 'scarf', chattiness: 'low', quietDuringFocus: true }
/** Adopted but switched off: no penguin on screen AND no 「領養你的企鵝」 card in the way → the drop (C). */
const PET_OFF = { ...PET, enabled: false }
const CJK = /[\u3400-\u9fff\uff01-\uff5e\u3000-\u303f]/
const MIN = 60_000
const READ_RPCS = /\/rpc\/(get_|preview_)/

const results = []
const ok = (name, detail = '') => { results.push(['PASS', name]); console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`) }
const skip = (name, why) => { results.push(['SKIP', name]); console.log(`SKIP  ${name} — ${why}`) }
const writes = []
/** Every intercepted write with its body, so a scenario can assert WHAT the app tried to save. */
const writeLog = []

// ── time ────────────────────────────────────────────────────────────────────────────────
const today = new Date()
const at = (h, m = 0, s = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, s, 0)
if (at(0).getTime() + 12 * 3600_000 > Date.now()) console.warn('NOTE: run after noon so the scenario times (03:00–14:00) are in the past')
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Two daily series that started a few days ago: their master date is long past, today's meeting is only
// reachable by expanding the series.
const SERIES_START = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 9))
const taskRow = (id, title, start, end, categoryId, workspaceId, userId) => ({
  id, category_id: categoryId, workspace_id: workspaceId, title, description: null, task_type: 'one_time', urgency: 5,
  estimated_minutes: null, actual_minutes: null, due_date: null, scheduled_date: SERIES_START,
  scheduled_start_time: start + ':00', scheduled_end_time: end + ':00', calendar_color: '#7c8f7a', is_completed: false,
  completed_at: null, is_archived: false, archived_at: null, notes: null, sort_order: 0,
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', is_recurring: true, show_in_task_list: true,
  is_meeting: true, attendees: null, location: null, meeting_url: null, parent_id: null, exdates: null,
  recurrence_type: 'daily', recurrence_interval: 1, recurrence_days_of_week: null, recurrence_end_date: null, user_id: userId,
})

// ── backend interception ────────────────────────────────────────────────────────────────
async function installBackend(context, { quiet, meetings, pet }) {
  let cat
  let resolveCat
  const catReady = new Promise((r) => { resolveCat = r })
  await context.route('**/rest/v1/**', async (route) => {
   try {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    const isRead = method === 'GET' || method === 'HEAD' || (method === 'POST' && READ_RPCS.test(url.pathname))
    if (!isRead) {
      writes.push(`${method} ${url.pathname}`)
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      writeLog.push({ method, path: url.pathname, body })
      // A finished pomodoro saves its time block and reads the row back; answer like PostgREST would
      // (still local — nothing reaches Supabase) so the app doesn't pop a 「儲存失敗」 toast over the shot.
      if (method === 'POST' && url.pathname.endsWith('/time_blocks') && body && typeof body === 'object') {
        const rows = (Array.isArray(body) ? body : [body]).map((r) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r }))
        const single = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '')
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(single ? rows[0] : rows) })
      }
      return route.fulfill({ status: 204, body: '' })
    }
    if (method === 'GET' && url.pathname.endsWith('/user_settings')) {
      const res = await route.fetch()
      let json = await res.json()
      const fix = (row) => {
        if (!row || typeof row !== 'object') return row
        const n = { ...(row.notifications ?? {}) }
        if (pet) n.pet = pet
        else delete n.pet
        if (quiet) n.quietHours = quiet
        else n.quietHours = { enabled: false, startTime: '22:00', endTime: '08:00', allowUrgent: true }
        return { ...row, notifications: n, onboarding_completed: true }
      }
      json = Array.isArray(json) ? json.map(fix) : fix(json)
      return route.fulfill({ response: res, json })
    }
    if (method === 'GET' && url.pathname.endsWith('/categories')) {
      const res = await route.fetch()
      const json = await res.json()
      if (Array.isArray(json) && json[0]) { cat = json[0]; resolveCat() }
      return route.fulfill({ response: res, json })
    }
    if (method === 'GET' && url.pathname.endsWith('/tasks') && meetings) {
      await Promise.race([catReady, new Promise((r) => setTimeout(r, 8000))])
      const rows = cat ? meetings.map((m) => taskRow(m.id, m.title, m.start, m.end, cat.id, cat.workspace_id, cat.user_id)) : []
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
        body: JSON.stringify(rows),
      })
    }
    return route.continue()
   } catch { /* the scenario ended while this request was in flight */ }
  })
  await context.route('**/storage/v1/**', (route) => (route.request().method() === 'GET' ? route.continue() : (writes.push('storage'), route.fulfill({ status: 204, body: '' }))))
  await context.route('**/functions/v1/**', (route) => (writes.push('functions ' + route.request().url()), route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })))
}

// Fake Notification + controllable page visibility + refresh-event counter, installed before the app runs.
const INIT = ({ water, lead, petLocal, theme, lang }) => {
  try {
    localStorage.setItem('waddle.waterReminder.enabled', water ? '1' : '0')
    localStorage.setItem('waddle.waterReminder.intervalMinutes', '60')
    localStorage.removeItem('waddle.waterReminder.nextDueAt')
    localStorage.removeItem('waddle.waterReminder.ignoredOnce')
    // The pet's per-device state: "muted" for the C scenarios; otherwise just "spoke a moment ago" so
    // its own chatter doesn't cover the screenshots.
    localStorage.setItem('huddle-pet-local-v1', JSON.stringify({ lastSpokeAt: Date.now(), idleDate: '9999-12-31', ...(petLocal === 'muted' ? { mutedUntil: Date.now() + 3600_000 } : {}) }))
    localStorage.setItem('theme', theme || 'light')
    if (lead) localStorage.setItem('waddle.meetingReminder.minutes', String(lead))
    else localStorage.removeItem('waddle.meetingReminder.minutes')
    localStorage.removeItem('waddle.meetingReminder.fired')
    localStorage.setItem('waddle-language-v1', lang || 'zh-TW')
  } catch {}
  window.__notes = []
  window.__refresh = 0
  window.__hidden = false
  window.addEventListener('huddle-widget-refresh', () => { window.__refresh++ })
  class FakeNotification {
    constructor(title, opts) { window.__notes.push({ title, body: opts?.body ?? '', tag: opts?.tag ?? '' }) }
    close() {}
    static get permission() { return 'granted' }
    static requestPermission() { return Promise.resolve('granted') }
  }
  window.Notification = FakeNotification
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible') })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hidden })
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style')
    st.textContent = 'nextjs-portal{display:none!important}'
    document.head.appendChild(st)
  })
}

const browser = await chromium.launch()
let storageState = STATE_FILE && existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : undefined

if (!storageState) {
  const ctx = await browser.newContext({ locale: 'zh-TW' })
  const page = await ctx.newPage()
  await page.goto(BASE + '/login?method=email', { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(env.E2E_EMAIL)
  await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type=submit]').click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000, waitUntil: 'domcontentloaded' })
  storageState = await ctx.storageState()
  if (STATE_FILE) writeFileSync(STATE_FILE, JSON.stringify(storageState))
  await ctx.close()
  ok('login (single login, session reused for every scenario)')
}

/** Open the app at fake time `time`; returns helpers. */
async function openApp({ time, quiet, meetings, water = true, lead = null, viewport = { width: 1280, height: 800 }, pet = null, petLocal = null, theme = 'light', lang = 'zh-TW', phone = false, reducedMotion = 'no-preference' }) {
  const context = await browser.newContext({
    storageState, viewport, locale: lang === 'en' ? 'en-US' : 'zh-TW', reducedMotion,
    ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  })
  await installBackend(context, { quiet, meetings, pet })
  await context.addInitScript(INIT, { water, lead, petLocal, theme, lang })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.clock.install({ time })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-tour="focus-timer"]').first().waitFor({ timeout: 90000 })
  const card = page.locator('[data-pet-water-card]')
  const drop = page.locator('[data-water-drop]')
  const visible = async (loc) => (await loc.count()) > 0 && (await loc.first().isVisible())
  const api = {
    context, page, errors, card, drop,
    close: async () => { await context.unrouteAll({ behavior: 'ignoreErrors' }); await context.close() },
    /** Either way of showing the reminder is on screen (A: the penguin's card / C: the drop). */
    modalOpen: async () => (await visible(card)) || (await visible(drop)),
    cardOpen: () => visible(card),
    dropOpen: () => visible(drop),
    /** Minutes from the page's (fake) now to the stored next due time. */
    dueInMin: () => page.evaluate(() => (Number(localStorage.getItem('waddle.waterReminder.nextDueAt')) - Date.now()) / 60_000),
    ls: (k) => page.evaluate((key) => localStorage.getItem(key), k),
    /** Run the fake clock for `ms`, firing every timer on the way (setInterval included). */
    runFor: async (ms) => { await page.clock.runFor(ms); await page.waitForTimeout(120) },
    /** Freeze every CSS animation/transition at `ms` (their start = the action that triggered them). */
    freeze: (ms) => page.evaluate((t) => document.getAnimations().forEach((x) => { try { x.pause(); x.currentTime = t } catch {} }), ms),
    resume: () => page.evaluate(() => document.getAnimations().forEach((x) => { try { x.play() } catch {} })),
    /** Stop the fake clock from also flowing in real time (screenshots take a while); runFor still advances it. */
    // The fake clock keeps flowing while we read it, so aim a little ahead and retry if we still lost the race
    // (that race was the old "Cannot fast-forward to the past").
    pauseClock: async () => {
      for (let i = 0; ; i++) {
        const now = await page.evaluate(() => Date.now())
        try { await page.clock.pauseAt(new Date(now + 1500)); return } catch (e) { if (i >= 4 || !/past/i.test(String(e))) throw e }
      }
    },
    shot: async (name, opts = {}) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, ...opts }) },
    rect: (sel) => page.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom } }, sel),
    notes: () => page.evaluate(() => window.__notes),
    /** Make the stored water due time `agoMs` in the past (fake clock) and let the hook look. */
    makeDue: async (agoMs = 60_000) => {
      await page.evaluate((ago) => {
        localStorage.setItem('waddle.waterReminder.nextDueAt', String(Date.now() - ago))
        document.dispatchEvent(new Event('visibilitychange'))
      }, agoMs)
    },
    tick: async (ms = 31_000) => { await page.clock.fastForward(ms); await page.waitForTimeout(250) },
    /** Jump the fake clock to the wall-clock time `d` (fires due timers once, like a laptop waking up). */
    tickTo: async (d) => { const now = await page.evaluate(() => Date.now()); await page.clock.fastForward(Math.max(1, d.getTime() - now)); await page.waitForTimeout(300) },
    dbg: () => page.evaluate(() => window.__waterDbg ?? null),
  }
  return api
}

// ───────────────────────────── water ─────────────────────────────

if (run('W1')) {
  // No penguin adopted → C: the drop.
  const a = await openApp({ time: at(14, 0) })
  await a.makeDue()
  await a.page.waitForTimeout(400)
  assert.equal(await a.dropOpen(), true, 'W1: the drop appears in the afternoon')
  assert.equal(await a.cardOpen(), false, 'W1: no penguin card without a penguin')
  ok('W1 14:00, nothing in the way, no penguin → the water drop (C) appears')
  const before = await a.page.evaluate(() => window.__refresh)
  await a.drop.locator('button').first().click()
  await a.runFor(1000)
  assert.equal(await a.modalOpen(), false, 'W1b: a tap puts it away')
  const after = await a.page.evaluate(() => window.__refresh)
  assert.ok(after > before, `W1b: drinking asks the widget sync to re-plan right away (refresh events ${before} → ${after})`)
  const due = await a.dueInMin()
  assert.ok(Math.abs(due - 60) < 0.2, `W1b: next one a full interval after the tap (got ${due.toFixed(2)} min)`)
  ok('W1b tap the drop → gone, next reminder = full 60-min interval, huddle-widget-refresh fired', `${before} → ${after}, next in ${due.toFixed(1)} min`)
  await a.close()
}

if (run('W2')) {
  const a = await openApp({ time: at(3, 0) })
  await a.makeDue()
  await a.tick(); await a.tick()
  assert.equal(await a.modalOpen(), false, 'W2: no popup at 03:00')
  assert.deepEqual(await a.notes(), [], 'W2: no notification at night')
  ok('W2 03:00, quiet hours OFF → built-in night keeps the popup closed (due time kept)')
  const stored = await a.page.evaluate(() => localStorage.getItem('waddle.waterReminder.nextDueAt'))
  assert.ok(Number(stored) < at(3, 5).getTime(), 'due time was not consumed or pushed')
  await a.tickTo(at(8, 0, 20))
  assert.equal(await a.modalOpen(), true, 'W2: popup appears once 08:00 has passed')
  ok('W2b ...and it appears right after 08:00 (deferred to the end of the night, not dropped)')
  await a.close()
}

if (run('W3')) {
  const quiet = { enabled: true, startTime: '13:00', endTime: '15:00', allowUrgent: true }
  const a = await openApp({ time: at(14, 0), quiet })
  await a.makeDue()
  await a.tick(); await a.tick()
  assert.equal(await a.modalOpen(), false, 'W3: inside the user window')
  ok('W3 14:00 inside the user\'s 勿擾時段 13:00–15:00 → closed (even though it is daytime)')
  await a.tickTo(at(15, 0, 20))
  assert.equal(await a.modalOpen(), true, 'W3: opens after the window')
  ok('W3b opens after 15:00')
  await a.close()
}

if (run('W4')) {
  // Lunch-only 勿擾時段: the built-in night must stay on (union), and the lunch hour is quiet too.
  const quiet = { enabled: true, startTime: '12:00', endTime: '13:00', allowUrgent: true }
  const a = await openApp({ time: at(3, 0), quiet })
  await a.makeDue()
  await a.tick(); await a.tick()
  assert.equal(await a.modalOpen(), false, 'W4: 03:00 stays quiet even though the user only set a lunch window')
  assert.deepEqual(await a.notes(), [])
  ok('W4 勿擾時段 = lunch only (12:00–13:00) → 03:00 is STILL quiet (night protection is not replaced)')
  await a.tickTo(at(8, 0, 20))
  assert.equal(await a.modalOpen(), true, 'W4b: opens once the night is over')
  ok('W4b ...and opens right after 08:00')
  await a.close()
}
if (run('W4')) {
  const quiet = { enabled: true, startTime: '12:00', endTime: '13:00', allowUrgent: true }
  const a = await openApp({ time: at(12, 20), quiet })
  await a.makeDue()
  await a.tick()
  assert.equal(await a.modalOpen(), false, 'W4c: lunch hour is quiet')
  await a.tickTo(at(13, 0, 20))
  assert.equal(await a.modalOpen(), true, 'W4d: lunch over → opens')
  ok('W4c/d the lunch hour itself is quiet, and the popup opens at 13:00')
  await a.close()
}

// Focus stretch holds the reminder. Pause stands in for "stop" (a long-press); both leave the running work phase.
async function startFocus(a) {
  await a.page.locator('[data-tour="focus-timer"]').first().click()
  await a.page.getByRole('button', { name: '開始專注' }).first().click()
  await a.page.waitForTimeout(800)
}
async function pauseFocus(a) {
  const pause = a.page.getByRole('button', { name: '暫停' }).first()
  if (!(await pause.count())) await a.page.locator('[aria-label*="點一下顯示計時控制"]').first().click().catch(() => {})
  await a.page.getByRole('button', { name: '暫停' }).first().click()
  await a.page.waitForTimeout(300)
}
if (run('W5')) {
  const a = await openApp({ time: at(14, 0) })
  await startFocus(a)
  await a.makeDue()
  await a.tick(); await a.tick()
  assert.equal(await a.modalOpen(), false, 'W5: not during a running focus stretch')
  ok('W5 focus running + water due → nothing shows through two polls (reminder kept, not eaten)')
  const stored = await a.page.evaluate(() => localStorage.getItem('waddle.waterReminder.nextDueAt'))
  assert.ok(Number(stored) > 0 && Number(stored) < at(14, 5).getTime())
  await pauseFocus(a)
  assert.equal(await a.modalOpen(), false, 'W5b: not instantly — it waits for the timer\'s own screen change')
  ok('W5b it does NOT appear in the same instant the focus ends')
  await a.tick(5_000)
  assert.equal(await a.dropOpen(), true, 'W5c: appears a few seconds after focus ended')
  ok('W5c ...the drop appears ~4 s after the focus stretch ended')
  const ask = await a.drop.innerText()
  assert.ok(ask.includes('專注告一段落，喝一口？') && !ask.includes('剛好休息'), `W5d: paused focus is not a break → neutral copy (got "${ask}")`)
  ok('W5d focus paused (no break) → 「專注告一段落，喝一口？」, NOT 「剛好休息」', JSON.stringify(ask.split('\n')[0]))
  await a.drop.locator('button').first().click()
  await a.runFor(1000)
  await a.makeDue()
  await a.page.waitForTimeout(400)
  const ask2 = await a.drop.innerText()
  assert.ok(ask2.includes('喝口水嗎？') && !ask2.includes('剛好休息'), `W5e: a later reminder is not flagged (got "${ask2}")`)
  ok('W5e the next, ordinary reminder uses the normal copy again (flag reset)')
  assert.deepEqual(a.errors, [], 'no page errors')
  await a.close()
}

// Background tab + notification permission already granted.
if (run('W6')) {
  const a = await openApp({ time: at(14, 0) })
  await a.page.evaluate(() => { window.__hidden = true })
  await a.makeDue()
  await a.tick()
  let notes = await a.notes()
  assert.equal(notes.length, 1, `W6: one system notification for the hidden tab (got ${notes.length})`)
  assert.equal(notes[0].title, '喝水提醒')
  assert.equal(notes[0].tag, 'huddle-water')
  await a.tick(); await a.tick()
  notes = await a.notes()
  assert.equal(notes.length, 1, 'W6: not repeated every 30 s poll')
  ok('W6 background tab + permission granted → exactly ONE system notification (no repeat on later polls)')
  await a.close()
}
if (run('W6')) {
  const a = await openApp({ time: at(14, 0) })
  await a.makeDue(); await a.tick()
  assert.deepEqual(await a.notes(), [], 'W6b: visible tab → no system notification')
  ok('W6b visible tab → no system notification (the popup is enough)')
  await a.close()
}
if (run('W6')) {
  const a = await openApp({ time: at(3, 0) })
  await a.page.evaluate(() => { window.__hidden = true })
  await a.makeDue(); await a.tick()
  assert.deepEqual(await a.notes(), [], 'W6c: night → silent')
  ok('W6c background tab at night → no system notification (quiet rules apply)')
  await a.close()
}

// ───────────────────────────── A: the penguin brings the water ─────────────────────────────
const DESK = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const overlap = (p, q) => !!p && !!q && p.x < q.r && q.x < p.r && p.y < q.b && q.y < p.b
/** Make it due and let the penguin walk over (hop 0.45 s + walk 1.4 s, timers on the fake clock). */
async function bringWater(a) {
  await a.makeDue()
  await a.page.waitForTimeout(300)
  await a.runFor(2100)
  await a.card.first().waitFor({ timeout: 5000 })
  await a.page.waitForTimeout(1500) // the walk is a 1.4 s CSS transition (real time, not the fake clock)
}

if (run('A1')) {
  const a = await openApp({ time: at(14, 0), pet: PET, viewport: DESK })
  await a.makeDue()
  await a.page.waitForTimeout(300)
  const glass = a.page.locator('[data-pet-water-glass]')
  assert.equal(await glass.count(), 1, 'A1: the penguin is holding a glass')
  assert.equal(await a.dropOpen(), false, 'A1: no drop while the penguin can bring it')
  const home = await a.rect('[data-pet]')
  await a.runFor(700)
  await a.freeze(700)
  await a.shot('a-frame-1-walking', { clip: { x: home.x - 20, y: DESK.height - 300, width: 560, height: 300 } })
  await a.resume()
  await a.runFor(1500)
  await a.page.waitForTimeout(1000) // the walk itself is a 1.4 s CSS transition (real time)
  assert.equal(await a.cardOpen(), true, 'A1: the card is up after the walk')
  const text = await a.card.innerText()
  assert.ok(text.includes('我端了一杯水來。') && text.includes('乾杯') && text.includes('等等再喝'), `A1: card copy (got "${text}")`)
  const btn = await a.rect('[data-pet-button]')
  assert.ok(btn.x - home.x > 90, `A1: the penguin walked over (${Math.round(btn.x - home.x)} px from home)`)
  const cal = await a.rect('[data-tour="calendar-panel"]')
  assert.ok(btn.x >= cal.x + 56, `A1: at the delivery spot it stands clear of the hour labels (penguin x ${Math.round(btn.x)}, gutter ends ${Math.round(cal.x + 56)})`)
  const cardR = await a.rect('[data-pet-water-card]')
  const timer = await a.rect('[data-tour="focus-timer"]')
  assert.ok(cardR.x >= 0 && cardR.r <= DESK.width && cardR.y >= 0 && cardR.b <= DESK.height, 'A1: card inside the window')
  assert.ok(!overlap(cardR, timer), 'A1: card clear of the focus-timer pill')
  const scrim = await a.page.evaluate(() => [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].length)
  assert.equal(scrim, 0, 'A1: no modal / full-screen scrim')
  ok('A1 penguin adopted → it hops, gets a glass, walks ~104 px over and puts up a card; no scrim, nothing blocked', `card ${Math.round(cardR.w)}×${Math.round(cardR.h)} at (${Math.round(cardR.x)},${Math.round(cardR.y)})`)
  await a.shot('a-desktop-card')
  await a.shot('a-frame-2-card', { clip: { x: home.x - 20, y: DESK.height - 300, width: 560, height: 300 } })
  // 乾杯 (clock paused so each frame lands where it says)
  await a.pauseClock()
  const before = await a.page.evaluate(() => window.__refresh)
  await a.card.getByRole('button', { name: '乾杯', exact: true }).click()
  await a.page.waitForTimeout(80)
  const due = await a.dueInMin()
  assert.ok(Math.abs(due - 60) < 0.1, `A1b: 乾杯 → next a full interval away (got ${due.toFixed(2)} min)`)
  assert.equal(await a.cardOpen(), false, 'A1b: the card goes away at once (no half-empty card)')
  assert.equal(await a.page.locator('[data-pet-water-cheer]').count(), 1, 'A1b: a short 乾杯！ line replaces it')
  assert.ok((await a.page.evaluate(() => window.__refresh)) > before, 'A1b: widget/iOS chain re-planned')
  ok('A1b 乾杯 → next reminder = full 60 min, card replaced by a one-line 「乾杯！」', `${due.toFixed(2)} min`)
  await a.runFor(650)
  await a.freeze(700)
  await a.shot('a-frame-3-clink', { clip: { x: home.x - 20, y: DESK.height - 300, width: 560, height: 300 } })
  await a.resume()
  await a.runFor(650)
  await a.freeze(1300)
  await a.shot('a-frame-4-sip', { clip: { x: home.x - 20, y: DESK.height - 300, width: 560, height: 300 } })
  await a.resume()
  await a.runFor(700)
  const bubble = await a.page.locator('[data-pet-bubble]').innerText().catch(() => '')
  assert.ok(bubble.includes('咕嚕。好喝！'), `A1c: says 咕嚕。好喝！ (got "${bubble}")`)
  await a.freeze(1950)
  await a.shot('a-frame-5-gulp', { clip: { x: home.x - 20, y: DESK.height - 300, width: 560, height: 300 } })
  await a.resume()
  await a.runFor(2200)
  assert.equal(await a.page.locator('[data-pet][data-water]').count(), 0, 'A1c: back home, glass put away')
  await a.page.waitForTimeout(1500) // the walk home is a real-time CSS transition
  const back = await a.rect('[data-pet-button]')
  ok('A1c 「咕嚕。好喝！」, then it walks home and the glass is gone', `${Math.round(back.x - home.x)} px from home`)
  assert.equal(await a.ls('waddle.waterReminder.ignoredOnce'), null)
  assert.deepEqual(a.errors, [], 'no page errors')
  await a.close()
}

if (run('A2')) {
  const a = await openApp({ time: at(14, 0), pet: PET, viewport: DESK })
  await bringWater(a)
  await a.card.getByRole('button', { name: '等等再喝' }).click()
  await a.page.waitForTimeout(80)
  const due = await a.dueInMin()
  assert.ok(Math.abs(due - 5) < 0.1, `A2: 等等再喝 → 5 min (got ${due.toFixed(2)})`)
  const bubble = await a.page.locator('[data-pet-bubble]').innerText()
  assert.ok(bubble.includes('好，我等一下再端來。'), `A2: says it'll come back (got "${bubble}")`)
  await a.runFor(2200)
  assert.equal(await a.page.locator('[data-pet][data-water]').count(), 0, 'A2: walked home')
  ok('A2 等等再喝 → next in 5 min, 「好，我等一下再端來。」, walks home')
  await a.runFor(4 * MIN)
  assert.equal(await a.modalOpen(), false, 'A2b: not back after 4 min')
  await a.runFor(MIN + 31_000)
  await a.runFor(2100)
  assert.equal(await a.cardOpen(), true, 'A2b: back after 5 min')
  ok('A2b ...and after 5 minutes the penguin brings it again (not at 4 min)')
  await a.close()
}

if (run('A3')) {
  const a = await openApp({ time: at(14, 0), pet: PET, viewport: DESK })
  await bringWater(a)
  await a.card.getByRole('button', { name: '喝水提醒設定' }).click()
  await a.card.getByRole('button', { name: '30 分鐘' }).click()
  assert.equal(await a.ls('waddle.waterReminder.intervalMinutes'), '30', 'A3: interval saved in place')
  await a.shot('a-desktop-settings')
  ok('A3 ⋯ opens on/off + interval inside the card; picking 30 分鐘 saves it')
  await a.card.locator('input[type="checkbox"]').click()
  await a.page.waitForTimeout(150)
  assert.equal(await a.ls('waddle.waterReminder.enabled'), '0', 'A3b: switched off')
  assert.equal(await a.cardOpen(), false, 'A3b: card gone')
  await a.runFor(1600)
  assert.equal(await a.page.locator('[data-pet][data-water]').count(), 0, 'A3b: penguin went home')
  ok('A3b switching it off from the card → off, card gone, penguin walks home')
  await a.close()
}

if (run('A4')) {
  const a = await openApp({ time: at(14, 0), pet: PET, viewport: DESK })
  await startFocus(a)
  await a.makeDue()
  await a.tick(); await a.tick()
  assert.equal(await a.modalOpen(), false, 'A4: nothing during focus')
  await pauseFocus(a)
  await a.tick(5_000)
  await a.runFor(2100)
  assert.equal(await a.cardOpen(), true, 'A4: the penguin comes after the focus stretch')
  const text = await a.card.innerText()
  assert.ok(text.includes('這段專注告一段落。') && !text.includes('剛好休息'), `A4: paused focus → neutral copy (got "${text}")`)
  ok('A4 focus → nothing; focus paused → the penguin comes with 「這段專注告一段落。喝口水吧，我已經倒好了。」 (no 「剛好休息」)')
  await a.close()
}

/** A real pomodoro: 25 min of work runs out, the timer holds 2.6 s, the 5-min break starts on its own. */
async function finishPomodoroIntoBreak(a) {
  await startFocus(a)
  await a.makeDue()
  await a.tick(); await a.tick()
  assert.equal(await a.modalOpen(), false, 'nothing while the work phase runs')
  await a.page.clock.fastForward(25 * MIN)
  await a.page.waitForTimeout(300)
  await a.runFor(3000) // completion hold → break starts
  const breakPill = a.page.locator('[aria-label="休息計時迷你顯示"]')
  await breakPill.first().waitFor({ timeout: 5000 })
  await a.runFor(5000) // water looks again ~4 s after the work phase ended
  // 「這段時間做了什麼？」 is up now: the penguin hides under it, so A waits (no drop sneaks in behind it).
  const log = a.page.getByRole('dialog', { name: '這段時間做了什麼？' })
  await log.waitFor({ timeout: 5000 })
  assert.equal(await a.cardOpen(), false, 'no card under the dialog')
  await a.runFor(4000)
  return { breakPill, log }
}

if (run('A5')) {
  const a = await openApp({ time: at(14, 0), pet: PET, viewport: DESK })
  const { breakPill, log } = await finishPomodoroIntoBreak(a)
  assert.equal(await a.dropOpen(), false, 'A5: the penguin is only covered by the dialog → it waits, no drop instead')
  await log.getByRole('button', { name: '跳過' }).click()
  await a.page.waitForTimeout(700)
  await a.runFor(2100)
  await a.card.first().waitFor({ timeout: 5000 })
  await a.page.waitForTimeout(1500)
  const text = await a.card.innerText()
  const pill = await breakPill.first().innerText()
  assert.ok(text.includes('剛好休息，順便喝口水。'), `A5: break copy (got "${text}")`)
  assert.ok(/0?4:\d\d/.test(pill), `A5: the break countdown is on screen (got "${pill}")`)
  ok('A5 pomodoro runs out → break starts → 「這段時間做了什麼？」 closed → the penguin brings it: 「剛好休息，順便喝口水。」, break countdown visible', JSON.stringify(pill))
  await a.shot('a-desktop-break')
  await a.close()
}

if (run('C3')) {
  const a = await openApp({ time: at(14, 0), pet: PET_OFF, viewport: DESK })
  const { breakPill, log } = await finishPomodoroIntoBreak(a)
  const stateUnder = await a.drop.getAttribute('data-state')
  await a.runFor(70_000)
  assert.equal(await a.drop.getAttribute('data-state'), 'here', `C3: 70 s under the dialog did not count (was ${stateUnder})`)
  ok('C3 a drop hidden behind 「這段時間做了什麼？」 does not count down (70 s later still there)')
  await log.getByRole('button', { name: '跳過' }).click()
  await a.page.waitForTimeout(700)
  assert.equal(await a.dropOpen(), true, 'C3: the drop during the break')
  assert.equal(await a.page.locator('[data-pet-adopt]').count(), 0, 'C3: no adoption card in the way')
  const ask = await a.drop.innerText()
  assert.ok(ask.includes('剛好休息，喝一口？'), `C3: break copy on the drop (got "${ask}")`)
  const askShown = await a.page.evaluate(() => getComputedStyle(document.querySelector('[data-water-drop] > [aria-hidden="true"]')).opacity)
  assert.equal(askShown, '1', 'C3: the question is still out — its 6 s only start once the dialog is gone')
  const pill = await breakPill.first().innerText()
  ok('C3 no penguin + pomodoro break → the drop says 「剛好休息，喝一口？」 next to the break countdown', JSON.stringify(pill))
  await a.shot('c-desktop-break')
  await a.close()
}

// ───────────────────────────── C: the drop (fallback) ─────────────────────────────
if (run('C1')) {
  // Penguin adopted but muted (「安靜 1 小時」) → the drop, not the penguin.
  const a = await openApp({ time: at(14, 0), pet: PET, petLocal: 'muted', viewport: DESK })
  await a.makeDue()
  await a.page.waitForTimeout(300)
  await a.runFor(3500)
  assert.equal(await a.dropOpen(), true, 'C1: muted penguin → the drop')
  assert.equal(await a.cardOpen(), false, 'C1: the muted penguin does not walk over')
  ok('C1 penguin muted 「安靜」 → the drop (C) shows instead of the penguin')
  await a.shot('c-desktop-drop')
  await a.runFor(55_000)
  assert.equal(await a.dropOpen(), true, 'C1: still there at ~58 s')
  await a.runFor(5_000)
  await a.runFor(1700)
  assert.equal(await a.dropOpen(), false, 'C1b: evaporated after 60 s')
  let due = await a.dueInMin()
  assert.ok(Math.abs(due - 15) < 0.2, `C1b: first ignore → ask again in 15 min (got ${due.toFixed(2)})`)
  assert.equal(await a.ls('waddle.waterReminder.ignoredOnce'), '1')
  ok('C1b left alone 60 s → evaporates; first ignore → again in 15 min', `${due.toFixed(2)} min`)
  await a.runFor(15 * MIN + 31_000)
  assert.equal(await a.dropOpen(), true, 'C1c: back after 15 min')
  await a.runFor(62_000)
  await a.runFor(1700)
  assert.equal(await a.dropOpen(), false, 'C1c: evaporated again')
  due = await a.dueInMin()
  assert.ok(Math.abs(due - 60) < 0.2, `C1c: second ignore in a row → full interval (got ${due.toFixed(2)})`)
  assert.equal(await a.ls('waddle.waterReminder.ignoredOnce'), null, 'C1c: streak cleared')
  ok('C1c ignored a second time in a row → that round ends, next in a full 60 min', `${due.toFixed(2)} min`)
  await a.close()
}

if (run('C2')) {
  const a = await openApp({ time: at(14, 0), viewport: DESK })
  await a.makeDue()
  await a.page.waitForTimeout(400)
  assert.equal(await a.dropOpen(), true)
  await a.pauseClock()
  await a.page.evaluate(() => { window.__hidden = true })
  await a.runFor(90_000)
  await a.page.evaluate(() => { window.__hidden = false })
  assert.equal(await a.drop.getAttribute('data-state'), 'here', 'C2: 90 s in a background tab did not count')
  ok('C2 90 s with the tab in the background → the drop has not started evaporating')
  await a.runFor(45_000)
  assert.equal(await a.drop.getAttribute('data-state'), 'here', 'C2: 45 s visible is not enough')
  // ~2 s were visible before the tab went away (+ pausing the clock); from here it should go at ~60 s visible.
  let goneAfter = null
  for (let s = 1; s <= 25; s++) {
    await a.runFor(1_000)
    const st = await a.page.evaluate(() => document.querySelector('[data-water-drop]')?.getAttribute('data-state') ?? 'gone')
    if (st !== 'here') { goneAfter = s; break }
  }
  assert.ok(goneAfter !== null && goneAfter >= 10 && goneAfter <= 16, `C2: starts evaporating at ~60 s of VISIBLE time (45 + ${goneAfter} s visible, the 90 s in the background not counted)`)
  ok('C2b only visible time counts: 45 s → still there, evaporates at ~60 s visible', `45 + ${goneAfter} s`)
  await a.close()
}

// ───────────────────────────── phone 390 ─────────────────────────────
if (run('P1')) {
  const a = await openApp({ time: at(14, 0), pet: PET, viewport: PHONE, phone: true })
  await bringWater(a)
  const tabs = await a.rect('[data-tour="mobile-tabs"]')
  const cardR = await a.rect('[data-pet-water-card]')
  const pen = await a.rect('[data-pet-button]')
  const timer = await a.rect('[data-tour="focus-timer"]')
  const btns = await a.card.locator('button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }))
  assert.ok(cardR.x >= 0 && cardR.r <= PHONE.width, `P1: card inside 390 px (${Math.round(cardR.x)}–${Math.round(cardR.r)})`)
  assert.ok(cardR.b <= tabs.y, 'P1: card above the tab bar')
  assert.ok(!overlap(cardR, timer), 'P1: card clear of the timer pill')
  assert.ok(btns.every(([w, h]) => w >= 44 && h >= 44), `P1: every button ≥ 44 pt (${JSON.stringify(btns)})`)
  assert.ok(pen.b <= tabs.y - 4, `P1: penguin lifted off the tab bar (gap ${Math.round(tabs.y - pen.b)} px)`)
  assert.ok(pen.h >= 46, `P1: penguin bigger while it holds the glass (${Math.round(pen.h)} px)`)
  assert.ok(pen.x >= 55, `P1: clear of the 55 px hour-label gutter (penguin x ${Math.round(pen.x)})`)
  ok('P1 390 px: card inside the screen, above the tab bar, clear of the timer pill; buttons ≥ 44; penguin 1.3× and off the tab bar', `buttons ${JSON.stringify(btns)}, penguin ${Math.round(pen.h)} px, gap ${Math.round(tabs.y - pen.b)} px`)
  await a.shot('a-mobile-card')
  await a.card.getByRole('button', { name: '乾杯', exact: true }).click()
  await a.page.waitForTimeout(80)
  assert.ok(Math.abs((await a.dueInMin()) - 60) < 0.1, 'P1b: 乾杯 on the phone')
  await a.runFor(650)
  await a.freeze(700)
  await a.shot('a-mobile-cheers')
  ok('P1b 乾杯 on the phone → full interval')
  await a.close()
}

if (run('P3')) {
  // The 任務 tab: the card floats over the list like a toast — it must not hide the tab bar or the pill.
  const a = await openApp({ time: at(14, 0), pet: PET, viewport: PHONE, phone: true })
  await a.page.locator('[data-tour="mobile-tabs"]').getByRole('tab', { name: '任務' }).click()
  await a.page.waitForTimeout(600)
  await a.makeDue(); await a.page.waitForTimeout(300); await a.runFor(3600); await a.page.waitForTimeout(800)
  // Here the penguin's corner sits on the list's 「新增任務」 row, so it steps aside (data-yield) as
  // it always does — A can't be seen → the drop takes over (老闆: 任何 A 無法正常顯示的情況).
  const petYield = await a.page.evaluate(() => document.querySelector('[data-pet]')?.hasAttribute('data-yield'))
  if (petYield) {
    assert.equal(await a.dropOpen(), true, 'P3: penguin stepped aside → the drop')
    assert.equal(await a.cardOpen(), false)
    ok('P3 任務 tab: the penguin is stepping aside for a list control → the drop shows instead (fallback)')
  } else {
    assert.equal(await a.cardOpen(), true, 'P3: penguin visible → its card')
    ok('P3 任務 tab: the penguin is visible → it brings the water')
  }
  await a.runFor(500)
  const covered = await a.page.evaluate(() => {
    const wrap = document.querySelector('[data-water-drop]')
    const parts = [wrap.querySelector('button'), ...[...wrap.children].filter((e) => e.getAttribute('aria-hidden') === 'true' && getComputedStyle(e).display !== 'none' && getComputedStyle(e).opacity !== '0')]
    const SEL = 'button, a[href], input, summary, label, [role="button"], [role="checkbox"], [role="tab"], h1, h2, h3, h4, h5, h6, [role="heading"], [draggable="true"]'
    const out = []
    wrap.style.visibility = 'hidden'
    for (const el of parts) {
      const r = el.getBoundingClientRect()
      for (let y = r.top + 2; y < r.bottom; y += 6) for (let x = r.left + 2; x < r.right; x += 6) {
        const hit = document.elementFromPoint(x, y)
        const text = hit && [...hit.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
        if (hit && hit !== document.body && (hit.closest(SEL) || hit.closest('img, svg, canvas') || text || getComputedStyle(hit).cursor === 'pointer')) out.push(`${hit.tagName} "${(hit.closest(SEL) || hit).textContent.trim().slice(0, 10)}"`)
      }
    }
    wrap.style.visibility = ''
    return [...new Set(out)]
  })
  assert.deepEqual(covered, [], `P3: the drop / its question cover no control, heading, text or icon (covered: ${covered.join(', ')})`)
  const d = await a.rect('[data-water-drop] button')
  ok('P3b the drop and its question sit where they cover no row, button, group title, text or icon (only background)', `drop at (${Math.round(d.x)},${Math.round(d.y)}), chip: ${await a.drop.getAttribute('data-chip')}`)
  await a.shot('c-mobile-tasks-tab')
  await a.close()
}

if (run('B1')) {
  // The bell on a phone (⋯ → 通知), 2× — with a penguin adopted there is no 「領養你的企鵝」 card on top of it.
  const a = await openApp({ time: at(9, 0), pet: PET, viewport: PHONE, phone: true })
  await a.page.locator('[data-tour="mobile-more"]').click()
  await a.page.getByRole('menuitem', { name: /^(通知|Notifications)/ }).click()
  await a.page.locator('[data-bell-item], :text("一切順利！"), :text("All clear!")').first().waitFor({ timeout: 15000 })
  await a.page.waitForTimeout(400)
  assert.equal(await a.page.locator('[data-pet-adopt]').count(), 0, 'B1: no adoption card covering the list')
  const overflow = await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert.ok(overflow <= 0, `B1: no horizontal overflow (${overflow}px)`)
  const n = await a.page.locator('[data-bell-item]').count()
  ok('B1 phone bell (2×): nothing on top of the list, no horizontal overflow', `${n} cards`)
  await a.shot('mobile-bell')
  await a.close()
}

if (run('P2')) {
  const a = await openApp({ time: at(14, 0), pet: PET, petLocal: 'muted', viewport: PHONE, phone: true })
  await a.makeDue()
  await a.page.waitForTimeout(300)
  await a.runFor(3500)
  assert.equal(await a.dropOpen(), true, 'P2: drop on the phone')
  const d = await a.rect('[data-water-drop] button')
  const fab = await a.rect('[data-tour="mobile-add-task"]')
  assert.ok(fab, 'P2: the ＋ button is on screen (calendar tab)')
  const tabs = await a.rect('[data-tour="mobile-tabs"]')
  const pet = await a.rect('[data-pet-button]')
  assert.ok(d.w >= 44 && d.h >= 44, `P2: drop target ≥ 44 (${d.w}×${d.h})`)
  // The tappable area really is ≥ 44×44 on both sides: every point of a 44×44 box centred on the drop hits it.
  const hits = await a.page.evaluate(() => {
    const b = document.querySelector('[data-water-drop] button').getBoundingClientRect()
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2
    const pts = []
    for (const dx of [-21, 0, 21]) for (const dy of [-21, 0, 21]) pts.push(!!document.elementFromPoint(cx + dx, cy + dy)?.closest('[data-water-drop] button'))
    return pts
  })
  assert.ok(hits.every(Boolean), `P2: a 44×44 box around the drop is all tappable (${hits})`)
  assert.ok(d.b <= tabs.y + 1, 'P2: above the tab bar')
  assert.ok(!overlap(d, pet), 'P2: next to the muted penguin, not on it')
  const far = fab ? Math.hypot((fab.x + fab.r) / 2 - (d.x + d.r) / 2, (fab.y + fab.b) / 2 - (d.y + d.b) / 2) : 999
  assert.ok(far > 150, `P2: far from the + button (${Math.round(far)} px)`)
  const contrast = await a.page.evaluate(() => {
    const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]) }
    const ask = document.querySelector('[data-water-drop] > [aria-hidden="true"]')
    const bg = getComputedStyle(ask).backgroundColor
    return [...ask.children].map((el) => { const a = lum(getComputedStyle(el).color), b = lum(bg); return ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2) })
  })
  assert.ok(contrast.every((c) => Number(c) >= 4.5), `P2: question + hint text ≥ 4.5:1 (${contrast})`)
  const askR = await a.rect('[data-water-drop] > [aria-hidden="true"]')
  const pillR = await a.rect('[data-tour="focus-timer"]')
  assert.ok(!overlap(askR, pillR) && !overlap(d, pillR), `P2: drop and question clear of the timer pill (question ${Math.round(askR.x)}–${Math.round(askR.r)}, pill from ${Math.round(pillR.x)})`)
  ok('P2 390 px drop: tappable area ≥ 44×44 both ways (9-point hit test), above the tab bar, beside the muted penguin, far from ＋, text contrast AA', `drop ${Math.round(d.w)}×${Math.round(d.h)}, ${Math.round(far)} px from ＋, contrast ${contrast.join(' / ')}`)
  await a.shot('c-mobile-drop')
  await a.close()
}

// ───────────────────────────── English · dark · reduced motion ─────────────────────────────
if (run('E1')) {
  const a = await openApp({ time: at(14, 0), pet: PET, viewport: DESK, lang: 'en' })
  await bringWater(a)
  const t1 = await a.card.innerText()
  assert.ok(!CJK.test(t1), `E1: no Chinese on the card (got "${t1}")`)
  await a.card.getByRole('button', { name: 'Water reminder settings' }).click()
  const t2 = await a.card.innerText()
  assert.ok(!CJK.test(t2), `E1: no Chinese in the settings panel (got "${t2}")`)
  await a.shot('a-desktop-en')
  await a.card.getByRole('button', { name: 'Cheers', exact: true }).click()
  await a.page.waitForTimeout(80)
  const cheer = await a.page.locator('[data-pet-water-cheer]').innerText()
  await a.runFor(1900)
  const bubble = await a.page.locator('[data-pet-bubble]').innerText()
  assert.ok(!CJK.test(cheer + bubble), `E1: no Chinese while toasting (got "${cheer}" / "${bubble}")`)
  ok('E1 English: card, ⋯ panel, 「Cheers!」 line and the penguin\'s reply have no Chinese', JSON.stringify(t1.replace(/\n/g, ' | ')))
  await a.close()
  const b = await openApp({ time: at(14, 0), pet: PET, petLocal: 'muted', viewport: DESK, lang: 'en' })
  await b.makeDue(); await b.page.waitForTimeout(300); await b.runFor(3500)
  const t3 = await b.drop.innerText()
  const label = await b.drop.locator('button').getAttribute('aria-label')
  assert.ok(!CJK.test(t3 + label), `E1b: no Chinese on the drop (got "${t3}" / "${label}")`)
  ok('E1b English drop: question, hint and its label have no Chinese', JSON.stringify(t3.replace(/\n/g, ' | ')))
  await b.shot('c-desktop-en')
  await b.close()
}

if (run('D1')) {
  const a = await openApp({ time: at(14, 0), pet: PET, viewport: DESK, theme: 'dark' })
  await bringWater(a)
  const c = await a.page.evaluate(() => {
    const el = document.querySelector('[data-pet-water-card]')
    const lum = (s) => { const m = s.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 }
    return { dark: document.documentElement.classList.contains('dark'), bg: lum(getComputedStyle(el).backgroundColor), fg: lum(getComputedStyle(el).color) }
  })
  assert.ok(c.dark && c.bg < 0.3 && c.fg > 0.7, `D1: dark card with light text (${JSON.stringify(c)})`)
  ok('D1 dark mode: the card follows the dark tokens (dark paper, light ink)', JSON.stringify(c))
  await a.shot('a-desktop-dark')
  await a.close()
  const b = await openApp({ time: at(14, 0), pet: PET, petLocal: 'muted', viewport: PHONE, phone: true, theme: 'dark' })
  await b.makeDue(); await b.page.waitForTimeout(400); await b.runFor(1000)
  assert.equal(await b.dropOpen(), true)
  const stroke = await b.page.evaluate(() => getComputedStyle(document.querySelector('[data-water-drop] button')).color)
  ok('D1b dark mode drop on the phone (outline follows the light ink)', stroke)
  await b.shot('c-mobile-dark')
  await b.close()
}

if (run('R1')) {
  const a = await openApp({ time: at(14, 0), pet: PET, viewport: DESK, reducedMotion: 'reduce' })
  await a.makeDue()
  await a.page.waitForTimeout(300)
  await a.runFor(100)
  assert.equal(await a.cardOpen(), true, 'R1: reduced motion → the card is there at once (no walk)')
  const anims = await a.page.evaluate(() => document.getAnimations().filter((x) => x.effect?.target?.closest?.('[data-pet]') && (x.effect.getTiming().iterations === Infinity || /waddle|hop/.test(x.animationName || ''))).length)
  assert.equal(anims, 0, 'R1: no hop / waddle running')
  ok('R1 prefers-reduced-motion → the penguin is simply there with its card (no hop, no walk)')
  await a.close()
}

// ───────────────────────────── meetings (web path) ─────────────────────────────
const MEETINGS = [
  { id: '00000000-0000-4000-8000-00000000a001', title: '每日站會', start: '10:00', end: '10:30' },
  { id: '00000000-0000-4000-8000-00000000a002', title: '早班交接', start: '07:55', end: '08:30' },
]
if (run('M1')) {
  // 09:52 → 8 minutes before the 10:00 stand-up of a series that started 9 days ago.
  const a = await openApp({ time: at(9, 52), meetings: MEETINGS, water: false, lead: 10 })
  await a.tick(1_000)
  let notes = await a.notes()
  assert.equal(notes.filter((n) => n.title.includes('每日站會')).length, 1, `M1: today's occurrence of a series that started 9 days ago is reminded (got ${JSON.stringify(notes)})`)
  ok('M1 a repeating meeting whose first date is 9 days old is reminded today (old code: only the first date)')
  await a.tick(); await a.tick()
  assert.equal((await a.notes()).filter((n) => n.title.includes('每日站會')).length, 1, 'M1b: once per occurrence')
  ok('M1b no repeat on later polls')
  await a.page.evaluate(() => localStorage.setItem('waddle.meetingReminder.minutes', '15'))
  await a.tick()
  assert.equal((await a.notes()).filter((n) => n.title.includes('每日站會')).length, 2, 'M1c: lead 10 → 15 reminds again')
  ok('M1c changing the lead time (10 → 15) reminds again for the same occurrence')
  await a.close()
}
for (const [allowUrgent, expected] of run('M2') ? [[true, 1], [false, 0]] : []) {
  // 07:46 → 07:45 reminder for the 07:55 meeting falls inside 22:00–08:00.
  const quiet = { enabled: true, startTime: '22:00', endTime: '08:00', allowUrgent }
  const a = await openApp({ time: at(7, 46), meetings: MEETINGS, water: false, lead: 10, quiet })
  await a.tick(1_000); await a.tick()
  const n = (await a.notes()).filter((x) => x.title.includes('早班交接')).length
  assert.equal(n, expected, `M2: allowUrgent=${allowUrgent} → ${expected} notification(s), got ${n}`)
  ok(`M2 勿擾時段 on, 允許緊急通知=${allowUrgent ? '開' : '關'} → meeting reminder ${expected ? 'still arrives' : 'skipped'}`)
  await a.close()
}

// ───────────── 今日會議 popover → the clicked occurrence, not the series' first day ─────────────
{
  const todayStr = iso(today)
  const before = writeLog.length
  const a = await openApp({ time: at(9, 30), meetings: MEETINGS, water: false })
  await a.page.locator('button[aria-haspopup="dialog"][title*="今天有"]').first().click()
  // Scoped to the popover: the same title also appears on the calendar and in the task list.
  await a.page.locator('[role=dialog][aria-label="今日會議"] button', { hasText: '每日站會' }).first().click()
  const titleInput = a.page.locator('input[value="每日站會"]').first()
  await titleInput.waitFor({ timeout: 10000 })
  await titleInput.fill('每日站會（只改今天）')
  await a.page.getByRole('button', { name: '儲存', exact: true }).click()
  await a.page.getByText('只改這一天').first().click()
  await a.page.getByRole('button', { name: '套用', exact: true }).click()
  await a.page.waitForTimeout(800)
  const mine = writeLog.slice(before)
  const insert = mine.find((w) => w.method === 'POST' && w.path.endsWith('/rest/v1/tasks'))
  assert.ok(insert, `T1: 「只改這一天」 wrote a detached occurrence (writes: ${JSON.stringify(mine.map((w) => w.method + ' ' + w.path))})`)
  const row = Array.isArray(insert.body) ? insert.body[0] : insert.body
  assert.equal(row.scheduled_date, todayStr, 'T1: the detached copy sits on TODAY, not on the series\' first day')
  assert.equal(row.title, '每日站會（只改今天）')
  const exdates = mine.find((w) => w.method === 'PATCH' && w.path.endsWith('/rest/v1/tasks') && w.body && w.body.exdates)
  assert.ok(exdates && exdates.body.exdates.includes(todayStr), `T1: the series skips exactly today (${JSON.stringify(exdates?.body)})`)
  ok('T1 今日會議 → click a repeating meeting → 「只改這一天」 saves THIS day (copy dated today + series exdates [today])', `${row.scheduled_date}`)
  assert.deepEqual(a.errors, [])
  await a.close()
}

await browser.close()
// Every write the app tried was answered locally (nothing reached Supabase); list what it tried.
console.log(`\nSupabase writes intercepted and answered locally: ${writes.length}${writes.length ? ' → ' + [...new Set(writes)].join(', ') : ''}`)
const passed = results.filter((r) => r[0] === 'PASS').length
const skipped = results.filter((r) => r[0] === 'SKIP').length
console.log(`DONE: ${passed} PASS, ${skipped} SKIP, 0 FAIL`)
