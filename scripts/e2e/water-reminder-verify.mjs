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
 * Needs the temporary `window.__waterDbg` probe only for the "dueAfterFocus" assertions; without it those
 * are reported as SKIP (the probe is not part of the product code).
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import assert from 'node:assert/strict'

const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3481'
const STATE_FILE = process.env.E2E_STATE_FILE
const READ_RPCS = /\/rpc\/(get_|preview_)/

const results = []
const ok = (name, detail = '') => { results.push(['PASS', name]); console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`) }
const skip = (name, why) => { results.push(['SKIP', name]); console.log(`SKIP  ${name} — ${why}`) }
const writes = []

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
async function installBackend(context, { quiet, meetings }) {
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
      return route.fulfill({ status: 204, body: '' })
    }
    if (method === 'GET' && url.pathname.endsWith('/user_settings')) {
      const res = await route.fetch()
      let json = await res.json()
      const fix = (row) => {
        if (!row || typeof row !== 'object') return row
        const n = { ...(row.notifications ?? {}) }
        delete n.pet
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
const INIT = ({ water, lead }) => {
  try {
    localStorage.setItem('waddle.waterReminder.enabled', water ? '1' : '0')
    localStorage.setItem('waddle.waterReminder.intervalMinutes', '60')
    localStorage.removeItem('waddle.waterReminder.nextDueAt')
    if (lead) localStorage.setItem('waddle.meetingReminder.minutes', String(lead))
    else localStorage.removeItem('waddle.meetingReminder.minutes')
    localStorage.removeItem('waddle.meetingReminder.fired')
    localStorage.setItem('waddle-language-v1', 'zh-TW')
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
async function openApp({ time, quiet, meetings, water = true, lead = null, viewport = { width: 1280, height: 800 } }) {
  const context = await browser.newContext({ storageState, viewport, locale: 'zh-TW' })
  await installBackend(context, { quiet, meetings })
  await context.addInitScript(INIT, { water, lead })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.clock.install({ time })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-tour="focus-timer"]').first().waitFor({ timeout: 90000 })
  const modal = page.locator('#water-reminder-title')
  const api = {
    context, page, errors, modal,
    close: async () => { await context.unrouteAll({ behavior: 'ignoreErrors' }); await context.close() },
    modalOpen: async () => (await modal.count()) > 0 && (await modal.first().isVisible()),
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

{
  const a = await openApp({ time: at(14, 0) })
  await a.makeDue()
  await a.page.waitForTimeout(400)
  assert.equal(await a.modalOpen(), true, 'W1: popup opens in the afternoon')
  ok('W1 14:00, nothing in the way → the water popup opens')
  const before = await a.page.evaluate(() => window.__refresh)
  await a.page.getByRole('button', { name: '好，去喝水' }).first().click()
  await a.page.waitForTimeout(300)
  assert.equal(await a.modalOpen(), false)
  const after = await a.page.evaluate(() => window.__refresh)
  assert.ok(after > before, `W1b: drinking asks the widget sync to re-plan right away (refresh events ${before} → ${after})`)
  ok('W1b 「好，去喝水」 immediately fires huddle-widget-refresh (iOS chain re-planned without waiting 30 s)', `${before} → ${after}`)
  await a.close()
}

{
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

{
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

{
  const quiet = { enabled: true, startTime: '12:00', endTime: '13:00', allowUrgent: true }
  const a = await openApp({ time: at(3, 0), quiet })
  await a.makeDue()
  await a.page.waitForTimeout(400)
  assert.equal(await a.modalOpen(), true, 'W4: 03:00 is outside the user window')
  ok('W4 the user\'s own window REPLACES the built-in night (12:00–13:00 set → 03:00 is allowed)')
  await a.close()
}

// Focus stretch holds the popup. Pause stands in for "stop" (a long-press); both leave the running work phase.
{
  const a = await openApp({ time: at(14, 0) })
  await a.page.locator('[data-tour="focus-timer"]').first().click()
  await a.page.getByRole('button', { name: '開始專注' }).first().click()
  await a.page.waitForTimeout(800)
  await a.makeDue()
  await a.tick(); await a.tick()
  assert.equal(await a.modalOpen(), false, 'W5: not during a running focus stretch')
  ok('W5 focus running + water due → the popup stays closed through two polls (reminder kept, not eaten)')
  const stored = await a.page.evaluate(() => localStorage.getItem('waddle.waterReminder.nextDueAt'))
  assert.ok(Number(stored) > 0 && Number(stored) < at(14, 5).getTime())
  // End the focus stretch: pause → no longer running.
  const pause = a.page.getByRole('button', { name: '暫停' }).first()
  if (!(await pause.count())) await a.page.locator('[aria-label*="點一下顯示計時控制"]').first().click().catch(() => {})
  await a.page.getByRole('button', { name: '暫停' }).first().click()
  await a.page.waitForTimeout(300)
  assert.equal(await a.modalOpen(), false, 'W5b: not instantly — it waits for the timer\'s own screen change')
  ok('W5b the popup does NOT appear in the same instant the focus ends')
  await a.tick(5_000)
  assert.equal(await a.modalOpen(), true, 'W5c: appears a few seconds after focus ended')
  ok('W5c ...it appears ~4 s after the focus stretch ended')
  const dbg = await a.dbg()
  if (dbg) { assert.equal(dbg.dueAfterFocus, true); ok('W5d dueAfterFocus === true for this popup', JSON.stringify(dbg)) } else skip('W5d dueAfterFocus', 'probe not installed')
  // A fresh reminder later is NOT flagged.
  await a.page.getByRole('button', { name: '好，去喝水' }).first().click()
  await a.page.waitForTimeout(300)
  const dbg2 = await a.dbg()
  if (dbg2) { assert.equal(dbg2.dueAfterFocus, false); ok('W5e after 「好，去喝水」 dueAfterFocus resets to false') } else skip('W5e reset', 'probe not installed')
  assert.deepEqual(a.errors, [], 'no page errors')
  await a.close()
}

// Background tab + notification permission already granted.
{
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
{
  const a = await openApp({ time: at(14, 0) })
  await a.makeDue(); await a.tick()
  assert.deepEqual(await a.notes(), [], 'W6b: visible tab → no system notification')
  ok('W6b visible tab → no system notification (the popup is enough)')
  await a.close()
}
{
  const a = await openApp({ time: at(3, 0) })
  await a.page.evaluate(() => { window.__hidden = true })
  await a.makeDue(); await a.tick()
  assert.deepEqual(await a.notes(), [], 'W6c: night → silent')
  ok('W6c background tab at night → no system notification (quiet rules apply)')
  await a.close()
}

// ───────────────────────────── meetings (web path) ─────────────────────────────
const MEETINGS = [
  { id: '00000000-0000-4000-8000-00000000a001', title: '每日站會', start: '10:00', end: '10:30' },
  { id: '00000000-0000-4000-8000-00000000a002', title: '早班交接', start: '07:55', end: '08:30' },
]
{
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
for (const [allowUrgent, expected] of [[true, 1], [false, 0]]) {
  // 07:46 → 07:45 reminder for the 07:55 meeting falls inside 22:00–08:00.
  const quiet = { enabled: true, startTime: '22:00', endTime: '08:00', allowUrgent }
  const a = await openApp({ time: at(7, 46), meetings: MEETINGS, water: false, lead: 10, quiet })
  await a.tick(1_000); await a.tick()
  const n = (await a.notes()).filter((x) => x.title.includes('早班交接')).length
  assert.equal(n, expected, `M2: allowUrgent=${allowUrgent} → ${expected} notification(s), got ${n}`)
  ok(`M2 勿擾時段 on, 允許緊急通知=${allowUrgent ? '開' : '關'} → meeting reminder ${expected ? 'still arrives' : 'skipped'}`)
  await a.close()
}

await browser.close()
// Every write the app tried was answered locally (nothing reached Supabase); list what it tried.
console.log(`\nSupabase writes intercepted and answered locally: ${writes.length}${writes.length ? ' → ' + [...new Set(writes)].join(', ') : ''}`)
const passed = results.filter((r) => r[0] === 'PASS').length
const skipped = results.filter((r) => r[0] === 'SKIP').length
console.log(`DONE: ${passed} PASS, ${skipped} SKIP, 0 FAIL`)
