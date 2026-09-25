// 清掉 hub 測試第一輪中斷時留下的空筆記（無標題、無內容才刪，其他不碰）。
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3179
const BASE = `http://localhost:${PORT}`
const env = Object.fromEntries(
  readFileSync(path.join(process.cwd(), '.env.e2e.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
server.stdout.on('data', () => {}); server.stderr.on('data', () => {})
for (let i = 0; i < 180; i++) { try { if ((await fetch(`${BASE}/login`)).ok) break } catch {} await sleep(1000) }
const browser = await chromium.launch()
const page = await (await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })).newPage()
page.setDefaultTimeout(60000)
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('#email').waitFor(); await sleep(1500)
await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
await page.locator('button[type="submit"]').click()
for (let i = 0; i < 60; i++) { await sleep(1000); if (!(await page.evaluate(() => location.pathname)).includes('/login')) break }
await page.goto(`${BASE}/notebook`, { waitUntil: 'domcontentloaded' })
await sleep(7000)
const rows = await page.locator('button[aria-label="拖曳排序或移到其他分類"]').count()
console.log('筆記列數:', rows)
// 只在「唯一一則且標題是無標題」時刪——其他情況不動，避免誤刪真資料。
const untitled = await page.getByText('無標題', { exact: true }).count()
if (rows === 1 && untitled > 0) {
  await page.locator('button[aria-label="刪除記事"]').first().click()
  await sleep(500)
  await page.getByRole('button', { name: '刪除', exact: true }).first().click()
  await sleep(2500)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(6000)
  console.log('刪除後剩餘:', await page.locator('button[aria-label="拖曳排序或移到其他分類"]').count())
} else {
  console.log('不符合安全刪除條件（rows=' + rows + ', untitled=' + untitled + '），未動')
}
await browser.close()
try { process.kill(-server.pid, 'SIGKILL') } catch {}
process.exit(0)
