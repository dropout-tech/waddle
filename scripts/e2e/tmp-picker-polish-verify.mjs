#!/usr/bin/env node
/**
 * Verification for the two category-picker polish items (2026-08-11):
 *
 *  A. The desktop category popover no longer slices the drawer's title in
 *     half — it now anchors to the drawer header's content gutters
 *     (left-5 / right-5) so it either misses the title entirely or covers
 *     it edge to edge. Asserted with real boundingBox numbers + a canvas
 *     measurement of the rendered title text (an <input>'s text has no DOM
 *     box of its own), in BOTH zh-TW and English (the English string is
 *     longer, which is what made the old half-cover so obvious).
 *  B. Settings → 一般 → 預設分類 now uses the same two-level cascade picker
 *     as the task drawer (shared component
 *     components/category/category-cascade-picker.tsx), and the pick is
 *     really persisted (verified across a full page reload).
 *
 * Checks map 1:1 to the task brief's 8 acceptance conditions.
 *
 * DB writes: (1) two throwaway tasks (one per language), each created via
 * the real ⌘K → 新增任務 path and deleted again + reload-verified gone;
 * (2) the global default category is really changed and then RESTORED to
 * 未分類 / 未分類, with the restore reload-verified.
 *
 * Dev server: own port 3151, started and stopped by this script.
 * Screenshots -> docs/reports/2026-08-11-picker-polish-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3151
const BASE = `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-11-picker-polish-shots')
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

const CJK = /[㐀-鿿豈-﫿]/
const pageErrors = []

async function fillStable(page, selector, value) {
  for (let i = 0; i < 5; i++) {
    await page.fill(selector, value)
    await sleep(150)
    if ((await page.inputValue(selector)) === value) return
  }
  throw new Error(`fill unstable: ${selector}`)
}

async function newLoggedInPage(browser, lang, viewport) {
  const ctx = await browser.newContext({ locale: lang === 'en' ? 'en-US' : 'zh-TW', viewport })
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(`[${lang}] ${e}`))
  await page.addInitScript((l) => { try { localStorage.setItem('waddle-language-v1', l) } catch {} }, lang)
  // next dev's <nextjs-portal> overlay is fixed bottom-left and silently eats
  // clicks on the 390px tab bar's leftmost button. addStyleTag would be lost
  // on every page.reload(), so hide it from an init script instead (that's
  // what made an earlier draft of this script "lose" the task panel).
  await page.addInitScript(() => {
    const apply = () => {
      const s = document.createElement('style')
      s.textContent = 'nextjs-portal { display: none !important; }'
      document.head?.appendChild(s)
    }
    if (document.head) apply()
    else document.addEventListener('DOMContentLoaded', apply)
  })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.locator('button[type="submit"]').waitFor({ timeout: 30000 })
  await sleep(3000)
  await fillStable(page, 'input[type="email"]', EMAIL)
  await fillStable(page, 'input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
  await sleep(5000)
  // next dev's <nextjs-portal> overlay eats clicks at 390px (dev-only).
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' }).catch(() => {})
  return { ctx, page }
}

async function readRows(scope, attr) {
  const els = scope.locator(`[data-picker-${attr}]`)
  const n = await els.count()
  const out = []
  for (let i = 0; i < n; i++) out.push((await els.nth(i).innerText()).replace(/\s+/g, ' ').trim())
  return out
}

/** Create a throwaway task through the real ⌘K → 新增任務 path (same
 *  handleCreateCalendarTask an empty-calendar-space click uses). */
async function createThrowawayTask(page, lang) {
  await page.keyboard.press('Control+k')
  await sleep(900)
  const cmdInput = page.locator('[data-slot="command-input"]').first()
  await cmdInput.waitFor({ timeout: 10000 })
  await cmdInput.fill(lang === 'en' ? 'Add' : '新增任務')
  await sleep(600)
  await page.keyboard.press('Enter')
  await sleep(2000)
}

async function deleteOpenTask(page) {
  const dlg = page.getByRole('dialog').first()
  const del = dlg.locator('button[title="刪除任務"], button[aria-label="刪除任務"], button[title="Delete task"], button[aria-label="Delete task"]').first()
  if (!(await del.count())) return false
  await del.click()
  await sleep(2500)
  return true
}

async function openSettings(page) {
  await page.locator('[aria-label="設定"], [aria-label="Settings"]').first().click()
  await sleep(1500)
  const generalTab = page.getByRole('button', { name: /一般設定|General/ }).first()
  if (await generalTab.count().catch(() => 0)) { await generalTab.click().catch(() => {}); await sleep(500) }
  const section = page.locator('div.space-y-3').filter({ hasText: /自動歸到預設分類|Auto-assign to default category/ }).first()
  await section.scrollIntoViewIfNeeded().catch(() => {})
  await sleep(400)
  return section
}

/** Escape until no dialog is left standing (a still-open modal silently eats
 *  every subsequent click, which is how the first draft of this script
 *  "lost" the task panel). */
async function closeModal(page) {
  for (let i = 0; i < 6; i++) {
    if ((await page.getByRole('dialog').count().catch(() => 0)) === 0) return true
    await page.keyboard.press('Escape')
    await sleep(600)
  }
  return (await page.getByRole('dialog').count().catch(() => 0)) === 0
}

/** Geometry of the settings modal's inline cascade panel against the modal's
 *  own scroll container and footer. The scroller's bottom edge and the
 *  footer's top edge are the same line, so "not clipped by the scroller"
 *  and "has air above the footer" are the same measurement. */
async function settingsPanelGeometry(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    const scroller = dialog?.querySelector('.overflow-y-auto')
    const footer = dialog?.lastElementChild
    const panel = document.querySelector('[data-category-picker]')
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1), left: +b.left.toFixed(1), right: +b.right.toFixed(1) }
    }
    const listCol = panel?.querySelector('[data-picker-workspace]')?.parentElement
    return {
      scroller: r(scroller), footer: r(footer), panel: r(panel),
      listScrollable: listCol ? listCol.scrollHeight > listCol.clientHeight + 1 : false,
      wsRows: document.querySelectorAll('[data-picker-workspace]').length,
      viewportH: window.innerHeight,
    }
  })
}

/** Rendered width of an <input>'s current value, measured with the input's
 *  own computed font — used to know where the title text actually ends. */
async function titleTextGeometry(titleInput) {
  const box = await titleInput.boundingBox()
  const value = await titleInput.inputValue()
  const textW = await titleInput.evaluate((el) => {
    const cs = getComputedStyle(el)
    const c = document.createElement('canvas').getContext('2d')
    c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    return c.measureText(el.value).width
  })
  return { box, value, textW, textLeft: box.x, textRight: box.x + textW }
}

let browser
// Reuse an already-listening dev server on this port if there is one (a
// SIGTERM'd Turbopack instance can hold the project lock long enough to make
// a fresh spawn look dead); otherwise start our own.
let alreadyUp = false
try { alreadyUp = (await fetch(`${BASE}/login`)).ok } catch {}
const server = alreadyUp
  ? null
  : spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
      cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    })
if (server) {
  server.stdout.on('data', () => {})
  server.stderr.on('data', () => {})
} else {
  note('dev server', `port ${PORT} 已有服務在跑，沿用（本腳本不負責關閉）`)
}
async function waitServer() {
  for (let i = 0; i < 180; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready on port ' + PORT)
}

let restoredLabel = 'NOT RUN'

try {
  await waitServer()
  browser = await chromium.launch()

  // ═══════════ 1 / 3 / 4：桌面 1280x900 中文 ════════════════════════════
  const { ctx, page } = await newLoggedInPage(browser, 'zh-TW', { width: 1280, height: 900 })
  await createThrowawayTask(page, 'zh-TW')

  const dialog = page.getByRole('dialog').first()
  const trigger = dialog.locator('button[aria-haspopup="menu"]').first()
  await trigger.waitFor({ timeout: 15000 })
  const titleInput = dialog.locator('input.text-lg').first()
  const g = await titleTextGeometry(titleInput)

  await trigger.click()
  await sleep(700)
  const pop = page.locator('[data-category-picker="desktop"]')
  check('0a 桌面選單開啟', await pop.isVisible().catch(() => false))
  const pb = await pop.boundingBox()
  const covH = pb.x <= g.textLeft + 0.5 && pb.x + pb.width >= g.textRight - 0.5
  const covV = pb.y <= g.box.y + 0.5 && pb.y + pb.height >= g.box.y + g.box.height - 0.5
  const halfCover = pb.y < g.box.y + g.box.height && pb.y + pb.height > g.box.y &&
    pb.x > g.textLeft && pb.x < g.textRight
  check('1 桌面中文：標題無「半遮」（選單整片覆蓋標題，非切一半）',
    !halfCover && covH && covV,
    `標題文字 "${g.value}" x=${g.textLeft.toFixed(1)}..${g.textRight.toFixed(1)}（輸入框 x=${g.box.x}..${(g.box.x + g.box.width).toFixed(0)} y=${g.box.y}..${(g.box.y + g.box.height).toFixed(0)}）｜選單 x=${pb.x.toFixed(1)}..${(pb.x + pb.width).toFixed(1)} y=${pb.y.toFixed(1)}..${(pb.y + pb.height).toFixed(1)}｜halfCover=${halfCover} 橫向全覆蓋=${covH} 縱向全覆蓋=${covV}`)
  check('3 桌面中文：選單右緣不超出視窗（x+width<=1280）', pb.x + pb.width <= 1280,
    `right=${(pb.x + pb.width).toFixed(1)}`)
  await page.screenshot({ path: path.join(SHOTS, '1-zh-picker-open.png') })
  await page.screenshot({ path: path.join(SHOTS, '1b-zh-title-area-crop.png'), clip: { x: 760, y: 0, width: 520, height: 260 } })

  // 4：task-detail 選單行為與改動前一致
  const wsNames = await readRows(pop, 'workspace')
  check('4a 未分類排第一（左欄第一列）', wsNames[0] === '未分類', wsNames.join(' | '))
  const catsBefore = await readRows(pop, 'category')
  const wsRows = pop.locator('[data-picker-workspace]')
  const wsCount = await wsRows.count()
  let hoveredIdx = -1, catsAfter = []
  for (let i = 1; i < wsCount; i++) {
    await wsRows.nth(i).hover(); await sleep(350)
    const cats = await readRows(pop, 'category')
    if (cats.length && cats.join('|') !== catsBefore.join('|')) { hoveredIdx = i; catsAfter = cats; break }
  }
  check('4b 桌面兩欄＋hover 換右欄', hoveredIdx > 0,
    `hover「${wsNames[hoveredIdx] ?? '?'}」→ ${catsAfter.join(' | ')}｜原本(${wsNames[0]}) → ${catsBefore.join(' | ')}`)
  const wantWs = wsNames[hoveredIdx], wantCat = catsAfter[0]
  await pop.locator('[data-picker-category]').first().click()
  await sleep(600)
  const closed = !(await pop.isVisible().catch(() => false))
  const newLabel = (await trigger.innerText()).replace(/\s+/g, ' ').trim()
  check('4c 點小分類後選單關閉＋觸發鈕文字更新',
    closed && newLabel.includes(wantWs) && newLabel.includes(wantCat),
    `label="${newLabel}" 期望包含「${wantWs} / ${wantCat}」`)
  await closeModal(page) // 不儲存：任務分類仍是 未分類/未分類

  // ═══════════ 5：設定頁預設分類改用階層選單並真的寫入 ═════════════════
  let section = await openSettings(page)
  const legacySelects = await section.locator('select').count()
  const setTrigger = section.locator('button[aria-haspopup="menu"]').first()
  const labelBefore = (await setTrigger.innerText()).replace(/\s+/g, ' ').trim()
  check('5a 設定→一般→預設分類已改用階層選單（原生 select 消失）',
    legacySelects === 0 && (await setTrigger.count()) === 1,
    `select 數=${legacySelects} 階層觸發鈕文字="${labelBefore}"`)

  await setTrigger.click()
  await sleep(600)
  const setPanel = page.locator('[data-category-picker="desktop"]')
  const setPanelVisible = await setPanel.isVisible().catch(() => false)
  const setWsNames = await readRows(setPanel, 'workspace')
  check('5b 展開後是兩欄階層選單、未分類排第一',
    setPanelVisible && setWsNames[0] === '未分類', `workspaces=${setWsNames.join(' | ')}`)
  await page.screenshot({ path: path.join(SHOTS, '3-settings-cascade-open.png') })

  // 8a（視覺 QA 追加）：面板不可被設定 modal 的捲動容器裁掉，且與 footer 留白 >=12px
  const geo8a = await settingsPanelGeometry(page)
  const gap8a = geo8a.footer.top - geo8a.panel.bottom
  check('8a 桌面設定面板未被裁切、與 footer 留白 >=12px',
    geo8a.panel.bottom <= geo8a.scroller.bottom + 0.5 && gap8a >= 12,
    `panel bottom=${geo8a.panel.bottom} scroller bottom=${geo8a.scroller.bottom} footer top=${geo8a.footer.top} → 間距=${gap8a.toFixed(1)}px（修正前實測 -14.0px＝被吃掉）`)

  // 選一個「非未分類」的大分類 → 第一個小分類
  const setWsRows = setPanel.locator('[data-picker-workspace]')
  await setWsRows.nth(1).hover(); await sleep(400)
  const targetWs = setWsNames[1]
  const targetCats = await readRows(setPanel, 'category')
  const targetCat = targetCats[0]
  await setPanel.locator('[data-picker-category]').first().click()
  await sleep(2500)
  const labelAfter = (await setTrigger.innerText()).replace(/\s+/g, ' ').trim()
  check('5c 選完顯示「大分類 / 小分類」',
    labelAfter.includes(targetWs) && labelAfter.includes(targetCat) && /\S\s*\/\s*\S/.test(labelAfter),
    `label="${labelAfter}" 期望「${targetWs} / ${targetCat}」`)

  await closeModal(page)
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(4000)
  section = await openSettings(page)
  const setTrigger2 = section.locator('button[aria-haspopup="menu"]').first()
  const labelReload = (await setTrigger2.innerText()).replace(/\s+/g, ' ').trim()
  check('5d 真的寫進去：整頁 reload 後重開設定仍顯示剛選的分類',
    labelReload.includes(targetWs) && labelReload.includes(targetCat),
    `reload 後 label="${labelReload}"`)

  // ═══════════ 6：390px 手機版設定頁階層選單 ════════════════════════════
  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(1200)
  const sectionM = page.locator('div.space-y-3').filter({ hasText: /自動歸到預設分類/ }).first()
  await sectionM.scrollIntoViewIfNeeded().catch(() => {})
  await sleep(500)
  const setTriggerM = sectionM.locator('button[aria-haspopup="menu"]').first()
  const trigBoxM = await setTriggerM.boundingBox()
  await setTriggerM.click({ force: true })
  await sleep(700)
  const setPanelM = page.locator('[data-category-picker="mobile"]')
  const panelMVisible = await setPanelM.isVisible().catch(() => false)
  const panelMBox = await setPanelM.boundingBox()
  await setPanelM.locator('[data-picker-workspace]').first().click({ force: true })
  await sleep(600)
  let minHm = 9999
  const mRows = setPanelM.locator('[data-picker-workspace], [data-picker-category]')
  const mRowCount = await mRows.count()
  for (let i = 0; i < mRowCount; i++) {
    const b = await mRows.nth(i).boundingBox()
    if (b) minHm = Math.min(minHm, b.height)
  }
  const overflowSettings = await page.evaluate(() => document.documentElement.scrollWidth)
  check('6 設定頁階層選單在 390px 不破版、不溢出',
    panelMVisible && overflowSettings <= 390 && minHm >= 44 &&
    panelMBox.x >= 0 && panelMBox.x + panelMBox.width <= 390,
    `panel x=${panelMBox?.x.toFixed(1)} w=${panelMBox?.width.toFixed(1)} 觸發鈕高=${trigBoxM?.height.toFixed(1)}px 列最小高=${minHm.toFixed(1)}px scrollWidth=${overflowSettings}`)
  const geo8b = await settingsPanelGeometry(page)
  const gap8b = geo8b.footer.top - geo8b.panel.bottom
  check('8b 手機 390px 設定面板未被裁切、與 footer 留白 >=12px',
    geo8b.panel.bottom <= geo8b.scroller.bottom + 0.5 && gap8b >= 12,
    `panel bottom=${geo8b.panel.bottom} scroller bottom=${geo8b.scroller.bottom} footer top=${geo8b.footer.top} → 間距=${gap8b.toFixed(1)}px`)
  await page.screenshot({ path: path.join(SHOTS, '5-mobile-settings-cascade.png') })

  // 還原：未分類 / 未分類（手機面板上直接做）
  const rowsForRestore = setPanelM.locator('[data-picker-workspace]')
  const restoreNames = await readRows(setPanelM, 'workspace')
  const uncatIdx = restoreNames.findIndex((n) => n === '未分類')
  // 先收合目前展開的那個，再展開未分類
  for (let i = 0; i < (await rowsForRestore.count()); i++) {
    if ((await rowsForRestore.nth(i).getAttribute('aria-expanded')) === 'true' && i !== uncatIdx) {
      await rowsForRestore.nth(i).click({ force: true }); await sleep(350)
    }
  }
  if ((await rowsForRestore.nth(uncatIdx).getAttribute('aria-expanded')) !== 'true') {
    await rowsForRestore.nth(uncatIdx).click({ force: true }); await sleep(500)
  }
  await setPanelM.locator('[data-picker-category]').first().click({ force: true })
  await sleep(2500)
  await closeModal(page)

  // ═══════════ 4（手機部分）：任務抽屜手風琴 ════════════════════════════
  const settingsClosed = await closeModal(page)
  note('手機段前置', `設定 modal 已關閉=${settingsClosed}`)
  const tasksTab = page.getByRole('tab', { name: /任務|Tasks/ }).first()
  await tasksTab.click()
  await sleep(1500)
  note('手機段前置', `任務分頁 aria-selected=${await tasksTab.getAttribute('aria-selected')}｜畫面上 task-row 總數=${await page.locator('[data-tour="task-row"]').count()}`)
  const taskRow = page.locator('[data-tour="task-row"]').filter({ hasText: '新任務' }).first()
  await taskRow.waitFor({ timeout: 20000 })
  await taskRow.click({ force: true })
  await sleep(1500)
  const dlgM = page.getByRole('dialog').first()
  const triggerM = dlgM.locator('button[aria-haspopup="menu"]').first()
  await triggerM.waitFor({ timeout: 15000 })
  await triggerM.click({ force: true })
  await sleep(700)
  const sheet = page.locator('[data-category-picker="mobile"]')
  const sheetVisible = await sheet.isVisible().catch(() => false)
  const sheetRows = sheet.locator('[data-picker-workspace]')
  const sheetCount = await sheetRows.count()
  for (let i = 0; i < sheetCount; i++) {
    if ((await sheetRows.nth(i).getAttribute('aria-expanded')) === 'true') {
      await sheetRows.nth(i).click({ force: true }); await sleep(350)
    }
  }
  let firstOpen = -1, secondOpen = -1
  for (let i = 0; i < sheetCount; i++) {
    await sheetRows.nth(i).click({ force: true }); await sleep(400)
    const catCount = await sheet.locator('[data-picker-category]').count()
    if (catCount > 0) { if (firstOpen === -1) firstOpen = i; else { secondOpen = i; break } }
    else if ((await sheetRows.nth(i).getAttribute('aria-expanded')) === 'true') {
      await sheetRows.nth(i).click({ force: true }); await sleep(300)
    }
  }
  const flags = []
  for (let i = 0; i < sheetCount; i++) flags.push(await sheetRows.nth(i).getAttribute('aria-expanded'))
  const onlyOne = flags.filter((f) => f === 'true').length === 1
  let minH = 9999
  const tapRows = sheet.locator('[data-picker-workspace], [data-picker-category]')
  const tapCount = await tapRows.count()
  for (let i = 0; i < tapCount; i++) {
    const b = await tapRows.nth(i).boundingBox()
    if (b) minH = Math.min(minH, b.height)
  }
  const overflowW = await page.evaluate(() => document.documentElement.scrollWidth)
  check('4d 手機 390px：手風琴單開＋列高>=44px＋零水平溢出',
    sheetVisible && firstOpen > -1 && secondOpen > -1 && onlyOne && minH >= 44 && overflowW <= 390,
    `aria-expanded=[${flags.join(',')}] 列最小高=${minH.toFixed(1)}px scrollWidth=${overflowW}`)
  await page.screenshot({ path: path.join(SHOTS, '4-mobile-task-picker.png') })

  // 清理：刪掉這筆拋棄式任務（連同前幾次失敗執行留下的同名殘留一起掃掉）
  await triggerM.click({ force: true }); await sleep(500)
  let deleted = await deleteOpenTask(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await sleep(800)
  await closeModal(page)
  for (let i = 0; i < 6; i++) {
    const leftovers = page.locator('[data-tour="task-row"]').filter({ hasText: '新任務' })
    if ((await leftovers.count()) === 0) break
    await leftovers.first().click({ force: true })
    await sleep(1500)
    deleted = (await deleteOpenTask(page)) || deleted
    await closeModal(page)
    await sleep(500)
  }
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(4000)
  const residual = await page.locator('[data-tour="task-row"]').filter({ hasText: '新任務' }).count()
  check('清理：中文回合的測試任務已刪除且 reload 後消失', deleted && residual === 0,
    `deleted=${deleted} reload 後殘留=${residual}`)

  // 還原驗證：預設分類回到 未分類 / 未分類
  const sectionR = await openSettings(page)
  restoredLabel = (await sectionR.locator('button[aria-haspopup="menu"]').first().innerText())
    .replace(/\s+/g, ' ').trim()
  check('還原：預設分類已改回「未分類 / 未分類」（reload 後確認）',
    /^未分類\s*\/\s*未分類$/.test(restoredLabel), `label="${restoredLabel}"`)
  await page.screenshot({ path: path.join(SHOTS, '6-settings-restored.png') })
  await closeModal(page)
  await sleep(1500)
  await ctx.close()

  // ═══════════ 2：桌面 1280x900 English ═════════════════════════════════
  const { ctx: ctxEn, page: pageEn } = await newLoggedInPage(browser, 'en', { width: 1280, height: 900 })
  await createThrowawayTask(pageEn, 'en')
  const dlgEn = pageEn.getByRole('dialog').first()
  const triggerEn = dlgEn.locator('button[aria-haspopup="menu"]').first()
  await triggerEn.waitFor({ timeout: 15000 })
  const titleEn = dlgEn.locator('input.text-lg').first()
  const gEn = await titleTextGeometry(titleEn)
  await triggerEn.click()
  await sleep(700)
  const popEn = pageEn.locator('[data-category-picker="desktop"]')
  const pbEn = await popEn.boundingBox()
  const covHEn = pbEn.x <= gEn.textLeft + 0.5 && pbEn.x + pbEn.width >= gEn.textRight - 0.5
  const covVEn = pbEn.y <= gEn.box.y + 0.5 && pbEn.y + pbEn.height >= gEn.box.y + gEn.box.height - 0.5
  const halfCoverEn = pbEn.y < gEn.box.y + gEn.box.height && pbEn.y + pbEn.height > gEn.box.y &&
    pbEn.x > gEn.textLeft && pbEn.x < gEn.textRight
  check('2 桌面 English：標題無「半遮」（英文字串較長）',
    !halfCoverEn && covHEn && covVEn,
    `標題文字 "${gEn.value}" x=${gEn.textLeft.toFixed(1)}..${gEn.textRight.toFixed(1)}｜選單 x=${pbEn.x.toFixed(1)}..${(pbEn.x + pbEn.width).toFixed(1)} y=${pbEn.y.toFixed(1)}..${(pbEn.y + pbEn.height).toFixed(1)}｜halfCover=${halfCoverEn} 橫向全覆蓋=${covHEn} 縱向全覆蓋=${covVEn}`)
  check('3b English：選單右緣不超出視窗', pbEn.x + pbEn.width <= 1280, `right=${(pbEn.x + pbEn.width).toFixed(1)}`)
  await pageEn.screenshot({ path: path.join(SHOTS, '2-en-picker-open.png') })
  await pageEn.screenshot({ path: path.join(SHOTS, '2b-en-title-area-crop.png'), clip: { x: 760, y: 0, width: 520, height: 260 } })

  // English 選單自有文案零殘留中文（DB 分類名是使用者資料，扣掉）
  const enWs = await readRows(popEn, 'workspace')
  const enCats = await readRows(popEn, 'category')
  let residue = await popEn.innerText().catch(() => '')
  for (const n of [...enWs, ...enCats]) residue = residue.split(n).join('')
  check('i18n-a English 任務選單自有文案零殘留中文', !CJK.test(residue),
    `殘留=${JSON.stringify(residue.replace(/\s+/g, ' ').trim().slice(0, 60))}`)
  await triggerEn.click({ force: true }); await sleep(400)
  const delEn = await deleteOpenTask(pageEn)
  await pageEn.reload({ waitUntil: 'networkidle' })
  await sleep(4000)
  const residualEn = await pageEn.locator('[data-tour="task-row"]').count()
  check('清理：English 回合的測試任務已刪除且 reload 後消失', delEn && residualEn === 0,
    `deleted=${delEn} reload 後任務數=${residualEn}`)

  // English 設定頁：階層選單自有文案
  const sectionEn = await openSettings(pageEn)
  const setTriggerEn = sectionEn.locator('button[aria-haspopup="menu"]').first()
  await setTriggerEn.click()
  await sleep(600)
  const setPanelEn = pageEn.locator('[data-category-picker="desktop"]')
  const sWs = await readRows(setPanelEn, 'workspace')
  const sCats = await readRows(setPanelEn, 'category')
  let sResidue = await setPanelEn.innerText().catch(() => '')
  for (const n of [...sWs, ...sCats]) sResidue = sResidue.split(n).join('')
  const clearRowText = (await setPanelEn.locator('[data-picker-clear]').innerText().catch(() => '')).trim()
  check('i18n-b English 設定頁階層選單自有文案零殘留中文', !CJK.test(sResidue),
    `clear 列="${clearRowText}" 殘留=${JSON.stringify(sResidue.replace(/\s+/g, ' ').trim().slice(0, 60))}`)
  await pageEn.screenshot({ path: path.join(SHOTS, '7-en-settings-cascade.png') })
  await closeModal(pageEn)
  await sleep(1200)
  await ctxEn.close()

  // ═══════════ 8c/8d：大分類很多時（注入 10 個，共 14 個）═══════════════
  // 帳號只有 4 個大分類、剛好卡在邊界，所以用 REST 回應改寫多塞 10 個假的
  // 大分類（只攔 GET，零 DB 寫入，也不點選它們）壓力測面板高度。
  const ctxMany = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
  const pageMany = await ctxMany.newPage()
  pageMany.setDefaultTimeout(60000)
  pageMany.on('pageerror', (e) => pageErrors.push(`[many] ${e}`))
  await pageMany.addInitScript(() => { try { localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {} })
  await pageMany.addInitScript(() => {
    const apply = () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal { display: none !important; }'; document.head?.appendChild(s) }
    if (document.head) apply(); else document.addEventListener('DOMContentLoaded', apply)
  })
  await pageMany.route('**/rest/v1/workspaces*', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const res = await route.fetch()
    let body
    try { body = await res.json() } catch { return route.fulfill({ response: res }) }
    if (!Array.isArray(body) || body.length === 0) return route.fulfill({ response: res })
    const clone = body[body.length - 1]
    const extra = []
    for (let i = 0; i < 10; i++) {
      extra.push({ ...clone, id: `fake-ws-${i}`, name: `測試大分類 ${i + 1}`, sort_order: 900 + i, is_default: false })
    }
    return route.fulfill({ response: res, body: JSON.stringify([...body, ...extra]) })
  })
  await pageMany.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await pageMany.locator('button[type="submit"]').waitFor({ timeout: 30000 })
  await sleep(3000)
  await fillStable(pageMany, 'input[type="email"]', EMAIL)
  await fillStable(pageMany, 'input[type="password"]', PASSWORD)
  await pageMany.click('button[type="submit"]')
  await pageMany.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
  await sleep(5000)
  const sectionMany = await openSettings(pageMany)
  await sectionMany.locator('button[aria-haspopup="menu"]').first().click()
  await sleep(900)
  const geo8c = await settingsPanelGeometry(pageMany)
  const gap8c = geo8c.footer.top - geo8c.panel.bottom
  check('8c 14 個大分類：面板仍在容器內、與 footer 留白 >=12px、清單自己可捲',
    geo8c.wsRows >= 10 && geo8c.panel.bottom <= geo8c.scroller.bottom + 0.5 && gap8c >= 12 && geo8c.listScrollable,
    `大分類列數=${geo8c.wsRows} panel h=${geo8c.panel.h} bottom=${geo8c.panel.bottom} scroller bottom=${geo8c.scroller.bottom} → 間距=${gap8c.toFixed(1)}px 內部可捲=${geo8c.listScrollable}（修正前實測 -146.0px）`)
  await pageMany.screenshot({ path: path.join(SHOTS, '9-settings-many-workspaces.png') })

  await pageMany.setViewportSize({ width: 390, height: 844 })
  await sleep(1500)
  // Re-open after the resize: the panel swaps to the accordion body and its
  // scroll-into-view only runs on open (a real user opens it at one size).
  const trigMany = pageMany.locator('div.space-y-3').filter({ hasText: /自動歸到預設分類/ }).first()
    .locator('button[aria-haspopup="menu"]').first()
  await trigMany.click({ force: true }); await sleep(500)
  await trigMany.click({ force: true }); await sleep(900)
  const geo8d = await settingsPanelGeometry(pageMany)
  const gap8d = geo8d.footer.top - geo8d.panel.bottom
  const overflowMany = await pageMany.evaluate(() => document.documentElement.scrollWidth)
  check('8d 14 個大分類 × 390px：面板仍在容器內、留白 >=12px、零水平溢出',
    geo8d.panel.bottom <= geo8d.scroller.bottom + 0.5 && gap8d >= 12 && overflowMany <= 390,
    `panel h=${geo8d.panel.h} bottom=${geo8d.panel.bottom} scroller bottom=${geo8d.scroller.bottom} → 間距=${gap8d.toFixed(1)}px scrollWidth=${overflowMany}`)
  await pageMany.screenshot({ path: path.join(SHOTS, '10-mobile-many-workspaces.png') })
  await closeModal(pageMany)
  await sleep(1000)
  await ctxMany.close()

  check('7 全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '))
} catch (err) {
  check('FATAL', false, String(err?.stack || err))
} finally {
  try { await browser?.close() } catch {}
  if (server) { try { process.kill(-server.pid, 'SIGTERM') } catch {} }
}

console.log(`\n${passed}/${passed + failed} passed`)
console.log(`預設分類還原後的值：${restoredLabel}`)
console.log(`screenshots → ${SHOTS}`)
process.exit(failed ? 1 : 0)
