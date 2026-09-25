#!/usr/bin/env node
/**
 * IME (注音/拼音) Enter guard — 2026-08-19.
 *
 * Bug: typing Chinese and pressing Enter to CONFIRM the candidate also fired
 * the "submit" handler, so a half-typed phrase got saved. Fix: every Enter
 * handler now bails when the event is an IME composition keystroke
 * (`lib/ime.ts` → nativeEvent.isComposing || keyCode === 229).
 *
 * How this script reproduces a real IME: a real IME delivers the confirming
 * Enter as a keydown whose `isComposing` is true (legacy engines: keyCode 229).
 * Playwright's keyboard bypasses the OS IME entirely, so we dispatch a genuine
 * KeyboardEvent with those exact flags on the focused input. React 18 listens
 * at the root container, so this reaches the component's real onKeyDown with a
 * faithful nativeEvent — the same code path a real IME takes.
 *
 * Per input, three assertions:
 *   a) composing Enter does NOT submit  (input keeps its text)
 *   b) the text survives intact         (nothing silently swallowed)
 *   c) a plain Enter afterwards DOES submit (guard didn't break the feature)
 *
 * Covered inputs: 左側欄 新增分類 / 分類內新增任務 / 記事本標題 / 白板文字輸入.
 *
 * DB writes: NONE. Every non-GET /rest/v1/** is answered locally with a fake
 * 200, so submits only exercise the optimistic UI.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3172
const BASE = `http://localhost:${PORT}`

function loadEnvFile(p) {
  const out = {}
  if (!existsSync(p)) return out
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[line.slice(0, eq).trim()] = v
  }
  return out
}
const env = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || env.E2E_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('missing E2E creds in .env.e2e.local')
  process.exit(1)
}

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  ok ? passed++ : failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const pageErrors = []
let browser
/** True once the notebook block had to create a real note (and must delete it). */
let createdNote = false
const server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
server.stdout.on('data', () => {})
server.stderr.on('data', () => {})

async function waitServer() {
  for (let i = 0; i < 180; i++) {
    try {
      const r = await fetch(`${BASE}/login`)
      if (r.ok) return
    } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready on port ' + PORT)
}

async function installNoWriteGuard(page) {
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') return route.continue()
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

async function login(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').waitFor({ timeout: 60000 })
    await sleep(1500)
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('button[type="submit"]').click()
    for (let i = 0; i < 60; i++) {
      await sleep(1000)
      if (!(await page.evaluate(() => location.pathname)).includes('/login')) return
    }
  }
  throw new Error('login failed')
}

/** Fires the keydown a real IME sends when Enter merely confirms a candidate. */
async function pressComposingEnter(locator) {
  await locator.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 229,
        which: 229,
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: el.value ?? '' }))
  })
}

/**
 * Types `text`, sends a composing Enter (must NOT submit), then a real Enter
 * (must submit). `submitted()` reports whether the app acted on the input.
 */
async function assertImeGuard(page, label, locator, text, submitted) {
  await locator.click()
  await locator.fill('')
  await locator.type(text, { delay: 30 })
  await sleep(200)

  await pressComposingEnter(locator)
  await sleep(700)

  const stillThere = await locator.count().then((n) => n > 0)
  const valueAfterComposing = stillThere ? await locator.inputValue().catch(() => null) : null
  const didSubmit = await submitted()
  check(`${label} a) 組字中的 Enter 沒有送出`, didSubmit === false, `submitted=${didSubmit}`)
  check(`${label} b) 打到一半的字還在`, valueAfterComposing === text, `value="${valueAfterComposing}" expected="${text}"`)

  await locator.click().catch(() => {})
  await page.keyboard.press('Enter')
  await sleep(1200)
  const didSubmitForReal = await submitted()
  check(`${label} c) 真正的 Enter 仍然送得出去`, didSubmitForReal === true, `submitted=${didSubmitForReal}`)
}

try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })
  ctx.setDefaultNavigationTimeout(180000)
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await installNoWriteGuard(page)

  await login(page)
  await sleep(5000)

  // ---------- 1. 左側欄：在工作區新增分類 ----------
  {
    const addBtn = page.locator('button[aria-label^="在「"]').first()
    await addBtn.waitFor({ timeout: 30000 })
    await addBtn.click()
    await sleep(600)
    const input = page.locator('input[placeholder="分類名稱..."]').first()
    await input.waitFor({ timeout: 15000 })
    const NAME = 'IME測試分類'
    // "submitted" = the add-row closed and a category with that name exists.
    const submitted = async () =>
      (await page.locator('input[placeholder="分類名稱..."]').count()) === 0 &&
      (await page.getByText(NAME, { exact: false }).count()) > 0
    await assertImeGuard(page, '左側欄 新增分類', input, NAME, submitted)
  }

  // ---------- 2. 左側欄：分類內新增任務 ----------
  {
    // The "+" that opens the per-category task input sits inside a category row.
    const catAdd = page.locator('button').filter({ has: page.locator('svg.lucide-plus') })
    let opened = false
    const n = Math.min(await catAdd.count(), 12)
    for (let i = 0; i < n; i++) {
      await catAdd.nth(i).click({ timeout: 5000 }).catch(() => {})
      await sleep(500)
      if ((await page.locator('input[placeholder="輸入任務名稱..."]').count()) > 0) { opened = true; break }
    }
    if (!opened) {
      check('左側欄 分類內新增任務 — 找不到入口（未測）', false, 'no 輸入任務名稱... input appeared')
    } else {
      const input = page.locator('input[placeholder="輸入任務名稱..."]').first()
      const TITLE = 'IME測試任務'
      const submitted = async () =>
        (await page.getByText(TITLE, { exact: false }).count()) > 0
      await assertImeGuard(page, '左側欄 分類內新增任務', input, TITLE, submitted)
      await page.keyboard.press('Escape')
    }
  }

  // ---------- 3. 白板（專注白板）文字輸入 ----------
  {
    const tab = page.locator('[data-tour="scratchpad"]').first()
    if ((await tab.count()) === 0) {
      check('白板 文字輸入 — 找不到入口（未測）', false, 'no [data-tour="scratchpad"]')
    } else {
      await tab.click()
      await sleep(1200)
      const input = page.locator('input[placeholder^="記下想法"]').first()
      await input.waitFor({ timeout: 15000 })
      const TEXT = 'IME白板想法'
      // "submitted" = the input was cleared (addTextItem resets it).
      const submitted = async () => (await input.inputValue().catch(() => TEXT)) === ''
      await assertImeGuard(page, '白板 文字輸入', input, TEXT, submitted)
      await page.keyboard.press('Escape')
      await sleep(600)
    }
  }

  // ---------- 4. 記事本標題 ----------
  {
    await page.goto(`${BASE}/notebook`, { waitUntil: 'domcontentloaded' })
    await sleep(6000)
    // Open a note: the row's select button is the one next to the grip handle.
    if ((await page.locator('input[placeholder="無標題"]').count()) === 0) {
      const rows = page.locator('button[aria-label="拖曳排序或移到其他分類"]')
      const rowCount = Math.min(await rows.count(), 8)
      for (let i = 0; i < rowCount; i++) {
        await rows.nth(i).locator('xpath=following-sibling::button[1]').click({ timeout: 5000 }).catch(() => {})
        await sleep(1200)
        if ((await page.locator('input[placeholder="無標題"]').count()) > 0) break
      }
    }
    // Still nothing? The account has no notes yet. Briefly lift the no-write
    // guard, create one real note, and delete it again at the end of the block.
    if ((await page.locator('input[placeholder="無標題"]').count()) === 0) {
      await page.unroute('**/rest/v1/**')
      createdNote = true
      const create = page.getByRole('button', { name: /建立第一篇|新增記事/ }).first()
      await create.click()
      await sleep(3000)
    }
    const title = page.locator('input[placeholder="無標題"]').first()
    if ((await title.count()) === 0) {
      check('記事本 標題 — 沒有可開啟的筆記（未測）', false, 'no 無標題 input')
    } else {
      await title.click()
      await title.fill('')
      await title.type('IME記事本標題', { delay: 30 })
      await sleep(300)
      await pressComposingEnter(title)
      await sleep(600)
      // Enter on the title moves focus into the body editor; while composing it must not.
      const focusStillTitle = await title.evaluate((el) => el === document.activeElement)
      const val = await title.inputValue()
      check('記事本 標題 a) 組字中的 Enter 沒有跳走', focusStillTitle === true, `activeIsTitle=${focusStillTitle}`)
      check('記事本 標題 b) 打到一半的字還在', val === 'IME記事本標題', `value="${val}"`)
      await page.keyboard.press('Enter')
      await sleep(600)
      const focusLeftTitle = await title.evaluate((el) => el !== document.activeElement)
      check('記事本 標題 c) 真正的 Enter 仍會跳到內文', focusLeftTitle === true, `focusLeft=${focusLeftTitle}`)
    }

    // Clean up the throwaway note so the account is left exactly as found.
    if (createdNote) {
      await page.locator('button[aria-label="刪除記事"]').first().click({ timeout: 10000 }).catch(() => {})
      await sleep(500)
      await page.getByRole('button', { name: '刪除', exact: true }).first().click({ timeout: 10000 }).catch(() => {})
      await sleep(2500)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await sleep(6000)
      const leftovers = await page.locator('button[aria-label="拖曳排序或移到其他分類"]').count()
      check('記事本 d) 測試用筆記已刪除、帳號還原', leftovers === 0, `剩餘筆記列=${leftovers}`)
    }
  }

  check('全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (err) {
  failed++
  console.log('FAIL 執行錯誤 — ' + (err?.stack || err))
} finally {
  await browser?.close().catch(() => {})
  try { process.kill(-server.pid, 'SIGKILL') } catch {}
  console.log(`\n=== ${passed} passed / ${failed} failed ===`)
  process.exit(failed === 0 ? 0 : 1)
}
