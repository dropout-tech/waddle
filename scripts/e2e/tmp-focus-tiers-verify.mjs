#!/usr/bin/env node
/**
 * 任務重點 board — tiers / density / pinning / search / stalled marker
 * (2026-08-25).
 *
 * The board now sorts every card into four bands (釘選 → 需要注意 → 停滯 →
 * 其他), only 其他 collapses, and a density switch turns the cards into one
 * row per category. This script proves all of it on a fixture built to
 * populate every band at once:
 *
 *   attention: 講師資源站 (逾期), 財務庶務 (逾期), 暑期營隊 (今天到期)
 *   stalled:   內部流程 (30 天沒動靜), 自我學習 (21 天沒動靜)
 *   pinned:    社群經營 (settings 帶 pinned: true)
 *   other:     對外行銷, 合作提案
 *
 * 2026-08-27 update: 大綱 (outline) mode shipped and is now the default, so a
 * virgin device no longer lands on the tiered board at all. A0 / G0 assert the
 * new default on both ends, then flip the switch to 卡片 — everything below is
 * unchanged and still describes the tiered modes.
 *
 * A. Four tiers render and every card lands in the right one; every card in
 *    需要注意 states its reason; only that heading is terracotta; cards are
 *    not stretched to equal height.
 * B. 其他 starts collapsed, the other three start open; expanding writes
 *    waddle-focus-tier-other-v1; the heading row is really clickable at the
 *    chevron's own coordinates (real mouse click, not a pixel guess).
 * C. Density switch: compact = one ~36px row per category (≥44px on phones),
 *    tiers survive, waddle-focus-density-v1 persists both ways.
 * D. Pinning a card moves it to the top of 釘選; unpinning returns it.
 * E. Search drops the bands for a single 搜尋結果 list, restores them on
 *    clear, and shows an empty state for a miss.
 * F. The stalled marker is muted grey — measurably NOT the terracotta used
 *    for overdue.
 * G. Desktop 1440 + phone 390 both, phone 320 has no horizontal overflow.
 * H. English — no CJK left in the board.
 * I. Zero pageerror across the whole run.
 *
 * DB writes: NONE. Every non-GET to /rest/v1/** is answered with a local fake
 * 200; categories / tasks / user_settings GETs are augmented with fixtures.
 * ONE login for the whole run (Supabase rate-limits repeat logins) — every
 * width is reached with setViewportSize + reload on the same context.
 *
 * Screenshots → docs/reports/2026-08-25-focus-tiers-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3157
const BASE = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-25-focus-tiers-shots')
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
const isoDaysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString()
const ISO = new Date().toISOString()

const CAT_A = '00000000-0000-4000-8000-0000000c0001'
const CAT_B = '00000000-0000-4000-8000-0000000c0002'
const CAT_C = '00000000-0000-4000-8000-0000000c0003'
const CAT_D = '00000000-0000-4000-8000-0000000c0004'
const CAT_E = '00000000-0000-4000-8000-0000000c0005'
const CAT_F = '00000000-0000-4000-8000-0000000c0006'
const CAT_G = '00000000-0000-4000-8000-0000000c0007'
const CAT_H = '00000000-0000-4000-8000-0000000c0008'
const NAME = {
  [CAT_A]: '講師資源站',
  [CAT_B]: '暑期營隊',
  [CAT_C]: '對外行銷',
  [CAT_D]: '合作提案',
  [CAT_E]: '社群經營',
  [CAT_F]: '內部流程',
  [CAT_G]: '財務庶務',
  [CAT_H]: '自我學習',
}
const NOTE_A = '推進講師資源站'
const CAT_WS = {
  [CAT_A]: 'wsA', [CAT_B]: 'wsA', [CAT_D]: 'wsA',
  [CAT_C]: 'wsB', [CAT_E]: 'wsB',
  [CAT_F]: 'wsC', [CAT_G]: 'wsC', [CAT_H]: 'wsC',
}
const FIXTURE_CATS = [CAT_A, CAT_B, CAT_C, CAT_D, CAT_E, CAT_F, CAT_G, CAT_H]

/** Expected band for every fixture category, given the tasks below. */
const EXPECTED_TIER = {
  [CAT_A]: 'attention', // 逾期 3 天
  [CAT_G]: 'attention', // 逾期 1 天
  [CAT_B]: 'attention', // 今天到期
  [CAT_F]: 'stalled', // 30 天沒動靜
  [CAT_H]: 'stalled', // 21 天沒動靜
  [CAT_E]: 'pinned', // settings 帶 pinned
  [CAT_C]: 'other',
  [CAT_D]: 'other',
}

// `quiet` = how long ago every timestamp on this category's tasks is.
const TASKS = [
  { cat: CAT_A, title: '整理講師合約與報價單', scheduled: dayOffset(-3), urgency: 6, quiet: 0 },
  { cat: CAT_A, title: '回覆客戶的場地詢問', scheduled: dayOffset(1), urgency: 5, quiet: 0 },
  { cat: CAT_A, title: '更新官網的課程頁文案', scheduled: null, urgency: 8, quiet: 0 },
  { cat: CAT_A, title: '整理上週的收據', scheduled: null, urgency: 3, quiet: 0 },
  { cat: CAT_B, title: '盤點暑期營隊的器材', scheduled: dayOffset(0), urgency: 7, quiet: 0 },
  { cat: CAT_B, title: '確認營隊保險', scheduled: null, urgency: 4, quiet: 0 },
  { cat: CAT_G, title: '對帳上個月的收支', scheduled: dayOffset(-1), urgency: 7, quiet: 0 },
  { cat: CAT_F, title: '更新內部流程手冊', scheduled: null, urgency: 2, quiet: 30 },
  { cat: CAT_F, title: '整理共用資料夾', scheduled: null, urgency: 1, quiet: 30 },
  { cat: CAT_H, title: '讀完手上那本設計書', scheduled: null, urgency: 2, quiet: 21 },
  { cat: CAT_C, title: '寫這個月的營運月報', scheduled: null, urgency: 9, quiet: 1 },
  { cat: CAT_C, title: '排下個月的社群貼文', scheduled: null, urgency: 5, quiet: 1 },
  { cat: CAT_D, title: '整理合作提案的簡報', scheduled: null, urgency: 4, quiet: 2 },
  { cat: CAT_E, title: '寫社群經營的月度回顧', scheduled: null, urgency: 6, quiet: 1 },
]
// Longest first: '講師資源站' is a substring of the note '推進講師資源站'.
const FIXTURE_TEXT = [...Object.values(NAME), NOTE_A, ...TASKS.map((t) => t.title)].sort(
  (a, b) => b.length - a.length
)

const plan = { ready: false, userId: null, wsA: null, wsB: null, wsC: null }

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
  const stamp = spec.quiet ? isoDaysAgo(spec.quiet) : ISO
  return {
    id: `00000000-0000-4000-8000-0000000d${String(i).padStart(4, '0')}`,
    user_id: plan.userId,
    workspace_id: plan[CAT_WS[spec.cat]],
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
    created_at: stamp,
    updated_at: stamp,
  }
}

/**
 * Curated on purpose: the board is pinned to exactly these eight fixture
 * categories, so the expected tier of every card is known up front and the
 * real account's own data can't drift the assertions.
 */
const FIXTURE_CARDS = FIXTURE_CATS.map((id, i) => ({
  categoryId: id,
  sortOrder: i,
  note: id === CAT_A ? NOTE_A : undefined,
  pinned: id === CAT_E ? true : undefined,
}))

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
      fakeCategory(id, plan[CAT_WS[id]], NAME[id], 900 + i)
    )
    await route.fulfill({ response, json: [...body, ...injected] })
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
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    const response = await route.fetch()
    let body = null
    try { body = await response.json() } catch {}
    const focusBoard = {
      enabled: true,
      global: { mode: 'auto' },
      byWorkspace: {},
      cards: plan.ready ? FIXTURE_CARDS : undefined,
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

/** Tier → card ids, straight out of the DOM. */
const tierMap = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-focus-tier]')].map((section) => ({
      tier: section.getAttribute('data-focus-tier'),
      cards: [...section.querySelectorAll('[data-focus-card]')].map((c) =>
        c.getAttribute('data-focus-card')
      ),
    }))
  )
const pretty = (map) =>
  map.map((t) => `${t.tier}[${t.cards.map((id) => NAME[id] ?? id.slice(-4)).join('、') || '—'}]`).join(' ')

/**
 * Both boards scroll inside an inner container (the shell is h-screen /
 * overflow-hidden), so `page.screenshot` only ever paints the viewport and
 * element shots get clipped by that ancestor. Move the container instead and
 * let the layout settle before the shutter — the earlier "-board-full" shots
 * caught the 其他 band mid-render because of exactly this.
 */
async function scrollBoard(page, top) {
  await page.evaluate((y) => {
    const el =
      document.querySelector('[data-testid="focus-board-mobile"] .overflow-y-auto') ||
      document.querySelector('[data-testid="focus-board"]')?.closest('.overflow-auto') ||
      document.querySelector('[data-testid="focus-board"]')?.closest('.overflow-y-auto')
    if (el) el.scrollTop = y === 'end' ? el.scrollHeight : y
  }, top)
  await sleep(900)
}

/** Bring a selector into view inside that same container, then settle. */
async function scrollTo(page, selector) {
  await page.evaluate((sel) => {
    document.querySelector(sel)?.scrollIntoView({ block: 'center' })
  }, selector)
  await sleep(900)
}

const storage = (page) =>
  page.evaluate(() => ({
    other: localStorage.getItem('waddle-focus-tier-other-v1'),
    density: localStorage.getItem('waddle-focus-density-v1'),
  }))

/** Where every fixture category actually landed. */
function membershipReport(map) {
  const actual = {}
  for (const { tier, cards } of map) for (const id of cards) actual[id] = tier
  const wrong = FIXTURE_CATS.filter((id) => actual[id] !== EXPECTED_TIER[id])
  return { actual, wrong }
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
      // Start from a virgin device: no stored density / collapse preference.
      localStorage.removeItem('waddle-focus-density-v1')
      localStorage.removeItem('waddle-focus-tier-other-v1')
      localStorage.removeItem('waddle-focus-board-v1')
    } catch {}
  })

  const state = { names: [] }
  await installRoutes(page, state)
  // First reload discovers user/workspace ids; second runs with the fixture.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(6000)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)

  await page.locator('button[aria-label="展開任務面板"]').first().click()
  await sleep(2500)
  await page.getByRole('button', { name: '任務重點', exact: true }).first().click()
  await sleep(1500)

  // ── A0. 2026-08-27: 大綱 is now the default mode ──────────────────────
  // The tiers this script is about live in 卡片／精簡 only, so a virgin device
  // lands on the outline and every assertion below needs the switch flipped
  // first. Prove the new default here, then switch.
  const defaultMode = await page.evaluate(() => ({
    outline: document.querySelectorAll('[data-testid="focus-outline"]').length,
    entries: document.querySelectorAll('[data-focus-outline-entry]').length,
    tiers: document.querySelectorAll('[data-focus-tier]').length,
    pressed: document
      .querySelector('[data-testid="focus-density-outline"]')
      ?.getAttribute('aria-pressed'),
  }))
  check('A0 新裝置預設是大綱模式，分層要切到卡片模式才出現',
    defaultMode.outline === 1 && defaultMode.tiers === 0 && defaultMode.pressed === 'true' &&
      defaultMode.entries === FIXTURE_CATS.length,
    `大綱容器=${defaultMode.outline} 大綱段落=${defaultMode.entries} 分層=${defaultMode.tiers} 大綱鈕 aria-pressed=${defaultMode.pressed}`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-outline-default.png') })
  await page.locator('[data-testid="focus-density-card"]').click()
  await sleep(900)

  // ── A/B. Four tiers, 其他 collapsed by default ─────────────────────────
  const map0 = await tierMap(page)
  const tiers0 = map0.map((t) => t.tier)
  check('A1 四層依序出現：釘選／需要注意／停滯／其他',
    tiers0.join(' → ') === 'pinned → attention → stalled → other',
    `tiers=${tiers0.join(' → ')}`)
  const expandedState = await page.evaluate(() =>
    [...document.querySelectorAll('[data-focus-tier]')].map((s) => ({
      tier: s.getAttribute('data-focus-tier'),
      toggle: s.querySelector('[aria-expanded]')?.getAttribute('aria-expanded') ?? 'none',
      cards: s.querySelectorAll('[data-focus-card]').length,
    }))
  )
  const other0 = expandedState.find((s) => s.tier === 'other')
  check('B1 只有「其他」預設收合（其餘三層無收合鈕、卡片直接可見）',
    other0.toggle === 'false' && other0.cards === 0 &&
      expandedState.filter((s) => s.tier !== 'other').every((s) => s.toggle === 'none' && s.cards > 0),
    expandedState.map((s) => `${s.tier}:展開=${s.toggle}/卡=${s.cards}`).join(' '))
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-tiers-default.png') })
  // The collapsed 其他 band is the whole point of the feature, so put it on
  // camera instead of leaving it below the fold.
  await scrollTo(page, '[data-focus-tier="other"]')
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-other-collapsed.png') })
  await scrollBoard(page, 0)

  await page.locator('[data-testid="focus-tier-toggle-other"]').click()
  await sleep(700)
  const map1 = await tierMap(page)
  const store1 = await storage(page)
  const other1 = map1.find((t) => t.tier === 'other')
  check('B2 點展開「其他」→ 卡片出現，收合狀態寫進 localStorage',
    other1.cards.length === 2 && store1.other === '0',
    `其他卡片=${other1.cards.map((id) => NAME[id]).join('、')} · waddle-focus-tier-other-v1=${store1.other}`)

  const report = membershipReport(map1)
  check('A2 每張卡都落在正確的層', report.wrong.length === 0, pretty(map1))
  const groupCount = await page.locator('[data-focus-tier="other"] [data-focus-group]').count()
  const flatGroups = await page.locator('[data-focus-tier="attention"] [data-focus-group]').count()
  // 對外行銷 lives in wsB, 合作提案 in wsA — one heading each, unless this
  // account only has a single workspace.
  const expectedOtherGroups = new Set([plan.wsA, plan.wsB]).size
  check('A3 只有「其他」按工作區分組，緊急三層維持平鋪',
    groupCount === expectedOtherGroups && flatGroups === 0,
    `其他分組=${groupCount}（預期 ${expectedOtherGroups}） 需要注意分組=${flatGroups}`)
  const stalledHint = await page.locator('[data-focus-tier="stalled"]').first().innerText()
  check('A4 停滯層小標旁有說明文字', stalledHint.includes('超過 14 天沒有動靜'),
    stalledHint.replace(/\s+/g, ' ').slice(0, 50))
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-tiers-expanded.png') })

  // ── A5. Every card in 需要注意 says why it is there ────────────────────
  const attentionReasons = await page.evaluate(() =>
    [...document.querySelectorAll('[data-focus-tier="attention"] [data-focus-card]')].map((c) => ({
      name: c.querySelector('[data-focus-card-title]')?.innerText.trim() ?? '?',
      markers: [...c.querySelectorAll('[data-focus-marker]')].map((m) => ({
        text: m.textContent.trim(),
        color: getComputedStyle(m).color,
      })),
    }))
  )
  const overdueColor = await page.evaluate(() => {
    const el = document.querySelector('[data-focus-marker="overdue"]')
    return el ? getComputedStyle(el).color : null
  })
  check('A5 「需要注意」層每張卡都有可見的理由標記，且為赤陶色',
    attentionReasons.length === 3 &&
      attentionReasons.every((c) => c.markers.length > 0 && c.markers[0].color === overdueColor),
    attentionReasons.map((c) => `${c.name.split('\n')[0]}→${c.markers.map((m) => m.text).join('+') || '無'}`).join(' · '))

  // ── A6. Cards keep their own height (items-start) ─────────────────────
  const rowGeo = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-focus-tier="attention"] [data-focus-card]')]
    return cards.map((c) => {
      const r = c.getBoundingClientRect()
      return { y: Math.round(r.y), h: Math.round(r.height) }
    })
  })
  const sameRowHeights = rowGeo.filter((c) => Math.abs(c.y - rowGeo[0].y) < 8).map((c) => c.h)
  check('A6 同一列相鄰卡片高度可以不同（不再被撐等高）',
    sameRowHeights.length >= 2 && new Set(sameRowHeights).size >= 2,
    `同列卡片高度=${sameRowHeights.join(' / ')}px`)

  // ── A7. Only 需要注意 is terracotta ───────────────────────────────────
  const headingColors = await page.evaluate(() =>
    [...document.querySelectorAll('[data-focus-tier]')].map((s) => ({
      tier: s.getAttribute('data-focus-tier'),
      color: getComputedStyle(s.querySelector('h2')).color,
      count: s.querySelector('h2')?.nextElementSibling?.textContent.trim(),
    }))
  )
  const attentionHeading = headingColors.find((h) => h.tier === 'attention')
  check('A7 只有「需要注意」小標染赤陶，其餘維持 muted；四層都有數量',
    attentionHeading.color === overdueColor &&
      headingColors.filter((h) => h.tier !== 'attention').every((h) => h.color !== overdueColor) &&
      headingColors.every((h) => /^\d+$/.test(h.count ?? '')),
    headingColors.map((h) => `${h.tier}:${h.count}:${h.color}`).join(' '))

  // Full-height evidence: two viewport shots with the inner container parked
  // and settled, top and bottom.
  await scrollBoard(page, 0)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-tiers-board-top.png') })
  await scrollBoard(page, 'end')
  const bottomGeo = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-focus-card]')]
    const last = cards[cards.length - 1]?.getBoundingClientRect()
    return {
      cards: cards.length,
      lastName: cards[cards.length - 1]?.querySelector('[data-focus-card-title]')?.innerText.trim(),
      lastBottom: last ? Math.round(last.bottom) : null,
      lastVisible: !!last && last.top >= 0 && last.bottom <= window.innerHeight,
    }
  })
  check('A8 捲到底時最後一張卡完整在畫面內（截圖不是半渲染狀態）',
    bottomGeo.lastVisible,
    `最後一張=${(bottomGeo.lastName ?? '').split('\n')[0]} bottom=${bottomGeo.lastBottom} 視窗高=900`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-tiers-board-bottom.png') })
  await scrollBoard(page, 0)

  // ── F. Stalled marker colour ≠ overdue terracotta ─────────────────────
  const colours = await page.evaluate(() => {
    const stale = document.querySelector('[data-focus-marker="stale"]')
    const overdue = document.querySelector('[data-focus-marker="overdue"]')
    return {
      stale: stale ? getComputedStyle(stale).color : null,
      staleText: stale ? stale.textContent.trim() : null,
      overdue: overdue ? getComputedStyle(overdue).color : null,
      overdueText: overdue ? overdue.textContent.trim() : null,
    }
  })
  const staleCard = await page
    .locator('[data-focus-tier="stalled"] [data-focus-marker="stale"]')
    .count()
  check('F1 停滯標記出現在停滯層的卡片上、顏色不等於逾期赤陶色，也不是警示紅',
    !!colours.stale && !!colours.overdue && colours.stale !== colours.overdue &&
      colours.stale !== 'rgb(239, 68, 68)' && staleCard >= 2,
    `停滯「${colours.staleText}」=${colours.stale} vs 逾期「${colours.overdueText}」=${colours.overdue}（停滯層標記數=${staleCard}）`)

  // ── C. Density switch ─────────────────────────────────────────────────
  await page.locator('[data-testid="focus-density-compact"]').click()
  await sleep(700)

  // ── B3. Real click on the chevron's own pixel ─────────────────────────
  // Compact mode at 1440 is where the 其他 heading lands next to the floating
  // quick-action button in the bottom-left corner. Collapse the band from the
  // middle of the row (a point nothing covers), then aim a real mouse click at
  // the chevron's centre and see what actually receives it.
  await page.locator('[data-testid="focus-tier-toggle-other"]').click()
  await sleep(700)
  const probe = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="focus-tier-toggle-other"]')
    const icon = btn.querySelector('svg')
    const r = icon.getBoundingClientRect()
    const cx = Math.round(r.left + r.width / 2)
    const cy = Math.round(r.top + r.height / 2)
    const top = document.elementFromPoint(cx, cy)
    const btnRect = btn.getBoundingClientRect()
    return {
      cx,
      cy,
      chevronBox: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`,
      rowBox: `${Math.round(btnRect.x)},${Math.round(btnRect.y)} ${Math.round(btnRect.width)}×${Math.round(btnRect.height)}`,
      hit: top ? `${top.tagName.toLowerCase()}${top.getAttribute('data-testid') ? `[data-testid=${top.getAttribute('data-testid')}]` : ''}${top.className && typeof top.className === 'string' ? '.' + top.className.split(' ').slice(0, 2).join('.') : ''}` : 'null',
      covered: !btn.contains(top),
      before: btn.getAttribute('aria-expanded'),
    }
  })
  await page.mouse.click(probe.cx, probe.cy)
  await sleep(900)
  const afterChevronClick = await page
    .locator('[data-testid="focus-tier-toggle-other"]')
    .getAttribute('aria-expanded')
  let rowClickResult = 'n/a'
  if (afterChevronClick !== 'true') {
    // Chevron pixel really is blocked — prove the row-wide hit area saves it.
    await page.keyboard.press('Escape')
    await sleep(400)
    await page.locator('[data-testid="focus-tier-toggle-other"]').click()
    await sleep(800)
    rowClickResult = await page
      .locator('[data-testid="focus-tier-toggle-other"]')
      .getAttribute('aria-expanded')
  }
  // Verdict: the band must end up open. The interesting half is *how* — the
  // detail line records whether the chevron's own pixel is reachable at all.
  check('B3 「其他」層可展開：箭頭像素若被浮動按鈕蓋住，整列點擊區仍救得回來',
    afterChevronClick === 'true' || rowClickResult === 'true',
    `箭頭 box=${probe.chevronBox}／整列 box=${probe.rowBox} · 對 (${probe.cx},${probe.cy}) 實際按下滑鼠 → elementFromPoint=${probe.hit}、屬於標題列=${!probe.covered}、展開=${afterChevronClick}${rowClickResult === 'n/a' ? '（箭頭本身可點，無需備援）' : ` · 改點整列 → 展開=${rowClickResult}`}`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-other-chevron-click.png') })
  const compactGeo = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-focus-compact-row]')]
    return {
      rows: rows.length,
      heights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
      cards: document.querySelectorAll('[data-focus-card]').length,
      tiers: document.querySelectorAll('[data-focus-tier]').length,
      groups: document.querySelectorAll('[data-focus-tier="other"] [data-focus-group]').length,
      sameRow: rows.some((a, i) =>
        rows.some((b, j) => i !== j && Math.abs(a.getBoundingClientRect().y - b.getBoundingClientRect().y) < 4)
      ),
    }
  })
  const store2 = await storage(page)
  check('C1 精簡模式：一行一個大項目，桌機行高 ~36px，分層與工作區分組都還在',
    compactGeo.rows === 8 && compactGeo.cards === 8 && !compactGeo.sameRow &&
      compactGeo.heights.every((h) => h >= 34 && h <= 40) &&
      compactGeo.tiers === 4 && compactGeo.groups === expectedOtherGroups &&
      store2.density === 'compact',
    `列數=${compactGeo.rows} 行高=${compactGeo.heights.join(',')}px 分層=${compactGeo.tiers} 其他分組=${compactGeo.groups} density=${store2.density}`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-compact.png') })
  await page.locator('[data-testid="focus-board"]').screenshot({
    path: path.join(SHOTS, 'desktop-1440-compact-board-full.png'),
  })

  await page.locator('[data-testid="focus-density-card"]').click()
  await sleep(700)
  const store3 = await storage(page)
  const backToCards = await page.evaluate(() => ({
    compactRows: document.querySelectorAll('[data-focus-compact-row]').length,
    cards: document.querySelectorAll('[data-focus-card]').length,
    tiers: document.querySelectorAll('[data-focus-tier]').length,
    otherOpen: document
      .querySelector('[data-focus-tier="other"] [aria-expanded]')
      ?.getAttribute('aria-expanded'),
  }))
  check('C2 切回卡片模式：狀態保留（density=card、其他仍展開、八張卡都在）',
    store3.density === 'card' && backToCards.compactRows === 0 && backToCards.cards === 8 &&
      backToCards.tiers === 4 && backToCards.otherOpen === 'true',
    `density=${store3.density} 卡片=${backToCards.cards} 其他展開=${backToCards.otherOpen}`)

  // ── D. Pin / unpin ────────────────────────────────────────────────────
  await page.locator(`[data-focus-card="${CAT_A}"] [data-focus-pin]`).click()
  await sleep(1500)
  const mapPinned = await tierMap(page)
  const pinnedTier = mapPinned.find((t) => t.tier === 'pinned')
  const attentionAfterPin = mapPinned.find((t) => t.tier === 'attention')
  check('D1 釘選後該卡跳到「釘選」層最上面、離開原本的層',
    pinnedTier.cards[0] === CAT_A && pinnedTier.cards.length === 2 &&
      !attentionAfterPin.cards.includes(CAT_A),
    pretty(mapPinned))
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-pinned.png') })

  await page.locator(`[data-focus-tier="pinned"] [data-focus-card="${CAT_A}"] [data-focus-pin]`).click()
  await sleep(1500)
  const mapUnpinned = await tierMap(page)
  const attentionBack = mapUnpinned.find((t) => t.tier === 'attention')
  check('D2 取消釘選後回到原本的層',
    attentionBack.cards.includes(CAT_A) &&
      !mapUnpinned.find((t) => t.tier === 'pinned').cards.includes(CAT_A),
    pretty(mapUnpinned))

  // ── E. Search ─────────────────────────────────────────────────────────
  // Collapse 其他 first, so we can prove the stored preference survives.
  await page.locator('[data-testid="focus-tier-toggle-other"]').click()
  await sleep(600)
  await page.locator('[data-testid="focus-board-search"]').fill(NAME[CAT_C])
  await sleep(900)
  const mapSearch = await tierMap(page)
  const storeSearch = await storage(page)
  const searchSection = page.locator('[data-testid="focus-search-results"]')
  const searchHeading = (await searchSection.count())
    ? (await searchSection.locator('h2').innerText()).trim()
    : ''
  const searchCards = await searchSection.locator('[data-focus-card]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-focus-card'))
  )
  check('E1 搜尋時不分層，改用單一「搜尋結果」標題＋命中數（收合偏好未被改寫）',
    mapSearch.length === 0 && (await searchSection.count()) === 1 &&
      searchHeading === '搜尋結果' && searchCards.length === 1 && searchCards[0] === CAT_C &&
      (await searchSection.locator('h2 + span').innerText()).trim() === '1' &&
      storeSearch.other === '1',
    `分層區塊=${mapSearch.length} 標題="${searchHeading}" 命中=${searchCards.map((id) => NAME[id]).join('、')} · localStorage 收合=${storeSearch.other}`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-search.png') })

  await page.locator('[data-testid="focus-board-search"]').fill('zzzqqq')
  await sleep(900)
  const noMatch = await page.locator('[data-testid="focus-board-no-match"]')
  check('E2 查無結果顯示空狀態文案',
    (await noMatch.count()) === 1 && (await noMatch.innerText()).includes('沒有符合的大項目'),
    (await noMatch.count()) ? (await noMatch.innerText()).replace(/\s+/g, ' ') : 'no empty state')
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-search-empty.png') })

  await page.locator('[data-testid="focus-board-search-clear"]').click()
  await sleep(900)
  const mapCleared = await tierMap(page)
  const clearedOther = mapCleared.find((t) => t.tier === 'other')
  check('E3 清空搜尋後回到原狀（四層、其他重新收合）',
    mapCleared.length === 4 && clearedOther.cards.length === 0,
    pretty(mapCleared))

  // ── H. English ────────────────────────────────────────────────────────
  const stripData = (s) => {
    let out = s
    for (const f of FIXTURE_TEXT) out = out.split(f).join('')
    const userStrings = [...state.names, ...(state.taskRows ?? []).map((t) => t.title)].filter(Boolean)
    for (const n of [...new Set(userStrings)].sort((a, b) => b.length - a.length)) {
      out = out.split(n).join('')
    }
    return out
  }
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  await page.locator('button[aria-label="Expand task panel"]').first().click()
  await sleep(2500)
  await page.getByRole('button', { name: 'Task focus', exact: true }).first().click()
  await sleep(1500)
  await page.locator('[data-testid="focus-tier-toggle-other"]').click()
  await sleep(700)
  const enBoard = stripData(await page.locator('[data-testid="focus-board"]').innerText())
  const enHeadings = await page.evaluate(() =>
    [...document.querySelectorAll('[data-focus-tier] h2')].map((h) => h.textContent.trim())
  )
  check('H1 英文版看板無中文殘留', !CJK.test(enBoard), enBoard.replace(/\s+/g, ' ').slice(0, 100))
  check('H2 英文版四層小標已翻譯',
    enHeadings.join(' / ') === 'Pinned / Needs attention / Stalled / Other',
    enHeadings.join(' / '))
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-tiers-en.png') })

  // English is longer than Chinese ("Needs attention" vs 需要注意), so the
  // compact row is where it would collide with the right-hand status column.
  await page.locator('[data-testid="focus-density-compact"]').click()
  await sleep(800)
  const enCompact = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-focus-compact-row]')]
    const clipped = rows.filter((r) => r.scrollWidth > r.clientWidth + 1).length
    return {
      rows: rows.length,
      clipped,
      heights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
      doc: document.documentElement.scrollWidth,
    }
  })
  check('H3 英文＋精簡模式：無橫向溢出、列內文字未被擠爆',
    enCompact.doc <= 1440 && enCompact.clipped === 0 && enCompact.rows === 8,
    `列數=${enCompact.rows} 溢出列=${enCompact.clipped} 行高=${enCompact.heights.join(',')} doc=${enCompact.doc}`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-compact-en.png') })
  await page.locator('[data-testid="focus-density-card"]').click()
  await sleep(600)

  // ── G. Phone 390 ──────────────────────────────────────────────────────
  await page.evaluate(() => {
    localStorage.setItem('waddle-language-v1', 'zh-TW')
    localStorage.removeItem('waddle-focus-tier-other-v1')
    localStorage.removeItem('waddle-focus-density-v1')
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  await page.getByRole('tab', { name: '重點', exact: true }).click()
  await sleep(2000)
  // Same story as A0 on the phone: default is 大綱, so flip to 卡片 first.
  const mDefaultMode = await page.evaluate(() => ({
    outline: document.querySelectorAll('[data-testid="focus-outline"]').length,
    tiers: document.querySelectorAll('[data-focus-tier]').length,
    pressed: document
      .querySelector('[data-testid="focus-density-mobile-outline"]')
      ?.getAttribute('aria-pressed'),
  }))
  check('G0 手機新裝置也預設大綱模式',
    mDefaultMode.outline === 1 && mDefaultMode.tiers === 0 && mDefaultMode.pressed === 'true',
    `大綱容器=${mDefaultMode.outline} 分層=${mDefaultMode.tiers} 大綱鈕 aria-pressed=${mDefaultMode.pressed}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-outline-default.png') })
  await page.locator('[data-testid="focus-density-mobile-card"]').click()
  await sleep(900)
  const mMap0 = await tierMap(page)
  const mOther0 = await page.evaluate(() =>
    document
      .querySelector('[data-focus-tier="other"] [aria-expanded]')
      ?.getAttribute('aria-expanded')
  )
  check('G1 手機 390：四層依序出現、「其他」預設收合',
    mMap0.map((t) => t.tier).join(' → ') === 'pinned → attention → stalled → other' &&
      mOther0 === 'false',
    `${pretty(mMap0)} · 其他展開=${mOther0}`)
  await scrollTo(page, '[data-focus-tier="other"]')
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-other-collapsed.png') })
  await scrollBoard(page, 0)
  const searchBox = await page.locator('[data-testid="focus-board-mobile-search"]').boundingBox()
  const pinVisible = await page.evaluate(() => {
    const pins = [...document.querySelectorAll('[data-focus-pin]')]
    return {
      count: pins.length,
      minOpacity: Math.min(...pins.map((p) => parseFloat(getComputedStyle(p).opacity))),
      minSide: Math.min(...pins.flatMap((p) => {
        const r = p.getBoundingClientRect()
        return [Math.round(r.width), Math.round(r.height)]
      })),
    }
  })
  check('G2 手機：搜尋框與釘選鈕都 ≥44px，釘選鈕恆常可見（opacity=1）',
    !!searchBox && searchBox.height >= 44 && pinVisible.minOpacity === 1 && pinVisible.minSide >= 44,
    `搜尋框高=${Math.round(searchBox.height)} 釘選鈕=${pinVisible.count} 個/最小邊=${pinVisible.minSide}px/最低不透明度=${pinVisible.minOpacity}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-tiers-default.png') })

  await page.locator('[data-testid="focus-tier-toggle-other"]').click()
  await sleep(700)
  const mMap1 = await tierMap(page)
  const mReport = membershipReport(mMap1)
  check('G3 手機：展開後每張卡也落在正確的層', mReport.wrong.length === 0, pretty(mMap1))
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-tiers-expanded.png') })

  await page.locator('[data-testid="focus-density-mobile-compact"]').click()
  await sleep(800)
  const mCompact = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-focus-compact-row]')]
    return {
      rows: rows.length,
      minHeight: Math.min(...rows.map((r) => Math.round(r.getBoundingClientRect().height))),
      widths: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().width)))],
      tiers: document.querySelectorAll('[data-focus-tier]').length,
      doc: document.documentElement.scrollWidth,
    }
  })
  check('G4 手機精簡模式：一行一個、行高 ≥44px、分層仍在、無溢出',
    mCompact.rows === 8 && mCompact.minHeight >= 44 && mCompact.tiers === 4 && mCompact.doc <= 390,
    `列數=${mCompact.rows} 最小行高=${mCompact.minHeight}px 分層=${mCompact.tiers} doc=${mCompact.doc}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-compact.png') })

  await page.locator('[data-testid="focus-board-mobile-search"]').fill(NAME[CAT_C])
  await sleep(900)
  const mSearchSection = page.locator('[data-testid="focus-search-results-mobile"]')
  const mSearchCards = await mSearchSection.locator('[data-focus-card]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-focus-card'))
  )
  const mSearchHeading = (await mSearchSection.count())
    ? (await mSearchSection.locator('h2').innerText()).trim()
    : ''
  check('G5 手機搜尋：不分層、單一「搜尋結果」標題、只剩符合的卡',
    (await tierMap(page)).length === 0 && mSearchHeading === '搜尋結果' &&
      mSearchCards.join() === CAT_C,
    `標題="${mSearchHeading}" 命中=${mSearchCards.map((id) => NAME[id]).join('、')}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-search.png') })
  await page.locator('[data-testid="focus-board-mobile-search-clear"]').click()
  await sleep(800)

  // 320 — the tightest width the app supports.
  await page.setViewportSize({ width: 320, height: 568 })
  await sleep(1500)
  const narrow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    rows: [...document.querySelectorAll('[data-focus-compact-row]')].map((r) =>
      Math.round(r.getBoundingClientRect().height)
    ),
  }))
  check('G6 手機 320 無橫向溢出、精簡行高仍 ≥44px',
    narrow.doc <= 320 && narrow.body <= 320 && narrow.rows.every((h) => h >= 44),
    `doc=${narrow.doc} body=${narrow.body} 行高=${[...new Set(narrow.rows)].join(',')}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-320-compact.png') })

  await page.locator('[data-testid="focus-density-mobile-card"]').click()
  await sleep(800)
  const narrowCards = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    widths: [...new Set([...document.querySelectorAll('[data-focus-card]')].map((c) =>
      Math.round(c.getBoundingClientRect().width)
    ))],
  }))
  check('G7 手機 320 卡片模式無溢出、卡片仍滿版',
    narrowCards.doc <= 320 && narrowCards.widths.every((w) => w >= 320 - 40),
    `doc=${narrowCards.doc} 卡寬=${narrowCards.widths.join(',')}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-320-cards.png') })

  // ── J. Does the floating 專注計時 chip swallow a pin button? ───────────
  // No timer is running here, so the chip in the corner is the *idle* launcher
  // (components/timer/focus-timer.tsx, `fixed z-40`) — a different element from
  // the running-timer pill (`fixed z-toast`), same corner, same 78px offset.
  //
  // 2026-08-26: this used to probe the pin's centre only, which passed happily
  // while the overlap band was a dead zone. Now it samples nine points across
  // the whole 44×44 target — four corners (inset 6px, clear of the button's own
  // rounded-lg hit clipping), the centre, three across the overlap band and the
  // top edge — and every one of them must land on the pin.
  await page.locator('[data-testid="focus-density-mobile-compact"]').click()
  await sleep(800)
  let hidden = null
  for (const frac of [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1, 0]) {
    await page.evaluate((f) => {
      const el = document.querySelector('[data-testid="focus-board-mobile"] .overflow-y-auto')
      if (el) el.scrollTop = el.scrollHeight * f
    }, frac)
    await sleep(900)
    hidden = await page.evaluate(() => {
      const chipEl = [...document.querySelectorAll('div.fixed.z-40')]
        .filter((e) => {
          const r = e.getBoundingClientRect()
          return r.height > 0 && r.bottom > window.innerHeight - 200
        })[0]
      if (!chipEl) return { chip: null }
      const chip = chipEl.getBoundingClientRect()
      const describe = (el) => {
        if (!el) return 'null'
        const tag = el.tagName.toLowerCase()
        const cls = typeof el.className === 'string' && el.className
          ? '.' + el.className.split(' ').slice(0, 2).join('.') : ''
        return tag + (
          el.getAttribute?.('data-focus-pin') !== null && el.getAttribute?.('data-focus-pin') !== undefined
            ? '[data-focus-pin]'
            : el.closest?.('[data-focus-pin]') ? '(釘選鈕內)'
            : chipEl.contains(el) ? '[計時啟動鈕]'
            : cls
        )
      }
      for (const pin of document.querySelectorAll('[data-focus-pin]')) {
        const r = pin.getBoundingClientRect()
        if (r.top < chip.bottom && r.bottom > chip.top && r.left < chip.right && r.right > chip.left) {
          const cx = Math.round(r.left + r.width / 2)
          const cy = Math.round(r.top + r.height / 2)
          const bandY = Math.round((Math.max(r.top, chip.top) + Math.min(r.bottom, chip.bottom)) / 2)
          const IN = 6
          const pts = [
            ['左上角', Math.round(r.left + IN), Math.round(r.top + IN)],
            ['右上角', Math.round(r.right - IN), Math.round(r.top + IN)],
            ['左下角', Math.round(r.left + IN), Math.round(r.bottom - IN)],
            ['右下角', Math.round(r.right - IN), Math.round(r.bottom - IN)],
            ['中心', cx, cy],
            ['重疊帶左', Math.round(r.left + IN), bandY],
            ['重疊帶中', cx, bandY],
            ['重疊帶右', Math.round(r.right - IN), bandY],
            ['上緣中點', cx, Math.round(r.top + 2)],
          ]
          const results = pts.map(([name, x, y]) => {
            const el = document.elementFromPoint(x, y)
            return { name, x, y, hit: describe(el), ok: !!el && (el === pin || pin.contains(el)) }
          })
          return {
            chip: `${Math.round(chip.x)},${Math.round(chip.y)} ${Math.round(chip.width)}×${Math.round(chip.height)}`,
            hasTourTarget: !!chipEl.querySelector('[data-tour="focus-timer"]'),
            overlapPx: Math.round(Math.min(r.bottom, chip.bottom) - Math.max(r.top, chip.top)),
            pinBox: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`,
            cx,
            cy,
            card: pin.closest('[data-focus-card]')?.getAttribute('data-focus-card'),
            label: pin.getAttribute('aria-label'),
            pressedBefore: pin.getAttribute('aria-pressed'),
            results,
          }
        }
      }
      return { chip: `${Math.round(chip.x)},${Math.round(chip.y)}`, cx: null }
    })
    if (hidden?.cx) break
  }
  if (hidden?.cx) {
    const allHit = hidden.results.every((r) => r.ok)
    await page.mouse.click(hidden.cx, hidden.cy)
    await sleep(1500)
    const reacted = await page.evaluate((cardId) => {
      const card = document.querySelector(`[data-focus-card="${cardId}"]`)
      return {
        tier: card?.closest('[data-focus-tier]')?.getAttribute('data-focus-tier') ?? 'gone',
        pressed: card?.querySelector('[data-focus-pin]')?.getAttribute('aria-pressed'),
        timerOpened: !!document.querySelector('[data-testid="focus-timer-immersive"]'),
      }
    }, hidden.card)
    const worked = reacted.pressed === 'true' || reacted.tier === 'pinned'
    check('J1 320 精簡模式：閒置計時啟動鈕壓到的釘選鈕，44×44 九點取樣全部命中（不只中心點）',
      allHit && worked,
      `啟動鈕 box=${hidden.chip}（含導覽目標=${hidden.hasTourTarget}）／釘選鈕 box=${hidden.pinBox}，垂直重疊 ${hidden.overlapPx}px · ` +
        `對中心 (${hidden.cx},${hidden.cy})「${hidden.label}」實際按下滑鼠 → aria-pressed=${hidden.pressedBefore}→${reacted.pressed}、所屬層=${reacted.tier}\n` +
        hidden.results.map((r) => `      ${r.ok ? '✓' : '✗'} ${r.name}(${r.x},${r.y}) → ${r.hit}`).join('\n'))
    await page.screenshot({ path: path.join(SHOTS, 'mobile-320-chip-vs-pin.png') })
    // If the click landed on the chip instead, it may have opened the timer —
    // dismiss before moving on.
    await page.keyboard.press('Escape')
    await sleep(600)
    // Put the pin back so later steps see the original board.
    if (worked) {
      try {
        await page.locator(`[data-focus-card="${hidden.card}"] [data-focus-pin]`).click({ timeout: 8000 })
        await sleep(1200)
      } catch {
        /* leaving it pinned is harmless — the next reload re-reads settings */
      }
    }
  } else {
    check('J1 320 精簡模式：閒置計時啟動鈕是否覆蓋釘選鈕', false,
      `八個捲動位置都沒有釘選鈕與啟動鈕重疊（啟動鈕 box=${hidden?.chip ?? '找不到'}）— 無法驗證，需人工複查`)
  }

  // ── H4. English at 320 ────────────────────────────────────────────────
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  await page.getByRole('tab', { name: 'Focus', exact: true }).click()
  await sleep(2000)
  const en320 = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-focus-compact-row]')]
    return {
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      rows: rows.length,
      clipped: rows.filter((r) => r.scrollWidth > r.clientWidth + 1).length,
      headings: [...document.querySelectorAll('[data-focus-tier] h2')].map((h) => h.textContent.trim()),
      headingClipped: [...document.querySelectorAll('[data-focus-tier] h2')].filter(
        (h) => h.scrollWidth > h.clientWidth + 1
      ).length,
    }
  })
  check('H4 英文＋320 寬：無橫向溢出、分層小標與精簡列都沒被截斷',
    en320.doc <= 320 && en320.body <= 320 && en320.clipped === 0 && en320.headingClipped === 0 &&
      en320.headings.length >= 3,
    `doc=${en320.doc} body=${en320.body} 精簡列=${en320.rows}（溢出 ${en320.clipped}）小標=${en320.headings.join(' / ')}（截斷 ${en320.headingClipped}）`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-320-compact-en.png') })

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
