#!/usr/bin/env node
/**
 * Verifies: a task with a scheduled date + time shows "M/D HH:MM" in the
 * left task panel in BOTH densities (詳細 comfortable / 精簡 compact) —
 * previously compact showed only the bare start time.
 *
 * Flow: login → create task → set 今天 + 10:00-10:15 → save →
 * assert "M/D 10:00 - 10:15" in 詳細 → assert "M/D 10:00" in 精簡 →
 * 390px mobile tasks tab shows it too, no horizontal overflow →
 * delete (cleanup).
 *
 * Run: node scripts/e2e/tmp-task-datetime-display-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3104
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL
const BASE_URL = EXTERNAL_BASE_URL || `http://localhost:${PORT}`
const SHOT_DIR = process.env.SHOT_DIR || path.join(process.cwd(), 'docs/reports/tmp-task-datetime-shots')
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
  console.error('[datetime-display] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
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

const TITLE = `日期時間驗證-${Date.now()}`
const now = new Date()
const MD = `${now.getMonth() + 1}/${now.getDate()}` // expected M/D prefix for 今天

async function main() {
  if (!EXTERNAL_BASE_URL) {
    startDevServer()
    await waitForServerReady()
  } else {
    console.log(`[datetime-display] Reusing server at ${BASE_URL}`)
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

  await step('pre-clean strays from earlier runs', async () => {
    for (let i = 0; i < 5; i++) {
      const stray = page.getByText(/日期時間驗證-\d+/).first()
      if (!(await stray.isVisible().catch(() => false))) break
      await stray.click()
      const delBtn = page.locator('button[title="刪除任務"]')
      await delBtn.waitFor({ state: 'visible', timeout: 10000 })
      await delBtn.click()
      await sleep(1000)
    }
    if (await page.getByText(/日期時間驗證-\d+/).count() > 0) {
      throw new Error('stray test tasks still present after pre-clean')
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
  })

  await step('open detail, set 今天 + 10:00-10:15, save', async () => {
    await taskRow().first().click()
    const todayBtn = page.getByRole('button', { name: '今天', exact: true })
    await todayBtn.waitFor({ state: 'visible', timeout: 10000 })
    await todayBtn.click()
    await page.getByLabel('開始時間').click()
    await page.getByRole('option', { name: '10:00', exact: true }).click()
    await page.getByLabel('結束時間', { exact: true }).click()
    await page.getByRole('option', { name: '10:15', exact: true }).click()
    await page.getByRole('button', { name: '儲存', exact: true }).click()
    await sleep(1000)
  })

  // The density toggle lives in the collapsible toolbar — expand it first.
  async function ensureToolbarOpen() {
    if (await page.locator('button[title="詳細"]').isVisible().catch(() => false)) return
    await page.locator('button').filter({ hasText: /依分類|依時間|依急迫程度/ }).first().click()
    await page.locator('button[title="詳細"]').waitFor({ state: 'visible', timeout: 5000 })
  }

  await step(`詳細 density: row shows "${MD} 10:00 - 10:15"`, async () => {
    await ensureToolbarOpen()
    await page.locator('button[title="詳細"]').click()
    await sleep(400)
    const row = taskRow().first()
    await row.waitFor({ state: 'visible', timeout: 10000 })
    const text = (await row.innerText()).replace(/\s+/g, ' ')
    if (!text.includes(`${MD} 10:00 - 10:15`)) {
      throw new Error(`row text lacks date+time: "${text}"`)
    }
    await row.screenshot({ path: path.join(SHOT_DIR, '1-comfortable-row.png') })
    await page.screenshot({ path: path.join(SHOT_DIR, '1b-comfortable-panel.png') })
  })

  await step(`精簡 density: row shows "${MD} 10:00"`, async () => {
    await ensureToolbarOpen()
    await page.locator('button[title="精簡"]').click()
    await sleep(400)
    const row = taskRow().first()
    await row.waitFor({ state: 'visible', timeout: 10000 })
    const text = (await row.innerText()).replace(/\s+/g, ' ')
    if (!text.includes(`${MD} 10:00`)) {
      throw new Error(`compact row text lacks date+time: "${text}"`)
    }
    await row.screenshot({ path: path.join(SHOT_DIR, '2-compact-row.png') })
    await page.screenshot({ path: path.join(SHOT_DIR, '2b-compact-panel.png') })
  })

  await step('390px mobile: tasks tab shows date+time, no horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    // Next.js dev-mode indicator portal sits bottom-left and intercepts taps
    // on the first bottom tab at 390px — dev-only artifact, hide it.
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
    const tasksTab = page.getByRole('tab', { name: '任務', exact: true })
    await tasksTab.waitFor({ state: 'visible', timeout: 20000 })
    await tasksTab.click()
    const row = taskRow().first()
    await row.waitFor({ state: 'visible', timeout: 10000 })
    const text = (await row.innerText()).replace(/\s+/g, ' ')
    if (!text.includes(`${MD} 10:00`)) {
      throw new Error(`mobile row text lacks date+time: "${text}"`)
    }
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement
      return el ? el.scrollWidth - el.clientWidth : 0
    })
    if (overflow > 1) throw new Error(`horizontal overflow: ${overflow}px`)
    // Let the tab-switch entrance animation finish before the shot —
    // mid-transition frames photograph as a shifted, half-faded panel.
    await sleep(1200)
    await page.screenshot({ path: path.join(SHOT_DIR, '3-mobile-390.png') })
  })

  // Density persists only in this test context's localStorage — the user's
  // own browser is untouched, so no restore step is needed.
  await step('cleanup: delete the test task', async () => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const row = taskRow().first()
    await row.waitFor({ state: 'visible', timeout: 20000 })
    await row.click()
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
