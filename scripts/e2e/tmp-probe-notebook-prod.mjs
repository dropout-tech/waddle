// Read-only probe: does prod /notebook show the same auth "Failed to fetch"
// console error the local smoke hits? Discriminates "pre-existing / PR #14"
// vs "caused by the calendar-sharing branch". No writes to prod data.
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
const PROD = 'https://waddle.zeabur.app'
const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n')
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
const browser = await chromium.launch()
const ctx = await browser.newContext({ locale: 'zh-TW' })
const pg = await ctx.newPage()
const errs = []
pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)) })
await pg.goto(`${PROD}/login`, { waitUntil: 'domcontentloaded' })
await pg.locator('#email').waitFor({ state: 'visible', timeout: 20000 })
await pg.locator('#email').fill(env.E2E_EMAIL)
await pg.locator('#password').fill(env.E2E_PASSWORD)
await pg.getByRole('button', { name: /登入|Log in/ }).first().click()
await pg.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })
await sleep(2000)
errs.length = 0
await pg.goto(`${PROD}/notebook`, { waitUntil: 'domcontentloaded' })
await sleep(6000)
console.log('prod /notebook console errors:', JSON.stringify(errs))
await browser.close()
