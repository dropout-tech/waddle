#!/usr/bin/env node
/**
 * Repro attempt #2: user-created custom slot type named 「專注時間」.
 * Flow: login → settings → 時間區塊 tab → 新增類型「專注時間」(純時間區塊)
 * → calendar day view → create a block of that type → pointer-drag it →
 * assert time changed + persists → cleanup (block + custom type + leftovers).
 *
 * Run: node scripts/e2e/tmp-focus-custom-type-drag-verify.mjs
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
  console.error('[custom-type] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
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

async function pointerDrag(page, fromX, fromY, toX, toY, steps = 12) {
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(fromX + ((toX - fromX) * i) / steps, fromY + ((toY - fromY) * i) / steps)
    await sleep(30)
  }
  await page.mouse.up()
}

const TYPE_NAME = '專注時間'

async function main() {
  if (!EXTERNAL_BASE_URL) {
    startDevServer()
    await waitForServerReady()
  } else {
    console.log(`[custom-type] Reusing server at ${BASE_URL}`)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`))
  // auto-accept window.confirm (block deletion)
  page.on('dialog', (d) => d.accept())

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const dayCol = () => page.locator(`[data-day-grid][data-day-date="${todayStr}"]`).first()
  const blockLoc = () => page.locator(`[data-block][aria-label^="${TYPE_NAME} "]`).first()
  const leftoverLoc = () => page.locator('[data-block][aria-label^="專注 "]').first()

  async function findEmptySpot() {
    return await dayCol().evaluate((el) => {
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

  async function deleteBlock(loc, label) {
    if (!(await loc().count())) return
    await loc().evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await sleep(400)
    await loc().click({ position: { x: 30, y: 12 } })
    await sleep(800)
    const del = page.getByRole('button', { name: '刪除', exact: true }).first()
    await del.waitFor({ state: 'visible', timeout: 5000 })
    await del.click()
    await sleep(1000)
    console.log(`[custom-type] deleted block: ${label}`)
  }

  await step('login', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
    await page.getByRole('button', { name: '日檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    await page.getByRole('button', { name: '日檢視' }).click()
    await sleep(800)
  })

  await step(`create custom type 「${TYPE_NAME}」 in settings`, async () => {
    const gear = page.locator('[aria-label="設定"]').first()
    await gear.waitFor({ state: 'visible', timeout: 5000 })
    await gear.click()
    await sleep(600)
    await page.getByRole('button', { name: '時間區塊', exact: true }).click()
    await sleep(400)
    // if a leftover custom type from a previous run exists, remove it first
    // (list rows have a 刪除類型「…」 button per type)
    const staleDelete = page.locator(`[aria-label="刪除類型「${TYPE_NAME}」"], [title*="${TYPE_NAME}"]`).first()
    if (await staleDelete.count()) {
      await staleDelete.click().catch(() => {})
      await sleep(500)
    }
    await page.getByRole('button', { name: '新增類型' }).first().click()
    await sleep(300)
    await page.getByPlaceholder('名稱').fill(TYPE_NAME)
    await page.getByPlaceholder('描述').fill('自訂類型拖動測試')
    const addForm = page.locator('div.space-y-3').filter({ has: page.getByPlaceholder('名稱') })
    await addForm.getByRole('button', { name: '新增', exact: true }).click()
    await sleep(800)
    await page.screenshot({ path: path.join(SHOT_DIR, '10-custom-type-created.png') })
    // close via the header X (Escape may not be wired)
    await page.locator('[aria-label="設定"][role="dialog"], [aria-label="設定"]').last()
      .locator('button:has(svg.lucide-x)').first().click()
      .catch(async () => { await page.keyboard.press('Escape') })
    await sleep(600)
    // settings modal must be gone before touching the calendar
    await page.getByRole('button', { name: '時間區塊', exact: true }).waitFor({ state: 'hidden', timeout: 5000 })
  })

  await step(`create a ${TYPE_NAME} block on calendar`, async () => {
    const spot = await findEmptySpot()
    if (!spot) throw new Error('no empty on-screen spot found in today column')
    await pointerDrag(page, spot.x, spot.y, spot.x, spot.y + 70)
    await sleep(500)
    await page.getByText('選擇時間區塊的類型', { exact: false }).waitFor({ state: 'visible', timeout: 5000 })
    await page.getByRole('button', { name: /各類時間安排/ }).click({ timeout: 5000 })
    await sleep(300)
    await page.getByRole('button', { name: /自訂類型拖動測試/ }).click({ timeout: 5000 })
    await sleep(1200)
    await page.screenshot({ path: path.join(SHOT_DIR, '11-custom-block-created.png') })
    await blockLoc().waitFor({ state: 'visible', timeout: 5000 })
  })

  let beforeLabel = ''
  await step(`drag the ${TYPE_NAME} block body down 60min`, async () => {
    await page.keyboard.press('Escape')
    await sleep(300)
    const block = blockLoc()
    await block.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await sleep(400)
    beforeLabel = (await block.getAttribute('aria-label')) || ''
    console.log(`[custom-type] before: ${beforeLabel}`)
    const box = await block.boundingBox()
    if (!box) throw new Error('block has no bounding box')
    const fromX = box.x + box.width / 2
    const fromY = box.y + box.height / 2
    const under = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return el ? `${el.tagName} inBlock=${!!el.closest('[data-block]')}` : 'nothing'
    }, { x: fromX, y: fromY })
    console.log(`[custom-type] under grab point: ${under}`)
    await pointerDrag(page, fromX, fromY, fromX, fromY + 60)
    await sleep(1200)
    const afterLabel = (await blockLoc().getAttribute('aria-label')) || ''
    console.log(`[custom-type] after: ${afterLabel}`)
    await page.screenshot({ path: path.join(SHOT_DIR, '12-custom-block-after-drag.png') })
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
    console.log(`[custom-type] after reload: ${label}`)
    if (label !== movedLabel) throw new Error(`not persisted — got "${label}", expected "${movedLabel}"`)
  })

  await step('cleanup — delete test block + leftover 專注 block', async () => {
    await deleteBlock(blockLoc, TYPE_NAME)
    await deleteBlock(leftoverLoc, '專注 (leftover from previous run)')
  })

  await step('cleanup — delete custom type in settings', async () => {
    const gear = page.locator('[aria-label="設定"]').first()
    await gear.click()
    await sleep(600)
    await page.getByRole('button', { name: '時間區塊', exact: true }).click()
    await sleep(400)
    const row = page.locator('div.rounded-lg.border').filter({ hasText: TYPE_NAME }).last()
    const trash = row.locator('button:has(svg.lucide-trash2), button:has(svg.lucide-trash-2), button[aria-label*="刪除"], button[title*="刪除"]').last()
    await trash.click({ timeout: 5000 })
    await sleep(800)
    await page.screenshot({ path: path.join(SHOT_DIR, '13-custom-type-deleted.png') })
    await page.keyboard.press('Escape')
  })

  await browser.close()

  console.log('\n===== RESULTS =====')
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'} — ${r.name}${r.note ? ` — ${r.note}` : ''}`)
  console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`)
}

main()
  .catch((e) => { console.error(e); exitCode = 1 })
  .finally(() => { stopDevServer(); process.exit(exitCode) })
