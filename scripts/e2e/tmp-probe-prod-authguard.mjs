// 對照探針：prod 登入後，/notebook 與 /float/note 整頁載入誰卡在 AuthGuard。
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
const page = await (await browser.newContext({ locale: 'zh-TW', viewport: { width: 900, height: 700 } })).newPage()
page.setDefaultTimeout(90000)
page.setDefaultNavigationTimeout(150000)
const consoleLines = []
page.on('console', (m) => { if (m.type() !== 'debug') consoleLines.push(`[${m.type()}] ${m.text().slice(0, 160)}`) })
page.on('pageerror', (e) => consoleLines.push('[pageerror] ' + String(e).slice(0, 200)))

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('#email').waitFor(); await sleep(1500)
await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
await page.locator('button[type="submit"]').click()
for (let i = 0; i < 60; i++) { await sleep(1000); if (!(await page.evaluate(() => location.pathname)).includes('/login')) break }
console.log('LOGIN →', await page.evaluate(() => location.pathname))
await sleep(4000)
console.log('AUTH TOKEN?', await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-')).join(',') || '(none)'))

for (const route of ['/notebook', '/float/note']) {
  consoleLines.length = 0
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
  let state = 'loading'
  for (let i = 0; i < 60; i++) {
    await sleep(1000)
    const body = await page.locator('body').innerText().catch(() => '')
    if (!/載入中/.test(body) && body.trim()) { state = 'ready@' + (i + 1) + 's'; break }
  }
  const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 120).replace(/\n/g, ' / ')
  console.log(`ROUTE ${route} → ${state}`)
  console.log(`  body: ${body}`)
  console.log(`  console: ${consoleLines.slice(0, 6).join(' ;; ') || '(quiet)'}`)
}
await browser.close()
process.exit(0)
