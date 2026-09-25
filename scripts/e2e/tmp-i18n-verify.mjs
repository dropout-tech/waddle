#!/usr/bin/env node
/**
 * i18n verification — spawns its own dev server, then asserts:
 *  A. /login in an en-US browser auto-detects English (no CJK outside the
 *     language toggle), the「EN｜中文」toggle flips to Chinese and back.
 *  B. Logging in (English mode) shows English chrome ("Today", "Settings").
 *  C. Settings → General language selector switches to 繁體中文 live
 *     (no reload), persists across reload, then switches back to English.
 *  D. 390px mobile: "Tasks" bottom tab, no horizontal overflow.
 *  E. Zero pageerror throughout.
 * Screenshots → docs/reports/2026-07-21-i18n-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3105
const PROD = process.env.E2E_BASE_URL || null // set to verify a deployed site (no local server)
const BASE = PROD || `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-07-21-i18n-shots', PROD ? 'prod' : '')
mkdirSync(SHOTS, { recursive: true })

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
if (!EMAIL || !PASSWORD) { console.error('missing E2E creds'); process.exit(1) }

let passed = 0, failed = 0
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  ok ? passed++ : failed++
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

const hasCJK = (s) => /[一-鿿]/.test(s)

// Prod keeps long-lived connections open (Supabase), so networkidle never
// settles there — settle for domcontentloaded + explicit sleeps instead.
const WAIT = PROD ? 'domcontentloaded' : 'networkidle'

async function bodyTextWithoutToggle(page) {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true)
    // Detached-clone innerText degrades to textContent, which would include
    // <script> payloads (Next flight data embeds the zh dictionary) — strip
    // non-visible elements first.
    clone.querySelectorAll('script, style, noscript, template').forEach((el) => el.remove())
    // strip the auth language toggle (it legitimately shows「中文」in EN mode)
    clone.querySelectorAll('[data-lang-toggle], button').forEach((el) => {
      const t = (el.textContent || '').trim()
      if (t === '中文' || t === 'EN') el.remove()
    })
    return clone.innerText || ''
  })
}

async function fillStable(page, selector, value) {
  for (let i = 0; i < 5; i++) {
    await page.fill(selector, value)
    await sleep(150)
    if ((await page.inputValue(selector)) === value) return
  }
  throw new Error(`fill unstable: ${selector}`)
}

const server = PROD ? null : spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true,
})
server?.stdout.on('data', () => {})
server?.stderr.on('data', () => {})

async function waitServer() {
  if (PROD) return
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready (check for zombie next dev)')
}

const pageErrors = []
let browser
try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  // ── A. login page auto-detect + toggle ─────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: WAIT })
  // SSR paints zh-TW first by design; the detected language applies right
  // after hydration. Wait for the h1 to flip to English before asserting.
  await page.waitForFunction(
    () => { const h = document.querySelector('h1'); return h && !/[一-鿿]/.test(h.innerText) },
    null, { timeout: 30000 }
  ).catch(() => {})
  await sleep(1000)
  const enText = await bodyTextWithoutToggle(page)
  check('A1 login auto-detects English (no CJK)', !hasCJK(enText), hasCJK(enText) ? 'CJK found: ' + enText.match(/[一-鿿][^\n]{0,20}/g)?.slice(0, 5).join(' | ') : '')
  await page.screenshot({ path: path.join(SHOTS, 'login-en.png') })

  const toggleZh = page.locator('button', { hasText: '中文' }).first()
  check('A2 language toggle visible on login', await toggleZh.isVisible())
  await toggleZh.click()
  await sleep(500)
  const zhText = await page.locator('body').innerText()
  check('A3 toggle switches login page to Chinese', hasCJK(zhText))
  await page.screenshot({ path: path.join(SHOTS, 'login-zh.png') })

  const toggleEn = page.locator('button', { hasText: 'EN' }).first()
  await toggleEn.click()
  await sleep(500)
  check('A4 toggle switches back to English', !hasCJK(await bodyTextWithoutToggle(page)))

  // ── B. login, English chrome ───────────────────────────────────────
  await fillStable(page, 'input[type="email"]', EMAIL)
  await fillStable(page, 'input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })
  await sleep(4000)
  const todayBtn = page.locator('button', { hasText: 'Today' }).first()
  check('B1 calendar header shows "Today" (EN)', await todayBtn.isVisible().catch(() => false))
  const settingsBtn = page.locator('[aria-label="Settings"]').first()
  check('B2 Settings button aria-label in English', await settingsBtn.isVisible().catch(() => false))
  await page.screenshot({ path: path.join(SHOTS, 'app-desktop-en.png') })

  // ── C. settings language selector ──────────────────────────────────
  await settingsBtn.click()
  await sleep(800)
  const zhOption = page.locator('button', { hasText: '繁體中文' }).first()
  const enOption = page.locator('button', { hasText: 'English' }).first()
  check('C1 language selector shows both options', (await zhOption.isVisible()) && (await enOption.isVisible()))
  await page.screenshot({ path: path.join(SHOTS, 'settings-language-en.png') })
  await zhOption.click()
  await sleep(800)
  const modalTitleZh = await page.locator('h2', { hasText: '設定' }).first().isVisible().catch(() => false)
  check('C2 switching to 繁體中文 re-renders live (modal title 設定)', modalTitleZh)
  await page.screenshot({ path: path.join(SHOTS, 'settings-language-zh.png') })
  await page.keyboard.press('Escape')
  await sleep(500)
  const todayZh = await page.locator('button', { hasText: '今天' }).first().isVisible().catch(() => false)
  check('C3 calendar header now 今天 (zh, no reload)', todayZh)
  await page.reload({ waitUntil: WAIT })
  await sleep(4000)
  check('C4 language persists after reload (今天 still)', await page.locator('button', { hasText: '今天' }).first().isVisible().catch(() => false))
  // switch back to English via settings
  await page.locator('[aria-label="設定"]').first().click()
  await sleep(800)
  await page.locator('button', { hasText: 'English' }).first().click()
  await sleep(800)
  await page.keyboard.press('Escape')
  await sleep(500)
  check('C5 switch back to English works', await page.locator('button', { hasText: 'Today' }).first().isVisible().catch(() => false))

  // ── D. mobile 390px ────────────────────────────────────────────────
  const mctx = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() })
  const mpage = await mctx.newPage()
  mpage.on('pageerror', (e) => pageErrors.push(String(e)))
  await mpage.goto(BASE, { waitUntil: WAIT })
  await sleep(5000)
  const tasksTab = mpage.locator('text=Tasks').first()
  await tasksTab.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
  check('D1 mobile bottom tab "Tasks" (EN)', await tasksTab.isVisible().catch(() => false))
  const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check('D2 no horizontal overflow at 390px', overflow <= 1, `delta=${overflow}`)
  await mpage.screenshot({ path: path.join(SHOTS, 'app-mobile-en.png') })
  await mctx.close()

  // ── E. no page errors ──────────────────────────────────────────────
  check('E1 zero pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

  await ctx.close()
} catch (err) {
  check('FATAL', false, String(err))
} finally {
  try { await browser?.close() } catch {}
  if (server) { try { process.kill(-server.pid, 'SIGTERM') } catch {} }
}

console.log(`\n${passed}/${passed + failed} passed`)
process.exit(failed ? 1 : 0)
