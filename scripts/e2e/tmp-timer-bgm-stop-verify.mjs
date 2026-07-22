#!/usr/bin/env node
/**
 * Verifies the focus-timer BGM lifecycle fix. Not committed (tmp- prefix,
 * same convention as tmp-timer-crossroute-verify.mjs).
 *
 * What it proves:
 *  1. 白噪音 UI 健在且可用 — 4 ambient chips (雨聲/火焰/海浪/咖啡廳) render
 *     enabled in the idle setup card, and the immersive BgmBar exposes the
 *     same section mid-session.
 *  2. THE BUG (中斷不停音): idle preview latches bgmManualPlaying on, then a
 *     session is started and manually stopped — after the wind-down the
 *     engine must be fully stopped (music node gone, ambient <audio> paused).
 *     On the pre-fix code this exact assertion fails (music plays forever).
 *  3. In-session mute button actually mutes/unmutes now (old code: no-op).
 *  4. 結束 (natural completion) path: work → auto-break keeps music playing,
 *     break's natural completion lands idle and everything goes silent.
 *
 * Run: node scripts/e2e/tmp-timer-bgm-stop-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3103
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL
const BASE_URL = EXTERNAL_BASE_URL || `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-13-timer-bgm-fix-shots')
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
  console.error('[bgm-verify] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
  process.exit(1)
}

let devServer
let exitCode = 0
const results = []
const pageErrors = []

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
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
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

function parseClock(text) {
  const m = text.match(/(\d{1,2}):(\d{2}):(\d{2})|(\d{1,2}):(\d{2})/)
  if (!m) throw new Error(`no clock found in "${text}"`)
  if (m[1] !== undefined) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
  return (+m[4]) * 60 + (+m[5])
}

async function main() {
  if (!EXTERNAL_BASE_URL) {
    startDevServer()
    await waitForServerReady()
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (err) => { pageErrors.push(err.message); console.log(`[pageerror] ${err.message}`) })

  const miniPill = () => page.getByRole('region', { name: /專注計時迷你顯示|休息計時迷你顯示/ })
  const idleCollapsedBtn = () => page.locator('[data-tour="focus-timer"]')
  const startBtn = () => page.getByRole('button', { name: '開始專注', exact: true })
  const immersive = () => page.getByRole('dialog', { name: /專注計時中|休息計時中/ })

  // Audio-engine truth, via the test-only debug hook on window.
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
  const pollAudio = async (predicate, label, timeoutMs = 12000) => {
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

  await step('login', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
  })

  await step('白噪音 UI：閒置卡 4 個環境音選項可見且可用', async () => {
    await idleCollapsedBtn().click()
    await page.getByRole('button', { name: '自訂', exact: true }).click()
    await page.getByRole('spinbutton').first().fill('1')
    await page.getByPlaceholder('在專注什麼？（選填）').fill('BGMFIX-A')
    await openMoreIfClosed()
    const autoBreakToggle = page.getByRole('button', { name: '完成後自動進入休息' })
    await autoBreakToggle.waitFor({ state: 'visible' })
    if ((await autoBreakToggle.getAttribute('aria-pressed')) === 'true') await autoBreakToggle.click()
    await openBgmSectionIfClosed()
    for (const label of ['雨聲', '火焰', '海浪', '咖啡廳']) {
      const chip = page.getByRole('button', { name: new RegExp(label) }).first()
      await chip.waitFor({ state: 'visible', timeout: 5000 })
      if (!(await chip.isEnabled())) throw new Error(`${label} chip is disabled (unavailable src?)`)
    }
    await page.screenshot({ path: path.join(SHOT_DIR, '01-idle-card-ambient-ui.png') })
  })

  await step('選放鬆音樂＋雨聲，閒置預覽播放（這一步會把舊 bug 的旗標閂上）', async () => {
    await page.getByRole('button', { name: /放鬆/ }).first().click()
    await page.getByRole('button', { name: /雨聲/ }).first().click()
    await page.locator('button[title="播放"]').click()
    const a = await pollAudio(
      (s) => s.playing && s.ctx === 'running' && s.musicActive && s.rain && s.rain.paused === false,
      '預覽播放後（音樂節點＋雨聲 audio 元素都要真的動起來）',
    )
    console.log(`   audio=${JSON.stringify(a)}`)
  })

  await step('開始專注（1 分鐘）→ 音樂與雨聲持續', async () => {
    await closeMoreIfOpen()
    await startBtn().click()
    await miniPill().waitFor({ state: 'visible', timeout: 5000 })
    await pollAudio(
      (s) => s.playing && s.musicActive && s.rain && s.rain.paused === false,
      '開始後應持續播放',
    )
  })

  await step('【主 bug】長按中斷 → 溫柔收尾後音樂與雨聲必須完全停止', async () => {
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

  await step('沉浸畫面：BgmBar 有環境音區塊（截圖存證）', async () => {
    if (await idleCollapsedBtn().isVisible().catch(() => false)) await idleCollapsedBtn().click()
    await page.getByPlaceholder('在專注什麼？（選填）').fill('BGMFIX-B')
    await startBtn().click()
    await miniPill().waitFor({ state: 'visible', timeout: 5000 })
    await miniPill().getByLabel('展開為全畫面').click()
    await immersive().waitFor({ state: 'visible', timeout: 5000 })
    // Expand the BGM pill (the summary button with the chevron-up icon).
    await immersive().locator('button:has(svg.lucide-chevron-up)').first().click()
    await immersive().getByText('環境音（可疊加）').waitFor({ state: 'visible', timeout: 5000 })
    await page.screenshot({ path: path.join(SHOT_DIR, '03-immersive-bgmbar-ambient.png') })
  })

  await step('沉浸畫面播放鍵：按下真的靜音（計時不受影響），再按恢復', async () => {
    await pollAudio((s) => s.playing && s.rain && s.rain.paused === false, '靜音前應在播放')
    const toggle = immersive().locator('button[aria-pressed]').first()
    await toggle.click()
    await pollAudio(
      (s) => s.playing === false && s.musicActive === false,
      '按下播放鍵後應靜音（舊版這顆按鈕是空殼）',
    )
    const timeEl = immersive().locator('span').filter({ hasText: /^\d{1,2}:\d{2}(:\d{2})?$/ }).first()
    const t0 = parseClock(await timeEl.innerText())
    await sleep(2500)
    const t1 = parseClock(await timeEl.innerText())
    if (!(t1 < t0)) throw new Error(`靜音期間計時應繼續：t0=${t0}s t1=${t1}s`)
    await toggle.click()
    await pollAudio((s) => s.playing === true, '再按一次應恢復播放')
  })

  await step('沉浸畫面長按結束 → 靜音收尾、回到閒置', async () => {
    const exitBtn = immersive().getByLabel(/長按結束/)
    const box = await exitBtn.boundingBox()
    if (!box) throw new Error('immersive exit button not found')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await sleep(1100)
    await page.mouse.up()
    // The immersive exit handler also collapses the setup card
    // (setIsExpanded(false)), so idle here = the collapsed pill, not the
    // expanded card's 開始專注 button.
    await idleCollapsedBtn().or(startBtn()).first().waitFor({ state: 'visible', timeout: 8000 })
    await pollAudio(
      (s) => s.playing === false && s.musicActive === false && s.rain && s.rain.paused === true,
      '結束後全部靜音',
    )
  })

  await step('自然完成：工作 1 分 → 自動休息期間音樂持續', async () => {
    if (await idleCollapsedBtn().isVisible().catch(() => false)) await idleCollapsedBtn().click()
    await page.getByPlaceholder('在專注什麼？（選填）').fill('BGMFIX-C')
    await openMoreIfClosed()
    const autoBreakToggle = page.getByRole('button', { name: '完成後自動進入休息' })
    if ((await autoBreakToggle.getAttribute('aria-pressed')) !== 'true') await autoBreakToggle.click()
    await page.locator('#timer-break-mins').fill('1')
    await closeMoreIfOpen()
    await startBtn().click()
    await miniPill().waitFor({ state: 'visible', timeout: 5000 })
    await sleep(65000) // 60s work + completion hold + margin
    await page.getByRole('region', { name: '休息計時迷你顯示' }).waitFor({ state: 'visible', timeout: 10000 })
    const a = await pollAudio(
      (s) => s.playing === true && s.rain && s.rain.paused === false,
      '自動休息期間 BGM 應延續（completed→break 交接不斷音）',
    )
    console.log(`   audio=${JSON.stringify(a)}`)
  })

  await step('休息自然結束 → 回到閒置，全部靜音（「結束不停音」的另一半）', async () => {
    await sleep(65000) // 60s break + completion hold + fade + margin
    await startBtn().waitFor({ state: 'visible', timeout: 15000 })
    const a = await pollAudio(
      (s) => s.playing === false && s.musicActive === false && s.rain && s.rain.paused === true,
      '休息結束後全部靜音',
    )
    console.log(`   audio=${JSON.stringify(a)}`)
    await page.screenshot({ path: path.join(SHOT_DIR, '04-after-natural-completion-idle.png') })
  })

  await step('全程無 page error', async () => {
    if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join(' | ')}`)
  })

  await browser.close()
  writeFileSync(path.join(SHOT_DIR, 'results.json'), JSON.stringify({ when: new Date().toISOString(), results }, null, 2))
  console.log('')
  console.log(`${results.filter(r => r.passed).length}/${results.length} steps passed`)
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
