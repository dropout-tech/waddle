#!/usr/bin/env node
/**
 * "當前重點" relocation verification (2026-08-18).
 *
 * Asserts, against a real dev server and the real Supabase project:
 *  A. Desktop 1440 — the left sidebar no longer renders the block at all.
 *  B. Desktop 1440 — after ⤢ (展開任務面板), the 總覽 tab shows the block as a
 *     card ABOVE the stats grid, with the second tier open by default and
 *     without touching the sidebar's localStorage collapse preference.
 *  C. The editor modal opens, saves and closes from the page variant.
 *  D. English — no CJK chrome left in the page variant.
 *  E. Mobile 390×844 — the 任務 tab still shows the panel variant, no
 *     horizontal overflow; English pass too.
 *  F. Zero pageerror across the whole run.
 *
 * DB writes: NONE. Every non-GET request to /rest/v1/user_settings is
 * answered locally with a fake 200 (installSettingsRoute), and tasks /
 * focus rows are injected into GET responses. Copied from
 * tmp-focus-current-verify.mjs.
 *
 * ONE login for the whole run (Supabase rate-limits repeat logins): desktop
 * and mobile share a single context and just swap viewport.
 *
 * Screenshots → docs/reports/2026-08-18-focus-relocate-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3147
const BASE = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-18-focus-relocate-shots')
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
  for (let i = 0; i < 180; i++) {
    try {
      const r = await fetch(`${BASE}/login`)
      if (r.ok) return
    } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready')
}

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

/** Enter the full-screen task view via the ⤢ button in the panel header. */
async function openFullScreen(page, label) {
  await page.locator(`button[aria-label="${label}"]`).first().click()
  await sleep(2500)
}

try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })
  ctx.setDefaultNavigationTimeout(180000)
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(String(e)))
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
      // Sidebar preference set to "collapsed" — the page variant must not
      // read or write it.
      localStorage.setItem('waddle-focus-expanded-v1', '0')
    } catch {}
  })

  const workspaceIds = await page.$$eval('[id^="workspace-"]', (els) =>
    els.map((e) => e.id.replace('workspace-', '')).filter(Boolean)
  )
  const state = { categories: [], names: [] }
  await installSettingsRoute(page, workspaceIds)
  await installTaskRoutes(page, state)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(6000)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(7000)

  // ── A. Desktop sidebar must NOT contain the block ─────────────────────
  const sidebarCount = await page.locator('[data-tour="focus-block"]').count()
  check('A1 桌機側欄不再有當前重點', sidebarCount === 0, `count=${sidebarCount}`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-sidebar-no-focus.png') })

  // ── B. Full-screen 總覽 tab ───────────────────────────────────────────
  await openFullScreen(page, '展開任務面板')
  const pageBox = await block(page).boundingBox()
  check('B1 全螢幕總覽頁出現當前重點', !!pageBox,
    pageBox ? `y=${Math.round(pageBox.y)} h=${Math.round(pageBox.height)} w=${Math.round(pageBox.width)}` : 'not found')
  const statBox = await page.getByText('完成率', { exact: true }).first().boundingBox()
  check('B2 位置在統計卡片之前', !!pageBox && !!statBox && pageBox.y < statBox.y,
    pageBox && statBox ? `focus.y=${Math.round(pageBox.y)} stats.y=${Math.round(statBox.y)}` : 'n/a')
  const tierBtn = block(page).locator('button', { hasText: '各工作區重點' }).first()
  const tierExpanded = await tierBtn.getAttribute('aria-expanded').catch(() => null)
  const tierRows = await block(page).locator('button[aria-label^="編輯「"]').count()
  check('B3 第二層預設展開', tierExpanded === 'true' && tierRows > 0,
    `aria-expanded=${tierExpanded} rows=${tierRows}`)
  const editBtn = block(page).locator('button[aria-label="編輯當前重點"]').first()
  const editOpacity = await editBtn.evaluate((el) => getComputedStyle(el).opacity)
  const editBox = await editBtn.boundingBox()
  check('B4 編輯按鈕免 hover 就可見', editOpacity === '1',
    `opacity=${editOpacity} ${editBox ? Math.round(editBox.width) + '×' + Math.round(editBox.height) : ''}`)
  const surface = await block(page).evaluate((el) => {
    const cs = getComputedStyle(el)
    return { r: parseFloat(cs.borderTopLeftRadius), bw: parseFloat(cs.borderTopWidth) }
  })
  check('B5 使用卡片語言（圓角＋邊框）', surface.r >= 8 && surface.bw >= 1,
    `radius=${surface.r}px border=${surface.bw}px`)
  check('B6 未讀寫側欄的收合偏好',
    (await page.evaluate(() => localStorage.getItem('waddle-focus-expanded-v1'))) === '0')
  const headline = (await block(page).innerText()).replace(/\s+/g, ' ').trim()
  check('B7 有標題內容', headline.includes('當前重點') && headline.length > 12, headline.slice(0, 80))
  await block(page).screenshot({ path: path.join(SHOTS, 'desktop-1440-page-block.png') })
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-overview.png') })

  // ── C. Editor modal from the page variant ─────────────────────────────
  await editBtn.click()
  await sleep(900)
  const dialog = page.locator('[role="dialog"]').first()
  check('C1 編輯 modal 開啟', await dialog.isVisible())
  await dialog.screenshot({ path: path.join(SHOTS, 'desktop-1440-editor.png') })
  await dialog.getByRole('button', { name: '自訂文字' }).click()
  await sleep(400)
  await dialog.locator('input[type="text"]').first().fill('推進講師資源站')
  await sleep(300)
  await dialog.getByRole('button', { name: '儲存' }).click()
  await sleep(1800)
  const afterSave = (await block(page).innerText()).replace(/\s+/g, ' ')
  check('C2 儲存後標題換成自訂文字', afterSave.includes('推進講師資源站'), afterSave.slice(0, 60))
  check('C3 modal 已關閉', (await page.locator('[role="dialog"]').count()) === 0)
  await block(page).screenshot({ path: path.join(SHOTS, 'desktop-1440-page-block-custom.png') })

  // ── D. English (desktop) ──────────────────────────────────────────────
  const stripData = (s) => {
    let out = s.replace(/推進講師資源站/g, '')
    for (const f of FAKE) out = out.split(f.title).join('')
    for (const n of [...new Set(state.names)].sort((a, b) => b.length - a.length)) {
      out = out.split(n).join('')
    }
    return out
  }
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(8000)
  await openFullScreen(page, 'Expand task panel')
  const enText = stripData(await block(page).innerText())
  check('D1 英文版無中文殘留', !CJK.test(enText), enText.replace(/\s+/g, ' ').slice(0, 90))
  await block(page).screenshot({ path: path.join(SHOTS, 'desktop-1440-page-block-en.png') })
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-overview-en.png') })

  // ── E. Mobile 390×844 — same context, viewport swap only ──────────────
  await page.setViewportSize({ width: 390, height: 844 })
  for (const lang of ['zh-TW', 'en']) {
    await page.evaluate((l) => localStorage.setItem('waddle-language-v1', l), lang)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
    await sleep(8000)
    await page.getByRole('tab', { name: lang === 'en' ? 'Tasks' : '任務', exact: true }).first().click()
    await sleep(1500)
    const mBox = await block(page).boundingBox()
    check(`E1(${lang}) 手機任務分頁仍看得到當前重點`, !!mBox,
      mBox ? `y=${Math.round(mBox.y)} h=${Math.round(mBox.height)}` : 'not found')
    const shortcut = await page.locator('[data-tour="task-shortcut-row"]').first().boundingBox()
    check(`E2(${lang}) 仍在快捷列上方（panel 外觀）`, !!mBox && !!shortcut && mBox.y < shortcut.y,
      mBox && shortcut ? `focus.y=${Math.round(mBox.y)} shortcut.y=${Math.round(shortcut.y)}` : 'n/a')
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }))
    check(`E3(${lang}) 無橫向溢出`, overflow.doc <= 390 && overflow.body <= 390, JSON.stringify(overflow))
    if (lang === 'en') {
      const mEn = stripData(await block(page).innerText())
      check('E4 手機英文版無中文殘留', !CJK.test(mEn), mEn.replace(/\s+/g, ' ').slice(0, 80))
    }
    await page.screenshot({ path: path.join(SHOTS, `mobile-390-tasks-${lang}.png`) })
  }

  check('F1 全程 0 個 pageerror', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
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
