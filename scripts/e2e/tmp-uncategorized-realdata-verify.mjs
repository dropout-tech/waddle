#!/usr/bin/env node
/**
 * Real-data verification for the workspace-level "未分類" (Uncategorized)
 * feature + the two-level category picker. Runs against a real dev server
 * (port 3141) and the REAL Supabase project — the migration that adds the
 * 未分類 workspace is already applied to prod, so this account has a real
 * isDefault workspace/category to assert against. NO page.route stubbing
 * anywhere in this script.
 *
 * Checks (see task brief):
 *  1. Left task panel: 未分類 is the first workspace block (DOM order).
 *  2. Its color dot computed style = rgb(156, 144, 134) (#9C9086).
 *  3. Desktop 1280x900 category picker: two columns, 未分類 first row,
 *     hover another workspace swaps the right column.
 *  4. Clicking a category commits: popover closes, trigger label updates.
 *  5. Popover never crosses the right edge of the viewport.
 *  6. ⭐ Creating a task via the real "empty calendar space" code path
 *     (⌘K → 新增任務, same handleCreateCalendarTask used by clicking empty
 *     calendar space) lands it in 未分類 / 未分類. The task is a REAL DB
 *     row (createTask is awaited before the modal opens), deleted again at
 *     the end and reload-verified gone.
 *  7. Mobile 390x844: accordion picker, single-open, >=44px rows, no
 *     horizontal overflow.
 *  8. English: picker's own chrome has no residual Chinese (DB names are
 *     excluded — they're user data seeded at signup time).
 *  9. Zero pageerror across the whole run.
 *  10. Settings → General → 預設分類: opens, global select shows
 *      "workspace / category" format, defaults to 未分類 / 未分類. Read-only
 *      — value is never changed.
 *
 * DB writes: exactly one throwaway task (title "新任務"), created then
 * deleted. Nothing else is mutated (category reassignment in the picker is
 * local UI state until Save is clicked, which this script never does).
 *
 * Screenshots -> docs/reports/2026-08-10-uncategorized-realdata-shots/
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3141
const BASE = `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-10-uncategorized-realdata-shots')
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

async function fillStable(page, selector, value) {
  for (let i = 0; i < 5; i++) {
    await page.fill(selector, value)
    await sleep(150)
    if ((await page.inputValue(selector)) === value) return
  }
  throw new Error(`fill unstable: ${selector}`)
}

const pageErrors = []

async function newLoggedInPage(browser, lang, viewport) {
  const ctx = await browser.newContext({ locale: lang === 'en' ? 'en-US' : 'zh-TW', viewport })
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(`[${lang}] ${e}`))
  await page.addInitScript((l) => { try { localStorage.setItem('waddle-language-v1', l) } catch {} }, lang)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.locator('button[type="submit"]').waitFor({ timeout: 30000 })
  await sleep(3000)
  await fillStable(page, 'input[type="email"]', EMAIL)
  await fillStable(page, 'input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
  await sleep(5000)
  // The Next.js dev-mode indicator (<nextjs-portal>) is a fixed, always-on-
  // top overlay that only exists in `next dev` builds (never in prod). On a
  // 390px viewport it sits directly over the mobile tab bar's leftmost
  // button and silently eats real mouse clicks at those coordinates
  // (force:true still resolves to whatever's topmost at that point) — hide
  // it so clicks land on the actual app UI being tested.
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

async function closeModal(page) {
  await page.keyboard.press('Escape'); await sleep(400)
  await page.keyboard.press('Escape'); await sleep(800)
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

let createdTaskDeleted = false
let createdTaskLabelAtBirth = null

try {
  await waitServer()
  browser = await chromium.launch()

  // ══════════════ Desktop 1280x900, zh-TW ═══════════════════════════════
  const { ctx, page } = await newLoggedInPage(browser, 'zh-TW', { width: 1280, height: 900 })

  // ── 1 & 2: left task panel order + color ──────────────────────────────
  await sleep(1000)
  const wsBlocks = page.locator('[id^="workspace-"]')
  const wsBlockCount = await wsBlocks.count()
  const firstBlockId = await wsBlocks.first().getAttribute('id')
  const firstBlockName = (await wsBlocks.first().locator('h3').first().innerText()).trim()
  check('1 左側任務欄「未分類」是第一個大分類（DOM 順序）',
    firstBlockName.includes('未分類'), `first="${firstBlockName}" id=${firstBlockId} total區塊=${wsBlockCount}`)
  const dot = wsBlocks.first().locator('div.w-1.h-6.rounded-sm').first()
  const dotColor = await dot.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => 'ERR')
  check('2 「未分類」色點 computed style = rgb(156, 144, 134)', dotColor === 'rgb(156, 144, 134)', dotColor)
  await page.screenshot({ path: path.join(SHOTS, '1-left-panel-uncategorized.png') })

  // ── 6: real create via ⌘K → 新增任務 (handleCreateCalendarTask, the same
  //      path an empty-calendar-space click uses) ────────────────────────
  await page.keyboard.press('Control+k')
  await sleep(900)
  const cmdInput = page.getByPlaceholder('搜尋任務、或輸入指令…')
  await cmdInput.waitFor({ timeout: 10000 })
  await cmdInput.fill('新增任務')
  await sleep(500)
  await page.keyboard.press('Enter')
  await sleep(1800)
  const trigger = page.locator('button').filter({ hasText: /\S\s\/\s\S/ }).first()
  await trigger.waitFor({ timeout: 15000 })
  const createLabel = (await trigger.innerText()).replace(/\s+/g, ' ').trim()
  createdTaskLabelAtBirth = createLabel
  check('6 ⭐ 日曆建立任務（⌘K 新增任務，真實 DB 寫入）落在「未分類 / 未分類」',
    /未分類/.test(createLabel) && createLabel.split('未分類').length - 1 >= 2, `label="${createLabel}"`)
  await page.screenshot({ path: path.join(SHOTS, '6-task-lands-uncategorized.png') })

  // ── 3, 4, 5: desktop two-column picker on the just-created task ───────
  await trigger.click()
  await sleep(700)
  const popover = page.locator('[data-category-picker="desktop"]')
  const popVisible = await popover.isVisible().catch(() => false)
  check('3a 桌面出現兩欄式選單', popVisible)

  const wsRows = popover.locator('[data-picker-workspace]')
  const wsRowCount = await wsRows.count()
  const wsNamesInPicker = await readRows(popover, 'workspace')
  check('3b 「未分類」在左欄第一列', wsNamesInPicker[0] === '未分類', wsNamesInPicker.join(' | '))

  const catsBefore = await readRows(popover, 'category')
  let hoveredIdx = -1, catsAfter = []
  for (let i = 1; i < wsRowCount; i++) {
    await wsRows.nth(i).hover(); await sleep(350)
    const cats = await readRows(popover, 'category')
    if (cats.length && cats.join('|') !== catsBefore.join('|')) { hoveredIdx = i; catsAfter = cats; break }
  }
  check('3c 滑鼠移到另一個大分類，右欄立刻換成該大分類的小分類', hoveredIdx > 0,
    `hover「${wsNamesInPicker[hoveredIdx] ?? '?'}」→ ${catsAfter.join(' | ')}｜原本(${wsNamesInPicker[0]}) → ${catsBefore.join(' | ')}`)
  await page.screenshot({ path: path.join(SHOTS, '3-desktop-two-column.png') })

  const pbox = await popover.boundingBox()
  check('5 popover 未超出視窗右緣（x+width<=1280）', Boolean(pbox) && pbox.x + pbox.width <= 1280,
    `x=${pbox ? Math.round(pbox.x) : '?'} w=${pbox ? Math.round(pbox.width) : '?'} right=${pbox ? Math.round(pbox.x + pbox.width) : '?'}`)

  const wantWs = wsNamesInPicker[hoveredIdx]
  const wantCat = catsAfter[0]
  await popover.locator('[data-picker-category]').first().click()
  await sleep(600)
  const popClosed = !(await popover.isVisible().catch(() => false))
  const newLabel = (await trigger.innerText()).replace(/\s+/g, ' ').trim()
  check('4 右欄點小分類後：選單關閉 + 觸發鈕更新為「大分類 / 小分類」',
    popClosed && Boolean(wantWs) && Boolean(wantCat) && newLabel.includes(wantWs) && newLabel.includes(wantCat),
    `label="${newLabel}" expected="${wantWs} / ${wantCat}"`)
  await page.screenshot({ path: path.join(SHOTS, '4-selection-committed.png') })
  note('4-note', '選單內點選只更新本地 state，未按「儲存」，所以底下 DB 裡的任務分類仍是建立當下的 未分類/未分類（見 check 6）')

  // Close the modal WITHOUT saving — discards the local re-category so the
  // DB row this script deletes at the end stays 未分類/未分類 the whole time.
  await closeModal(page)

  // ── 10: Settings → General → 預設分類 (read-only) ─────────────────────
  await page.locator('[aria-label="設定"]').first().click()
  await sleep(1200)
  const generalTabBtn = page.getByRole('button', { name: '一般設定' }).first()
  if (await generalTabBtn.count().catch(() => 0)) { await generalTabBtn.click().catch(() => {}); await sleep(400) }
  const defSection = page.locator('div.space-y-3').filter({ hasText: '自動歸到預設分類' }).first()
  await defSection.scrollIntoViewIfNeeded().catch(() => {})
  await sleep(500)
  const box10 = await defSection.boundingBox()
  const inView10 = Boolean(box10) && box10.y >= 0 && box10.y < 900 && box10.height > 0
  check('10a 設定 → 一般 →「預設分類」區塊正常開啟顯示', inView10, box10 ? `y=${Math.round(box10.y)} h=${Math.round(box10.height)}` : 'no bounding box')
  const toggle10 = defSection.locator('input[type="checkbox"]').first()
  const toggleChecked = await toggle10.isChecked().catch(() => null)
  const sel10 = defSection.locator('select').first()
  const selCount = await sel10.count()
  let selText = ''
  if (selCount > 0) {
    const selVal = await sel10.inputValue().catch(() => null)
    selText = selVal !== null ? (await sel10.locator(`option[value="${selVal}"]`).innerText().catch(() => '')).trim() : ''
  }
  check('10b 全域 select 顯示「大分類 / 小分類」格式、預設選中未分類（未更動設定值）',
    /^未分類\s*\/\s*未分類$/.test(selText), `toggle開啟=${toggleChecked} selected="${selText}" hasSelect=${selCount > 0}`)
  await page.screenshot({ path: path.join(SHOTS, '10-settings-default-category.png') })
  await closeModal(page)

  // ══════════════ Mobile 390x844 (same session, resized) ════════════════
  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(1200)
  // The Next.js dev-mode indicator (<nextjs-portal>) sits fixed bottom-left,
  // which on a 390px viewport overlaps the leftmost tab-bar button — force
  // the click through it (a real user on a prod build never hits this).
  const tasksTab = page.getByRole('tab', { name: '任務' }).first()
  await tasksTab.click({ force: true })
  await sleep(1000)

  const uncatSection = page.locator(`#${firstBlockId}`)
  const testTaskRow = uncatSection.locator('[data-tour="task-row"]').filter({ hasText: '新任務' }).first()
  const rowFound = await testTaskRow.count().catch(() => 0)
  check('7-pre 手機版「未分類」區塊裡找得到剛建立的測試任務', rowFound > 0, `count=${rowFound}`)
  await testTaskRow.click({ force: true })
  await sleep(1200)
  const triggerM = page.locator('button').filter({ hasText: /\S\s\/\s\S/ }).first()
  await triggerM.waitFor({ timeout: 15000 })
  await triggerM.click({ force: true })
  await sleep(700)

  const sheet = page.locator('[data-category-picker="mobile"]')
  check('7a 手機版是手風琴 sheet', await sheet.isVisible().catch(() => false))
  const mRows = sheet.locator('[data-picker-workspace]')
  const mCount = await mRows.count()
  const mNames = await readRows(sheet, 'workspace')
  // collapse whatever auto-opened (task's own workspace = 未分類)
  for (let i = 0; i < mCount; i++) {
    if ((await mRows.nth(i).getAttribute('aria-expanded')) === 'true') { await mRows.nth(i).click({ force: true }); await sleep(400) }
  }
  const allCollapsed = (await sheet.locator('[data-picker-category]').count()) === 0
  check('7b 可全部收合', allCollapsed, `workspaces=${mNames.join(' | ')}`)
  await page.screenshot({ path: path.join(SHOTS, '7-mobile-collapsed.png') })

  let firstOpen = -1, secondOpen = -1
  for (let i = 0; i < mCount; i++) {
    await mRows.nth(i).click({ force: true }); await sleep(400)
    const catCount = await sheet.locator('[data-picker-category]').count()
    if (catCount > 0) { if (firstOpen === -1) firstOpen = i; else { secondOpen = i; break } }
    else if ((await mRows.nth(i).getAttribute('aria-expanded')) === 'true') { await mRows.nth(i).click({ force: true }); await sleep(300) }
  }
  const expandedFlags = []
  for (let i = 0; i < mCount; i++) expandedFlags.push(await mRows.nth(i).getAttribute('aria-expanded'))
  const onlyOneOpen = expandedFlags.filter((f) => f === 'true').length === 1
  check('7c 同時只展開一個大分類', firstOpen > -1 && secondOpen > -1 && onlyOneOpen && expandedFlags[secondOpen] === 'true',
    `展開「${mNames[secondOpen] ?? '?'}」後 aria-expanded=[${expandedFlags.join(',')}]`)
  await page.screenshot({ path: path.join(SHOTS, '8-mobile-expanded.png') })

  let minH = 9999
  const tapRows = sheet.locator('[data-picker-workspace], [data-picker-category]')
  const tapCount = await tapRows.count()
  for (let i = 0; i < tapCount; i++) {
    const b = await tapRows.nth(i).boundingBox()
    if (b) minH = Math.min(minH, b.height)
  }
  check('7d 每個可點列高度 >=44px', minH >= 44, `min=${minH.toFixed(1)}px（共 ${tapCount} 列）`)

  const overflowW = await page.evaluate(() => document.documentElement.scrollWidth)
  check('7e 390px 零水平溢出', overflowW <= 390, `scrollWidth=${overflowW}`)

  // Close ONLY the accordion picker (retap the trigger toggles it shut) so
  // the task-detail drawer itself stays open — pressing Escape here closes
  // the whole drawer (ModalShell's own Escape handler), and once it's
  // closed a page-wide `button[title="刪除任務"]` selector is ambiguous:
  // every task row also carries its own swipe/hover-reveal delete button
  // with the exact same title/aria-label, and those sit UNDER the row's
  // swipe surface (higher z-index) when not actively revealed — a
  // force-click at their coordinates silently lands on the row instead and
  // deletes nothing. Scoping to the open dialog's own header trash button
  // sidesteps all of that ambiguity.
  await triggerM.click({ force: true }); await sleep(500)
  const dialogScope = page.getByRole('dialog').first()
  const deleteBtn = dialogScope.locator('button[title="刪除任務"], button[aria-label="刪除任務"]').first()
  const delCount = await deleteBtn.count().catch(() => 0)
  if (delCount > 0) {
    await deleteBtn.click()
    await sleep(2000) // let the DELETE mutation land before anything else touches the row
    createdTaskDeleted = true
  }
  check('清理：測試任務已透過垃圾桶（modal 內，非清單列上的）刪除', createdTaskDeleted, `刪除按鈕數量=${delCount}`)

  await page.setViewportSize({ width: 1280, height: 900 })
  await sleep(500)
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(3000)
  const residualRow = page.locator('[data-tour="task-row"]').filter({ hasText: '新任務' })
  const residualCount = await residualRow.count().catch(() => 0)
  check('清理驗證：reload 後測試任務確實消失', residualCount === 0, `reload 後仍看到 ${residualCount} 筆`)
  await sleep(1500) // extra settle before this context closes, per lessons.md discipline
  await ctx.close()

  // ══════════════ English ════════════════════════════════════════════════
  // This account (a dedicated e2e/mobile-test account) has zero real tasks
  // left once the cleanup above runs — every prior script's rule is "never
  // leave a task behind" — so there is nothing pre-existing to click. Create
  // a second throwaway task the same real way as check 6, use it purely to
  // open the picker and read its chrome, then delete + verify gone exactly
  // like the first one.
  const { ctx: ctxEn, page: pageEn } = await newLoggedInPage(browser, 'en', { width: 1280, height: 900 })
  let enTaskCreated = false, enTaskDeleted = false
  const anyTaskRow = pageEn.locator('[data-tour="task-row"]').first()
  const anyTaskCount = await anyTaskRow.count().catch(() => 0)
  let openedRow = anyTaskRow
  if (anyTaskCount === 0) {
    note('8-note', '帳號目前沒有任何既有任務，另建一筆拋棄式任務走同樣的真實建立路徑來測英文選單')
    await pageEn.keyboard.press('Control+k')
    await sleep(900)
    const cmdInputEn = pageEn.locator('[data-slot="command-input"]').first()
    await cmdInputEn.waitFor({ timeout: 10000 })
    await cmdInputEn.fill('Add')
    await sleep(500)
    await pageEn.keyboard.press('Enter')
    await sleep(1800)
    enTaskCreated = true
    openedRow = null
  } else {
    await anyTaskRow.click()
    await sleep(1200)
  }
  const triggerEn = pageEn.locator('button').filter({ hasText: /\S\s\/\s\S/ }).first()
  await triggerEn.waitFor({ timeout: 15000 })
  await triggerEn.click()
  await sleep(700)
  const popEn = pageEn.locator('[data-category-picker="desktop"]')
  const enWs = await readRows(popEn, 'workspace')
  const enCats = await readRows(popEn, 'category')
  const popText = await popEn.innerText().catch(() => '')
  let residue = popText
  for (const n of [...enWs, ...enCats]) residue = residue.split(n).join('')
  check('8 English UI：選單自有文案零殘留中文（DB 分類名稱屬使用者資料，不算）', !CJK.test(residue),
    `殘留=${JSON.stringify(residue.replace(/\s+/g, ' ').trim().slice(0, 80))}`)
  await pageEn.screenshot({ path: path.join(SHOTS, '9-english-two-column.png') })
  await triggerEn.click({ force: true }); await sleep(400) // close JUST the popover, keep drawer open if we need to delete

  if (enTaskCreated) {
    const dialogScopeEn = pageEn.getByRole('dialog').first()
    const deleteBtnEn = dialogScopeEn.locator('button[title="Delete task"], button[aria-label="Delete task"], button[title="刪除任務"], button[aria-label="刪除任務"]').first()
    const delCountEn = await deleteBtnEn.count().catch(() => 0)
    if (delCountEn > 0) {
      await deleteBtnEn.click()
      await sleep(2000)
      enTaskDeleted = true
    }
    check('8-cleanup 英文檢查用的拋棄式任務已刪除', enTaskDeleted, `刪除按鈕數量=${delCountEn}`)
    await sleep(500)
    await pageEn.reload({ waitUntil: 'networkidle' })
    await sleep(2500)
    const residualEn = await pageEn.locator('[data-tour="task-row"]').count().catch(() => 0)
    check('8-cleanup 驗證：reload 後帳號任務數回到 0', residualEn === 0, `reload 後任務數=${residualEn}`)
    await sleep(1500)
  } else {
    await closeModal(pageEn) // never saved — no DB write
  }
  await ctxEn.close()

  check('9 全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '))
} catch (err) {
  check('FATAL', false, String(err?.stack || err))
} finally {
  try { await browser?.close() } catch {}
  try { process.kill(-server.pid, 'SIGTERM') } catch {}
}

console.log(`\n${passed}/${passed + failed} passed`)
console.log(`created task deleted+verified gone: ${createdTaskDeleted}`)
console.log(`screenshots → ${SHOTS}`)
process.exit(failed ? 1 : 0)
