#!/usr/bin/env node
/**
 * Verifies: tasks marked 標記為會議 (with a scheduled date) are hidden from
 * the left task panel, still appear on the calendar + 今日會議 popover, and
 * the 加入左側任務欄 toggle locks off for scheduled meetings.
 *
 * Flow: login → create task in left panel → open detail → set 今天 +
 * 標記為會議 → save → assert gone from panel, present on calendar +
 * popover → delete (cleanup).
 *
 * Run: node scripts/e2e/tmp-meeting-list-filter-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3103
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL
const BASE_URL = EXTERNAL_BASE_URL || `http://localhost:${PORT}`
const SHOT_DIR = process.env.SHOT_DIR || path.join(process.cwd(), 'docs/reports/tmp-meeting-filter-shots')
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
  console.error('[meeting-filter] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
  process.exit(1)
}

let devServer
let exitCode = 0
const results = []

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
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
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

const TITLE = `會議過濾驗證-${Date.now()}`

// Future 15-min-grid times so the popover's "already ended" filter keeps the
// meeting listed. Capped before midnight; running this after 23:15 local
// would make the times invalid for "today", so bail loudly instead.
function futureSlotTimes() {
  const now = new Date()
  let startMin = (Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) + 1) * 15
  if (startMin > 23 * 60 + 30) throw new Error('too close to midnight for a today-meeting test')
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return { start: fmt(startMin), end: fmt(startMin + 15) }
}

async function main() {
  if (!EXTERNAL_BASE_URL) {
    startDevServer()
    await waitForServerReady()
  } else {
    console.log(`[meeting-filter] Reusing server at ${BASE_URL}`)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`))

  const taskRow = () => page.locator('[data-tour="task-row"]').filter({ hasText: TITLE })

  await step('login', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
  })

  await step('switch to month view', async () => {
    await page.getByRole('button', { name: '月檢視' }).click()
    await sleep(500)
  })

  await step('pre-clean strays from earlier runs', async () => {
    for (let i = 0; i < 5; i++) {
      const stray = page.getByText(/會議過濾驗證-\d+/).first()
      if (!(await stray.isVisible().catch(() => false))) break
      await stray.click()
      const delBtn = page.locator('button[title="刪除任務"]')
      await delBtn.waitFor({ state: 'visible', timeout: 10000 })
      await delBtn.click()
      await sleep(1000)
    }
    if (await page.getByText(/會議過濾驗證-\d+/).count() > 0) {
      throw new Error('stray test meetings still present after pre-clean')
    }
  })

  await step('create task in left panel', async () => {
    const addBtn = page.getByRole('button', { name: '新增任務' }).first()
    await addBtn.waitFor({ state: 'visible', timeout: 10000 })
    await addBtn.click()
    const input = page.getByPlaceholder('輸入任務名稱...')
    await input.fill(TITLE)
    await input.press('Enter')
    await taskRow().first().waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: path.join(SHOT_DIR, '1-created-in-panel.png') })
  })

  await step('open detail, set 今天 + times + 標記為會議', async () => {
    await taskRow().first().click()
    const meetingToggle = page.getByRole('button', { name: /標記為會議/ })
    await meetingToggle.waitFor({ state: 'visible', timeout: 10000 })
    await page.getByRole('button', { name: '今天', exact: true }).click()
    const { start, end } = futureSlotTimes()
    await page.getByLabel('開始時間').click()
    await page.getByRole('option', { name: start, exact: true }).click()
    await page.getByLabel('結束時間', { exact: true }).click()
    await page.getByRole('option', { name: end, exact: true }).click()
    await meetingToggle.click()
    if ((await meetingToggle.getAttribute('aria-pressed')) !== 'true') {
      throw new Error('meeting toggle did not switch on')
    }
  })

  await step('加入左側任務欄 toggle locks off for scheduled meetings', async () => {
    const hint = page.getByText('會議僅顯示在日曆上，不會出現在左側任務欄')
    await hint.waitFor({ state: 'visible', timeout: 5000 })
    const listToggle = page.getByRole('button', { name: /加入左側任務欄/ })
    if ((await listToggle.getAttribute('aria-pressed')) !== 'false') {
      throw new Error('list-visibility toggle should read off for a scheduled meeting')
    }
    await page.screenshot({ path: path.join(SHOT_DIR, '2-modal-meeting-on.png') })
  })

  await step('save', async () => {
    await page.getByRole('button', { name: '儲存', exact: true }).click()
    await sleep(1000)
  })

  await step('meeting is GONE from left task panel', async () => {
    await taskRow().first().waitFor({ state: 'detached', timeout: 10000 })
    await page.screenshot({ path: path.join(SHOT_DIR, '3-panel-after-save.png') })
  })

  await step('meeting still visible on calendar (month view)', async () => {
    const onCalendar = page.getByText(TITLE)
    await onCalendar.first().waitFor({ state: 'visible', timeout: 10000 })
  })

  await step('meeting listed in 今日會議 popover', async () => {
    await page.getByRole('button', { name: /今日會議/ }).click()
    const dialog = page.getByRole('dialog', { name: '今日會議' })
    await dialog.waitFor({ state: 'visible', timeout: 5000 })
    await dialog.getByText(TITLE).waitFor({ state: 'visible', timeout: 5000 })
    await page.screenshot({ path: path.join(SHOT_DIR, '4-meetings-popover.png') })
  })

  await step('cleanup: delete the test meeting', async () => {
    await page.keyboard.press('Escape') // close popover
    await sleep(300)
    await page.getByText(TITLE).first().click()
    const delBtn = page.locator('button[title="刪除任務"]')
    await delBtn.waitFor({ state: 'visible', timeout: 10000 })
    await delBtn.click()
    await sleep(1000)
    const remaining = await page.getByText(TITLE).count()
    if (remaining > 0) throw new Error(`title still present ${remaining}x after delete`)
  })

  await browser.close()

  console.log('\n=== SUMMARY ===')
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'} — ${r.name}${r.note ? ` — ${r.note}` : ''}`)
  console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`)
}

main()
  .catch((e) => {
    console.error(e)
    exitCode = 1
  })
  .finally(() => {
    stopDevServer()
    process.exit(exitCode)
  })
