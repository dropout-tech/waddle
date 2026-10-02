#!/usr/bin/env node
/**
 * Verifies two time-block fixes (待辦盤點 #23):
 *
 *  ① addTimeBlock rollback — the Supabase INSERT is forced to fail (HTTP 500).
 *     The optimistic block must disappear again and an error toast must show
 *     (before the fix a "ghost" block stayed on screen with nothing in the DB).
 *
 *  ② Short blocks are movable — 15-min and 1-min blocks: grabbing the middle
 *     and dragging must MOVE the block (start and end shift, length kept).
 *     Before the fix the resize strips covered the whole block, so the same
 *     gesture resized it instead. Also checks a 60-min block still resizes
 *     from its bottom edge, on desktop (1440) and phone (390, real touch).
 *
 * Test data: blocks labelled "E2E短…/E2E長…" are inserted for today through
 * the REST API with the logged-in session and deleted again at the end.
 *
 * Run: node scripts/e2e/time-block-rollback-short-drag-verify.mjs
 * (needs .env.local + .env.e2e.local; E2E_BASE_URL reuses a running server)
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3107
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL
const BASE_URL = EXTERNAL_BASE_URL || `http://localhost:${PORT}`
const SHOT_DIR = process.env.SHOT_DIR || path.join(os.tmpdir(), 'time-block-verify-shots')
mkdirSync(SHOT_DIR, { recursive: true })

function loadEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    out[line.slice(0, eq).trim()] = value
  }
  return out
}

const e2eEnv = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const appEnv = loadEnvFile(path.join(process.cwd(), '.env.local'))
const EMAIL = process.env.E2E_EMAIL || e2eEnv.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || e2eEnv.E2E_PASSWORD
const SUPABASE_URL = appEnv.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = appEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!EMAIL || !PASSWORD || !SUPABASE_URL || !ANON_KEY) {
  console.error('[tb-verify] Missing E2E_EMAIL/E2E_PASSWORD or Supabase env')
  process.exit(1)
}
console.log(`[tb-verify] Supabase host: ${new URL(SUPABASE_URL).host}`)

let devServer
let exitCode = 0
const results = []

async function waitForServerReady(timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { if ((await fetch(BASE_URL)).status < 500) return } catch {}
    await sleep(500)
  }
  throw new Error(`Dev server did not become ready within ${timeoutMs}ms`)
}

function startDevServer() {
  devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
    cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  devServer.stdout.on('data', () => {})
  devServer.stderr.on('data', () => {})
}

function stopDevServer() {
  if (!devServer || !devServer.pid) return
  try { process.kill(-devServer.pid, 'SIGTERM') } catch { try { devServer.kill('SIGTERM') } catch {} }
}

async function step(name, fn) {
  try {
    await fn()
    results.push({ name, passed: true })
    console.log(`PASS — ${name}`)
  } catch (e) {
    results.push({ name, passed: false, note: e.message })
    console.log(`FAIL — ${name} — ${e.message}`)
    exitCode = 1
  }
}

const today = new Date()
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

// ── Session + REST helpers ───────────────────────────────────────────────
// @supabase/ssr keeps the session in (possibly chunked) cookies:
// sb-<ref>-auth-token[.N] = "base64-<json>".
async function sessionFrom(context) {
  const cookies = (await context.cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
  cookies.sort((a, b) => Number(a.name.split('.').pop()) - Number(b.name.split('.').pop()))
  let raw = cookies.map((c) => c.value).join('')
  if (!raw) throw new Error('no auth cookie found')
  raw = decodeURIComponent(raw)
  if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64').toString('utf8')
  const s = JSON.parse(raw)
  return { token: s.access_token, userId: s.user.id }
}

async function rest(session, method, pathAndQuery, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${pathAndQuery} → ${res.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
// aria-label is "<label> HH:mm–HH:mm"
function parseAria(aria) {
  const m = /(\d{2}:\d{2})–(\d{2}:\d{2})$/.exec(aria || '')
  if (!m) throw new Error(`cannot parse aria-label "${aria}"`)
  return { start: toMin(m[1]), end: toMin(m[2]), text: `${m[1]}–${m[2]}` }
}

async function login(page) {
  await page.goto(`${BASE_URL}/login?method=email`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor({ state: 'visible', timeout: 120000 }) // first dev compile is slow
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type=submit]').click()
  await page.waitForURL(`${BASE_URL}/`, { timeout: 30000 })
}

async function pointerDrag(page, fromX, fromY, toX, toY, steps = 12) {
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(fromX + ((toX - fromX) * i) / steps, fromY + ((toY - fromY) * i) / steps)
    await sleep(30)
  }
  await page.mouse.up()
}

async function touchDrag(cdp, fromX, fromY, toX, toY, steps = 15) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y: fromY, id: 1 }] })
  await sleep(120)
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: fromX + ((toX - fromX) * i) / steps, y: fromY + ((toY - fromY) * i) / steps, id: 1 }],
    })
    await sleep(40)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

// Desktop: segmented control button「日檢視」. Phone: a picker button
//「目前是X檢視，點擊更換」that opens a menu with a「日檢視」item.
async function openDayView(page) {
  const desktopBtn = page.getByRole('button', { name: '日檢視', exact: true })
  const phonePicker = page.getByRole('button', { name: /^目前是.檢視，點擊更換$/ })
  await desktopBtn.or(phonePicker).first().waitFor({ state: 'visible', timeout: 20000 })
  if (await desktopBtn.count()) {
    await desktopBtn.first().click()
  } else if (!/日檢視/.test((await phonePicker.first().getAttribute('aria-label')) || '')) {
    await phonePicker.first().click()
    await page.getByRole('menuitem', { name: /日檢視/ }).click()
  }
  await sleep(1200)
}

const blockLoc = (page, label) => page.locator(`[data-block][aria-label^="${label} "]`).first()

// Which part of the block sits under the grab point: the move body or a
// resize strip (the strips carry cursor:ns-resize).
async function partUnder(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    if (!el || !el.closest('[data-block]')) return 'outside'
    const strip = el.closest('.cursor-ns-resize')
    return strip ? 'resize-strip' : 'body'
  }, { x, y })
}

async function dragMiddle(page, label, dy, { cdp } = {}) {
  const loc = blockLoc(page, label)
  await loc.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await sleep(500)
  const before = parseAria(await loc.getAttribute('aria-label'))
  const box = await loc.boundingBox()
  if (!box) throw new Error('block has no bounding box')
  const x = box.x + Math.min(box.width / 2, 60)
  const y = box.y + box.height / 2
  const part = await partUnder(page, x, y)
  if (cdp) await touchDrag(cdp, x, y, x, y + dy)
  else await pointerDrag(page, x, y, x, y + dy)
  await sleep(1500)
  const after = parseAria(await loc.getAttribute('aria-label'))
  return { before, after, part, height: Math.round(box.height) }
}

function assertMoved(r, name) {
  const lenBefore = r.before.end - r.before.start
  const lenAfter = r.after.end - r.after.start
  const info = `${name}: h=${r.height}px grab=${r.part} ${r.before.text} → ${r.after.text}`
  console.log(`[tb-verify] ${info}`)
  if (r.after.start === r.before.start) throw new Error(`start did not move (${info})`)
  // A move keeps the exact length — a 1-min block stays 1 min.
  const expectedLen = lenBefore
  if (r.part !== 'body') throw new Error(`grab point is on the ${r.part}, not the move body (${info})`)
  if (lenAfter !== expectedLen) throw new Error(`length ${lenBefore}→${lenAfter} min, expected ${expectedLen}: resized not moved (${info})`)
}

async function main() {
  if (!EXTERNAL_BASE_URL) { startDevServer(); await waitForServerReady() }
  else console.log(`[tb-verify] Reusing server at ${BASE_URL}`)

  const browser = await chromium.launch()
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' })
  desktop.on('dialog', (d) => d.accept())
  desktop.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`))
  const dayCol = () => desktop.locator(`[data-day-grid][data-day-date="${todayStr}"]`).first()
  let session

  await step('desktop: login + day view', async () => {
    await login(desktop)
    await openDayView(desktop)
    await dayCol().waitFor({ state: 'attached', timeout: 15000 })
    session = await sessionFrom(desktop.context())
  })
  if (!session) throw new Error('no session — aborting')

  // ── ① forced INSERT failure must not leave a ghost block ─────────────
  await step('① INSERT 500 → block rolled back + error toast', async () => {
    const before = await desktop.locator('[data-block]').count()
    await desktop.route('**/rest/v1/time_blocks**', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'e2e forced failure', details: null, hint: null }) })
        : route.continue())
    const spot = await dayCol().evaluate((el) => {
      el.scrollIntoView({ block: 'start' })
      const rect = el.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const top = Math.max(rect.top, 80)
      const bottom = Math.min(rect.bottom, window.innerHeight - 40)
      for (let y = top + 20; y < bottom - 80; y += 24) {
        const a = document.elementFromPoint(x, y)
        const b = document.elementFromPoint(x, y + 70)
        const inBlock = (n) => n.closest('[data-block],[data-task="true"]')
        if (a && b && !inBlock(a) && !inBlock(b) && el.contains(a) && el.contains(b)) return { x, y }
      }
      return null
    })
    if (!spot) throw new Error('no empty spot to draw a block')
    await pointerDrag(desktop, spot.x, spot.y, spot.x, spot.y + 70)
    await sleep(500)
    await desktop.getByText('選擇時間區塊的類型').waitFor({ state: 'visible', timeout: 5000 })
    await desktop.getByRole('button', { name: /各類時間安排/ }).click()
    await sleep(300)
    await desktop.getByRole('button', { name: /專注工作時段/ }).click()
    await sleep(2500)
    await desktop.screenshot({ path: path.join(SHOT_DIR, '01-after-failed-insert.png') })
    const toast = desktop.getByText(/儲存失敗/).first()
    const toastVisible = await toast.isVisible().catch(() => false)
    const toastText = toastVisible ? (await toast.innerText()).replace(/\s+/g, ' ') : ''
    const after = await desktop.locator('[data-block]').count()
    await desktop.unroute('**/rest/v1/time_blocks**')
    console.log(`[tb-verify] blocks before=${before} after=${after} toast="${toastText}"`)
    if (after !== before) throw new Error(`ghost block left on screen (blocks ${before} → ${after})`)
    if (!toastVisible) throw new Error('no 儲存失敗 toast shown')
  })

  await step('① after reload the DB has no stray block either', async () => {
    const before = await desktop.locator('[data-block]').count()
    await desktop.reload({ waitUntil: 'domcontentloaded' })
    await openDayView(desktop)
    await dayCol().waitFor({ state: 'attached', timeout: 15000 })
    await sleep(1500)
    const after = await desktop.locator('[data-block]').count()
    if (after !== before) throw new Error(`block count changed across reload (${before} → ${after})`)
  })

  // ── ② short blocks: middle grab moves, long block edge still resizes ──
  const seeds = [
    { label: 'E2E短15', start: '20:00', end: '20:15' },
    { label: 'E2E短1', start: '21:00', end: '21:01' },
    { label: 'E2E長60', start: '18:00', end: '19:00' },
    { label: 'E2E手機15', start: '16:00', end: '16:15' },
  ]
  await step('② seed test blocks via REST', async () => {
    await rest(session, 'DELETE', `time_blocks?user_id=eq.${session.userId}&label=like.E2E*`)
    await rest(session, 'POST', 'time_blocks', seeds.map((s) => ({
      user_id: session.userId, date: todayStr, start_time: s.start, end_time: s.end,
      type: 'focus', label: s.label, color: '#7C9A92', is_recurring: false,
    })))
    await desktop.reload({ waitUntil: 'domcontentloaded' })
    await openDayView(desktop)
    for (const s of seeds) await blockLoc(desktop, s.label).waitFor({ state: 'attached', timeout: 15000 })
  })

  await step('② desktop: 15-min block — drag middle moves it', async () => {
    const r = await dragMiddle(desktop, 'E2E短15', 60)
    await desktop.screenshot({ path: path.join(SHOT_DIR, '02-desktop-15min-moved.png') })
    assertMoved(r, '15-min')
  })

  await step('② desktop: 1-min block — drag middle moves it', async () => {
    assertMoved(await dragMiddle(desktop, 'E2E短1', 60), '1-min')
  })

  await step('② desktop: 60-min block — bottom edge still resizes', async () => {
    const loc = blockLoc(desktop, 'E2E長60')
    await loc.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await sleep(500)
    const before = parseAria(await loc.getAttribute('aria-label'))
    const box = await loc.boundingBox()
    const x = box.x + Math.min(box.width / 2, 60)
    const y = box.y + box.height - 2
    await desktop.mouse.move(x, y) // hover reveals the strip on desktop
    await sleep(200)
    await pointerDrag(desktop, x, y, x, y + 30)
    await sleep(1500)
    const after = parseAria(await loc.getAttribute('aria-label'))
    console.log(`[tb-verify] 60-min bottom edge: ${before.text} → ${after.text}`)
    if (after.start !== before.start || after.end <= before.end) throw new Error(`expected end-only resize, got ${before.text} → ${after.text}`)
  })

  // Phone: reuse the session (repeated password logins get rate-limited).
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'zh-TW', hasTouch: true, isMobile: true, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    storageState: await desktop.context().storageState(),
  })
  const mobile = await mctx.newPage()
  mobile.on('pageerror', (err) => console.log(`[pageerror-mobile] ${err.message}`))
  const cdp = await mctx.newCDPSession(mobile)

  await step('② phone 390: 15-min block — touch-drag middle moves it', async () => {
    await mobile.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await sleep(2500)
    if (mobile.url().includes('/login')) throw new Error('session reuse failed')
    await openDayView(mobile)
    await blockLoc(mobile, 'E2E手機15').waitFor({ state: 'attached', timeout: 15000 })
    const r = await dragMiddle(mobile, 'E2E手機15', 60, { cdp })
    await mobile.screenshot({ path: path.join(SHOT_DIR, '03-phone-15min-moved.png') })
    assertMoved(r, 'phone 15-min')
  })

  await step('② moves persisted to the DB', async () => {
    const rows = await rest(session, 'GET', `time_blocks?select=label,start_time,end_time&user_id=eq.${session.userId}&label=like.E2E*`)
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, `${r.start_time.slice(0, 5)}-${r.end_time.slice(0, 5)}`]))
    console.log(`[tb-verify] DB now: ${JSON.stringify(byLabel)}`)
    for (const s of seeds.filter((x) => x.label !== 'E2E長60')) {
      if (byLabel[s.label] === `${s.start}-${s.end}`) throw new Error(`${s.label} unchanged in DB`)
    }
  })

  await step('cleanup — delete E2E blocks', async () => {
    await rest(session, 'DELETE', `time_blocks?user_id=eq.${session.userId}&label=like.E2E*`)
    const left = await rest(session, 'GET', `time_blocks?select=id&user_id=eq.${session.userId}&label=like.E2E*`)
    if (left.length) throw new Error(`${left.length} E2E blocks left`)
  })

  await browser.close()
  console.log(`\n===== RESULTS (shots: ${SHOT_DIR}) =====`)
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'} — ${r.name}${r.note ? ` — ${r.note}` : ''}`)
  console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`)
}

main()
  .catch((e) => { console.error(e); exitCode = 1 })
  .finally(() => { stopDevServer(); process.exit(exitCode) })
