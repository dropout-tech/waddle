// 正式站驗收：字級設定＋懸浮工作站正計時（PR #38）。
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = 'https://waddle.zeabur.app'
const env = Object.fromEntries(
  readFileSync(path.join(process.cwd(), '.env.e2e.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
let passed = 0, failed = 0
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const toSec = (s) => {
  const p = (s ?? '').split(':').map(Number)
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + (p[1] || 0)
}
const errs = []
const browser = await chromium.launch()
try {
  const page = await (await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })).newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => errs.push(String(e)))
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor(); await sleep(1500)
  await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  for (let i = 0; i < 60; i++) { await sleep(1000); if (!(await page.evaluate(() => location.pathname)).includes('/login')) break }
  await sleep(6000)

  // 字級：設定頁四顆 → 點「大」→ html 112.5% → 重整持久 → 還原
  await page.locator('button[aria-label="設定"]').first().click()
  await sleep(1500)
  check('P1 設定頁有字級選項', (await page.locator('[data-font-size-option]').count()) === 4)
  await page.locator('[data-font-size-option="lg"]').click()
  await sleep(800)
  const html1 = await page.evaluate(() => document.documentElement.style.fontSize)
  check('P2 點「大」→ html 112.5%', html1 === '112.5%', `html=${html1}`)
  await page.keyboard.press('Escape'); await sleep(600)
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000)
  const html2 = await page.evaluate(() => document.documentElement.style.fontSize)
  check('P3 重整後仍 112.5%', html2 === '112.5%', `html=${html2}`)
  // 懸浮視窗同步
  await page.locator('[data-hub-launcher]').first().click()
  await sleep(2000)
  const pipFont = await page.evaluate(() =>
    window.documentPictureInPicture?.window?.document.documentElement.style.fontSize ?? null)
  check('P4 懸浮視窗字級同步', pipFont === '112.5%', `pip=${pipFont}`)

  // 正計時：工作站快速開始
  const sw = await page.evaluate(() =>
    !!window.documentPictureInPicture?.window?.document.querySelector('[data-hub-idle-stopwatch]'))
  check('P5 快速開始有正計時', sw === true)
  await page.evaluate(() => {
    window.documentPictureInPicture?.window?.document.querySelector('[data-hub-idle-stopwatch]')?.click()
  })
  await sleep(2500)
  const readTime = () => page.evaluate(() =>
    window.documentPictureInPicture?.window?.document
      .querySelector('[data-floating-timer] span.font-mono')?.textContent ?? null)
  const t1 = await readTime()
  await sleep(3200)
  const t2 = await readTime()
  check('P6 正計時往上數', !!t1 && !!t2 && toSec(t2) > toSec(t1), `${t1} → ${t2}`)

  // 收乾淨：長按結束、字級還原標準
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
  await page.evaluate(() => window.documentPictureInPicture?.window?.close())
  await sleep(600)
  await page.locator('button[aria-label="設定"]').first().click()
  await sleep(1500)
  await page.locator('[data-font-size-option="md"]').click()
  await sleep(600)
  const htmlBack = await page.evaluate(() => document.documentElement.style.fontSize || '(default)')
  check('P7 已還原標準字級', htmlBack === '(default)', `html=${htmlBack}`)
  check('P8 零 pageerror', errs.length === 0, errs.slice(0, 2).join(' | '))
} catch (e) {
  failed++
  console.log('FAIL 執行錯誤 — ' + (e?.stack || e))
} finally {
  await browser.close().catch(() => {})
  console.log(`=== ${passed} passed / ${failed} failed ===`)
  process.exit(failed === 0 ? 0 : 1)
}
