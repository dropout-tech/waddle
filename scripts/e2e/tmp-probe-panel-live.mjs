#!/usr/bin/env node
// One-shot behavioral probe: is PR #11's ＋ button live on prod?
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = 'https://waddle.zeabur.app'
const envFile = Object.fromEntries(
  readFileSync(path.join('/Users/lazylazy/Desktop/琢奧科技/v0-task-management-ui', '.env.e2e.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('#email').fill(envFile.E2E_EMAIL)
await page.locator('#password').fill(envFile.E2E_PASSWORD)
await page.getByRole('button', { name: '登入', exact: true }).click()
await page.waitForURL(`${BASE}/`, { timeout: 30000 })
await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 30000 })
await page.waitForTimeout(3000)
const plusCount = await page.locator('button[aria-label*="新增分類"]').count()
const oldBtnCount = await page.locator('button:has-text("新增分類")').count()
console.log(`header-plus-buttons=${plusCount} old-bottom-buttons=${oldBtnCount}`)
console.log(plusCount > 0 && oldBtnCount === 0 ? 'NEW BUILD LIVE' : 'OLD BUILD STILL LIVE')
await browser.close()
