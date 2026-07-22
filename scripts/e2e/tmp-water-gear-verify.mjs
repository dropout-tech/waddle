#!/usr/bin/env node
/**
 * Verifies (a) the water-reminder popup's new gear panel (in-place on/off +
 * interval, disable toast, settings-modal state sync) and (b) that no
 * user-visible "Waddle" branding remains on the dashboard / report views.
 * Not committed (tmp- prefix convention).
 *
 * Deterministic trigger: the reminder hook checks localStorage's nextDueAt
 * on mount, so seeding a past timestamp + reload pops the modal instantly —
 * no 30s polling waits, no DB writes anywhere in this script.
 *
 * Run: node scripts/e2e/tmp-water-gear-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3103
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL
const BASE_URL = EXTERNAL_BASE_URL || `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-14-water-gear-shots', EXTERNAL_BASE_URL ? 'prod' : '')
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
  console.error('[water-verify] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
  process.exit(1)
}

let devServer
let exitCode = 0
const results = []
const pageErrors = []

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

const K = {
  enabled: 'waddle.waterReminder.enabled',
  interval: 'waddle.waterReminder.intervalMinutes',
  nextDue: 'waddle.waterReminder.nextDueAt',
}

async function main() {
  if (!EXTERNAL_BASE_URL) {
    startDevServer()
    await waitForServerReady()
  }

  const browser = await chromium.launch()
  // Explicit context so the mobile step can open a second page that shares
  // the logged-in session (implicit browser.newPage() contexts can't).
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', (err) => { pageErrors.push(err.message); console.log(`[pageerror] ${err.message}`) })

  const ls = (key) => page.evaluate((k) => window.localStorage.getItem(k), key)
  const seedDue = () => page.evaluate((keys) => {
    window.localStorage.setItem(keys.enabled, '1')
    window.localStorage.setItem(keys.nextDue, String(Date.now() - 1000))
  }, K)
  const modalTitle = () => page.getByText('該喝水囉～', { exact: false }).first()
  const gearBtn = () => page.getByRole('button', { name: '提醒設定' })

  await step('login', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
  })

  await step('種下過期提醒時間 → 重載 → 提醒彈窗立即出現', async () => {
    await seedDue()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await modalTitle().waitFor({ state: 'visible', timeout: 15000 })
  })

  await step('右上角齒輪存在 → 點開就地設定面板（開關＋間隔）', async () => {
    await gearBtn().waitFor({ state: 'visible', timeout: 5000 })
    await gearBtn().click()
    await page.getByText('提醒間隔').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByText('關掉後不再跳出', { exact: false }).waitFor({ state: 'visible' })
    await page.screenshot({ path: path.join(SHOT_DIR, '01-desktop-gear-panel.png') })
  })

  await step('點「30 分鐘」→ 間隔偏好即時寫入', async () => {
    await page.getByRole('button', { name: '30 分鐘', exact: true }).click()
    const v = await ls(K.interval)
    if (v !== '30') throw new Error(`interval expected '30', got ${JSON.stringify(v)}`)
  })

  await step('取消勾選「喝水提醒」→ 彈窗關閉＋toast＋enabled=0', async () => {
    await page.locator('input[type="checkbox"]:visible').first().click()
    await modalTitle().waitFor({ state: 'hidden', timeout: 5000 })
    await page.getByText('已關閉喝水提醒').first().waitFor({ state: 'visible', timeout: 5000 })
    const v = await ls(K.enabled)
    if (v !== '0') throw new Error(`enabled expected '0', got ${JSON.stringify(v)}`)
    await page.screenshot({ path: path.join(SHOT_DIR, '02-disabled-toast.png') })
  })

  await step('關閉後再種過期時間＋重載 → 彈窗不再出現', async () => {
    await page.evaluate((keys) => {
      window.localStorage.setItem(keys.nextDue, String(Date.now() - 1000))
    }, K)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    await sleep(3000) // mount-time check would have fired by now if broken
    if (await modalTitle().isVisible().catch(() => false)) {
      throw new Error('reminder popup appeared despite enabled=0')
    }
  })

  await step('設定頁同步：開啟設定 → 喝水提醒顯示為未勾選 → 重新勾選恢復', async () => {
    await page.getByRole('button', { name: '設定', exact: true }).click()
    const toggle = page.locator('label:has-text("喝水提醒") input[type="checkbox"]').first()
    await toggle.waitFor({ state: 'visible', timeout: 5000 })
    if (await toggle.isChecked()) throw new Error('settings toggle should show OFF after in-popup disable (stale-state bug)')
    await page.screenshot({ path: path.join(SHOT_DIR, '03-settings-synced-off.png') })
    await toggle.click()
    if ((await ls(K.enabled)) !== '1') throw new Error('re-enable did not persist')
    const due = parseInt(await ls(K.nextDue), 10)
    if (!(due > Date.now())) throw new Error('re-enable should re-arm nextDueAt into the future')
    // Close via the header X (icon-only button, no aria-label — reach it
    // through the dialog wrapper) and wait for the overlay to actually go.
    const dlg = page.getByRole('dialog', { name: '設定' })
    await dlg.locator('button:has(svg.lucide-x)').first().click()
    await dlg.waitFor({ state: 'hidden', timeout: 5000 })
  })

  await step('品牌字樣：主畫面與報告頁無 Waddle、報告頁有 Huddle', async () => {
    const dashText = await page.evaluate(() => document.body.innerText)
    if (dashText.includes('Waddle')) throw new Error('dashboard still shows "Waddle"')
    await page.getByRole('button', { name: '報告' }).click()
    await page.getByText(/Huddle/, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 })
    const reportText = await page.evaluate(() => document.body.innerText)
    if (reportText.includes('Waddle')) throw new Error('report view still shows "Waddle"')
    if (!reportText.includes('Huddle')) throw new Error('report view should mention Huddle')
    await page.screenshot({ path: path.join(SHOT_DIR, '04-report-huddle.png') })
  })

  await step('手機 390×844：抽屜版齒輪可見、觸控目標 ≥44px、面板可開', async () => {
    // Same browser context as the desktop page → shares the logged-in
    // Supabase session in localStorage (a fresh browser.newPage() would be
    // a separate incognito context stuck at /login).
    const mob = await context.newPage()
    await mob.setViewportSize({ width: 390, height: 844 })
    mob.on('pageerror', (err) => { pageErrors.push(err.message) })
    await mob.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await mob.evaluate((keys) => {
      window.localStorage.setItem(keys.enabled, '1')
      window.localStorage.setItem(keys.nextDue, String(Date.now() - 1000))
    }, K)
    await mob.reload({ waitUntil: 'domcontentloaded' })
    await mob.getByText('該喝水囉～', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 })
    const gear = mob.getByRole('button', { name: '提醒設定' })
    await gear.waitFor({ state: 'visible', timeout: 5000 })
    const box = await gear.boundingBox()
    if (!box || box.width < 44 || box.height < 44) {
      throw new Error(`mobile gear touch target too small: ${JSON.stringify(box)}`)
    }
    await gear.click()
    await mob.getByText('提醒間隔').waitFor({ state: 'visible', timeout: 5000 })
    await mob.screenshot({ path: path.join(SHOT_DIR, '05-mobile-drawer-gear-panel.png') })
    // Leave the test account's device state tidy: turn the reminder back on
    // with a future due time (matches the default-on shipping state).
    await mob.evaluate((keys) => {
      window.localStorage.setItem(keys.enabled, '1')
      window.localStorage.setItem(keys.nextDue, String(Date.now() + 60 * 60 * 1000))
    }, K)
    await mob.close()
  })

  await step('全程無 page error', async () => {
    if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join(' | ')}`)
  })

  await browser.close()
  writeFileSync(path.join(SHOT_DIR, 'results.json'), JSON.stringify({ when: new Date().toISOString(), results }, null, 2))
  console.log('')
  console.log(`${results.filter(r => r.passed).length}/${results.length} steps passed`)
}

main()
  .catch((e) => { console.error('FATAL:', e); exitCode = 1 })
  .finally(() => { stopDevServer(); process.exit(exitCode) })
