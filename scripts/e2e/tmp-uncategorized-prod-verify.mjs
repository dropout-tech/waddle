#!/usr/bin/env node
/**
 * PROD regression for the workspace-level "未分類" (Uncategorized) feature +
 * two-level category picker (PR #33, merged & deployed to Zeabur).
 * Adapted from tmp-uncategorized-realdata-verify.mjs (local, 22/22 pass) to
 * hit https://waddle.zeabur.app instead of spawning a local dev server.
 *
 * Prod-specific handling (per task brief / known landmines):
 *  - page.goto uses waitUntil:'commit' (domcontentloaded times out on prod).
 *  - page.setDefaultTimeout(90000) — cold-path screenshots can exceed 30s.
 *  - Login: wait for submit button, THEN sleep ~3s for hydration before fill
 *    (1s is not enough on prod, waitForURL times out otherwise).
 *  - No <60s polling against prod (Vercel/Zeabur-style protection risk).
 *  - headless defaults to English UI — addInitScript sets
 *    localStorage['waddle-language-v1']='zh-TW' before navigation.
 *  - <nextjs-portal> only exists in `next dev`, not prod — the hide-it code
 *    is kept (harmless no-op) for parity with the local script.
 *
 * Checklist (11 items, matches task brief numbering):
 *  0/1. New-version fingerprint (must be first; abort run on FAIL) — first
 *       left-panel block is named 未分類 AND its dot's computed
 *       background-color is rgb(156, 144, 134). The old flat picker had no
 *       未分類 workspace at all, so this cannot pass against a stale cache.
 *  2. Left task panel: 未分類 is the first block (DOM order).
 *  3. Its color dot computed style = rgb(156, 144, 134).
 *  4. Desktop 1280x900 picker: two columns, hover another workspace swaps
 *     the right column (assert text differs before/after).
 *  5. Clicking a right-column category commits: popover closes, trigger
 *     label updates to "workspace / category".
 *  6. Popover never crosses the right edge of the viewport (x+width<=1280).
 *  7. ⭐ Creating a task via the real "empty calendar space" code path
 *     (⌘K → 新增任務, same handleCreateCalendarTask used by clicking empty
 *     calendar space) lands it in 未分類 / 未分類. REAL PROD DB WRITE —
 *     deleted again at the end, reload-verified gone.
 *  8. Mobile 390x844: accordion, single-open, >=44px rows, no horizontal
 *     overflow (scrollWidth <= 390).
 *  9. English: picker's own chrome has no residual Chinese (DB names are
 *     user data, excluded).
 * 10. Settings → General → 預設分類: opens, global select shows
 *     "workspace / category" format, defaults to 未分類 / 未分類. Read-only
 *     — value is never changed.
 * 11. Zero pageerror across the whole run.
 *
 * DB writes: exactly one throwaway task (title "新任務"), created then
 * deleted, reload-verified gone, plus a settle sleep before context close.
 * Post-run: queries prod DB directly via service-role key
 * (.env.admin.local) to confirm zero residual test tasks for the account.
 *
 * Screenshots -> docs/reports/2026-08-10-uncategorized-realdata-shots/prod/
 * Run: node scripts/e2e/tmp-uncategorized-prod-verify.mjs
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.E2E_BASE_URL || 'https://waddle.zeabur.app'
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-10-uncategorized-realdata-shots/prod')
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
const e2eEnv = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || e2eEnv.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || e2eEnv.E2E_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('missing E2E creds in .env.e2e.local'); process.exit(1) }

const adminEnv = loadEnvFile(path.join(process.cwd(), '.env.admin.local'))

let passed = 0, failed = 0
let aborted = false
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
  page.setDefaultTimeout(90000)
  page.on('pageerror', (e) => pageErrors.push(`[${lang}] ${e}`))
  await page.addInitScript((l) => { try { localStorage.setItem('waddle-language-v1', l) } catch {} }, lang)
  await page.goto(`${BASE}/login`, { waitUntil: 'commit' })
  await page.locator('button[type="submit"]').waitFor({ timeout: 30000 })
  await sleep(3000) // prod hydration — 1s is not enough, waitForURL times out otherwise
  await fillStable(page, 'input[type="email"]', EMAIL)
  await fillStable(page, 'input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  // waitUntil:'load' (the default) can hang indefinitely on prod — the app
  // holds persistent connections (Supabase realtime) that keep the network
  // "busy", so the browser's load event may never fire even though the URL
  // already changed. 'commit' matches as soon as navigation starts, which
  // in practice is well after the URL swap for a client-side redirect here.
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000, waitUntil: 'commit' })
  await sleep(5000)
  // <nextjs-portal> only exists in `next dev`, never on prod — kept for
  // parity with the local script; no-op here.
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
let createdTaskDeleted = false

try {
  browser = await chromium.launch()

  // ══════════════ Desktop 1280x900, zh-TW ═══════════════════════════════
  const { ctx, page } = await newLoggedInPage(browser, 'zh-TW', { width: 1280, height: 900 })

  // ── 0/1: NEW-VERSION FINGERPRINT — must pass before anything else ─────
  await sleep(1000)
  const wsBlocks = page.locator('[id^="workspace-"]')
  const wsBlockCount = await wsBlocks.count()
  const firstBlockId = wsBlockCount > 0 ? await wsBlocks.first().getAttribute('id') : null
  const firstBlockName = wsBlockCount > 0 ? (await wsBlocks.first().locator('h3').first().innerText()).trim() : ''
  const dot0 = wsBlockCount > 0 ? wsBlocks.first().locator('div.w-1.h-6.rounded-sm').first() : null
  const dotColor0 = dot0 ? await dot0.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => 'ERR') : 'N/A'
  const isNewVersion = firstBlockName.includes('未分類') && dotColor0 === 'rgb(156, 144, 134)'
  check('0 新版硬斷言：正式站已是含本次改動的版本（未分類為第一區塊＋灰色 #9C9086）',
    isNewVersion, `first="${firstBlockName}" dotColor=${dotColor0} total區塊=${wsBlockCount}`)
  await page.screenshot({ path: path.join(SHOTS, '0-new-version-fingerprint.png') })

  if (!isNewVersion) {
    aborted = true
    note('ABORT', '新版斷言 FAIL，可能驗到舊快取/舊部署 — 中止後續所有檢查')
    throw new Error('ABORT_STALE_VERSION')
  }

  // ── 2 & 3: left task panel order + color (reuses fingerprint values) ──
  check('2 左側任務欄「未分類」是第一個大分類（DOM 順序）',
    firstBlockName.includes('未分類'), `first="${firstBlockName}" id=${firstBlockId} total區塊=${wsBlockCount}`)
  check('3 「未分類」色點 computed style = rgb(156, 144, 134)', dotColor0 === 'rgb(156, 144, 134)', dotColor0)
  await page.screenshot({ path: path.join(SHOTS, '1-left-panel-uncategorized.png') })

  // ── 7: real create via ⌘K → 新增任務 (handleCreateCalendarTask, same
  //      path an empty-calendar-space click uses) — REAL PROD DB WRITE ───
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
  check('7 ⭐ 日曆建立任務（⌘K 新增任務，真實 PROD DB 寫入）落在「未分類 / 未分類」',
    /未分類/.test(createLabel) && createLabel.split('未分類').length - 1 >= 2, `label="${createLabel}"`)
  await page.screenshot({ path: path.join(SHOTS, '6-task-lands-uncategorized.png') })

  // ── 4, 5, 6: desktop two-column picker on the just-created task ───────
  await trigger.click()
  await sleep(700)
  const popover = page.locator('[data-category-picker="desktop"]')
  const popVisible = await popover.isVisible().catch(() => false)
  check('4a 桌面出現兩欄式選單', popVisible)

  const wsRows = popover.locator('[data-picker-workspace]')
  const wsRowCount = await wsRows.count()
  const wsNamesInPicker = await readRows(popover, 'workspace')
  check('4b 「未分類」在左欄第一列', wsNamesInPicker[0] === '未分類', wsNamesInPicker.join(' | '))

  const catsBefore = await readRows(popover, 'category')
  let hoveredIdx = -1, catsAfter = []
  for (let i = 1; i < wsRowCount; i++) {
    await wsRows.nth(i).hover(); await sleep(350)
    const cats = await readRows(popover, 'category')
    if (cats.length && cats.join('|') !== catsBefore.join('|')) { hoveredIdx = i; catsAfter = cats; break }
  }
  check('4c 滑鼠移到另一個大分類，右欄立刻換成該大分類的小分類', hoveredIdx > 0,
    `hover「${wsNamesInPicker[hoveredIdx] ?? '?'}」→ ${catsAfter.join(' | ')}｜原本(${wsNamesInPicker[0]}) → ${catsBefore.join(' | ')}`)
  await page.screenshot({ path: path.join(SHOTS, '3-desktop-two-column.png') })

  const pbox = await popover.boundingBox()
  check('6 popover 未超出視窗右緣（x+width<=1280）', Boolean(pbox) && pbox.x + pbox.width <= 1280,
    `x=${pbox ? Math.round(pbox.x) : '?'} w=${pbox ? Math.round(pbox.width) : '?'} right=${pbox ? Math.round(pbox.x + pbox.width) : '?'}`)

  const wantWs = wsNamesInPicker[hoveredIdx]
  const wantCat = catsAfter[0]
  await popover.locator('[data-picker-category]').first().click()
  await sleep(600)
  const popClosed = !(await popover.isVisible().catch(() => false))
  const newLabel = (await trigger.innerText()).replace(/\s+/g, ' ').trim()
  check('5 右欄點小分類後：選單關閉 + 觸發鈕更新為「大分類 / 小分類」',
    popClosed && Boolean(wantWs) && Boolean(wantCat) && newLabel.includes(wantWs) && newLabel.includes(wantCat),
    `label="${newLabel}" expected="${wantWs} / ${wantCat}"`)
  await page.screenshot({ path: path.join(SHOTS, '4-selection-committed.png') })
  note('5-note', '選單內點選只更新本地 state，未按「儲存」，所以底下 DB 裡的任務分類仍是建立當下的 未分類/未分類（見 check 7）')

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
  const tasksTab = page.getByRole('tab', { name: '任務' }).first()
  await tasksTab.click({ force: true })
  await sleep(1000)

  const uncatSection = page.locator(`#${firstBlockId}`)
  const testTaskRow = uncatSection.locator('[data-tour="task-row"]').filter({ hasText: '新任務' }).first()
  const rowFound = await testTaskRow.count().catch(() => 0)
  check('8-pre 手機版「未分類」區塊裡找得到剛建立的測試任務', rowFound > 0, `count=${rowFound}`)
  await testTaskRow.click({ force: true })
  await sleep(1200)
  const triggerM = page.locator('button').filter({ hasText: /\S\s\/\s\S/ }).first()
  await triggerM.waitFor({ timeout: 15000 })
  await triggerM.click({ force: true })
  await sleep(700)

  const sheet = page.locator('[data-category-picker="mobile"]')
  check('8a 手機版是手風琴 sheet', await sheet.isVisible().catch(() => false))
  const mRows = sheet.locator('[data-picker-workspace]')
  const mCount = await mRows.count()
  const mNames = await readRows(sheet, 'workspace')
  for (let i = 0; i < mCount; i++) {
    if ((await mRows.nth(i).getAttribute('aria-expanded')) === 'true') { await mRows.nth(i).click({ force: true }); await sleep(400) }
  }
  const allCollapsed = (await sheet.locator('[data-picker-category]').count()) === 0
  check('8b 可全部收合', allCollapsed, `workspaces=${mNames.join(' | ')}`)
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
  check('8c 同時只展開一個大分類', firstOpen > -1 && secondOpen > -1 && onlyOneOpen && expandedFlags[secondOpen] === 'true',
    `展開「${mNames[secondOpen] ?? '?'}」後 aria-expanded=[${expandedFlags.join(',')}]`)
  await page.screenshot({ path: path.join(SHOTS, '8-mobile-expanded.png') })

  let minH = 9999
  const tapRows = sheet.locator('[data-picker-workspace], [data-picker-category]')
  const tapCount = await tapRows.count()
  for (let i = 0; i < tapCount; i++) {
    const b = await tapRows.nth(i).boundingBox()
    if (b) minH = Math.min(minH, b.height)
  }
  check('8d 每個可點列高度 >=44px', minH >= 44, `min=${minH.toFixed(1)}px（共 ${tapCount} 列）`)

  const overflowW = await page.evaluate(() => document.documentElement.scrollWidth)
  check('8e 390px 零水平溢出', overflowW <= 390, `scrollWidth=${overflowW}`)

  // Close ONLY the accordion picker (retap the trigger toggles it shut) so
  // the task-detail drawer itself stays open, then delete via the dialog's
  // own header trash button (scoped to avoid ambiguity with per-row swipe
  // delete buttons sharing the same title/aria-label).
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
  await page.reload({ waitUntil: 'commit' })
  await sleep(4000)
  const residualRow = page.locator('[data-tour="task-row"]').filter({ hasText: '新任務' })
  const residualCount = await residualRow.count().catch(() => 0)
  check('清理驗證：reload 後測試任務確實消失', residualCount === 0, `reload 後仍看到 ${residualCount} 筆`)
  await sleep(1500) // extra settle before this context closes, per lessons.md discipline
  await ctx.close()

  // ══════════════ English ════════════════════════════════════════════════
  const { ctx: ctxEn, page: pageEn } = await newLoggedInPage(browser, 'en', { width: 1280, height: 900 })
  let enTaskCreated = false, enTaskDeleted = false
  const anyTaskRow = pageEn.locator('[data-tour="task-row"]').first()
  const anyTaskCount = await anyTaskRow.count().catch(() => 0)
  let openedRow = anyTaskRow
  if (anyTaskCount === 0) {
    note('9-note', '帳號目前沒有任何既有任務，另建一筆拋棄式任務走同樣的真實建立路徑來測英文選單')
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
  check('9 English UI：選單自有文案零殘留中文（DB 分類名稱屬使用者資料，不算）', !CJK.test(residue),
    `殘留=${JSON.stringify(residue.replace(/\s+/g, ' ').trim().slice(0, 80))}`)
  await pageEn.screenshot({ path: path.join(SHOTS, '9-english-two-column.png') })
  await triggerEn.click({ force: true }); await sleep(400)

  if (enTaskCreated) {
    const dialogScopeEn = pageEn.getByRole('dialog').first()
    const deleteBtnEn = dialogScopeEn.locator('button[title="Delete task"], button[aria-label="Delete task"], button[title="刪除任務"], button[aria-label="刪除任務"]').first()
    const delCountEn = await deleteBtnEn.count().catch(() => 0)
    if (delCountEn > 0) {
      await deleteBtnEn.click()
      await sleep(2000)
      enTaskDeleted = true
    }
    check('9-cleanup 英文檢查用的拋棄式任務已刪除', enTaskDeleted, `刪除按鈕數量=${delCountEn}`)
    await sleep(500)
    await pageEn.reload({ waitUntil: 'commit' })
    await sleep(3500)
    const residualEn = await pageEn.locator('[data-tour="task-row"]').count().catch(() => 0)
    check('9-cleanup 驗證：reload 後帳號任務數回到 0', residualEn === 0, `reload 後任務數=${residualEn}`)
    await sleep(1500)
  } else {
    await closeModal(pageEn)
  }
  await ctxEn.close()

  check('11 全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '))
} catch (err) {
  if (!aborted) check('FATAL', false, String(err?.stack || err))
} finally {
  try { await browser?.close() } catch {}
}

console.log(`\n${passed}/${passed + failed} passed${aborted ? ' (ABORTED after fingerprint FAIL)' : ''}`)
console.log(`created task deleted+verified gone: ${createdTaskDeleted}`)
console.log(`screenshots → ${SHOTS}`)

// ══════════════ Post-run: direct PROD DB residual check (service role) ══
async function dbResidualCheck() {
  const SUPABASE_URL = adminEnv.SUPABASE_URL
  const SERVICE_KEY = adminEnv.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.log('\n[db-check] SKIPPED — missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in .env.admin.local')
    return
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: userRes, error: userErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (userErr) { console.log('\n[db-check] FAILED to list users —', userErr.message); return }
  const acct = userRes.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase())
  if (!acct) { console.log(`\n[db-check] FAILED — account ${EMAIL} not found via auth.admin.listUsers`); return }
  const { data: tasks, error: taskErr } = await admin
    .from('tasks')
    .select('id, title, created_at, workspace_id, category_id')
    .eq('user_id', acct.id)
  console.log(`\n[db-check] queried prod tasks table for user_id=${acct.id} (${EMAIL})`)
  if (taskErr) { console.log('[db-check] query error —', taskErr.message); return }
  console.log(`[db-check] total task rows: ${tasks.length}`)
  console.log(JSON.stringify(tasks, null, 2))
  const residualTest = tasks.filter((t) => t.title === '新任務' || t.title === 'Add')
  console.log(`[db-check] residual test-titled rows ("新任務"/"Add"): ${residualTest.length}`)
}
await dbResidualCheck()

process.exit(failed ? 1 : 0)
