// 正式站驗收：日曆工具列常駐 ⧉（PR #37）。閒置（沒開計時）直接開懸浮工作站。
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

  const launcher = page.locator('[data-hub-launcher]').first()
  check('L1 工具列有常駐 ⧉（新版在跑）', (await launcher.count()) > 0)

  await launcher.click()
  await sleep(2500)
  const hub = await page.evaluate(() => {
    const w = window.documentPictureInPicture?.window
    if (!w) return null
    return {
      tabs: w.document.querySelectorAll('[data-hub-tab]').length,
      presets: w.document.querySelectorAll('[data-hub-idle-preset]').length,
    }
  })
  check('L2 沒開計時也能開工作站（三分頁＋快速開始）', hub?.tabs === 3 && hub?.presets === 5, JSON.stringify(hub))

  await launcher.click()
  await sleep(1200)
  const open = await page.evaluate(() => !!window.documentPictureInPicture?.window)
  check('L3 再按一次收回', open === false, `open=${open}`)
  check('L4 零 pageerror', errs.length === 0, errs.slice(0, 2).join(' | '))
} catch (e) {
  failed++
  console.log('FAIL 執行錯誤 — ' + (e?.stack || e))
} finally {
  await browser.close().catch(() => {})
  console.log(`=== ${passed} passed / ${failed} failed ===`)
  process.exit(failed === 0 ? 0 : 1)
}
