#!/usr/bin/env node
/**
 * "當前重點" (FocusBlock + FocusEditorModal) visual/behaviour verification.
 *
 * Asserts, against a real dev server and the real Supabase project:
 *  A. Desktop 1440 — the block renders at the very top of the task panel
 *     (above the quick-access row), with a non-empty headline.
 *  B. The second tier ("各工作區重點") expands and lists workspace rows.
 *  C. The editor modal opens and all three modes render their own body.
 *  D. Saving a custom text focus updates the headline (DB write intercepted).
 *  E. Mobile 390×844 — no horizontal overflow, edit button visible with a
 *     ≥44×44 hit area, modal opens and closes.
 *  F. English — no CJK left in the block or the editor modal.
 *  G. Zero pageerror across the whole run.
 *
 * DB writes: NONE. Every non-GET request to /rest/v1/user_settings is
 * answered locally with a fake 200 (see installSettingsRoute), and the
 * per-workspace focus rows are injected into the GET response rather than
 * written. The real user_settings row is never touched.
 *
 * Screenshots → docs/reports/2026-08-10-focus-block-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3145
const BASE = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-10-focus-block-shots')
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
if (!EMAIL || !PASSWORD) {
  console.error('missing E2E creds in .env.e2e.local')
  process.exit(1)
}

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  ok ? passed++ : failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const CJK = /[一-鿿]/

const pageErrors = []
let browser
const server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
server.stdout.on('data', () => {})
server.stderr.on('data', () => {})

async function waitServer() {
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(`${BASE}/login`)
      if (r.ok) return
    } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready')
}

// ── Fake data ────────────────────────────────────────────────────────────
// The test account has no open tasks, so the block would only ever show its
// empty state. Inject a realistic spread (overdue / today / urgent) into the
// GET responses — nothing is ever written.
const dayOffset = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const FAKE = [
  { slot: 0, title: '整理講師合約與報價單', scheduled: dayOffset(-3), urgency: 6 },
  { slot: 0, title: '回覆客戶的場地詢問', scheduled: dayOffset(0), urgency: 5 },
  { slot: 0, title: '更新官網的課程頁文案', scheduled: null, urgency: 8 },
  { slot: 0, title: '整理上週的收據', scheduled: null, urgency: 3 },
  { slot: 1, title: '盤點暑期營隊的器材', scheduled: dayOffset(0), urgency: 7 },
  { slot: 2, title: '寫這個月的營運月報', scheduled: null, urgency: 9 },
]

function buildTaskRow(cat, spec, i) {
  return {
    id: `00000000-0000-4000-8000-0000000009${String(i).padStart(2, '0')}`,
    user_id: cat.user_id,
    workspace_id: cat.workspace_id,
    category_id: cat.id,
    title: spec.title,
    description: null,
    task_type: 'one_time',
    urgency: spec.urgency,
    estimated_minutes: null,
    actual_minutes: null,
    due_date: null,
    scheduled_date: spec.scheduled,
    scheduled_start_time: null,
    scheduled_end_time: null,
    calendar_color: null,
    is_completed: false,
    completed_at: null,
    is_archived: false,
    archived_at: null,
    notes: null,
    show_in_task_list: true,
    is_meeting: false,
    sort_order: 900 + i,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

async function installTaskRoutes(page, state) {
  await page.route('**/rest/v1/workspaces**', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    const response = await route.fetch()
    let body = null
    try { body = await response.json() } catch {}
    if (Array.isArray(body)) state.names.push(...body.map((r) => r.name).filter(Boolean))
    await route.fulfill({ response, json: body })
  })

  await page.route('**/rest/v1/categories**', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    const response = await route.fetch()
    let body = null
    try { body = await response.json() } catch {}
    if (Array.isArray(body)) {
      const seen = new Map()
      for (const row of body) {
        if (row.is_archived) continue
        if (!seen.has(row.workspace_id)) seen.set(row.workspace_id, row)
      }
      state.categories = [...seen.values()]
      state.names.push(...body.map((r) => r.name).filter(Boolean))
    }
    await route.fulfill({ response, json: body })
  })

  await page.route('**/rest/v1/tasks**', async (route) => {
    const req = route.request()
    if (req.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    const response = await route.fetch()
    let body = null
    try { body = await response.json() } catch {}
    if (!Array.isArray(body) || state.categories.length === 0) {
      return route.fulfill({ response, json: body })
    }
    const injected = FAKE
      .filter((spec) => state.categories[spec.slot])
      .map((spec, i) => buildTaskRow(state.categories[spec.slot], spec, i))
    await route.fulfill({ response, json: [...body, ...injected] })
  })
}

// Injected per-workspace focus rows + a hard block on every settings write.
async function installSettingsRoute(page, workspaceIds) {
  const focusBoard = {
    enabled: true,
    global: { mode: 'auto' },
    byWorkspace: Object.fromEntries(workspaceIds.slice(0, 3).map((id) => [id, { mode: 'auto' }])),
  }
  await page.route('**/rest/v1/user_settings**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      const response = await route.fetch()
      let body = null
      try { body = await response.json() } catch {}
      const patch = (row) => (row && typeof row === 'object' ? { ...row, focus_board: focusBoard } : row)
      await route.fulfill({ response, json: Array.isArray(body) ? body.map(patch) : patch(body) })
      return
    }
    // Never let a write reach the real project.
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

async function login(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').waitFor({ timeout: 60000 })
    await sleep(1500)
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('button[type="submit"]').click()
    for (let i = 0; i < 60; i++) {
      await sleep(1000)
      if (!(await page.evaluate(() => location.pathname)).includes('/login')) return
    }
  }
  throw new Error('login failed')
}

const block = (page) => page.locator('[data-tour="focus-block"]').first()

try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })
  ctx.setDefaultNavigationTimeout(150000)
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  // The Next dev-overlay portal sits over the mobile tab bar and eats clicks.
  await page.addInitScript(() => {
    const hide = () => {
      const s = document.createElement('style')
      s.textContent = 'nextjs-portal{display:none!important}'
      document.head?.appendChild(s)
    }
    if (document.head) hide()
    else document.addEventListener('DOMContentLoaded', hide)
  })

  await login(page)
  await sleep(6000)
  await page.evaluate(() => {
    try {
      localStorage.setItem('waddle-language-v1', 'zh-TW')
      localStorage.removeItem('waddle-focus-expanded-v1')
      localStorage.removeItem('waddle-focus-board-v1')
    } catch {}
  })

  // Workspace ids come from the rendered sections; used to seed the second tier.
  const workspaceIds = await page.$$eval('[id^="workspace-"]', (els) =>
    els.map((e) => e.id.replace('workspace-', '')).filter(Boolean)
  )
  const state = { categories: [], names: [] }
  await installSettingsRoute(page, workspaceIds)
  await installTaskRoutes(page, state)
  // First pass captures a seed category per workspace; second pass injects.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 150000 })
  await sleep(6000)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 150000 })
  await sleep(7000)

  // ── A. Desktop: block sits above the quick-access row ──────────────────
  const b = await block(page).boundingBox()
  const shortcutBox = await page.locator('[data-tour="task-shortcut-row"]').first().boundingBox()
  check('A1 當前重點區塊存在', !!b, b ? `y=${Math.round(b.y)} h=${Math.round(b.height)}` : 'not found')
  check('A2 位置在快捷列上方', !!b && !!shortcutBox && b.y < shortcutBox.y,
    b && shortcutBox ? `focus.y=${Math.round(b.y)} shortcut.y=${Math.round(shortcutBox.y)}` : '')
  const headline = (await block(page).innerText()).replace(/\s+/g, ' ').trim()
  check('A3 有標題內容', headline.length > 8 && headline.includes('當前重點'), headline.slice(0, 70))
  await page.locator('[data-tour="left-panel"]').first().screenshot({ path: path.join(SHOTS, 'desktop-1440-block.png') })

  // ── B. Second tier expands ────────────────────────────────────────────
  const tierToggle = block(page).locator('button', { hasText: '各工作區重點' }).first()
  const hasTier = await tierToggle.isVisible().catch(() => false)
  check('B1 出現「各工作區重點」摺疊列', hasTier)
  if (hasTier) {
    await tierToggle.click()
    await sleep(500)
    const rows = await block(page).locator('button[aria-label^="編輯「"]').count()
    check('B2 展開後列出工作區列', rows > 0, `${rows} 列`)
    check('B3 展開狀態寫入 localStorage',
      (await page.evaluate(() => localStorage.getItem('waddle-focus-expanded-v1'))) === '1')
    await page.locator('[data-tour="left-panel"]').first().screenshot({ path: path.join(SHOTS, 'desktop-1440-expanded.png') })
  }

  // ── C. Editor modal, three modes ──────────────────────────────────────
  await block(page).locator('button[aria-label="編輯當前重點"]').first().click()
  await sleep(800)
  const dialog = page.locator('[role="dialog"]').first()
  check('C1 編輯 modal 開啟', await dialog.isVisible())
  check('C2 預設在「自動推薦」且有即時預覽',
    (await dialog.innerText()).includes('現在會顯示'))
  await dialog.screenshot({ path: path.join(SHOTS, 'editor-auto.png') })

  await dialog.getByRole('button', { name: '自訂文字' }).click()
  await sleep(400)
  const textInput = dialog.locator('input[type="text"]').first()
  check('C3 自訂文字：input maxlength=60', (await textInput.getAttribute('maxlength')) === '60')
  await textInput.fill('推進講師資源站')
  await sleep(300)
  check('C4 即時字數提示', (await dialog.innerText()).includes('7 / 60'))
  await dialog.screenshot({ path: path.join(SHOTS, 'editor-text.png') })

  await dialog.getByRole('button', { name: '釘選任務' }).click()
  await sleep(500)
  const pinRows = await dialog.locator('button[aria-pressed]').count()
  check('C5 釘選任務：有搜尋框與任務清單',
    (await dialog.locator('input[placeholder="搜尋任務..."]').count()) === 1 && pinRows > 3,
    `${pinRows} 個可選項`)
  await dialog.screenshot({ path: path.join(SHOTS, 'editor-task.png') })

  // ── D. Save custom text (write intercepted) ───────────────────────────
  await dialog.getByRole('button', { name: '自訂文字' }).click()
  await sleep(300)
  await dialog.getByRole('button', { name: '儲存' }).click()
  await sleep(1500)
  const afterSave = (await block(page).innerText()).replace(/\s+/g, ' ')
  check('D1 儲存後標題換成自訂文字', afterSave.includes('推進講師資源站'), afterSave.slice(0, 60))
  check('D2 modal 已關閉', (await page.locator('[role="dialog"]').count()) === 0)
  await page.locator('[data-tour="left-panel"]').first().screenshot({ path: path.join(SHOTS, 'desktop-1440-custom-text.png') })

  // ── D2. Settings toggle (read-only: never saved, so no time-block churn) ─
  await page.locator('[aria-label="設定"]').first().click()
  await sleep(1500)
  const settingsDialog = page.locator('[role="dialog"]').first()
  const focusToggleLabel = settingsDialog.locator('label').filter({ hasText: '顯示當前重點' }).first()
  await focusToggleLabel.scrollIntoViewIfNeeded().catch(() => {})
  await sleep(400)
  const toggleBox = await focusToggleLabel.boundingBox()
  check('D3 設定頁有「顯示當前重點」開關且在畫面內',
    !!toggleBox && toggleBox.y > 0 && toggleBox.y < 900, toggleBox ? `y=${Math.round(toggleBox.y)}` : 'not found')
  check('D4 開關預設為開',
    (await focusToggleLabel.locator('input[type="checkbox"]').isChecked().catch(() => null)) === true)
  await settingsDialog.screenshot({ path: path.join(SHOTS, 'settings-toggle.png') })
  await page.keyboard.press('Escape')
  await sleep(800)

  // ── F. English ────────────────────────────────────────────────────────
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 150000 })
  await sleep(7000)
  // Task titles are user data and stay Chinese in any language — strip the
  // seeded ones before looking for untranslated UI chrome.
  const stripData = (s) => {
    let out = s.replace(/推進講師資源站/g, '')
    for (const f of FAKE) out = out.split(f.title).join('')
    for (const n of [...new Set(state.names)].sort((a, b) => b.length - a.length)) {
      out = out.split(n).join('')
    }
    return out
  }
  const enBlock = stripData(await block(page).innerText())
  check('F1 區塊英文化後無中文殘留', !CJK.test(enBlock), enBlock.replace(/\s+/g, ' ').slice(0, 90))
  await block(page).locator('button[aria-label="Edit current focus"]').first().click()
  await sleep(900)
  const enDialog = page.locator('[role="dialog"]').first()
  const enDialogText = stripData(await enDialog.innerText())
  check('F2 編輯 modal 英文化後無中文殘留', !CJK.test(enDialogText), enDialogText.replace(/\s+/g, ' ').slice(0, 110))
  await enDialog.screenshot({ path: path.join(SHOTS, 'editor-english.png') })
  await page.keyboard.press('Escape')
  await sleep(500)
  await page.locator('[data-tour="left-panel"]').first().screenshot({ path: path.join(SHOTS, 'desktop-1440-english.png') })
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))

  // ── E. Mobile 390×844 (and a 375 overflow re-check) ───────────────────
  for (const width of [390, 375]) {
    await page.setViewportSize({ width, height: 844 })
    // Measure the default (collapsed) state — the desktop pass above left the
    // second tier expanded in localStorage.
    await page.evaluate(() => localStorage.removeItem('waddle-focus-expanded-v1'))
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 150000 })
    await sleep(7000)
    // Mobile opens on the calendar tab; the panel lives behind "任務".
    await page.getByRole('tab', { name: '任務', exact: true }).first().click()
    await sleep(1200)
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }))
    check(`E1(${width}) 無橫向溢出`, overflow.doc <= width && overflow.body <= width, JSON.stringify(overflow))
    if (width !== 390) continue

    const editBtn = block(page).locator('button[aria-label="編輯當前重點"]').first()
    const editBox = await editBtn.boundingBox()
    const opacity = await editBtn.evaluate((el) => getComputedStyle(el).opacity)
    check('E2 編輯按鈕手機恆常可見', opacity === '1', `opacity=${opacity}`)
    check('E3 編輯按鈕熱區 ≥44×44', !!editBox && editBox.width >= 44 && editBox.height >= 44,
      editBox ? `${Math.round(editBox.width)}×${Math.round(editBox.height)}` : 'no box')

    const tier = block(page).locator('button', { hasText: '各工作區重點' }).first()
    const tierBox = await tier.boundingBox().catch(() => null)
    check('E4 展開列熱區 ≥44 高', !!tierBox && tierBox.height >= 44, tierBox ? `${Math.round(tierBox.height)}` : 'n/a')
    const blockBox = await block(page).boundingBox()
    check('E5 區塊高度合理（<230px）', !!blockBox && blockBox.height < 230,
      blockBox ? `${Math.round(blockBox.height)}px` : 'n/a')
    await page.screenshot({ path: path.join(SHOTS, 'mobile-390-block.png') })

    await editBtn.click()
    await sleep(900)
    const mDialog = page.locator('[role="dialog"]').first()
    check('E6 手機 modal 可開', await mDialog.isVisible())
    const mBox = await mDialog.boundingBox()
    check('E7 手機 modal 不超出畫面寬', !!mBox && mBox.width <= 390, mBox ? `${Math.round(mBox.width)}` : 'n/a')
    await page.screenshot({ path: path.join(SHOTS, 'mobile-390-editor.png') })
    await mDialog.getByRole('button', { name: '釘選任務' }).click()
    await sleep(500)
    // The seeded account has few tasks, so assert the list is *capable* of
    // scrolling (capped height + overflow-y:auto) rather than that it does.
    const list = mDialog.locator('div.overflow-y-auto').last()
    const listInfo = await list.evaluate((el) => ({
      overflow: getComputedStyle(el).overflowY,
      h: el.clientHeight,
      vh: window.innerHeight,
    })).catch(() => null)
    check('E8 釘選任務清單高度受限且可捲動',
      !!listInfo && listInfo.overflow === 'auto' && listInfo.h <= listInfo.vh * 0.5,
      listInfo ? `${listInfo.overflow} h=${listInfo.h} vh=${listInfo.vh}` : 'n/a')
    await page.screenshot({ path: path.join(SHOTS, 'mobile-390-editor-pin.png') })
    await page.keyboard.press('Escape')
    await sleep(700)
    check('E9 手機 modal 可關（Esc）', (await page.locator('[role="dialog"]').count()) === 0)

    await tier.click()
    await sleep(500)
    await page.screenshot({ path: path.join(SHOTS, 'mobile-390-expanded.png') })
  }

  check('G1 全程 0 個 pageerror', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
} catch (err) {
  failed++
  console.error('RUN ERROR', err)
} finally {
  await browser?.close().catch(() => {})
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM') } catch {}
  }
  console.log(`\n${passed} passed, ${failed} failed → ${SHOTS}`)
  process.exit(failed === 0 ? 0 : 1)
}
