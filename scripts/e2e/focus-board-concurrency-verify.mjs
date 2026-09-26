import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

// Targeted regression test for the two focus-board risks flagged in review:
// 1) A card mid-save must not silently drop another card's edit (focus-board.tsx update()).
// 2) A draft must survive the tab being hidden/closed mid-edit (pagehide/visibilitychange).
const PORT = 3170
const BASE = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-09-26-focus-concurrency-shots')
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

const WS = [
  { id: '00000000-0000-4000-8000-0000000e0001', name: '琢奧科技', color: 'oklch(0.68 0.14 35)', icon: 'briefcase' },
]
const CATS = [
  { id: '00000000-0000-4000-8000-0000000f0001', ws: 0, name: '九豆', note: '推動金流物流' },
  { id: '00000000-0000-4000-8000-0000000f0002', ws: 0, name: 'Nova air', note: '完成網站前端' },
]
const CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c]))

const fakeWorkspace = (ws, i) => ({
  id: ws.id, user_id: plan.userId, name: ws.name, color: ws.color, icon: ws.icon,
  sort_order: 900 + i, is_archived: false, is_default: false, created_at: ISO, updated_at: ISO,
})
const fakeCategory = (cat, i) => ({
  id: cat.id, workspace_id: WS[cat.ws].id, user_id: plan.userId, name: cat.name,
  sort_order: 900 + i, is_collapsed: false, is_archived: false, is_default: false, created_at: ISO, updated_at: ISO,
})

const FIXTURE_CARDS = CATS.map((c, i) => ({ categoryId: c.id, sortOrder: i, note: c.note ?? undefined }))

const plan = { ready: false, userId: null }
let storedFocus = { enabled: true, global: { mode: 'auto' }, byWorkspace: {}, cards: FIXTURE_CARDS }
const writes = []
let delayMs = 0
async function installRoutes(page) {
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request()
    const table = new URL(req.url()).pathname.split('/').pop()
    if (req.method() !== 'GET') {
      const body = req.postDataJSON()
      if (table === 'user_settings' && body?.focus_board && delayMs > 0) await sleep(delayMs)
      writes.push({ table, method: req.method(), body, ts: Date.now() })
      if (table === 'user_settings' && body?.focus_board) storedFocus = body.focus_board
      return route.fulfill({ status: 200, json: [] })
    }
    if (table === 'workspaces') return route.fulfill({ json: WS.map(fakeWorkspace) })
    if (table === 'categories') return route.fulfill({ json: CATS.map(fakeCategory) })
    if (table === 'tasks') return route.fulfill({ json: [] })
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
  const cardA = page.locator(`[data-focus-card="${CATS[0].id}"]`)
  const cardB = page.locator(`[data-focus-card="${CATS[1].id}"]`)

  // ── Test 1: A saving must not drop B's concurrent edit ─────────────────
  // Real Playwright clicks are separate CDP round-trips, so by the time a
  // second click reaches the page, React has already re-rendered with
  // `saving=true` and disabled every other card's controls — the race can
  // never be observed that way. To actually land in the same JS turn A's
  // blur/save starts in (before the queue's microtask flips `saving`), we
  // drive both cards from inside one page.evaluate() using native DOM
  // dispatch. That reproduces the exact ordering the review flagged:
  // A's onBlur fires synchronously, suspends at `await onUpdate(...)`
  // (nothing runs yet — `.then()` only schedules a microtask), and B's
  // click handler still runs in that same task, before `saving` flips.
  delayMs = 1500
  const beforeWrites = writes.length
  const raced = await page.evaluate(async ({ catA, catB }) => {
    function setNativeValue(el, value) {
      const proto = Object.getPrototypeOf(el)
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    }
    const tick = () => new Promise((r) => setTimeout(r, 0))
    const cardA = document.querySelector(`[data-focus-card="${catA}"]`)
    const cardB = document.querySelector(`[data-focus-card="${catB}"]`)
    const inputA = cardA.querySelector('textarea[aria-label="「九豆」備註"]')
    const inputB = cardB.querySelector('textarea[aria-label="「Nova air」備註"]')
    inputA.focus()
    await tick()
    setNativeValue(inputA, 'A卡併發測試')
    inputA.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
    // Blur A synchronously — fires its onBlur -> save() -> suspends at the
    // `await onUpdate(...)` without yielding a microtask checkpoint yet.
    // Still the same task: focus B before the queue's `.then()` (which sets
    // `saving`) has had a chance to run.
    inputA.blur()
    inputB.focus()
    const bFoundImmediately = !!inputB
    const bDisabledImmediately = inputB?.disabled ?? null
    await tick()
    const bOpenedWhileAUnresolved = !!inputB && !inputB.disabled && document.activeElement === inputB
    if (bOpenedWhileAUnresolved) {
      setNativeValue(inputB, 'B卡併發測試')
      inputB.dispatchEvent(new Event('input', { bubbles: true }))
      await tick()
      inputB.blur()
    }
    return { bOpenedWhileAUnresolved, hadInputB: !!inputB, bFoundImmediately, bDisabledImmediately }
  }, { catA: CATS[0].id, catB: CATS[1].id })
  check('B\'s remarks stay editable (not disabled) in the same turn A\'s save starts', raced.bOpenedWhileAUnresolved, JSON.stringify(raced))
  // Give the serial queue time to flush both writes (A's 1.5s delay + B's).
  await sleep(4000)
  delayMs = 0
  check(
    'Both A and B edits are present after the queue flushes (no silent drop)',
    storedFocus.cards[0]?.remarks === 'A卡併發測試' && storedFocus.cards[1]?.remarks === 'B卡併發測試',
    `A=${JSON.stringify(storedFocus.cards[0]?.remarks)} B=${JSON.stringify(storedFocus.cards[1]?.remarks)}`,
  )
  check('At least two focus_board writes landed (queued, not dropped)', writes.length - beforeWrites >= 2, `writes=${writes.length - beforeWrites}`)

  // ── Test 2: hidden tab must persist an in-progress draft ───────────────
  await page.reload()
  await sleep(3000)
  await openBoard(page)
  await cardA.getByRole('textbox', { name: '「九豆」備註' }).click()
  await cardA.getByRole('textbox', { name: '「九豆」備註' }).fill('草稿未存檔就切走')
  const beforeHideWrites = writes.length
  // Read localStorage inside the SAME evaluate call, right after dispatch —
  // persistDraft() writes it synchronously before its fire-and-forget
  // save() call, and that save (against the unmocked-delay route) can
  // resolve and clearDraft() fast enough to race a separate round-trip.
  const draftRaw = await page.evaluate((catId) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    return localStorage.getItem(`waddle-focus-draft-v1:${catId}`)
  }, CATS[0].id)
  check('Draft is persisted to localStorage when the tab is hidden mid-edit', !!draftRaw && JSON.parse(draftRaw).remarks === '草稿未存檔就切走', draftRaw ?? 'null')
  await sleep(500)
  check('Hiding the tab also attempts a best-effort save', writes.length > beforeHideWrites)

  // Reload (simulating reopening after the tab/app was closed) and confirm
  // the draft is restored into the editor with a toast, then clears once saved.
  // Leave the editor first: a still-focused draft would be re-persisted by
  // pagehide during the reload below and overwrite the seeded draft.
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.activeElement?.blur() })
  await sleep(500)
  await page.evaluate(({ catA, catB }) => {
    // Re-seed localStorage since the best-effort save above may have already
    // cleared it after succeeding — we specifically want to verify recovery
    // when the flush never reached the server. Card B carries a legacy draft
    // from the removed status editor: it must be discarded without errors.
    localStorage.setItem(`waddle-focus-draft-v1:${catA}`, JSON.stringify({ editing: 'remarks', remarks: '復原草稿測試', ts: Date.now() }))
    localStorage.setItem(`waddle-focus-draft-v1:${catB}`, JSON.stringify({ editing: 'status', mode: 'text', taskId: '', text: '舊狀態草稿', remarks: 'B卡併發測試', ts: Date.now() }))
  }, { catA: CATS[0].id, catB: CATS[1].id })
  await page.reload()
  await sleep(3000)
  await openBoard(page)
  const restoredTextbox = cardA.getByRole('textbox', { name: '「九豆」備註' })
  await sleep(800) // restore runs in a post-mount effect
  const dbg = await page.evaluate((catA) => ({ ls: localStorage.getItem(`waddle-focus-draft-v1:${catA}`), vals: [...document.querySelectorAll('textarea[data-focus-remarks]')].map((e) => e.value) }), CATS[0].id)
  check('Draft is restored into the inline remarks on next load', await restoredTextbox.inputValue().catch(() => '') === '復原草稿測試', JSON.stringify(dbg))
  check('Legacy status-editor draft is discarded quietly', await page.evaluate((catB) => localStorage.getItem(`waddle-focus-draft-v1:${catB}`), CATS[1].id) === null && await cardB.getByText('舊狀態草稿').count() === 0)
  await page.screenshot({ path: path.join(SHOTS, 'draft-restored.png'), fullPage: true })
  await cardA.getByRole('button', { name: '儲存', exact: true }).click(); await sleep(500)
  check('Restored draft saves via the explicit save button', storedFocus.cards[0]?.remarks === '復原草稿測試' && await page.evaluate((catA) => localStorage.getItem(`waddle-focus-draft-v1:${catA}`), CATS[0].id) === null)
  check('No uncaught browser errors', pageErrors.length === 0, pageErrors.join('; '))
} catch (error) { failed++; console.error(error) }
finally {
  await browser?.close()
  try { if (server) process.kill(-server.pid, 'SIGTERM') } catch {}
  console.log(JSON.stringify({ passed, failed, writes: writes.length }))
  process.exitCode = failed ? 1 : 0
}
