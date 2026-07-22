#!/usr/bin/env node
/**
 * Deterministic reproduction + regression test for the "complete a
 * just-created task → completion silently lost" race (UPDATE reaching the
 * DB before the task's INSERT).
 *
 * Forces the race every time by delaying the INSERT (POST /rest/v1/tasks)
 * 3s via route interception, then clicking the checkbox inside that window.
 * Logs every tasks request/response + the app's console errors so the
 * failing leg is visible, not inferred.
 *
 * PRE-FIX expectation: FAIL (completion not persisted after reload).
 * POST-FIX expectation: PASS (the app holds the UPDATE until the INSERT
 * lands — first attempt persists, no error toast).
 *
 * Run: node scripts/e2e/tmp-task-complete-race-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3103
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL
const BASE_URL = EXTERNAL_BASE_URL || `http://localhost:${PORT}`
const INSERT_DELAY_MS = 3000
const CAT = `RACETEST分類${Date.now() % 10000}`
const TASK = 'RACETEST任務'

function loadEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}
const envFile = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || envFile.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || envFile.E2E_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('missing e2e creds'); process.exit(1) }

let devServer
let exitCode = 0
const results = []

function startDevServer() {
  devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
    cwd: process.cwd(), detached: true, stdio: ['ignore', 'ignore', 'ignore'],
  })
}
function stopDevServer() {
  if (!devServer?.pid) return
  try { process.kill(-devServer.pid, 'SIGTERM') } catch {}
}
async function waitForServerReady() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE_URL); if (r.status < 500) return } catch {}
    await sleep(500)
  }
  throw new Error('dev server not ready')
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

async function main() {
  if (!EXTERNAL_BASE_URL) { startDevServer(); await waitForServerReady() }
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  // ── Observability: every tasks request/response + app console errors ──
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.text().includes('toggleTaskComplete')) {
      console.log(`   [console.${msg.type()}] ${msg.text().slice(0, 200)}`)
    }
  })
  page.on('response', async (res) => {
    const url = res.request().url()
    if (!/\/rest\/v1\/tasks/.test(url)) return
    const method = res.request().method()
    let body = ''
    try { body = (await res.text()).slice(0, 120) } catch {}
    console.log(`   [net] ${method} ${res.status()} ${body}`)
  })

  const catRoot = () => page
    .getByText(CAT, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"mb-3")][1]')

  await step('login', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 30000 })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 30000 })
  })

  await step('建立測試分類', async () => {
    await page.locator('button[aria-label*="新增分類"]').first().click()
    await page.locator('input[placeholder="分類名稱..."]').fill(CAT)
    await page.keyboard.press('Enter')
    await page.getByText(CAT, { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    await sleep(2000) // let the category INSERT land — we only race the task
  })

  await step(`攔截啟用：任務 INSERT 延遲 ${INSERT_DELAY_MS}ms（強制重現競態）`, async () => {
    await page.route('**/rest/v1/tasks**', async (route) => {
      if (route.request().method() === 'POST') {
        console.log(`   [route] holding INSERT for ${INSERT_DELAY_MS}ms`)
        await sleep(INSERT_DELAY_MS)
      }
      await route.continue()
    })
  })

  await step('建任務並「立刻」勾完成（在 INSERT 落地前）', async () => {
    await catRoot().locator('button:has-text("新增任務")').click()
    await catRoot().locator('input[placeholder="輸入任務名稱..."]').fill(TASK)
    await page.keyboard.press('Enter')
    await catRoot().getByText(TASK).waitFor({ state: 'visible', timeout: 5000 })
    // Click the checkbox well inside the 3s INSERT hold.
    await catRoot().locator('[role="checkbox"]').first().click()
    await sleep(INSERT_DELAY_MS + 4000) // let both requests fully settle
  })

  await step('【判準】重載後完成狀態仍在（第一次寫入就持久化）', async () => {
    await page.unroute('**/rest/v1/tasks**')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 30000 })
    await sleep(3000)
    const doneCount = await catRoot().locator('button:has-text("已完成")').count()
    if (doneCount === 0) {
      const text = (await catRoot().innerText().catch(() => '(category missing)')).replace(/\n/g, ' | ').slice(0, 200)
      throw new Error(`completion LOST after reload — catText="${text}"`)
    }
  })

  await step('清理：刪除測試分類（重載確認持久刪除）', async () => {
    page.once('dialog', (d) => d.accept())
    await catRoot().locator('button[aria-label*="刪除分類"]').click()
    await page.getByText(CAT, { exact: true }).waitFor({ state: 'detached', timeout: 10000 })
    await sleep(2500)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 30000 })
    await sleep(3000)
    const leftover = await page.getByText(/RACETEST/).count()
    if (leftover !== 0) throw new Error(`RACETEST residue after reload (${leftover})`)
  })

  await browser.close()
  console.log('')
  console.log(`${results.filter(r => r.passed).length}/${results.length} steps passed`)
}

main()
  .catch((e) => { console.error('FATAL:', e); exitCode = 1 })
  .finally(() => { stopDevServer(); process.exit(exitCode) })
