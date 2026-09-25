#!/usr/bin/env node
/**
 * 重點 board on phones — verification (2026-08-21).
 *
 * A. Bottom bar carries FIVE tabs (重點 first) at 390 / 375 / 320 with no
 *    horizontal overflow, no wrapped or truncated labels, ≥44px hot zones.
 * B. Tapping 重點 opens the board overlay: single column, full-bleed cards,
 *    workspace headings only inside the 其他 band (expanded first).
 * C. Task rows are ≥44px touch targets.
 * D. Scrolled to the bottom, the last card is not covered by the tab bar.
 * E. 編輯版面 → phone shows 上移/下移 (not drag) → untick → save → card gone.
 * F. Closing returns to the tab you were on; the compact 重點 block on the
 *    任務 tab is untouched (regression).
 * G. English — no CJK left in the overlay.
 * H. Desktop 1440 重點 tab still renders its cards (regression).
 * I. Zero pageerror across the whole run.
 *
 * DB writes: NONE. Every non-GET to /rest/v1/** is answered with a local fake
 * 200; categories / tasks / user_settings GETs are augmented with fixtures.
 * ONE login for the whole run (Supabase rate-limits repeat logins) — every
 * width is reached with setViewportSize on the same context.
 *
 * Screenshots → docs/reports/2026-08-21-focus-board-mobile-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3153
const BASE = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-25-focus-tab-rename-shots')
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
const ISO = new Date().toISOString()

// Eight categories over three workspaces — same fixture as the desktop
// script, so the phone is exercised with the post-2026-08-25 default where
// defaultCards() covers every category instead of the top 6.
const CAT_A = '00000000-0000-4000-8000-0000000c0001'
const CAT_B = '00000000-0000-4000-8000-0000000c0002'
const CAT_C = '00000000-0000-4000-8000-0000000c0003'
const CAT_D = '00000000-0000-4000-8000-0000000c0004'
const CAT_E = '00000000-0000-4000-8000-0000000c0005'
const CAT_F = '00000000-0000-4000-8000-0000000c0006'
const CAT_G = '00000000-0000-4000-8000-0000000c0007'
const CAT_H = '00000000-0000-4000-8000-0000000c0008'
const NAME_A = '講師資源站'
const NAME_B = '暑期營隊'
const NAME_C = '對外行銷'
const NAME_D = '合作提案'
const NAME_E = '社群經營'
const NAME_F = '內部流程'
const NAME_G = '財務庶務'
const NAME_H = '自我學習'
const NOTE_A = '推進講師資源站'

const CAT_WS = {
  [CAT_A]: 'wsA', [CAT_B]: 'wsA', [CAT_D]: 'wsA',
  [CAT_C]: 'wsB', [CAT_E]: 'wsB',
  [CAT_F]: 'wsC', [CAT_G]: 'wsC', [CAT_H]: 'wsC',
}
const CAT_NAME = {
  [CAT_A]: NAME_A, [CAT_B]: NAME_B, [CAT_C]: NAME_C, [CAT_D]: NAME_D,
  [CAT_E]: NAME_E, [CAT_F]: NAME_F, [CAT_G]: NAME_G, [CAT_H]: NAME_H,
}
const FIXTURE_CATS = [CAT_A, CAT_B, CAT_C, CAT_D, CAT_E, CAT_F, CAT_G, CAT_H]
/** Phase switch consulted by the user_settings route on every request. */
const phase = { curated: false }

const TASKS = [
  { cat: CAT_A, title: '整理講師合約與報價單', scheduled: dayOffset(-3), urgency: 6 },
  { cat: CAT_A, title: '回覆客戶的場地詢問', scheduled: dayOffset(0), urgency: 5 },
  { cat: CAT_A, title: '更新官網的課程頁文案', scheduled: null, urgency: 8 },
  { cat: CAT_A, title: '整理上週的收據', scheduled: null, urgency: 3 },
  { cat: CAT_A, title: '寄出下季合作提案', scheduled: null, urgency: 2 },
  { cat: CAT_B, title: '盤點暑期營隊的器材', scheduled: dayOffset(0), urgency: 7 },
  { cat: CAT_B, title: '確認營隊保險', scheduled: null, urgency: 4 },
  { cat: CAT_C, title: '寫這個月的營運月報', scheduled: null, urgency: 9 },
  { cat: CAT_C, title: '排下個月的社群貼文', scheduled: null, urgency: 5 },
  { cat: CAT_D, title: '整理合作提案的簡報', scheduled: null, urgency: 4 },
  { cat: CAT_D, title: '約下週的提案會議', scheduled: null, urgency: 3 },
  { cat: CAT_E, title: '寫社群經營的月度回顧', scheduled: null, urgency: 6 },
  { cat: CAT_F, title: '更新內部流程手冊', scheduled: null, urgency: 2 },
  { cat: CAT_F, title: '整理共用資料夾', scheduled: null, urgency: 1 },
  { cat: CAT_G, title: '對帳上個月的收支', scheduled: dayOffset(-1), urgency: 7 },
  { cat: CAT_H, title: '讀完手上那本設計書', scheduled: null, urgency: 2 },
]
const FIXTURE_TEXT = [...Object.values(CAT_NAME), NOTE_A, ...TASKS.map((t) => t.title)].sort(
  (a, b) => b.length - a.length
)

const plan = { ready: false, userId: null, wsA: null, wsB: null, wsC: null }

/**
 * Independent expectation for "every category with unfinished work", derived
 * from the exact rows the app was served, mirroring lib/focus.ts's
 * isFocusCandidate against the raw payloads.
 */
function expectedCoverage(state) {
  const liveWs = new Map(
    (state.workspaceRows ?? []).filter((w) => !w.is_archived).map((w) => [w.id, w])
  )
  const liveCat = new Map(
    (state.categoryRows ?? [])
      .filter((c) => !c.is_archived && liveWs.has(c.workspace_id))
      .map((c) => [c.id, c])
  )
  const withWork = new Set()
  for (const t of state.taskRows ?? []) {
    if (t.is_completed || t.is_archived) continue
    if ((t.show_in_task_list ?? true) === false) continue
    if (t.is_meeting ?? false) continue
    if (!liveWs.has(t.workspace_id) || !liveCat.has(t.category_id)) continue
    withWork.add(t.category_id)
  }
  const wsIds = new Set([...withWork].map((id) => liveCat.get(id).workspace_id))
  return { categories: withWork, workspaces: wsIds }
}

function fakeCategory(id, workspaceId, name, sortOrder) {
  return {
    id,
    workspace_id: workspaceId,
    user_id: plan.userId,
    name,
    sort_order: sortOrder,
    is_collapsed: false,
    is_archived: false,
    is_default: false,
    created_at: ISO,
    updated_at: ISO,
  }
}

function fakeTask(spec, i) {
  const workspaceId = plan[CAT_WS[spec.cat]]
  return {
    id: `00000000-0000-4000-8000-0000000d${String(i).padStart(4, '0')}`,
    user_id: plan.userId,
    workspace_id: workspaceId,
    category_id: spec.cat,
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
    created_at: ISO,
    updated_at: ISO,
  }
}

async function installRoutes(page, state) {
  await page.route('**/rest/v1/workspaces**', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    const response = await route.fetch()
    let body = null
    try { body = await response.json() } catch {}
    if (Array.isArray(body)) {
      const live = body.filter((r) => !r.is_archived)
      state.names.push(...body.map((r) => r.name).filter(Boolean))
      if (live.length > 0) {
        plan.userId = live[0].user_id
        plan.wsA = live[0].id
        plan.wsB = (live[1] ?? live[0]).id
        plan.wsC = (live[2] ?? live[1] ?? live[0]).id
        plan.ready = !!plan.userId && !!plan.wsA
      }
      state.workspaceRows = body
    }
    await route.fulfill({ response, json: body })
  })

  await page.route('**/rest/v1/categories**', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    const response = await route.fetch()
    let body = null
    try { body = await response.json() } catch {}
    if (!Array.isArray(body) || !plan.ready) return route.fulfill({ response, json: body })
    state.names.push(...body.map((r) => r.name).filter(Boolean))
    const injected = FIXTURE_CATS.map((id, i) =>
      fakeCategory(id, plan[CAT_WS[id]], CAT_NAME[id], 900 + i)
    )
    const merged = [...body, ...injected]
    state.categoryRows = merged
    await route.fulfill({ response, json: merged })
  })

  await page.route('**/rest/v1/tasks**', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    const response = await route.fetch()
    let body = null
    try { body = await response.json() } catch {}
    if (!Array.isArray(body) || !plan.ready) return route.fulfill({ response, json: body })
    const merged = [...body, ...TASKS.map(fakeTask)]
    state.taskRows = merged
    await route.fulfill({ response, json: merged })
  })

  await page.route('**/rest/v1/user_settings**', async (route) => {
    const req = route.request()
    if (req.method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    const response = await route.fetch()
    let body = null
    try { body = await response.json() } catch {}
    const focusBoard = {
      enabled: true,
      global: { mode: 'auto' },
      byWorkspace: {},
      // Uncurated first (`cards` absent ⇒ defaultCards covers everything),
      // then a hand-picked three for the editor phase.
      cards: plan.ready && phase.curated
        ? [
            { categoryId: CAT_A, sortOrder: 0, note: NOTE_A },
            { categoryId: CAT_B, sortOrder: 1 },
            { categoryId: CAT_C, sortOrder: 2 },
          ]
        : undefined,
    }
    const patch = (row) => (row && typeof row === 'object' ? { ...row, focus_board: focusBoard } : row)
    await route.fulfill({ response, json: Array.isArray(body) ? body.map(patch) : patch(body) })
  })

  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'GET') return route.fallback()
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

const overlay = (page) => page.locator('[data-testid="focus-board-mobile"]').first()
const cardIds = (page) =>
  page.$$eval('[data-focus-card]', (els) => els.map((e) => e.getAttribute('data-focus-card')))

/**
 * Since 2026-08-25 the board is banded (釘選／需要注意／停滯／其他) and 其他
 * ships collapsed — the only band that does. Anything counting "every card"
 * opens it first. Idempotent. Tier behaviour itself lives in
 * tmp-focus-tiers-verify.mjs.
 */
async function expandOther(page) {
  const toggle = page.locator('[data-testid="focus-tier-toggle-other"]').first()
  if ((await toggle.count()) === 0) return
  if ((await toggle.getAttribute('aria-expanded')) === 'true') return
  await toggle.click()
  await sleep(700)
}

/**
 * Park the board's scroll container at the top and let it settle.
 *
 * Without this, a shot taken right after a save reproduces what looked like a
 * "decapitated headline" bug: the container was still scrolled to the bottom
 * from an earlier step, so only the tail of the headline block (its meta line)
 * was inside the viewport.
 */
async function scrollBoardTop(page) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="focus-board-mobile"] .overflow-y-auto')
    if (el) el.scrollTop = 0
  })
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="focus-board-mobile"] .overflow-y-auto')
      return !!el && el.scrollTop === 0
    },
    { timeout: 10000 }
  )
  await sleep(700)
}

/** What the headline block is actually showing right now. */
const headlineState = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-testid="focus-headline-mobile"]')
    if (!root) return null
    const title = root.querySelector('.text-xl')
    const meta = root.querySelector('.text-xs')
    const scroller = document.querySelector('[data-testid="focus-board-mobile"] .overflow-y-auto')
    const rootTop = root.getBoundingClientRect().top
    const scrollerTop = scroller ? scroller.getBoundingClientRect().top : 0
    return {
      label: (root.querySelector('p')?.textContent || '').trim(),
      title: title ? title.textContent.trim() : '',
      meta: meta ? meta.textContent.trim() : '',
      emptyState: root.innerText.includes('🐧'),
      pencil: !!root.querySelector('button[aria-label]'),
      // ≥ -1 ⇒ the block starts at or below the top of the scroll area, i.e.
      // it is genuinely on screen rather than scrolled out of view.
      onScreen: rootTop - scrollerTop >= -1,
    }
  })

/** Per-tab geometry + label wrap/truncation, measured in the page. */
const tabMetrics = (page) =>
  page.evaluate(() => {
    const nav = document.querySelector('nav[role="tablist"]')
    if (!nav) return null
    const tabs = [...nav.querySelectorAll('button[role="tab"]')].map((b) => {
      const label = b.querySelector('span:last-child')
      const r = b.getBoundingClientRect()
      return {
        text: label ? label.textContent.trim() : '',
        w: Math.round(r.width),
        h: Math.round(r.height),
        lines: label ? label.getClientRects().length : 0,
        clipped: label ? label.scrollWidth > label.clientWidth + 1 : false,
      }
    })
    return {
      tabs,
      navTop: Math.round(nav.getBoundingClientRect().top),
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }
  })

async function checkBottomBar(page, width, label) {
  const m = await tabMetrics(page)
  check(`A-${width} 底部五顆分頁（重點在最前）`,
    !!m && m.tabs.length === 5 && m.tabs[0].text === label,
    m ? m.tabs.map((t) => t.text).join(' / ') : 'nav not found')
  check(`A-${width} 無橫向溢出`, !!m && m.doc <= width && m.body <= width,
    m ? `doc=${m.doc} body=${m.body}` : '')
  check(`A-${width} 每顆熱區 ≥44px（高×寬）`,
    !!m && m.tabs.every((t) => t.h >= 44 && t.w >= 44),
    m ? m.tabs.map((t) => `${t.text}:${t.w}×${t.h}`).join(' ') : '')
  check(`A-${width} 文字單行未截斷`,
    !!m && m.tabs.every((t) => t.lines === 1 && !t.clipped && t.text.length > 0),
    m ? m.tabs.map((t) => `${t.text}:${t.lines}行${t.clipped ? '/截斷' : ''}`).join(' ') : '')
  await page.locator('nav[role="tablist"]').screenshot({
    path: path.join(SHOTS, `mobile-${width}-bottom-bar.png`),
  })
  return m
}

try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({
    locale: 'zh-TW',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
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
    try { localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {}
  })

  const state = { names: [] }
  await installRoutes(page, state)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(6000)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)

  // ── A. Bottom bar at three widths ─────────────────────────────────────
  await checkBottomBar(page, 390, '重點')
  await page.setViewportSize({ width: 375, height: 812 })
  await sleep(1200)
  await checkBottomBar(page, 375, '重點')
  await page.setViewportSize({ width: 320, height: 568 })
  await sleep(1200)
  await checkBottomBar(page, 320, '重點')

  // 320 is also the tightest test of the board itself.
  await page.getByRole('tab', { name: '重點', exact: true }).click()
  await sleep(1500)
  check('A-320 重點浮層在 320 寬可開啟且無溢出',
    (await overlay(page).isVisible()) &&
      (await page.evaluate(() => document.documentElement.scrollWidth)) <= 320)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-320-focus-board.png') })

  // The floating 專注計時 chip covers a task line at 320×568. Measure it here
  // and on the 任務 tab: if the same chip covers that list too, the overlap is
  // pre-existing app-wide behaviour, not something the board introduced.
  const chipOverlap = (sel) =>
    page.evaluate((rowSel) => {
      const chip = [...document.querySelectorAll('div.fixed.z-40')]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.bottom > window.innerHeight - 200)[0]
      if (!chip) return { chip: null, hits: 0, sample: '' }
      const hits = [...document.querySelectorAll(rowSel)]
        .map((e) => ({ r: e.getBoundingClientRect(), t: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 14) }))
        .filter(({ r }) =>
          r.height > 0 && r.top < chip.bottom && r.bottom > chip.top &&
          r.left < chip.right && r.right > chip.left)
      return {
        chip: { top: Math.round(chip.top), left: Math.round(chip.left) },
        hits: hits.length,
        sample: hits.map((h) => h.t).join(' | '),
      }
    }, sel)
  const boardOverlap = await chipOverlap('[data-focus-task-row]')
  await page.getByRole('tab', { name: '重點', exact: true }).click()
  await sleep(800)
  await page.getByRole('tab', { name: '任務', exact: true }).click()
  await sleep(2500)
  // At 320×568 the tab's own header stack fills the first screenful, so the
  // rows start below the fold — scroll the list to the bottom first, exactly
  // as a user would before reading their tasks.
  const listGeo = await page.evaluate(() => {
    const row = document.querySelector('[data-tour="task-row"]')
    if (!row) return { err: 'no rows in DOM' }
    let el = row.parentElement
    while (el && el.scrollHeight <= el.clientHeight + 4) el = el.parentElement
    if (!el) return { err: 'no scroll container' }
    row.scrollIntoView({ block: 'center' })
    const chip = [...document.querySelectorAll('div.fixed.z-40')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.height > 0 && r.bottom > window.innerHeight - 200)[0]
    const list = el.getBoundingClientRect()
    // How much of the scrollable task-list viewport the chip sits on top of.
    const overlapPx = chip
      ? Math.max(0, Math.min(chip.bottom, list.bottom) - Math.max(chip.top, list.top))
      : 0
    return {
      list: `${Math.round(list.top)}–${Math.round(list.bottom)}`,
      chip: chip ? `${Math.round(chip.top)}–${Math.round(chip.bottom)}` : null,
      overlapPx: Math.round(overlapPx),
    }
  })
  await sleep(1200)
  const tasksOverlap = await chipOverlap('[data-tour="task-row"]')
  await page.screenshot({ path: path.join(SHOTS, 'mobile-320-tasks-timer-overlap.png') })
  check('A-320 專注計時膠囊在「任務」分頁同樣壓在清單上（證明是既有行為，非本次新增）',
    listGeo.overlapPx > 0 || tasksOverlap.hits > 0,
    `任務分頁：清單可視區 ${listGeo.list ?? listGeo.err} vs 膠囊 ${listGeo.chip}，重疊 ${listGeo.overlapPx}px、壓到 ${tasksOverlap.hits} 列${tasksOverlap.sample ? `（${tasksOverlap.sample}）` : ''}／重點看板：壓到 ${boardOverlap.hits} 列（${boardOverlap.sample}）`)

  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(1500)

  // ── B. Open from the 任務 tab so closing has somewhere to return to ────
  await page.getByRole('tab', { name: '任務', exact: true }).click()
  await sleep(1500)
  await page.getByRole('tab', { name: '重點', exact: true }).click()
  await sleep(1800)
  check('B1 點「重點」開啟看板浮層', await overlay(page).isVisible())

  // The label split is deliberate: the overlay header says 任務重點 (matching
  // the desktop tab), the bottom tab button stays 重點 because at 320px each
  // column is 64px and four glyphs blow the row apart. Pin both so nobody
  // "tidies up" the short one later.
  const headerTitle = (await page.locator('[data-testid="focus-board-mobile"] .border-b').first().innerText()).trim()
  const barLabel = await page.getByRole('tab', { name: '重點', exact: true }).innerText()
  check('B1b 浮層 header 為「任務重點」、底部按鈕仍為兩字「重點」（320px 寬度所需，勿統一）',
    headerTitle.startsWith('任務重點') && barLabel.trim() === '重點',
    `header="${headerTitle.replace(/\s+/g, ' ')}" bottomTab="${barLabel.trim()}"`)

  // ── B2. Uncurated ⇒ every category with unfinished work gets a card ────
  const expect0 = expectedCoverage(state)
  await expandOther(page)
  const ids0 = await cardIds(page)
  const groupCount = await page.locator('[data-focus-group]').count()
  const groupsOutsideOther = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-focus-group]')].filter(
        (g) => g.closest('[data-focus-tier]')?.getAttribute('data-focus-tier') !== 'other'
      ).length
  )
  const missingFixture = FIXTURE_CATS.filter((id) => !ids0.includes(id))
  check('B2 未自訂時卡片數＝所有「有未完成任務的分類」數',
    ids0.length === expect0.categories.size,
    `看板卡片=${ids0.length}／應涵蓋=${expect0.categories.size}（假資料 ${FIXTURE_CATS.length} 個分類跨 3 個工作區）`)
  check('B2b 八個假資料分類全部上板（6 張上限已解除）',
    missingFixture.length === 0 && ids0.length > 6,
    `缺席=${missingFixture.map((id) => CAT_NAME[id]).join(',') || '無'}／總卡數=${ids0.length}`)
  check('B2c 工作區小標只出現在「其他」層（緊急三層維持平鋪）',
    groupCount > 0 && groupsOutsideOther === 0,
    `工作區小標共 ${groupCount} 個，其中在「其他」層外的有 ${groupsOutsideOther} 個（帳號共 ${expect0.workspaces.size} 個有工作的工作區）`)

  const cardGeo = await page.$$eval('[data-focus-card]', (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      return { id: e.getAttribute('data-focus-card'), x: Math.round(r.x), w: Math.round(r.width), y: Math.round(r.y) }
    })
  )
  const sameRow = cardGeo.some((a, i) => cardGeo.some((b, j) => i !== j && Math.abs(a.y - b.y) < 8))
  check('B3 單欄：卡片滿版寬且沒有兩張同一列',
    cardGeo.length === ids0.length && cardGeo.every((c) => c.w >= 390 - 40) && !sameRow,
    `cards=${cardGeo.length} widths=${[...new Set(cardGeo.map((c) => c.w))].join(',')} viewport=390`)

  const headline = await page.locator('[data-testid="focus-headline-mobile"] .text-xl').first()
  const headlineSize = await headline.evaluate((el) => getComputedStyle(el).fontSize).catch(() => '0px')
  check('B4 開場標題 20px 粗體（單一主角）', headlineSize === '20px', `fontSize=${headlineSize}`)

  const tourTargets = await page.locator('[data-tour="focus-block"]').count()
  check('B5 浮層未複製 onboarding 導覽目標', tourTargets <= 1, `count=${tourTargets}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-focus-board-top.png') })

  // ── C. Task rows are touch targets ────────────────────────────────────
  const rowH = await page.$$eval('[data-focus-task-row]', (els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().height))
  )
  check('C1 任務列熱區 ≥44px', rowH.length > 0 && rowH.every((h) => h >= 44),
    `rows=${rowH.length} min=${Math.min(...rowH)} heights=${[...new Set(rowH)].join(',')}`)

  // ── D. Bottom of the scroll vs the tab bar, at all three widths ───────
  // Re-run at 375 and 320 too: the board is much taller now that it covers
  // every category, so "the last card clears the tab bar" has to hold on the
  // small screens as well.
  for (const [w, h] of [[375, 812], [320, 568]]) {
    await page.setViewportSize({ width: w, height: h })
    await sleep(1500)
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="focus-board-mobile"] .overflow-y-auto')
      if (el) el.scrollTop = el.scrollHeight
    })
    await sleep(900)
    const geo = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-focus-card]')]
      const last = cards[cards.length - 1]?.getBoundingClientRect()
      const nav = document.querySelector('nav[role="tablist"]')?.getBoundingClientRect()
      return {
        cards: cards.length,
        widths: [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().width)))],
        lastBottom: last ? Math.round(last.bottom) : null,
        navTop: nav ? Math.round(nav.top) : null,
        doc: document.documentElement.scrollWidth,
      }
    })
    check(`D0-${w} 大看板在 ${w} 寬無溢出、最後一張卡沒被分頁列蓋住`,
      geo.doc <= w && geo.lastBottom !== null && geo.navTop !== null &&
        geo.lastBottom <= geo.navTop && geo.widths.every((cw) => cw >= w - 40),
      `doc=${geo.doc} cards=${geo.cards} 卡寬=${geo.widths.join(',')} lastBottom=${geo.lastBottom} navTop=${geo.navTop}`)
    await page.screenshot({ path: path.join(SHOTS, `mobile-${w}-focus-board-bottom.png`) })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(1500)

  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="focus-board-mobile"] .overflow-y-auto')
    if (el) el.scrollTop = el.scrollHeight
  })
  await sleep(900)
  const bottomGeo = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-focus-card]')]
    const last = cards[cards.length - 1]?.getBoundingClientRect()
    const nav = document.querySelector('nav[role="tablist"]')?.getBoundingClientRect()
    // The floating 專注計時 chip is fixed 78px above the viewport bottom on
    // every mobile surface — the last card must clear it too.
    const timer = [...document.querySelectorAll('div.fixed.z-40')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.height > 0 && r.bottom > window.innerHeight - 200)[0]
    return {
      lastBottom: last ? Math.round(last.bottom) : null,
      navTop: nav ? Math.round(nav.top) : null,
      timerTop: timer ? Math.round(timer.top) : null,
    }
  })
  check('D1 捲到底最後一張卡沒被分頁列蓋住',
    bottomGeo.lastBottom !== null && bottomGeo.navTop !== null &&
      bottomGeo.lastBottom <= bottomGeo.navTop,
    `lastCardBottom=${bottomGeo.lastBottom} navTop=${bottomGeo.navTop}`)
  check('D2 捲到底最後一張卡也沒被浮動計時器蓋住',
    bottomGeo.timerTop === null || bottomGeo.lastBottom <= bottomGeo.timerTop,
    `lastCardBottom=${bottomGeo.lastBottom} timerTop=${bottomGeo.timerTop}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-focus-board-bottom.png') })

  // ── E. Editor: 上移/下移 on phones, untick removes the card ────────────
  // Switch the stored settings to a hand-picked three-card board first: the
  // untick assertion needs a small, known selection.
  phase.curated = true
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  await page.getByRole('tab', { name: '任務', exact: true }).click()
  await sleep(1500)
  await page.getByRole('tab', { name: '重點', exact: true }).click()
  await sleep(1800)
  await expandOther(page)
  const curatedIds = await cardIds(page)
  check('E0 自訂三張卡時看板只剩那三張',
    curatedIds.length === 3 && curatedIds.includes(CAT_A) && curatedIds.includes(CAT_C),
    `cards=${curatedIds.length}`)

  // Shoot the "before" from the very top so the before/after pair differs
  // only by the card that leaves.
  await scrollBoardTop(page)
  const beforeText = await overlay(page).innerText()
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-before-uncheck-top.png') })
  await page.locator('[data-testid="focus-board-mobile-edit"]').click()
  await sleep(1200)
  const dialog = page.locator('[role="dialog"]').first()
  check('E1 編輯版面 modal 開啟', await dialog.isVisible())
  const upBtns = await dialog.locator('button[aria-label^="把「"]').count()
  const draggable = await dialog.locator(`[data-focus-row="${CAT_B}"]`).getAttribute('draggable')
  check('E2 手機顯示上移／下移按鈕、不是拖曳',
    upBtns >= 2 && draggable !== 'true', `arrowButtons=${upBtns} draggable=${draggable}`)
  await dialog.screenshot({ path: path.join(SHOTS, 'mobile-390-editor.png') })
  await dialog.locator(`[data-focus-pick="${CAT_B}"]`).click()
  await sleep(400)
  const unchecked = await dialog.locator(`[data-focus-pick="${CAT_B}"]`).getAttribute('aria-checked')
  await dialog.getByRole('button', { name: '儲存' }).click()
  await sleep(2500)
  await expandOther(page)
  const afterIds = await page.$$eval('[data-focus-card]', (els) =>
    els.map((e) => e.getAttribute('data-focus-card'))
  )
  check('E3 取消勾選後該卡從看板消失',
    unchecked === 'false' && !afterIds.includes(CAT_B) && afterIds.length === 2,
    `aria-checked=${unchecked} cards=${afterIds.length}`)
  check('E4 儲存後 modal 關閉', (await page.locator('[role="dialog"]').count()) === 0)

  await scrollBoardTop(page)
  const afterHead = await headlineState(page)
  check('E5 儲存後開場區塊完整（不是有 meta 沒標題的斷頭狀態）',
    !!afterHead && afterHead.onScreen && afterHead.label.length > 0 && afterHead.pencil &&
      (afterHead.title.length > 0 || afterHead.emptyState),
    afterHead
      ? `label="${afterHead.label}" title="${afterHead.title}" meta="${afterHead.meta}" empty=${afterHead.emptyState} onScreen=${afterHead.onScreen}`
      : 'headline not found')
  const afterText = await overlay(page).innerText()
  check('E6 前後對照：只有被取消的分類消失',
    beforeText.includes(NAME_B) && !afterText.includes(NAME_B) &&
      afterText.includes(NAME_A) && afterText.includes(NAME_C),
    `before 含「${NAME_B}」=${beforeText.includes(NAME_B)} → after=${afterText.includes(NAME_B)}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-after-uncheck.png') })

  // ── F. Close → back to the 任務 tab, compact block intact ──────────────
  await page.locator('[data-testid="focus-board-mobile-close"]').click()
  await sleep(1500)
  const closed = await page.locator('[data-testid="focus-board-mobile"]').count()
  const tasksSelected = await page
    .getByRole('tab', { name: '任務', exact: true })
    .getAttribute('aria-selected')
  check('F1 關閉後浮層消失並回到原本的分頁',
    closed === 0 && tasksSelected === 'true', `overlay=${closed} 任務aria-selected=${tasksSelected}`)
  const compact = page.locator('[data-tour="focus-block"]').first()
  const compactVisible = (await page.locator('[data-tour="focus-block"]').count()) >= 1 &&
    (await compact.isVisible())
  check('F2 任務分頁的緊湊版重點區塊仍在（回歸）', compactVisible,
    `count=${await page.locator('[data-tour="focus-block"]').count()}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-tasks-after-close.png') })

  // ── G. English ────────────────────────────────────────────────────────
  // Strip user data (workspace / category names + every task title in the
  // account) first: the check is for untranslated UI copy, and the headline
  // legitimately shows a Chinese task title.
  const stripData = (s) => {
    let out = s
    for (const f of FIXTURE_TEXT) out = out.split(f).join('')
    const userStrings = [
      ...state.names,
      ...(state.taskRows ?? []).map((t) => t.title),
    ].filter(Boolean)
    for (const n of [...new Set(userStrings)].sort((a, b) => b.length - a.length)) {
      out = out.split(n).join('')
    }
    return out
  }
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  const enBar = await tabMetrics(page)
  check('G1 英文版底部五顆仍單行未截斷',
    !!enBar && enBar.tabs.length === 5 && enBar.tabs[0].text === 'Focus' &&
      enBar.tabs.every((t) => t.lines === 1 && !t.clipped),
    enBar ? enBar.tabs.map((t) => `${t.text}:${t.lines}行${t.clipped ? '/截斷' : ''}`).join(' ') : '')
  // Tightest case in the whole matrix: "Scratchpad" in a 64px column.
  await page.setViewportSize({ width: 320, height: 568 })
  await sleep(1500)
  const enBar320 = await tabMetrics(page)
  check('G1b 英文版 320 寬仍單行未截斷、無溢出',
    !!enBar320 && enBar320.doc <= 320 &&
      enBar320.tabs.every((t) => t.lines === 1 && !t.clipped),
    enBar320 ? `doc=${enBar320.doc} ` + enBar320.tabs.map((t) => `${t.text}:${t.lines}行${t.clipped ? '/截斷' : ''}`).join(' ') : '')
  await page.locator('nav[role="tablist"]').screenshot({
    path: path.join(SHOTS, 'mobile-320-bottom-bar-en.png'),
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(1500)

  await page.getByRole('tab', { name: 'Focus', exact: true }).click()
  await sleep(1800)
  await expandOther(page)
  const enText = stripData(await overlay(page).innerText())
  check('G2 英文版浮層無中文殘留', !CJK.test(enText), enText.replace(/\s+/g, ' ').slice(0, 90))
  const enHeader = (await page.locator('[data-testid="focus-board-mobile"] .border-b').first().innerText()).trim()
  check('G2b 英文版 header 為 Task focus、底部按鈕仍為 Focus',
    enHeader.startsWith('Task focus') &&
      (await page.getByRole('tab', { name: 'Focus', exact: true }).innerText()).trim() === 'Focus',
    `header="${enHeader.replace(/\s+/g, ' ')}"`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-focus-board-en.png') })
  await page.locator('[data-testid="focus-board-mobile-edit"]').click()
  await sleep(1200)
  const enDialog = page.locator('[role="dialog"]').first()
  check('G3 英文版編輯 modal 無中文殘留', !CJK.test(stripData(await enDialog.innerText())))
  await page.keyboard.press('Escape')
  await sleep(800)

  // ── H. Desktop regression ─────────────────────────────────────────────
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  await page.locator('button[aria-label="展開任務面板"]').first().click()
  await sleep(2500)
  // 任務重點 is now the LAST tab and is no longer the default, so the board
  // only exists after the click.
  const deskTabs = await page.$$eval('button', (els) =>
    els
      .map((e) => e.textContent.trim())
      .filter((x) => ['總覽', '所有任務', '工作區', '任務重點'].includes(x))
  )
  const boardBeforeClick = await page.locator('[data-testid="focus-board"]').count()
  await page.getByRole('button', { name: '任務重點', exact: true }).first().click()
  await sleep(1500)
  await expandOther(page)
  const deskCards = await page.locator('[data-focus-card]').count()
  const deskGroups = await page.locator('[data-focus-tier="other"] [data-focus-group]').count()
  const deskBoard = await page.locator('[data-testid="focus-board"]').count()
  const deskMobileBoard = await page.locator('[data-testid="focus-board-mobile"]').count()
  check('H1 桌機分頁順序正確、預設不在任務重點、點進去才出現看板（桌機版元件）',
    deskTabs.join(' / ') === '總覽 / 所有任務 / 工作區 / 任務重點' && boardBeforeClick === 0 &&
      deskBoard === 1 && deskMobileBoard === 0 && deskCards === 3 && deskGroups === 1,
    `tabs=${deskTabs.join(' / ')} 點擊前board=${boardBeforeClick} → board=${deskBoard} cards=${deskCards} groups=${deskGroups}`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-focus-tab-regression.png') })

  check('I1 全程 0 個 pageerror', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
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
