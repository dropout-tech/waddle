#!/usr/bin/env node
/**
 * Taiwan public-holiday calendar markers — spawns its own dev server, then
 * asserts:
 *  A. Navigating the month view to October 2026 shows "國慶日" (National Day).
 *  B. Turning off "顯示國定假日" in Settings → General hides it.
 *  C. Turning it back on restores it.
 *  D. Switching to English shows the English holiday name ("National Day")
 *     instead of the Chinese one.
 * Screenshots → docs/reports/2026-07-22-taiwan-holidays-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3106
const PROD = process.env.E2E_BASE_URL || null
const BASE = PROD || `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-07-22-taiwan-holidays-shots', PROD ? 'prod' : '')
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
if (!EMAIL || !PASSWORD) { console.error('missing E2E creds'); process.exit(1) }

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  ok ? passed++ : failed++
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

const WAIT = PROD ? 'domcontentloaded' : 'networkidle'

async function fillStable(page, selector, value) {
  for (let i = 0; i < 5; i++) {
    await page.fill(selector, value)
    await sleep(150)
    if ((await page.inputValue(selector)) === value) return
  }
  throw new Error(`fill unstable: ${selector}`)
}

// Click the month view's "next month" chevron until the header shows the
// target year/month text (zh-TW format is "{year}年 {month}月" per
// calendar-header.tsx's getDisplayText). Bails after a generous cap so a
// broken navigation fails loudly instead of looping forever.
async function navigateToMonth(page, targetText, maxClicks = 24) {
  for (let i = 0; i < maxClicks; i++) {
    const label = await page.locator('span[aria-live="polite"]').first().innerText().catch(() => '')
    if (label.includes(targetText)) return true
    await page.locator('[aria-label="後一個月"]').first().click()
    await sleep(300)
  }
  return false
}

const pageErrors = []
let browser
const server = PROD ? null : spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true,
})
server?.stdout.on('data', () => {})
server?.stderr.on('data', () => {})

async function waitServer() {
  if (PROD) return
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready (check for zombie next dev)')
}

try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(90000) // prod cold paths are slow; don't fail on screenshots
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  // ── login ────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: WAIT })
  // Prod cold loads are slow — wait for the login card to hydrate before
  // typing, and retry the submit once if the first click lands pre-hydration.
  await page.locator('button[type="submit"]').waitFor({ timeout: 30000 })
  await sleep(3000)
  await fillStable(page, 'input[type="email"]', EMAIL)
  await fillStable(page, 'input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
  await sleep(4000)

  // Switch to month view (desktop segmented control).
  await page.locator('[aria-label="月檢視"]').first().click()
  await sleep(600)

  // ── A. October 2026 shows 國慶日 ─────────────────────────────────────
  const reachedOct = await navigateToMonth(page, '2026年 10月')
  check('A1 navigated month view to 2026年10月', reachedOct)
  await sleep(500)
  const nationalDayVisible = await page.locator('text=國慶日').first().isVisible().catch(() => false)
  check('A2 "國慶日" shown on Oct 10, 2026', nationalDayVisible)
  await page.screenshot({ path: path.join(SHOTS, 'month-2026-10-holidays-on.png') })

  // ── B. turn the setting off ─────────────────────────────────────────
  await page.locator('[aria-label="設定"]').first().click()
  await sleep(800)
  const holidayToggle = page.locator('label', { hasText: '顯示國定假日' }).locator('input[type="checkbox"]')
  const wasChecked = await holidayToggle.isChecked().catch(() => null)
  check('B1 holiday toggle defaults to on', wasChecked === true, `wasChecked=${wasChecked}`)
  await holidayToggle.uncheck()
  await sleep(400)
  await page.keyboard.press('Escape')
  await sleep(500)
  const hiddenAfterOff = await page.locator('text=國慶日').first().isVisible().catch(() => false)
  check('B2 "國慶日" hidden after turning setting off', !hiddenAfterOff)
  await page.screenshot({ path: path.join(SHOTS, 'month-2026-10-holidays-off.png') })

  // ── C. turn it back on ───────────────────────────────────────────────
  await page.locator('[aria-label="設定"]').first().click()
  await sleep(800)
  const holidayToggle2 = page.locator('label', { hasText: '顯示國定假日' }).locator('input[type="checkbox"]')
  await holidayToggle2.check()
  await sleep(400)
  await page.keyboard.press('Escape')
  await sleep(500)
  const restored = await page.locator('text=國慶日').first().isVisible().catch(() => false)
  check('C1 "國慶日" restored after turning setting back on', restored)

  // ── D. switch to English → English holiday name ─────────────────────
  await page.locator('[aria-label="設定"]').first().click()
  await sleep(800)
  const enOption = page.locator('button', { hasText: 'English' }).first()
  await enOption.click()
  await sleep(800)
  await page.keyboard.press('Escape')
  await sleep(500)
  const englishName = await page.locator('text=National Day').first().isVisible().catch(() => false)
  const chineseGone = await page.locator('text=國慶日').first().isVisible().catch(() => false)
  check('D1 English shows "National Day"', englishName)
  check('D2 Chinese "國慶日" no longer shown in English mode', !chineseGone)
  await page.screenshot({ path: path.join(SHOTS, 'month-2026-10-holidays-en.png') })

  // switch back to zh-TW for hygiene (shared test account state)
  await page.locator('[aria-label="Settings"]').first().click()
  await sleep(800)
  await page.locator('button', { hasText: '繁體中文' }).first().click()
  await sleep(500)
  await page.keyboard.press('Escape')

  check('E1 zero pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

  await ctx.close()
} catch (err) {
  check('FATAL', false, String(err))
} finally {
  try { await browser?.close() } catch {}
  if (server) { try { process.kill(-server.pid, 'SIGTERM') } catch {} }
}

console.log(`\n${passed}/${passed + failed} passed`)
process.exit(failed ? 1 : 0)
