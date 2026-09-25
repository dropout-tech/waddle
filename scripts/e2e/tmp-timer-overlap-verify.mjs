#!/usr/bin/env node
/**
 * 浮動專注膠囊 vs. 底下的觸控目標 — 死區歸零驗證（2026-08-26）。
 *
 * 背景：膠囊 `fixed z-toast bottom-6 right-6` 常駐在右下角，在 320 寬的
 * 「任務重點」精簡清單上，會壓住釘選鈕（44×44）上緣 17px、吃掉約 39% 觸控面積。
 * 使用者要保留浮動，所以改的是「什麼時候該讓開」：
 *   1. 捲動中／剛捲完 400ms 內 → pointer-events:none + opacity 0.45
 *   2. 手機休息態縮成「進度環＋時間」，點一下才展開控制，閒置 5 秒收回
 *   3. 收合狀態壓到小控制項（剩餘未遮區塊放不下 44×44）→ 整顆讓開點擊
 *
 * A. 死區歸零：釘選鈕 44×44 取樣 9 點（四角＋中心＋重疊帶三點＋邊中點），
 *    每一點的 elementFromPoint 都必須命中釘選鈕本身或其子元素。
 * B. 捲動穿透：捲動中膠囊中心點打到底下內容、opacity 0.3–0.6；停 400ms 後
 *    同一點回到膠囊本身、opacity 回 1。
 * C. 收合／展開：手機收合寬度 < 改動前的 132px；點一下展開、暫停鈕真的可按
 *    （斷言 aria-label 由「暫停」翻成「繼續」）。
 * D. 回歸：①桌機 1440 膠囊尺寸與位置＝改動前基準（132×46，右/下各 24px；
 *    有子母畫面鈕時 +32px）②modal 開啟時仍閃避到左下 ③完成狀態仍出現。
 * E. i18n：英文版收合膠囊的 aria-label 已翻譯、看板無中文殘留。
 *
 * DB 寫入：無。所有非 GET 的 /rest/v1/** 一律本地假 200。
 * 全程只登入一次（Supabase 會擋短時間重複登入）。
 *
 * 截圖 → docs/reports/2026-08-26-timer-overlap-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3159
const BASE = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-26-timer-overlap-shots')
mkdirSync(SHOTS, { recursive: true })

/** 改動前的膠囊幾何基準。桌機分支的 class 與子元素完全沒動，寬度由 class 決定：
 *  pl-2.5(10) + 環(22) + gap(4) + [ml-0.5(2)+時間 min-w(52)] + 每顆控制鈕(gap 4+28)
 *  + pr-1.5(6) + 左右框線(2) → 三顆控制鈕 194px、含子母畫面鈕四顆 226px；
 *  高度 = py-1.5(6+6) + 控制鈕 h-7(28) + 框線 2 = 42px；bottom-6 right-6 = 各 24px。 */
const FULL_PILL = { w3: 194, w4: 226, height: 42, offset: 24 }

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

// ── Fixture（沿用 tmp-focus-tiers-verify 的攔截寫法） ────────────────────
const ISO = new Date().toISOString()
const dayOffset = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const CATS = [
  '00000000-0000-4000-8000-0000000c0001',
  '00000000-0000-4000-8000-0000000c0002',
  '00000000-0000-4000-8000-0000000c0003',
  '00000000-0000-4000-8000-0000000c0004',
  '00000000-0000-4000-8000-0000000c0005',
  '00000000-0000-4000-8000-0000000c0006',
  '00000000-0000-4000-8000-0000000c0007',
  '00000000-0000-4000-8000-0000000c0008',
]
const NAME = {
  [CATS[0]]: '講師資源站', [CATS[1]]: '暑期營隊', [CATS[2]]: '對外行銷', [CATS[3]]: '合作提案',
  [CATS[4]]: '社群經營', [CATS[5]]: '內部流程', [CATS[6]]: '財務庶務', [CATS[7]]: '自我學習',
}
const TASKS = CATS.map((cat, i) => ({
  cat,
  title: `${NAME[cat]}的下一步`,
  scheduled: i < 3 ? dayOffset(i - 2) : null,
  urgency: 5,
}))
const plan = { ready: false, userId: null, ws: [] }
/** 最後一段才打開：把 onboarding_completed 改成 false 逼導覽出現（不寫 DB）。 */
const tour = { force: false }

function fakeCategory(id, workspaceId, name, sortOrder) {
  return {
    id, workspace_id: workspaceId, user_id: plan.userId, name, sort_order: sortOrder,
    is_collapsed: false, is_archived: false, is_default: false, created_at: ISO, updated_at: ISO,
  }
}
function fakeTask(spec, i) {
  return {
    id: `00000000-0000-4000-8000-0000000d${String(i).padStart(4, '0')}`,
    user_id: plan.userId,
    workspace_id: plan.ws[i % plan.ws.length],
    category_id: spec.cat,
    title: spec.title,
    description: null, task_type: 'one_time', urgency: spec.urgency,
    estimated_minutes: null, actual_minutes: null, due_date: null,
    scheduled_date: spec.scheduled, scheduled_start_time: null, scheduled_end_time: null,
    calendar_color: null, is_completed: false, completed_at: null, is_archived: false,
    archived_at: null, notes: null, show_in_task_list: true, is_meeting: false,
    sort_order: 900 + i, created_at: ISO, updated_at: ISO,
  }
}

async function installRoutes(page) {
  await page.route('**/rest/v1/workspaces**', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    const response = await route.fetch()
    let body = null
    try { body = await response.json() } catch {}
    if (Array.isArray(body)) {
      const live = body.filter((r) => !r.is_archived)
      if (live.length > 0) {
        plan.userId = live[0].user_id
        plan.ws = live.slice(0, 3).map((r) => r.id)
        plan.ready = true
      }
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
    const injected = CATS.map((id, i) => fakeCategory(id, plan.ws[i % plan.ws.length], NAME[id], 900 + i))
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
    await route.fulfill({ response, json: [...body, ...TASKS.map(fakeTask)] })
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
      cards: plan.ready ? CATS.map((id, i) => ({ categoryId: id, sortOrder: i })) : undefined,
    }
    const patch = (row) =>
      row && typeof row === 'object'
        ? { ...row, focus_board: focusBoard, ...(tour.force ? { onboarding_completed: false } : null) }
        : row
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

const box = (b) => (b ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}` : 'null')

/** 膠囊現況：位置、狀態、透明度、是否讓開點擊。 */
const pillInfo = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-waddle-mini-root]')
    if (!root) return null
    const pill = root.querySelector('[data-waddle-mini-pill]') ?? root
    const r = pill.getBoundingClientRect()
    const toggle = root.querySelector('[data-timer-mini-toggle]')
    const tr = toggle?.getBoundingClientRect()
    return {
      hit: tr ? { x: tr.x, y: tr.y, width: tr.width, height: tr.height } : null,
      hitPointerEvents: toggle ? getComputedStyle(toggle).pointerEvents : null,
      x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom,
      state: root.getAttribute('data-timer-mini-state'),
      quiet: root.getAttribute('data-timer-mini-quiet'),
      opacity: parseFloat(getComputedStyle(root).opacity),
      pointerEvents: getComputedStyle(root).pointerEvents,
      controls: [...pill.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')),
      time: root.querySelector('[data-timer-mini-time]')?.textContent?.trim() ?? null,
      floatBtn: !!pill.querySelector('[data-timer-float-toggle]'),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    }
  })

/** 讓收合膠囊的點擊層完整露出來（沒壓到任何小控制項）再操作它。 */
async function ensureTappable(page) {
  for (const frac of [0.5, 0.42, 0.35, 0.28, 0.2, 0.12, 0.65, 0.05, 0.8, 0.95]) {
    await parkBoard(page, frac)
    const ok = await page.evaluate(() => {
      const root = document.querySelector('[data-waddle-mini-root]')
      return root?.getAttribute('data-timer-mini-quiet') === 'off' &&
        !!root.querySelector('[data-timer-mini-toggle]')
    })
    if (ok) return true
  }
  return false
}

/** 把捲動容器停在某個比例位置，等膠囊的捲動穿透期過去。 */
async function parkBoard(page, frac) {
  await page.evaluate((f) => {
    const el = document.querySelector('[data-testid="focus-board-mobile"] .overflow-y-auto')
    if (el) el.scrollTop = el.scrollHeight * f
  }, frac)
  await sleep(1000)
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
      localStorage.removeItem('waddle-focus-density-v1')
      localStorage.removeItem('waddle-focus-tier-other-v1')
    } catch {}
  })
  await installRoutes(page)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(6000)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)

  // ── G1. 桌機閒置啟動鈕（fixed z-40）回歸：計時還沒開始，先量它 ────────
  const launcherDesktop = await page.evaluate(() => {
    const btn = document.querySelector('[data-tour="focus-timer"]')
    const root = btn?.closest('[data-timer-launcher-root]')
    if (!btn || !root) return null
    const r = btn.getBoundingClientRect()
    const rr = root.getBoundingClientRect()
    return {
      box: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`,
      rightGap: Math.round(window.innerWidth - rr.right),
      bottomGap: Math.round(window.innerHeight - rr.bottom),
      quiet: root.getAttribute('data-timer-launcher-quiet'),
      opacity: parseFloat(getComputedStyle(root).opacity),
      pointerEvents: getComputedStyle(root).pointerEvents,
      hitLayer: !!root.querySelector('[data-timer-launch-hit]'),
    }
  })
  check('G1 桌機 1440：閒置計時啟動鈕位置尺寸未變、完全不套讓路邏輯',
    !!launcherDesktop && launcherDesktop.rightGap === 24 && launcherDesktop.bottomGap === 24 &&
      launcherDesktop.quiet === 'off' && launcherDesktop.opacity === 1 &&
      launcherDesktop.pointerEvents === 'auto' && launcherDesktop.hitLayer === false,
    `啟動鈕 box=${launcherDesktop?.box}（bottom-6 right-6 → 右 ${launcherDesktop?.rightGap} 下 ${launcherDesktop?.bottomGap}）` +
      ` quiet=${launcherDesktop?.quiet} opacity=${launcherDesktop?.opacity} pointer-events=${launcherDesktop?.pointerEvents}` +
      ` 透明點擊層=${launcherDesktop?.hitLayer}（桌機應為 false）`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-idle-launcher.png') })

  // ── 起一段計時（桌機起，才會落在 mini 檢視） ───────────────────────────
  await page.locator('[data-tour="focus-timer"]').first().click().catch(() => {})
  await sleep(1200)
  const startBtn = page.getByRole('button', { name: /開始專注/ }).first()
  await startBtn.click()
  await sleep(2500)
  // 若偏好設定是「直接進沉浸畫面」，縮回角落。
  const minimize = page.locator('button[aria-label^="縮小到角落"]').first()
  if (await minimize.count()) {
    await minimize.click()
    await sleep(1200)
  }

  // ── D1. 桌機 1440 回歸 ────────────────────────────────────────────────
  const desktop = await pillInfo(page)
  const expectedWidth = desktop?.floatBtn ? FULL_PILL.w4 : FULL_PILL.w3
  check('D1 桌機 1440：膠囊尺寸與位置與改動前一致（完整控制列、右下各 24px、可點）',
    !!desktop && desktop.state === 'desktop' &&
      Math.round(desktop.width) === expectedWidth && Math.round(desktop.height) === FULL_PILL.height &&
      Math.round(desktop.viewport.w - desktop.right) === FULL_PILL.offset &&
      Math.round(desktop.viewport.h - desktop.bottom) === FULL_PILL.offset &&
      desktop.controls.length >= 3 && desktop.opacity === 1 && desktop.pointerEvents === 'auto',
    `box=${box(desktop)}（基準 ${expectedWidth}×${FULL_PILL.height}，子母畫面鈕=${desktop?.floatBtn}）` +
      ` 右緣間距=${Math.round((desktop?.viewport.w ?? 0) - (desktop?.right ?? 0))} 下緣間距=${Math.round((desktop?.viewport.h ?? 0) - (desktop?.bottom ?? 0))}` +
      ` 控制鈕=${desktop?.controls.join('／')} 狀態=${desktop?.state} 透明度=${desktop?.opacity} pointer-events=${desktop?.pointerEvents}`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-pill.png') })

  // ── 切到手機 320 的「任務重點」精簡清單 ───────────────────────────────
  await page.setViewportSize({ width: 320, height: 568 })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  await page.getByRole('tab', { name: '重點', exact: true }).click()
  await sleep(2000)
  await page.locator('[data-testid="focus-density-mobile-compact"]').click()
  await sleep(1200)

  const collapsed = await pillInfo(page)
  const beforeWidth = desktop?.floatBtn ? FULL_PILL.w4 : FULL_PILL.w3
  check('C1 手機 320 休息態：收合成「進度環＋時間」，明顯窄於改動前的整條膠囊',
    !!collapsed && collapsed.state === 'collapsed' &&
      collapsed.width < beforeWidth - 60 && !!collapsed.time && collapsed.controls.length === 0,
    `box=${box(collapsed)}（改動前 ${beforeWidth}×${FULL_PILL.height}，省下 ${Math.round(beforeWidth - (collapsed?.width ?? 0))}px 寬 ＝ 螢幕寬的 ${Math.round(((beforeWidth - (collapsed?.width ?? 0)) / 320) * 100)}%）` +
      ` 時間文字="${collapsed?.time}" 露出的控制鈕=${collapsed?.controls.length ?? 0} 個`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-320-collapsed.png') })

  // ── A. 死區歸零：釘選鈕 44×44 取樣 ────────────────────────────────────
  let sample = null
  for (const frac of [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1, 0]) {
    await parkBoard(page, frac)
    sample = await page.evaluate(() => {
      const root = document.querySelector('[data-waddle-mini-root]')
      if (!root) return { error: '找不到膠囊' }
      const rr = root.getBoundingClientRect()
      let pin = null
      for (const p of document.querySelectorAll('[data-focus-pin]')) {
        const r = p.getBoundingClientRect()
        if (r.top < rr.bottom && r.bottom > rr.top && r.left < rr.right && r.right > rr.left) { pin = p; break }
      }
      if (!pin) return { overlap: false, pill: `${Math.round(rr.x)},${Math.round(rr.y)} ${Math.round(rr.width)}×${Math.round(rr.height)}` }
      const r = pin.getBoundingClientRect()
      const overlapTop = Math.max(r.top, rr.top)
      const overlapBottom = Math.min(r.bottom, rr.bottom)
      const bandY = Math.round((overlapTop + overlapBottom) / 2)
      // 四角內縮 6px：釘選鈕自己是 rounded-lg，圓角本身就會裁掉 hit-test，
      // 貼著角落取樣量到的是圓角、不是膠囊造成的死區。
      const IN = 6
      const pts = [
        ['左上角', Math.round(r.left + IN), Math.round(r.top + IN)],
        ['右上角', Math.round(r.right - IN), Math.round(r.top + IN)],
        ['左下角', Math.round(r.left + IN), Math.round(r.bottom - IN)],
        ['右下角', Math.round(r.right - IN), Math.round(r.bottom - IN)],
        ['中心', Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)],
        ['重疊帶左', Math.round(r.left + IN), bandY],
        ['重疊帶中', Math.round(r.left + r.width / 2), bandY],
        ['重疊帶右', Math.round(r.right - IN), bandY],
        ['上緣中點', Math.round(r.left + r.width / 2), Math.round(r.top + 2)],
      ]
      const describe = (el) => {
        if (!el) return 'null'
        const tag = el.tagName.toLowerCase()
        const cls = typeof el.className === 'string' && el.className
          ? '.' + el.className.split(' ').slice(0, 2).join('.')
          : ''
        const mark = el.getAttribute?.('data-focus-pin') !== null && el.getAttribute?.('data-focus-pin') !== undefined
          ? '[data-focus-pin]'
          : el.closest?.('[data-focus-pin]') ? '(釘選鈕內)'
          : el.closest?.('[data-waddle-mini-root]') ? '[膠囊]'
          : el.querySelector?.('[data-focus-pin]') ? '(釘選鈕的祖先)'
          : cls
        return `${tag}${mark}`
      }
      const results = pts.map(([name, x, y]) => {
        const el = document.elementFromPoint(x, y)
        const ok = !!el && (el === pin || pin.contains(el))
        return {
          name, x, y, hit: describe(el), ok,
          stack: ok ? null : document.elementsFromPoint(x, y).slice(0, 4).map(describe).join(' > '),
        }
      })
      return {
        overlap: true,
        overlapPx: Math.round(overlapBottom - overlapTop),
        pill: `${Math.round(rr.x)},${Math.round(rr.y)} ${Math.round(rr.width)}×${Math.round(rr.height)}`,
        pin: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`,
        label: pin.getAttribute('aria-label'),
        quiet: root.getAttribute('data-timer-mini-quiet'),
        opacity: parseFloat(getComputedStyle(root).opacity),
        hitBox: (() => {
          const tb = root.querySelector('[data-timer-mini-toggle]')?.getBoundingClientRect()
          return tb ? `${Math.round(tb.x)},${Math.round(tb.y)} ${Math.round(tb.width)}×${Math.round(tb.height)}` : null
        })(),
        hitOverlapsPin: (() => {
          const tb = root.querySelector('[data-timer-mini-toggle]')?.getBoundingClientRect()
          return tb ? tb.top < r.bottom && tb.bottom > r.top && tb.left < r.right && tb.right > r.left : false
        })(),
        pressedBefore: pin.getAttribute('aria-pressed'),
        card: pin.closest('[data-focus-card]')?.getAttribute('data-focus-card'),
        centre: pts[4],
        results,
      }
    })
    if (sample?.overlap) break
  }
  if (sample?.overlap) {
    const allHit = sample.results.every((r) => r.ok)
    check('A1 死區歸零：釘選鈕 44×44 的九個取樣點全部命中按鈕本身（含與膠囊重疊處）',
      allHit,
      `膠囊 box=${sample.pill}／釘選鈕 box=${sample.pin}，垂直重疊 ${sample.overlapPx}px、膠囊狀態=${sample.quiet}（yield=讓開點擊）、opacity=${sample.opacity}\n` +
        sample.results.map((r) => `      ${r.ok ? '✓' : '✗'} ${r.name}(${r.x},${r.y}) → ${r.hit}${r.stack ? `　[堆疊 ${r.stack}]` : ''}`).join('\n'))
    // 真的按下去：不是只看 hit-test，連狀態改變都要看到。
    await page.mouse.click(sample.centre[1], sample.centre[2])
    await sleep(1500)
    const reacted = await page.evaluate((cardId) => {
      const card = document.querySelector(`[data-focus-card="${cardId}"]`)
      return {
        pressed: card?.querySelector('[data-focus-pin]')?.getAttribute('aria-pressed'),
        tier: card?.closest('[data-focus-tier]')?.getAttribute('data-focus-tier') ?? 'gone',
        immersive: !!document.querySelector('[data-testid="focus-timer-immersive"]'),
      }
    }, sample.card)
    check('A2 在重疊位置實際按下滑鼠 → 釘選真的生效（沒有被膠囊吃掉）',
      reacted.pressed === 'true' || reacted.tier === 'pinned',
      `對中心 (${sample.centre[1]},${sample.centre[2]})「${sample.label}」按下 → aria-pressed=${sample.pressedBefore}→${reacted.pressed}、所屬層=${reacted.tier}、計時器是否被誤開=${reacted.immersive}`)
    check('A3 膠囊只讓出被壓到的那一條，其餘部分仍是自己的點擊區（點擊層不與釘選鈕重疊）',
      !sample.hitOverlapsPin,
      `膠囊 ${sample.pill}／可點擊層 ${sample.hitBox ?? '無（整顆純顯示）'}／釘選鈕 ${sample.pin}`)
    await page.screenshot({ path: path.join(SHOTS, 'mobile-320-pin-under-pill.png') })
    // 還原釘選，避免影響後面的量測。
    if (reacted.pressed === 'true' || reacted.tier === 'pinned') {
      await page.locator(`[data-focus-card="${sample.card}"] [data-focus-pin]`).click({ timeout: 8000 }).catch(() => {})
      await sleep(1200)
    }
  } else {
    check('A1 死區歸零：釘選鈕 44×44 取樣', false,
      `八個捲動位置都找不到與膠囊重疊的釘選鈕（膠囊 ${sample?.pill ?? '未找到'}）— 無法驗證`)
    check('A2 在重疊位置實際按下滑鼠 → 釘選真的生效', false, '前一項無法取樣，略過')
    check('A3 膠囊只讓出被壓到的那一條', false, '前一項無法取樣，略過')
  }

  // ── B. 捲動穿透 ───────────────────────────────────────────────────────
  // 先停在一個「膠囊沒有讓路（quiet=off）」的位置，才分得出穿透是捲動造成的。
  let rest = null
  for (const frac of [0.5, 0.42, 0.35, 0.28, 0.2, 0.12, 0.65, 0.05, 0.8, 0.95]) {
    await parkBoard(page, frac)
    rest = await page.evaluate(() => {
      const root = document.querySelector('[data-waddle-mini-root]')
      const r = root.getBoundingClientRect()
      const cx = Math.round(r.left + r.width / 2)
      const cy = Math.round(r.top + r.height / 2)
      const el = document.elementFromPoint(cx, cy)
      return {
        cx, cy,
        quiet: root.getAttribute('data-timer-mini-quiet'),
        opacity: parseFloat(getComputedStyle(root).opacity),
        onPill: !!el && !!el.closest('[data-waddle-mini-root]'),
        hit: el ? el.tagName.toLowerCase() + (el.closest('[data-waddle-mini-root]') ? '[膠囊]' : '') : 'null',
      }
    })
    if (rest.quiet === 'off' && rest.onPill) break
  }
  const scrollProbe = await (async () => {
    const running = page.evaluate(async ({ cx, cy }) => {
    const root = document.querySelector('[data-waddle-mini-root]')
    const el = document.querySelector('[data-testid="focus-board-mobile"] .overflow-y-auto')
    const frame = () => new Promise((res) => requestAnimationFrame(res))
    // 往還有空間的方向捲，才真的會有 scroll 事件（停在底部時 += 是空操作）。
    const room = el ? el.scrollHeight - el.clientHeight : 0
    const startTop = el ? el.scrollTop : 0
    const dir = startTop > room / 2 ? -5 : 5
    let mid = null
    // ~2 秒的慢捲，中途留時間讓外面補一張「捲動中」的截圖。
    for (let i = 0; i < 120; i++) {
      if (el) el.scrollTop += dir
      await frame()
      if (i === 30) {
        const hit = document.elementFromPoint(cx, cy)
        const toggle = root.querySelector('[data-timer-mini-toggle]')
        mid = {
          quiet: root.getAttribute('data-timer-mini-quiet'),
          opacity: parseFloat(getComputedStyle(root).opacity),
          pointerEvents: getComputedStyle(root).pointerEvents,
          hitPointerEvents: toggle ? getComputedStyle(toggle).pointerEvents : null,
          onPill: !!hit && !!hit.closest('[data-waddle-mini-root]'),
          hit: hit
            ? hit.tagName.toLowerCase() +
              (hit.closest('[data-waddle-mini-root]') ? '[膠囊]'
                : hit.closest('[data-focus-card]') ? `[看板卡 ${hit.closest('[data-focus-card]').getAttribute('data-focus-card').slice(-4)}]`
                : '')
            : 'null',
        }
      }
    }
    return { ...(mid ?? {}), found: !!el, startTop, endTop: el ? el.scrollTop : null, dir }
    }, { cx: rest.cx, cy: rest.cy })
    // 捲動途中補一張截圖（膠囊此刻應該是淡的、不吃點擊）。
    await sleep(400)
    await page.screenshot({ path: path.join(SHOTS, 'mobile-320-scrolling.png') })
    return running
  })()
  await sleep(900)
  // 捲完之後底下的內容換人了，所以改測「膠囊自己的點擊區」是否恢復可點。
  const after = await page.evaluate(({ cx, cy }) => {
    const root = document.querySelector('[data-waddle-mini-root]')
    const toggle = root.querySelector('[data-timer-mini-toggle]')
    const tb = toggle?.getBoundingClientRect()
    const tcx = tb ? Math.round(tb.left + tb.width / 2) : cx
    const tcy = tb ? Math.round(tb.top + tb.height / 2) : cy
    const hit = document.elementFromPoint(tcx, tcy)
    const label = (el) => (el ? el.tagName.toLowerCase() + (el.closest('[data-waddle-mini-root]') ? '[膠囊點擊層]' : '') : 'null')
    return {
      tcx, tcy,
      quiet: root.getAttribute('data-timer-mini-quiet'),
      opacity: parseFloat(getComputedStyle(root).opacity),
      hitBox: tb ? `${Math.round(tb.x)},${Math.round(tb.y)} ${Math.round(tb.width)}×${Math.round(tb.height)}` : null,
      hitPointerEvents: toggle ? getComputedStyle(toggle).pointerEvents : null,
      onPill: !!hit && !!hit.closest('[data-waddle-mini-root]'),
      hit: label(hit),
      oldPoint: label(document.elementFromPoint(cx, cy)),
    }
  }, { cx: rest.cx, cy: rest.cy })
  check('B1 捲動中：膠囊位置的點打到底下的內容，不是膠囊',
    !!scrollProbe && !scrollProbe.onPill && scrollProbe.quiet === 'scroll',
    `靜止時 (${rest.cx},${rest.cy}) → ${rest.hit}（quiet=${rest.quiet}）｜捲動中同一點 → ${scrollProbe?.hit}（quiet=${scrollProbe?.quiet}、點擊層 pointer-events=${scrollProbe?.hitPointerEvents}）｜捲動容器 scrollTop ${scrollProbe?.startTop}→${scrollProbe?.endTop}（步進 ${scrollProbe?.dir}）`)
  check('B2 捲動中膠囊仍看得見（opacity 介於 0.3–0.6）',
    !!scrollProbe && scrollProbe.opacity >= 0.3 && scrollProbe.opacity <= 0.6,
    `捲動中 opacity=${scrollProbe?.opacity}`)
  check('B3 停止捲動約 400ms 後恢復可點（膠囊的點擊區又回到自己手上、不再半透明）',
    after.onPill && after.hitPointerEvents === 'auto' && after.opacity > 0.6,
    `停手後點擊區 ${after.hitBox} 的中心 (${after.tcx},${after.tcy}) → ${after.hit}` +
      `（quiet=${after.quiet}、pointer-events=${after.hitPointerEvents}、opacity=${after.opacity}）` +
      `；原取樣點 (${rest.cx},${rest.cy}) 此時是 ${after.oldPoint}（捲動後底下換成別的東西了）`)

  // ── C. 展開與控制 ─────────────────────────────────────────────────────
  await ensureTappable(page)
  await page.locator('[data-timer-mini-toggle]').click()
  await sleep(600)
  const expanded = await pillInfo(page)
  const pauseBtn = page.locator('[data-waddle-mini-pill] button[aria-label="暫停"]')
  const pauseBox = await pauseBtn.boundingBox().catch(() => null)
  check('C2 點一下膠囊 → 展開成完整膠囊（控制鈕出現）',
    expanded.state === 'expanded' && expanded.width > (collapsed?.width ?? 0) + 20 &&
      expanded.controls.some((l) => l === '暫停' || l === '繼續'),
    `box=${box(expanded)} 控制鈕=${expanded.controls.join('／')}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-320-expanded.png') })
  await pauseBtn.click()
  await sleep(900)
  const paused = await pillInfo(page)
  check('C3 展開後的暫停鈕真的可按（狀態由「暫停」變成「繼續」）',
    paused.controls.includes('繼續'),
    `按下前=${expanded.controls.join('／')} → 按下後=${paused.controls.join('／')} 時間=${paused.time}`)
  await page.locator('[data-waddle-mini-pill] button[aria-label="繼續"]').click()
  await sleep(800)
  const resumed = await pillInfo(page)
  check('C4 再按「繼續」→ 計時恢復', resumed.controls.includes('暫停'),
    `控制鈕=${resumed.controls.join('／')} 時間=${resumed.time}`)

  // ── D2. modal 開啟時仍閃避到左下 ──────────────────────────────────────
  const beforeDodge = await pillInfo(page)
  await page.locator('[data-focus-compact-row] button').first().click()
  await sleep(1800)
  const modalOpen = await page.locator('[aria-modal="true"]').count()
  await sleep(700)
  const dodged = await pillInfo(page)
  check('D2 modal 開啟時膠囊仍閃避到左下角（既有 useModalDodge 未被弄壞）',
    modalOpen > 0 && dodged.x < beforeDodge.x && dodged.x <= 24,
    `modal=${modalOpen} 個 · 閃避前 box=${box(beforeDodge)}（右緣 ${Math.round(beforeDodge.right)}）→ 閃避後 box=${box(dodged)}（左緣 ${Math.round(dodged.x)}，視窗寬 320）`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-320-modal-dodge.png') })
  await page.keyboard.press('Escape')
  await sleep(1200)

  // ── E. 英文 ───────────────────────────────────────────────────────────
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  await page.getByRole('tab', { name: 'Focus', exact: true }).click()
  await sleep(2000)
  await ensureTappable(page)
  const enPill = await page.evaluate(() => {
    const root = document.querySelector('[data-waddle-mini-root]')
    const toggle = root?.querySelector('[data-timer-mini-toggle]')
    return {
      region: root?.getAttribute('aria-label') ?? null,
      toggle: toggle?.getAttribute('aria-label') ?? null,
      state: root?.getAttribute('data-timer-mini-state') ?? null,
    }
  })
  check('E1 英文版：收合膠囊的 aria-label 已翻譯、無中文殘留',
    !!enPill.toggle && !CJK.test(enPill.toggle) && !CJK.test(enPill.region ?? ''),
    `region="${enPill.region}" toggle="${enPill.toggle}" 狀態=${enPill.state}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-320-board-en.png') })
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  await page.getByRole('tab', { name: '重點', exact: true }).click()
  await sleep(2000)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-320-board-zh.png') })

  // ── D3. 完成狀態仍會出現（長按結束 0.6 秒） ───────────────────────────
  await ensureTappable(page)
  await page.locator('[data-timer-mini-toggle]').click()
  await sleep(700)
  const stopBox = await page.locator('[data-waddle-mini-pill] button[aria-label^="長按結束"]').boundingBox()
  await page.mouse.move(stopBox.x + stopBox.width / 2, stopBox.y + stopBox.height / 2)
  await page.mouse.down()
  await sleep(1100)
  await page.mouse.up()
  await sleep(1200)
  const completion = await page.evaluate(() => {
    const root = document.querySelector('[data-waddle-mini-root]')
    return {
      region: root?.getAttribute('aria-label') ?? null,
      state: root?.getAttribute('data-timer-mini-state') ?? null,
      text: root?.innerText?.replace(/\s+/g, ' ').trim() ?? null,
      pointerEvents: root ? getComputedStyle(root).pointerEvents : null,
    }
  })
  check('D3 長按結束 → 完成膠囊仍照舊出現（且維持可點）',
    completion.region === '計時完成' && !!completion.text && completion.pointerEvents === 'auto' &&
      completion.state === null,
    `region="${completion.region}" 內容="${completion.text}" pointer-events=${completion.pointerEvents}` +
      `（completion 分支未被改動，所以沒有 data-timer-mini-state：實測=${completion.state}）`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-320-completion.png') })

  // ── G2. 兩顆浮動元件會不會同時出現？ ─────────────────────────────────
  // 計時膠囊由 provider portal 到 body、啟動鈕在 MainLayout 裡，兩者理論上
  // 互斥（focus-timer.tsx 的 `if (ft.state !== 'idle') return null`）。這裡
  // 在剛剛的執行中→完成→閒置整段時間裡各數一次。
  const coexist = await page.evaluate(() => ({
    launcher: document.querySelectorAll('[data-timer-launcher-root] [data-tour="focus-timer"]').length,
    pill: document.querySelectorAll('[data-waddle-mini-root]').length,
  }))
  check('G2 執行中膠囊與閒置啟動鈕不會同時出現（同一角落只有一顆）',
    coexist.launcher + coexist.pill <= 1,
    `目前狀態：啟動鈕=${coexist.launcher} 顆、計時膠囊=${coexist.pill} 顆（計時剛結束、回到閒置）`)

  // ── G3. 新手導覽指向計時器那一步沒被弄壞 ─────────────────────────────
  tour.force = true
  await page.evaluate(() => {
    // 清掉剛剛那段計時留下的待辦（否則「這段做了什麼」彈窗會擋住導覽）。
    for (const k of ['waddle-timer-pending-log-v1', 'waddle-timer-active-session-v1', 'waddle-timer-pending-records-v1']) {
      try { localStorage.removeItem(k) } catch {}
    }
  })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  const dialog = page.locator('[role="dialog"][data-onboarding-tour]')
  let tourStep = null
  if (await dialog.count()) {
    for (let i = 0; i < 30; i++) {
      await sleep(400)
      const title = await dialog.locator('h3').first().innerText().catch(() => '')
      if (title.includes('專注計時器')) {
        tourStep = await page.evaluate(() => {
          const dlg = document.querySelector('[role="dialog"][data-onboarding-tour]')
          const spot = dlg?.firstElementChild
          const btn = document.querySelector('[data-tour="focus-timer"]')
          const root = btn?.closest('[data-timer-launcher-root]')
          if (!spot || !btn) return null
          const s = spot.getBoundingClientRect()
          const b = btn.getBoundingClientRect()
          const cx = Math.round(b.left + b.width / 2)
          const cy = Math.round(b.top + b.height / 2)
          const el = document.elementFromPoint(cx, cy)
          return {
            spot: `${Math.round(s.x)},${Math.round(s.y)} ${Math.round(s.width)}×${Math.round(s.height)}`,
            btn: `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}`,
            covers: s.left <= b.left + 2 && s.top <= b.top + 2 &&
              s.right >= b.right - 2 && s.bottom >= b.bottom - 2 &&
              !(s.width >= window.innerWidth * 0.9 && s.height >= window.innerHeight * 0.9),
            quiet: root?.getAttribute('data-timer-launcher-quiet') ?? null,
            reachable: !!el && (el === btn || btn.contains(el) || el.hasAttribute?.('data-timer-launch-hit')),
            hitTest: el ? el.tagName.toLowerCase() + (el.hasAttribute?.('data-timer-launch-hit') ? '[透明點擊層]' : btn.contains(el) ? '[啟動鈕內]' : '') : 'null',
          }
        })
        break
      }
      const next = dialog.getByRole('button', { name: '下一步' })
      if (!(await next.count())) break
      await next.click()
    }
  }
  check('G3 新手導覽「專注計時器」那一步：聚光燈仍框住啟動鈕，且該點仍點得到它（導覽期間不讓路）',
    !!tourStep && tourStep.covers && tourStep.reachable && tourStep.quiet === 'off',
    tourStep
      ? `聚光燈 ${tourStep.spot} 罩住啟動鈕 ${tourStep.btn}＝${tourStep.covers}；中心點 hit-test=${tourStep.hitTest}；讓路狀態=${tourStep.quiet}（導覽開著時強制 off）`
      : `沒走到「專注計時器」那一步（導覽對話框數=${await dialog.count()}）`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-320-tour-focus-timer.png') })
  await page.keyboard.press('Escape')
  await sleep(600)

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
