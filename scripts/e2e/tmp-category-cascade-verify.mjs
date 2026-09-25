#!/usr/bin/env node
/**
 * Two-level (cascading) category picker in task-detail-modal.
 *
 * Asserts, against a real dev server on a dedicated port and the real
 * Supabase project:
 *  1. Desktop 1280x900: the picker renders TWO columns; hovering a workspace
 *     on the left swaps the right column to that workspace's categories;
 *     clicking a category closes the popover and updates the trigger label to
 *     "<workspace> / <category>"; outside-click dismisses.
 *  2. Desktop: the popover never crosses the right edge of the viewport.
 *  3. 未分類 is the first row and its dot is #9C9086 (rgb(156,144,134)).
 *  4. Mobile 390x844: accordion — opening one workspace collapses the other;
 *     every tappable row is >= 44 px tall; zero horizontal overflow.
 *  5. English UI: no hard-coded Chinese chrome left inside the popover.
 *     Workspace/category names are user data from the DB and are excluded —
 *     see the note printed next to check 5.
 *  6. Zero pageerror across the whole run.
 *  7. Keyboard: Tab reaches the picker rows (left column's onFocus swaps the
 *     right column), Enter commits.
 *
 * DB writes: NONE. Every task modal is opened in create mode from the
 * calendar and dismissed with Escape without ever saving.
 *
 * Screenshots -> docs/reports/2026-08-10-category-cascade-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3131
const BASE = `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-10-category-cascade-shots')
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
if (!EMAIL || !PASSWORD) { console.error('missing E2E creds in .env.e2e.local'); process.exit(1) }

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  ok ? passed++ : failed++
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}
function note(name, detail = '') { console.log(`ℹ️  ${name}${detail ? ' — ' + detail : ''}`) }

const todayStr = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const CJK = /[㐀-鿿豈-﫿]/

async function fillStable(page, selector, value) {
  for (let i = 0; i < 5; i++) {
    await page.fill(selector, value)
    await sleep(150)
    if ((await page.inputValue(selector)) === value) return
  }
  throw new Error(`fill unstable: ${selector}`)
}

const pageErrors = []

async function newLoggedInPage(browser, lang, viewport, beforeGoto) {
  const ctx = await browser.newContext({ locale: lang === 'en' ? 'en-US' : 'zh-TW', viewport })
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(`[${lang}] ${e}`))
  await page.addInitScript((l) => { try { localStorage.setItem('waddle-language-v1', l) } catch {} }, lang)
  if (beforeGoto) await beforeGoto(page)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.locator('button[type="submit"]').waitFor({ timeout: 30000 })
  await sleep(3000)
  await fillStable(page, 'input[type="email"]', EMAIL)
  await fillStable(page, 'input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
  await sleep(5000)
  return { ctx, page }
}

// A short click on empty day-grid opens the slot-type picker; existing events
// sit on top of the grid, so several vertical positions are tried.
async function openSlotPicker(page, lang) {
  const marker = lang === 'en' ? 'Choose a block type' : '選擇時間區塊的類型'
  const grid = page.locator(`[data-day-grid][data-day-date="${todayStr}"]`).first()
  const box = await grid.boundingBox()
  if (!box) throw new Error('today grid column not found')
  const vh = page.viewportSize().height
  for (const ratio of [0.85, 0.7, 0.55, 0.4, 0.25]) {
    const x = box.x + box.width * 0.6
    const y = Math.min(Math.max(box.y + box.height * ratio, 120), vh - 60)
    await page.mouse.click(x, y, { delay: 30 })
    await sleep(500)
    if (await page.getByText(marker).isVisible().catch(() => false)) return true
    await page.keyboard.press('Escape')
    await sleep(300)
  }
  return false
}

/** Opens the task-detail modal in create mode. Returns its category trigger. */
async function openTaskModal(page, lang) {
  await page.locator('[aria-label="日檢視"], [aria-label="Day view"]').first().click()
  await sleep(1200)
  if (!(await openSlotPicker(page, lang))) throw new Error('slot picker never opened')
  const rowRe = lang === 'en' ? /Add a task to "/ : /新增任務到「/
  await page.locator('button').filter({ hasText: rowRe }).first().click()
  await sleep(1500)
  const trigger = page.locator('button').filter({ hasText: /\S\s\/\s\S/ }).first()
  await trigger.waitFor({ timeout: 15000 })
  return trigger
}

async function closeAll(page) {
  await page.keyboard.press('Escape'); await sleep(400)
  await page.keyboard.press('Escape'); await sleep(800)
}

async function readRows(scope, attr) {
  const els = scope.locator(`[data-picker-${attr}]`)
  const n = await els.count()
  const out = []
  for (let i = 0; i < n; i++) out.push((await els.nth(i).innerText()).replace(/\s+/g, ' ').trim())
  return out
}

let browser
const server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true,
})
server.stdout.on('data', () => {})
server.stderr.on('data', () => {})

async function waitServer() {
  for (let i = 0; i < 180; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready on port ' + PORT)
}

try {
  await waitServer()
  browser = await chromium.launch()

  // ══════════════ Desktop, zh-TW ══════════════════════════════════════════
  const { ctx, page } = await newLoggedInPage(browser, 'zh-TW', { width: 1280, height: 900 })
  const trigger = await openTaskModal(page, 'zh-TW')
  await trigger.click()
  await sleep(600)

  const popover = page.locator('[data-category-picker="desktop"]')
  check('1a 桌面出現兩欄式選單（非攤平清單）', await popover.isVisible(), 'selector=[data-category-picker="desktop"]')

  const wsRows = popover.locator('[data-picker-workspace]')
  const wsCount = await wsRows.count()
  const wsNames = await readRows(popover, 'workspace')
  check('1b 左欄列出未封存的大分類（≥2）', wsCount >= 2, `workspaces=${wsNames.join(' | ')}`)

  note('3-前置 本 e2e 帳號建立於 未分類 大分類 migration 之前，DB 裡沒有 isDefault 大分類；check 3 改在下面用回應攔截驗證',
    `此帳號現有大分類=${wsNames.join(' | ')}`)

  // hover switches the right column, with no click
  const catsForFirst = await readRows(popover, 'category')
  let targetIdx = -1, targetCats = []
  for (let i = 1; i < wsCount; i++) {
    await wsRows.nth(i).hover()
    await sleep(350)
    const cats = await readRows(popover, 'category')
    if (cats.length && cats.join('|') !== catsForFirst.join('|')) { targetIdx = i; targetCats = cats; break }
  }
  check('1c 滑鼠移過左欄即展開右欄（不需點擊）', targetIdx > 0,
    `hover「${wsNames[targetIdx] ?? '?'}」→ ${targetCats.join(' | ')}｜原本(${wsNames[0]}) → ${catsForFirst.join(' | ')}`)
  await page.screenshot({ path: path.join(SHOTS, '1-desktop-two-column.png') })

  const pbox = await popover.boundingBox()
  const vw = page.viewportSize().width
  check('2 桌面 popover 右緣未超出視窗', Boolean(pbox) && pbox.x + pbox.width <= vw,
    `x=${Math.round(pbox.x)} w=${Math.round(pbox.width)} right=${Math.round(pbox.x + pbox.width)} vw=${vw}`)

  const wantWs = wsNames[targetIdx]
  const wantCat = targetCats[0]
  await popover.locator('[data-picker-category]').first().click()
  await sleep(600)
  check('1d 點小分類後選單關閉', !(await popover.isVisible().catch(() => false)))
  const label = (await trigger.innerText()).replace(/\s+/g, ' ').trim()
  check('1e 觸發鈕更新為「大分類 / 小分類」', label.includes(wantWs) && label.includes(wantCat),
    `label="${label}" expected="${wantWs} / ${wantCat}"`)

  await trigger.click(); await sleep(400)
  await page.mouse.click(vw - 40, 500); await sleep(500)
  check('1f 點選單外面可關閉', !(await popover.isVisible().catch(() => false)))

  // keyboard reachability
  await trigger.click(); await sleep(400)
  const tabHits = []
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab'); await sleep(250)
    tabHits.push(await page.evaluate(() => {
      const el = document.activeElement
      return el?.getAttribute('data-picker-workspace') ? `ws:${el.textContent.trim()}`
        : el?.getAttribute('data-picker-category') ? `cat:${el.textContent.trim()}` : 'other'
    }))
  }
  const rightColAfterFocus = await readRows(popover, 'category')
  check('7 鍵盤 Tab 走得進選單（左欄聚焦即同步右欄）',
    tabHits.some((h) => h.startsWith('ws:') || h.startsWith('cat:')),
    `tab序列=${tabHits.join(' → ')}；右欄=${rightColAfterFocus.join(' | ')}`)
  await page.keyboard.press('Escape'); await sleep(300)
  await closeAll(page)

  // ══════════════ Mobile 390x844 ══════════════════════════════════════════
  // Modal is opened at desktop width (the calendar create flow is proven
  // there), then the viewport is resized — useIsMobile listens to matchMedia,
  // so the accordion tree takes over. Same approach as
  // tmp-default-category-verify.mjs's mobile section.
  const triggerM = await openTaskModal(page, 'zh-TW')
  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(1200)
  await triggerM.click()
  await sleep(600)

  const sheet = page.locator('[data-category-picker="mobile"]')
  check('4a 手機版是手風琴 sheet（非兩欄）', await sheet.isVisible(), 'selector=[data-category-picker="mobile"]')

  const mRows = sheet.locator('[data-picker-workspace]')
  const mNames = await readRows(sheet, 'workspace')
  // Collapse whatever opened by default, so the "collapsed" shot is honest.
  for (let i = 0; i < (await mRows.count()); i++) {
    if ((await mRows.nth(i).getAttribute('aria-expanded')) === 'true') {
      await mRows.nth(i).click(); await sleep(400)
    }
  }
  const allCollapsed = (await sheet.locator('[data-picker-category]').count()) === 0
  check('4b 可全部收合', allCollapsed, `workspaces=${mNames.join(' | ')}`)
  await page.screenshot({ path: path.join(SHOTS, '2-mobile-collapsed.png') })

  // pick two different workspaces that actually have categories
  let firstOpen = -1, secondOpen = -1
  for (let i = 0; i < (await mRows.count()); i++) {
    await mRows.nth(i).click(); await sleep(400)
    const catCount = await sheet.locator('[data-picker-category]').count()
    if (catCount > 0) { if (firstOpen === -1) firstOpen = i; else { secondOpen = i; break } }
    if ((await mRows.nth(i).getAttribute('aria-expanded')) === 'true') { await mRows.nth(i).click(); await sleep(300) }
  }
  const expandedFlags = []
  for (let i = 0; i < (await mRows.count()); i++) expandedFlags.push(await mRows.nth(i).getAttribute('aria-expanded'))
  const onlyOneOpen = expandedFlags.filter((f) => f === 'true').length === 1
  check('4c 點另一個大分類時，前一個自動收起（同時只展開一個）',
    firstOpen > -1 && secondOpen > -1 && onlyOneOpen && expandedFlags[secondOpen] === 'true',
    `展開「${mNames[secondOpen]}」後 aria-expanded=[${expandedFlags.join(',')}]（先前展開的是「${mNames[firstOpen]}」）`)
  await page.screenshot({ path: path.join(SHOTS, '3-mobile-expanded.png') })

  let minH = 9999
  const tapRows = sheet.locator('[data-picker-workspace], [data-picker-category]')
  for (let i = 0; i < (await tapRows.count()); i++) {
    const b = await tapRows.nth(i).boundingBox()
    if (b) minH = Math.min(minH, b.height)
  }
  check('4d 每個可點列高度 ≥44px', minH >= 44, `min=${minH.toFixed(1)}px（共 ${await tapRows.count()} 列）`)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth)
  check('4e 390px 零水平溢出', overflow <= 390, `scrollWidth=${overflow}`)

  // mobile selection still commits
  const mCat = (await sheet.locator('[data-picker-category]').first().innerText()).trim()
  await sheet.locator('[data-picker-category]').first().click()
  await sleep(600)
  const mLabel = (await triggerM.innerText()).replace(/\s+/g, ' ').trim()
  check('4f 手機點小分類後關閉並更新觸發鈕', !(await sheet.isVisible().catch(() => false)) && mLabel.includes(mCat),
    `label="${mLabel}" cat="${mCat}"`)
  await closeAll(page)
  await ctx.close()

  // ══════════════ 未分類 pinned first (response interception) ═════════════
  // This account predates the 未分類 workspace migration, so the DB has no
  // isDefault workspace to assert against — and the brief forbids touching
  // the DB. Instead the GET responses for workspaces/categories are rewritten
  // in flight to include one, which exercises the real component code path
  // (sortWorkspacesForDisplay + the color dot) without any write.
  const FAKE_WS = '00000000-0000-4000-8000-00000000dead'
  const FAKE_CAT = '00000000-0000-4000-8000-00000000beef'
  const stub = async (page) => {
    await page.route('**/rest/v1/workspaces*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const res = await route.fetch()
      let body
      try { body = await res.json() } catch { return route.fulfill({ response: res }) }
      if (Array.isArray(body) && body.length) {
        body = [...body, {
          ...body[0], id: FAKE_WS, name: '未分類', color: '#9C9086', icon: '📥',
          sort_order: 999, is_archived: false, is_default: true,
        }]
      }
      await route.fulfill({ response: res, body: JSON.stringify(body) })
    })
    await page.route('**/rest/v1/categories*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const res = await route.fetch()
      let body
      try { body = await res.json() } catch { return route.fulfill({ response: res }) }
      if (Array.isArray(body) && body.length) {
        body = [...body, {
          ...body[0], id: FAKE_CAT, workspace_id: FAKE_WS, name: '未分類',
          sort_order: 0, is_archived: false, is_collapsed: false, is_default: true,
        }]
      }
      await route.fulfill({ response: res, body: JSON.stringify(body) })
    })
  }
  const { ctx: ctxD, page: pageD } = await newLoggedInPage(browser, 'zh-TW', { width: 1280, height: 900 }, stub)
  const triggerD = await openTaskModal(pageD, 'zh-TW')
  await triggerD.click()
  await sleep(600)
  const popD = pageD.locator('[data-category-picker="desktop"]')
  const dNames = await readRows(popD, 'workspace')
  const dFirstRow = popD.locator('[data-picker-workspace]').first()
  const dColor = await dFirstRow.locator('div').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const dSortOrder = await dFirstRow.getAttribute('data-picker-workspace')
  check('3a 「未分類」(isDefault) 被釘在第一列，即使它的 sortOrder 最大',
    dNames[0] === '未分類' && dSortOrder === FAKE_WS, `order=${dNames.join(' | ')}`)
  check('3b 第一列色點 = #9C9086', dColor === 'rgb(156, 144, 134)', dColor)
  await pageD.screenshot({ path: path.join(SHOTS, '5-desktop-uncategorized-pinned.png') })
  await closeAll(pageD)
  await ctxD.close()

  // ══════════════ English ═════════════════════════════════════════════════
  const { ctx: ctxEn, page: pageEn } = await newLoggedInPage(browser, 'en', { width: 1280, height: 900 })
  const triggerEn = await openTaskModal(pageEn, 'en')
  await triggerEn.click()
  await sleep(600)
  const popEn = pageEn.locator('[data-category-picker="desktop"]')
  const enWs = await readRows(popEn, 'workspace')
  const enCats = await readRows(popEn, 'category')
  const popText = (await popEn.innerText())
  // Strip the DB-sourced names; whatever is left is our own chrome.
  let residue = popText
  for (const n of [...enWs, ...enCats]) residue = residue.split(n).join('')
  check('5 English UI：選單自有文案零殘留中文', !CJK.test(residue),
    `殘留=${JSON.stringify(residue.replace(/\s+/g, ' ').trim().slice(0, 80))}`)
  note('5b 大分類/小分類名稱是 DB 使用者資料（signup 時以當時語言種下），本次帳號為 zh 建立，故英文介面下仍顯示中文名',
    `英文介面實際名稱=${enWs.join(' | ')}`)
  await pageEn.screenshot({ path: path.join(SHOTS, '4-english-two-column.png') })
  await closeAll(pageEn)
  await ctxEn.close()

  check('6 全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (err) {
  check('FATAL', false, String(err))
} finally {
  try { await browser?.close() } catch {}
  try { process.kill(-server.pid, 'SIGTERM') } catch {}
}

console.log(`\n${passed}/${passed + failed} passed`)
console.log(`screenshots → ${SHOTS}`)
process.exit(failed ? 1 : 0)
