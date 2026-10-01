// Pro-limits UI, real browser (docs/billing/2026-10-01-pro-limits-design.md §3.10).
//
//   node scripts/e2e/pro-limits-ui-verify.mjs
//
// Credentials: E2E_EMAIL / E2E_PASSWORD or .env.e2e.local (same as smoke.mjs).
// READ-ONLY: it signs in, opens /membership and /settings/google-calendar at
// 390px and 1280px, and screenshots them. Nothing is created or changed.
//
// Part A — real backend. `my_plan_usage` is not deployed (or limits are off), so
//   the pages must show NO new UI: no usage meters, no upgrade prompt, no toast.
// Part B — the same pages with `my_plan_usage` answered by an intercepted mock
//   (limits on, free user). The mock never reaches Supabase; it only proves the
//   new UI renders and fits a phone.
//
// Screenshots go to $E2E_SCREENSHOT_DIR or docs/reports/2026-10-01-pro-limits-ui/
// (not committed). Exit code 1 if any check fails.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const PORT = 3197
const BASE_URL = `http://localhost:${PORT}`
const OUT = process.env.E2E_SCREENSHOT_DIR || path.join(process.cwd(), 'docs/reports/2026-10-01-pro-limits-ui')
mkdirSync(OUT, { recursive: true })

function loadEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const raw of readFileSync(filePath, 'utf8').split('\n')) {
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
const envFile = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || envFile.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || envFile.E2E_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('[verify] missing E2E_EMAIL / E2E_PASSWORD (.env.e2e.local)')
  process.exit(1)
}

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : detail ? `  -> ${detail}` : ''}`)
}

let devServer
function startDevServer() {
  devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], { cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  devServer.stdout.on('data', () => {})
  devServer.stderr.on('data', () => {})
}
function stopDevServer() {
  if (!devServer?.pid) return
  try { process.kill(-devServer.pid, 'SIGTERM') } catch { try { devServer.kill('SIGTERM') } catch { /* gone */ } }
}
async function waitForServer(ms = 90000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { if ((await fetch(BASE_URL)).status < 500) return } catch { /* not yet */ }
    await sleep(500)
  }
  throw new Error('dev server did not start')
}

const NEW_TEXT = ['目前用量', '超過上限時只會暫停', '串接 Google 日曆是 Pro 會員功能', '了解 Pro', 'Your usage']
const PAGES = [
  ['membership', '/membership'],
  ['google-calendar', '/settings/google-calendar'],
]
const SIZES = [
  ['390', { width: 390, height: 844 }],
  ['1280', { width: 1280, height: 900 }],
]
const mockUsage = {
  enforced: true, pro: false,
  limits: { active_tasks: 150, notes: 100, image_bytes: 209715200, meeting_imports: 5 },
  used: { active_tasks: 130, notes: 100, image_bytes: 52428800, meeting_imports_this_month: 2 },
  grandfathered: { google_calendar: false },
}

async function login(browser) {
  const ctx = await browser.newContext({ viewport: SIZES[1][1], locale: 'zh-TW' })
  const page = await ctx.newPage()
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE_URL}/`, { timeout: 30000 })
  return { ctx, state: await ctx.storageState() }
}

async function visit(browser, state, { mode, pageName, route, sizeName, viewport }) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', storageState: state })
  const page = await ctx.newPage()
  const consoleErrors = []
  const pageErrors = []
  const usageCalls = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('response', (r) => { if (r.url().includes('my_plan_usage')) usageCalls.push(r.status()) })
  if (mode === 'mock') {
    await page.route('**/rest/v1/rpc/my_plan_usage*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUsage) }))
  }
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  await sleep(2500) // let the usage read settle
  const text = await page.evaluate(() => document.body.innerText)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const toasts = await page.locator('[data-sonner-toast]').count()
  const file = path.join(OUT, `${mode === 'mock' ? 'mock-enforced' : 'real'}-${pageName}-${sizeName}.png`)
  await page.screenshot({ path: file, fullPage: true })
  const dom = {
    meters: await page.locator('[data-testid="plan-usage-meters"]').count(),
    usagePanel: await page.locator('[data-testid="plan-usage"]').count(),
    gcalUpgrade: await page.locator('[data-testid="gcal-upgrade"]').count(),
  }
  const states = await page.locator('[data-gcal-state]').first().getAttribute('data-gcal-state').catch(() => null)
  // 44pt touch targets for the new controls
  const smallTargets = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="gcal-upgrade"] a, [data-testid="plan-usage"] a, [data-testid="plan-usage"] button')]
      .filter((el) => el.getBoundingClientRect().height < 44).length)
  await ctx.close()
  return { text, overflow, toasts, file, dom, states, consoleErrors, pageErrors, usageCalls, smallTargets }
}

async function main() {
  startDevServer()
  await waitForServer()
  const browser = await chromium.launch()
  try {
    const { ctx: loginCtx, state } = await login(browser)
    await loginCtx.close()
    check('login with the test account', true)

    console.log('\n== Part A: real backend, limits off / RPC not deployed — must look unchanged ==')
    for (const [pageName, route] of PAGES) {
      for (const [sizeName, viewport] of SIZES) {
        const r = await visit(browser, state, { mode: 'real', pageName, route, sizeName, viewport })
        const tag = `${pageName}@${sizeName}`
        check(`${tag}: no new UI text`, !NEW_TEXT.some((s) => r.text.includes(s)), NEW_TEXT.filter((s) => r.text.includes(s)).join(','))
        check(`${tag}: no usage panel / meters / upgrade prompt in DOM`, r.dom.meters + r.dom.usagePanel + r.dom.gcalUpgrade === 0, JSON.stringify(r.dom))
        check(`${tag}: no toast`, r.toasts === 0, String(r.toasts))
        check(`${tag}: no page (uncaught) errors`, r.pageErrors.length === 0, r.pageErrors.join(' | '))
        check(`${tag}: no horizontal overflow`, r.overflow <= 0, String(r.overflow))
        const nonNetwork = r.consoleErrors.filter((e) => !/Failed to load resource/.test(e))
        check(`${tag}: console errors other than the expected my_plan_usage 404/400 = none`, nonNetwork.length === 0, nonNetwork.join(' | '))
        console.log(`      ${tag}: my_plan_usage HTTP=${JSON.stringify(r.usageCalls)} gcal-state=${r.states} console.error(Failed-to-load)=${r.consoleErrors.length - nonNetwork.length} -> ${path.basename(r.file)}`)
        if (pageName === 'google-calendar' && sizeName === '390') writeFileSync(path.join(OUT, 'real-google-calendar-text.txt'), r.text)
        if (pageName === 'membership' && sizeName === '390') writeFileSync(path.join(OUT, 'real-membership-text.txt'), r.text)
      }
    }

    console.log('\n== Part B: my_plan_usage mocked (limits on, free user) — new UI must render and fit ==')
    for (const [pageName, route] of PAGES) {
      for (const [sizeName, viewport] of SIZES) {
        const r = await visit(browser, state, { mode: 'mock', pageName, route, sizeName, viewport })
        const tag = `mock ${pageName}@${sizeName}`
        if (pageName === 'membership') {
          check(`${tag}: usage panel with 4 meters`, r.dom.usagePanel === 1 && r.text.includes('目前用量') && r.text.includes('進行中任務') && r.text.includes('130 / 150') && r.text.includes('2 / 5'), r.text.slice(0, 200))
          check(`${tag}: 100/100 notes shows the "limit reached" line`, r.text.includes('已達上限，暫時無法再新增'))
          check(`${tag}: 130/150 (87%) shows the warning line`, r.text.includes('快到上限了'))
        } else {
          console.log(`      ${tag}: gcal-state=${r.states} upgrade-prompt=${r.dom.gcalUpgrade}`)
          if (r.states === 'disconnected') check(`${tag}: connect button replaced by upgrade prompt`, r.dom.gcalUpgrade === 1)
        }
        check(`${tag}: no page errors`, r.pageErrors.length === 0, r.pageErrors.join(' | '))
        check(`${tag}: no horizontal overflow`, r.overflow <= 0, String(r.overflow))
        check(`${tag}: new links/buttons >= 44px tall`, r.smallTargets === 0, String(r.smallTargets))
      }
    }
  } finally {
    await browser.close()
    stopDevServer()
  }
  console.log('\nscreenshots:')
  for (const f of ['real', 'mock-enforced']) for (const [p] of PAGES) for (const [s] of SIZES) {
    const file = path.join(OUT, `${f}-${p}-${s}.png`)
    if (existsSync(file)) console.log(`  ${path.basename(file)}  ${statSync(file).size} bytes`)
  }
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
  process.exitCode = failed === 0 ? 0 : 1
}
main().catch((e) => { console.error(e); stopDevServer(); process.exit(1) })
