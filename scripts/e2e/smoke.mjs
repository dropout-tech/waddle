#!/usr/bin/env node
/**
 * Smoke test — logs in and walks the core surfaces (month/week/day view,
 * /notebook, focus scratchpad, settings modal, report view), asserting on
 * each screen: no horizontal overflow, no pageerror, no unexpected console
 * error. Spawns its own `next dev` on PORT and tears it down on exit.
 *
 * Run: pnpm e2e   (see scripts/e2e/README.md)
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

/** Minimal KEY=VALUE parser for `.env.e2e.local` — no new dependency for
 *  something this small. Ignores blank lines and `#` comments; strips one
 *  layer of matching quotes around the value. */
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
  console.error('[e2e] Missing test credentials — no E2E_EMAIL/E2E_PASSWORD env vars')
  console.error('[e2e] and no .env.e2e.local in the repo root.')
  console.error('[e2e] Fix: create .env.e2e.local with:')
  console.error('[e2e]   E2E_EMAIL=your-test-account@example.com')
  console.error('[e2e]   E2E_PASSWORD=your-test-password')
  console.error('[e2e] (gitignored via .env*.local) — see scripts/e2e/README.md.')
  process.exit(1)
}

const SCREENSHOT_DIR = process.env.E2E_SCREENSHOT_DIR || path.join(tmpdir(), 'huddle-e2e-shots')

// Known-noisy console.error lines that are pre-existing / environment-only
// and not regressions this smoke test should catch. Keep this list short —
// a growing whitelist usually means a real bug is being hidden.
const CONSOLE_ERROR_ALLOWLIST = [
  // Next dev HMR occasionally logs a benign WebSocket close on fast nav.
  /\[HMR\]|WebSocket connection.*failed/i,
]

let devServer
let exitCode = 0
const results = []

async function waitForServerReady(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE_URL)
      if (res.status < 500) return
    } catch {
      // not up yet
    }
    await sleep(500)
  }
  throw new Error(`Dev server did not become ready within ${timeoutMs}ms`)
}

function startDevServer() {
  devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
    cwd: process.cwd(),
    detached: true, // own process group so we can kill next's child workers too
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  devServer.stdout.on('data', (d) => process.stdout.write(`[next dev] ${d}`))
  devServer.stderr.on('data', (d) => process.stderr.write(`[next dev] ${d}`))
}

function stopDevServer() {
  if (!devServer || !devServer.pid) return
  try {
    process.kill(-devServer.pid, 'SIGTERM')
  } catch {
    try { devServer.kill('SIGTERM') } catch { /* already gone */ }
  }
}

async function main() {
  startDevServer()
  await waitForServerReady()

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  const consoleErrors = []
  const pageErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => {
    pageErrors.push(err.message)
  })

  // Asserts the CURRENT page state (call this while the screen you actually
  // want to test is on screen — not after navigating away from it). Resets
  // the console/pageerror buffers so the next checkpoint starts fresh.
  async function checkpoint(label) {
    const notes = []
    let ok = true
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.body.clientWidth,
    }))
    if (overflow.scrollWidth > overflow.clientWidth + 1) {
      ok = false
      notes.push(`horizontal overflow: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`)
    }
    const filtered = consoleErrors.filter(
      (m) => !CONSOLE_ERROR_ALLOWLIST.some((re) => re.test(m)),
    )
    if (filtered.length > 0) {
      ok = false
      notes.push(`console error(s) @ ${label}: ${JSON.stringify(filtered.slice(0, 3))}`)
    }
    if (pageErrors.length > 0) {
      ok = false
      notes.push(`pageerror(s) @ ${label}: ${JSON.stringify(pageErrors.slice(0, 3))}`)
    }
    consoleErrors.length = 0
    pageErrors.length = 0
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${label.replace(/[^a-z0-9]+/gi, '-')}.png`),
    }).catch(() => {})
    return { ok, notes }
  }

  async function step(name, fn) {
    consoleErrors.length = 0
    pageErrors.length = 0
    let passed = true
    const allNotes = []
    const check = async (label) => {
      const { ok, notes } = await checkpoint(label)
      if (!ok) {
        passed = false
        allNotes.push(...notes)
      }
    }
    try {
      await fn(check)
    } catch (e) {
      passed = false
      allNotes.push(`exception: ${e.message}`)
      // Capture evidence of what was actually on screen when it broke.
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${name.replace(/[^a-z0-9]+/gi, '-')}-FAILURE.png`),
      }).catch(() => {})
    }
    results.push({ name, passed, notes: allNotes })
    console.log(`${passed ? 'PASS' : 'FAIL'} — ${name}${allNotes.length ? ' — ' + allNotes.join('; ') : ''}`)
    if (!passed) exitCode = 1
  }

  await step('login', async (check) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    await check('login')
  })

  await step('month view', async (check) => {
    await page.getByRole('button', { name: '月檢視' }).click()
    await check('month-view')
  })

  await step('week view', async (check) => {
    await page.getByRole('button', { name: '週檢視' }).click()
    await check('week-view')
  })

  await step('day view', async (check) => {
    await page.getByRole('button', { name: '日檢視' }).click()
    await check('day-view')
  })

  await step('/notebook', async (check) => {
    await page.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
    await page.getByText('記事本').first().waitFor({ state: 'visible', timeout: 20000 })
    // Let the page's own auth check (Supabase getUser()) settle before we
    // navigate away — otherwise the in-flight request gets aborted mid-flight
    // and surfaces as a spurious "Failed to fetch" console error.
    await page.waitForLoadState('networkidle').catch(() => {})
    await check('notebook')
  })

  await step('focus scratchpad dropdown', async (check) => {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    await page.getByText('專注白板').first().click()
    await page.getByText('收起白板').waitFor({ state: 'visible', timeout: 10000 })
    await check('scratchpad-open') // assert while the dropdown is actually open
    await page.getByText('收起白板').click()
    await check('scratchpad-closed')
  })

  await step('settings modal open+close', async (check) => {
    await page.getByRole('button', { name: '設定' }).click()
    await page.getByRole('heading', { name: '設定' }).waitFor({ state: 'visible', timeout: 10000 })
    await check('settings-open') // assert while the modal is actually open
    // Close via Esc — ModalShell handles this natively now (WR fix).
    await page.keyboard.press('Escape')
    await page.getByRole('heading', { name: '設定' }).waitFor({ state: 'hidden', timeout: 10000 })
    await check('settings-closed')
  })

  await step('report view', async (check) => {
    await page.getByRole('button', { name: '報告' }).click()
    await page.getByRole('button', { name: '返回日曆' }).waitFor({ state: 'visible', timeout: 10000 })
    await check('report-view') // assert while the report dashboard is actually showing
    await page.getByRole('button', { name: '返回日曆' }).click()
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 10000 })
  })

  await browser.close()

  console.log('')
  console.log(`Screenshots: ${SCREENSHOT_DIR}`)
  console.log(`${results.filter((r) => r.passed).length}/${results.length} steps passed`)
}

main()
  .catch((e) => {
    console.error('FATAL:', e)
    exitCode = 1
  })
  .finally(() => {
    stopDevServer()
    process.exit(exitCode)
  })
