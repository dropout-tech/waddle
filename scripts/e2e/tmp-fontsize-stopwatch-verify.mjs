#!/usr/bin/env node
/**
 * 字級設定 ＋ 懸浮工作站正計時 — 2026-08-24。
 *
 * F 系列（字級，設定頁 → 全站 rem 縮放 → 懸浮視窗跟進）：
 *  F1 設定頁一般分頁有「字級」四顆選項
 *  F2 點「大」→ <html> font-size 112.5%，實際文字 computed 尺寸變大
 *  F3 重新整理後仍生效（localStorage 持久）
 *  F4 懸浮工作站的 document 也鏡射到同一字級
 *  F5 English 模式字級區塊無殘留中文
 *  （結尾還原「標準」並驗證）
 *
 * S 系列（正計時）：
 *  S1 工作站快速開始有「正計時」
 *  S2 點了之後時間**往上**數（0:02 → 0:05 之類）
 *  S3 主視窗膠囊同步出現
 *  S4 長按結束 → 回快速開始
 *
 * DB 寫入：無（字級是 localStorage；正計時 <1 分鐘不落日曆）。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3181
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

let passed = 0, failed = 0
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const CJK = /[一-鿿]/
const toSec = (s) => {
  const parts = (s ?? '').split(':').map(Number)
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + (parts[1] || 0)
}

const pageErrors = []
let browser
const server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true,
})
server.stdout.on('data', () => {}); server.stderr.on('data', () => {})

async function waitServer() {
  for (let i = 0; i < 180; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready')
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

const htmlFontSize = (page) => page.evaluate(() => document.documentElement.style.fontSize || '(default)')
const sampleTextPx = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-tour="notebook-entry"]')
  return el ? parseFloat(getComputedStyle(el).fontSize) : null
})

try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })
  ctx.setDefaultNavigationTimeout(180000)
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await login(page)
  await sleep(5000)

  // ── F1/F2：設定頁字級 ──
  const basePx = await sampleTextPx(page)
  await page.locator('button[aria-label="設定"]').first().click()
  await sleep(1500)
  const options = page.locator('[data-font-size-option]')
  check('F1 設定頁有字級四顆選項', (await options.count()) === 4, `count=${await options.count()}`)

  await page.locator('[data-font-size-option="lg"]').click()
  await sleep(800)
  const afterHtml = await htmlFontSize(page)
  const afterPx = await sampleTextPx(page)
  check('F2 點「大」→ html 112.5%、實際文字放大',
    afterHtml === '112.5%' && basePx != null && afterPx != null && afterPx > basePx * 1.05,
    `html=${afterHtml} text ${basePx}px → ${afterPx}px`)

  // 關掉設定（Escape），重整驗持久
  await page.keyboard.press('Escape')
  await sleep(800)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(6000)
  check('F3 重新整理後字級仍生效', (await htmlFontSize(page)) === '112.5%', `html=${await htmlFontSize(page)}`)

  // ── F4：懸浮工作站鏡射字級 ──
  await page.locator('[data-hub-launcher]').first().click()
  await sleep(2000)
  const pipFont = await page.evaluate(() =>
    window.documentPictureInPicture?.window?.document.documentElement.style.fontSize ?? null)
  check('F4 懸浮視窗的字級同步為 112.5%', pipFont === '112.5%', `pip=${pipFont}`)
  await page.evaluate(() => window.documentPictureInPicture?.window?.close())
  await sleep(800)

  // ── F5：English 模式無殘留中文 ──
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(6000)
  await page.locator('button[aria-label="Settings"], button[aria-label="設定"]').first().click()
  await sleep(1500)
  const sectionText = await page.evaluate(() => {
    const opt = document.querySelector('[data-font-size-option]')
    return opt?.closest('div.space-y-3')?.textContent ?? ''
  })
  check('F5 英文模式字級區塊無殘留中文', sectionText.length > 0 && !CJK.test(sectionText), `text="${sectionText.slice(0, 80)}"`)

  // 還原：標準＋中文
  await page.locator('[data-font-size-option="md"]').click()
  await sleep(500)
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))
  await page.keyboard.press('Escape')
  await sleep(500)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(6000)
  check('F6 還原標準字級', (await htmlFontSize(page)) === '(default)', `html=${await htmlFontSize(page)}`)

  // ── S 系列：懸浮工作站正計時 ──
  await page.locator('[data-hub-launcher]').first().click()
  await sleep(2000)
  const readHub = () => page.evaluate(() => {
    const w = window.documentPictureInPicture?.window
    if (!w) return null
    const card = w.document.querySelector('[data-floating-timer]')
    return {
      stopwatchBtn: !!w.document.querySelector('[data-hub-idle-stopwatch]'),
      presets: w.document.querySelectorAll('[data-hub-idle-preset]').length,
      time: card?.querySelector('span.font-mono')?.textContent ?? null,
      hasCard: !!card,
    }
  })
  let h = await readHub()
  check('S1 快速開始有「正計時」按鈕', !!h?.stopwatchBtn && h.presets === 5, JSON.stringify(h))

  await page.evaluate(() => {
    window.documentPictureInPicture?.window?.document.querySelector('[data-hub-idle-stopwatch]')?.click()
  })
  await sleep(2500)
  h = await readHub()
  const t1 = h?.time
  await sleep(3200)
  h = await readHub()
  const t2 = h?.time
  check('S2 正計時往上數', !!t1 && !!t2 && toSec(t2) > toSec(t1), `${t1} → ${t2}`)

  const pill = await page.locator('[aria-label="專注計時迷你顯示"]').count()
  check('S3 主視窗膠囊同步出現', pill > 0, `pill=${pill}`)

  // 長按結束（工作站內 pointer 事件）
  await page.evaluate(() => {
    const w = window.documentPictureInPicture?.window
    w?.document.querySelector('[data-floating-timer] button[aria-label^="長按結束"]')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  })
  await sleep(1000)
  await page.evaluate(() => {
    const w = window.documentPictureInPicture?.window
    w?.document.querySelector('[data-floating-timer] button[aria-label^="長按結束"]')
      ?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
  await sleep(4000)
  h = await readHub()
  check('S4 長按結束 → 回快速開始', !!h && !h.hasCard && h.presets === 5, JSON.stringify(h))
  await page.evaluate(() => window.documentPictureInPicture?.window?.close())

  check('零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (err) {
  failed++
  console.log('FAIL 執行錯誤 — ' + (err?.stack || err))
} finally {
  await browser?.close().catch(() => {})
  try { process.kill(-server.pid, 'SIGKILL') } catch {}
  console.log(`\n=== ${passed} passed / ${failed} failed ===`)
  process.exit(failed === 0 ? 0 : 1)
}
