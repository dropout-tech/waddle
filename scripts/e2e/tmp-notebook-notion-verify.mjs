#!/usr/bin/env node
/**
 * TEMP verify script for the Notion-style notebook upgrade:
 * slash menu, selection bubble menu, icon picker, desktop toolbar removal,
 * mobile keyboard toolbar intact. Deterministic assertions + screenshots.
 * Run: node scripts/e2e/tmp-notebook-notion-verify.mjs   (from repo root)
 * Delete after the session — not part of the permanent suite.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = Number(process.env.E2E_PORT || 3124)
const BASE_URL = `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-08-notebook-notion-shots')
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

const NOTE_TITLE = `Notion驗證 ${Date.now() % 100000}`

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

  const pm = () => page.locator('.ProseMirror').first()

  // ---- login ----
  await step('login', async () => {
    await fetch(`${BASE_URL}/login`).catch(() => {})
    await fetch(`${BASE_URL}/notebook`).catch(() => {})
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

  // ---- open notebook, create a note ----
  await step('open /notebook and create note', async () => {
    await page.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
    const addBtn = page.getByRole('button', { name: '新增記事' })
    await addBtn.waitFor({ state: 'visible', timeout: 60000 })
    await sleep(800) // notes load
    await addBtn.click()
    await page.locator('input[placeholder="無標題"]').waitFor({ state: 'visible', timeout: 15000 })
  })

  // ---- desktop: fixed toolbar must be gone ----
  await step('desktop has no fixed toolbar', async () => {
    // before any selection, no 粗體 button should exist anywhere (the old
    // fixed toolbar rendered one permanently; bubble menu is not open yet)
    const boldCount = await page.locator('button[title="粗體"]').count()
    if (boldCount !== 0) throw new Error(`found ${boldCount} 粗體 button(s) — fixed toolbar still renders`)
    // undo button was also toolbar-only
    const undoCount = await page.locator('button[title*="復原"], button[aria-label*="復原"]').count()
    if (undoCount !== 0) throw new Error('undo button still present on desktop')
  })

  // ---- title + placeholder ----
  await step('title input + slash placeholder', async () => {
    const title = page.locator('input[placeholder="無標題"]')
    await title.fill(NOTE_TITLE)
    await title.press('Enter') // jumps into the content editor
    await sleep(300)
    const ph = await page.evaluate(() => {
      const el = document.querySelector('.ProseMirror p')
      return el ? el.getAttribute('data-placeholder') : null
    })
    if (!ph || !ph.includes('「/」')) throw new Error(`paragraph placeholder is ${JSON.stringify(ph)}`)
    return `placeholder="${ph}"`
  })

  // ---- slash menu opens with 11 items ----
  await step('slash menu opens with 11 items', async () => {
    await page.keyboard.type('/')
    await page.locator('.nb-slash-menu [role="listbox"]').waitFor({ state: 'visible', timeout: 5000 })
    const count = await page.locator('.nb-slash-menu [role="option"]').count()
    if (count !== 11) throw new Error(`expected 11 items, got ${count}`)
    await shot('01-slash-menu-open')
    return `11 items, menu visible`
  })

  // ---- filter + insert heading 2 ----
  await step('filter "h2" and insert 標題 2', async () => {
    await page.keyboard.type('h2')
    await sleep(250)
    const labels = await page.locator('.nb-slash-menu [role="option"]').allInnerTexts()
    if (labels.length !== 1 || !labels[0].includes('標題 2')) throw new Error(`filter gave: ${JSON.stringify(labels)}`)
    await page.keyboard.press('Enter')
    await sleep(250)
    await page.keyboard.type('章節標題')
    const h2 = await pm().locator('h2').count()
    if (h2 !== 1) throw new Error(`expected 1 h2, got ${h2}`)
  })

  // ---- insert todo via 中文 filter ----
  await step('insert 待辦清單 via /待辦', async () => {
    await page.keyboard.press('Enter')
    await page.keyboard.type('/待辦')
    await page.locator('.nb-slash-menu [role="option"]').first().waitFor({ state: 'visible', timeout: 5000 })
    await page.keyboard.press('Enter')
    await sleep(250)
    await page.keyboard.type('買牛奶')
    const items = await pm().locator('ul[data-type="taskList"] li').count()
    if (items < 1) throw new Error('no task list item created')
  })

  // ---- Escape closes the menu ----
  await step('Escape closes slash menu', async () => {
    // leave the todo list first (Enter creates an item; Enter on empty exits)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await page.locator('.nb-slash-menu [role="listbox"]').waitFor({ state: 'visible', timeout: 5000 })
    await page.keyboard.press('Escape')
    await sleep(300)
    const open = await page.locator('.nb-slash-menu [role="listbox"]').count()
    if (open !== 0) throw new Error('menu still open after Escape')
    await page.keyboard.press('Backspace') // remove the bare "/"
  })

  // ---- bubble menu on selection + bold ----
  await step('selection bubble menu + bold works', async () => {
    await page.keyboard.type('選取這段文字')
    await page.keyboard.press('Shift+Home')
    const bold = page.locator('button[title="粗體"]')
    await bold.waitFor({ state: 'visible', timeout: 5000 })
    await shot('02-bubble-menu')
    await bold.click()
    await sleep(300)
    const strongText = await pm().locator('strong').allInnerTexts()
    if (!strongText.some((t) => t.includes('選取這段文字'))) throw new Error(`no bold text, strong=${JSON.stringify(strongText)}`)
    return 'bubble menu shown, bold applied'
  })

  // ---- icon picker ----
  await step('icon picker sets note icon', async () => {
    await page.getByRole('button', { name: '加入圖示' }).click()
    // scope to the popover — sidebar rows of older notes can also expose an
    // emoji in their accessible name and trip strict mode
    const pop = page.locator('[data-radix-popper-content-wrapper]')
    const penguin = pop.getByRole('button', { name: '🐧' })
    await penguin.waitFor({ state: 'visible', timeout: 5000 })
    await penguin.click()
    await sleep(400)
    await page.keyboard.press('Escape') // belt & braces: ensure popover closed
    const btn = page.getByRole('button', { name: '更換圖示' })
    await btn.waitFor({ state: 'visible', timeout: 5000 })
    const txt = (await btn.innerText()).trim()
    if (!txt.includes('🐧')) throw new Error(`icon button shows ${JSON.stringify(txt)}`)
    return 'icon 🐧 set'
  })

  // ---- bubble menu on FIRST line must not cover the title (flip check) ----
  await step('bubble menu flips below on first-line selection', async () => {
    await pm().locator('h2').click()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+Home')
    const menu = page.locator('button[title="粗體"]')
    await menu.waitFor({ state: 'visible', timeout: 5000 })
    const menuBox = await menu.boundingBox()
    const titleBox = await page.locator('input[placeholder="無標題"]').boundingBox()
    if (menuBox.y < titleBox.y + titleBox.height - 2)
      throw new Error(`menu y=${Math.round(menuBox.y)} overlaps title (bottom=${Math.round(titleBox.y + titleBox.height)})`)
    await shot('05-bubble-first-line')
    await page.keyboard.press('ArrowRight') // clear selection
    return `menu y=${Math.round(menuBox.y)}, title bottom=${Math.round(titleBox.y + titleBox.height)}`
  })

  // ---- desktop header promote entry ----
  await step('desktop 升級為任務 button in header', async () => {
    await page.getByRole('button', { name: '升級為任務' }).waitFor({ state: 'visible', timeout: 5000 })
    await shot('03-desktop-final')
  })

  // ---- mobile: keyboard toolbar intact, no bubble menu component ----
  await step('mobile keyboard toolbar intact (390px)', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await sleep(600)
    // single-pane: we might land on the list — open our note if so
    const row = page.getByText(NOTE_TITLE, { exact: false }).first()
    if (await row.isVisible().catch(() => false)) {
      await row.click()
      await sleep(400)
    }
    await page.locator('input[placeholder="無標題"]').waitFor({ state: 'visible', timeout: 10000 })
    // focus the editor → the docked toolbar should render (mobile-only branch)
    await pm().click()
    await sleep(400)
    const boldBtn = page.locator('button[title="粗體"]')
    const cnt = await boldBtn.count()
    if (cnt === 0) throw new Error('mobile toolbar missing after focusing editor')
    await shot('04-mobile-editor')
    return `mobile toolbar renders (${cnt} 粗體 button)`
  })

  // ---- console errors ----
  await step('no page errors', async () => {
    if (pageErrors.length) throw new Error(pageErrors.slice(0, 3).join(' | '))
  })

  // ---- best-effort cleanup: this run's note + older test-run leftovers ----
  await step('cleanup test notes (best effort)', async () => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await sleep(500)
    const patterns = [NOTE_TITLE, 'Notion驗證', '標題偵錯', 'debug']
    let deleted = 0
    for (const pattern of patterns) {
      for (let i = 0; i < 6; i++) {
        const row = page.getByText(pattern, { exact: false }).first()
        if (!(await row.isVisible().catch(() => false))) break
        await row.hover()
        await page.getByRole('button', { name: '刪除記事' }).first().click()
        await sleep(200)
        await page.getByRole('button', { name: '刪除', exact: true }).first().click().catch(() => {})
        await sleep(600)
        deleted++
      }
    }
    return `deleted ${deleted} test note(s)`
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
