import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3168
const BASE = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-09-09-focus-progress-shots')
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
const server = process.env.E2E_BASE_URL ? null : spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
server?.stdout.on('data', () => {})
server?.stderr.on('data', () => {})

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
 * 九豆 carries FIVE open tasks: the compact board shows four by default, so
 * this category exercises both the per-card and board-wide expand/collapse paths.
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
  { cat: CATS[5].id, title: '健康管理：' + 'tracking/'.repeat(22), urgency: 6 },
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

let storedFocus = { enabled: true, global: { mode: 'auto' }, byWorkspace: {}, cards: FIXTURE_CARDS }
let taskRows = TASKS.map(fakeTask)
const writes = []
let failSave = false
let failCreate = false
async function installRoutes(page) {
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request()
    const table = new URL(req.url()).pathname.split('/').pop()
    if (req.method() !== 'GET') {
      const body = req.postDataJSON()
      writes.push({ table, method: req.method(), body })
      if (table === 'user_settings' && body?.focus_board) {
        if (failSave) return route.fulfill({ status: 500, json: { message: 'Synthetic save failure' } })
        storedFocus = body.focus_board
      }
      if (table === 'tasks' && req.method() === 'POST' && failCreate) return route.fulfill({ status: 500, json: { message: 'Synthetic create failure' } })
      if (table === 'tasks' && req.method() === 'POST') taskRows.push({ ...fakeTask(TASKS[0], 999), ...body })
      if (table === 'tasks' && req.method() === 'PATCH') {
        const id = new URL(req.url()).searchParams.get('id')?.replace('eq.', '')
        taskRows = taskRows.map((task) => task.id === id ? { ...task, ...body } : task)
        return route.fulfill({ status: 200, json: taskRows.filter((task) => task.id === id) })
      }
      return route.fulfill({ status: 200, json: [] })
    }
    if (table === 'workspaces') return route.fulfill({ json: WS.map(fakeWorkspace) })
    if (table === 'categories') return route.fulfill({ json: CATS.map(fakeCategory) })
    if (table === 'tasks') return route.fulfill({ json: taskRows })
    if (table === 'user_settings') {
      const response = await route.fetch()
      const body = await response.json()
      const patch = (row) => ({ ...row, focus_board: storedFocus })
      return route.fulfill({ response, json: Array.isArray(body) ? body.map(patch) : patch(body) })
    }
    return route.fulfill({ json: [] })
  })
}
async function openBoard(page) {
  await page.locator('button[aria-label="展開任務面板"]').first().click()
  await page.getByRole('button', { name: '任務重點', exact: true }).first().click()
  await page.locator('[data-focus-card]').first().waitFor()
}
try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(30000)
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(style) }) })
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await installRoutes(page)
  await page.goto(`${BASE}/login`)
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60000 })
  await sleep(4000)
  await page.evaluate(() => { localStorage.setItem('waddle-language-v1', 'zh-TW'); localStorage.removeItem('waddle-focus-board-v1') })
  await page.reload()
  await sleep(4000)
  await openBoard(page)
  const board = page.getByTestId('focus-board')
  const card = page.locator(`[data-focus-card="${CATS[0].id}"]`)
  check('All six categories share the same heading hierarchy', await board.locator('h3').count() === 6)
  check('Compact cards show four tasks by default', await card.locator('li').count() === 4)
  const expandNineBean = card.getByRole('button', { name: '展開其餘 1 個任務' })
  await expandNineBean.click(); await sleep(250)
  check('A category can expand past the four-task preview', await card.locator('li').count() === 5)
  await card.getByRole('button', { name: '只顯示 4 個任務' }).click(); await sleep(250)
  check('A category can return to the four-task preview', await card.locator('li').count() === 4)
  await board.getByRole('button', { name: '全部展開' }).click(); await sleep(250)
  check('Expand all reveals every task in every category', await card.locator('li').count() === 5 && await board.getByRole('button', { name: '全部收起' }).isVisible())
  await board.getByRole('button', { name: '全部收起' }).click(); await sleep(250)
  check('Collapse all hides every task list', await card.locator('li').count() === 0 && await card.getByRole('button', { name: '展開「九豆」任務' }).getAttribute('aria-expanded') === 'false')
  await card.getByRole('button', { name: '展開「九豆」任務' }).click(); await sleep(250)
  check('A collapsed category reopens in the four-task preview', await card.locator('li').count() === 4)
  const search = board.getByRole('textbox', { name: '搜尋分類或任務' })
  await search.fill('請設計師重畫外箱'); await sleep(250)
  check('Search reveals a matching task beyond the four-task preview', await card.getByText('請設計師重畫外箱', { exact: true }).isVisible() && await card.locator('li').count() === 5)
  await search.fill(''); await sleep(250)
  check('Clearing search restores the four-task preview', await card.locator('li').count() === 4)
  check('Legacy status preserved', await card.getByText('推動金流物流', { exact: true }).isVisible())
  await card.getByRole('button', { name: '編輯「九豆」目前狀態' }).click()
  check('Clicking the displayed status opens its editor directly', await card.getByRole('textbox', { name: '自訂狀態' }).isVisible())
  await card.getByRole('textbox', { name: '自訂狀態' }).fill('等待物流商回覆')
  await card.getByRole('button', { name: '儲存', exact: true }).click()
  await sleep(300)
  await card.getByRole('button', { name: '編輯「九豆」備註' }).click()
  check('Clicking the displayed remarks opens its editor directly', await card.getByRole('textbox', { name: '備註' }).isVisible())
  await card.getByRole('textbox', { name: '備註' }).fill('週五追蹤報價\n尚未建立任務')
  await card.getByRole('button', { name: '儲存', exact: true }).click()
  await sleep(500)
  check('Custom status and separate multiline notes persist', storedFocus.cards[0].status.text === '等待物流商回覆' && storedFocus.cards[0].remarks.includes('\n'))
  check('Custom status creates no task by default', !writes.some((w) => w.table === 'tasks' && w.method === 'POST'))
  await page.reload(); await sleep(2000); await openBoard(page)
  check('Settings survive normalization and reload', await card.getByText('等待物流商回覆', { exact: true }).isVisible())
  await card.getByRole('button', { name: '編輯「九豆」備註' }).click()
  check('Clicking the displayed remarks opens the same inline editor', await card.getByRole('textbox', { name: '備註' }).isVisible())
  await card.getByRole('textbox', { name: '備註' }).fill('這段不應該被儲存')
  await card.getByRole('button', { name: '取消', exact: true }).click()
  check('Cancelling direct remarks editing preserves the saved value', storedFocus.cards[0].remarks === '週五追蹤報價\n尚未建立任務' && await card.getByText('週五追蹤報價\n尚未建立任務', { exact: true }).isVisible())
  failCreate = true
  await card.getByRole('button', { name: '將此狀態新增為任務' }).click(); await sleep(600)
  check('Failed conversion keeps custom status and allows retry', await card.getByRole('button', { name: '將此狀態新增為任務' }).isEnabled() && await card.getByText('等待物流商回覆', { exact: true }).isVisible())
  failCreate = false
  await card.getByRole('button', { name: '將此狀態新增為任務' }).click(); await sleep(600)
  check('Explicit conversion inserts into the correct category', writes.filter((w) => w.table === 'tasks' && w.method === 'POST').length === 2 && writes.find((w) => w.table === 'tasks' && w.method === 'POST').body.category_id === CATS[0].id)
  await card.getByRole('button', { name: '將「談好宅配的到府取件費率」設為目前狀態' }).click(); await sleep(400)
  check('Task status stores reference, not a duplicate task', storedFocus.cards[0].status.taskId === taskRows[1].id)
  await card.getByRole('button', { name: '完成「談好宅配的到府取件費率」', exact: true }).click(); await sleep(500)
  check('Completing original task updates the status and progress', await card.getByText('1 / 6 已完成', { exact: true }).isVisible())
  await card.getByRole('button', { name: '展開其餘 1 個任務' }).click(); await sleep(250)
  await card.getByRole('checkbox', { name: '顯示已完成任務' }).check(); await sleep(400)
  check('Completed task can remain visible', await card.getByRole('button', { name: '將「談好宅配的到府取件費率」標為未完成' }).isVisible())
  await card.getByRole('combobox', { name: '「九豆」任務排序' }).selectOption('created'); await sleep(400)
  check('Per-category task order is saved', storedFocus.cards[0].taskSort === 'created')
  await board.getByRole('button', { name: '編輯版面' }).click()
  const modal = page.getByRole('dialog')
  await modal.getByRole('checkbox').first().uncheck()
  await modal.getByRole('button', { name: '儲存', exact: true }).click(); await sleep(400)
  check('Hidden card retains status and remarks', storedFocus.cards.find((c) => c.categoryId === CATS[0].id).hidden && storedFocus.cards.find((c) => c.categoryId === CATS[0].id).remarks.includes('週五'))
  await board.getByRole('button', { name: '編輯版面' }).click()
  await modal.getByRole('checkbox').first().check()
  await modal.getByRole('button', { name: '下移「九豆」' }).click()
  await modal.getByRole('button', { name: '儲存', exact: true }).click(); await sleep(400)
  check('Card ordering is honored without automatic tiers', await board.locator('h3').first().innerText() === 'Nova air')
  await card.getByRole('button', { name: '編輯「九豆」目前狀態' }).click()
  failSave = true
  await card.getByRole('button', { name: '儲存', exact: true }).click(); await sleep(500)
  check('Failed save leaves editor open for retry', await card.getByRole('button', { name: '儲存', exact: true }).isVisible())
  failSave = false
  await card.getByRole('button', { name: '儲存', exact: true }).click(); await sleep(400)
  taskRows = taskRows.filter((task) => task.id !== storedFocus.cards.find((c) => c.categoryId === CATS[0].id).status.taskId)
  await page.reload(); await sleep(2000); await openBoard(page)
  check('Deleted linked task yields explicit unavailable state', await card.getByText('原任務已移動或移除，請重新設定狀態').isVisible())
  await page.screenshot({ path: path.join(SHOTS, 'desktop.png'), fullPage: true })
  await board.getByRole('button', { name: '清單', exact: true }).click()
  check('List layout available', await board.getByRole('button', { name: '清單', exact: true }).getAttribute('aria-pressed') === 'true')
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await sleep(3000)
  const mobileOpen = page.getByRole('tab', { name: '重點', exact: true })
  await mobileOpen.click(); await sleep(500)
  check('Mobile uses same progress board', await page.getByTestId('focus-board-mobile').isVisible())
  const mobileBoard = page.getByTestId('focus-board-mobile')
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    check(`No horizontal overflow at ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: path.join(SHOTS, `mobile-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 320, height: 640 })
  await mobileBoard.getByRole('button', { name: '編輯「Nova air」狀態與備註' }).click()
  const mobileCard = page.locator(`[data-focus-card="${CATS[1].id}"]`)
  const longStatus = '等待合作夥伴確認下階段時程與物流報價'.repeat(4)
  await mobileCard.getByRole('textbox', { name: '自訂狀態' }).fill(longStatus)
  await mobileCard.getByRole('textbox', { name: '備註' }).fill('需要核對的事項\n' + 'https://example.com/' + 'long-path-'.repeat(24))
  check('Mobile text fields avoid iOS focus zoom', await mobileCard.locator('input[type=text], input:not([type]), textarea, select').evaluateAll((els) => els.every((el) => parseFloat(getComputedStyle(el).fontSize) >= 16)))
  await page.setViewportSize({ width: 320, height: 420 })
  await mobileCard.getByRole('button', { name: '儲存', exact: true }).click()
  await mobileCard.locator('form').waitFor({ state: 'detached' })
  check('Status can save with reduced keyboard-like height', await mobileCard.getByText(longStatus, { exact: true }).isVisible())
  await page.setViewportSize({ width: 320, height: 640 })
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px' })
  await mobileCard.scrollIntoViewIfNeeded()
  check('Long mobile content at 150% font stays inside card', await mobileCard.evaluate((el) => el.scrollWidth <= el.clientWidth))
  check('Focus scroller ends above floating timer', await mobileBoard.evaluate((el) => { const timer = document.querySelector('[data-waddle-mini-root]') || [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '專注計時'); return !timer || el.getBoundingClientRect().bottom <= timer.getBoundingClientRect().top }))
  await mobileBoard.screenshot({ path: path.join(SHOTS, 'mobile-long-large-text.png') })
  await page.evaluate(() => { document.documentElement.style.fontSize = '' })
  await mobileBoard.getByRole('button', { name: '編輯版面' }).click()
  const phoneModal = page.getByRole('dialog', { name: '編輯重點版面' })
  for (const height of [640, 420]) {
    await page.setViewportSize({ width: 320, height })
    await sleep(300)
    const save = phoneModal.getByRole('button', { name: '儲存', exact: true })
    check(`Layout editor save is visible and unobstructed at height ${height}`, await save.evaluate((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2); return r.bottom <= innerHeight && r.top >= 0 && (hit === el || el.contains(hit)) }))
    check(`Layout editor has no horizontal overflow at height ${height}`, await phoneModal.evaluate((el) => el.scrollWidth <= el.clientWidth))
    await phoneModal.screenshot({ path: path.join(SHOTS, `mobile-editor-${height}.png`) })
  }
  await phoneModal.getByRole('button', { name: '取消', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => { const board = document.querySelector('[data-testid=focus-board-mobile]'); board.scrollTop = board.scrollHeight })
  await sleep(400)
  const lastTaskButton = mobileBoard.locator('article').last().getByRole('button', { name: /設為目前狀態/ }).last()
  await lastTaskButton.click()
  await sleep(300)
  check('Long linked task status wraps inside mobile card', await mobileBoard.locator('article').last().evaluate((el) => el.scrollWidth <= el.clientWidth))
  await page.evaluate(() => { const board = document.querySelector('[data-testid=focus-board-mobile]'); board.scrollTop = board.scrollHeight })
  check('Last task action can be reached above bottom overlays', await lastTaskButton.evaluate((el) => { const r=el.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return r.bottom <= innerHeight && (hit===el || el.contains(hit)) }))
  await mobileBoard.screenshot({ path: path.join(SHOTS, 'mobile-bottom.png') })
  await page.locator('[data-timer-launch-hit]').click()
  await page.getByRole('button', { name: '開始專注', exact: true }).click()
  await page.getByRole('button', { name: '縮小到角落', exact: true }).click()
  await page.locator('[data-waddle-mini-root]').waitFor()
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px' })
  await sleep(400)
  check('Running timer stays outside focus scroller at 150% font', await mobileBoard.evaluate((el) => el.getBoundingClientRect().bottom <= document.querySelector('[data-waddle-mini-root]').getBoundingClientRect().top))
  await page.screenshot({ path: path.join(SHOTS, 'mobile-running-timer.png'), fullPage: true })
  await page.evaluate(() => { document.documentElement.style.fontSize = '' })

  await page.getByRole('tab', { name: '任務', exact: true }).click()
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; localStorage.setItem('waddle-header-mode', 'compact'); dispatchEvent(new Event('waddle-header-mode-change')) })
  await sleep(600)
  await page.screenshot({ path: path.join(SHOTS, 'narrow-large-text.png'), fullPage: true })
  check('Large-text shortcuts do not break into vertical text', await page.locator('[data-tour=task-shortcut-row]').evaluate((el) => el.scrollWidth <= el.clientWidth))
  check('Enlarged compact header stays inside viewport', await page.locator('[data-tour=left-panel]').evaluate((el) => el.getBoundingClientRect().left >= 0 && el.getBoundingClientRect().right <= innerWidth + 1))
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.reload(); await sleep(2500)
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; const panel = document.querySelector('[data-tour=left-panel]'); panel.parentElement.style.width = '300px' })
  await sleep(600)
  await page.locator('[data-tour=left-panel]').screenshot({ path: path.join(SHOTS, 'desktop-narrow-large-text.png') })
  check('Desktop narrow shortcuts wrap cleanly', await page.locator('[data-tour=task-shortcut-row]').evaluate((el) => el.scrollWidth <= el.clientWidth))
  check('No uncaught browser errors', pageErrors.length === 0, pageErrors.join('; '))
} catch (error) { failed++; console.error(error) }
finally {
  await browser?.close()
  try { if (server) process.kill(-server.pid, 'SIGTERM') } catch {}
  console.log(JSON.stringify({ passed, failed, writes: writes.length }))
  process.exitCode = failed ? 1 : 0
}
