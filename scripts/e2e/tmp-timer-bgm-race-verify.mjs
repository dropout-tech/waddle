#!/usr/bin/env node
/**
 * Focus BGM cold-start/race regression.
 *
 * Delays the full-file fetch used by decodeAudioData while allowing the
 * browser's media stream through. Proves two things in one short run:
 *  1. music becomes active before the delayed decode finishes;
 *  2. ending the session invalidates that pending decode, so it cannot start
 *     a stale source after the UI has returned to idle.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const PORT = 3107
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL
const BASE_URL = EXTERNAL_BASE_URL || `http://localhost:${PORT}`
const DECODE_DELAY_MS = 7000

function loadEnv(filePath) {
  if (!existsSync(filePath)) return {}
  return Object.fromEntries(readFileSync(filePath, 'utf8').split('\n').flatMap((raw) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return []
    const at = line.indexOf('=')
    if (at < 0) return []
    const key = line.slice(0, at).trim()
    let value = line.slice(at + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    return [[key, value]]
  }))
}

const env = loadEnv(path.join(process.cwd(), '.env.e2e.local'))
const email = process.env.E2E_EMAIL || env.E2E_EMAIL
const password = process.env.E2E_PASSWORD || env.E2E_PASSWORD
if (!email || !password) throw new Error('Missing E2E_EMAIL/E2E_PASSWORD')

let server
if (!EXTERNAL_BASE_URL) {
  server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (data) => process.stdout.write(`[next] ${data}`))
  server.stderr.on('data', (data) => process.stderr.write(`[next] ${data}`))
}

function stopServer() {
  if (!server) return
  try { process.kill(-server.pid, 'SIGTERM') } catch { try { server.kill('SIGTERM') } catch {} }
}

async function waitForServer() {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL)
      if (response.status < 500) return
    } catch {}
    await sleep(300)
  }
  throw new Error('Dev server did not become ready')
}

async function poll(page, predicate, label, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await page.evaluate(() => {
      const debug = window.__waddleTimerDebug
      return debug ? { playing: debug.isBgmPlaying(), active: debug.musicActive() } : null
    })
    if (last && predicate(last)) return last
    await sleep(100)
  }
  throw new Error(`${label}; last=${JSON.stringify(last)}`)
}

let browser
try {
  if (!EXTERNAL_BASE_URL) await waitForServer()
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript(() => window.localStorage.setItem('waddle-language-v1', 'zh-TW'))
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  let delayedFetches = 0
  await page.route('**/audio/music/relax.mp3', async (route) => {
    if (route.request().resourceType() === 'fetch') {
      delayedFetches += 1
      await sleep(DECODE_DELAY_MS)
    }
    await route.continue()
  })

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(
    (url) => url.origin === new URL(BASE_URL).origin && url.pathname === '/',
    { waitUntil: 'domcontentloaded', timeout: 60000 },
  )
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 60000 })

  await page.locator('[data-tour="focus-timer"]').click()
  await page.getByRole('button', { name: '自訂', exact: true }).click()
  await page.getByRole('spinbutton').first().fill('1')
  const more = page.getByRole('button', { name: /更多/ })
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click()
  const bgm = page.getByRole('button', { name: /背景音 \/ 環境音/ })
  if ((await bgm.getAttribute('aria-expanded')) !== 'true') await bgm.click()
  await page.getByRole('button', { name: /放鬆/ }).first().click()
  if ((await more.getAttribute('aria-expanded')) === 'true') await more.click()

  const startedAt = Date.now()
  await page.getByRole('button', { name: '開始專注', exact: true }).click()
  const mini = page.getByRole('region', { name: /專注計時迷你顯示/ })
  await mini.waitFor({ state: 'visible', timeout: 5000 })
  await poll(page, (audio) => audio.playing && audio.active, '音樂未在解碼完成前啟動', 2000)
  const startupMs = Date.now() - startedAt
  if (delayedFetches < 1) throw new Error('沒有截到延遲的解碼 fetch')
  if (startupMs >= DECODE_DELAY_MS) throw new Error(`啟動等到完整解碼才播放: ${startupMs}ms`)
  console.log(`PASS immediate-stream startup=${startupMs}ms decodeDelay=${DECODE_DELAY_MS}ms`)

  const stop = mini.getByLabel(/長按結束/)
  const box = await stop.boundingBox()
  if (!box) throw new Error('找不到結束按鈕')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await sleep(850)
  await page.mouse.up()
  await page.getByRole('button', { name: '開始專注', exact: true }).waitFor({ state: 'visible', timeout: 8000 })

  // Wait beyond the intentionally delayed decode. A stale async start would
  // become active here on the old implementation.
  await sleep(DECODE_DELAY_MS + 800)
  const stopped = await poll(page, (audio) => !audio.playing && !audio.active, '結束後舊解碼又重新播放', 2000)
  console.log(`PASS stale-start cancelled audio=${JSON.stringify(stopped)}`)
  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(' | ')}`)
} finally {
  await browser?.close()
  stopServer()
}
