#!/usr/bin/env node
/**
 * Repro: user reports 「專注時間」type blocks can't be dragged after creation.
 * Flow: login → day view → drag on empty slot to create a 專注 time block →
 * pointer-drag its body downward → assert its time actually changed and
 * persists after reload → cleanup.
 *
 * Run: node scripts/e2e/tmp-focus-block-drag-verify.mjs
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
  console.error('[focus-drag] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
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

// Drag with explicit mouse steps so the pointermove threshold in the app fires.
async function pointerDrag(page, fromX, fromY, toX, toY, steps = 12) {
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(fromX + ((toX - fromX) * i) / steps, fromY + ((toY - fromY) * i) / steps)
    await sleep(30)
  }
  await page.mouse.up()
}

async function main() {
  if (!EXTERNAL_BASE_URL) {
    startDevServer()
    await waitForServerReady()
  } else {
    console.log(`[focus-drag] Reusing server at ${BASE_URL}`)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`))
  page.on('console', (msg) => { if (msg.type() === 'error') console.log(`[console.error] ${msg.text()}`) })

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  await step('login', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
    await page.getByRole('button', { name: '日檢視' }).waitFor({ state: 'visible', timeout: 20000 })
  })

  await step('switch to day view', async () => {
    await page.getByRole('button', { name: '日檢視' }).click()
    await sleep(800)
    await page.locator(`[data-day-grid][data-day-date="${todayStr}"]`).first().waitFor({ state: 'attached', timeout: 10000 })
  })

  const dayCol = page.locator(`[data-day-grid][data-day-date="${todayStr}"]`).first()

  // Find an empty, on-screen spot inside today's column: walk down the
  // visible portion until elementFromPoint hits the column itself (not a
  // block/task). Returns viewport coords.
  async function findEmptySpot() {
    return await dayCol.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const top = Math.max(rect.top, 80)
      const bottom = Math.min(rect.bottom, window.innerHeight - 40)
      for (let y = top + 20; y < bottom - 80; y += 24) {
        const hit = document.elementFromPoint(x, y)
        const hit2 = document.elementFromPoint(x, y + 70)
        if (!hit || !hit2) continue
        const inBlock = (n) => n.closest('[data-block],[data-task="true"]')
        if (!inBlock(hit) && !inBlock(hit2) && el.contains(hit) && el.contains(hit2)) {
          return { x, y }
        }
      }
      return null
    })
  }

  // The freshly created picker block is labelled exactly 專注 (aria-label
  // "專注 HH:MM–HH:MM"); the test account has an old timer record
  // "1分鐘專注 ✓ …" that must NOT match.
  const blockLoc = () => page.locator('[data-block][aria-label^="專注 "]').first()

  await step('create 專注 block by dragging empty slot', async () => {
    if (await blockLoc().count()) {
      console.log('[focus-drag] a 專注 block already exists (leftover) — reusing it')
      return
    }
    const spot = await findEmptySpot()
    if (!spot) throw new Error('no empty on-screen spot found in today column')
    await pointerDrag(page, spot.x, spot.y, spot.x, spot.y + 70)
    await sleep(500)
    await page.screenshot({ path: path.join(SHOT_DIR, '01-after-slot-drag.png') })
    // slot-type picker — options are buttons named "label description"
    await page.getByText('選擇時間區塊的類型', { exact: false }).waitFor({ state: 'visible', timeout: 5000 })
    await page.getByRole('button', { name: /各類時間安排/ }).click({ timeout: 5000 })
    await sleep(300)
    await page.getByRole('button', { name: /專注工作時段/ }).click({ timeout: 5000 })
    await sleep(1000)
    await page.screenshot({ path: path.join(SHOT_DIR, '02-block-created.png') })
    await blockLoc().waitFor({ state: 'visible', timeout: 5000 })
  })

  let beforeLabel = ''
  await step('drag the 專注 block body down 60min', async () => {
    // close any stray popup/modal from previous steps
    await page.keyboard.press('Escape')
    await sleep(300)
    await page.keyboard.press('Escape')
    await sleep(300)
    const block = blockLoc()
    await block.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await sleep(400)
    beforeLabel = (await block.getAttribute('aria-label')) || ''
    console.log(`[focus-drag] before: ${beforeLabel}`)
    const box = await block.boundingBox()
    if (!box) throw new Error('block has no bounding box')
    const hourHeight = await dayCol.evaluate((el) => Number(el.dataset.hourHeight || 60))
    // grab middle of the body (avoid top/bottom resize handles)
    const fromX = box.x + box.width / 2
    const fromY = box.y + box.height / 2
    // diagnose: what element is actually under the grab point?
    const under = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return 'nothing'
      const cls = typeof el.className === 'string' ? el.className.slice(0, 80) : ''
      return `${el.tagName}.${cls} inBlock=${!!el.closest('[data-block]')}`
    }, { x: fromX, y: fromY })
    console.log(`[focus-drag] under grab point: ${under}`)
    await pointerDrag(page, fromX, fromY, fromX, fromY + hourHeight)
    await sleep(1200)
    const afterLabel = (await blockLoc().getAttribute('aria-label')) || ''
    console.log(`[focus-drag] after: ${afterLabel}`)
    await page.screenshot({ path: path.join(SHOT_DIR, '03-after-drag.png') })
    if (afterLabel === beforeLabel) throw new Error(`drag did nothing — label still "${afterLabel}"`)
  })

  await step('drag persists after reload', async () => {
    const movedLabel = (await blockLoc().getAttribute('aria-label')) || ''
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '日檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    await sleep(1500)
    await blockLoc().waitFor({ state: 'attached', timeout: 10000 })
    await blockLoc().evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await sleep(400)
    const label = (await blockLoc().getAttribute('aria-label')) || ''
    console.log(`[focus-drag] after reload: ${label}`)
    await page.screenshot({ path: path.join(SHOT_DIR, '04-after-reload.png') })
    if (label !== movedLabel) throw new Error(`not persisted — got "${label}", expected "${movedLabel}"`)
  })

  await step('cleanup — delete the block', async () => {
    await blockLoc().evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await sleep(400)
    await blockLoc().click()
    await sleep(600)
    const deleteBtn = page.getByRole('button', { name: /刪除/ }).first()
    await deleteBtn.waitFor({ state: 'visible', timeout: 5000 })
    await deleteBtn.click()
    await sleep(300)
    // possible confirm dialog
    const confirm = page.getByRole('button', { name: /確定|確認|刪除/ }).first()
    if (await confirm.isVisible().catch(() => false)) await confirm.click()
    await sleep(800)
  })

  await browser.close()

  console.log('\n===== RESULTS =====')
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'} — ${r.name}${r.note ? ` — ${r.note}` : ''}`)
  console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`)
}

main()
  .catch((e) => { console.error(e); exitCode = 1 })
  .finally(() => { stopDevServer(); process.exit(exitCode) })
