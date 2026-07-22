#!/usr/bin/env node
/**
 * Verifies the task-panel changes: (a) add-category moved to a ＋ on each
 * workspace header (old bottom button gone; inline input opens right under
 * the header), (b) per-category list order is now 未完成 → 新增任務 → 已完成.
 * Creates a throwaway category + 2 tasks on the test account and deletes
 * them at the end (net-zero DB state). Not committed (tmp- prefix).
 *
 * Run: node scripts/e2e/tmp-panel-order-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3103
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL
const BASE_URL = EXTERNAL_BASE_URL || `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-14-panel-order-shots', EXTERNAL_BASE_URL ? 'prod' : '')
mkdirSync(SHOT_DIR, { recursive: true })

const CAT = `PANELTEST分類${Date.now() % 10000}`
const TASK1 = 'PANELTEST任務一'
const TASK2 = 'PANELTEST任務二'

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
  console.error('[panel-verify] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
  process.exit(1)
}

let devServer
let exitCode = 0
const results = []
const pageErrors = []

async function waitForServerReady(timeoutMs = 60000) {
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

const yOf = async (locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element has no bounding box')
  return box.y
}

async function main() {
  if (!EXTERNAL_BASE_URL) {
    startDevServer()
    await waitForServerReady()
  }

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', (err) => { pageErrors.push(err.message); console.log(`[pageerror] ${err.message}`) })

  // Category root = nearest section wrapper around the category-name span.
  const catRoot = (p = page) => p
    .getByText(CAT, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"mb-3")][1]')

  await step('login', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
  })

  await step('舊「新增分類」底部文字按鈕已移除', async () => {
    const n = await page.locator('button:has-text("新增分類")').count()
    if (n !== 0) throw new Error(`expected 0 bottom text buttons, found ${n}`)
  })

  await step('每個 workspace 標題右側都有常駐 ＋（不需 hover）', async () => {
    const plusButtons = page.locator('button[aria-label*="新增分類"]')
    const n = await plusButtons.count()
    if (n < 1) throw new Error('no header ＋ buttons found')
    await plusButtons.first().waitFor({ state: 'visible' })
    console.log(`   workspaces with header ＋: ${n}`)
  })

  await step('點 ＋ → 輸入框出現在該 workspace 分類清單「最上方」', async () => {
    await page.locator('button[aria-label*="新增分類"]').first().click()
    const input = page.locator('input[placeholder="分類名稱..."]')
    await input.waitFor({ state: 'visible', timeout: 5000 })
    const isFirstChild = await input.evaluate((el) => {
      const row = el.closest('div')
      return row?.parentElement?.firstElementChild === row
    })
    if (!isFirstChild) throw new Error('inline input is not the first child of the categories container')
    await page.screenshot({ path: path.join(SHOT_DIR, '01-desktop-header-plus-input.png') })
  })

  await step('輸入名稱 Enter → 分類建立', async () => {
    await page.locator('input[placeholder="分類名稱..."]').fill(CAT)
    await page.keyboard.press('Enter')
    await page.getByText(CAT, { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  })

  await step('新分類內建兩個任務、完成其中一個', async () => {
    await catRoot().locator('button:has-text("新增任務")').click()
    const taskInput = catRoot().locator('input[placeholder="輸入任務名稱..."]')
    await taskInput.fill(TASK1)
    await page.keyboard.press('Enter')
    await catRoot().getByText(TASK1).waitFor({ state: 'visible', timeout: 10000 })
    await catRoot().locator('button:has-text("新增任務")').click()
    await catRoot().locator('input[placeholder="輸入任務名稱..."]').fill(TASK2)
    await page.keyboard.press('Enter')
    await catRoot().getByText(TASK2).waitFor({ state: 'visible', timeout: 10000 })
    // Complete task 1 via its row checkbox.
    await catRoot()
      .locator(`[role="checkbox"]`).first().click()
    await catRoot().locator('button:has-text("已完成")').waitFor({ state: 'visible', timeout: 10000 })
  })

  await step('完成狀態確實寫入資料庫（重載仍在；防既有的靜默失敗競態）', async () => {
    // Pre-existing data-layer race (NOT this PR): toggling a task complete
    // shortly after creating it can silently fail to persist — the UI keeps
    // the optimistic state but a reload reverts. Ensure the precondition
    // for the order assertions is a *persisted* completed task, retrying
    // the toggle if the first write got lost.
    let persisted = false
    for (let attempt = 0; attempt < 4 && !persisted; attempt++) {
      await sleep(3000) // let the UPDATE round-trip land
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
      await sleep(2500)
      if ((await catRoot().locator('button:has-text("已完成")').count()) > 0) {
        persisted = true
        break
      }
      console.log(`   completion not persisted (attempt ${attempt + 1}) — re-toggling`)
      await catRoot().locator('[role="checkbox"]').first().click()
      await catRoot().locator('button:has-text("已完成")').waitFor({ state: 'visible', timeout: 10000 })
    }
    if (!persisted) throw new Error('completion never persisted after 4 attempts')
  })

  await step('【核心】順序 = 未完成任務 → 新增任務 → 已完成', async () => {
    const remainingY = await yOf(catRoot().getByText(TASK2).first()
      .or(catRoot().getByText(TASK1).first()))
    const addY = await yOf(catRoot().locator('button:has-text("新增任務")'))
    const doneY = await yOf(catRoot().locator('button:has-text("已完成")'))
    if (!(remainingY < addY)) throw new Error(`incomplete task (y=${remainingY}) should be above 新增任務 (y=${addY})`)
    if (!(addY < doneY)) throw new Error(`新增任務 (y=${addY}) should be above 已完成 (y=${doneY})`)
    console.log(`   y: task=${Math.round(remainingY)} < add=${Math.round(addY)} < done=${Math.round(doneY)}`)
    await page.screenshot({ path: path.join(SHOT_DIR, '02-desktop-order.png') })
  })

  await step('展開「已完成」→ 完成的任務列在切換列下方', async () => {
    const toggle = catRoot().locator('button:has-text("已完成")')
    await toggle.click()
    // Completed rows render their title with line-through.
    const doneTitle = catRoot().locator('span.line-through').first()
    await doneTitle.waitFor({ state: 'visible', timeout: 5000 })
    const toggleY = await yOf(toggle)
    const doneY = await yOf(doneTitle)
    if (!(doneY > toggleY)) throw new Error('expanded completed task should render below the 已完成 toggle')
  })

  await step('手機 390×844：＋ 可見、順序一致', async () => {
    const mob = await context.newPage()
    mob.on('pageerror', (err) => { pageErrors.push(err.message) })
    await mob.setViewportSize({ width: 390, height: 844 })
    await mob.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    // Mobile boots on the calendar tab (main-layout.tsx:122) — wait for the
    // bottom tab bar to hydrate, then switch to the tasks tab (role="tab",
    // not "button" — see the tablist nav in main-layout.tsx).
    const tasksTab = mob.getByRole('tab', { name: '任務', exact: true })
    await tasksTab.waitFor({ state: 'visible', timeout: 20000 })
    // Next dev-mode floating dev-tools button (<nextjs-portal>) overlaps the
    // bottom tab bar at 390px and intercepts taps — dev-only chrome that
    // doesn't exist in production builds; drop it before tapping.
    await mob.evaluate(() => document.querySelector('nextjs-portal')?.remove()).catch(() => {})
    await tasksTab.click()
    const plus = mob.locator('button[aria-label*="新增分類"]').first()
    await plus.waitFor({ state: 'visible', timeout: 15000 })
    await mob.getByText(CAT, { exact: true }).scrollIntoViewIfNeeded()
    const mCat = catRoot(mob)
    const addY = await yOf(mCat.locator('button:has-text("新增任務")'))
    const doneBtn = mCat.locator('button:has-text("已完成")')
    // Diagnostic split (prod-only failure): is the completed task missing
    // from the freshly-fetched data (PATCH never landed?) or filtered out?
    if ((await doneBtn.count()) === 0) {
      await sleep(4000) // maybe the fetch raced the completion PATCH — give it one more beat
    }
    if ((await doneBtn.count()) === 0) {
      const mobileText = (await mCat.innerText()).replace(/\n/g, ' | ').slice(0, 300)
      const desktopBefore = await catRoot().locator('button:has-text("已完成")').count()
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
      await sleep(3000)
      const desktopAfterReload = await catRoot().locator('button:has-text("已完成")').count()
      throw new Error(
        `mobile has no 已完成 — mobileText="${mobileText}" desktopBefore=${desktopBefore} desktopAfterReload=${desktopAfterReload} `
        + '(afterReload=0 → completion PATCH never persisted; =1 → mobile-only filtering)',
      )
    }
    const doneY = await yOf(doneBtn)
    if (!(addY < doneY)) throw new Error(`mobile: 新增任務 (y=${addY}) should be above 已完成 (y=${doneY})`)
    await mob.screenshot({ path: path.join(SHOT_DIR, '03-mobile-order.png') })
    await mob.close()
  })

  await step('清理：刪除測試分類（連同兩個任務），重載確認持久刪除', async () => {
    page.once('dialog', (d) => d.accept())
    await catRoot().locator(`button[aria-label*="刪除分類"]`).click()
    await page.getByText(CAT, { exact: true }).waitFor({ state: 'detached', timeout: 10000 })
    // The detached assert only proves the optimistic UI removal — give the
    // DELETE round-trip time to land, then reload to prove it persisted
    // (closing the browser too fast aborts the in-flight request; that
    // exact mistake leaked 4 categories across earlier runs).
    await sleep(2500)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    await sleep(3000)
    const leftover = await page.getByText(/PANELTEST/).count()
    if (leftover !== 0) throw new Error(`category still present after reload — DB delete did not stick (${leftover} nodes)`)
  })

  await step('全程無 page error', async () => {
    if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join(' | ')}`)
  })

  await browser.close()
  writeFileSync(path.join(SHOT_DIR, 'results.json'), JSON.stringify({ when: new Date().toISOString(), baseUrl: BASE_URL, results }, null, 2))
  console.log('')
  console.log(`${results.filter(r => r.passed).length}/${results.length} steps passed`)
}

main()
  .catch((e) => { console.error('FATAL:', e); exitCode = 1 })
  .finally(() => { stopDevServer(); process.exit(exitCode) })
