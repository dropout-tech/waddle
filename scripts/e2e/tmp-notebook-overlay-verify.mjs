#!/usr/bin/env node
/**
 * TEMP verify script for the notebook pop-up overlay upgrade (was a full-page
 * route navigation to /notebook, now a centered modal that doesn't leave the
 * task board). Deterministic assertions + screenshots.
 * Run: node scripts/e2e/tmp-notebook-overlay-verify.mjs   (from repo root)
 * Delete after the session — not part of the permanent suite.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = Number(process.env.E2E_PORT || 3130)
const BASE_URL = `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-09-notebook-overlay-shots')
mkdirSync(SHOT_DIR, { recursive: true })

function loadEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    out[line.slice(0, eq).trim()] = value
  }
  return out
}
const envFile = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || envFile.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || envFile.E2E_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('missing E2E creds'); process.exit(1) }

let devServer
let exitCode = 0
const results = []

async function waitForServerReady(timeoutMs = 90000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { const res = await fetch(BASE_URL); if (res.status < 500) return } catch {}
    await sleep(500)
  }
  throw new Error('dev server not ready')
}

async function main() {
  if (!process.env.NO_SPAWN) {
    devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
      cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    devServer.stderr.on('data', (d) => process.stderr.write(`[next] ${d}`))
  }
  await waitForServerReady()

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const shot = (name) => page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) })

  async function step(name, fn) {
    try {
      const note = (await fn()) || ''
      results.push({ name, passed: true, note })
      console.log(`PASS — ${name}${note ? ' — ' + note : ''}`)
    } catch (e) {
      results.push({ name, passed: false, note: e.message })
      console.log(`FAIL — ${name} — ${e.message}`)
      await shot(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILURE`).catch(() => {})
      exitCode = 1
    }
  }

  // ---- login ----
  await step('login', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').waitFor({ state: 'visible', timeout: 90000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    // hydration race: fill can be wiped by React re-render — verify it stuck
    for (let i = 0; i < 5; i++) {
      await page.locator('#email').fill(EMAIL)
      await page.locator('#password').fill(PASSWORD)
      if ((await page.locator('#email').inputValue()) === EMAIL &&
          (await page.locator('#password').inputValue()) === PASSWORD) break
      await sleep(600)
    }
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 60000 })
    await sleep(1000)
  })

  // ---- desktop: click "記事本" entry opens a centered overlay, URL unchanged ----
  await step('desktop entry opens overlay, url stays /', async () => {
    await page.locator('[data-tour="notebook-entry"]').first().click()
    const dialog = page.locator('[role="dialog"][aria-label="記事本"]')
    await dialog.waitFor({ state: 'visible', timeout: 10000 })
    await sleep(500) // let enter animation + notes load settle
    if (new URL(page.url()).pathname !== '/') {
      throw new Error(`url changed to ${page.url()}`)
    }
    // backdrop should be present (background dimmed) and the calendar behind
    // it must still be in the DOM (not a route replace).
    const calendarStillMounted = await page.locator('[role="toolbar"][aria-label="日曆導航"]').count()
    if (calendarStillMounted === 0) throw new Error('calendar toolbar not found behind overlay — looks like a navigation, not an overlay')
    await shot('01-desktop-overlay-open')
    return 'dialog visible, url=/, calendar still mounted behind it'
  })

  // ---- sidebar + editor both usable inside the overlay ----
  await step('two-pane list+editor works inside overlay', async () => {
    const dialog = page.locator('[role="dialog"][aria-label="記事本"]')
    const addBtn = dialog.getByRole('button', { name: '新增記事' })
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click()
    } else {
      // notes already exist — click the first row instead
      await dialog.locator('aside button').first().click()
    }
    await dialog.locator('input[placeholder="無標題"]').waitFor({ state: 'visible', timeout: 10000 })
    return 'editor pane shows title input'
  })

  // ---- Esc closes it ----
  await step('Esc closes overlay', async () => {
    await page.keyboard.press('Escape')
    await sleep(400)
    const dialog = page.locator('[role="dialog"][aria-label="記事本"]')
    await dialog.waitFor({ state: 'hidden', timeout: 5000 })
    return 'dialog gone after Esc'
  })

  // ---- reopen, close via X button ----
  await step('X button closes overlay', async () => {
    await page.locator('[data-tour="notebook-entry"]').first().click()
    const dialog = page.locator('[role="dialog"][aria-label="記事本"]')
    await dialog.waitFor({ state: 'visible', timeout: 10000 })
    await dialog.getByRole('button', { name: '關閉' }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 5000 })
    return 'dialog gone after X click'
  })

  // ---- backdrop click closes it ----
  await step('backdrop click closes overlay', async () => {
    await page.locator('[data-tour="notebook-entry"]').first().click()
    const dialog = page.locator('[role="dialog"][aria-label="記事本"]')
    await dialog.waitFor({ state: 'visible', timeout: 10000 })
    // click far top-left corner, outside the centered panel
    await page.mouse.click(10, 10)
    await dialog.waitFor({ state: 'hidden', timeout: 5000 })
    return 'dialog gone after backdrop click'
  })

  // ---- mobile: overlay is full-screen ----
  await step('mobile overlay is full-screen (390px)', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await sleep(500)
    // mobile entry lives in the overflow ("更多") menu
    const overflowBtn = page.getByRole('button', { name: '更多' })
    await overflowBtn.waitFor({ state: 'visible', timeout: 10000 })
    await overflowBtn.click()
    await page.locator('[data-tour="notebook-entry"]').first().click()
    const dialog = page.locator('[role="dialog"][aria-label="記事本"]')
    await dialog.waitFor({ state: 'visible', timeout: 10000 })
    await sleep(500)
    const box = await dialog.boundingBox()
    await shot('02-mobile-overlay-fullscreen')
    if (!box) throw new Error('no bounding box for dialog')
    const vp = page.viewportSize()
    if (Math.abs(box.width - vp.width) > 2 || Math.abs(box.height - vp.height) > 2) {
      throw new Error(`dialog box ${JSON.stringify(box)} does not match viewport ${JSON.stringify(vp)}`)
    }
    await page.keyboard.press('Escape')
    await sleep(300)
    return `dialog fills viewport: ${Math.round(box.width)}x${Math.round(box.height)}`
  })

  // ---- direct /notebook route still works as a full page ----
  await step('/notebook route still works standalone', async () => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
    await page.locator('button[title="返回面板"]').waitFor({ state: 'visible', timeout: 20000 })
    await sleep(500)
    // must NOT be inside a role=dialog — it's the bare full-page shell
    const insideDialog = await page.locator('[role="dialog"] button[title="返回面板"]').count()
    if (insideDialog !== 0) throw new Error('full-page route rendered inside a dialog — expected bare page shell')
    await shot('03-standalone-notebook-route')
    await page.locator('button[title="返回面板"]').click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 15000 })
    return 'full-page shell renders, 返回面板 navigates back to /'
  })

  // ---- console errors ----
  await step('no page errors', async () => {
    if (pageErrors.length) throw new Error(pageErrors.slice(0, 3).join(' | '))
  })

  writeFileSync(path.join(SHOT_DIR, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`\n${results.filter((r) => r.passed).length}/${results.length} passed`)
  await browser.close()
}

main()
  .catch((e) => { console.error(e); exitCode = 1 })
  .finally(() => {
    if (devServer?.pid) { try { process.kill(-devServer.pid) } catch {} }
    process.exit(exitCode)
  })
