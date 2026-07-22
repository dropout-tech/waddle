#!/usr/bin/env node
/**
 * Production regression for the timer-BGM fix (PR #9). Trimmed from
 * tmp-timer-bgm-stop-verify.mjs: skips the two 60s natural-completion
 * scenarios so every session is stopped in seconds — recordSessionToCalendar
 * skips blocks under 1 minute, so this run writes NOTHING to the prod DB.
 * (Natural-completion paths were fully verified locally on identical code.)
 *
 * Step 0 polls for the freshly-deployed build first: the new provider
 * exposes __waddleTimerDebug.ambientStates, the old one doesn't — a
 * deterministic deploy fingerprint (Zeabur deploys take 9min+ after merge).
 *
 * Run: node scripts/e2e/tmp-timer-bgm-prod-verify.mjs
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = process.env.E2E_BASE_URL || 'https://waddle.zeabur.app'
const DEPLOY_WAIT_MAX_MS = 25 * 60 * 1000
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-13-timer-bgm-fix-shots/prod')
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
  console.error('[bgm-prod-verify] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
  process.exit(1)
}

let exitCode = 0
const results = []
const pageErrors = []

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

function parseClock(text) {
  const m = text.match(/(\d{1,2}):(\d{2}):(\d{2})|(\d{1,2}):(\d{2})/)
  if (!m) throw new Error(`no clock found in "${text}"`)
  if (m[1] !== undefined) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
  return (+m[4]) * 60 + (+m[5])
}

async function main() {
  const browser = await chromium.launch()

  // ── Step 0: wait until prod serves the NEW build ──
  console.log(`[bgm-prod-verify] waiting for new build on ${BASE_URL} (fingerprint: __waddleTimerDebug.ambientStates)`)
  const started = Date.now()
  let live = false
  while (Date.now() - started < DEPLOY_WAIT_MAX_MS) {
    const ctx = await browser.newContext()
    const probe = await ctx.newPage()
    try {
      // NOT networkidle — the app can hold persistent connections
      // (Supabase), so networkidle may never fire. DOM ready + a settle
      // wait is enough for the provider's mount effect to install the hook.
      await probe.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await sleep(4000)
      const fp = await probe.evaluate(() => typeof window.__waddleTimerDebug?.ambientStates === 'function')
      if (fp) { live = true; await ctx.close(); break }
      console.log(`[bgm-prod-verify] old build still live (${Math.round((Date.now() - started) / 1000)}s elapsed), retry in 60s`)
    } catch (e) {
      console.log(`[bgm-prod-verify] probe error (${e.message}), retry in 60s`)
    }
    await ctx.close()
    await sleep(60000)
  }
  if (!live) {
    console.error('FATAL: new build did not appear within 25min')
    await browser.close()
    process.exit(1)
  }
  console.log(`[bgm-prod-verify] new build detected after ${Math.round((Date.now() - started) / 1000)}s`)

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (err) => { pageErrors.push(err.message); console.log(`[pageerror] ${err.message}`) })

  const miniPill = () => page.getByRole('region', { name: /專注計時迷你顯示|休息計時迷你顯示/ })
  const idleCollapsedBtn = () => page.locator('[data-tour="focus-timer"]')
  const startBtn = () => page.getByRole('button', { name: '開始專注', exact: true })
  const immersive = () => page.getByRole('dialog', { name: /專注計時中|休息計時中/ })

  const audio = () => page.evaluate(() => {
    const d = window.__waddleTimerDebug
    if (!d) return null
    const ambient = d.ambientStates()
    return {
      playing: d.isBgmPlaying(),
      ctx: d.ctxState(),
      musicActive: d.musicActive(),
      rain: ambient.find((a) => a.id === 'rain') ?? null,
    }
  })
  const pollAudio = async (predicate, label, timeoutMs = 15000) => {
    const start = Date.now()
    let last = null
    while (Date.now() - start < timeoutMs) {
      last = await audio()
      if (last && predicate(last)) return last
      await sleep(300)
    }
    throw new Error(`${label} — timed out; last=${JSON.stringify(last)}`)
  }

  const openMoreIfClosed = async () => {
    const moreBtn = page.getByRole('button', { name: /更多/ })
    if ((await moreBtn.getAttribute('aria-expanded')) !== 'true') await moreBtn.click()
  }
  const closeMoreIfOpen = async () => {
    const moreBtn = page.getByRole('button', { name: /更多/ })
    if ((await moreBtn.getAttribute('aria-expanded')) === 'true') await moreBtn.click()
  }
  const openBgmSectionIfClosed = async () => {
    const bgmRow = page.getByRole('button', { name: /背景音 \/ 環境音/ })
    if ((await bgmRow.getAttribute('aria-expanded')) !== 'true') await bgmRow.click()
  }

  await step('login (prod)', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 30000 })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 30000 })
  })

  await step('白噪音 UI：4 個環境音選項可見且可用', async () => {
    await idleCollapsedBtn().click()
    await openMoreIfClosed()
    await openBgmSectionIfClosed()
    for (const label of ['雨聲', '火焰', '海浪', '咖啡廳']) {
      const chip = page.getByRole('button', { name: new RegExp(label) }).first()
      await chip.waitFor({ state: 'visible', timeout: 5000 })
      if (!(await chip.isEnabled())) throw new Error(`${label} chip is disabled (unavailable src?)`)
    }
    await page.screenshot({ path: path.join(SHOT_DIR, '01-idle-card-ambient-ui.png') })
  })

  await step('選放鬆＋雨聲，閒置預覽播放（閂上舊 bug 的旗標）', async () => {
    await page.getByRole('button', { name: /放鬆/ }).first().click()
    await page.getByRole('button', { name: /雨聲/ }).first().click()
    await page.locator('button[title="播放"]').click()
    const a = await pollAudio(
      (s) => s.playing && s.ctx === 'running' && s.musicActive && s.rain && s.rain.paused === false,
      '預覽播放後（音樂節點＋雨聲 audio 元素都真的動起來）',
    )
    console.log(`   audio=${JSON.stringify(a)}`)
  })

  await step('開始專注 → 播放持續', async () => {
    await closeMoreIfOpen()
    await startBtn().click()
    await miniPill().waitFor({ state: 'visible', timeout: 8000 })
    await pollAudio(
      (s) => s.playing && s.musicActive && s.rain && s.rain.paused === false,
      '開始後應持續播放',
    )
  })

  await step('【主 bug】長按中斷 → 音樂與雨聲完全停止', async () => {
    const stopBtn = miniPill().getByLabel(/長按結束/)
    const box = await stopBtn.boundingBox()
    if (!box) throw new Error('stop button not found')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await sleep(800)
    await page.mouse.up()
    await startBtn().waitFor({ state: 'visible', timeout: 8000 })
    const a = await pollAudio(
      (s) => s.playing === false && s.musicActive === false && s.rain && s.rain.paused === true,
      '中斷後引擎停止＋音樂節點釋放＋雨聲暫停',
    )
    console.log(`   audio=${JSON.stringify(a)}`)
    await page.screenshot({ path: path.join(SHOT_DIR, '02-after-manual-stop-idle.png') })
  })

  await step('沉浸畫面：BgmBar 環境音區塊存在', async () => {
    if (await idleCollapsedBtn().isVisible().catch(() => false)) await idleCollapsedBtn().click()
    await startBtn().click()
    await miniPill().waitFor({ state: 'visible', timeout: 8000 })
    await miniPill().getByLabel('展開為全畫面').click()
    await immersive().waitFor({ state: 'visible', timeout: 5000 })
    await immersive().locator('button:has(svg.lucide-chevron-up)').first().click()
    await immersive().getByText('環境音（可疊加）').waitFor({ state: 'visible', timeout: 5000 })
    await page.screenshot({ path: path.join(SHOT_DIR, '03-immersive-bgmbar-ambient.png') })
  })

  await step('沉浸播放鍵：真靜音（計時續跑）、再按恢復', async () => {
    await pollAudio((s) => s.playing && s.rain && s.rain.paused === false, '靜音前應在播放')
    const toggle = immersive().locator('button[aria-pressed]').first()
    await toggle.click()
    await pollAudio(
      (s) => s.playing === false && s.musicActive === false,
      '按下播放鍵後應靜音',
    )
    const timeEl = immersive().locator('span').filter({ hasText: /^\d{1,2}:\d{2}(:\d{2})?$/ }).first()
    const t0 = parseClock(await timeEl.innerText())
    await sleep(2500)
    const t1 = parseClock(await timeEl.innerText())
    if (!(t1 < t0)) throw new Error(`靜音期間計時應繼續：t0=${t0}s t1=${t1}s`)
    await toggle.click()
    await pollAudio((s) => s.playing === true, '再按一次應恢復播放')
  })

  await step('沉浸長按結束 → 靜音收尾、回到閒置', async () => {
    const exitBtn = immersive().getByLabel(/長按結束/)
    const box = await exitBtn.boundingBox()
    if (!box) throw new Error('immersive exit button not found')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await sleep(1100)
    await page.mouse.up()
    await idleCollapsedBtn().or(startBtn()).first().waitFor({ state: 'visible', timeout: 8000 })
    const a = await pollAudio(
      (s) => s.playing === false && s.musicActive === false && s.rain && s.rain.paused === true,
      '結束後全部靜音',
    )
    console.log(`   audio=${JSON.stringify(a)}`)
    await page.screenshot({ path: path.join(SHOT_DIR, '04-after-immersive-exit-idle.png') })
  })

  await step('全程無 page error', async () => {
    if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join(' | ')}`)
  })

  await browser.close()
  writeFileSync(path.join(SHOT_DIR, 'results.json'), JSON.stringify({ when: new Date().toISOString(), baseUrl: BASE_URL, results }, null, 2))
  console.log('')
  console.log(`${results.filter(r => r.passed).length}/${results.length} steps passed`)
}

main()
  .catch((e) => {
    console.error('FATAL:', e)
    exitCode = 1
  })
  .finally(() => {
    process.exit(exitCode)
  })
