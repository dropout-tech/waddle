#!/usr/bin/env node
/**
 * 專注計時器兩個新功能 — 2026-08-24。
 *
 *  A. 計時結束時的隨機鼓勵語（含實際專注時長）
 *  B. 專注段結束後可選填的「這段時間做了什麼」對話框（標題→行事曆標籤，
 *     內文→time_blocks.notes）
 *
 * S1（桌面 zh-TW）：1 分鐘 pomodoro（autoStartBreak 留預設 ON，刻意撞上
 *   「自動接續休息時 immersive/mini 還在、對話框要疊得上去」這個最刁鑽的
 *   時序）→ 完成 → 斷言鼓勵語含「1 分鐘」且是六句其一 → 對話框出現 →
 *   填標題/內文 → 記下來 → 日曆出現「e2e專注紀錄 ✓」→ 點開塊看備註欄
 *   （env EXPECT_NOTES=1 才硬斷言內文相符——migration 還沒套到正式庫，
 *   沒設就只印 PENDING-MIGRATION）→ 清掉塊 → 手動停掉自動開始的休息。
 * S2（桌面 zh-TW，最快）：正計時 5 秒手動結束 → 仍是「先到這裡也很好」、
 *   無對話框、無新日曆塊、回到 idle。
 * S3（手機 390×844、English）：正計時 65 秒手動結束（immersive 全螢幕）→
 *   鼓勵語英文含 "1 min" 且無殘留中文 → 對話框英文 → 跳過 → 塊 label 為
 *   原 session 名（無 ✓）→ 跳過/儲存鈕高度 ≥44px → 清掉塊。
 *
 * 用 ONLY=S1 / S2 / S3（逗號分隔可多選）只跑指定情境，預設全跑。
 * Run: node scripts/e2e/tmp-focus-log-verify.mjs
 *      ONLY=S2 node scripts/e2e/tmp-focus-log-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3199
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const SHOT_DIR = '/private/tmp/claude-501/-Users-lazylazy-Desktop------v0-task-management-ui/94d8727f-08bc-4cf9-874b-8e0e90c55502/scratchpad/focus-log-shots'
mkdirSync(SHOT_DIR, { recursive: true })

const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((s) => s.trim())) : null
const shouldRun = (scenario) => !ONLY || ONLY.has(scenario)

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
const envFile = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || envFile.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || envFile.E2E_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('[focus-log-verify] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
  process.exit(1)
}

const CJK = /[一-鿿]/
const PRAISE_TEMPLATES_ZH = [
  '這次又專注了 {duration}，超棒！',
  '剛剛專注了 {duration}，給自己一點掌聲！',
  '{duration} 的專注入袋，繼續保持！',
  '好穩，這一段專注了 {duration}！',
  '又累積了 {duration} 的專注，太厲害了！',
  '專注 {duration} 達成，小企鵝為你驕傲 🐧',
]

const results = []
let exitCode = 0
async function step(name, fn) {
  try {
    await fn()
    results.push({ name, passed: true })
    console.log(`PASS — ${name}`)
  } catch (e) {
    results.push({ name, passed: false, note: e.message })
    console.log(`FAIL — ${name} — ${e.message}`)
    exitCode = 1
  }
}

let devServer
function startDevServer() {
  devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
    cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  devServer.stdout.on('data', () => {})
  devServer.stderr.on('data', () => {})
}
function stopDevServer() {
  if (!devServer || !devServer.pid) return
  try { process.kill(-devServer.pid, 'SIGKILL') } catch {}
}
async function waitForServerReady(timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(`${BASE_URL}/login`); if (r.status < 500) return } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready')
}

async function login(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
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

/** Long-press a Pointer-events-driven button (mirrors FocusTimerMini's /
 *  FocusTimerImmersive's hold-to-stop buttons — they use onPointerDown/Up,
 *  not onClick). `holdMs` should exceed the button's own hold threshold. */
async function longPress(page, locator, holdMs) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('long-press target has no bounding box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await sleep(holdMs)
  await page.mouse.up()
}

/** Auto-accept the window.confirm() TimeBlockModal's delete button fires. */
function acceptDialogs(page) {
  page.on('dialog', (d) => d.accept())
}

/** Open a calendar block by its (possibly partial) label text. Clicks the
 *  label TEXT node itself (not a manual pixel offset on the block
 *  container) — a 1-minute session's block can render only a few px tall,
 *  so an offset risks landing on the resize handle instead; the text node's
 *  own bounding box is always inside the block body's onClick area. */
async function openBlockByLabel(page, labelPattern) {
  const candidates = page.getByText(labelPattern, { exact: false })
  await candidates.first().waitFor({ state: 'attached', timeout: 15000 })
  // 日曆可能同時掛載多個視圖（週/月/待排區），同一 label 會有隱藏的分身——
  // 挑第一個「可見」的點；全都不可見就退回對 DOM 直接派送 click 事件。
  const n = await candidates.count()
  for (let i = 0; i < n; i++) {
    const el = candidates.nth(i)
    if (await el.isVisible()) {
      await el.evaluate((node) => node.scrollIntoView({ block: 'center' }))
      await sleep(300)
      await el.click()
      await sleep(600)
      return
    }
  }
  await candidates.first().evaluate((node) => {
    node.scrollIntoView({ block: 'center' })
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  await sleep(600)
}

/** Extract "mm:ss" or "h:mm:ss" from a pill/timer's text and convert to
 *  total seconds — used by S4 to prove a reload didn't reset the clock. */
function parseClockSeconds(text) {
  const m = text.match(/(\d{1,2}):(\d{2}):(\d{2})|(\d{1,2}):(\d{2})/)
  if (!m) throw new Error(`no clock found in "${text}"`)
  if (m[1] !== undefined) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
  return (+m[4]) * 60 + (+m[5])
}

/** After stopping a session, the idle setup card can come back either
 *  collapsed ([data-tour="focus-timer"]) or expanded (開始專注 button) —
 *  isExpanded isn't part of session identity, so a reload resets it to
 *  false, and the immersive exit path explicitly does setIsExpanded(false)
 *  on manual stop. Either shape means "back to idle", so accept both
 *  (mirrors tmp-timer-crossroute-verify.mjs's idleVisible||startVisible). */
async function waitForIdleSetupCard(page, timeoutMs = 8000, startLabel = '開始專注') {
  const collapsed = page.locator('[data-tour="focus-timer"]')
  const expanded = page.getByRole('button', { name: startLabel, exact: true })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await collapsed.isVisible().catch(() => false)) return
    if (await expanded.isVisible().catch(() => false)) return
    await sleep(250)
  }
  throw new Error('idle setup card (collapsed or expanded) never reappeared')
}

async function deleteOpenBlock(page) {
  const trash = page.locator(
    'button:has(svg.lucide-trash2), button:has(svg.lucide-trash-2), ' +
    'button[aria-label*="刪除"], button[aria-label*="Delete"]'
  ).last()
  await trash.waitFor({ state: 'visible', timeout: 5000 })
  await trash.click()
  await sleep(800)
}

async function main() {
  if (!process.env.E2E_BASE_URL) {
    startDevServer()
    await waitForServerReady()
  }

  // ────────────────────────────────────────────────────────────────
  // S1 + S2 — desktop, zh-TW
  // ────────────────────────────────────────────────────────────────
  if (shouldRun('S1') || shouldRun('S2')) {
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    acceptDialogs(page)

    const idleCollapsedBtn = () => page.locator('[data-tour="focus-timer"]')
    const startBtn = () => page.getByRole('button', { name: '開始專注', exact: true })
    const completionRegion = () => page.getByRole('region', { name: '計時完成' })

    await step('login (desktop zh-TW)', async () => {
      await login(page)
      await page.getByRole('button', { name: '日檢視' }).waitFor({ state: 'visible', timeout: 20000 })
      await page.getByRole('button', { name: '日檢視' }).click()
    })

    if (shouldRun('S1')) {
      await step('S1: open timer, custom 1min, label', async () => {
        await idleCollapsedBtn().click()
        await page.getByRole('button', { name: '自訂', exact: true }).click()
        await page.getByRole('spinbutton').first().fill('1')
        await page.getByPlaceholder('在專注什麼？（選填）').fill('E2E-FOCUS-LOG-S1')
      })

      await step('S1: start session', async () => {
        await startBtn().click()
        await page.getByRole('region', { name: '專注計時迷你顯示' }).waitFor({ state: 'visible', timeout: 5000 })
      })

      let doneText = ''
      await step('S1: wait for natural completion, praise line shows "1 分鐘" + matches template', async () => {
        await sleep(58000)
        await completionRegion().waitFor({ state: 'visible', timeout: 10000 })
        doneText = (await completionRegion().getByRole('button').innerText()).trim()
        console.log(`[S1] completion text: "${doneText}"`)
        if (!doneText.includes('1 分鐘')) throw new Error(`expected "1 分鐘" in praise, got "${doneText}"`)
        const matchesTemplate = PRAISE_TEMPLATES_ZH.some((tpl) => doneText === tpl.replace('{duration}', '1 分鐘'))
        if (!matchesTemplate) throw new Error(`praise text doesn't match any of the 6 templates: "${doneText}"`)
      })

      await step('S1: session-log dialog appears (auto-break underneath, above z-tour)', async () => {
        await page.locator('[data-focus-log-modal]').waitFor({ state: 'visible', timeout: 8000 })
        await page.screenshot({ path: path.join(SHOT_DIR, 's1-dialog.png') })
      })

      await step('S1: fill title + note, save', async () => {
        await page.locator('[data-focus-log-title]').fill('e2e專注紀錄')
        await page.locator('[data-focus-log-note]').fill('e2e測試內文')
        await page.locator('[data-focus-log-save]').click()
        await page.locator('[data-focus-log-modal]').waitFor({ state: 'hidden', timeout: 5000 })
      })

      await step('S1: auto-started break is now running underneath', async () => {
        await page.getByRole('region', { name: '休息計時迷你顯示' }).waitFor({ state: 'visible', timeout: 5000 })
      })

      await step('S1: calendar shows "e2e專注紀錄 ✓" block', async () => {
        await openBlockByLabel(page, /e2e專注紀錄 ✓/)
        await page.getByRole('dialog', { name: '編輯時間區塊' }).waitFor({ state: 'visible', timeout: 5000 })
      })

      await step('S1: notes field reflects the dialog note (or PENDING-MIGRATION)', async () => {
        const notesField = page.locator('[data-timeblock-notes]')
        await notesField.waitFor({ state: 'visible', timeout: 5000 })
        const value = await notesField.inputValue()
        console.log(`[S1] time-block notes field value: "${value}"`)
        await page.screenshot({ path: path.join(SHOT_DIR, 's1-timeblock-notes.png') })
        if (process.env.EXPECT_NOTES === '1') {
          if (value !== 'e2e測試內文') throw new Error(`expected notes "e2e測試內文", got "${value}"`)
        } else if (!value) {
          console.log('[S1] notes empty — PENDING-MIGRATION (supabase/migrations/20260824120000_time_blocks_notes.sql not applied to prod yet)')
        }
      })

      await step('S1: cleanup — delete the block', async () => {
        await deleteOpenBlock(page)
      })

      await step('S1: cleanup — stop the auto-started break', async () => {
        const stopBtn = page.getByRole('region', { name: '休息計時迷你顯示' }).getByLabel(/長按結束/)
        await longPress(page, stopBtn, 700)
        await startBtn().waitFor({ state: 'visible', timeout: 8000 })
      })
    }

    if (shouldRun('S2')) {
      await step('S2: open timer, stopwatch mode, label', async () => {
        if (await idleCollapsedBtn().isVisible().catch(() => false)) await idleCollapsedBtn().click()
        await page.getByRole('button', { name: '正計時', exact: true }).click()
        await page.getByPlaceholder('在專注什麼？（選填）').fill('E2E-S2-NODUR')
      })

      await step('S2: start, wait 5s, manual long-press stop', async () => {
        await startBtn().click()
        const pill = page.getByRole('region', { name: '專注計時迷你顯示' })
        await pill.waitFor({ state: 'visible', timeout: 5000 })
        await sleep(5000)
        const stopBtn = pill.getByLabel(/長按結束/)
        await longPress(page, stopBtn, 700)
      })

      await step('S2: completion stays "先到這裡也很好" (no praise, <60s)', async () => {
        await completionRegion().waitFor({ state: 'visible', timeout: 3000 })
        const text = (await completionRegion().getByRole('button').innerText()).trim()
        console.log(`[S2] completion text: "${text}"`)
        if (text !== '先到這裡也很好') throw new Error(`expected fallback copy, got "${text}"`)
      })

      await step('S2: no session-log dialog, back to idle, no new calendar block', async () => {
        await sleep(2500) // COMPLETION_HOLD_MANUAL_MS(1400) + EXIT_MS(400) + margin
        const dialogCount = await page.locator('[data-focus-log-modal]').count()
        if (dialogCount !== 0) throw new Error(`expected no session-log dialog for a <1min session, found ${dialogCount}`)
        await startBtn().waitFor({ state: 'visible', timeout: 8000 })
        const stray = await page.getByText('E2E-S2-NODUR', { exact: false }).count()
        if (stray !== 0) throw new Error(`expected no calendar block for a <1min session, found ${stray}`)
      })
    }

    await step('S1/S2: zero pageerror', async () => {
      if (pageErrors.length !== 0) throw new Error(pageErrors.slice(0, 3).join(' | '))
    })

    await browser.close()
  }

  // ────────────────────────────────────────────────────────────────
  // S3 — mobile 390×844, English
  // ────────────────────────────────────────────────────────────────
  if (shouldRun('S3')) {
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' })
    const page = await ctx.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    acceptDialogs(page)

    await step('S3: login, switch to English', async () => {
      await login(page)
      await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
      await page.reload({ waitUntil: 'domcontentloaded' })
      await sleep(3000)
    })

    const idleCollapsedBtn = () => page.locator('[data-tour="focus-timer"]')
    const startBtn = () => page.getByRole('button', { name: 'Start focusing', exact: true })

    await step('S3: open timer, stopwatch mode, label', async () => {
      await idleCollapsedBtn().click()
      await page.getByRole('button', { name: 'Stopwatch', exact: true }).click()
      await page.getByPlaceholder('What are you focusing on? (optional)').fill('E2E-S3-STOPWATCH')
    })

    await step('S3: start session (forces immersive on mobile)', async () => {
      await startBtn().click()
      await page.getByRole('dialog', { name: 'Focus in progress' }).waitFor({ state: 'visible', timeout: 5000 })
    })

    await step('S3: wait 65s, long-press the header X to end', async () => {
      await sleep(65000)
      const exitBtn = page.getByRole('button', { name: /^Hold to end/ })
      await longPress(page, exitBtn, 1000)
    })

    let praiseText = ''
    await step('S3: praise line is English, contains "1 min", no CJK', async () => {
      const overlay = page.getByRole('button', { name: /Wrapping up/ })
      await overlay.waitFor({ state: 'visible', timeout: 5000 })
      praiseText = (await overlay.locator('h2').innerText()).trim()
      console.log(`[S3] praise text: "${praiseText}"`)
      if (!praiseText.includes('1 min')) throw new Error(`expected "1 min" in praise, got "${praiseText}"`)
      if (CJK.test(praiseText)) throw new Error(`unexpected CJK in English praise: "${praiseText}"`)
    })

    await step('S3: session-log dialog appears in English, buttons >=44px', async () => {
      const modal = page.locator('[data-focus-log-modal]')
      await modal.waitFor({ state: 'visible', timeout: 6000 })
      await sleep(700) // 等進場動畫（scale 0.95→1）停穩，否則 boundingBox 量到中間格
      await page.screenshot({ path: path.join(SHOT_DIR, 's3-dialog-mobile-en.png') })
      const modalText = await modal.innerText()
      if (CJK.test(modalText)) throw new Error(`unexpected CJK in English dialog: "${modalText.slice(0, 120)}"`)
      const skipBox = await page.locator('[data-focus-log-skip]').boundingBox()
      const saveBox = await page.locator('[data-focus-log-save]').boundingBox()
      if (!skipBox || skipBox.height < 44) throw new Error(`skip button height ${skipBox?.height} < 44px`)
      if (!saveBox || saveBox.height < 44) throw new Error(`save button height ${saveBox.height} < 44px`)
    })

    await step('S3: skip — block keeps original label, no checkmark', async () => {
      await page.locator('[data-focus-log-skip]').click()
      await page.locator('[data-focus-log-modal]').waitFor({ state: 'hidden', timeout: 5000 })
      // 手動結束後設定卡可能回到「收合」態（isExpanded 非 session 狀態），
      // 兩態皆算回到 idle——與 S4/S6 的 waitForIdleSetupCard 同語意（英文介面）。
      await waitForIdleSetupCard(page, 8000, 'Start focusing')
      const checked = await page.getByText('E2E-S3-STOPWATCH ✓', { exact: false }).count()
      if (checked !== 0) throw new Error('expected no ✓ suffix on a skipped/manual-stop block')
      const plain = page.getByText('E2E-S3-STOPWATCH', { exact: false }).first()
      await plain.waitFor({ state: 'attached', timeout: 10000 })
    })

    await step('S3: cleanup — delete the block, restore zh-TW', async () => {
      await openBlockByLabel(page, /E2E-S3-STOPWATCH/)
      await deleteOpenBlock(page)
      await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))
    })

    await step('S3: zero pageerror', async () => {
      if (pageErrors.length !== 0) throw new Error(pageErrors.slice(0, 3).join(' | '))
    })

    await browser.close()
  }

  // ────────────────────────────────────────────────────────────────
  // S4 — session-persistence: reload while running, clock doesn't reset
  // ────────────────────────────────────────────────────────────────
  if (shouldRun('S4')) {
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    acceptDialogs(page)

    const pill = () => page.getByRole('region', { name: /專注計時迷你顯示|休息計時迷你顯示/ })

    await step('S4: login, start stopwatch session', async () => {
      await login(page)
      await page.locator('[data-tour="focus-timer"]').click()
      await page.getByRole('button', { name: '正計時', exact: true }).click()
      await page.getByPlaceholder('在專注什麼？（選填）').fill('E2E-S4-PERSIST')
      await page.getByRole('button', { name: '開始專注', exact: true }).click()
      await pill().waitFor({ state: 'visible', timeout: 5000 })
    })

    let beforeSec = 0
    await step('S4: let it tick, then reload', async () => {
      await sleep(4000)
      beforeSec = parseClockSeconds(await pill().innerText())
      console.log(`[S4] clock before reload: ${beforeSec}s`)
      await page.reload({ waitUntil: 'domcontentloaded' })
    })

    await step('S4: pill comes back running, clock did not reset', async () => {
      await pill().waitFor({ state: 'visible', timeout: 15000 })
      const afterSec = parseClockSeconds(await pill().innerText())
      console.log(`[S4] clock after reload: ${afterSec}s`)
      if (afterSec < beforeSec) throw new Error(`clock reset on reload: ${beforeSec}s -> ${afterSec}s`)
      await sleep(2000)
      const laterSec = parseClockSeconds(await pill().innerText())
      if (!(laterSec > afterSec)) throw new Error(`restored session isn't ticking: ${afterSec}s -> ${laterSec}s`)
    })

    await step('S4: cleanup — stop the session (<1min, no calendar block expected)', async () => {
      const stopBtn = pill().getByLabel(/長按結束/)
      await longPress(page, stopBtn, 700)
      // Reload wipes isExpanded back to false, so the card can come back
      // collapsed rather than showing "開始專注" — see waitForIdleSetupCard.
      await waitForIdleSetupCard(page)
    })

    await step('S4: zero pageerror', async () => {
      if (pageErrors.length !== 0) throw new Error(pageErrors.slice(0, 3).join(' | '))
    })

    await browser.close()
  }

  // ────────────────────────────────────────────────────────────────
  // S5 — session-persistence: pomodoro that fully elapsed while closed
  // gets retroactively recorded on next load, no completion UI
  // ────────────────────────────────────────────────────────────────
  if (shouldRun('S5')) {
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    acceptDialogs(page)

    await step('S5: login, plant an already-expired active-session key', async () => {
      await login(page)
      await page.getByRole('button', { name: '日檢視' }).waitFor({ state: 'visible', timeout: 20000 })
      await page.evaluate(() => {
        const startedAt = new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
        localStorage.setItem('waddle-timer-active-session-v1', JSON.stringify({
          mode: 'pomodoro', phase: 'work',
          startedAt: startedAt.toISOString(),
          pausedMs: 0, pausedAt: null,
          targetSeconds: 60,
          label: 'E2E-S5-EXPIRED', color: '#e07b5a',
        }))
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
    })

    await step('S5: no live timer UI, key cleared, calendar block appears with ✓', async () => {
      await sleep(3000) // let the mount-restore effect + any recorder registration settle
      const liveTimer = await page.getByRole('region', { name: /專注計時迷你顯示|休息計時迷你顯示/ }).count()
      if (liveTimer !== 0) throw new Error('expected idle (retroactive record, not a resumed/completing session)')
      const key = await page.evaluate(() => localStorage.getItem('waddle-timer-active-session-v1'))
      if (key !== null) throw new Error(`expected active-session key cleared, still present: ${key}`)
      await page.getByRole('button', { name: '日檢視' }).click().catch(() => {})
      await page.getByText(/E2E-S5-EXPIRED ✓/, { exact: false }).first().waitFor({ state: 'attached', timeout: 10000 })
    })

    await step('S5: cleanup — delete the block', async () => {
      await openBlockByLabel(page, /E2E-S5-EXPIRED ✓/)
      await deleteOpenBlock(page)
    })

    await step('S5: zero pageerror', async () => {
      if (pageErrors.length !== 0) throw new Error(pageErrors.slice(0, 3).join(' | '))
    })

    await browser.close()
  }

  // ────────────────────────────────────────────────────────────────
  // S6 — BGM defaults off for a session even with a track selected;
  // turns on only after an explicit in-session action
  // ────────────────────────────────────────────────────────────────
  if (shouldRun('S6')) {
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    acceptDialogs(page)

    await step('S6: login, seed prefs with a music track selected', async () => {
      await login(page)
      await page.evaluate(() => {
        localStorage.setItem('waddle-timer-prefs-v1', JSON.stringify({ music: 'relax' }))
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: '日檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    })

    await step('S6: start session in immersive — music selected but NOT playing', async () => {
      await page.locator('[data-tour="focus-timer"]').click()
      await page.getByRole('button', { name: /放大開始/ }).click()
      await page.getByRole('dialog', { name: '專注計時中' }).waitFor({ state: 'visible', timeout: 5000 })
      await sleep(1500) // let the bgmAudible->engine effect settle
      const playing = await page.evaluate(() => window.__waddleTimerDebug?.isBgmPlaying())
      console.log(`[S6] isBgmPlaying right after start: ${playing}`)
      if (playing) throw new Error('expected BGM NOT playing by default even with a track selected')
    })

    await step('S6: tap the BGM toggle — now playing', async () => {
      const toggle = page.locator('[data-timer-bgm-toggle]')
      if (await toggle.count()) {
        await toggle.click()
        await sleep(1500)
        const playing = await page.evaluate(() => window.__waddleTimerDebug?.isBgmPlaying())
        console.log(`[S6] isBgmPlaying after toggle: ${playing}`)
        if (playing) {
          // Debug hook confirms real playback — the strong assertion.
        } else {
          // Fall back to an observable UI proxy per the task's own escape
          // hatch: the toggle button's aria-pressed reflects bgmAudible.
          const pressed = await toggle.getAttribute('aria-pressed')
          console.log(`[S6] fallback: toggle aria-pressed=${pressed}`)
          if (pressed !== 'true') throw new Error(`debug hook says not playing AND aria-pressed=${pressed} — override didn't take effect`)
        }
      } else {
        throw new Error('BGM toggle button not found ([data-timer-bgm-toggle])')
      }
    })

    await step('S6: cleanup — manual exit (long-press header X)', async () => {
      const exitBtn = page.getByRole('button', { name: /^長按結束/ })
      await longPress(page, exitBtn, 1000)
      // Immersive's onExit explicitly does setIsExpanded(false) on manual
      // stop, so the card comes back collapsed — see waitForIdleSetupCard.
      await waitForIdleSetupCard(page)
    })

    await step('S6: zero pageerror', async () => {
      if (pageErrors.length !== 0) throw new Error(pageErrors.slice(0, 3).join(' | '))
    })

    await browser.close()
  }

  console.log('')
  console.log(`${results.filter((r) => r.passed).length}/${results.length} steps passed`)
}

main()
  .catch((e) => {
    console.error('FATAL:', e)
    exitCode = 1
  })
  .finally(() => {
    stopDevServer()
    process.exit(exitCode)
  })
