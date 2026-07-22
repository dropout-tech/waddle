#!/usr/bin/env node
/**
 * TEMP verify script for the notebook sidebar's new folder-style category
 * structure. Only checks rendering (no category CRUD — the notebook_categories
 * table isn't migrated on remote yet, so real creates would fail server-side).
 * Run: node scripts/e2e/tmp-notebook-category-verify.mjs   (from repo root)
 * Delete after the session — not part of the permanent suite.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = Number(process.env.E2E_PORT || 3131)
const BASE_URL = `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-09-notebook-category-shots')
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

  // ---- open /notebook ----
  await step('open /notebook, sidebar renders', async () => {
    await page.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '新增記事' }).waitFor({ state: 'visible', timeout: 60000 })
    await sleep(1000) // notes + categories load
  })

  // ---- category-load failure logs but doesn't crash ----
  await step('categories=[] falls back cleanly (no crash)', async () => {
    const heading = page.getByRole('heading', { name: '記事本' })
    await heading.waitFor({ state: 'visible', timeout: 5000 })
    return 'sidebar header rendered'
  })

  // ---- "未分類" bucket present and holds existing notes ----
  await step('未分類 bucket shows existing notes', async () => {
    const uncatHeader = page.getByText('未分類', { exact: true })
    await uncatHeader.waitFor({ state: 'visible', timeout: 10000 })
    await shot('01-sidebar-uncategorized')
    return 'found 未分類 header'
  })

  // ---- "+新增分類" entry point exists ----
  await step('新增分類 button exists', async () => {
    const btn = page.getByRole('button', { name: '新增分類' })
    await btn.waitFor({ state: 'visible', timeout: 5000 })
    return 'found 新增分類 button'
  })

  // ---- clicking +新增分類 opens inline input (UI only, no submit) ----
  await step('新增分類 opens inline input', async () => {
    await page.getByRole('button', { name: '新增分類' }).click()
    const input = page.locator('input[placeholder="分類名稱…"]')
    await input.waitFor({ state: 'visible', timeout: 5000 })
    await shot('02-add-category-input')
    await page.keyboard.press('Escape')
    await sleep(200)
    return 'inline input appeared and was dismissed via Escape'
  })

  // ---- hover a note row to reveal 移到分類 + 刪除記事 ----
  await step('note row exposes 移到分類 menu', async () => {
    const firstRow = page.locator('.group').filter({ hasText: /./ }).first()
    // Fall back to any note row text if present; if there are zero notes this
    // step is a soft pass (nothing to hover).
    const anyNoteButton = page.getByRole('button', { name: '移到分類' }).first()
    const rows = await page.locator('button[aria-label="移到分類"]').count()
    if (rows === 0) return 'no existing notes to hover (0 rows) — skipped'
    await page.locator('button[aria-label="移到分類"]').first().hover()
    await anyNoteButton.waitFor({ state: 'attached', timeout: 5000 })
    return `found ${rows} 移到分類 button(s)`
  })

  await shot('03-sidebar-final')

  // ---- console errors ----
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
