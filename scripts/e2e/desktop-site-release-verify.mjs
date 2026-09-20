/* eslint-disable no-console -- executable release regression */
// Real email authentication only. All application REST traffic is mocked;
// PKCE exchange requests are blocked and treated as failures on relay pages.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const base = process.env.E2E_BASE_URL || 'http://localhost:3186'
const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n')
  .filter(line => line.includes('=') && !line.startsWith('#'))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const shots = '/tmp/huddle-release-shots'
mkdirSync(shots, { recursive: true })
let passes = 0
const check = (label, condition) => { assert.ok(condition, label); console.log('PASS', label); passes++ }
const workspaceId = '00000000-0000-4000-8000-000000000001'
const categoryId = '00000000-0000-4000-8000-000000000002'
const fixtures = {
  workspaces: [{ id: workspaceId, name: '發佈回歸工作區', color: '#63a995', icon: '📋', sort_order: 0, is_archived: false, is_default: true }],
  categories: [{ id: categoryId, workspace_id: workspaceId, name: '發佈回歸分類', sort_order: 0, is_collapsed: false, is_archived: false, is_default: true }],
  tasks: [{ id: '00000000-0000-4000-8000-000000000003', workspace_id: workspaceId, category_id: categoryId, title: '既有任務保持可見', task_type: 'task', urgency: 3, sort_order: 0, is_completed: false, is_archived: false, is_recurring: false, show_in_task_list: true, calendar_color: '#63a995', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
}
const browser = await chromium.launch()
const context = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
const page = await context.newPage()
const writes = [], exchanges = [], errors = []
page.on('pageerror', error => errors.push(error.message))
await context.route('**/rest/v1/**', async route => {
  const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').pop()
  if (url.pathname.endsWith('/rpc/get_share_peers')) return route.fulfill({ json: [] })
  if (request.method() !== 'GET') {
    writes.push({ table, method: request.method() })
    return route.fulfill({ json: [] })
  }
  if (table === 'user_settings') return route.fulfill({ contentType: 'application/json', body: 'null' })
  return route.fulfill({ json: fixtures[table] || [] })
})
await context.route('**/auth/v1/token**', async route => {
  const url = new URL(route.request().url())
  if (url.searchParams.get('grant_type') === 'password') return route.continue()
  exchanges.push(url.searchParams.get('grant_type'))
  return route.fulfill({ status: 400, json: { error: 'blocked_test_exchange' } })
})
const visit = path => page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 })
const hero = () => page.getByRole('heading', { level: 1, name: '讓每一天，有地方安放。' })
try {
  await visit('/about')
  await hero().waitFor()
  check('About page exposes the full product introduction', await hero().isVisible())
  const pricing = page.locator('#pricing')
  check('Pricing displays NT$149 monthly and NT$1,290 yearly', /NT\$149/.test(await pricing.innerText()) && /NT\$1,290/.test(await pricing.innerText()))
  check('Pricing explicitly says subscriptions are not yet available', (await pricing.innerText()).includes('尚未開放購買'))
  const pro = pricing.locator('article').filter({ has: page.getByRole('heading', { name: 'Pro 準備中' }) })
  check('Pro has no active purchase control', await pro.count() === 1 && await pro.locator('a,button').count() === 0)
  for (const [label, arch] of [['Mac · Apple Silicon', 'arm64'], ['Mac · Intel', 'x64']]) {
    check(`${arch} download points to the exact beta release`, await page.getByRole('link', { name: label, exact: true }).getAttribute('href') === `https://github.com/dropout-tech/waddle/releases/download/v0.1.1-beta.1/Huddle-0.1.1-mac-${arch}.dmg`)
  }
  check('Release notes point to v0.1.1-beta.1', await page.getByRole('link', { name: '版本紀錄與安裝說明', exact: true }).getAttribute('href') === 'https://github.com/dropout-tech/waddle/releases/tag/v0.1.1-beta.1')
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const path of ['/about', '/privacy']) {
      await visit(path)
      await page.locator('h1').waitFor()
      await page.evaluate(() => document.fonts.ready)
      check(`${path} has no horizontal overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: `${shots}/${path.slice(1)}-${width}.png`, fullPage: true })
    }
  }
  check('Privacy page explains account data and subscriptions', await page.getByRole('heading', { level: 1, name: '資料與隱私說明' }).isVisible() && (await page.locator('main').innerText()).includes('尚未開放購買'))
  await visit('/')
  await hero().waitFor()
  await sleep(300)
  check('Guest root stays on the marketing page', new URL(page.url()).pathname === '/' && await hero().isVisible())
  const state = 'a'.repeat(64)
  await visit(`/auth/callback?desktop=1&desktop_state=${state}&code=fake`)
  const open = page.getByRole('link', { name: '開啟 Huddle', exact: true })
  await open.waitFor()
  const relay = new URL(await open.getAttribute('href'))
  check('Desktop relay contains only the authorization code and matching state', relay.protocol === 'huddle-desktop:' && relay.hostname === 'auth' && relay.pathname === '/callback' && relay.searchParams.get('code') === 'fake' && relay.searchParams.get('state') === state && [...relay.searchParams.keys()].sort().join(',') === 'code,state')
  check('Desktop relay never exposes access or refresh tokens', !/access_token|refresh_token|id_token/.test(relay.href))
  await sleep(300)
  check('External callback does not exchange the desktop PKCE code', exchanges.length === 0)
  await visit('/auth/callback?desktop=1&desktop_state=invalid&code=fake')
  await page.getByRole('heading', { name: '登入連結已失效' }).waitFor()
  check('Invalid desktop state is rejected without a launch link', await page.getByRole('link', { name: '開啟 Huddle', exact: true }).count() === 0 && exchanges.length === 0)
  await visit('/login')
  await page.locator('#email').fill(env.E2E_EMAIL)
  await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type=submit]').click()
  await page.waitForURL(url => url.pathname === '/', { timeout: 60000, waitUntil: 'domcontentloaded' })
  await page.getByText('既有任務保持可見', { exact: true }).first().waitFor({ timeout: 20000 })
  check('Email login retains the authenticated task workspace', await page.getByText('既有任務保持可見', { exact: true }).first().isVisible() && await hero().count() === 0)
  await page.screenshot({ path: `${shots}/authenticated-workspace.png`, fullPage: true })
  await visit('/about')
  await hero().waitFor()
  check('Authenticated users can still visit the public product site', await hero().isVisible())
  check('Release verification performs no application data writes', writes.length === 0)
  check('Release verification produces no uncaught runtime errors', errors.length === 0)
  console.log(`Desktop/site release verification: ${passes} checks passed (${base}). All REST requests mocked. Screenshots: ${shots}`)
} finally {
  await context.close()
  await browser.close()
}
