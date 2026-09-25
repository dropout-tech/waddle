// Historical probe: use an isolated test project; may write/delete test data.
if (!process.env.E2E_SECONDARY_EMAIL || !process.env.E2E_SECONDARY_PASSWORD) throw new Error('Set E2E_SECONDARY_EMAIL and E2E_SECONDARY_PASSWORD for an isolated test account');
#!/usr/bin/env node
/**
 * 任務重點 board — 大綱 (outline) mode (2026-08-27).
 *
 * The user wrote the format he wanted out by hand. This script checks the
 * screen against his text, literally:
 *
 *   琢奧科技
 *   標題：九豆
 *   當前進展：推動金流物流
 *   任務：
 *   1. …  2. …  3. …
 *
 * A. 大綱 is the default mode on a fresh device (desktop + phone).
 * B. Every entry prints the three labels in his order, verbatim, with EVERY
 *    open task numbered — no 「還有 N 個」 truncation anywhere.
 * C. 標題／當前進展／任務 are exactly the same font size, and nothing on the
 *    board is bigger than that (no 當前重點 headline card in this mode).
 * D. 一覽全部: ONE column top to bottom, one section per workspace, one entry
 *    per card, ZERO tier headings (需要注意／停滯／其他) anywhere on screen.
 * E. A category with no note keeps its 當前進展 row and offers a placeholder;
 *    editing it in place saves on Enter, saves on blur, cancels on Esc.
 * F. Mode switching: 卡片 brings the tiers back *and is never blank* — when
 *    其他 is the only band it starts expanded; 大綱 removes the tiers again.
 * G. Search still filters in 大綱 mode.
 * H. Phone 390: single column, no truncation, no horizontal overflow, task
 *    rows ≥44px.
 * I. English: the three labels are translated, no CJK left on the board.
 * J. Zero pageerror across the whole run.
 *
 * Fixture: THREE synthetic workspaces (琢奧科技 / 夢想一號 / 個人) injected into
 * the workspaces GET, each with 2-3 categories, one of which (課程研發) has no
 * note. The board is curated to exactly these six categories, so the expected
 * section/entry counts are known up front and the real account's own data
 * cannot drift them.
 *
 * DB writes: NONE. Every non-GET to /rest/v1/** is answered with a local fake
 * 200. ONE login for the whole run (Supabase rate-limits repeat logins) —
 * every width is reached with setViewportSize + reload on the same context.
 *
 * Screenshots → docs/reports/2026-08-27-focus-outline-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3161
const BASE = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-27-focus-outline-shots')
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

const ISO = new Date().toISOString()
const dayOffset = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Fixture: three workspaces, straight out of the user's own example ──────
const WS = [
  { id: '00000000-0000-4000-8000-0000000e0001', name: '琢奧科技', color: 'oklch(0.68 0.14 35)', icon: 'briefcase' },
  { id: '00000000-0000-4000-8000-0000000e0002', name: '夢想一號', color: 'oklch(0.65 0.12 230)', icon: 'rocket' },
  { id: '00000000-0000-4000-8000-0000000e0003', name: '個人', color: 'oklch(0.7 0.12 155)', icon: 'user' },
]

/** categoryId → { ws, name, note }. `note: null` ⇒ tests the placeholder row. */
const CATS = [
  { id: '00000000-0000-4000-8000-0000000f0001', ws: 0, name: '九豆', note: '推動金流物流' },
  { id: '00000000-0000-4000-8000-0000000f0002', ws: 0, name: 'Nova air', note: '完成網站前端' },
  { id: '00000000-0000-4000-8000-0000000f0003', ws: 1, name: '師培總監', note: '準備九月檢測' },
  { id: '00000000-0000-4000-8000-0000000f0004', ws: 1, name: '課程研發', note: null },
  { id: '00000000-0000-4000-8000-0000000f0005', ws: 2, name: '學習東西', note: '學習英文' },
  { id: '00000000-0000-4000-8000-0000000f0006', ws: 2, name: '健康管理', note: '每週跑三次' },
]
const CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c]))
const NO_NOTE_CAT = CATS.find((c) => c.note === null)
const NAME = Object.fromEntries(CATS.map((c) => [c.id, c.name]))

/**
 * Tasks per category. Order here is the order they must be numbered in — the
 * urgency ladder below is descending, and none of them are scheduled, so
 * lib/focus.ts's ranking keeps them in this exact sequence.
 * 九豆 carries FIVE open tasks: the tiered modes cap a card at 3, so this is
 * what proves 大綱 lifts the cap instead of printing 「還有 2 個」.
 */
const TASKS = [
  { cat: CATS[0].id, title: '接上藍新金流的定期扣款', urgency: 9 },
  { cat: CATS[0].id, title: '談好宅配的到府取件費率', urgency: 8 },
  { cat: CATS[0].id, title: '把出貨單改成自動列印', urgency: 7 },
  { cat: CATS[0].id, title: '整理上個月的退貨紀錄', urgency: 6 },
  { cat: CATS[0].id, title: '請設計師重畫外箱', urgency: 5 },
  { cat: CATS[1].id, title: '切好首頁的響應式版面', urgency: 9 },
  { cat: CATS[1].id, title: '把產品頁的圖換成新的', urgency: 8 },
  { cat: CATS[1].id, title: '寫聯絡表單的送出流程', urgency: 7 },
  { cat: CATS[2].id, title: '排九月檢測的模擬考', urgency: 9 },
  { cat: CATS[2].id, title: '整理師培講義第三章', urgency: 8 },
  { cat: CATS[2].id, title: '回覆學員的補課申請', urgency: 7 },
  { cat: CATS[3].id, title: '盤點現有教具', urgency: 6 },
  { cat: CATS[3].id, title: '寫下學期課程大綱草稿', urgency: 5 },
  { cat: CATS[4].id, title: '每天背二十個單字', urgency: 8 },
  { cat: CATS[4].id, title: '找一位英文口說夥伴', urgency: 6 },
  { cat: CATS[4].id, title: '看完一部沒有字幕的影集', urgency: 5 },
  { cat: CATS[5].id, title: '禮拜三晚上去跑步', urgency: 6 },
]

const EXPECTED_TASKS = {}
for (const cat of CATS) {
  EXPECTED_TASKS[cat.id] = TASKS.filter((t) => t.cat === cat.id).map((t) => t.title)
}

const FIXTURE_TEXT = [
  ...WS.map((w) => w.name),
  ...CATS.map((c) => c.name),
  ...CATS.map((c) => c.note).filter(Boolean),
  ...TASKS.map((t) => t.title),
].sort((a, b) => b.length - a.length)

const FIXTURE_CARDS = CATS.map((c, i) => ({
  categoryId: c.id,
  sortOrder: i,
  note: c.note ?? undefined,
}))

const plan = { ready: false, userId: null }

const fakeWorkspace = (ws, i) => ({
  id: ws.id,
  user_id: plan.userId,
  name: ws.name,
  color: ws.color,
  icon: ws.icon,
  sort_order: 900 + i,
  is_archived: false,
  is_default: false,
  created_at: ISO,
  updated_at: ISO,
})

const fakeCategory = (cat, i) => ({
  id: cat.id,
  workspace_id: WS[cat.ws].id,
  user_id: plan.userId,
  name: cat.name,
  sort_order: 900 + i,
  is_collapsed: false,
  is_archived: false,
  is_default: false,
  created_at: ISO,
  updated_at: ISO,
})

const fakeTask = (spec, i) => ({
  id: `00000000-0000-4000-8000-0000001a${String(i).padStart(4, '0')}`,
  user_id: plan.userId,
  workspace_id: WS[CAT_BY_ID[spec.cat].ws].id,
  category_id: spec.cat,
  title: spec.title,
  description: null,
  task_type: 'one_time',
  urgency: spec.urgency,
  estimated_minutes: null,
  actual_minutes: null,
  due_date: null,
  scheduled_date: null,
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
})

async function installRoutes(page, state) {
  await page.route('**/rest/v1/workspaces**', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    const response = await route.fetch()
    let body = null
    try { body = await response.json() } catch {}
    if (!Array.isArray(body)) return route.fulfill({ response, json: body })
    const live = body.filter((r) => !r.is_archived)
    state.names.push(...body.map((r) => r.name).filter(Boolean))
    if (live.length > 0) {
      plan.userId = live[0].user_id
      plan.ready = !!plan.userId
    }
    const injected = plan.ready ? WS.map(fakeWorkspace) : []
    await route.fulfill({ response, json: [...body, ...injected] })
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
    await route.fulfill({ response, json: [...body, ...CATS.map(fakeCategory)] })
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

/**
 * The outline, read back as the flat sequence of printed lines it is meant to
 * be: workspace heading, then 標題／當前進展／任務／1./2./3./還有 N 個 per entry.
 */
const readOutline = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-testid="focus-outline"]')
    if (!root) return null
    const sel =
      '[data-outline-row], [data-focus-task-row], [data-outline-remaining], [data-focus-outline-entry] > p:not([data-outline-row])'
    const lines = [...root.querySelectorAll(sel)].map((el) => {
      const row = el.getAttribute('data-outline-row')
      const kind = row
        ? row
        : el.hasAttribute('data-focus-task-row')
          ? 'task'
          : el.hasAttribute('data-outline-remaining')
            ? 'remaining'
            : 'other'
      const r = el.getBoundingClientRect()
      return {
        kind,
        text: el.textContent.replace(/\s+/g, ' ').trim(),
        fontSize: getComputedStyle(el).fontSize,
        x: Math.round(r.x),
        w: Math.round(r.width),
      }
    })
    return {
      lines,
      groups: root.querySelectorAll('[data-focus-outline-group]').length,
      entries: root.querySelectorAll('[data-focus-outline-entry]').length,
      tiers: document.querySelectorAll('[data-focus-tier]').length,
      tierHeadings: [...document.querySelectorAll('[data-focus-tier] h2')].map((h) =>
        h.textContent.trim()
      ),
    }
  })

/** Group the flat line list back into { workspace, entries: [ {title, note, tasks} ] }. */
function structure(lines) {
  const groups = []
  let entry = null
  for (const line of lines) {
    if (line.kind === 'workspace') {
      groups.push({ workspace: line.text, entries: [] })
      entry = null
      continue
    }
    if (line.kind === 'title') {
      entry = { title: line.text, note: null, tasksLabel: null, tasks: [], remaining: null }
      groups[groups.length - 1]?.entries.push(entry)
      continue
    }
    if (!entry) continue
    if (line.kind === 'note') entry.note = line.text
    else if (line.kind === 'tasks') entry.tasksLabel = line.text
    else if (line.kind === 'task') entry.tasks.push(line.text)
    else if (line.kind === 'remaining') entry.remaining = line.text
  }
  return groups
}

const storedDensity = (page) =>
  page.evaluate(() => localStorage.getItem('waddle-focus-density-v1'))

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
      // A virgin device: no stored display-mode preference at all.
      localStorage.removeItem('waddle-focus-density-v1')
      localStorage.removeItem('waddle-focus-tier-other-v1')
      // The board mirrors saves here; a leftover would survive the reloads.
      localStorage.removeItem('waddle-focus-board-v1')
    } catch {}
  })

  const state = { names: [] }
  await installRoutes(page, state)
  // First reload discovers the user id; second runs with the fixture.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(6000)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)

  await page.locator('button[aria-label="展開任務面板"]').first().click()
  await sleep(2500)
  await page.getByRole('button', { name: '任務重點', exact: true }).first().click()
  await sleep(2000)

  // ── A. 大綱 is the default ─────────────────────────────────────────────
  const outlineExists = await page.locator('[data-testid="focus-outline"]').count()
  const pressed = await page.evaluate(() =>
    Object.fromEntries(
      ['outline', 'card', 'compact'].map((k) => [
        k,
        document.querySelector(`[data-testid="focus-density-${k}"]`)?.getAttribute('aria-pressed') ?? 'missing',
      ])
    )
  )
  const density0 = await storedDensity(page)
  check('A1 桌機預設就是大綱模式（未存偏好時）',
    outlineExists === 1 && pressed.outline === 'true' && pressed.card === 'false' &&
      pressed.compact === 'false' && density0 === null,
    `大綱容器=${outlineExists} 切換鈕 aria-pressed=大綱:${pressed.outline}/卡片:${pressed.card}/精簡:${pressed.compact} · localStorage density=${density0}`)

  const out = await readOutline(page)
  const struct = structure(out.lines)

  // ── B. Literal format, in his order ───────────────────────────────────
  const wanted = CATS.map((c) => ({
    ws: WS[c.ws].name,
    title: `標題：${c.name}`,
    note: c.note ? `當前進展：${c.note}` : '當前進展：點一下寫下進展',
    // Every open task, not the top 3.
    tasks: EXPECTED_TASKS[c.id].map((title, i) => `${i + 1}. ${title}`),
  }))
  const flatEntries = struct.flatMap((g) => g.entries.map((e) => ({ ...e, ws: g.workspace })))
  const normTask = (s) => s.replace(/^(\d+)\.\s*/, '$1. ')
  const mismatches = []
  wanted.forEach((w, i) => {
    const got = flatEntries[i]
    if (!got) return mismatches.push(`#${i + 1} 缺這一整段`)
    if (got.ws !== w.ws) mismatches.push(`#${i + 1} 工作區「${got.ws}」≠「${w.ws}」`)
    if (got.title !== w.title) mismatches.push(`#${i + 1} 「${got.title}」≠「${w.title}」`)
    if (got.note !== w.note) mismatches.push(`#${i + 1} 「${got.note}」≠「${w.note}」`)
    if (got.tasksLabel !== '任務：') mismatches.push(`#${i + 1} 任務標籤=「${got.tasksLabel}」`)
    const gotTasks = got.tasks.map(normTask)
    if (gotTasks.join(' | ') !== w.tasks.join(' | '))
      mismatches.push(`#${i + 1} 任務「${gotTasks.join(' | ')}」≠「${w.tasks.join(' | ')}」`)
  })
  const sample = flatEntries[0]
  check('B1 逐字比對：工作區 → 標題：X → 當前進展：Y → 任務： → 1./2./3.',
    mismatches.length === 0 && flatEntries.length === CATS.length,
    mismatches.length
      ? mismatches.slice(0, 4).join(' ／ ')
      : `第一段實際抓到 = 「${sample.ws}」→「${sample.title}」→「${sample.note}」→「${sample.tasksLabel}」→「${sample.tasks.map(normTask).join('」「')}」（共 ${flatEntries.length} 段全數相符）`)

  const nineDou = flatEntries[0]
  const truncationWords = await page.evaluate(() => {
    const board = document.querySelector('[data-testid="focus-board"]')
    const txt = board ? board.innerText : ''
    return {
      hits: (txt.match(/還有/g) ?? []).length,
      more: (txt.match(/\bmore\b/g) ?? []).length,
      remainingNodes: document.querySelectorAll('[data-outline-remaining]').length,
    }
  })
  check('B2 任務不截斷：五個任務就列五條，畫面上沒有「還有」字樣',
    nineDou.tasks.length === 5 && nineDou.remaining === null &&
      truncationWords.hits === 0 && truncationWords.remainingNodes === 0,
    `九豆共 ${EXPECTED_TASKS[CATS[0].id].length} 個任務 → 實際列出 ${nineDou.tasks.length} 條（${nineDou.tasks.map(normTask).join('／')}） · 「還有」出現 ${truncationWords.hits} 次 · 收尾節點 ${truncationWords.remainingNodes} 個`)

  // ── C. Same font size on every level ──────────────────────────────────
  const sizes = ['title', 'note', 'tasks'].map((k) => {
    const hit = out.lines.filter((l) => l.kind === k)
    return { k, sizes: [...new Set(hit.map((l) => l.fontSize))] }
  })
  const allSizes = [...new Set(sizes.flatMap((s) => s.sizes))]
  const taskSizes = [...new Set(out.lines.filter((l) => l.kind === 'task').map((l) => l.fontSize))]
  check('C1 標題／當前進展／任務 三行字級完全相等（不用大小做層次）',
    allSizes.length === 1 && sizes.every((s) => s.sizes.length === 1),
    `標題=${sizes[0].sizes.join(',')} 當前進展=${sizes[1].sizes.join(',')} 任務=${sizes[2].sizes.join(',')}（任務清單本身=${taskSizes.join(',')}）`)

  // ── C2. No 當前重點 headline card, and nothing bigger than body text ───
  const bodyPx = parseFloat(allSizes[0])
  const biggest = await page.evaluate(() => {
    const board = document.querySelector('[data-testid="focus-board"]')
    let max = 0
    let who = ''
    for (const el of board.querySelectorAll('*')) {
      // Only elements that actually paint their own text.
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      if (!own) continue
      const px = parseFloat(getComputedStyle(el).fontSize)
      if (px > max) {
        max = px
        who = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 24)
      }
    }
    const label = [...board.querySelectorAll('*')].filter((el) => {
      const txt = el.textContent.replace(/\s+/g, ' ').trim()
      return txt === '當前重點' || txt === 'CURRENT FOCUS'
    }).length
    return { max, who, focusBlockLabels: label }
  })
  // The old FocusBlock card labels itself with the bare word 當前重點; the new
  // outline row's label carries a colon (當前重點：), so this still isolates
  // the card. Plus: nothing on the board may exceed body size.
  check('C2 大綱模式不渲染「當前重點」大字卡：看板上最大字級＝本文字級',
    biggest.focusBlockLabels === 0 && biggest.max === bodyPx,
    `舊大字卡標籤（無冒號的「當前重點」）節點=${biggest.focusBlockLabels} 個 · 看板最大字級=${biggest.max}px（出現在「${biggest.who}」）vs 大綱本文=${bodyPx}px`)

  // ── D. 一覽全部, no tiers ─────────────────────────────────────────────
  const expectedGroups = new Set(CATS.map((c) => c.ws)).size
  const bannedHeadings = await page.evaluate(() => {
    const words = ['需要注意', '停滯', '其他', '釘選', 'Needs attention', 'Stalled']
    return [...document.querySelectorAll('[data-testid="focus-board"] h2')]
      .map((h) => h.textContent.trim())
      .filter((txt) => words.some((w) => txt === w || txt.startsWith(w)))
  })
  check('D1 一覽全部：工作區段落數＝3、分類區塊數＝6、分層小標數＝0',
    out.groups === expectedGroups && out.entries === CATS.length && out.tiers === 0 &&
      bannedHeadings.length === 0,
    `工作區段落=${out.groups}（預期 ${expectedGroups}：${WS.map((w) => w.name).join('、')}） 分類區塊=${out.entries}（預期 ${CATS.length}） data-focus-tier=${out.tiers} 分層小標=${bannedHeadings.length ? bannedHeadings.join('、') : '無'}`)

  // ── D2. ONE column, workspaces stacked top to bottom ──────────────────
  const layout = await page.evaluate(() =>
    [...document.querySelectorAll('[data-focus-outline-group]')].map((g) => {
      const r = g.getBoundingClientRect()
      const heading = g.querySelector('[data-outline-row="workspace"]')?.textContent.trim()
      return { name: heading, x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width) }
    })
  )
  const colXs = [...new Set(layout.map((c) => c.x))]
  const yAscending = layout.every((c, i) => i === 0 || c.y > layout[i - 1].y)
  check('D2 桌機 1440 單欄：所有工作區左邊界 x 只有一個值，且由上而下 y 遞增',
    colXs.length === 1 && yAscending,
    `工作區左邊界 x 集合={${colXs.join(', process.env.E2E_SECONDARY_EMAIL → ')} · 區塊寬=${[...new Set(layout.map((c) => c.w))].join(',')}px`)

  // ── K. 當前重點 line: same size as the body, above everything ──────────
  const headline = await page.evaluate(() => {
    const row = document.querySelector('[data-outline-row="headline"]')
    const firstWs = document.querySelector('[data-outline-row="workspace"]')
    const btn = row?.querySelector('[data-outline-headline-edit]')
    const b = btn?.getBoundingClientRect()
    return {
      text: row?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      fontSize: row ? getComputedStyle(row).fontSize : null,
      valueFontSize: btn ? getComputedStyle(btn).fontSize : null,
      y: row ? Math.round(row.getBoundingClientRect().y) : null,
      wsY: firstWs ? Math.round(firstWs.getBoundingClientRect().y) : null,
      wsName: firstWs?.textContent.trim() ?? null,
      clickable: !!btn,
      box: b ? `${Math.round(b.width)}×${Math.round(b.height)}` : null,
    }
  })
  check('K1 大綱最上面有「當前重點：」一行，且字級與大綱本文完全相同',
    !!headline.text && headline.text.startsWith('當前重點：') &&
      headline.fontSize === allSizes[0] && headline.valueFontSize === allSizes[0],
    `實際字串=「${headline.text}」 這一行字級=${headline.fontSize}／值=${headline.valueFontSize} vs 大綱本文=${allSizes[0]}`)
  check('K2 位置在第一個工作區大標之上',
    headline.y !== null && headline.wsY !== null && headline.y < headline.wsY,
    `當前重點 y=${headline.y} < 「${headline.wsName}」y=${headline.wsY}`)

  await page.locator('[data-outline-headline-edit]').click()
  await sleep(900)
  const modal = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-modal="true"]')
    return { count: d ? 1 : 0, label: d?.getAttribute('aria-label') ?? null }
  })
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-outline-focus-editor.png') })
  await page.keyboard.press('Escape')
  await sleep(800)
  const afterClose = await page.evaluate(() => ({
    modal: document.querySelectorAll('[role="dialog"][aria-modal="true"]').length,
    outline: document.querySelectorAll('[data-testid="focus-outline"]').length,
    entries: document.querySelectorAll('[data-focus-outline-entry]').length,
  }))
  check('K3 點這一行會開既有的「設定當前重點」視窗，關掉後回到大綱',
    modal.count === 1 && !!modal.label && afterClose.modal === 0 &&
      afterClose.outline === 1 && afterClose.entries === CATS.length,
    `開啟後 dialog=${modal.count}（aria-label=「${modal.label}」）→ Esc 關閉後 dialog=${afterClose.modal}、大綱容器=${afterClose.outline}、分類區塊=${afterClose.entries}`)

  // Drop focus before the hero shot: closing the modal returns focus to the
  // 當前重點 trigger, and its focus ring would read as a box drawn around the
  // line rather than the plain row it is at rest.
  await page.evaluate(() => document.activeElement?.blur())
  await scrollBoard(page, 0)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-outline-top.png') })
  await scrollBoard(page, 'end')
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-outline-bottom.png') })
  await scrollBoard(page, 0)

  // ── E. The note-less category keeps its row ───────────────────────────
  const placeholder = await page.evaluate((catId) => {
    const entry = document.querySelector(`[data-focus-card="${catId}"]`)
    const row = entry?.querySelector('[data-outline-row="note"]')
    const btn = row?.querySelector('[data-outline-note-edit]')
    const b = btn?.getBoundingClientRect()
    return {
      rowText: row?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      clickable: !!btn,
      color: btn ? getComputedStyle(btn).color : null,
      box: b ? `${Math.round(b.width)}×${Math.round(b.height)}` : null,
    }
  }, NO_NOTE_CAT.id)
  check('E1 沒寫進展的分類，「當前進展：」整行仍在，且有可點的淡色提示',
    placeholder.rowText === '當前進展：點一下寫下進展' && placeholder.clickable,
    `「${NO_NOTE_CAT.name}」→「${placeholder.rowText}」 可點=${placeholder.clickable} 提示色=${placeholder.color} box=${placeholder.box}`)

  const noteRow = () =>
    page.evaluate(
      (catId) =>
        document
          .querySelector(`[data-focus-card="${catId}"] [data-outline-row="note"]`)
          ?.textContent.replace(/\s+/g, ' ')
          .trim() ?? null,
      NO_NOTE_CAT.id
    )
  const openNoteEditor = async () => {
    await page.locator(`[data-focus-card="${NO_NOTE_CAT.id}"] [data-outline-note-edit]`).click()
    await sleep(600)
  }

  await openNoteEditor()
  const editorState = await page.evaluate((catId) => {
    const el = document.querySelector(`[data-focus-card="${catId}"] [data-outline-note-input]`)
    const hint = document.querySelector(`[data-focus-card="${catId}"] [data-outline-note-hint]`)
    return {
      count: el ? 1 : 0,
      placeholder: el?.getAttribute('placeholder') ?? null,
      hint: hint?.textContent.trim() ?? null,
    }
  }, NO_NOTE_CAT.id)
  check('E2 點提示 → 就地變成輸入框，且有 placeholder 與存檔方式說明',
    editorState.count === 1 && !!editorState.placeholder && !!editorState.hint,
    `輸入框=${editorState.count} placeholder=「${editorState.placeholder}」 說明=「${editorState.hint}」`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-outline-note-inline-edit.png') })

  // E3/E4/E5 — the three ways out of the editor, each measured before/after.
  const beforeEnter = await noteRow()
  await page.locator(`[data-focus-card="${NO_NOTE_CAT.id}"] [data-outline-note-input]`).fill('Enter 存的進展')
  await page.keyboard.press('Enter')
  await sleep(1200)
  const afterEnter = await noteRow()
  check('E3 Enter 存檔', afterEnter === '當前進展：Enter 存的進展',
    `前=「${beforeEnter}」→ 後=「${afterEnter}」`)

  await openNoteEditor()
  await page.locator(`[data-focus-card="${NO_NOTE_CAT.id}"] [data-outline-note-input]`).fill('這行不該被存下來')
  await page.keyboard.press('Escape')
  await sleep(1200)
  const afterEsc = await noteRow()
  check('E4 Esc 取消，回到原值', afterEsc === afterEnter,
    `編輯前=「${afterEnter}」 輸入「這行不該被存下來」後按 Esc → 「${afterEsc}」`)

  await openNoteEditor()
  await page.locator(`[data-focus-card="${NO_NOTE_CAT.id}"] [data-outline-note-input]`).fill('點別處存的進展')
  // Click a neutral spot on the board — the 分類看板 label.
  await page.locator('[data-testid="focus-board"]').click({ position: { x: 5, y: 5 } })
  await sleep(1200)
  const afterBlur = await noteRow()
  check('E5 點別處（失焦）也會存', afterBlur === '當前進展：點別處存的進展',
    `前=「${afterEsc}」→ 後=「${afterBlur}」`)

  // ── F. Mode switching ─────────────────────────────────────────────────
  await page.locator('[data-testid="focus-density-card"]').click()
  await sleep(900)
  const cardMode = await page.evaluate(() => ({
    tiers: document.querySelectorAll('[data-focus-tier]').length,
    headings: [...document.querySelectorAll('[data-focus-tier] h2')].map((h) => h.textContent.trim()),
    outline: document.querySelectorAll('[data-testid="focus-outline"]').length,
    cards: document.querySelectorAll('[data-focus-card]').length,
    otherExpanded: document
      .querySelector('[data-focus-tier="other"] [aria-expanded]')
      ?.getAttribute('aria-expanded') ?? 'none',
  }))
  check('F1 切到卡片模式 → 分層小標回來，而且畫面不是一片空白',
    cardMode.outline === 0 && cardMode.tiers > 0 && cardMode.headings.length > 0 &&
      cardMode.cards === CATS.length &&
      (cardMode.tiers > 1 || cardMode.otherExpanded === 'true'),
    `分層=${cardMode.tiers} 小標=${cardMode.headings.join('、')} 「其他」aria-expanded=${cardMode.otherExpanded} 可見卡片=${cardMode.cards} 張（預期 ${CATS.length}）`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-card-mode-tiers-back.png') })

  await page.locator('[data-testid="focus-density-outline"]').click()
  await sleep(900)
  const backToOutline = await page.evaluate(() => ({
    tiers: document.querySelectorAll('[data-focus-tier]').length,
    outline: document.querySelectorAll('[data-testid="focus-outline"]').length,
    entries: document.querySelectorAll('[data-focus-outline-entry]').length,
  }))
  const density1 = await storedDensity(page)
  check('F2 切回大綱 → 分層消失、六段全在、偏好寫進 localStorage',
    backToOutline.tiers === 0 && backToOutline.outline === 1 &&
      backToOutline.entries === CATS.length && density1 === 'outline',
    `分層=${backToOutline.tiers} 分類區塊=${backToOutline.entries} density=${density1}`)

  // ── G. Search still filters ───────────────────────────────────────────
  await page.locator('[data-testid="focus-board-search"]').fill('Nova')
  await sleep(1000)
  const searched = await readOutline(page)
  const searchedStruct = structure(searched.lines)
  check('G1 大綱模式下搜尋仍作用：只剩命中的分類，工作區段落跟著收斂',
    searched.entries === 1 && searched.groups === 1 &&
      searchedStruct[0].entries[0].title === '標題：Nova air',
    `搜「Nova」→ 工作區段落=${searched.groups}（${searchedStruct[0]?.workspace}） 分類區塊=${searched.entries}（${searchedStruct[0]?.entries[0]?.title}）`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-outline-search.png') })

  await page.locator('[data-testid="focus-board-search"]').fill('zzzqqq')
  await sleep(900)
  const noMatch = page.locator('[data-testid="focus-board-no-match"]')
  check('G2 大綱模式查無結果仍有空狀態',
    (await noMatch.count()) === 1 &&
      (await noMatch.innerText()).includes('沒有符合的大項目'),
    (await noMatch.count()) ? (await noMatch.innerText()).replace(/\s+/g, ' ') : '沒有空狀態')

  await page.locator('[data-testid="focus-board-search-clear"]').click()
  await sleep(900)
  const cleared = await readOutline(page)
  check('G3 清空搜尋 → 六段全部回來',
    cleared.entries === CATS.length && cleared.groups === expectedGroups && cleared.tiers === 0,
    `分類區塊=${cleared.entries} 工作區段落=${cleared.groups}`)

  // ── I. English ────────────────────────────────────────────────────────
  const stripData = (s) => {
    let out2 = s
    for (const f of FIXTURE_TEXT) out2 = out2.split(f).join('')
    const userStrings = [...state.names, ...(state.taskRows ?? []).map((t) => t.title)].filter(Boolean)
    for (const n of [...new Set(userStrings)].sort((a, b) => b.length - a.length)) {
      out2 = out2.split(n).join('')
    }
    return out2
  }
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  await page.locator('button[aria-label="Expand task panel"]').first().click()
  await sleep(2500)
  await page.getByRole('button', { name: 'Task focus', exact: true }).first().click()
  await sleep(2000)
  const enOut = await readOutline(page)
  const enStruct = structure(enOut.lines)
  const enBoard = stripData(await page.locator('[data-testid="focus-board"]').innerText())
  const enFirst = enStruct[0]?.entries[0]
  const enPlaceholder = enStruct
    .flatMap((g) => g.entries)
    .find((e) => e.note?.startsWith('Current progress:') && !CATS.some((c) => c.note && e.note.includes(c.note)))
  const enHeadline = await page.evaluate(() => {
    const row = document.querySelector('[data-outline-row="headline"]')
    return {
      text: row?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      fontSize: row ? getComputedStyle(row).fontSize : null,
    }
  })
  check('I1 英文版：四個標籤都翻譯、看板無中文殘留',
    !CJK.test(enBoard) &&
      enHeadline.text?.startsWith('Current focus:') &&
      enFirst?.title.startsWith('Title:') &&
      enFirst?.note.startsWith('Current progress:') &&
      enFirst?.tasksLabel === 'Tasks:',
    `頂行=「${enHeadline.text}」(${enHeadline.fontSize}) 第一段=「${enFirst?.title}」「${enFirst?.note}」「${enFirst?.tasksLabel}」 空進展提示=「${enPlaceholder?.note ?? '（找不到）'}」 剝掉資料後殘留=「${enBoard.replace(/\s+/g, ' ').slice(0, 60)}」`)
  await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-outline-en.png') })

  // ── H. Phone 390 ──────────────────────────────────────────────────────
  await page.evaluate(() => {
    localStorage.setItem('waddle-language-v1', 'zh-TW')
    localStorage.removeItem('waddle-focus-density-v1')
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await sleep(9000)
  await page.getByRole('tab', { name: '重點', exact: true }).click()
  await sleep(2500)
  const mOut = await readOutline(page)
  const mStruct = structure(mOut.lines)
  const mPressed = await page.evaluate(() =>
    document.querySelector('[data-testid="focus-density-mobile-outline"]')?.getAttribute('aria-pressed')
  )
  const mGeo = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('[data-focus-outline-group]')]
    const rows = [...document.querySelectorAll('[data-focus-task-row]')]
    const board = document.querySelector('[data-testid="focus-board-mobile"]')
    let max = 0
    for (const el of board.querySelectorAll('*')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      if (own) max = Math.max(max, parseFloat(getComputedStyle(el).fontSize))
    }
    return {
      colXs: [...new Set(groups.map((g) => Math.round(g.getBoundingClientRect().x)))],
      ys: groups.map((g) => Math.round(g.getBoundingClientRect().y + (board?.querySelector('.overflow-y-auto')?.scrollTop ?? 0))),
      groupWidths: [...new Set(groups.map((g) => Math.round(g.getBoundingClientRect().width)))],
      taskRows: rows.length,
      minTaskHeight: rows.length ? Math.min(...rows.map((r) => Math.round(r.getBoundingClientRect().height))) : 0,
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      moreWords: (board.innerText.match(/還有/g) ?? []).length,
      maxFont: max,
      focusBlockLabels: [...board.querySelectorAll('*')].filter(
        (el) => el.textContent.replace(/\s+/g, ' ').trim() === '當前重點'
      ).length,
    }
  })
  check('H1 手機 390：大綱也是預設、單欄、無橫向溢出、任務列 ≥44px',
    mPressed === 'true' && mOut.entries === CATS.length && mOut.tiers === 0 &&
      mGeo.colXs.length === 1 && mGeo.doc <= 390 && mGeo.body <= 390 &&
      mGeo.minTaskHeight >= 44,
    `預設大綱=${mPressed} 分類區塊=${mOut.entries} 分層=${mOut.tiers} 工作區左邊界 x 集合={${mGeo.colXs.join(', ')}}（${mGeo.colXs.length} 個值＝單欄） 區塊寬=${mGeo.groupWidths.join(',')} 任務列=${mGeo.taskRows} 最小列高=${mGeo.minTaskHeight}px doc=${mGeo.doc} body=${mGeo.body}`)
  const mFirst = mStruct[0]?.entries[0]
  check('H2 手機的逐字格式與桌機完全一致，且五個任務全列出、沒有「還有」',
    mFirst?.title === '標題：九豆' && mFirst?.note === '當前進展：推動金流物流' &&
      mFirst?.tasksLabel === '任務：' && mFirst?.tasks.length === 5 && mGeo.moreWords === 0,
    `「${mStruct[0]?.workspace}」→「${mFirst?.title}」→「${mFirst?.note}」→「${mFirst?.tasksLabel}」→ ${mFirst?.tasks.length} 條「${mFirst?.tasks.map(normTask).join('」「')}」·「還有」出現 ${mGeo.moreWords} 次`)
  check('H3 手機大綱最大字級＝本文字級（舊大字卡沒有跑回來）',
    mGeo.focusBlockLabels === 0 && mGeo.maxFont === bodyPx,
    `舊大字卡標籤節點=${mGeo.focusBlockLabels} 個 · 手機看板最大字級=${mGeo.maxFont}px vs 本文=${bodyPx}px`)

  const mHeadline = await page.evaluate(() => {
    const row = document.querySelector('[data-outline-row="headline"]')
    const firstWs = document.querySelector('[data-outline-row="workspace"]')
    const btn = row?.querySelector('[data-outline-headline-edit]')
    const b = btn?.getBoundingClientRect()
    return {
      text: row?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      fontSize: row ? getComputedStyle(row).fontSize : null,
      y: row ? Math.round(row.getBoundingClientRect().y) : null,
      wsY: firstWs ? Math.round(firstWs.getBoundingClientRect().y) : null,
      tapH: b ? Math.round(b.height) : 0,
      tapW: b ? Math.round(b.width) : 0,
    }
  })
  check('H4 手機也有同字級的「當前重點：」一行，在工作區大標之上，點擊區 ≥44px',
    mHeadline.text?.startsWith('當前重點：') && mHeadline.fontSize === `${bodyPx}px` &&
      mHeadline.y < mHeadline.wsY && mHeadline.tapH >= 44 && mGeo.doc <= 390,
    `「${mHeadline.text}」字級=${mHeadline.fontSize}（本文 ${bodyPx}px） y=${mHeadline.y} < 工作區大標 y=${mHeadline.wsY} 點擊區=${mHeadline.tapW}×${mHeadline.tapH}px doc=${mGeo.doc}`)
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-outline-top.png') })
  await scrollBoard(page, 'end')
  await page.screenshot({ path: path.join(SHOTS, 'mobile-390-outline-bottom.png') })

  check('J1 全程 0 個 pageerror', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
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
