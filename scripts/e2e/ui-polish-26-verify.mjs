#!/usr/bin/env node
/**
 * 2026-10-02 待辦 #26 — UI polish checks + screenshots (desktop 1280, phone 390,
 * English and 繁中 each):
 *   ① Scratchpad pull-tab must not cover the calendar title / header controls
 *   ② phone "/" menu must not overlap the keyboard-docked formatting bar
 *   ③ notebook top bar + sidebar use Huddle ink icons (no lucide)
 *   ④ bottom tab bar screenshot (whiteboard icon)
 *   ⑤ user menu shows the whole email (wraps instead of being cut off)
 *
 *   node scripts/e2e/ui-polish-26-verify.mjs before|after
 *
 * Expects a dev server on E2E_PORT (default 3147) and creds in .env.e2e.local.
 * Creates one throwaway note on the test account and deletes it at the end.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const MODE = process.argv[2] === 'after' ? 'after' : 'before'
const PORT = Number(process.env.E2E_PORT || 3147)
// E2E_BASE_URL points it at the live site for post-deploy checks (test account only).
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-10-02-ui-polish-26')
const STATE = process.env.E2E_STATE || path.join(os.tmpdir(), 'huddle-ui-polish-26-state.json')
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
if (!EMAIL || !PASSWORD) { console.error('missing E2E creds'); process.exit(1) }

const NOTE_TITLE = `UI驗證 ${Date.now() % 100000}`
const LONG_EMAIL = 'someone.with.a.really.long.name@example-company.com.tw'
const results = []
let exitCode = 0
function check(name, ok, note = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${note ? ' — ' + note : ''}`)
  if (!ok) exitCode = 1
}

async function login(page) {
  await page.goto(`${BASE_URL}/login?method=email`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor({ state: 'visible', timeout: 120000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  for (let i = 0; i < 5; i++) {
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    if ((await page.locator('#email').inputValue()) === EMAIL) break
    await sleep(600)
  }
  await page.locator('form button[type="submit"]').first().click()
  for (let i = 0; i < 120; i++) {
    if (await page.evaluate(() => location.pathname === '/')) return
    await sleep(500)
  }
  throw new Error('login did not land on /')
}

/** The timed water reminder (modal on desktop, drawer on phones) can pop over
 * anything — press its "Snooze" (再過一下) button when it shows. */
async function dismissWater(page) {
  const snooze = page.locator('[role="dialog"] button').filter({ hasText: /^(Snooze|再過一下)$/ }).first()
  if (await snooze.isVisible().catch(() => false)) {
    await snooze.click()
    await sleep(600)
  }
}

/** Language is read from localStorage on load, so set it then reload. */
async function setLang(page, lang) {
  await page.evaluate((l) => localStorage.setItem('waddle-language-v1', l), lang)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await sleep(2500)
  await dismissWater(page)
}

const T = {
  en: { newNote: 'New note', untitled: 'Untitled', userMenu: 'User menu', del: 'Delete note' },
  'zh-TW': { newNote: '新增記事', untitled: '無標題', userMenu: '使用者選單', del: '刪除記事' },
}
const tag = (lang) => (lang === 'en' ? 'en' : 'zh')

// ① Elements (text or icon) under the Scratchpad pull-tab.
async function checkPullTab(page, lang, label) {
  const tab = page.locator('[data-tour="scratchpad"]').first()
  await tab.waitFor({ state: 'visible', timeout: 60000 })
  await sleep(800)
  const hits = await tab.evaluate((tabEl) => {
    const r = tabEl.getBoundingClientRect()
    const out = []
    for (const el of document.body.querySelectorAll('*')) {
      if (tabEl.contains(el) || el.contains(tabEl)) continue
      const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      if (!direct && el.tagName.toLowerCase() !== 'svg') continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue
      const b = el.getBoundingClientRect()
      if (!b.width || !b.height) continue
      const ix = Math.min(r.right, b.right) - Math.max(r.left, b.left)
      const iy = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)
      if (ix > 2 && iy > 2) out.push(`${el.tagName.toLowerCase()}「${(el.textContent || el.getAttribute('data-ink-icon') || '').trim().slice(0, 20)}」`)
    }
    return { hits: out, tab: `${Math.round(r.left)}–${Math.round(r.right)} x ${Math.round(r.top)}–${Math.round(r.bottom)}` }
  })
  check(`① ${label} pull-tab covers nothing`, hits.hits.length === 0, `tab ${hits.tab}; under it: ${hits.hits.join(', ') || 'none'}`)
  const title = await tab.evaluate((el) => {
    const t = [...el.parentElement.children].find((c) => c.getAttribute('aria-live'))
    return t ? { full: t.scrollWidth <= t.clientWidth, text: t.textContent } : null
  })
  if (title) check(`① ${label} calendar title shown in full`, title.full, title.text)
  await page.screenshot({ path: out(`${label}-header`), clip: { x: 0, y: 0, width: page.viewportSize().width, height: 180 } })
}

// ⑤ Email in the user menu: real email + a forced long one must be fully visible.
async function checkUserMenu(page, lang, label) {
  await dismissWater(page)
  await page.locator(`button[aria-label="${T[lang].userMenu}"]`).first().click()
  const menu = page.locator('[role="menu"]').first()
  await menu.waitFor({ state: 'visible', timeout: 10000 })
  await sleep(300)
  const measure = () => menu.evaluate((m) => {
    const el = [...m.querySelectorAll('span')].find((s) => s.textContent.includes('@') && s.children.length <= 1 && !s.querySelector('span'))
      || [...m.querySelectorAll('span')].find((s) => s.textContent.includes('@'))
    if (!el) return { ok: false, why: 'no email element' }
    const cut = el.scrollWidth > el.clientWidth + 1
    const mb = m.getBoundingClientRect(), eb = el.getBoundingClientRect()
    const inside = eb.right <= mb.right + 0.5 && eb.left >= mb.left - 0.5
    return { ok: !cut && inside, why: `scroll ${el.scrollWidth} / client ${el.clientWidth}, h ${Math.round(eb.height)}` }
  })
  const real = await measure()
  check(`⑤ ${label} real email fully visible`, real.ok, real.why)
  await menu.evaluate((m, long) => {
    const el = [...m.querySelectorAll('span')].find((s) => s.textContent.includes('@') && !s.querySelector('span'))
      || [...m.querySelectorAll('span')].find((s) => s.textContent.includes('@'))
    // Same markup the menu renders: a break opportunity before "@".
    const at = long.indexOf('@')
    el.replaceChildren(long.slice(0, at), document.createElement('wbr'), long.slice(at))
  }, LONG_EMAIL)
  await sleep(150)
  const long = await measure()
  check(`⑤ ${label} long email fully visible`, long.ok, long.why)
  await menu.screenshot({ path: out(`${label}-usermenu`) })
  await page.keyboard.press('Escape')
  await page.mouse.click(5, page.viewportSize().height - 5)
  await sleep(300)
}

// ③ lucide icons left in the notebook chrome (top bar + sidebar), spinners excluded.
async function checkNotebookIcons(page, label) {
  const left = await page.evaluate(() => {
    const root = document.querySelector('.ProseMirror')?.closest('main') || document.body
    return [...document.querySelectorAll('svg.lucide')]
      // Scope = top bar + sidebar. The phone formatting bar is a separate row
      // (main added colour/highlight swatches there with lucide; out of scope).
      .filter((s) => !s.closest('.ProseMirror') && !s.closest('.nb-slash-menu') && !s.closest('[data-nb-keyboard-bar]') && !s.classList.contains('animate-spin'))
      .filter((s) => { const b = s.getBoundingClientRect(); return b.width > 0 && b.height > 0 })
      .map((s) => [...s.classList].find((c) => c.startsWith('lucide-')) || 'lucide')
      .concat(root ? [] : [])
  })
  check(`③ ${label} notebook top bar + sidebar have no lucide icon`, left.length === 0, left.join(' ') || 'none')
}

const pm = (page) => page.locator('.ProseMirror').first()

async function openTestNote(page) {
  await page.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  const row = page.getByText(NOTE_TITLE, { exact: true }).first()
  await row.waitFor({ state: 'visible', timeout: 60000 })
  await row.click()
  await pm(page).waitFor({ state: 'visible', timeout: 15000 })
  await sleep(500)
}

/** ② For a sweep of caret heights, the "/" menu must stay clear of the docked bar. */
async function checkSlashVsBar(page, label, simulatedKeyboard) {
  const overlaps = []
  const placed = []
  await pm(page).click()
  await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror')?.editor
    const filler = Array.from({ length: 40 }, (_, n) => ({ type: 'paragraph', content: [{ type: 'text', text: `line ${n + 1}` }] }))
    if (ed.state.doc.childCount < 30) ed.chain().insertContentAt(ed.state.doc.content.size, filler).run()
  })
  for (let i = 0; i < 9; i++) {
    // Fresh empty line right after filler line 3+2i (mid-document, so there
    // is content below and the caret can sit anywhere on screen).
    await page.evaluate((k) => {
      const ed = document.querySelector('.ProseMirror')?.editor
      let end = null
      ed.state.doc.forEach((node, offset) => { if (node.textContent === `line ${k}`) end = offset + node.nodeSize - 1 })
      ed.chain().focus().setTextSelection(end).splitBlock().run()
    }, 3 + 2 * i)
    await sleep(120)
    if (simulatedKeyboard) {
      await page.evaluate(() => {
        const bar = document.querySelector('svg[data-ink-icon="Heading1"]').closest('button').parentElement
        bar.style.bottom = '300px' // stand-in for a 300px soft keyboard
      })
    }
    // Pin the caret line to a sweep of heights between the top of the screen
    // and the bar (a real phone scrolls the caret above the keyboard).
    const barTop = await page.evaluate(() => document.querySelector('svg[data-ink-icon="Heading1"]').closest('button').parentElement.getBoundingClientRect().top)
    const caretTarget = 90 + i * ((barTop - 40 - 90) / 8)
    await page.evaluate((y) => {
      const sel = window.getSelection()
      const r = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null
      let scroller = document.querySelector('.ProseMirror')
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement
      scroller = scroller || document.scrollingElement
      if (r && r.top) scroller.scrollTop += r.top - y
    }, caretTarget)
    await sleep(150)
    await page.keyboard.type('/')
    await page.locator('.nb-slash-menu [role="listbox"]').waitFor({ state: 'visible', timeout: 8000 })
    await sleep(250)
    const m = await page.evaluate(() => {
      const menu = document.querySelector('.nb-slash-menu [role="listbox"]').getBoundingClientRect()
      const bar = document.querySelector('svg[data-ink-icon="Heading1"]').closest('button').parentElement.getBoundingClientRect()
      const sel = window.getSelection().getRangeAt(0).getBoundingClientRect()
      return { menuTop: menu.top, menuBottom: menu.bottom, barTop: bar.top, caretTop: sel.top, caretBottom: sel.bottom, h: menu.height }
    })
    placed.push(Math.round(m.caretTop))
    const hitsBar = m.menuBottom > m.barTop + 0.5
    const offTop = m.menuTop < -0.5
    const coversCaret = m.menuTop < m.caretBottom - 0.5 && m.menuBottom > m.caretTop + 0.5
    if (hitsBar || offTop || coversCaret) overlaps.push(`caret@${Math.round(m.caretTop)} menu ${Math.round(m.menuTop)}–${Math.round(m.menuBottom)} bar@${Math.round(m.barTop)}${coversCaret ? ' covers-caret' : ''}`)
    if (i === 4) await page.screenshot({ path: out(`${label}-slash${simulatedKeyboard ? '-kbd' : ''}`) })
    await page.keyboard.press('Escape')
    await sleep(120)
    await page.keyboard.press('Backspace')
    await sleep(120)
  }
  check(`② ${label} "/" menu clear of bar${simulatedKeyboard ? ' (300px keyboard)' : ''}`, overlaps.length === 0, overlaps.join(' | ') || `caret at ${placed.join('/')} ok`)
  if (simulatedKeyboard) {
    await page.evaluate(() => { document.querySelector('svg[data-ink-icon="Heading1"]').closest('button').parentElement.style.bottom = '0px' })
  }
}

/** ⑥ The page must serve exactly the icon paths in huddle-icons.tsx (1.2× pen). */
async function checkServedIcons(page, label) {
  const src = readFileSync(path.join(process.cwd(), 'components/icons/huddle-icons.tsx'), 'utf8')
  const want = /export const InkSettings = ink\(\n  'Settings',\n  '([^']+)'/.exec(src)?.[1]
  const got = await page.locator('svg[data-ink-icon="Settings"] path').first().getAttribute('d').catch(() => null)
  check(`⑥ ${label} served ink paths match the repo build`, !!want && got === want, `${got?.length} vs ${want?.length} chars`)
}

async function main() {
  const browser = await chromium.launch()
  const hasState = existsSync(STATE)
  const ctxD = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, ...(hasState ? { storageState: STATE } : {}) })
  ctxD.setDefaultTimeout(180000)
  const pD = await ctxD.newPage()
  const errors = []
  pD.on('pageerror', (e) => errors.push(e.message))
  // Logged-out "/" is the marketing page (no redirect), so probe /notebook.
  await pD.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
  await sleep(4000)
  if (!hasState || (await pD.evaluate(() => location.pathname.startsWith('/login')))) await login(pD)
  await ctxD.storageState({ path: STATE })

  // Throwaway note (created in 繁中 so the labels are stable).
  await setLang(pD, 'zh-TW')
  await pD.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
  await pD.getByRole('button', { name: '新增記事' }).first().waitFor({ state: 'visible', timeout: 120000 })
  await sleep(1000)
  await pD.getByRole('button', { name: '新增記事' }).first().click()
  const title = pD.locator('input[placeholder="無標題"]')
  await title.waitFor({ state: 'visible', timeout: 15000 })
  await title.fill(NOTE_TITLE)
  await title.press('Enter')
  await sleep(1500)

  for (const lang of ['en', 'zh-TW']) {
    const L = `desktop-${tag(lang)}`
    await setLang(pD, lang)
    await pD.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await pD.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
    await checkPullTab(pD, lang, L)
    await checkServedIcons(pD, L)
    await checkUserMenu(pD, lang, L)
    await openTestNote(pD)
    await checkNotebookIcons(pD, L)
    await pD.screenshot({ path: out(`${L}-notebook`) })
  }
  // Also the narrowest desktop width where the pull-tab sits over the header.
  await pD.setViewportSize({ width: 1024, height: 800 })
  await setLang(pD, 'en')
  await pD.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await checkPullTab(pD, 'en', 'desktop1024-en')
  await pD.setViewportSize({ width: 1280, height: 900 })

  const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, storageState: STATE })
  ctxM.setDefaultTimeout(180000)
  const pM = await ctxM.newPage()
  pM.on('pageerror', (e) => errors.push(e.message))
  await pM.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  for (const lang of ['en', 'zh-TW']) {
    const L = `mobile-${tag(lang)}`
    await pM.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await setLang(pM, lang)
    await sleep(1500)
    const tabbar = pM.locator('nav').filter({ has: pM.locator('svg[data-ink-icon="Calendar"]') }).last()
    await tabbar.waitFor({ state: 'visible' }) // the live site loads slower than localhost
    await tabbar.screenshot({ path: out(`${L}-tabbar`) })
    // ④ boss picked the easel whiteboard over the star (2026-10-02).
    check(`④ ${L} whiteboard tab uses the whiteboard icon`, (await tabbar.locator('svg[data-ink-icon="Whiteboard"]').count()) === 1 && (await tabbar.locator('svg[data-ink-icon="SparklesLg"]').count()) === 0)
    // On phones the avatar lives in the Tasks tab header.
    await dismissWater(pM)
    if (!(await pM.locator(`button[aria-label="${T[lang].userMenu}"]`).first().isVisible().catch(() => false))) {
      await pM.locator('button:has(svg[data-ink-icon="Tasks"])').last().click()
      await sleep(800)
    }
    await checkUserMenu(pM, lang, L)
    await openTestNote(pM)
    await checkNotebookIcons(pM, L)
    await pM.screenshot({ path: out(`${L}-notebook`) })
    await checkSlashVsBar(pM, L, false)
    await checkSlashVsBar(pM, L, true)
  }
  await ctxM.close()

  // Cleanup: delete the throwaway note.
  await setLang(pD, 'zh-TW')
  await pD.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
  await pD.getByRole('button', { name: '新增記事' }).first().waitFor({ state: 'visible', timeout: 120000 })
  await sleep(1200)
  // Also sweeps notes left behind by interrupted runs (same title prefix).
  const LEFTOVER = /^UI驗證 \d+$/
  for (let n = 0; n < 10; n++) {
    const row = pD.locator('div.group', { has: pD.getByText(LEFTOVER) }).first()
    if (!(await row.count())) break
    await row.hover()
    await row.getByRole('button', { name: '刪除記事' }).click()
    await sleep(250)
    await row.getByRole('button', { name: '刪除', exact: true }).click()
    await sleep(1500)
  }
  check('cleanup: throwaway notes deleted', (await pD.getByText(LEFTOVER).count()) === 0)
  check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed (${MODE}) — shots in ${path.relative(process.cwd(), SHOT_DIR)}`)
  await browser.close()
}

main().catch((e) => { console.error(e); exitCode = 1 }).finally(() => process.exit(exitCode))
