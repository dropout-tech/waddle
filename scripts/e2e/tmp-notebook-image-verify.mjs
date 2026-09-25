#!/usr/bin/env node
/**
 * TEMP verify script for the notebook image-upload feature: slash-insert an
 * image (uploaded to Supabase Storage, not base64), persistence across
 * reload, and a regression check on the pre-existing 收合 (details/toggle)
 * block. Deterministic assertions + screenshots.
 * Run: node scripts/e2e/tmp-notebook-image-verify.mjs   (from repo root)
 * Delete after the session — not part of the permanent suite.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = Number(process.env.E2E_PORT || 3124)
const BASE_URL = `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-21-notebook-image-shots')
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

const NOTE_TITLE = `圖片驗證 ${Date.now() % 100000}`

// A tiny (67-byte) valid 1x1 transparent PNG — the standard placeholder pixel
// used across the web for exactly this kind of test fixture.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const PNG_PATH = path.join(SHOT_DIR, 'fixture-1x1.png')
writeFileSync(PNG_PATH, Buffer.from(PNG_BASE64, 'base64'))

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
  // Force the UI into 中文 — a concurrent i18n branch auto-detects browser
  // language and would render English labels, breaking every selector below.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW' })
  await context.addInitScript(() => {
    try { window.localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {}
  })
  const page = await context.newPage()
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
    const addBtn = page.getByRole('button', { name: '新增記事' }).first()
    await addBtn.waitFor({ state: 'visible', timeout: 60000 })
    await sleep(800) // notes load
    await addBtn.click()
    await page.locator('input[placeholder="無標題"]').waitFor({ state: 'visible', timeout: 15000 })
    await page.locator('input[placeholder="無標題"]').fill(NOTE_TITLE)
    await pm().click()
  })

  // ---- slash "圖片" filters correctly ----
  await step('slash filters "image" to the 圖片 item', async () => {
    await page.keyboard.type('/image')
    await page.locator('.nb-slash-menu [role="listbox"]').waitFor({ state: 'visible', timeout: 5000 })
    const labels = await page.locator('.nb-slash-menu [role="option"]').allInnerTexts()
    if (labels.length !== 1 || !labels[0].includes('圖片')) throw new Error(`filter "/image" gave: ${JSON.stringify(labels)}`)
    // clear and retry with the 中文 keyword too, to prove both aliases hit
    for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace')
    await page.keyboard.type('/圖')
    await sleep(200)
    const labels2 = await page.locator('.nb-slash-menu [role="option"]').allInnerTexts()
    if (labels2.length !== 1 || !labels2[0].includes('圖片')) throw new Error(`filter "/圖" gave: ${JSON.stringify(labels2)}`)
    return 'both "image" and "圖" filter to exactly the 圖片 item'
  })

  // ---- insert image via slash + file chooser ----
  await step('slash-insert image uploads to Supabase Storage', async () => {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      page.keyboard.press('Enter'), // commits the filtered "圖片" item
    ])
    await chooser.setFiles(PNG_PATH)
    // upload + insert is async (real network round trip to Supabase Storage)
    await page.locator('.ProseMirror img').first().waitFor({ state: 'visible', timeout: 20000 })
    const src = await page.locator('.ProseMirror img').first().getAttribute('src')
    if (!src) throw new Error('inserted <img> has no src')
    if (src.startsWith('data:')) throw new Error(`image is base64, not uploaded: ${src.slice(0, 40)}…`)
    if (!src.includes('notebook-images')) throw new Error(`src doesn't reference the notebook-images bucket: ${src}`)
    await shot('01-image-inserted')
    return `src=${src}`
  })

  // ---- wait for autosave, then reload and confirm persistence ----
  await step('image persists after reload', async () => {
    await page.getByText('已儲存', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    // notebook auto-selects the first note; find ours if a different one loaded
    const title = page.locator('input[placeholder="無標題"]')
    await title.waitFor({ state: 'visible', timeout: 20000 })
    if ((await title.inputValue()) !== NOTE_TITLE) {
      await page.getByText(NOTE_TITLE, { exact: false }).first().click()
      await title.waitFor({ state: 'visible', timeout: 10000 })
    }
    await page.locator('.ProseMirror img').first().waitFor({ state: 'visible', timeout: 15000 })
    const src = await page.locator('.ProseMirror img').first().getAttribute('src')
    if (!src || !src.includes('notebook-images')) throw new Error(`image missing/wrong src after reload: ${src}`)
    await shot('02-image-after-reload')
  })

  // ---- regression: 收合 (details/toggle) still works end-to-end ----
  await step('收合 block: insert, collapse/expand, persists after reload', async () => {
    await pm().click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/收合')
    await page.locator('.nb-slash-menu [role="option"]').first().waitFor({ state: 'visible', timeout: 5000 })
    await page.keyboard.press('Enter')
    await sleep(250)
    await page.keyboard.type('摘要文字')

    const details = pm().locator('.nb-details').first()
    await details.waitFor({ state: 'visible', timeout: 5000 })
    const summaryText = (await details.locator('summary').innerText()).trim()
    if (!summaryText.includes('摘要文字')) throw new Error(`summary text is ${JSON.stringify(summaryText)}`)

    // Tiptap v3 toggles the `is-open` class on the wrapper and the `hidden`
    // attribute on the content div — the `open` HTML attribute is only used
    // by renderHTML for static output, never by the live NodeView.
    const isOpen = () =>
      details.evaluate((el) => ({
        openClass: el.classList.contains('is-open'),
        contentHidden: el.querySelector('[data-type="detailsContent"]')?.hasAttribute('hidden') ?? null,
      }))
    const toggleBtn = details.locator('> button').first()
    const stateBefore = await isOpen()
    await toggleBtn.click()
    await sleep(250)
    const stateAfter = await isOpen()
    if (stateBefore.openClass === stateAfter.openClass || stateBefore.contentHidden === stateAfter.contentHidden) {
      throw new Error(`toggle click had no effect: ${JSON.stringify(stateBefore)} -> ${JSON.stringify(stateAfter)}`)
    }
    await shot('03-details-toggled')

    const openState = stateAfter.openClass

    await page.getByText('已儲存', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const title = page.locator('input[placeholder="無標題"]')
    await title.waitFor({ state: 'visible', timeout: 20000 })
    if ((await title.inputValue()) !== NOTE_TITLE) {
      await page.getByText(NOTE_TITLE, { exact: false }).first().click()
      await title.waitFor({ state: 'visible', timeout: 10000 })
    }
    const detailsAfterReload = pm().locator('.nb-details').first()
    await detailsAfterReload.waitFor({ state: 'visible', timeout: 15000 })
    const summaryAfterReload = (await detailsAfterReload.locator('summary').innerText()).trim()
    if (!summaryAfterReload.includes('摘要文字')) throw new Error(`summary lost after reload: ${JSON.stringify(summaryAfterReload)}`)
    await sleep(500) // NodeView re-applies persisted open state via setTimeout
    const openPersisted = await detailsAfterReload.evaluate((el) => el.classList.contains('is-open'))
    if (openState !== openPersisted) {
      throw new Error(`open state didn't persist: before-reload=${openState}, after-reload=${openPersisted}`)
    }
    return `summary persisted, open-state persisted (${openPersisted})`
  })

  // ---- console errors ----
  await step('no page errors', async () => {
    if (pageErrors.length) throw new Error(pageErrors.slice(0, 3).join(' | '))
  })

  // ---- best-effort cleanup: this run's note + older test-run leftovers ----
  await step('cleanup test notes (best effort)', async () => {
    await sleep(500)
    const patterns = [NOTE_TITLE, '圖片驗證']
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
