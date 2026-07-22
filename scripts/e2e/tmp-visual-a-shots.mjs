#!/usr/bin/env node
// Visual-A screenshot run for the immersive focus timer redesign.
// Reuses an already-running dev server at BASE_URL. Produces 5 shots in
// docs/reports/2026-07-08-timer-visual-a-shots/.
import { chromium } from 'playwright'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const PROJECT = '/Users/lazylazy/Desktop/琢奧科技/v0-task-management-ui'
const OUT = path.join(PROJECT, 'docs/reports/2026-07-08-timer-visual-a-shots')
mkdirSync(OUT, { recursive: true })

function loadEnvFile(p) {
  const out = {}
  if (!existsSync(p)) return out
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}
const env = loadEnvFile(path.join(PROJECT, '.env.e2e.local'))
const EMAIL = env.E2E_EMAIL
const PASSWORD = env.E2E_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('missing E2E creds'); process.exit(1) }

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE_URL}/`, { timeout: 30000 })
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 30000 })
}

async function startOneMinuteImmersive(page, label) {
  await page.locator('[data-tour="focus-timer"]').click()
  await page.getByRole('button', { name: '自訂', exact: true }).click()
  await page.getByRole('spinbutton').first().fill('1')
  await page.getByPlaceholder('在專注什麼？（選填）').fill(label)
  await page.getByRole('button', { name: '放大開始：以沉浸畫面開始專注' }).click()
  await page.getByRole('dialog', { name: '專注計時中' }).waitFor({ state: 'visible', timeout: 5000 })
}

async function longPressEnd(page) {
  const btn = page.getByRole('button', { name: '長按結束（0.9 秒）' })
  const box = await btn.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await sleep(1100)
  await page.mouse.up()
  // manual completion hold 1.4s + 0.4s exit — tap through to skip fast
  await sleep(400)
  await page.mouse.click(640, 400).catch(() => {})
  await sleep(800)
}

const browser = await chromium.launch()
try {
  // ---- Desktop light: work → completion → break ----
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await login(page)
  await startOneMinuteImmersive(page, '設計稿驗證')

  // let ~37s elapse so the arc reads ~60% like the mockup
  await sleep(37000)
  await page.mouse.click(240, 450) // pointerdown wakes the dim state (resetDim)
  await sleep(700)
  await page.screenshot({ path: path.join(OUT, '01-light-work.png') })
  console.log('shot 01-light-work')

  // completion celebration (hold is 2.6s — poll fast)
  await page.getByText('這段專注完成了').waitFor({ state: 'visible', timeout: 40000 })
  await sleep(600) // let the halo bloom + penguin waddle reach mid-animation
  await page.screenshot({ path: path.join(OUT, '05-completion-celebration.png') })
  console.log('shot 05-completion-celebration')

  // auto break follows (default autoStartBreak=true)
  await page.getByText('休息中').waitFor({ state: 'visible', timeout: 15000 })
  await sleep(45000) // breath pacer mid-cycle + arc at ~15% so the sage reads
  await page.mouse.click(240, 450)
  await sleep(700)
  await page.screenshot({ path: path.join(OUT, '02-light-break.png') })
  console.log('shot 02-light-break')

  // end the break cleanly
  await longPressEnd(page)

  // ---- Dark mode work ----
  await page.evaluate(() => localStorage.setItem('theme', 'dark'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 30000 })
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  console.log('dark applied:', isDark)
  await startOneMinuteImmersive(page, '設計稿驗證')
  await sleep(30000)
  await page.mouse.click(240, 450)
  await sleep(700)
  await page.screenshot({ path: path.join(OUT, '03-dark-work.png') })
  console.log('shot 03-dark-work')

  // ---- Mobile 375 (same session, responsive check) ----
  await page.evaluate(() => localStorage.setItem('theme', 'light'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  // session survives reload? No — timer state is in-memory. Start fresh.
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 30000 })
  await startOneMinuteImmersive(page, '設計稿驗證')
  await page.setViewportSize({ width: 375, height: 812 })
  await sleep(25000)
  await page.mouse.click(60, 560)
  await sleep(700)
  await page.screenshot({ path: path.join(OUT, '04-mobile-375-work.png') })
  console.log('shot 04-mobile-375-work')

  await longPressEnd(page)
  console.log('ALL SHOTS DONE')
} finally {
  await browser.close()
}
