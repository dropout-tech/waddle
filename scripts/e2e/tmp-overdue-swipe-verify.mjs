#!/usr/bin/env node
/**
 * Verifies the new four-way swipe on the overdue review card
 * (components/task-panel/overdue-task-review.tsx, mobile only):
 *   right = mark complete, left = return to backlog,
 *   up    = reschedule to today, down = archive.
 *
 * Never touches real DB rows. We intercept `**\/rest/v1/tasks**`:
 *   - GET  -> the real response, plus 4 synthetic overdue tasks appended
 *            (attached to the account's first real category so the mapper
 *            can resolve workspace/category names).
 *   - PATCH/POST/DELETE -> recorded and faked with 200; nothing reaches
 *            Supabase. Recorded PATCH bodies ARE the assertion: we check the
 *            exact columns each gesture writes.
 *
 * Gestures are dispatched as real touch input via CDP
 * (Input.dispatchTouchEvent), because the component deliberately ignores
 * pointerType === 'mouse'.
 *
 * Run: node scripts/e2e/tmp-overdue-swipe-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3107
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const SHOT_DIR = '/private/tmp/claude-501/-Users-lazylazy-Desktop------v0-task-management-ui/96d247f8-a5ce-44cb-8e8b-cacbfc24ca5e/scratchpad/overdue-swipe'
mkdirSync(SHOT_DIR, { recursive: true })

function loadEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const envFile = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || envFile.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || envFile.E2E_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('[overdue-swipe] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
  process.exit(1)
}

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const TODAY = iso(new Date())
const PAST = iso(new Date(Date.now() - 5 * 86400000))

const TASK_IDS = {
  right: '11111111-1111-4111-8111-111111111111',
  left: '22222222-2222-4222-8222-222222222222',
  up: '33333333-3333-4333-8333-333333333333',
  down: '44444444-4444-4444-8444-444444444444',
}
// Sorted by sort_order so the card order is deterministic: right, left, up, down.
const TITLES = {
  right: 'SWIPE-A 右滑完成',
  left: 'SWIPE-B 左滑回任務欄',
  up: 'SWIPE-C 上滑排今天',
  down: 'SWIPE-D 下滑封存',
}

let devServer
let exitCode = 0
const results = []
const pageErrors = []
const writes = []

async function waitForServerReady(timeoutMs = 90000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE_URL)
      if (res.status < 500) return
    } catch {}
    await sleep(500)
  }
  throw new Error(`Dev server did not become ready within ${timeoutMs}ms`)
}
function startDevServer() {
  devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
    cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  devServer.stdout.on('data', (d) => process.stdout.write(`[next dev] ${d}`))
  devServer.stderr.on('data', (d) => process.stderr.write(`[next dev] ${d}`))
}
function stopDevServer() {
  if (!devServer || !devServer.pid) return
  try { process.kill(-devServer.pid, 'SIGTERM') } catch { try { devServer.kill('SIGTERM') } catch {} }
}

async function step(name, fn) {
  try {
    await fn()
    results.push({ name, passed: true })
    console.log(`PASS — ${name}`)
  } catch (e) {
    results.push({ name, passed: false, note: e.message })
    console.log(`FAIL — ${name} — ${e.message}`)
    exitCode = 1
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

async function login(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    try {
      await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
      return
    } catch {
      console.log(`   [login] attempt ${attempt} did not land on '/', url = ${page.url()}`)
    }
  }
  throw new Error(`login did not reach '/' after 3 attempts, stuck at ${page.url()}`)
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    locale: 'zh-TW',
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  // The Next dev-tools indicator is a fixed portal sitting on the bottom-left
  // tab (dev build only, absent in production) — it swallows the tab click.
  await page.addInitScript(() => {
    const hide = () => {
      const style = document.createElement('style')
      style.textContent = 'nextjs-portal{display:none!important}'
      document.head?.appendChild(style)
    }
    if (document.head) hide()
    else document.addEventListener('DOMContentLoaded', hide)
  })

  // --- interception ------------------------------------------------------
  // Installed only AFTER login: routing the Supabase REST calls during the
  // auth handshake destabilises the redirect to '/'.
  let seedCategory = null
  const injected = new Map()

  const installRoutes = async () => {
  await page.route('**/rest/v1/categories**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue().catch(() => {})
    const response = await route.fetch()
    let body = null
    try { body = await response.json() } catch {}
    if (Array.isArray(body) && body.length && !seedCategory) {
      const row = body.find((c) => !c.is_archived) || body[0]
      seedCategory = { id: row.id, workspace_id: row.workspace_id, user_id: row.user_id }
    }
    await route.fulfill({ response, json: body })
  })

  await page.route('**/rest/v1/tasks**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS' || req.method() === 'HEAD') return route.continue().catch(() => {})
    if (req.method() === 'GET') {
      const response = await route.fetch()
      let body = null
      try { body = await response.json() } catch {}
      if (!Array.isArray(body)) return route.fulfill({ response, json: body })
      if (seedCategory && injected.size === 0) {
        let order = 900
        for (const key of ['right', 'left', 'up', 'down']) {
          injected.set(TASK_IDS[key], {
            id: TASK_IDS[key],
            user_id: seedCategory.user_id,
            workspace_id: seedCategory.workspace_id,
            category_id: seedCategory.id,
            title: TITLES[key],
            description: null,
            task_type: 'one_time',
            urgency: 5,
            estimated_minutes: null,
            actual_minutes: null,
            due_date: null,
            scheduled_date: PAST,
            scheduled_start_time: null,
            scheduled_end_time: null,
            calendar_color: '#8b5cf6',
            is_completed: false,
            completed_at: null,
            is_archived: false,
            archived_at: null,
            notes: null,
            show_in_task_list: true,
            is_meeting: false,
            sort_order: order++,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }
      }
      await route.fulfill({ response, json: [...body, ...injected.values()] })
      return
    }
    // Any write: record it, apply it to our in-memory row so a refetch stays
    // consistent, and never forward it to Supabase.
    let payload = null
    try { payload = req.postDataJSON() } catch {}
    const idMatch = /id=eq\.([0-9a-f-]+)/i.exec(req.url())
    const id = idMatch ? idMatch[1] : null
    writes.push({ method: req.method(), id, payload })
    let merged = null
    if (id && injected.has(id) && payload && typeof payload === 'object') {
      merged = { ...injected.get(id), ...payload }
      injected.set(id, merged)
    }
    // PostgREST semantics: `Prefer: return=representation` wants the row back,
    // otherwise 204 No Content. Faking a bare `[]` makes supabase-js treat the
    // write as a failure, which rolls the optimistic update back.
    const prefer = req.headers()['prefer'] || ''
    if (prefer.includes('return=representation')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(merged ? [merged] : []),
      })
    } else {
      await route.fulfill({ status: 204, body: '' })
    }
  })
  }

  const cdp = await context.newCDPSession(page)
  const swipe = async (from, dx, dy, steps = 14) => {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }],
    })
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps, id: 1 }],
      })
      await sleep(14)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  const currentCardTitle = async () =>
    (await page.locator('h3').filter({ hasText: 'SWIPE-' }).first().innerText()).trim()

  const cardBox = async () => {
    const box = await page.locator('h3').filter({ hasText: 'SWIPE-' }).first().boundingBox()
    assert(box, 'review card not found')
    console.log(`   [card] now showing: ${await currentCardTitle()}`)
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  const writesFor = (id) => writes.filter((w) => w.id === id && w.method === 'PATCH')

  try {
    await step('login (390×844, touch)', async () => { await login(page) })

    await step('reload so injected overdue tasks are fetched', async () => {
      await installRoutes()
      await page.reload({ waitUntil: 'commit', timeout: 60000 })
      await page.waitForTimeout(9000)
      assert(seedCategory, 'no category row captured — cannot inject tasks')
      assert(injected.size === 4, `expected 4 injected tasks, got ${injected.size}`)
    })

    await step('open review sheet from the task panel 待整理 chip', async () => {
      await page.screenshot({ path: path.join(SHOT_DIR, '00-before-tab.png') })
      const tabs = page.getByRole('tab')
      console.log('   [diag] tabs:', await tabs.count(), JSON.stringify(await tabs.allInnerTexts()))
      const tasksTab = tabs.filter({ hasText: '任務' }).first()
      const box = await tasksTab.boundingBox()
      console.log('   [diag] tasks tab box:', JSON.stringify(box))
      console.log('   [diag] topmost at tab centre:', await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y)
        return el ? `${el.tagName}.${el.className}`.slice(0, 160) : 'none'
      }, [box.x + box.width / 2, box.y + box.height / 2]))
      await tasksTab.click({ timeout: 8000 })
      await page.waitForTimeout(1200)
      const action = page.getByRole('button', { name: /整理 \d+ 個待處理任務/ }).first()
      await action.waitFor({ state: 'visible', timeout: 10000 })
      await action.click()
      await page.getByRole('button', { name: '逐一整理' }).waitFor({ state: 'visible', timeout: 10000 })
    })

    await step('deployed bundle carries the new swipe UI', async () => {
      await page.getByRole('button', { name: '逐一整理' }).click()
      await page.locator('h3', { hasText: TITLES.right }).waitFor({ state: 'visible', timeout: 8000 })
      const text = await page.evaluate(() => document.body.innerText)
      assert(text.includes('滑動卡片：右＝完成'), 'swipe hint missing — still serving the old build?')
      assert(text.includes('排今天'), '排今天 button missing — still serving the old build?')
    })

    await step('enter card mode — first card is SWIPE-A', async () => {
      await page.locator('h3', { hasText: TITLES.right }).waitFor({ state: 'visible', timeout: 8000 })
      await page.screenshot({ path: path.join(SHOT_DIR, '01-card.png') })
    })

    await step('every action button ≥ 44px tall, no horizontal overflow', async () => {
      for (const label of ['標記為已完成', '排今天', '移回任務欄', '取消並封存']) {
        const box = await page.getByRole('button', { name: new RegExp(label) }).first().boundingBox()
        assert(box, `button not found: ${label}`)
        assert(box.height >= 44, `${label} is only ${Math.round(box.height)}px tall`)
      }
      const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth)
      assert(overflow <= 0, `body overflows horizontally by ${overflow}px`)
    })

    await step('mid-drag overlay names the pending decision', async () => {
      const from = await cardBox()
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] })
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + i * 8, y: from.y, id: 1 }] })
        await sleep(14)
      }
      await page.screenshot({ path: path.join(SHOT_DIR, '02-drag-right.png') })
      const overlayVisible = await page.locator('span', { hasText: /^標記為已完成$/ }).last().isVisible()
      const shifted = await page.evaluate((title) => {
        const h3 = [...document.querySelectorAll('h3')].find((el) => el.textContent?.includes(title))
        const card = h3?.parentElement
        return card ? new DOMMatrix(getComputedStyle(card).transform).m41 : 0
      }, TITLES.right)
      // release without committing
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + 20, y: from.y, id: 1 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(400)
      assert(overlayVisible, 'swipe overlay label not visible mid-drag')
      assert(shifted > 40, `card only moved ${Math.round(shifted)}px with the finger`)
    })

    await step('short drag (< threshold) does NOT write anything', async () => {
      assert(writes.length === 0, `expected no writes yet, got ${JSON.stringify(writes)}`)
      await page.locator('h3', { hasText: TITLES.right }).waitFor({ state: 'visible', timeout: 5000 })
    })

    await step('swipe RIGHT → marks complete, advances to SWIPE-B', async () => {
      await swipe(await cardBox(), 170, 0)
      await page.waitForTimeout(1500)
      await page.screenshot({ path: path.join(SHOT_DIR, '02b-after-right.png') })
      await page.locator('h3', { hasText: TITLES.left }).waitFor({ state: 'visible', timeout: 8000 })
      const w = writesFor(TASK_IDS.right)
      assert(w.length === 1, `expected 1 PATCH for SWIPE-A, got ${w.length}`)
      assert(w[0].payload?.is_completed === true, `payload was ${JSON.stringify(w[0].payload)}`)
    })

    await step('swipe LEFT → clears dates, advances to SWIPE-C', async () => {
      await swipe(await cardBox(), -170, 0)
      await page.waitForTimeout(1500)
      await page.locator('h3', { hasText: TITLES.up }).waitFor({ state: 'visible', timeout: 8000 })
      const w = writesFor(TASK_IDS.left)
      assert(w.length === 1, `expected 1 PATCH for SWIPE-B, got ${w.length}`)
      const p = w[0].payload ?? {}
      assert(p.scheduled_date === null || p.scheduled_date === '', `scheduled_date was ${JSON.stringify(p.scheduled_date)}`)
      assert(p.due_date === null || p.due_date === '', `due_date was ${JSON.stringify(p.due_date)}`)
      assert(p.show_in_task_list === true, `show_in_task_list was ${JSON.stringify(p.show_in_task_list)}`)
    })

    await step('swipe UP → reschedules to today, advances to SWIPE-D', async () => {
      await swipe(await cardBox(), 0, -170)
      await page.waitForTimeout(1500)
      await page.locator('h3', { hasText: TITLES.down }).waitFor({ state: 'visible', timeout: 8000 })
      const w = writesFor(TASK_IDS.up)
      assert(w.length === 1, `expected 1 PATCH for SWIPE-C, got ${w.length}`)
      assert(w[0].payload?.scheduled_date === TODAY, `scheduled_date was ${JSON.stringify(w[0].payload?.scheduled_date)} (want ${TODAY})`)
    })

    await step('swipe DOWN → archives, list is empty', async () => {
      await swipe(await cardBox(), 0, 170)
      await page.waitForTimeout(1500)
      await page.getByText('都整理好了').first().waitFor({ state: 'visible', timeout: 8000 })
      const w = writesFor(TASK_IDS.down)
      assert(w.length === 1, `expected 1 PATCH for SWIPE-D, got ${w.length}`)
      assert(w[0].payload?.is_archived === true, `payload was ${JSON.stringify(w[0].payload)}`)
      await page.screenshot({ path: path.join(SHOT_DIR, '03-done.png') })
    })

    await step('English pass at 375×667 — new strings are translated', async () => {
      injected.clear()
      await page.setViewportSize({ width: 375, height: 667 })
      await page.evaluate(() => window.localStorage.setItem('waddle-language-v1', 'en'))
      await page.reload({ waitUntil: 'commit', timeout: 60000 })
      await page.waitForTimeout(9000)
      assert(injected.size === 4, `re-injection failed, got ${injected.size}`)
      await page.getByRole('tab', { name: 'Tasks', exact: true }).first().click()
      await page.waitForTimeout(1200)
      await page.getByRole('button', { name: /Review \d+ past tasks/ }).first().click()
      await page.getByRole('button', { name: 'Review one by one' }).first().click()
      await page.locator('h3', { hasText: TITLES.right }).waitFor({ state: 'visible', timeout: 8000 })
      const text = await page.evaluate(() => document.body.innerText)
      for (const phrase of ['Do it today', 'Reschedule to today', 'Swipe the card', 'Up = do it today']) {
        assert(text.includes(phrase), `missing English string: ${phrase}`)
      }
      // User data (workspace / category names) stays Chinese by design, so
      // the leak check is scoped to the review sheet's own action buttons.
      const dialog = page.getByRole('dialog')
      for (const name of ['Mark complete', 'Do it today', 'Return to task list', 'Cancel and archive']) {
        assert(await dialog.getByRole('button', { name: new RegExp(name) }).first().isVisible(),
          `English button missing: ${name}`)
      }
      const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth)
      assert(overflow <= 0, `375px body overflows by ${overflow}px`)
      await page.screenshot({ path: path.join(SHOT_DIR, '04-en-375.png') })
      await page.evaluate(() => window.localStorage.setItem('waddle-language-v1', 'zh-TW'))
    })

    await step('no real DB writes escaped the interceptor', async () => {
      const foreign = writes.filter((w) => !Object.values(TASK_IDS).includes(w.id))
      assert(foreign.length === 0, `writes to non-synthetic tasks: ${JSON.stringify(foreign)}`)
    })

    await step('no page errors', async () => {
      assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`)
    })
  } finally {
    writeFileSync(
      path.join(SHOT_DIR, 'results.json'),
      JSON.stringify({ when: new Date().toISOString(), baseUrl: BASE_URL, results, writes, pageErrors }, null, 2),
    )
    await browser.close()
  }
}

;(async () => {
  if (!process.env.E2E_BASE_URL) {
    startDevServer()
    await waitForServerReady()
  }
  try {
    await main()
  } catch (e) {
    console.error('[overdue-swipe] fatal:', e)
    exitCode = 1
  } finally {
    stopDevServer()
  }
  const passed = results.filter((r) => r.passed).length
  console.log(`\n=== ${passed}/${results.length} passed ===`)
  console.log(`screenshots: ${SHOT_DIR}`)
  process.exit(exitCode)
})()
