#!/usr/bin/env node
/**
 * 快速新增任務 widget (huddle://widget/quick-add → /?widget=quick-add) —
 * deterministic end-to-end check of the App side. Spawns its own `next dev`,
 * logs in with the .env.e2e.local test account, drives the capture sheet and
 * reads the result back from the real database. Every assertion prints
 * PASS / FAIL; the last line is the total.
 *
 *  1. 390x844: /?widget=quick-add → sheet visible, the box is document.activeElement, ?widget cleared from the URL
 *  2. type a unique title + Enter → sheet closes, toast, row lands in the default category with no date
 *  3. open again, type, 取消 → no task exists for that text (also Esc and backdrop)
 *  4. empty / whitespace-only box → 加入 is disabled
 *  5. English UI → no Chinese characters anywhere in the sheet
 *  6. 1280x800: sheet visible, centered, can submit
 *  7. touch targets >= 44px, no horizontal scroll (390 and 375)
 *  + IME Enter does not submit, Shift+Enter is a newline, pasted lines are kept,
 *    a failed save keeps the text and the retry works.
 *
 * DB safety: the project ref is checked first (printed), only the test
 * account's rows are touched, and the only write is deleting tasks whose title
 * contains this run's unique marker (verified before and after).
 * Screenshots → docs/features/quick-add-widget/shots/
 *
 * Run: node scripts/e2e/quick-add-widget-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3317
const BASE = `http://localhost:${PORT}`
const EXPECTED_REF = 'jnikcndiexjojgvicohf'
const SHOTS = path.join(process.cwd(), 'docs/features/quick-add-widget/shots')
mkdirSync(SHOTS, { recursive: true })

function loadEnvFile(p) {
  const out = {}
  if (!existsSync(p)) return out
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[line.slice(0, eq).trim()] = v
  }
  return out
}
const e2e = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const admin = loadEnvFile(path.join(process.cwd(), '.env.admin.local'))
const local = loadEnvFile(path.join(process.cwd(), '.env.local'))
const EMAIL = process.env.E2E_EMAIL || e2e.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || e2e.E2E_PASSWORD
const SUPA = (admin.SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE = admin.SUPABASE_SERVICE_ROLE_KEY || admin.SUPABASE_SECRET_KEY
if (!EMAIL || !PASSWORD) { console.error('missing E2E_EMAIL / E2E_PASSWORD in .env.e2e.local'); process.exit(1) }
if (!SUPA || !SERVICE) { console.error('missing SUPABASE_URL / service key in .env.admin.local'); process.exit(1) }

// ── Identity check before anything touches a database (lessons 2026-07-29 / 09-02) ──
const appHost = new URL(local.NEXT_PUBLIC_SUPABASE_URL).host
const adminHost = new URL(SUPA).host
console.log(`[identity] app (.env.local) -> ${appHost}`)
console.log(`[identity] admin read key   -> ${adminHost}`)
if (appHost !== adminHost || !appHost.startsWith(`${EXPECTED_REF}.`)) {
  console.error(`ABORT: Supabase host mismatch (expected ref ${EXPECTED_REF})`)
  process.exit(1)
}

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

// ── Database helpers (REST with the admin key; the only write is the tagged cleanup) ──
const hdr = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
async function dbGet(pathAndQuery) {
  const r = await fetch(`${SUPA}/rest/v1/${pathAndQuery}`, { headers: hdr })
  if (!r.ok) throw new Error(`GET ${pathAndQuery} -> ${r.status} ${await r.text()}`)
  return r.json()
}
const RUN = `QAQ${Date.now().toString(36)}`
const tag = (s) => `${RUN} ${s}`
let USER_ID = null
const tasksByText = (text) =>
  dbGet(`tasks?select=id,title,category_id,workspace_id,scheduled_date,due_date,is_completed&user_id=eq.${USER_ID}&title=ilike.${encodeURIComponent('*' + text + '*')}`)
async function cleanup() {
  if (!USER_ID) return 0
  const rows = await tasksByText(RUN)
  // Hard guard: only ever delete this run's own rows.
  const mine = rows.filter((r) => typeof r.title === 'string' && r.title.includes(RUN))
  if (mine.length !== rows.length) throw new Error('cleanup refused: query returned rows without the run marker')
  if (mine.length === 0) return 0
  const ids = mine.map((r) => r.id).join(',')
  const r = await fetch(`${SUPA}/rest/v1/tasks?user_id=eq.${USER_ID}&id=in.(${ids})`, { method: 'DELETE', headers: hdr })
  if (!r.ok) throw new Error(`cleanup DELETE -> ${r.status} ${await r.text()}`)
  return mine.length
}

// ── Dev server (ours only: we remember the PID and never kill by port / name) ──
const portBusy = () => new Promise((resolve) => {
  const s = net.connect({ port: PORT, host: '127.0.0.1' })
  s.once('connect', () => { s.destroy(); resolve(true) })
  s.once('error', () => resolve(false))
})
if (await portBusy()) { console.error(`ABORT: port ${PORT} is already in use; not touching it`); process.exit(1) }
const server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true,
})
let serverLog = ''
server.stdout.on('data', (d) => { serverLog += d })
server.stderr.on('data', (d) => { serverLog += d })
const serverPid = server.pid
function stopServer() {
  if (!serverPid) return
  try { process.kill(-serverPid, 'SIGTERM') } catch { try { server.kill('SIGTERM') } catch { /* gone */ } }
}
async function waitServer() {
  for (let i = 0; i < 150; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.status < 500) return } catch { /* not yet */ }
    await sleep(1000)
  }
  throw new Error('dev server not ready:\n' + serverLog.slice(-1500))
}

// ── Page helpers ──
const SHEET = '[data-quick-add-sheet]'
const INPUT = '[data-quick-add-input]'
const CJK = /[　-〿㐀-鿿＀-￯]/
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) }).catch(() => {})
const pageErrors = []

async function fillStable(page, selector, value) {
  for (let i = 0; i < 5; i++) {
    await page.fill(selector, value)
    await sleep(150)
    if ((await page.inputValue(selector)) === value) return
  }
  throw new Error(`fill unstable: ${selector}`)
}
async function login(page) {
  await page.goto(`${BASE}/login?method=email`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').waitFor({ timeout: 60000 })
  await sleep(2500)
  await fillStable(page, 'input[type="email"]', EMAIL)
  await fillStable(page, 'input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
  await sleep(4000)
}
async function openSheet(page) {
  await page.goto(`${BASE}/?widget=quick-add`, { waitUntil: 'domcontentloaded' })
  await page.locator(SHEET).waitFor({ state: 'visible', timeout: 90000 })
  await sleep(450) // let the 200ms enter animation finish before measuring
}
const closed = (page) => page.locator(SHEET).waitFor({ state: 'detached', timeout: 8000 }).then(() => true, () => false)
const addButton = (page) => page.locator(SHEET).getByRole('button', { name: /^(加入|Add)/ })
const cancelButton = (page) => page.locator(SHEET).getByRole('button', { name: /^(取消|Cancel)$/ })
async function box(page, sel) { return page.locator(sel).first().boundingBox() }

let browser, mobileCtx, desktopCtx, engCtx
let cleaned = -1
try {
  await waitServer()
  browser = await chromium.launch()
  const langInit = ({ lang }) => { try { localStorage.setItem('waddle-language-v1', lang) } catch { /* private mode */ } }

  // Log in once on the phone viewport, reuse the session for the other contexts.
  mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'zh-TW', deviceScaleFactor: 2 })
  await mobileCtx.addInitScript(langInit, { lang: 'zh-TW' })
  const page = await mobileCtx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await login(page)
  // The session lives in cookies (@supabase/ssr): `sb-<ref>-auth-token`, possibly chunked as `.0`, `.1`…
  {
    const parts = (await mobileCtx.cookies())
      .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
      .sort((a, b) => Number(a.name.split('.')[1] ?? 0) - Number(b.name.split('.')[1] ?? 0))
    let raw = decodeURIComponent(parts.map((c) => c.value).join(''))
    if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64url').toString('utf8')
    try { USER_ID = JSON.parse(raw).user?.id ?? null } catch { USER_ID = null }
  }
  if (!USER_ID) throw new Error('could not read the test account id from the session')
  const storage = await mobileCtx.storageState()

  // Where a default task should land, straight from the database (same rule as the app).
  const wss = await dbGet(`workspaces?select=id,name,is_default,is_archived&user_id=eq.${USER_ID}`)
  const cats = await dbGet(`categories?select=id,name,workspace_id,is_default,is_archived&user_id=eq.${USER_ID}`)
  const settingsRow = (await dbGet(`user_settings?select=default_category_enabled&user_id=eq.${USER_ID}`))[0]
  const defaultWs = wss.find((w) => w.is_default && !w.is_archived)
  const flagged = cats.filter((c) => c.is_default && !c.is_archived)
  const expectedCat = flagged.find((c) => c.workspace_id === defaultWs?.id) || flagged[0]
  const expectedWs = wss.find((w) => w.id === expectedCat?.workspace_id)
  const placeLabel = expectedWs?.is_default ? expectedCat.name : `${expectedWs?.name} / ${expectedCat?.name}`
  console.log(`[setup] default category = "${placeLabel}" (defaultCategoryEnabled=${settingsRow?.default_category_enabled ?? 'unset'}), marker ${RUN}`)
  check('setup: test account has a default category to land in', !!expectedCat && settingsRow?.default_category_enabled !== false)

  // ── 1. Open from the widget URL ───────────────────────────────────────────
  await openSheet(page)
  await shot(page, '01-mobile-open.png')
  check('1a 390x844: sheet is visible', await page.locator(SHEET).isVisible())
  check('1b the input is document.activeElement (keyboard would rise)',
    await page.evaluate((s) => document.activeElement === document.querySelector(s), INPUT))
  const search = await page.evaluate(() => window.location.search)
  check('1c ?widget is cleared from the URL', !search.includes('widget'), `search="${search}"`)
  check('1d add button starts disabled (box empty)', await addButton(page).isDisabled())
  const sheetBox = await box(page, SHEET)
  check('1e sheet is docked to the bottom edge, full width',
    sheetBox && Math.abs(sheetBox.x) < 1 && Math.abs(sheetBox.width - 390) < 1 && Math.abs(sheetBox.y + sheetBox.height - 844) < 2,
    JSON.stringify(sheetBox && { x: sheetBox.x, y: Math.round(sheetBox.y), w: sheetBox.width, h: Math.round(sheetBox.height) }))

  // ── 7. touch sizes / overflow (phone, sheet open, text entered) ───────────
  const measure = async (label) => {
    const input = await box(page, INPUT)
    const add = await box(page, `${SHEET} button:last-of-type`)
    const cancel = await page.locator(SHEET).getByRole('button', { name: /^(取消|Cancel)$/ }).boundingBox()
    const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, win: window.innerWidth }))
    check(`7 ${label}: input height >= 44`, input && input.height >= 44, `h=${input && Math.round(input.height)}`)
    check(`7 ${label}: 加入 button >= 44x44`, add && add.height >= 44 && add.width >= 44, add && `${Math.round(add.width)}x${Math.round(add.height)}`)
    check(`7 ${label}: 取消 button >= 44x44`, cancel && cancel.height >= 44 && cancel.width >= 44, cancel && `${Math.round(cancel.width)}x${Math.round(cancel.height)}`)
    check(`7 ${label}: no horizontal scroll`, overflow.doc <= overflow.win && overflow.body <= overflow.win, JSON.stringify(overflow))
    const fs = await page.evaluate((s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize), INPUT)
    check(`7 ${label}: input font-size >= 16px (no iOS zoom)`, fs >= 16, `${fs}px`)
  }
  await page.fill(INPUT, tag('measure'))
  await measure('390px')
  await page.fill(INPUT, '')

  // ── 4. empty / whitespace → disabled ─────────────────────────────────────
  check('4a empty box: 加入 disabled', await addButton(page).isDisabled())
  await page.fill(INPUT, '   \n  ')
  check('4b whitespace-only: 加入 disabled', await addButton(page).isDisabled())
  await page.keyboard.press('Enter')
  await sleep(500)
  check('4c Enter on a blank box does nothing (sheet stays open)', await page.locator(SHEET).isVisible())
  await page.fill(INPUT, 'x')
  check('4d with text: 加入 enabled', await addButton(page).isEnabled())
  await page.fill(INPUT, '')
  check('4e cleared again: 加入 disabled', await addButton(page).isDisabled())

  // ── keyboard semantics ───────────────────────────────────────────────────
  const imeTitle = tag('ime-should-not-exist')
  await page.fill(INPUT, imeTitle)
  await page.evaluate((s) => {
    const el = document.querySelector(s)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true }))
  }, INPUT)
  await sleep(900)
  check('K1 Enter while an IME is composing does not submit',
    (await page.locator(SHEET).isVisible()) && (await tasksByText(imeTitle)).length === 0)
  await page.fill(INPUT, '')
  await page.locator(INPUT).click()
  await page.keyboard.type('line-a')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('line-b')
  check('K2 Shift+Enter inserts a newline and keeps the sheet open',
    (await page.inputValue(INPUT)) === 'line-a\nline-b' && (await page.locator(SHEET).isVisible()))
  await page.fill(INPUT, '')

  // ── 2. type + Enter → saved in the default category, no date ──────────────
  const titleA = tag('買牛奶')
  await page.fill(INPUT, titleA)
  await shot(page, '02-mobile-typed.png')
  await page.keyboard.press('Enter')
  const closedA = await closed(page)
  check('2a Enter closes the sheet', closedA)
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: '已加入' }).first()
  await toast.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  const toastText = (await toast.innerText().catch(() => '')).replace(/\s+/g, ' ')
  await shot(page, '03-mobile-saved-toast.png')
  check('2b success toast names the real default category', toastText.includes(`已加入「${placeLabel}」`), `toast="${toastText}" expected 「${placeLabel}」`)
  await sleep(1200)
  const rowsA = await tasksByText(titleA)
  check('2c exactly one task row was created with that title', rowsA.length === 1, `rows=${rowsA.length}`)
  check('2d it sits in the default category', rowsA[0]?.category_id === expectedCat?.id, `category_id=${rowsA[0]?.category_id} expected=${expectedCat?.id}`)
  check('2e it has no scheduled date and no due date', rowsA[0] && rowsA[0].scheduled_date === null && rowsA[0].due_date === null,
    JSON.stringify(rowsA[0] && { scheduled_date: rowsA[0].scheduled_date, due_date: rowsA[0].due_date }))
  check('2f it is not completed', rowsA[0]?.is_completed === false)

  // pasted multi-line text keeps its line breaks
  await openSheet(page)
  const titleML = `${tag('多行')}-1\n${RUN}-2`
  await page.fill(INPUT, titleML)
  const grown = await box(page, INPUT)
  check('K3 the box grows for multi-line text', grown && grown.height > 44 + 10, `h=${grown && Math.round(grown.height)}`)
  await page.keyboard.press('Enter')
  await closed(page)
  await sleep(1200)
  const rowsML = await tasksByText(`${RUN}-2`)
  check('K4 pasted lines keep their line break in the saved title', rowsML.length === 1 && rowsML[0].title === titleML, JSON.stringify(rowsML[0]?.title))

  // ── 3. cancel leaves nothing behind (button, Esc, backdrop) ───────────────
  await openSheet(page)
  const titleB = tag('取消不該存在')
  await page.fill(INPUT, titleB)
  await cancelButton(page).click()
  check('3a 取消 closes the sheet', await closed(page))
  await sleep(1500)
  check('3b …and no task with that text exists', (await tasksByText(titleB)).length === 0)

  await openSheet(page)
  const titleC = tag('Esc不該存在')
  await page.fill(INPUT, titleC)
  await page.keyboard.press('Escape')
  check('3c Esc closes the sheet', await closed(page))
  await sleep(1200)
  check('3d …and nothing was saved', (await tasksByText(titleC)).length === 0)

  await openSheet(page)
  const titleD = tag('點背景不該存在')
  await page.fill(INPUT, titleD)
  await page.mouse.click(195, 80)
  check('3e tapping the backdrop closes the sheet', await closed(page))
  await sleep(1200)
  check('3f …and nothing was saved', (await tasksByText(titleD)).length === 0)

  // a fresh open starts with an empty box (text is not carried over)
  await openSheet(page)
  check('3g a new open starts with an empty box', (await page.inputValue(INPUT)) === '')
  await page.keyboard.press('Escape')
  await closed(page)

  // ── failed save keeps the text; retry works ───────────────────────────────
  await openSheet(page)
  const titleF = tag('失敗後重試')
  await page.fill(INPUT, titleF)
  await page.route('**/rest/v1/tasks**', (route) => (route.request().method() === 'POST' ? route.abort('failed') : route.continue()))
  await addButton(page).click()
  const errToast = page.locator('[data-sonner-toast]').filter({ hasText: '儲存失敗' }).first()
  await errToast.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await sleep(500)
  await shot(page, '04-mobile-failed-keeps-text.png')
  check('F1 failed save: error toast shown', await errToast.isVisible().catch(() => false))
  check('F2 failed save: sheet stays open with the typed text intact',
    (await page.locator(SHEET).isVisible()) && (await page.inputValue(INPUT)) === titleF)
  check('F3 failed save: nothing was written', (await tasksByText(titleF)).length === 0)
  check('F4 failed save: 加入 is usable again', await addButton(page).isEnabled())
  await page.unroute('**/rest/v1/tasks**')
  await addButton(page).click()
  check('F5 retry after the network is back saves it and closes the sheet', await closed(page))
  await sleep(1200)
  check('F6 retry produced exactly one row', (await tasksByText(titleF)).length === 1)

  // ── 7b. 375x667 (smallest supported phone) ───────────────────────────────
  await page.setViewportSize({ width: 375, height: 667 })
  await openSheet(page)
  await page.fill(INPUT, tag('375'))
  await shot(page, '05-mobile-375.png')
  await measure('375px')
  await page.keyboard.press('Escape')
  await closed(page)
  await page.setViewportSize({ width: 390, height: 844 })

  // ── 5. English UI has no Chinese characters ──────────────────────────────
  engCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US', storageState: storage, deviceScaleFactor: 2 })
  await engCtx.addInitScript(langInit, { lang: 'en' })
  const en = await engCtx.newPage()
  en.setDefaultTimeout(60000)
  en.on('pageerror', (e) => pageErrors.push(String(e)))
  await openSheet(en)
  await en.fill(INPUT, 'Buy milk')
  await shot(en, '06-mobile-english.png')
  const enText = await en.evaluate((s) => {
    const root = document.querySelector(s)
    const bits = [root.innerText]
    root.querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => {
      bits.push(el.getAttribute('placeholder') || '', el.getAttribute('aria-label') || '', el.getAttribute('title') || '')
    })
    return bits.join(' | ')
  }, SHEET)
  const cjkHit = enText.match(CJK)
  check('5a English: no Chinese characters in the sheet (text, placeholder, aria labels)', !cjkHit, `text="${enText.replace(/\s+/g, ' ')}"${cjkHit ? ` first CJK="${cjkHit[0]}"` : ''}`)
  check('5b English: buttons read Cancel / Add', /Cancel/.test(enText) && /\bAdd\b/.test(enText))
  const enOpenOk = await en.locator(SHEET).isVisible()
  check('5c English: sheet opened from the widget URL', enOpenOk)
  await en.keyboard.press('Escape')
  await closed(en)

  // ── 6. Desktop 1280x800 ──────────────────────────────────────────────────
  desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-TW', storageState: storage })
  await desktopCtx.addInitScript(langInit, { lang: 'zh-TW' })
  const desk = await desktopCtx.newPage()
  desk.setDefaultTimeout(60000)
  desk.on('pageerror', (e) => pageErrors.push(String(e)))
  await openSheet(desk)
  await shot(desk, '07-desktop-open.png')
  check('6a 1280x800: sheet is visible', await desk.locator(SHEET).isVisible())
  const dbox = await box(desk, SHEET)
  check('6b it is a centered small window (not full width)',
    dbox && dbox.width < 520 && Math.abs(dbox.x + dbox.width / 2 - 640) < 2 && Math.abs(dbox.y + dbox.height / 2 - 400) < 2,
    JSON.stringify(dbox && { x: Math.round(dbox.x), y: Math.round(dbox.y), w: Math.round(dbox.width), h: Math.round(dbox.height) }))
  check('6c the input is focused', await desk.evaluate((s) => document.activeElement === document.querySelector(s), INPUT))
  const titleDesk = tag('桌機')
  await desk.fill(INPUT, titleDesk)
  await desk.keyboard.press('Enter')
  check('6d Enter closes the sheet', await closed(desk))
  await sleep(1200)
  const rowsDesk = await tasksByText(titleDesk)
  check('6e the desktop task was saved in the default category without a date',
    rowsDesk.length === 1 && rowsDesk[0].category_id === expectedCat?.id && rowsDesk[0].scheduled_date === null)
  const deskOverflow = await desk.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }))
  check('6f desktop: no horizontal scroll', deskOverflow.doc <= deskOverflow.win, JSON.stringify(deskOverflow))

  check('Z no uncaught page errors during the whole run', pageErrors.length === 0, pageErrors.slice(0, 2).join(' || '))
} catch (err) {
  failed++
  console.log(`FAIL script crashed — ${err && err.stack ? err.stack.split('\n').slice(0, 4).join(' / ') : err}`)
} finally {
  try { await browser?.close() } catch { /* ignore */ }
  stopServer()
  try {
    cleaned = await cleanup()
    const left = USER_ID ? (await tasksByText(RUN)).length : 0
    console.log(`[cleanup] deleted ${cleaned} test task(s) containing ${RUN}; remaining with marker: ${left}`)
    if (left !== 0) { failed++; console.log('FAIL cleanup left test rows behind') }
    else { passed++; console.log('PASS cleanup: no rows with this run marker remain') }
  } catch (e) {
    failed++
    console.log(`FAIL cleanup error — ${e.message}`)
  }
  console.log(`\nTOTAL ${passed}/${passed + failed} PASS${failed ? `, ${failed} FAIL` : ''}`)
  process.exit(failed ? 1 : 0)
}
