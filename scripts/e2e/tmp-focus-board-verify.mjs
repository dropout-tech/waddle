#!/usr/bin/env node
/**
 * 任務重點 board verification (2026-08-20, retargeted 2026-08-25 after the
 * tab was renamed 重點 → 任務重點, moved to LAST, and defaultCards() lost its
 * 6-card cap).
 *
 * Retargeted again 2026-08-25 (tiers): the board now sorts cards into
 * 釘選／需要注意／停滯／其他, only 其他 collapses (and it groups by workspace
 * — the urgent bands are flat), and order inside a band comes from how
 * pressing it is, not from the user's drag order. Tier-specific behaviour is
 * covered by tmp-focus-tiers-verify.mjs; this file keeps the older guarantees
 * true on top of it.
 *
 *  A. Tabs read 總覽 / 所有任務 / 工作區 / 任務重點 in that order; the page
 *     opens on 總覽; the board only appears after 任務重點 is clicked.
 *  B0. Uncurated (`settings.cards === undefined`) ⇒ the board carries a card
 *     for EVERY category that has unfinished work — the user's "每個任務的大
 *     項目都有". Fixture: 8 categories across 3 workspaces, i.e. more than the
 *     old cap of 6. (Counted with 其他 expanded.)
 *  B. Curated ⇒ cards carry the note / task list / "還有 N 個" / terracotta
 *     overdue count, and workspace headings appear only inside 其他.
 *  C. 總覽 contains no FocusBlock (count === 0) and still shows the stat tiles.
 *  D. 編輯版面 → drag to reorder within a workspace → save → the new order
 *     persists (reopening the editor shows it) while the board itself keeps
 *     ordering by pressure, which outranks manual order outside 釘選.
 *  E. 編輯版面 → untick a category → save → its card disappears.
 *  F. English — tab order/labels and no CJK left in the board or the editor.
 *  G. Narrow widths — no horizontal overflow.
 *  H. Zero pageerror across the whole run.
 *
 * DB writes: NONE. Every non-GET to /rest/v1/** is answered with a local
 * fake 200; categories / tasks / user_settings GETs are augmented with
 * deterministic fixtures so the board content is known up-front.
 *
 * ONE login for the whole run (Supabase rate-limits repeat logins): desktop
 * and mobile share a single context and just swap viewport.
 *
 * NOTE on mobile: the phone reaches the board through its own component
 * (focus-board-mobile.tsx, verified by tmp-focus-board-mobile-verify.mjs);
 * `[data-testid="focus-board"]` is the desktop one and is expected to stay 0
 * at 390 here.
 *
 * Screenshots → docs/reports/2026-08-25-focus-tab-rename-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3151
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

// ── Deterministic fixture: EIGHT fake categories spread over three
//    workspaces (three in the first so intra-workspace drag ordering has
//    something to reorder). Eight is deliberate: the old defaultCards() cap
//    was 6, so a fixture of 3 could never have caught the regression this
//    file now guards. Injected into the GET responses only — nothing is
//    written.
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

/** Which workspace slot each fixture category belongs to. */
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
// Longest first: '講師資源站' is a substring of the note '推進講師資源站', so
// stripping the short one first would leave '推進' behind and fake a CJK leak.
const FIXTURE_TEXT = [...Object.values(CAT_NAME), NOTE_A, ...TASKS.map((t) => t.title)].sort(
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
        state.wsNameA = live[0].name
        state.wsNameB = (live[1] ?? live[0]).name
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
    // `phase.curated === false` ⇒ omit `cards` entirely, which is what a user
    // who never opened 編輯版面 has stored: the board must then fall back to
    // defaultCards() and cover everything (checked in B0).
    const focusBoard = {
      enabled: true,
      global: { mode: 'auto' },
      byWorkspace: {},
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

  // Anything else that writes — block it too, just in case.
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

async function openFullScreen(page, label) {
  await page.locator(`button[aria-label="${label}"]`).first().click()
  await sleep(2500)
}

const board = (page) => page.locator('[data-testid="focus-board"]').first()
const cardIds = (page) =>
  page.$$eval('[data-focus-card]', (els) => els.map((e) => e.getAttribute('data-focus-card')))

/**
 * 其他 ships collapsed (only that band does), so anything counting "every
 * card on the board" has to open it first. Idempotent: does nothing when the
 * band is already open or absent.
 */
async function expandOther(page) {
  const toggle = page.locator('[data-testid="focus-tier-toggle-other"]').first()
  if ((await toggle.count()) === 0) return
  if ((await toggle.getAttribute('aria-expanded')) === 'true') return
  await toggle.click()
  await sleep(700)
}

/** Phase switch consulted by the user_settings route on every request. */
const phase = { curated: false }

/** The four tab labels, in DOM order. */
const tabLabels = (page, names) =>
  page.$$eval(
    'button',
    (els, wanted) => els.map((e) => e.textContent.trim()).filter((x) => wanted.includes(x)),
    names
  )

/** A tab counts as selected when it wears the filled primary background. */
const tabSelected = (page, name) =>
  page
    .locator('button', { hasText: new RegExp(`^${name}$`) })
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)

/**
 * Independent expectation for "every category with unfinished work", derived
 * from the exact rows the app was served (real account rows + fixtures), by
 * re-implementing lib/focus.ts's isFocusCandidate against the raw payloads.
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
    try { localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {}
  })

  const state = { names: [], wsNameA: '', wsNameB: '' }
  await installRoutes(page, state)
  // First reload discovers user/workspace ids; second one runs with the
  // full fixture in place.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(6000)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(8000)

  // ── A. Tab order / default tab / the board is one click away ──────────
  const ZH_TABS = ['總覽', '所有任務', '工作區', '任務重點']
  await openFullScreen(page, '展開任務面板')
  const zhTabs = await tabLabels(page, ZH_TABS)
  check('A1 分頁順序為 總覽 / 所有任務 / 工作區 / 任務重點',
    zhTabs.join(' / ') === ZH_TABS.join(' / '), `tabs=${zhTabs.join(' / ')}`)
  const boardBeforeClick = await board(page).isVisible().catch(() => false)
  const overviewBg = await tabSelected(page, '總覽')
  check('A2 預設停在總覽（未點任何分頁時看板不出現）',
    !boardBeforeClick && overviewBg !== 'rgba(0, 0, 0, 0)',
    `boardVisible=${boardBeforeClick} 總覽bg=${overviewBg}`)
  await page.getByRole('button', { name: '任務重點', exact: true }).first().click()
  await sleep(1200)
  const focusTabBg = await tabSelected(page, '任務重點')
  check('A3 點「任務重點」後看板出現且該分頁為選中樣式',
    (await board(page).isVisible()) && focusTabBg !== 'rgba(0, 0, 0, 0)', `bg=${focusTabBg}`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-tabs-zh.png') })

  // ── B0. Uncurated board covers EVERY category that has work ───────────
  const expect0 = expectedCoverage(state)
  await expandOther(page)
  const ids0 = await cardIds(page)
  const groups0 = await page.locator('[data-focus-group]').count()
  const groupsOutsideOther = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-focus-group]')].filter(
        (g) => g.closest('[data-focus-tier]')?.getAttribute('data-focus-tier') !== 'other'
      ).length
  )
  const tierCount = await page.locator('[data-focus-tier]').count()
  const missingFixture = FIXTURE_CATS.filter((id) => !ids0.includes(id))
  check('B0-1 未自訂時，卡片數＝所有「有未完成任務的分類」數',
    ids0.length === expect0.categories.size,
    `看板卡片=${ids0.length}／應涵蓋分類=${expect0.categories.size}（其中假資料 ${FIXTURE_CATS.length} 個分類跨 3 個工作區）`)
  check('B0-2 八個假資料分類全部上板（舊的 6 張上限已解除）',
    missingFixture.length === 0 && ids0.length > 6,
    `缺席=${missingFixture.map((id) => CAT_NAME[id]).join(',') || '無'}／卡片總數=${ids0.length}`)
  check('B0-3 工作區小標只出現在「其他」層（緊急三層維持平鋪）',
    groups0 > 0 && groupsOutsideOther === 0 && tierCount >= 2,
    `工作區小標共 ${groups0} 個，其中在「其他」層外的有 ${groupsOutsideOther} 個／分層數=${tierCount}（帳號共 ${expect0.workspaces.size} 個有工作的工作區）`)
  await board(page).screenshot({ path: path.join(SHOTS, 'desktop-1440-board-uncurated-full.png') })

  // ── B. Curated board content ──────────────────────────────────────────
  // Switch the stored settings to a hand-picked three-card board: D and E
  // below need a known, small selection to reorder and untick.
  phase.curated = true
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  await openFullScreen(page, '展開任務面板')
  await page.getByRole('button', { name: '任務重點', exact: true }).first().click()
  await sleep(1200)
  await expandOther(page)
  const ids = await cardIds(page)
  // Tiering owns the layout now: 講師資源站 (逾期) and 暑期營隊 (今天) are both
  // 需要注意; 對外行銷 has no dates so it drops into 其他, where workspace
  // headings live.
  const tierOf = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-focus-card]')].map((c) => [
        c.getAttribute('data-focus-card'),
        c.closest('[data-focus-tier]')?.getAttribute('data-focus-tier'),
      ])
    )
  )
  const otherGroups = await page.locator('[data-focus-tier="other"] [data-focus-group]').count()
  check('B1 卡片依緊迫程度分層，工作區小標只在「其他」層',
    tierOf[CAT_A] === 'attention' && tierOf[CAT_B] === 'attention' &&
      tierOf[CAT_C] === 'other' && otherGroups === 1,
    `講師資源站=${tierOf[CAT_A]} 暑期營隊=${tierOf[CAT_B]} 對外行銷=${tierOf[CAT_C]} 其他層分組=${otherGroups}`)
  check('B2 三張分類卡都在', ids.length === 3 && ids.includes(CAT_A) && ids.includes(CAT_C),
    `cards=${ids.length}`)
  const cardA = page.locator(`[data-focus-card="${CAT_A}"]`).first()
  const cardAText = (await cardA.innerText()).replace(/\s+/g, ' ')
  check('B3 卡片有分類名／推進狀態／任務／還有 N 個',
    cardAText.includes(NAME_A) && cardAText.includes(NOTE_A) &&
    cardAText.includes('整理講師合約與報價單') && cardAText.includes('還有 2 個'),
    cardAText.slice(0, 90))
  const overdue = cardA.locator('.text-urgency-critical').first()
  const overdueInfo = await overdue.evaluate((el) => ({ text: el.textContent.trim(), color: getComputedStyle(el).color }))
  check('B4 逾期用赤陶色不是警示紅', /逾期/.test(overdueInfo.text) && overdueInfo.color !== 'rgb(239, 68, 68)',
    `${overdueInfo.text} / ${overdueInfo.color}`)
  const cardBox = await cardA.boundingBox()
  const nested = await cardA.locator('.rounded-xl.border').count()
  check('B5 卡中無卡', nested === 0, `nestedCards=${nested} card=${Math.round(cardBox.width)}×${Math.round(cardBox.height)}`)
  const noEcho = await page
    .locator('[data-tour="focus-block"] ul li')
    .count()
  check('B6 總重點卡不再重複列出後續任務', noEcho === 0, `nextTaskRows=${noEcho}`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-focus-tab.png') })
  // The page's scroll container is an inner div (the shell is h-screen
  // overflow-hidden), so `fullPage` equals the viewport — capture the board
  // element itself to prove every workspace group is really there.
  await board(page).screenshot({ path: path.join(SHOTS, 'desktop-1440-focus-board-full.png') })
  // …and one more with the inner container scrolled to the bottom, so the
  // last workspace group is on camera in full (an ancestor with
  // overflow-auto clips whatever the element shot can paint).
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="focus-board"]')?.closest('.overflow-auto')
    if (el) el.scrollTop = el.scrollHeight
  })
  await sleep(700)
  const lastGroupBox = await page.locator('[data-focus-group]').last().boundingBox()
  const lastCardBox = await page.locator('[data-focus-card]').last().boundingBox()
  check('B7 捲到底可見最後一個工作區段落的整張卡',
    !!lastGroupBox && !!lastCardBox && lastCardBox.y + lastCardBox.height <= 900,
    lastCardBox ? `lastCard bottom=${Math.round(lastCardBox.y + lastCardBox.height)}` : 'not found')
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-focus-tab-bottom.png') })
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="focus-board"]')?.closest('.overflow-auto')
    if (el) el.scrollTop = 0
  })
  await sleep(500)

  // ── C. 總覽 no longer carries the FocusBlock ──────────────────────────
  await page.getByRole('button', { name: '總覽', exact: true }).first().click()
  await sleep(1200)
  const blockOnOverview = await page.locator('[data-tour="focus-block"]').count()
  const rateVisible = await page.getByText('完成率', { exact: true }).first().isVisible()
  check('C1 總覽分頁不再有 FocusBlock', blockOnOverview === 0, `count=${blockOnOverview}`)
  check('C2 總覽統計卡仍在', rateVisible)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-overview-no-focus.png') })

  // ── D. Drag to reorder inside a workspace ─────────────────────────────
  await page.getByRole('button', { name: '任務重點', exact: true }).first().click()
  await sleep(900)
  await page.locator('[data-testid="focus-board-edit"]').click()
  await sleep(900)
  const dialog = page.locator('[role="dialog"]').first()
  check('D1 編輯版面 modal 開啟', await dialog.isVisible())
  await dialog.screenshot({ path: path.join(SHOTS, 'desktop-1440-editor.png') })
  const rowA = dialog.locator(`[data-focus-row="${CAT_A}"]`)
  const rowB = dialog.locator(`[data-focus-row="${CAT_B}"]`)
  const draggable = await rowB.getAttribute('draggable')
  check('D2 已勾選的列可拖曳', draggable === 'true', `draggable=${draggable}`)
  await rowB.dragTo(rowA, { targetPosition: { x: 60, y: 3 } })
  await sleep(600)
  const rowOrder = await dialog
    .locator('[data-focus-row]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-focus-row')))
  check('D3 modal 內順序已改（B 排到 A 前）', rowOrder.indexOf(CAT_B) < rowOrder.indexOf(CAT_A),
    `order=${rowOrder.map((id) => id.slice(-4)).join(',')}`)
  await dialog.getByRole('button', { name: '儲存' }).click()
  await sleep(2000)
  await expandOther(page)
  const afterDrag = await cardIds(page)
  // Pressure beats manual order everywhere except 釘選: 講師資源站 is three
  // days overdue, 暑期營隊 is merely due today, so the band keeps A above B
  // no matter what the editor says. What must survive is the *stored* order.
  check('D4 儲存後三張卡都還在，且「需要注意」層仍以緊迫程度排序（逾期在今天之前）',
    afterDrag.length === 3 && afterDrag.indexOf(CAT_A) < afterDrag.indexOf(CAT_B),
    `board=${afterDrag.map((id) => id.slice(-4)).join(',')}`)
  await page.locator('[data-testid="focus-board-edit"]').click()
  await sleep(1000)
  const reopened = page.locator('[role="dialog"]').first()
  const savedOrder = await reopened
    .locator('[data-focus-row]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-focus-row')))
  check('D5 重開編輯版面，拖曳後的順序已被保存', savedOrder.indexOf(CAT_B) < savedOrder.indexOf(CAT_A),
    `order=${savedOrder.map((id) => id.slice(-4)).join(',')}`)
  await page.keyboard.press('Escape')
  await sleep(600)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-focus-tab-reordered.png'), fullPage: true })

  // ── E. Untick one category ────────────────────────────────────────────
  await page.locator('[data-testid="focus-board-edit"]').click()
  await sleep(900)
  const dialog2 = page.locator('[role="dialog"]').first()
  await dialog2.locator(`[data-focus-pick="${CAT_B}"]`).click()
  await sleep(400)
  const uncheckedState = await dialog2.locator(`[data-focus-pick="${CAT_B}"]`).getAttribute('aria-checked')
  await dialog2.getByRole('button', { name: '儲存' }).click()
  await sleep(2000)
  await expandOther(page)
  const afterUncheck = await cardIds(page)
  check('E1 取消勾選後該卡從看板消失',
    uncheckedState === 'false' && !afterUncheck.includes(CAT_B) && afterUncheck.length === 2,
    `aria-checked=${uncheckedState} cards=${afterUncheck.length}`)
  check('E2 modal 儲存後關閉', (await page.locator('[role="dialog"]').count()) === 0)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-focus-tab-after-uncheck.png'), fullPage: true })

  // ── F. English ────────────────────────────────────────────────────────
  // Strip *user data* (workspace / category names and every task title the
  // account owns) before looking for CJK: the check is for untranslated UI
  // copy, and the headline legitimately shows a Chinese task title.
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
  await openFullScreen(page, 'Expand task panel')
  // NB: 工作區 translates to the singular 'Workspace' (lib/i18n/dict/
  // task-panel.ts:13) — that key is shared app-wide, so the tab row reads
  // "Workspace", not "Workspaces".
  const EN_TABS = ['Overview', 'All Tasks', 'Workspace', 'Task focus']
  const enTabs = await tabLabels(page, EN_TABS)
  check('F1 英文分頁順序為 Overview / All Tasks / Workspace / Task focus',
    enTabs.join(' / ') === EN_TABS.join(' / '), `tabs=${enTabs.join(' / ')}`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-tabs-en.png') })
  await page.getByRole('button', { name: 'Task focus', exact: true }).first().click()
  await sleep(1200)
  await expandOther(page)
  const enBoard = stripData(await board(page).innerText())
  check('F2 看板英文版無中文殘留', !CJK.test(enBoard), enBoard.replace(/\s+/g, ' ').slice(0, 90))
  const enHeadings = await page.evaluate(() =>
    [...document.querySelectorAll('[data-focus-tier] h2')].map((h) => h.textContent.trim())
  )
  const enCards = await cardIds(page)
  // The reload re-serves the stored three cards — E's untick was optimistic
  // only (every write is faked), so it does not survive a page load.
  check('F4 英文版分層小標已翻譯、卡片數不變',
    enCards.length === 3 && enHeadings.length >= 2 && !enHeadings.some((h) => CJK.test(h)),
    `headings=${enHeadings.join(' / ')} cards=${enCards.length}`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-focus-tab-en.png') })
  await board(page).screenshot({ path: path.join(SHOTS, 'desktop-1440-focus-board-full-en.png') })
  await page.locator('[data-testid="focus-board-edit"]').click()
  await sleep(1000)
  const enDialog = page.locator('[role="dialog"]').first()
  const enModal = stripData(await enDialog.innerText())
  check('F3 編輯 modal 英文版無中文殘留', !CJK.test(enModal), enModal.replace(/\s+/g, ' ').slice(0, 90))
  await enDialog.screenshot({ path: path.join(SHOTS, 'desktop-1440-editor-en.png') })
  await page.keyboard.press('Escape')
  await sleep(600)

  // ── G. Narrow widths ──────────────────────────────────────────────────
  // 768 is the narrowest width at which this view exists at all (below it
  // main-layout swaps to the mobile layout, which has no full-screen task
  // view). Check the grid still behaves and nothing overflows.
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))
  await page.setViewportSize({ width: 768, height: 900 })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  await openFullScreen(page, '展開任務面板')
  await page.getByRole('button', { name: '任務重點', exact: true }).first().click()
  await sleep(1200)
  const narrowOverflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  check('G1 768 寬無橫向溢出', narrowOverflow.doc <= 768 && narrowOverflow.body <= 768,
    JSON.stringify(narrowOverflow))
  // The grid now hangs off the tier section (or off a workspace group inside
  // 其他), not off a workspace group at the top level.
  const columns = await page.evaluate(() => {
    const grid = document.querySelector('[data-focus-tier] div.grid')
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0
  })
  check('G2 768 寬為雙欄（md 斷點）', columns === 2, `columns=${columns}`)
  await page.screenshot({ path: path.join(SHOTS, 'narrow-768-focus-tab.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  // Mobile opens on the calendar tab — switch to 任務 first, otherwise the
  // shot is of the day view and proves nothing.
  await page.getByRole('tab', { name: '任務', exact: true }).first().click()
  await sleep(1800)
  const mobileOverflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  check('G3 手機 390 無橫向溢出', mobileOverflow.doc <= 390 && mobileOverflow.body <= 390,
    JSON.stringify(mobileOverflow))
  // Regression guard: the compact focus block on the mobile 任務 tab must
  // survive this change (it is a different variant of the same component).
  const mobileBlock = await page.locator('[data-tour="focus-block"]').count()
  const mobileBlockText = mobileBlock
    ? (await page.locator('[data-tour="focus-block"]').first().innerText()).replace(/\s+/g, ' ')
    : ''
  check('G4 手機任務分頁的舊版重點區塊仍在', mobileBlock >= 1,
    `count=${mobileBlock} · ${mobileBlockText.slice(0, 50)}`)
  const mobileNext = await page.locator('[data-tour="focus-block"] button').count()
  check('G5 手機版仍列出後續任務（未被 showNextTasks=false 波及）',
    mobileBlockText.includes('回覆客戶的場地詢問') || mobileNext > 2,
    `rows=${mobileNext}`)
  const boardOnMobile = await page.locator('[data-testid="focus-board"]').count()
  check('G6 手機不渲染桌機版看板（手機走 focus-board-mobile，另有專屬腳本驗）',
    boardOnMobile === 0,
    `desktopBoard=${boardOnMobile}（main-layout 手機版不渲染 FullScreenTaskView）`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-tasks.png') })

  check('H1 全程 0 個 pageerror', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
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
