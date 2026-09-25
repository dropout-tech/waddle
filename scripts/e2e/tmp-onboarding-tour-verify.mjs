#!/usr/bin/env node
/**
 * Verifies the onboarding tour changes:
 *  - Desktop DESKTOP_STEPS + mobile MOBILE_STEPS both gained a "通知中心"
 *    step targeting [data-tour="notification-center"] (the bell button in
 *    components/notifications/notification-center.tsx).
 *  - The "左側：三層結構" desktop step copy now mentions ＋ (add category)
 *    and 精簡 (density toggle).
 *  - The tour still walks end-to-end via the "下一步" button without
 *    getting stuck or throwing a page error.
 *
 * Never touches real DB rows: we intercept `**\/rest/v1/user_settings**`
 * so (a) GET responses report onboarding_completed=false (forces the tour
 * open without writing anything), and (b) any write (PATCH/POST, e.g. from
 * completeOnboarding()) is faked with a 200 and never reaches Supabase. We
 * never click the final-step 套用模板/空白開始 choices (those wipe+recreate
 * real workspaces/categories via applyOnboardingChoice) — we only confirm
 * the final screen renders, then close the tour with Escape.
 *
 * Run: node scripts/e2e/tmp-onboarding-tour-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3104
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL
const BASE_URL = EXTERNAL_BASE_URL || `http://localhost:${PORT}`
const SHOT_DIR = '/private/tmp/claude-501/-Users-lazylazy-Desktop------v0-task-management-ui/188cb74e-4c5d-455f-a44e-433657d975d9/scratchpad'
mkdirSync(SHOT_DIR, { recursive: true })

function loadEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const envFile = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || envFile.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || envFile.E2E_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('[onboarding-verify] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
  process.exit(1)
}

let devServer
let exitCode = 0
const results = []

async function waitForServerReady(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE_URL)
      if (res.status < 500) return
    } catch {}
    await sleep(500)
  }
  throw new Error(`Dev server did not become ready within ${timeoutMs}ms`)
}
function startDevServer() {
  devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
    cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  devServer.stdout.on('data', (d) => process.stdout.write(`[next dev] ${d}`))
  devServer.stderr.on('data', (d) => process.stderr.write(`[next dev] ${d}`))
}
function stopDevServer() {
  if (!devServer || !devServer.pid) return
  try { process.kill(-devServer.pid, 'SIGTERM') } catch { try { devServer.kill('SIGTERM') } catch {} }
}

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

// Intercept user_settings so the tour is force-opened without ever writing
// to the real DB. GET responses get onboarding_completed patched to false;
// any write is faked (never forwarded to Supabase).
async function installOnboardingForceOpenRoute(page) {
  await page.route('**/rest/v1/user_settings**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      const response = await route.fetch()
      let body
      try { body = await response.json() } catch { body = null }
      const patch = (row) => (row && typeof row === 'object') ? { ...row, onboarding_completed: false } : row
      const patched = Array.isArray(body) ? body.map(patch) : patch(body)
      await route.fulfill({ response, json: patched })
    } else {
      // PATCH/POST/etc (e.g. completeOnboarding's UPDATE) — never touch the
      // real row. Fake a benign success.
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
  })
}

// Repo has an unrelated concurrent i18n rollout in progress (90+ files under
// active edit as of this script's authoring — lib/i18n/dict/*.ts mtimes were
// seconds old), which triggers Next dev "Fast Refresh full reload" +
// hydration-mismatch churn mid-test and can eat a login click. Retry the
// whole login attempt (fresh /login load + fill + click) a few times so a
// single HMR hiccup doesn't fail the run.
async function login(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    try {
      await page.waitForURL(`${BASE_URL}/`, { timeout: 15000 })
      return
    } catch {
      console.log(`   [login] attempt ${attempt} did not land on '/', current url = ${page.url()}`)
    }
  }
  throw new Error(`login did not reach '/' after 3 attempts, stuck at ${page.url()}`)
}

const DIALOG_SEL = '[role="dialog"][aria-label="新手導覽"]'

// Mirrors DESKTOP_STEPS / MOBILE_STEPS in components/onboarding-tour.tsx.
// Used only for observability (target-hit table) — the tour itself is driven
// by clicking 下一步, not by this map.
const STEP_TARGETS = {
  desktop: [
    ['歡迎來到 Huddle', null],
    ['左側：三層結構', '[data-tour="left-panel"]'],
    ['勾選 / 點開任務', '[data-tour="task-row"]'],
    ['今日會議 ＆ 待整理 ＆ 已完成', '[data-tour="task-shortcut-row"]'],
    ['🔄 左邊 = 右邊', null],
    ['日曆：上方待排程 / 下方時間軸', '[data-tour="calendar-panel"]'],
    ['🤚 拖曳就是排程', '[data-tour="calendar-panel"]'],
    ['切換 日 / 週 / 月', '[data-tour="view-modes"]'],
    ['匯出行程圖檔', '[data-tour="calendar-export"]'],
    ['通知中心', '[data-tour="notification-center"]'],
    ['記事本', '[data-tour="notebook-entry"]'],
    ['專注白板', '[data-tour="scratchpad"]'],
    ['專注計時器 ＋ 背景音', '[data-tour="focus-timer"]'],
    ['💧 喝水小提醒', null],
    ['常用連結（最底下）', '[data-tour="quick-links-bar"]'],
    ['右上角：使用者選單', '[data-tour="user-menu"]'],
    ['✨ 你準備好了！', null],
  ],
  mobile: [
    ['歡迎來到 Huddle', null],
    ['任務分頁', '[data-tour="left-panel"]'],
    ['當前重點', '[data-tour="focus-block"]'],
    ['點任務 = 編輯，長按 = 拖到日曆', '[data-tour="task-row"]'],
    ['今日會議 ＆ 待整理 ＆ 已完成', '[data-tour="task-shortcut-row"]'],
    ['🤚 左右滑動', null],
    ['日曆：上方待排程 / 下方時間軸', '[data-tour="calendar-panel"]'],
    ['通知中心', '[data-tour="notification-center"]'],
    ['✨ 底部四分頁', null],
    ['專注計時器 ＋ 背景音', '[data-tour="focus-timer"]'],
    ['💧 喝水小提醒', null],
    ['✨ 你準備好了！', null],
  ],
}

// Pre-existing, *not* a regression: main-layout.tsx:141 defaults mobileTab to
// 'calendar', so the whole task panel is unmounted while the tour runs on
// mobile. These four steps silently degrade to centered modals (no spotlight).
// Documented here so a genuinely new miss (renamed/removed anchor) still fails.
const KNOWN_MISSES = {
  desktop: [],
  mobile: [
    '[data-tour="left-panel"]',
    '[data-tour="focus-block"]',
    '[data-tour="task-row"]',
    '[data-tour="task-shortcut-row"]',
  ],
}

const fmt = (b) => (b ? `{x:${Math.round(b.left)},y:${Math.round(b.top)},w:${Math.round(b.width)},h:${Math.round(b.height)},bottom:${Math.round(b.top + b.height)},right:${Math.round(b.left + b.width)}}` : 'null')

// Measures, for the currently visible tour step: the tooltip card box, the
// 下一步 button box, the target element box (per the map above), and viewport.
async function probeStep(page, targetSel) {
  return page.evaluate((sel) => {
    const box = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, left: r.left, width: r.width, height: r.height }
    }
    const dlg = document.querySelector('[role="dialog"][aria-label="新手導覽"]')
    // The tooltip card is the dialog child carrying the bg-card class.
    const card = dlg ? dlg.querySelector('div.bg-card') : null
    let nextBtn = null
    if (card) {
      nextBtn = Array.from(card.querySelectorAll('button')).find((b) => b.textContent.trim().startsWith('下一步')) || null
    }
    const target = sel ? document.querySelector(sel) : null
    return {
      card: box(card),
      next: box(nextBtn),
      target: box(target),
      targetFound: sel ? !!target : null,
      vw: window.innerWidth,
      vh: window.innerHeight,
    }
  }, targetSel)
}

function outsideViewport(b, vw, vh) {
  if (!b) return null
  const reasons = []
  if (b.top < 0) reasons.push(`top=${Math.round(b.top)}<0`)
  if (b.left < 0) reasons.push(`left=${Math.round(b.left)}<0`)
  if (b.top + b.height > vh) reasons.push(`bottom=${Math.round(b.top + b.height)}>vh=${vh}`)
  if (b.left + b.width > vw) reasons.push(`right=${Math.round(b.left + b.width)}>vw=${vw}`)
  return reasons
}

async function walkTour(page, { viewportLabel, notificationStepTitle, checkPlusJing }) {
  const pageErrors = []
  page.on('pageerror', (err) => { pageErrors.push(err.message); console.log(`[pageerror][${viewportLabel}] ${err.message}`) })

  await step(`[${viewportLabel}] 導覽自動開啟`, async () => {
    await page.locator(DIALOG_SEL).waitFor({ state: 'visible', timeout: 20000 })
  })

  let stepCount = 0
  let sawNotificationStep = false
  let notificationOverlapOk = null
  let plusJingOk = null
  const viewportViolations = []
  const targetTable = []
  const MAX_STEPS = 30 // safety bound so a stuck tour fails fast instead of hanging

  for (let i = 0; i < MAX_STEPS; i++) {
    stepCount++
    const dialog = page.locator(DIALOG_SEL)
    await dialog.waitFor({ state: 'visible', timeout: 10000 })
    await sleep(350) // let the 300ms position/opacity transition settle

    const title = await dialog.locator('h3').first().innerText().catch(() => '')
    const body = await dialog.locator('p.text-sm.text-muted-foreground').first().innerText().catch(() => '')

    // ── Observation: geometry of tooltip / 下一步 / target for every step ──
    const mapEntry = (STEP_TARGETS[viewportLabel] || [])[stepCount - 1]
    const targetSel = mapEntry ? mapEntry[1] : null
    const mapTitle = mapEntry ? mapEntry[0] : '(map exhausted)'
    const p = await probeStep(page, targetSel)
    console.log(
      `   [${viewportLabel}] step ${stepCount} 「${title}」 (map:「${mapTitle}」) vp=${p.vw}x${p.vh}\n` +
      `       tooltip=${fmt(p.card)}\n` +
      `       next   =${fmt(p.next)}\n` +
      `       target =${targetSel ?? '(none, centered)'} found=${p.targetFound} box=${fmt(p.target)}`
    )
    targetTable.push({ n: stepCount, title, targetSel, found: p.targetFound, targetBox: p.target })

    // ── New generic assertion: tooltip AND 下一步 must sit fully inside the
    // viewport on every step. This is the assertion that catches the live bug.
    const cardBad = outsideViewport(p.card, p.vw, p.vh)
    const nextBad = outsideViewport(p.next, p.vw, p.vh)
    if ((cardBad && cardBad.length) || (nextBad && nextBad.length)) {
      const msg = `step ${stepCount}「${title}」 tooltip=${fmt(p.card)} next=${fmt(p.next)} vp=${p.vw}x${p.vh}` +
        (cardBad && cardBad.length ? ` | tooltip out: ${cardBad.join(',')}` : '') +
        (nextBad && nextBad.length ? ` | next out: ${nextBad.join(',')}` : '')
      viewportViolations.push(msg)
      console.log(`   [${viewportLabel}] VIEWPORT-VIOLATION ${msg}`)
      await page.screenshot({ path: path.join(SHOT_DIR, `onboarding-offscreen-${viewportLabel}-step${stepCount}.png`) })
    }

    if (checkPlusJing && title.includes('三層結構')) {
      plusJingOk = body.includes('＋') && body.includes('精簡')
      console.log(`   [${viewportLabel}] 三層結構 tooltip 含＋=${body.includes('＋')} 含精簡=${body.includes('精簡')}`)
    }

    if (title === notificationStepTitle && title === '通知中心') {
      sawNotificationStep = true
      const measured = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"][aria-label="新手導覽"]')
        const spot = dlg?.firstElementChild
        const bell = document.querySelector('[data-tour="notification-center"]')
        if (!spot || !bell) return null
        const s = spot.getBoundingClientRect()
        const b = bell.getBoundingClientRect()
        return {
          spot: { top: s.top, left: s.left, width: s.width, height: s.height },
          bell: { top: b.top, left: b.left, width: b.width, height: b.height },
          vw: window.innerWidth, vh: window.innerHeight,
        }
      })
      if (measured) {
        const { spot: s, bell: b, vw, vh } = measured
        const isFullDim = s.width >= vw * 0.9 && s.height >= vh * 0.9
        const tol = 2
        const contains = !isFullDim
          && s.left <= b.left + tol
          && s.top <= b.top + tol
          && s.left + s.width >= b.left + b.width - tol
          && s.top + s.height >= b.top + b.height - tol
        notificationOverlapOk = contains
        console.log(`   [${viewportLabel}] spotlight=${JSON.stringify(s)} bell=${JSON.stringify(b)} isFullDim=${isFullDim} contains=${contains}`)
        await page.screenshot({ path: path.join(SHOT_DIR, `onboarding-notification-${viewportLabel}.png`) })
      } else {
        notificationOverlapOk = false
        console.log(`   [${viewportLabel}] measurement failed — spot or bell not found`)
      }
    }

    // Final step: nav row (下一步) is hidden; instead 套用模板/空白開始 buttons appear.
    const nextBtn = dialog.getByRole('button', { name: '下一步' })
    const isLast = (await nextBtn.count()) === 0
    if (isLast) {
      await step(`[${viewportLabel}] 最後選擇畫面已顯示（不點擊，避免清空真實工作區）`, async () => {
        await dialog.getByText('套用模板').waitFor({ state: 'visible', timeout: 5000 })
        await dialog.getByText('空白開始').waitFor({ state: 'visible', timeout: 5000 })
        await page.screenshot({ path: path.join(SHOT_DIR, `onboarding-final-${viewportLabel}.png`) })
      })
      break
    }

    // Primary path: click 下一步 like a real user. If it is unreachable
    // (off-viewport — the bug under investigation), record it and fall back to
    // the ArrowRight keyboard shortcut so the survey of the remaining steps
    // still completes in this single run. The viewport assertion below has
    // already recorded the violation, so the run still fails.
    try {
      await nextBtn.click({ timeout: 5000 })
    } catch (e) {
      console.log(`   [${viewportLabel}] step ${stepCount}「${title}」 下一步 CLICK FAILED: ${e.message.split('\n')[0]} — falling back to ArrowRight`)
      viewportViolations.push(`step ${stepCount}「${title}」 下一步 not clickable: ${e.message.split('\n')[0]}`)
      await page.keyboard.press('ArrowRight')
      await sleep(200)
    }
  }

  console.log(`   [${viewportLabel}] ── target hit table ──`)
  for (const r of targetTable) {
    console.log(`   [${viewportLabel}] ${String(r.n).padStart(2)} ${r.targetSel ?? '(centered)'} → found=${r.found} ${fmt(r.targetBox)} 「${r.title}」`)
  }

  await step(`[${viewportLabel}] 走完全程沒有卡死（在 ${MAX_STEPS} 步上限內抵達最後畫面）`, async () => {
    if (stepCount >= MAX_STEPS) throw new Error(`hit MAX_STEPS=${MAX_STEPS} safety bound without reaching the final step`)
  })

  await step(`[${viewportLabel}] 每一步的導覽視窗與「下一步」都完全落在 viewport 內`, async () => {
    if (viewportViolations.length > 0) {
      throw new Error(`${viewportViolations.length} violation(s):\n      ` + viewportViolations.join('\n      '))
    }
  })

  await step(`[${viewportLabel}] target 命中狀況符合預期（未命中只能是已知的手機分頁 4 步）`, async () => {
    const missed = targetTable.filter((r) => r.targetSel && r.found === false)
    const unexpected = missed.filter((r) => !(KNOWN_MISSES[viewportLabel] || []).includes(r.targetSel))
    if (missed.length > 0) {
      console.log(`   [${viewportLabel}] 已知未命中（降級成置中彈窗，不會卡住）：` + missed.map((r) => `${r.targetSel}`).join(', '))
    }
    if (unexpected.length > 0) {
      throw new Error(`非預期的 target 未命中: ` + unexpected.map((r) => `step ${r.n}「${r.title}」 ${r.targetSel}`).join('; '))
    }
  })

  await step(`[${viewportLabel}] 走到「通知中心」步驟`, async () => {
    if (!sawNotificationStep) throw new Error('never saw a step titled 通知中心')
  })

  await step(`[${viewportLabel}] 通知中心步驟：聚光燈與鈴鐺 boundingBox 重疊`, async () => {
    if (notificationOverlapOk !== true) throw new Error(`spotlight did not contain the bell (result=${notificationOverlapOk})`)
  })

  if (checkPlusJing) {
    await step(`[${viewportLabel}] 「左側：三層結構」文案含「＋」與「精簡」`, async () => {
      if (plusJingOk !== true) throw new Error(`plusJingOk=${plusJingOk} (step may not have been visited or copy missing)`)
    })
  }

  // Close the tour safely (Escape -> onComplete -> completeOnboarding, which
  // is intercepted above so nothing writes to the real user_settings row).
  await page.keyboard.press('Escape')
  await sleep(300)

  await step(`[${viewportLabel}] 全程無 page error`, async () => {
    if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join(' | ')}`)
  })

  return stepCount
}

async function main() {
  if (!EXTERNAL_BASE_URL) {
    startDevServer()
    await waitForServerReady()
  }

  const browser = await chromium.launch()
  const ONLY = process.env.E2E_ONLY // 'desktop' | 'mobile' | unset (both)

  // ── Desktop pass (1280x800) ──
  if (!ONLY || ONLY === 'desktop') {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-TW' })
    const page = await context.newPage()
    await installOnboardingForceOpenRoute(page)
    await step('[desktop] login', async () => { await login(page) })
    const n = await walkTour(page, { viewportLabel: 'desktop', notificationStepTitle: '通知中心', checkPlusJing: true })
    // 2026-08-18: 「當前重點」步驟從桌機導覽移除（該區塊改到全螢幕任務頁），18 → 17。
    await step('[desktop] 步驟總數與 DESKTOP_STEPS 一致（實際數 17）', async () => {
      if (n !== 17) throw new Error(`walked ${n} steps, expected 17`)
    })
    await context.close()
  }

  // ── Mobile pass (390x844) ──
  if (!ONLY || ONLY === 'mobile') {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-TW' })
    const page = await context.newPage()
    await installOnboardingForceOpenRoute(page)
    await step('[mobile] login', async () => { await login(page) })
    const n = await walkTour(page, { viewportLabel: 'mobile', notificationStepTitle: '通知中心', checkPlusJing: false })
    // NOTE: task brief said "手機 12" — actual file count is 11 (counted via
    // `title:` occurrences in MOBILE_STEPS). Asserting against the real count.
    await step('[mobile] 步驟總數與 MOBILE_STEPS 一致（實際數 12，非簡報稿的 13）', async () => {
      if (n !== 12) throw new Error(`walked ${n} steps, expected 12`)
    })
    await context.close()
  }

  await browser.close()
  writeFileSync(path.join(SHOT_DIR, 'onboarding-tour-results.json'), JSON.stringify({ when: new Date().toISOString(), baseUrl: BASE_URL, results }, null, 2))
  console.log('')
  console.log(`${results.filter(r => r.passed).length}/${results.length} steps passed`)
}

main()
  .catch((e) => { console.error('FATAL:', e); exitCode = 1 })
  .finally(() => { stopDevServer(); process.exit(exitCode) })
