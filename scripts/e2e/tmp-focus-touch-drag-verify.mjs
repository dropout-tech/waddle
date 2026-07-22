#!/usr/bin/env node
/**
 * Repro attempt #3: touch drag of a 專注 time block on a mobile viewport
 * (iPhone-like, 390×844, real touch events via CDP). Desktop pointer drag
 * already verified working; the user is likely on the iOS app.
 *
 * Flow: desktop context creates a 專注 block → mobile context touch-drags it
 * → assert time changed → cleanup.
 *
 * Run: node scripts/e2e/tmp-focus-touch-drag-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3104
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL
const BASE_URL = EXTERNAL_BASE_URL || `http://localhost:${PORT}`
const SHOT_DIR = process.env.SHOT_DIR || path.join(process.cwd(), 'docs/reports/tmp-focus-drag-shots')
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
  console.error('[touch-drag] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
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
    cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  devServer.stdout.on('data', () => {})
  devServer.stderr.on('data', () => {})
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

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
}

async function pointerDrag(page, fromX, fromY, toX, toY, steps = 12) {
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(fromX + ((toX - fromX) * i) / steps, fromY + ((toY - fromY) * i) / steps)
    await sleep(30)
  }
  await page.mouse.up()
}

// Real touch sequence via CDP — generates touchstart/move/end which Chromium
// translates into pointerdown/move/up with pointerType "touch".
async function touchDrag(cdp, fromX, fromY, toX, toY, steps = 15) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y: fromY, id: 1 }] })
  await sleep(120)
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: fromX + ((toX - fromX) * i) / steps, y: fromY + ((toY - fromY) * i) / steps, id: 1 }],
    })
    await sleep(40)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const today = new Date()
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

async function main() {
  if (!EXTERNAL_BASE_URL) {
    startDevServer()
    await waitForServerReady()
  } else {
    console.log(`[touch-drag] Reusing server at ${BASE_URL}`)
  }

  const browser = await chromium.launch()

  // ── Phase 1: desktop context creates the block ─────────────────────────
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  desktop.on('dialog', (d) => d.accept())
  const dayColD = () => desktop.locator(`[data-day-grid][data-day-date="${todayStr}"]`).first()
  const blockD = () => desktop.locator('[data-block][aria-label^="專注 "]').first()

  await step('desktop: login + create 專注 block', async () => {
    await login(desktop)
    await desktop.getByRole('button', { name: '日檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    await desktop.getByRole('button', { name: '日檢視' }).click()
    await sleep(800)
    if (await blockD().count()) { console.log('[touch-drag] reusing leftover 專注 block'); return }
    const spot = await dayColD().evaluate((el) => {
      const rect = el.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const top = Math.max(rect.top, 80)
      const bottom = Math.min(rect.bottom, window.innerHeight - 40)
      for (let y = top + 20; y < bottom - 80; y += 24) {
        const hit = document.elementFromPoint(x, y)
        const hit2 = document.elementFromPoint(x, y + 70)
        if (!hit || !hit2) continue
        const inBlock = (n) => n.closest('[data-block],[data-task="true"]')
        if (!inBlock(hit) && !inBlock(hit2) && el.contains(hit) && el.contains(hit2)) return { x, y }
      }
      return null
    })
    if (!spot) throw new Error('no empty spot')
    await pointerDrag(desktop, spot.x, spot.y, spot.x, spot.y + 70)
    await sleep(500)
    await desktop.getByText('選擇時間區塊的類型').waitFor({ state: 'visible', timeout: 5000 })
    await desktop.getByRole('button', { name: /各類時間安排/ }).click()
    await sleep(300)
    await desktop.getByRole('button', { name: /專注工作時段/ }).click()
    await sleep(1200)
    await blockD().waitFor({ state: 'visible', timeout: 5000 })
  })

  // ── Phase 2: mobile context touch-drags it ─────────────────────────────
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    // reuse the desktop session — repeated password logins hit Supabase rate limits
    storageState: await desktop.context().storageState(),
  })
  const mobile = await mctx.newPage()
  mobile.on('pageerror', (err) => console.log(`[pageerror-mobile] ${err.message}`))
  const cdp = await mctx.newCDPSession(mobile)
  const blockM = () => mobile.locator('[data-block][aria-label^="專注 "]').first()

  await step('mobile: login + find the block', async () => {
    await mobile.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await sleep(2500)
    if (mobile.url().includes('/login')) throw new Error('session reuse failed — still on /login')
    await mobile.screenshot({ path: path.join(SHOT_DIR, '20-mobile-home.png') })
    await blockM().waitFor({ state: 'attached', timeout: 15000 })
    await blockM().evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }))
    await sleep(800)
    await mobile.screenshot({ path: path.join(SHOT_DIR, '21-mobile-block-visible.png') })
  })

  let beforeLabel = ''
  await step('mobile: touch-drag the 專注 block down', async () => {
    beforeLabel = (await blockM().getAttribute('aria-label')) || ''
    console.log(`[touch-drag] before: ${beforeLabel}`)
    const box = await blockM().boundingBox()
    if (!box) throw new Error('block has no bounding box')
    const fromX = box.x + box.width / 2
    const fromY = box.y + box.height / 2
    const under = await mobile.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return el ? `${el.tagName} inBlock=${!!el.closest('[data-block]')}` : 'nothing'
    }, { x: fromX, y: fromY })
    console.log(`[touch-drag] under grab point: ${under}`)
    await touchDrag(cdp, fromX, fromY, fromX, fromY + 90)
    await sleep(1500)
    const afterLabel = (await blockM().getAttribute('aria-label')) || ''
    console.log(`[touch-drag] after: ${afterLabel}`)
    await mobile.screenshot({ path: path.join(SHOT_DIR, '22-mobile-after-drag.png') })
    if (afterLabel === beforeLabel) throw new Error(`touch drag did nothing — label still "${afterLabel}"`)
  })

  await step('cleanup — delete the block (desktop context)', async () => {
    await desktop.reload({ waitUntil: 'domcontentloaded' })
    await desktop.getByRole('button', { name: '日檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    await sleep(1500)
    if (!(await blockD().count())) return
    await blockD().evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await sleep(400)
    await blockD().click({ position: { x: 30, y: 12 } })
    await sleep(800)
    const del = desktop.getByRole('button', { name: '刪除', exact: true }).first()
    await del.waitFor({ state: 'visible', timeout: 5000 })
    await del.click()
    await sleep(1000)
  })

  await browser.close()

  console.log('\n===== RESULTS =====')
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'} — ${r.name}${r.note ? ` — ${r.note}` : ''}`)
  console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`)
}

main()
  .catch((e) => { console.error(e); exitCode = 1 })
  .finally(() => { stopDevServer(); process.exit(exitCode) })
