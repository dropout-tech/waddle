#!/usr/bin/env node
/**
 * Default-category mechanism + category-picker reordering.
 *
 * Asserts, against a real dev server and the real Supabase project:
 *  A. Settings → General has a "預設分類" section: toggle defaults ON and every
 *     workspace row's <select> is already pointing at a category named 未分類
 *     (i.e. the migration backfill landed and the UI reads it).
 *  B. Creating a task from the calendar (click empty grid → pick a workspace)
 *     opens the task modal already scoped to that workspace's 未分類.
 *  C. The category picker inside that modal floats the task's own workspace
 *     group to the top (the reordering the user asked for).
 *  D. Re-pointing the default at a different category in Settings changes
 *     where a freshly created calendar task lands.
 *  E. Turning the toggle OFF falls back to the workspace's FIRST category
 *     (the pre-feature behaviour).
 *  F. Restoring the toggle + default puts everything back.
 *  G. 390 px: the Settings section doesn't overflow horizontally and the
 *     selects meet the 44 px touch target.
 *  H. Zero pageerror across the whole run.
 *
 * DB writes: only user_settings (toggle) and categories.is_default, both
 * restored at the end. No tasks are ever saved — every create modal is
 * cancelled, so the task table is untouched.
 *
 * Screenshots → docs/reports/2026-08-04-default-category-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3141
const PROD = process.env.E2E_BASE_URL || null
const BASE = PROD || `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-04-default-category-shots', PROD ? 'prod' : '')
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
const env = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || env.E2E_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('missing E2E creds in .env.e2e.local'); process.exit(1) }

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  ok ? passed++ : failed++
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

const WAIT = PROD ? 'domcontentloaded' : 'networkidle'
const todayStr = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

async function fillStable(page, selector, value) {
  for (let i = 0; i < 5; i++) {
    await page.fill(selector, value)
    await sleep(150)
    if ((await page.inputValue(selector)) === value) return
  }
  throw new Error(`fill unstable: ${selector}`)
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ── Calendar helpers ──────────────────────────────────────────────────────
// A short click on an empty part of the day grid opens the slot-type picker
// (day-scroll-view treats <200 ms + <10 px as a click). Existing tasks and
// time blocks sit on top of the grid, so try several vertical positions and
// keep the first one that actually opens the picker.
async function openSlotPicker(page) {
  const grid = page.locator(`[data-day-grid][data-day-date="${todayStr}"]`).first()
  const box = await grid.boundingBox()
  if (!box) throw new Error('today grid column not found')
  const vh = page.viewportSize().height
  for (const ratio of [0.85, 0.7, 0.55, 0.4, 0.25]) {
    const x = box.x + box.width * 0.6
    const y = Math.min(Math.max(box.y + box.height * ratio, 120), vh - 60)
    await page.mouse.click(x, y, { delay: 30 })
    await sleep(500)
    if (await page.getByText('選擇時間區塊的類型').isVisible().catch(() => false)) return true
    await page.keyboard.press('Escape')
    await sleep(300)
  }
  return false
}

// Click a workspace in the slot-type picker → the task modal opens in create
// mode. Returns the text of its category trigger, e.g. "琢奧 / 未分類".
async function createFromCalendar(page, wsName) {
  const opened = await openSlotPicker(page)
  if (!opened) throw new Error('slot picker never opened')
  // The picker button renders label + description on separate lines; match on
  // the description ("新增任務到「X」") since it uniquely identifies the row.
  await page.locator('button').filter({ hasText: new RegExp(`新增任務到「${escapeRe(wsName)}」`) }).first().click()
  await sleep(1200)
  const trigger = page.locator('button').filter({ hasText: new RegExp(`${escapeRe(wsName)}\\s*/\\s*\\S`) }).first()
  await trigger.waitFor({ timeout: 15000 })
  return { trigger, label: (await trigger.innerText()).replace(/\s+/g, ' ').trim() }
}

async function closeTaskModal(page) {
  await page.keyboard.press('Escape')
  await sleep(400)
  await page.keyboard.press('Escape')
  await sleep(600)
}

// ── Settings helpers ──────────────────────────────────────────────────────
async function openSettings(page) {
  await page.locator('[aria-label="設定"]').first().click()
  await sleep(1200)
}
function defaultCategorySection(page) {
  return page.locator('div.space-y-3').filter({ hasText: '自動歸到預設分類' }).first()
}
// The settings modal body scrolls, and this section sits below the fold.
// Playwright's isVisible() is true for anything with a box in the DOM even
// when it's scrolled out of its container — so scroll it in and assert the
// box actually lands inside the viewport before believing (or screenshotting)
// it. The first QA pass on this script screenshotted the wrong part of the
// modal precisely because isVisible() alone was treated as proof.
async function sectionInView(page, section) {
  await section.scrollIntoViewIfNeeded().catch(() => {})
  await sleep(500)
  const box = await section.boundingBox()
  if (!box) return { ok: false, detail: 'no bounding box' }
  const vh = page.viewportSize().height
  const ok = box.y >= 0 && box.y < vh && box.height > 0
  return { ok, detail: `y=${Math.round(box.y)} h=${Math.round(box.height)} vh=${vh}` }
}
async function saveSettings(page) {
  await page.getByRole('button', { name: '儲存', exact: true }).last().click()
  await sleep(1500)
}

const pageErrors = []
let browser
const server = PROD ? null : spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true,
})
server?.stdout.on('data', () => {})
server?.stderr.on('data', () => {})

async function waitServer() {
  if (PROD) return
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready (check for zombie next dev)')
}

let restoreState = null // { wsName, originalDefaultCategoryName }

try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  // The app auto-detects browser language; pin zh-TW so the Chinese
  // selectors below are stable.
  await page.addInitScript(() => { try { localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {} })

  // ── login ───────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: WAIT })
  await page.locator('button[type="submit"]').waitFor({ timeout: 30000 })
  await sleep(3000)
  await fillStable(page, 'input[type="email"]', EMAIL)
  await fillStable(page, 'input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
  await sleep(5000)

  // ── A. Settings section exists, toggle on, every row points at 未分類 ────
  await openSettings(page)
  const section = defaultCategorySection(page)
  const aInView = await sectionInView(page, section)
  check('A1 「預設分類」區塊確實出現在畫面內（非只是存在於 DOM）', aInView.ok, aInView.detail)

  const toggle = section.locator('input[type="checkbox"]').first()
  check('A2 開關預設為開', (await toggle.isChecked().catch(() => null)) === true)

  const selects = section.locator('select')
  const rowCount = await selects.count()
  check('A3 每個大分類各一列（至少 1 列）', rowCount >= 1, `rows=${rowCount}`)

  let allUncategorized = rowCount > 0
  const rowLabels = []
  for (let i = 0; i < rowCount; i++) {
    const sel = selects.nth(i)
    const value = await sel.inputValue()
    const chosen = await sel.locator(`option[value="${value}"]`).innerText().catch(() => '')
    rowLabels.push(chosen.trim())
    if (chosen.trim() !== '未分類') allUncategorized = false
  }
  check('A4 每列的預設分類都是「未分類」（migration 回填生效）', allUncategorized, rowLabels.join(', '))
  await sectionInView(page, section)
  await page.screenshot({ path: path.join(SHOTS, 'a-settings-default-category.png') })

  // Remember the first workspace's name — every calendar assertion uses it.
  const firstRow = section.locator('div.rounded-lg').first()
  const wsName = (await firstRow.locator('span').first().innerText()).trim()
  check('A5 取得第一個大分類名稱', wsName.length > 0, wsName)
  restoreState = { wsName }

  await page.keyboard.press('Escape')
  await sleep(800)

  // ── B. calendar create lands in 未分類 ──────────────────────────────────
  await page.locator('[aria-label="日檢視"]').first().click()
  await sleep(1200)
  const created = await createFromCalendar(page, wsName)
  check('B1 日曆建立任務落在「未分類」', created.label.includes('未分類'), created.label)
  await page.screenshot({ path: path.join(SHOTS, 'b-create-lands-in-uncategorized.png') })

  // ── C. category picker floats this workspace to the top ────────────────
  await created.trigger.click()
  await sleep(700)
  const popover = page.locator('div.z-popover').first()
  const groupHeaders = popover.locator('div.uppercase')
  const groupCount = await groupHeaders.count()
  const firstGroup = (await groupHeaders.first().innerText()).trim()
  check('C1 分類選單第一組就是該任務的大分類', firstGroup === wsName, `first=${firstGroup} / expected=${wsName}`)
  check('C2 其他大分類仍然列得出來（沒有被過濾掉）', groupCount > 1, `groups=${groupCount}`)
  await page.screenshot({ path: path.join(SHOTS, 'c-picker-reordered.png') })
  await closeTaskModal(page)

  // ── D. re-point the default at another category ────────────────────────
  await openSettings(page)
  const sect2 = defaultCategorySection(page)
  const sel0 = sect2.locator('select').first()
  const optionTexts = await sel0.locator('option').allInnerTexts()
  const altName = optionTexts.map((s) => s.trim()).find((s) => s && s !== '未分類' && s !== '（未設定）')
  check('D0 找得到另一個分類可測試改指定', Boolean(altName), `options=${optionTexts.join(', ')}`)
  restoreState.originalDefault = '未分類'
  if (altName) {
    await sel0.selectOption({ label: altName })
    await sleep(2000)
    await page.keyboard.press('Escape')
    await sleep(1000)
    const created2 = await createFromCalendar(page, wsName)
    check(`D1 改指定為「${altName}」後，新建任務落在該分類`, created2.label.includes(altName), created2.label)
    await page.screenshot({ path: path.join(SHOTS, 'd-repointed-default.png') })
    await closeTaskModal(page)
  }

  // ── E. toggle OFF → back to the workspace's first category ─────────────
  await openSettings(page)
  const sect3 = defaultCategorySection(page)
  // Point the default back at 未分類 FIRST. Otherwise this step is not
  // discriminating: D left the default on the workspace's first category,
  // which is also what "off" falls back to, so the assertion would pass even
  // if the toggle did nothing. 未分類 is backfilled last, so with the toggle
  // off we must land somewhere else.
  await sect3.locator('select').first().selectOption({ label: '未分類' })
  await sleep(2000)
  // Read the workspace's first category name BEFORE hiding the rows.
  const firstCatName = (await sect3.locator('select').first().locator('option').nth(1).innerText()).trim()
  check('E0 前置：預設已指回「未分類」，且它不是第一個分類', firstCatName !== '未分類', `first=${firstCatName}`)
  await sect3.locator('input[type="checkbox"]').first().uncheck()
  await sleep(400)
  const rowsHidden = (await defaultCategorySection(page).locator('select').count()) === 0
  check('E1 關閉開關後，每個大分類的下拉收起來', rowsHidden)
  await sectionInView(page, defaultCategorySection(page))
  await page.screenshot({ path: path.join(SHOTS, 'e1-settings-toggle-off.png') })
  await saveSettings(page)
  const created3 = await createFromCalendar(page, wsName)
  check(
    `E2 開關關閉時退回第一個分類「${firstCatName}」而非預設的「未分類」`,
    created3.label.includes(firstCatName) && !created3.label.includes('未分類'),
    created3.label
  )
  await page.screenshot({ path: path.join(SHOTS, 'e-toggle-off-fallback.png') })
  await closeTaskModal(page)

  // ── F. restore: toggle back on, default back to 未分類 ─────────────────
  await openSettings(page)
  await defaultCategorySection(page).locator('input[type="checkbox"]').first().check()
  await sleep(400)
  await saveSettings(page)
  await openSettings(page)
  await defaultCategorySection(page).locator('select').first().selectOption({ label: '未分類' })
  await sleep(2000)
  await page.keyboard.press('Escape')
  await sleep(1000)
  const created4 = await createFromCalendar(page, wsName)
  check('F1 復原後又回到「未分類」', created4.label.includes('未分類'), created4.label)
  await closeTaskModal(page)

  // ── G. 390 px mobile ───────────────────────────────────────────────────
  // The settings entry point differs on mobile (the desktop gear is hidden
  // under 768 px), and this check is about the *section's* layout, not the
  // route to it — so open the modal at desktop width, then resize. The
  // responsive classes re-evaluate on resize, which is what we're asserting.
  await openSettings(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(1500)
  const sectM = defaultCategorySection(page)
  const gInView = await sectionInView(page, sectM)
  check('G1 手機 390px 「預設分類」區塊確實出現在畫面內', gInView.ok, gInView.detail)
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  check('G2 手機無水平溢出', overflow <= 0, `overflow=${overflow}px`)
  const selBox = await sectM.locator('select').first().boundingBox()
  check('G3 下拉觸控高度 ≥44px', Boolean(selBox) && selBox.height >= 44, `h=${selBox?.height}`)
  await page.screenshot({ path: path.join(SHOTS, 'g-mobile-390.png') })
  await page.keyboard.press('Escape')

  check('H1 全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

  await ctx.close()
} catch (err) {
  check('FATAL', false, String(err))
} finally {
  try { await browser?.close() } catch {}
  if (server) { try { process.kill(-server.pid, 'SIGTERM') } catch {} }
}

console.log(`\n${passed}/${passed + failed} passed`)
console.log(`screenshots → ${SHOTS}`)
process.exit(failed ? 1 : 0)
