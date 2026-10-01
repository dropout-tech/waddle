#!/usr/bin/env node
/**
 * Screenshots + functional check for the notebook block icons ("/" menu and
 * the mobile editor toolbar).
 *
 *   node scripts/e2e/block-icons-shots.mjs before   # shots only
 *   node scripts/e2e/block-icons-shots.mjs after    # shots + assertions
 *
 * Expects a dev server already running (E2E_PORT, default 3112) and the e2e
 * test account in .env.e2e.local. Creates ONE test note in that account and
 * deletes it at the end. Login state is cached outside the repo (E2E_STATE)
 * because Supabase rate-limits repeated password logins.
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

// E2E_NOTE reuses a note left behind by an interrupted run (it still gets deleted).
const REUSE = process.env.E2E_NOTE || ''
const NOTE_TITLE = REUSE || `圖示驗證 ${Date.now() % 100000}`
const results = []
let exitCode = 0
const out = (name) => path.join(SHOT_DIR, `${MODE}-${name}.png`)

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
  // next-themes is class-based (attribute="class", defaultTheme="light").
  await page.evaluate((t) => {
    localStorage.setItem('theme', t)
    const el = document.documentElement
    el.classList.toggle('dark', t === 'dark')
    el.classList.toggle('light', t !== 'dark')
    el.style.colorScheme = t
  }, theme)
  await sleep(250)
}

const pm = (page) => page.locator('.ProseMirror').first()
const menu = (page) => page.locator('.nb-slash-menu [role="listbox"]')

async function openNotebook(page) {
  await page.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
  // The Next dev-tools badge sits on top of the mobile toolbar; hide it for shots.
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.getByRole('button', { name: '新增記事' }).first().waitFor({ state: 'visible', timeout: 120000 })
  await sleep(1200)
}

async function openTestNote(page) {
  const row = page.getByText(NOTE_TITLE, { exact: false }).first()
  await row.waitFor({ state: 'visible', timeout: 20000 })
  await row.click()
  await page.locator('input[placeholder="無標題"]').waitFor({ state: 'visible', timeout: 15000 })
  await sleep(400)
}

/** Caret into a fresh empty paragraph at the end of the doc. */
async function freshLine(page) {
  await pm(page).click()
  await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror')?.editor
    if (!ed) throw new Error('tiptap editor not found on .ProseMirror')
    ed.chain().focus('end').insertContentAt(ed.state.doc.content.size, { type: 'paragraph' }).focus('end').run()
  })
  await sleep(150)
}

async function openSlashMenu(page) {
  await freshLine(page)
  await page.keyboard.type('/')
  await menu(page).waitFor({ state: 'visible', timeout: 8000 })
  await sleep(250)
}

async function closeSlashMenu(page) {
  await page.keyboard.press('Escape')
  await sleep(150)
  await page.keyboard.press('Backspace')
  await sleep(150)
}

/** Element shot of the menu with the scroll cap lifted so all 12 rows show. */
async function shotFullMenu(page, file) {
  const tag = await page.addStyleTag({
    content: '.nb-slash-menu{top:8px!important;bottom:auto!important}.nb-slash-menu [role="listbox"]{max-height:none!important}',
  })
  await sleep(150)
  await menu(page).screenshot({ path: file })
  await tag.evaluate((el) => el.remove())
  await sleep(100)
}

async function main() {
  const browser = await chromium.launch()

  // ───────── desktop, DPR 1 ─────────
  const hasState = existsSync(STATE)
  const ctx1 = await browser.newContext({
    viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'zh-TW',
    ...(hasState ? { storageState: STATE } : {}),
  })
  const p1 = await ctx1.newPage()
  const pageErrors = []
  p1.on('pageerror', (e) => pageErrors.push(e.message))
  await p1.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
  await sleep(2500)
  if (await p1.evaluate(() => location.pathname.startsWith('/login'))) await login(p1)
  await ctx1.storageState({ path: STATE })

  await openNotebook(p1)
  await setTheme(p1, 'light')
  if (REUSE) {
    await openTestNote(p1)
  } else {
    await p1.getByRole('button', { name: '新增記事' }).first().click()
    const title = p1.locator('input[placeholder="無標題"]')
    await title.waitFor({ state: 'visible', timeout: 15000 })
    await title.fill(NOTE_TITLE)
    await title.press('Enter')
    await sleep(500)
  }
  await openSlashMenu(p1)
  const count = await p1.locator('.nb-slash-menu [role="option"]').count()
  check('slash menu lists 12 items', count === 12, `got ${count}`)

  await p1.screenshot({ path: out('desktop-1280-light') })
  await shotFullMenu(p1, out('menu-light-dpr1'))
  await setTheme(p1, 'dark')
  await p1.screenshot({ path: out('desktop-1280-dark') })
  await shotFullMenu(p1, out('menu-dark-dpr1'))
  await setTheme(p1, 'light')

  if (MODE === 'after') {
    const svgInfo = await p1.evaluate(() =>
      [...document.querySelectorAll('.nb-slash-menu [role="option"]')].map((o) => {
        const svg = o.querySelector('svg')
        const r = svg?.getBoundingClientRect()
        return {
          label: o.querySelector('span span')?.textContent,
          lucide: svg?.getAttribute('class')?.includes('lucide') ?? null,
          w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
          color: svg ? getComputedStyle(svg).color : '',
        }
      }))
    console.log('icons:', JSON.stringify(svgInfo))
    check('no lucide icon left in slash menu', svgInfo.every((s) => s.lucide === false))
  }
  await closeSlashMenu(p1)

  // ───────── functional: keyboard + mouse still insert the right block ─────────
  if (MODE === 'after') {
    const expectations = [
      [1, 'h1'], [2, 'h2'], [3, 'h3'], [4, 'ul[data-type="taskList"]'], [5, 'ul:not([data-type])'],
      [6, 'ol'], [7, '[data-type="details"], details'], [8, 'blockquote'], [9, 'pre'], [10, 'hr'],
    ]
    for (const [downs, selector] of expectations) {
      const before = await pm(p1).locator(selector).count()
      await p1.keyboard.type('/')
      await menu(p1).waitFor({ state: 'visible', timeout: 8000 })
      for (let i = 0; i < downs; i++) await p1.keyboard.press('ArrowDown')
      const label = await p1.locator('.nb-slash-menu [role="option"][aria-selected="true"]').innerText()
      await p1.keyboard.press('Enter')
      await sleep(250)
      const after = await pm(p1).locator(selector).count()
      check(`keyboard ↓×${downs} + Enter inserts ${selector}`, after === before + 1, label.split('\n')[0])
      // leave the block: move to doc end and open a fresh paragraph
      await p1.keyboard.type('x')
      await freshLine(p1)
    }
    // ArrowUp wraps to the last item (圖片)
    await p1.keyboard.type('/')
    await menu(p1).waitFor({ state: 'visible', timeout: 8000 })
    await p1.keyboard.press('ArrowUp')
    const last = await p1.locator('.nb-slash-menu [role="option"][aria-selected="true"]').innerText()
    check('ArrowUp wraps to 圖片', last.startsWith('圖片'), last.split('\n')[0])
    // mouse: click 引言
    const q0 = await pm(p1).locator('blockquote').count()
    await p1.locator('.nb-slash-menu [role="option"]', { hasText: '引言' }).click()
    await sleep(250)
    check('mouse click 引言 inserts blockquote', (await pm(p1).locator('blockquote').count()) === q0 + 1)
    // filter still works
    await p1.keyboard.type('x')
    await freshLine(p1)
    await p1.keyboard.type('/h2')
    await sleep(300)
    const filtered = await p1.locator('.nb-slash-menu [role="option"]').allInnerTexts()
    check('filter "/h2" leaves 標題 2 only', filtered.length === 1 && filtered[0].includes('標題 2'))
    await p1.keyboard.press('Escape')
    await sleep(800)
  }
  await sleep(1500) // let autosave flush before other contexts read the note
  check('no page errors (desktop)', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

  // ───────── desktop, DPR 2 + a 4× close-up ─────────
  for (const [dpr, tag] of [[2, 'dpr2'], [4, 'zoom4x']]) {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 }, deviceScaleFactor: dpr, storageState: STATE, locale: 'zh-TW',
    })
    const p = await ctx.newPage()
    await openNotebook(p)
    await openTestNote(p)
    for (const theme of ['light', 'dark']) {
      await setTheme(p, theme)
      await openSlashMenu(p)
      await shotFullMenu(p, out(`menu-${theme}-${tag}`))
      await closeSlashMenu(p)
    }
    await setTheme(p, 'light')
    if (tag === 'dpr2') {
      // desktop selection bubble (B / I / U / S / code / link)
      await freshLine(p)
      await p.keyboard.type('選取這段文字')
      await p.keyboard.press('Shift+Home')
      const bold = p.locator('button[title="粗體"]')
      if (await bold.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
        for (const theme of ['light', 'dark']) {
          await setTheme(p, theme)
          const b = await bold.locator('..').boundingBox()
          await p.screenshot({
            path: out(`bubble-${theme}`),
            clip: { x: b.x - 16, y: b.y - 12, width: b.width + 32, height: b.height + 56 },
          })
        }
        await setTheme(p, 'light')
      } else check('selection bubble visible', false)
      await p.keyboard.press('ArrowRight')
    }
    await sleep(1500) // autosave flush
    await ctx.close()
  }

  // ───────── mobile 390×844 ─────────
  const ctxM = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, storageState: STATE, locale: 'zh-TW',
  })
  const pM = await ctxM.newPage()
  await openNotebook(pM)
  await openTestNote(pM)
  await pm(pM).click()
  await sleep(500)
  const bar = pM.locator('button[title="標題 1"]').locator('..')
  for (const theme of ['light', 'dark']) {
    await setTheme(pM, theme)
    await bar.evaluate((el) => { el.scrollLeft = 0 })
    await sleep(150)
    await pM.screenshot({ path: out(`mobile-390-${theme}`) })
    await bar.screenshot({ path: out(`mobile-toolbar-${theme}-a`) })
    await bar.evaluate((el) => { el.scrollLeft = 300 })
    await sleep(150)
    await bar.screenshot({ path: out(`mobile-toolbar-${theme}-b`) })
    await bar.evaluate((el) => { el.scrollLeft = el.scrollWidth })
    await sleep(150)
    await bar.screenshot({ path: out(`mobile-toolbar-${theme}-c`) })
  }
  await setTheme(pM, 'light')
  await bar.evaluate((el) => { el.scrollLeft = 0 })
  const sizes = await bar.evaluate((el) =>
    [...el.querySelectorAll('button')].map((b) => {
      const r = b.getBoundingClientRect()
      return `${b.title}:${Math.round(r.width)}x${Math.round(r.height)}`
    }))
  console.log('mobile toolbar buttons:', sizes.join(' '))
  // mobile slash menu
  await openSlashMenu(pM)
  await pM.screenshot({ path: out('mobile-390-slash-light') })
  await closeSlashMenu(pM)
  await sleep(1500) // autosave flush
  await ctxM.close()

  // ───────── cleanup: delete the test note ─────────
  await openNotebook(p1)
  // Every row carries its own (hover-revealed) delete button, so scope both
  // clicks to THIS run's row — never `.first()` across the whole list.
  let deleted = 0
  const row = p1.locator('div.group', { has: p1.getByText(NOTE_TITLE, { exact: true }) })
  if ((await row.count()) === 1) {
    await row.hover()
    await row.getByRole('button', { name: '刪除記事' }).click()
    await sleep(250)
    await row.getByRole('button', { name: '刪除', exact: true }).click()
    await sleep(1200)
    deleted++
  }
  const left = await p1.getByText(NOTE_TITLE, { exact: true }).count()
  check('test note deleted', deleted >= 1 && left === 0, `deleted ${deleted}, left ${left}`)

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed (${MODE})`)
  await browser.close()
}

main().catch((e) => { console.error(e); exitCode = 1 }).finally(() => process.exit(exitCode))
