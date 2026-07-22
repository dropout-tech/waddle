#!/usr/bin/env node
/**
 * Verifies the cross-route focus-timer provider refactor. Not committed
 * (tmp- prefix, same convention as tmp-surprise-verify.mjs) — a throwaway
 * script the engineer runs once, not part of `pnpm e2e`.
 *
 * Scenario A: start a session on the dashboard (autoStartBreak OFF so
 * completion goes straight to idle), navigate to /notebook and back,
 * assert the mini pill keeps ticking + BGM keeps playing across both hops,
 * assert the idle setup card does NOT reappear while running, wait for
 * natural completion, assert the calendar record lands + idle card returns.
 *
 * Scenario B: start a second session (autoStartBreak back ON), navigate to
 * /notebook BEFORE it completes so MainLayout (and the recorder) unmounts,
 * let it complete while away (exercises the queued-record path + the
 * auto-continue-into-break completion path), navigate back, assert the
 * queued record flushed onto the calendar and the break session is now
 * visible. Manually stops the break at the end (3rd completion path: manual
 * stop -> idle) to leave the test account clean.
 *
 * Run: node scripts/e2e/tmp-timer-crossroute-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3102
// A concurrent session may already have `next dev` running for this same
// project (Next 16's Turbopack dev server takes a project-level singleton
// lock, independent of port — a second instance self-terminates on
// conflict). Set E2E_BASE_URL to point at an already-running server instead
// of spawning a new one.
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL
const BASE_URL = EXTERNAL_BASE_URL || `http://localhost:${PORT}`

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
  console.error('[timer-verify] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
  process.exit(1)
}

let devServer
let exitCode = 0
const results = []

async function waitForServerReady(timeoutMs = 60000) {
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

/** Extract "mm:ss" (or "h:mm:ss") from a pill's text content and convert to
 *  total seconds, so we can assert it's *decreasing* across a wait. */
function parseClock(text) {
  const m = text.match(/(\d{1,2}):(\d{2}):(\d{2})|(\d{1,2}):(\d{2})/)
  if (!m) throw new Error(`no clock found in "${text}"`)
  if (m[1] !== undefined) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
  return (+m[4]) * 60 + (+m[5])
}

async function main() {
  if (!EXTERNAL_BASE_URL) {
    startDevServer()
    await waitForServerReady()
  } else {
    console.log(`[timer-verify] Reusing already-running server at ${BASE_URL} (E2E_BASE_URL set)`)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`))

  // aria-label differs by phase — '專注計時迷你顯示' for work, '休息計時迷你顯示'
  // for an auto-started break (see focus-timer-mini.tsx's aria-label ternary).
  const miniPill = () => page.getByRole('region', { name: /專注計時迷你顯示|休息計時迷你顯示/ })
  const idleCollapsedBtn = () => page.locator('[data-tour="focus-timer"]')
  const startBtn = () => page.getByRole('button', { name: '開始專注', exact: true })
  // The desktop setup card has no max-height/scroll clamp when every
  // section (更多 + 背景音/環境音) is expanded — pre-existing, not part of
  // this refactor. With everything left open across scenarios it can grow
  // tall enough to cover header controls; collapse it before touching the
  // calendar header, same as a considerate real user would.
  const collapseCardIfOpen = async () => {
    const btn = page.getByRole('button', { name: '收合' })
    if (await btn.isVisible().catch(() => false)) await btn.click()
  }

  await step('login', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
  })

  await step('scenario A: open timer, disable auto-break, set custom 1min + label', async () => {
    await idleCollapsedBtn().click()
    await page.getByRole('button', { name: '自訂', exact: true }).click()
    await page.getByRole('spinbutton').first().fill('1')
    await page.getByPlaceholder('在專注什麼？（選填）').fill('CROSSROUTE-A')
    const moreBtn = page.getByRole('button', { name: /更多/ })
    await moreBtn.click()
    const autoBreakToggle = page.getByRole('button', { name: '完成後自動進入休息' })
    await autoBreakToggle.waitFor({ state: 'visible' })
    if ((await autoBreakToggle.getAttribute('aria-pressed')) === 'true') {
      await autoBreakToggle.click()
    }
    // Turn on an ambient sound so we have something to check BGM
    // continuity against — real audio-file playback, not just intent.
    await page.getByRole('button', { name: /背景音 \/ 環境音/ }).click()
    await page.getByRole('button', { name: /雨聲/ }).click()
    // Close 更多 back down — showSettings/showBgmSettings survive
    // resetTimer(), and the desktop card has no max-height/scroll clamp
    // (pre-existing), so leaving every section open makes the panel taller
    // than the viewport; its own 收合 button (at the panel's top edge,
    // fixed-positioned so it never scrolls into view) becomes unreachable.
    // Collapsing this nested panel keeps the whole card short.
    await moreBtn.click()
  })

  await step('scenario A: start session (mini view)', async () => {
    await page.getByRole('button', { name: '開始專注', exact: true }).click()
    await miniPill().waitFor({ state: 'visible', timeout: 5000 })
  })

  let t0 = 0
  await step('scenario A: mini pill ticking + BGM playing on dashboard', async () => {
    t0 = parseClock(await miniPill().innerText())
    await sleep(3000)
    const t1 = parseClock(await miniPill().innerText())
    if (!(t1 < t0)) throw new Error(`expected countdown to advance: t0=${t0}s t1=${t1}s`)
    const playing = await page.evaluate(() => window.__waddleTimerDebug?.isBgmPlaying())
    if (!playing) throw new Error('expected BGM engine to be playing before navigation')
  })

  await step('scenario A: navigate to /notebook — pill + BGM survive', async () => {
    await page.getByRole('button', { name: '記事本' }).click()
    await page.waitForURL(`${BASE_URL}/notebook`, { timeout: 10000 })
    await miniPill().waitFor({ state: 'visible', timeout: 5000 })
    const tBefore = parseClock(await miniPill().innerText())
    await sleep(3000)
    const tAfter = parseClock(await miniPill().innerText())
    if (!(tAfter < tBefore)) throw new Error(`expected countdown to keep advancing on /notebook: before=${tBefore}s after=${tAfter}s`)
    const playing = await page.evaluate(() => window.__waddleTimerDebug?.isBgmPlaying())
    if (!playing) throw new Error('expected BGM engine to still be playing on /notebook (this is the regression the provider fixes)')
  })

  await step('scenario A: navigate back to dashboard — pill still there, idle card absent', async () => {
    await page.getByRole('button', { name: '返回面板' }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 10000 })
    await miniPill().waitFor({ state: 'visible', timeout: 5000 })
    const idleVisible = await idleCollapsedBtn().isVisible().catch(() => false)
    const startVisible = await startBtn().isVisible().catch(() => false)
    if (idleVisible || startVisible) throw new Error('idle setup card reappeared while a session is still running — remount reset state')
  })

  await step('scenario A: wait for natural completion, record lands, idle card returns', async () => {
    // Session was 60s; ~10-15s already elapsed above. Wait out the rest
    // plus the gentle completion hold (2.6s) + exit fade (0.4s) + margin.
    await sleep(60000)
    // isExpanded is never reset by resetTimer(), so the setup card comes
    // back already-expanded (not the collapsed pill) since we opened it
    // earlier — assert on the 開始專注 button, which exists in both states.
    await startBtn().waitFor({ state: 'visible', timeout: 15000 })
    await collapseCardIfOpen()
    await page.getByRole('button', { name: '日檢視' }).click()
    await page.getByText(/CROSSROUTE-A/, { exact: false }).first().waitFor({ state: 'attached', timeout: 10000 })
  })

  await step('scenario B: start second session with auto-break ON', async () => {
    // Panel may already be expanded (left that way after scenario A) — only
    // click the collapsed pill if it's actually showing.
    if (await idleCollapsedBtn().isVisible().catch(() => false)) {
      await idleCollapsedBtn().click()
    }
    await page.getByRole('button', { name: '自訂', exact: true }).click()
    await page.getByRole('spinbutton').first().fill('1')
    const labelInput = page.getByPlaceholder('在專注什麼？（選填）')
    await labelInput.fill('CROSSROUTE-B')
    // showSettings/showBgmSettings also survive resetTimer() — the 更多
    // panel may already be open from scenario A, so only click to open it,
    // never blindly toggle (a blind click could close it instead).
    const moreBtn = page.getByRole('button', { name: /更多/ })
    if ((await moreBtn.getAttribute('aria-expanded')) !== 'true') {
      await moreBtn.click()
    }
    const autoBreakToggle = page.getByRole('button', { name: '完成後自動進入休息' })
    await autoBreakToggle.waitFor({ state: 'visible' })
    if ((await autoBreakToggle.getAttribute('aria-pressed')) !== 'true') {
      await autoBreakToggle.click() // restore default ON for this scenario
    }
    await moreBtn.click() // close it back down — keeps the card short (see scenario A note)
    await startBtn().click()
    await miniPill().waitFor({ state: 'visible', timeout: 5000 })
  })

  await step('scenario B: leave to /notebook before completion, wait it out there', async () => {
    await page.getByRole('button', { name: '記事本' }).click()
    await page.waitForURL(`${BASE_URL}/notebook`, { timeout: 10000 })
    await miniPill().waitFor({ state: 'visible', timeout: 5000 })
    // Wait past the 60s session + completion hold — the record should queue
    // (no MainLayout/recorder mounted here) and a break session should
    // auto-start (autoStartBreak is ON), all while still on /notebook.
    await sleep(65000)
    await miniPill().waitFor({ state: 'visible', timeout: 10000 }) // now showing the break session
  })

  await step('scenario B: back to dashboard — queued record flushed, break visible', async () => {
    await page.getByRole('button', { name: '返回面板' }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 10000 })
    await collapseCardIfOpen()
    await page.getByRole('button', { name: '日檢視' }).click()
    await page.getByText(/CROSSROUTE-B/, { exact: false }).first().waitFor({ state: 'attached', timeout: 10000 })
    await miniPill().waitFor({ state: 'visible', timeout: 5000 }) // the auto-started break
  })

  await step('cleanup: manually stop the break session (long-hold)', async () => {
    // Mirrors FocusTimerMini's long-press stop button — hold pointerdown
    // ~700ms then release, same as a real user's long-press.
    const stopBtn = miniPill().getByLabel(/長按結束/)
    const box = await stopBtn.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await sleep(700)
      await page.mouse.up()
    }
    // Same isExpanded-carryover as scenario A's completion — the panel
    // comes back expanded, not collapsed.
    await startBtn().waitFor({ state: 'visible', timeout: 5000 })
  })

  await browser.close()
  console.log('')
  console.log(`${results.filter(r => r.passed).length}/${results.length} steps passed`)
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
