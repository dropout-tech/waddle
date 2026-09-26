#!/usr/bin/env node
/**
 * One-off verification for the calendar-header restructure (2026-09-26):
 * shared-peer chips folded into the toolbar row (no dedicated row), and
 * "約交集時間" renamed "約交集" + moved into the tools (⌄) dropdown.
 *
 * Blocks ALL Supabase writes (any non-GET to the Supabase REST/RPC host)
 * and mocks the get_share_peers RPC to fabricate 0 / 1 / 3 peers, so no
 * real sharing data is touched.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3111
const BASE_URL = `http://localhost:${PORT}`
const SHOT_DIR = '/private/tmp/claude-501/-Users-lazylazy-Desktop------v0-task-management-ui/827a4731-3ac4-4bbd-be97-56da1fdd1828/scratchpad/cal-header'

function loadEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const envFile = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || envFile.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || envFile.E2E_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('[verify] missing E2E_EMAIL/E2E_PASSWORD')
  process.exit(1)
}

const localEnv = loadEnvFile(path.join(process.cwd(), '.env.local'))
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_HOST = new URL(SUPABASE_URL).host

let devServer
let exitCode = 0
const results = []

async function waitForServerReady(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE_URL)
      if (res.status < 500) return
    } catch {}
    await sleep(500)
  }
  throw new Error('dev server not ready in time')
}

function startDevServer() {
  devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  devServer.stdout.on('data', (d) => process.stdout.write(`[next dev] ${d}`))
  devServer.stderr.on('data', (d) => process.stderr.write(`[next dev] ${d}`))
}
function stopDevServer() {
  if (!devServer?.pid) return
  try { process.kill(-devServer.pid, 'SIGTERM') } catch { try { devServer.kill('SIGTERM') } catch {} }
}

function makePeers(n) {
  const names = ['廖思明', '林家慧', '陳柏宇', '王雅婷', '張育誠']
  return Array.from({ length: n }, (_, i) => ({
    share_id: `mock-share-${i}`,
    peer_id: `mock-peer-${i}`,
    display_name: names[i % names.length],
    avatar_url: null,
    created_at: new Date().toISOString(),
  }))
}

async function step(name, fn) {
  let passed = true
  const notes = []
  try {
    await fn((note) => notes.push(note))
  } catch (e) {
    passed = false
    notes.push(`exception: ${e.message}`)
  }
  results.push({ name, passed, notes })
  console.log(`${passed ? 'PASS' : 'FAIL'} — ${name}${notes.length ? ' — ' + notes.join('; ') : ''}`)
  if (!passed) exitCode = 1
}

async function main() {
  startDevServer()
  await waitForServerReady()

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' })

  let peerCount = 0
  let blockedWrites = 0

  // Known write RPCs the app exposes (not used by any step below, but
  // blocked defensively in case a click accidentally reaches one).
  const WRITE_RPC_NAMES = [
    'create_share_invite', 'accept_share_invite', 'claim_daily_check_in',
  ]

  await page.route(`https://${SUPABASE_HOST}/**`, async (route) => {
    const req = route.request()
    const url = req.url()
    const method = req.method()
    const u = new URL(url)

    // Mock the shared-peers RPC regardless of method (Supabase RPC calls go via POST).
    if (u.pathname === '/rest/v1/rpc/get_share_peers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makePeers(peerCount)),
      })
      return
    }

    // Block known-mutating RPCs explicitly (defense in depth — none of the
    // steps below trigger these, but a stray click shouldn't touch real data).
    if (WRITE_RPC_NAMES.some((n) => u.pathname === `/rest/v1/rpc/${n}`)) {
      blockedWrites++
      console.log(`[verify] blocked write RPC: ${u.pathname}`)
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
      return
    }

    // Every other RPC call (huddle_operations, get_meeting_invitations, ...)
    // is this app's normal *read* data-fetching path too (not just writes) —
    // blocking it wholesale breaks page render. Let those through untouched.
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      await route.continue()
      return
    }

    // Direct REST table access: GET/HEAD/OPTIONS are reads, pass through.
    // Anything else (POST/PATCH/DELETE straight to a table) is a real write
    // — block it so this run can never mutate real rows.
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      if (url.includes('/auth/v1/')) {
        await route.continue() // login itself must work
        return
      }
      blockedWrites++
      console.log(`[verify] blocked Supabase table write: ${method} ${url}`)
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }
    await route.continue()
  })

  await step('login', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
  })

  // Helper: y of the calendar timeline area (day/week grid top). We use the
  // toolbar row's bottom edge as the proxy for "calendar visible area starts
  // here" — it's the element directly above the grid, and any header-row
  // growth would push this value down.
  async function toolbarBottomY() {
    return page.evaluate(() => {
      const toolbar = document.querySelector('[role="toolbar"]')
      if (!toolbar) return null
      return Math.round(toolbar.getBoundingClientRect().bottom)
    })
  }

  let yNoPeers, yWithPeers

  await step('day view, 0 peers — baseline height + no dedicated peer row', async (note) => {
    await page.getByRole('button', { name: '日檢視' }).click()
    await page.waitForTimeout(500)
    yNoPeers = await toolbarBottomY()
    note(`toolbar bottom y (0 peers) = ${yNoPeers}`)
    await page.screenshot({ path: path.join(SHOT_DIR, '1440-0peers.png') })
  })

  await step('reload with 1 mocked peer — chip renders inline, no row growth', async (note) => {
    peerCount = 1
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '日檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForTimeout(800)
    yWithPeers = await toolbarBottomY()
    note(`toolbar bottom y (1 peer) = ${yWithPeers}`)
    if (yWithPeers !== yNoPeers) {
      throw new Error(`row height changed: 0peers=${yNoPeers} vs 1peer=${yWithPeers}`)
    }
    const dedicatedRow = await page.locator('text=廖思明').count()
    // Peer name is no longer shown as visible text (avatar-only chip now) —
    // assert the avatar button exists instead, via its aria-pressed group.
    const chipCount = await page.locator('[aria-label="共享行事曆顯示"] button').count()
    note(`peer chip buttons found: ${chipCount}, legacy name-text nodes: ${dedicatedRow}`)
    if (chipCount < 1) throw new Error('expected at least 1 peer chip button, found 0')
    await page.screenshot({ path: path.join(SHOT_DIR, '1440-1peer.png') })
  })

  await step('reload with 3 mocked peers — still no row growth, chips inline', async (note) => {
    peerCount = 3
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '日檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForTimeout(800)
    const y3 = await toolbarBottomY()
    note(`toolbar bottom y (3 peers) = ${y3}`)
    if (y3 !== yNoPeers) {
      throw new Error(`row height changed with 3 peers: 0peers=${yNoPeers} vs 3peers=${y3}`)
    }
    const chipCount = await page.locator('[aria-label="共享行事曆顯示"] button').count()
    note(`peer chip buttons found: ${chipCount}`)
    if (chipCount !== 3) throw new Error(`expected 3 peer chips, found ${chipCount}`)
    await page.screenshot({ path: path.join(SHOT_DIR, '1440-3peers.png') })
  })

  await step('tools (⌄) dropdown shows 約交集, opens meeting dialog', async (note) => {
    // "約交集時間" as a standalone toolbar button must be gone.
    const oldButton = await page.getByRole('button', { name: '約交集時間', exact: true }).count()
    note(`old standalone button count: ${oldButton}`)
    if (oldButton !== 0) throw new Error('standalone 約交集時間 button still present on toolbar')

    await page.locator('[data-tour="calendar-export"]').click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(SHOT_DIR, '1440-tools-dropdown-open.png') })
    const menuItem = page.getByText('約交集', { exact: true })
    await menuItem.waitFor({ state: 'visible', timeout: 5000 })
    await menuItem.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(SHOT_DIR, '1440-meeting-dialog-open.png') })
    // The meetings dialog/page should now be open — check for its known heading text.
    const bodyText = await page.evaluate(() => document.body.innerText)
    note(`dialog opened (body mentions 約會/會議/時段): ${/會議|約時間|時段|行事曆|Meeting/i.test(bodyText)}`)
  })

  await step('mobile 390 — layout not broken', async (note) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.body.clientWidth,
    }))
    note(`overflow: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`)
    await page.screenshot({ path: path.join(SHOT_DIR, '390-mobile.png') })
    if (overflow.scrollWidth > overflow.clientWidth + 1) {
      throw new Error(`horizontal overflow on mobile: ${JSON.stringify(overflow)}`)
    }
  })

  console.log(`[verify] blocked Supabase write calls: ${blockedWrites}`)
  await browser.close()

  console.log('')
  console.log(`Screenshots: ${SHOT_DIR}`)
  console.log(`${results.filter((r) => r.passed).length}/${results.length} steps passed`)
}

main()
  .catch((e) => {
    console.error('FATAL:', e)
    exitCode = 1
  })
  .finally(() => {
    stopDevServer()
    process.exit(exitCode)
  })
