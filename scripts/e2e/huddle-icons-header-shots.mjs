#!/usr/bin/env node
/**
 * Screenshots of the calendar header toolbar (desktop + mobile overflow menu),
 * the ⌘K palette's notebook entry and the user menu's sticky-note entries.
 * Read-only against the account: only local (per-device) UI state is touched.
 *
 *   node scripts/e2e/huddle-icons-header-shots.mjs before|after
 *
 * Expects a dev server on E2E_PORT (default 3112) and a cached login state
 * (E2E_STATE) — run huddle-icons-notebook-shots.mjs first, or it logs in.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const MODE = process.argv[2] === 'after' ? 'after' : 'before'
const PORT = Number(process.env.E2E_PORT || 3112)
const BASE_URL = `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-10-01-block-icons')
const STATE = process.env.E2E_STATE || path.join(os.tmpdir(), 'huddle-block-icons-state.json')
mkdirSync(SHOT_DIR, { recursive: true })
const out = (name) => path.join(SHOT_DIR, `${MODE}-${name}.png`)

function loadEnvFile(filePath) {
  const o = {}
  if (!existsSync(filePath)) return o
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    o[line.slice(0, eq).trim()] = value
  }
  return o
}
const envFile = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || envFile.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || envFile.E2E_PASSWORD

let exitCode = 0
function check(name, ok, note = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${note ? ' — ' + note : ''}`)
  if (!ok) exitCode = 1
}

async function login(page) {
  if (!EMAIL || !PASSWORD) throw new Error('missing E2E creds')
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor({ state: 'visible', timeout: 120000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  for (let i = 0; i < 5; i++) {
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    if ((await page.locator('#email').inputValue()) === EMAIL &&
        (await page.locator('#password').inputValue()) === PASSWORD) break
    await sleep(600)
  }
  await page.getByRole('button', { name: '登入', exact: true }).click()
  for (let i = 0; i < 120; i++) {
    if (await page.evaluate(() => location.pathname === '/')) return
    await sleep(500)
  }
  throw new Error('login did not land on /')
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('theme', t)
    const el = document.documentElement
    el.classList.toggle('dark', t === 'dark')
    el.classList.toggle('light', t !== 'dark')
    el.style.colorScheme = t
  }, theme)
  await sleep(250)
}

async function openCalendar(page) {
  // Logged-out "/" is the marketing page (no redirect), so log in up front
  // whenever there's no cached session.
  if (!existsSync(STATE)) await login(page)
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await sleep(2500)
  if (await page.evaluate(() => location.pathname.startsWith('/login'))) await login(page)
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.locator('[data-tour="notebook-entry"], [data-tour="mobile-more"]').first()
    .waitFor({ state: 'visible', timeout: 120000 })
  await sleep(1500)
}

/** Bounding rect of the whole header block (both rows), in CSS px. */
async function headerRect(page) {
  return page.evaluate(() => {
    const anchor = document.querySelector('[data-tour="notebook-entry"]')
    const row = anchor?.closest('.border-t')
    const root = row?.parentElement
    const r = root?.getBoundingClientRect()
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
  })
}

async function main() {
  const browser = await chromium.launch()

  // ONLY_DPR1=1 → just the 1x header strip (used to re-shoot the "before" at 1x).
  if (process.env.ONLY_DPR1) {
    const c = await browser.newContext({
      viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'zh-TW',
      ...(existsSync(STATE) ? { storageState: STATE } : {}),
    })
    const p = await c.newPage()
    await openCalendar(p)
    await c.storageState({ path: STATE })
    await p.locator('[data-tour="sticky-notes-toggle"]').first().click()
    await sleep(500)
    const r = await headerRect(p)
    for (const theme of ['light', 'dark']) {
      await setTheme(p, theme)
      await p.screenshot({ path: out(`header-1280-${theme}-dpr1`), clip: r })
    }
    await browser.close()
    console.log(`done (${MODE}, dpr1 only)`)
    return
  }

  // ───────── desktop 1280, DPR 2 ─────────
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: 'zh-TW',
    ...(existsSync(STATE) ? { storageState: STATE } : {}),
  })
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await openCalendar(page)
  await ctx.storageState({ path: STATE })

  // Sticky notes on (per-device localStorage flag) so the "+" button renders.
  const sticky = page.locator('[data-tour="sticky-notes-toggle"]').first()
  const wasOn = (await sticky.getAttribute('aria-pressed')) === 'true'
  if (!wasOn) { await sticky.click(); await sleep(500) }

  const rect = await headerRect(page)
  check('header found', !!rect, rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : '')
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme)
    await page.screenshot({ path: out(`header-1280-${theme}-page`) })
    await page.screenshot({ path: out(`header-1280-${theme}`), clip: rect })
    // right half of the tool row, where the icons live (crisper close-up)
    await page.screenshot({
      path: out(`header-1280-${theme}-tools`),
      clip: { x: rect.x + rect.width - 520, y: rect.y + rect.height - 48, width: 520, height: 48 },
    })
    await page.screenshot({
      path: out(`header-1280-${theme}-left`),
      clip: { x: rect.x, y: rect.y, width: 520, height: rect.height },
    })
  }
  await setTheme(page, 'light')

  // "▾" more-tools menu open
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme)
    await page.locator('[data-tour="calendar-export"]').click()
    await page.locator('[role="menu"]').first().waitFor({ state: 'visible', timeout: 5000 })
    await sleep(350)
    await page.screenshot({
      path: out(`header-1280-${theme}-menu-open`),
      clip: { x: rect.x + rect.width - 520, y: rect.y, width: 520, height: rect.height + 230 },
    })
    await page.keyboard.press('Escape')
    await sleep(300)
  }
  await setTheme(page, 'light')

  if (MODE === 'after') {
    const info = await page.evaluate(() => {
      const anchor = document.querySelector('[data-tour="notebook-entry"]')
      const root = anchor?.closest('.border-t')?.parentElement
      const svgs = [...(root?.querySelectorAll('svg') ?? [])]
      return {
        total: svgs.length,
        lucide: svgs.filter((s) => (s.getAttribute('class') || '').includes('lucide')).map((s) => s.getAttribute('class')),
        tour: [...(root?.querySelectorAll('[data-tour]') ?? [])].map((e) => e.getAttribute('data-tour')),
      }
    })
    console.log('header svgs:', JSON.stringify(info))
    check('no lucide icon left in the header block', info.lucide.length === 0, info.lucide.join(' | '))
  }
  const tools = await page.evaluate(() =>
    [...document.querySelectorAll('[data-tour="notebook-entry"], [data-tour="sticky-notes-toggle"], [data-tour="calendar-export"], [data-sticky-drawer-trigger]')]
      .map((b) => { const r = b.getBoundingClientRect(); return `${b.getAttribute('data-tour') || 'drawer'}:${Math.round(r.width)}x${Math.round(r.height)}` }))
  console.log('desktop tool buttons:', tools.join(' '))

  // ⌘K palette → 開記事本
  await page.keyboard.press('Meta+k')
  const input = page.locator('input[placeholder^="搜尋任務"]')
  if (await input.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
    await input.fill('記事')
    await sleep(400)
    const dlg = await input.locator('xpath=ancestor::*[@role="dialog"][1]').boundingBox().catch(() => null)
    await page.screenshot({ path: out('palette-1280-light'), ...(dlg ? { clip: dlg } : {}) })
    await page.keyboard.press('Escape')
    await sleep(300)
  } else check('command palette opened', false)

  // user menu (desktop avatar)
  const avatar = page.locator('[data-tour="user-menu"]').first()
  if (await avatar.isVisible().catch(() => false)) {
    await avatar.click()
    await sleep(500)
    await page.screenshot({ path: out('user-menu-1280-light'), clip: { x: 900, y: 0, width: 380, height: 560 } })
    await page.mouse.click(500, 600) // click-away closes the menu (Escape doesn't)
    await sleep(400)
  }
  // (sticky flag lives in this throwaway context's localStorage — nothing to restore)
  check('no page errors (desktop)', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
  await ctx.close()

  // ───────── desktop 1280, DPR 1 (the stress test for 14px icons) ─────────
  const ctx1 = await browser.newContext({
    viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'zh-TW', storageState: STATE,
  })
  const p1 = await ctx1.newPage()
  await openCalendar(p1)
  await p1.locator('[data-tour="sticky-notes-toggle"]').first().click()
  await sleep(500)
  const r1 = await headerRect(p1)
  for (const theme of ['light', 'dark']) {
    await setTheme(p1, theme)
    await p1.screenshot({ path: out(`header-1280-${theme}-dpr1`), clip: r1 })
  }
  await ctx1.close()

  // ───────── mobile 390×844 ─────────
  const ctxM = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'zh-TW', storageState: STATE,
  })
  const pM = await ctxM.newPage()
  await openCalendar(pM)
  for (const theme of ['light', 'dark']) {
    await setTheme(pM, theme)
    await pM.screenshot({ path: out(`header-390-${theme}`), clip: { x: 0, y: 0, width: 390, height: 120 } })
    await pM.locator('[data-tour="mobile-more"]').click()
    await pM.locator('[role="menu"]').first().waitFor({ state: 'visible', timeout: 5000 })
    await sleep(350)
    await pM.screenshot({ path: out(`header-390-${theme}-more-open`) })
    if (theme === 'light') {
      const sizes = await pM.evaluate(() =>
        [...document.querySelectorAll('[role="menu"] button')].map((b) => {
          const r = b.getBoundingClientRect()
          return `${(b.textContent || '').trim().slice(0, 6)}:${Math.round(r.height)}`
        }))
      console.log('mobile menu row heights:', sizes.join(' '))
    }
    await pM.locator('[data-tour="mobile-more"]').click()
    await sleep(300)
  }
  await ctxM.close()

  await browser.close()
  console.log(`done (${MODE})`)
}

main().catch((e) => { console.error(e); exitCode = 1 }).finally(() => process.exit(exitCode))
