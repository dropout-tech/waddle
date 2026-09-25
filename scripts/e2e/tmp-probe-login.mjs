import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
const PORT = 3107
const dev = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], { cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
let devLog = ''
dev.stdout.on('data', d => { devLog += d })
dev.stderr.on('data', d => { devLog += d })
const start = Date.now()
while (Date.now() - start < 90000) { try { const r = await fetch(`http://localhost:${PORT}`); if (r.status < 500) break } catch {} ; await sleep(500) }
const browser = await chromium.launch()
const page = await browser.newPage()
page.on('pageerror', e => console.log('[pageerror]', e.message))
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)) })
await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded' })
await sleep(8000)
console.log('URL now:', page.url())
const buttons = await page.locator('button').allInnerTexts()
console.log('BUTTONS:', JSON.stringify(buttons))
const text = (await page.evaluate(() => document.body.innerText)).slice(0, 400)
console.log('BODY:', text.replace(/\n/g, ' | '))
await page.screenshot({ path: process.env.SCRATCH + '/probe-login.png' })
console.log('devLog tail:', devLog.slice(-500))
await browser.close()
try { process.kill(-dev.pid, 'SIGTERM') } catch {}
process.exit(0)
