#!/usr/bin/env node
/**
 * Screenshots + checks for the mobile bottom tab bar (and its "+" FAB) and the
 * user menu (desktop + mobile).
 *
 *   node scripts/e2e/huddle-icons-nav-shots.mjs before   # shots only
 *   node scripts/e2e/huddle-icons-nav-shots.mjs after    # shots + assertions
 *
 * Expects a dev server on E2E_PORT (default 3112). In "after" mode the FAB
 * check creates ONE task in the e2e test account and deletes it again; the
 * theme toggle is flipped and flipped back. Nothing else is written.
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
let passed = 0
let total = 0
function check(name, ok, note = '') {
  total++
  if (ok) passed++
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${note ? ' — ' + note : ''}`)
  if (!ok) exitCode = 1
}

async function login(page) {
  if (!EMAIL || !PASSWORD) throw new Error('missing E2E creds')
  await page.goto(`${BASE_URL}/login?method=email`, { waitUntil: 'domcontentloaded' })
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

async function openApp(page, anchor) {
  if (!existsSync(STATE)) await login(page)
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await sleep(2500)
  if (await page.evaluate(() => location.pathname.startsWith('/login'))) await login(page)
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.locator(anchor).first().waitFor({ state: 'visible', timeout: 120000 })
  await sleep(1500)
}

const TABS = ['重點', '任務', '白板', '日曆', '連結']

async function main() {
  const browser = await chromium.launch()

  // ───────── mobile 390×844 ─────────
  const ctxM = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'zh-TW',
    ...(existsSync(STATE) ? { storageState: STATE } : {}),
  })
  const pM = await ctxM.newPage()
  const errorsM = []
  pM.on('pageerror', (e) => errorsM.push(e.message))
  await openApp(pM, '[role="tablist"]')
  await ctxM.storageState({ path: STATE })
  const nav = pM.locator('nav[role="tablist"]')
  const tab = (name) => nav.getByRole('tab', { name, exact: true })
  const navBox = await nav.boundingBox()
  // start from the calendar tab with no overlay open
  if ((await tab('日曆').getAttribute('aria-selected')) !== 'true') { await tab('日曆').click(); await sleep(500) }

  for (const theme of ['light', 'dark']) {
    await setTheme(pM, theme)
    await pM.screenshot({ path: out(`nav-390-${theme}-page`) })
    await pM.screenshot({ path: out(`nav-390-${theme}`), clip: navBox })
  }
  await setTheme(pM, 'light')
  // FAB close-up (calendar tab only)
  const fab = pM.locator('[data-tour="mobile-add-task"]')
  if (await fab.isVisible().catch(() => false)) {
    const b = await fab.boundingBox()
    await pM.screenshot({ path: out('nav-390-fab'), clip: { x: b.x - 12, y: b.y - 12, width: b.width + 24, height: b.height + 24 } })
    if (MODE === 'after') {
      check('FAB keeps its 56×56 size', Math.round(b.width) === 56 && Math.round(b.height) === 56, `${Math.round(b.width)}x${Math.round(b.height)}`)
      check('FAB icon is not lucide', await fab.locator('svg').evaluate((s) => !(s.getAttribute('class') || '').includes('lucide')))
    }
  } else check('FAB visible on calendar tab', false)

  // each tab selected, one strip per state (light), plus dark for the record
  for (const name of TABS) {
    await tab(name).click()
    await sleep(700)
    const sel = await tab(name).getAttribute('aria-selected')
    if (MODE === 'after') check(`tab ${name} selects`, sel === 'true')
    const i = TABS.indexOf(name) + 1
    await pM.screenshot({ path: out(`nav-390-light-tab${i}`), clip: navBox })
    await setTheme(pM, 'dark')
    await pM.screenshot({ path: out(`nav-390-dark-tab${i}`), clip: navBox })
    await setTheme(pM, 'light')
    // overlay tabs toggle: close them again so the next click starts clean
    if (['重點', '白板', '連結'].includes(name)) { await tab(name).click(); await sleep(400) }
  }
  await tab('日曆').click()
  await sleep(600)

  if (MODE === 'after') {
    const info = await nav.evaluate((el) => ({
      h: Math.round(el.getBoundingClientRect().height),
      tabs: [...el.querySelectorAll('[role="tab"]')].map((b) => { const r = b.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}` }),
      lucide: [...el.querySelectorAll('svg')].filter((s) => (s.getAttribute('class') || '').includes('lucide')).length,
      icons: [...el.querySelectorAll('svg')].map((s) => { const r = s.getBoundingClientRect(); return `${s.getAttribute('data-ink-icon')}:${Math.round(r.width)}` }),
    }))
    console.log('tab bar:', JSON.stringify(info))
    check('no lucide icon left in the tab bar', info.lucide === 0)
    check('tab buttons ≥ 60px tall', info.tabs.every((t) => Number(t.split('x')[1]) >= 60), info.tabs.join(' '))

    // "+" opens the new-task editor; delete the task it created
    await fab.click()
    const dialog = pM.locator('[role="dialog"][aria-label="任務詳情"]')
    const opened = await dialog.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)
    check('"+" opens the task editor', opened)
    if (opened) {
      const del = dialog.locator('button[title="刪除任務"]')
      await del.click()
      await sleep(400)
      // some builds ask to confirm
      await pM.getByRole('button', { name: '刪除', exact: true }).first().click({ timeout: 1500 }).catch(() => {})
      await sleep(800)
      check('created task deleted (editor closed)', !(await dialog.isVisible().catch(() => false)))
    }
  }

  // user menu via ⋯ → 帳號
  for (const theme of ['light', 'dark']) {
    await setTheme(pM, theme)
    await pM.locator('[data-tour="mobile-more"]').click()
    await pM.locator('[role="menu"] [data-tour="user-menu"]').click()
    await pM.getByText('登出', { exact: true }).first().waitFor({ state: 'visible', timeout: 8000 })
    await sleep(400)
    await pM.screenshot({ path: out(`user-menu-390-${theme}`) })
    await pM.mouse.click(40, 500)
    await sleep(400)
  }
  await setTheme(pM, 'light')
  check('no page errors (mobile)', errorsM.length === 0, errorsM.slice(0, 2).join(' | '))
  await ctxM.close()

  // ───────── desktop 1280 ─────────
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: 'zh-TW', storageState: STATE,
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openApp(page, '[data-tour="notebook-entry"]')
  const avatar = page.locator('[data-tour="user-menu"]').first()
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme)
    await avatar.click()
    await page.getByText('登出', { exact: true }).first().waitFor({ state: 'visible', timeout: 8000 })
    await sleep(400)
    await page.screenshot({ path: out(`user-menu-1280-${theme}`), clip: { x: 900, y: 0, width: 380, height: 600 } })
    if (MODE === 'after' && theme === 'light') {
      const menu = page.getByText('登出', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"shadow")][1]')
      const info = await menu.evaluate((el) => ({
        lucide: [...el.querySelectorAll('svg')].filter((s) => (s.getAttribute('class') || '').includes('lucide')).map((s) => s.getAttribute('class')),
        items: [...el.querySelectorAll('button, a')].map((b) => `${(b.textContent || '').trim().slice(0, 8)}:${b.disabled ? 'disabled' : 'ok'}`),
      }))
      console.log('user menu:', JSON.stringify(info))
      check('no lucide icon left in the user menu', info.lucide.length === 0, info.lucide.join(' | '))
      check('every user-menu item is enabled', info.items.every((i) => i.endsWith(':ok')))
      // theme toggle really works, then switch back
      await page.getByText('切換深色', { exact: true }).click()
      await sleep(600)
      check('theme toggle → dark', await page.evaluate(() => document.documentElement.classList.contains('dark')))
      if (!(await page.getByText('切換淺色', { exact: true }).isVisible().catch(() => false))) { await avatar.click(); await sleep(400) }
      await page.getByText('切換淺色', { exact: true }).click()
      await sleep(600)
      check('theme toggle → back to light', await page.evaluate(() => !document.documentElement.classList.contains('dark')))
      if (!(await page.getByText('登出', { exact: true }).first().isVisible().catch(() => false))) { await avatar.click(); await sleep(400) }
    }
    await page.mouse.click(500, 600)
    await sleep(400)
  }
  check('no page errors (desktop)', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()

  await browser.close()
  console.log(`\n${passed}/${total} passed (${MODE})`)
}

main().catch((e) => { console.error(e); exitCode = 1 }).finally(() => process.exit(exitCode))
