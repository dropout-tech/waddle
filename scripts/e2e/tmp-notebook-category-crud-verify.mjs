#!/usr/bin/env node
/**
 * TEMP verify script: notebook category REAL CRUD against the live DB
 * (migration 0015 is applied). Creates a category, creates a note, moves it
 * in, renames the category, deletes the category (note must fall back to
 * 未分類), then cleans up the note. Run from repo root:
 *   node scripts/e2e/tmp-notebook-category-crud-verify.mjs
 * Delete after the session — not part of the permanent suite.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = Number(process.env.E2E_PORT || 3132)
const BASE_URL = `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-12-notebook-crud-shots')
mkdirSync(SHOT_DIR, { recursive: true })

const STAMP = `CRUD${Date.now().toString().slice(-6)}`
const CAT_NAME = `驗證分類-${STAMP}`
const CAT_RENAMED = `驗證改名-${STAMP}`
const NOTE_TITLE = `驗證筆記-${STAMP}`

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

  await step('login', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').waitFor({ state: 'visible', timeout: 90000 })
    await page.waitForLoadState('networkidle').catch(() => {})
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

  await step('open /notebook', async () => {
    await page.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
    await page.locator('button[aria-label="新增記事"]').waitFor({ state: 'visible', timeout: 60000 })
    await sleep(1200)
  })

  await step('create category (real INSERT)', async () => {
    await page.locator('button[aria-label="新增分類"]').click()
    const input = page.locator('input[placeholder="分類名稱…"]')
    await input.waitFor({ state: 'visible', timeout: 5000 })
    await input.fill(CAT_NAME)
    await page.keyboard.press('Enter')
    await page.getByText(CAT_NAME, { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    await sleep(1500) // let the INSERT round-trip settle
    await shot('01-category-created')
  })

  await step('category survives reload (server-persisted)', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText(CAT_NAME, { exact: true }).waitFor({ state: 'visible', timeout: 15000 })
  })

  await step('create note (INSERT with category_id column live)', async () => {
    await page.locator('button[aria-label="新增記事"]').click()
    const titleBox = page.locator('input[placeholder="無標題"]')
    await titleBox.waitFor({ state: 'visible', timeout: 10000 })
    await titleBox.click()
    await titleBox.fill(NOTE_TITLE)
    await sleep(2500) // autosave debounce + PATCH round-trip
    await page.getByText(NOTE_TITLE, { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 })
    await shot('02-note-created')
  })

  await step('move note into category', async () => {
    const row = page.getByText(NOTE_TITLE, { exact: true }).first()
    await row.hover()
    await page.locator('button[aria-label="移到分類"]').first().click()
    await page.getByRole('menuitem', { name: CAT_NAME }).click()
    await sleep(1500)
    await shot('03-note-moved')
  })

  await step('move persists after reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText(CAT_NAME, { exact: true }).waitFor({ state: 'visible', timeout: 15000 })
    await page.getByText(NOTE_TITLE, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 })
  })

  await step('rename category (real UPDATE)', async () => {
    // the category name button is titled 雙擊改名 — rename via double-click
    await page.getByText(CAT_NAME, { exact: true }).first().dblclick()
    const input = page.locator('input:focus')
    await input.waitFor({ state: 'visible', timeout: 5000 })
    await input.fill(CAT_RENAMED)
    await page.keyboard.press('Enter')
    await page.getByText(CAT_RENAMED, { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    await sleep(1200)
    await shot('04-category-renamed')
  })

  await step('delete category → note falls back to 未分類 (ON DELETE SET NULL)', async () => {
    // reload first: right after rename the row is still in edit-mode layout
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(2000)
    const catLabel = page.getByText(CAT_RENAMED, { exact: true }).first()
    await catLabel.hover()
    await page.locator('button[aria-label="刪除分類"]').first().click()
    // inline two-step confirm: a small 「刪除」 button appears next to 取消
    await page.getByRole('button', { name: '刪除', exact: true }).first().click()
    await sleep(1500)
    await page.getByText(CAT_RENAMED, { exact: true }).waitFor({ state: 'detached', timeout: 10000 })
    // the note must still exist (under 未分類), NOT be deleted with the folder
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText(NOTE_TITLE, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 })
    await shot('05-category-deleted-note-survives')
  })

  await step('cleanup: delete test note', async () => {
    page.once('dialog', (d) => d.accept())
    const row = page.getByText(NOTE_TITLE, { exact: true }).first()
    await row.hover()
    await page.locator('button[aria-label="刪除記事"]').first().click()
    await sleep(500)
    const confirmBtn = page.getByRole('button', { name: /刪除|確定/, exact: false }).last()
    if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click()
    await sleep(1500)
  })

  await step('sweep stray test categories from earlier runs', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(2000)
    for (let i = 0; i < 6; i++) {
      const stray = page.getByText(/^驗證(分類|改名)-CRUD\d+$/).first()
      if (!(await stray.isVisible().catch(() => false))) break
      const label = await stray.textContent()
      await stray.hover()
      await page.locator('button[aria-label="刪除分類"]').first().click()
      await page.getByRole('button', { name: '刪除', exact: true }).first().click()
      await sleep(1200)
      console.log(`   swept: ${label}`)
    }
    const remaining = await page.getByText(/^驗證(分類|改名)-CRUD\d+$/).count()
    if (remaining > 0) throw new Error(`${remaining} stray test categories left`)
  })

  await step('no page errors', async () => {
    if (pageErrors.length) throw new Error(pageErrors.slice(0, 5).join(' | '))
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
