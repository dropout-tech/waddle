#!/usr/bin/env node
/**
 * TEMP verify: production deploy of PR #5 (notebook categories + overlay)
 * against https://waddle.zeabur.app using the e2e test account.
 * Creates one category then deletes it (test-account data only).
 * Run: node scripts/e2e/tmp-prod-deploy-verify.mjs
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = 'https://waddle.zeabur.app'
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-12-prod-deploy-shots')
mkdirSync(SHOT_DIR, { recursive: true })
const CAT_NAME = `PROD驗證-${Date.now().toString().slice(-6)}`

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

let exitCode = 0
const results = []

async function main() {
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

  await step('login on production', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').waitFor({ state: 'visible', timeout: 60000 })
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
    await sleep(2000)
  })

  await step('notebook opens as OVERLAY (new build marker) — URL unchanged', async () => {
    const entry = page.locator('[data-tour="notebook-entry"]').first()
    await entry.waitFor({ state: 'visible', timeout: 20000 })
    await entry.click()
    await page.locator('button[aria-label="新增記事"]').waitFor({ state: 'visible', timeout: 20000 })
    const url = new URL(page.url())
    if (url.pathname !== '/') throw new Error(`navigated to ${url.pathname} — old build still live?`)
    await shot('01-overlay-open')
    return 'overlay opened, path stayed /'
  })

  await step('category sidebar renders (未分類 + 新增分類)', async () => {
    await page.getByText('未分類', { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 })
    await page.locator('button[aria-label="新增分類"]').waitFor({ state: 'visible', timeout: 5000 })
  })

  await step('create + delete one category (prod write path)', async () => {
    await page.locator('button[aria-label="新增分類"]').click()
    const input = page.locator('input[placeholder="分類名稱…"]')
    await input.waitFor({ state: 'visible', timeout: 5000 })
    await input.fill(CAT_NAME)
    await page.keyboard.press('Enter')
    await page.getByText(CAT_NAME, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 })
    await sleep(1500)
    await shot('02-prod-category-created')
    await page.getByText(CAT_NAME, { exact: true }).first().hover()
    await page.locator('button[aria-label="刪除分類"]').first().click()
    await page.getByRole('button', { name: '刪除', exact: true }).first().click()
    await page.getByText(CAT_NAME, { exact: true }).waitFor({ state: 'detached', timeout: 15000 })
    return 'INSERT + DELETE round-tripped on production DB'
  })

  await step('Esc closes overlay, calendar still alive', async () => {
    await page.keyboard.press('Escape')
    await sleep(800)
    await page.locator('[role="toolbar"][aria-label="日曆導航"]').waitFor({ state: 'visible', timeout: 10000 })
    await shot('03-overlay-closed')
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
  .finally(() => process.exit(exitCode))
