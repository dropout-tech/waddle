#!/usr/bin/env node
/**
 * Escape-key handling for CategoryCascadePicker (2026-08-18).
 *
 * The picker lives inside a ModalShell that also closes on Escape. The
 * picker's new keydown handler listens in the capture phase and calls
 * preventDefault() so the shell's own (bubble-phase) Escape listener sees
 * `e.defaultPrevented` and leaves itself open — protocol documented at
 * modal-shell.tsx:137-140 and category-cascade-picker.tsx:139-156.
 *
 * Asserts, against a real dev server and the real Supabase project:
 *  1-3. Task-detail modal (desktop 1440): open picker → Esc closes ONLY the
 *       panel (modal stays open) → focus returns to the trigger → a second
 *       Esc closes the modal (proves Escape isn't permanently swallowed).
 *  4.   Settings modal "預設分類" (inline placement): same 3-step check.
 *  5.   The selected category value is unchanged after Esc (cancel, not a
 *       stray selection).
 *  6.   Zero pageerror across the whole run.
 *  7.   Mobile 390x844: task-detail modal repeat of check 1 (panel closes,
 *       modal stays open).
 *
 * DB writes: NONE. Every non-GET request to /rest/v1/** is answered locally
 * with a fake 200 — no write ever reaches the real project. ONE login for
 * the whole run (desktop and mobile share a context, viewport swap only).
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3161
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

// Never let a click/keypress that slips through actually write to the real
// project — every non-GET /rest/v1/** call is answered locally.
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

const todayStr = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

// A short click on empty day-grid opens the slot-type picker; existing
// events sit on top of the grid, so several vertical positions are tried.
// (Same approach as tmp-category-cascade-verify.mjs.)
async function openSlotPicker(page) {
  const marker = '選擇時間區塊的類型'
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
async function openTaskModal(page) {
  await page.locator('[aria-label="日檢視"]').first().click()
  await sleep(1200)
  if (!(await openSlotPicker(page))) throw new Error('slot picker never opened')
  await page.locator('button').filter({ hasText: /新增任務到「/ }).first().click()
  await sleep(1500)
  const trigger = page.locator('button').filter({ hasText: /\S\s\/\s\S/ }).first()
  await trigger.waitFor({ timeout: 15000 })
  return trigger
}

async function closeAll(page) {
  await page.keyboard.press('Escape')
  await sleep(400)
  await page.keyboard.press('Escape')
  await sleep(800)
}

/** Runs the open-picker / Esc-once / Esc-twice sequence against whichever
 *  dialog+trigger is passed in. Returns nothing — asserts via `check()`. */
async function runEscSequence(page, { label, dialog, trigger, panel }) {
  await trigger.click()
  await sleep(500)
  check(`${label} 1 面板開啟`, await panel.isVisible(), 'selector=' + panel._selector)

  const labelBefore = (await trigger.innerText()).replace(/\s+/g, ' ').trim()

  await page.keyboard.press('Escape')
  await sleep(500)

  const panelGoneAfterFirstEsc = !(await panel.isVisible().catch(() => false))
  const dialogStillOpenAfterFirstEsc = await dialog.isVisible().catch(() => false)
  check(`${label} 2 第一次 Esc 只關面板（視窗仍開）`, panelGoneAfterFirstEsc && dialogStillOpenAfterFirstEsc,
    `panelVisible=${!panelGoneAfterFirstEsc} dialogVisible=${dialogStillOpenAfterFirstEsc}`)

  const activeHaspopup = await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup'))
  const activeIsTrigger = await trigger.evaluate((el) => el === document.activeElement).catch(() => false)
  check(`${label} 3 焦點回到觸發按鈕`, activeHaspopup === 'menu' && activeIsTrigger,
    `aria-haspopup=${activeHaspopup} isTriggerEl=${activeIsTrigger}`)

  const labelAfter = (await trigger.innerText()).replace(/\s+/g, ' ').trim()
  check(`${label} 5 Esc 後選到的分類值未被改動`, labelAfter === labelBefore,
    `before="${labelBefore}" after="${labelAfter}"`)

  await page.keyboard.press('Escape')
  await sleep(600)
  const dialogGoneAfterSecondEsc = !(await dialog.isVisible().catch(() => false))
  check(`${label} 4 第二次 Esc 關閉視窗（Esc 沒被永久吃掉）`, dialogGoneAfterSecondEsc,
    `dialogVisible=${!dialogGoneAfterSecondEsc}`)
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
  await sleep(4000)

  // ══════════════ 1-3, 5: Task-detail modal, desktop 1440 ══════════════════
  const trigger1 = await openTaskModal(page)
  const dialog1 = page.locator('[role="dialog"]').first()
  const panel1 = page.locator('[data-category-picker="desktop"]')
  panel1._selector = '[data-category-picker="desktop"]'
  await runEscSequence(page, { label: '任務詳情', dialog: dialog1, trigger: trigger1, panel: panel1 })

  // ══════════════ 4: Settings modal "預設分類", desktop 1440 ═══════════════
  await page.locator('button[aria-label="設定"]').first().click()
  await sleep(1000)
  const dialog2 = page.locator('[role="dialog"]').first()
  check('設定頁 0 設定視窗開啟', await dialog2.isVisible())
  const trigger2 = page.locator('button[aria-label="預設分類"]').first()
  await trigger2.waitFor({ timeout: 15000 })
  const panel2 = page.locator('[data-category-picker="desktop"]')
  panel2._selector = '[data-category-picker="desktop"]'
  await runEscSequence(page, { label: '設定頁', dialog: dialog2, trigger: trigger2, panel: panel2 })

  // ══════════════ 6: zero pageerror (checked before mobile too, so a mobile
  // reload's own errors don't get blamed on the desktop run) ═══════════════
  check('6a 桌面段落零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

  // ══════════════ 7: Mobile 390x844 — same context, viewport swap ══════════
  // The day-view switcher (and its slot picker) is desktop-only chrome
  // (`hidden md:flex`), so the modal is opened at desktop width first, same
  // as tmp-category-cascade-verify.mjs's mobile section — then the viewport
  // shrinks and useIsMobile's matchMedia listener flips the picker to its
  // accordion body (`data-category-picker="mobile"`).
  const trigger3 = await openTaskModal(page)
  const dialog3 = page.locator('[role="dialog"]').first()
  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(1200)
  const panel3 = page.locator('[data-category-picker="mobile"]')
  panel3._selector = '[data-category-picker="mobile"]'
  await trigger3.click()
  await sleep(600)
  check('手機任務詳情 1 面板開啟', await panel3.isVisible(), 'selector=' + panel3._selector)
  await page.keyboard.press('Escape')
  await sleep(600)
  const mobilePanelGone = !(await panel3.isVisible().catch(() => false))
  const mobileDialogStillOpen = await dialog3.isVisible().catch(() => false)
  check('手機任務詳情 2 第一次 Esc 只關面板（視窗仍開）', mobilePanelGone && mobileDialogStillOpen,
    `panelVisible=${!mobilePanelGone} dialogVisible=${mobileDialogStillOpen}`)
  await closeAll(page)

  check('6b 全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (err) {
  failed++
  console.error('RUN ERROR', err)
} finally {
  await browser?.close().catch(() => {})
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM') } catch {}
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}
