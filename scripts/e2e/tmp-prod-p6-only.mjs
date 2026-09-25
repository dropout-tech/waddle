// P6 單項重驗（乾淨 session）：正式站記事本彈窗開著時，計時膠囊仍在最上層。
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
const browser = await chromium.launch()
const page = await (await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })).newPage()
page.setDefaultTimeout(60000)
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('#email').waitFor(); await sleep(1500)
await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
await page.locator('button[type="submit"]').click()
for (let i = 0; i < 60; i++) { await sleep(1000); if (!(await page.evaluate(() => location.pathname)).includes('/login')) break }
await sleep(6000)
await page.locator('[data-tour="focus-timer"]').first().click()
await sleep(1500)
await page.getByRole('button', { name: /開始專注|Start focusing/ }).first().click()
await sleep(2500)
await page.locator('[data-tour="notebook-entry"]').first().click()
await sleep(3000)
const hit = await page.evaluate(() => {
  const dialog = document.querySelector('.z-modal')
  const pill = document.querySelector('[aria-label="專注計時迷你顯示"]')
  if (!pill) return { dialog: !!dialog, pill: false }
  const r = pill.getBoundingClientRect()
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return { dialog: !!dialog, pill: true, hitInPill: pill.contains(el) }
})
const ok = hit.dialog && hit.pill && hit.hitInPill === true
console.log(`${ok ? 'PASS' : 'FAIL'} P6 記事本彈窗開著時膠囊仍在最上層 — ${JSON.stringify(hit)}`)
// 收乾淨：關彈窗、長按結束計時（<1 分鐘不落日曆）
await page.keyboard.press('Escape'); await sleep(800)
const stop = page.locator('button[aria-label^="長按結束"]').first()
const b = await stop.boundingBox()
if (b) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(1000); await page.mouse.up() }
await sleep(4000)
const leftover = await page.locator('[aria-label="專注計時迷你顯示"]').count()
console.log(`${leftover === 0 ? 'PASS' : 'FAIL'} 計時已結束收乾淨 — 膠囊剩 ${leftover}`)
console.log(`${errs.length === 0 ? 'PASS' : 'FAIL'} 零 pageerror — ${errs.slice(0, 2).join(' | ')}`)
await browser.close()
process.exit(ok && leftover === 0 && errs.length === 0 ? 0 : 1)
