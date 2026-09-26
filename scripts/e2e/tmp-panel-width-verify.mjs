#!/usr/bin/env node
/**
 * One-off verification: task-panel header responsiveness at narrow PANEL
 * widths (not viewport widths) — 380 / 460 / 540 / 700px. Confirms the
 * @container/panel container-query fix (panel-header.tsx compact mode +
 * task-panel.tsx quick-access row) never wraps at these widths.
 *
 * Forces the panel's own width directly (bypassing the resize-handle drag
 * gesture) via the wrapper's inline style, since the product's drag handle
 * currently clamps to 600px max but we want to confirm layout correctness
 * up to 700px too.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3112
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

async function main() {
  startDevServer()
  await waitForServerReady()

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' })

  // Block only direct REST TABLE writes (POST/PATCH/DELETE straight to
  // /rest/v1/<table>). RPC calls (huddle_operations, get_share_peers, ...)
  // are this app's normal *read* data-fetching path too, sent via POST —
  // blocking those wholesale crashes the page (learned the hard way in the
  // calendar-header verify run). This test doesn't touch any mutating
  // feature anyway (no invite creation, no check-in claim), so real RPC
  // reads are left alone and nothing gets written.
  await page.route(`https://${SUPABASE_HOST}/**`, async (route) => {
    const req = route.request()
    const method = req.method()
    const u = new URL(req.url())
    if (u.pathname.startsWith('/rest/v1/rpc/') || u.pathname.startsWith('/auth/v1/')) {
      await route.continue()
      return
    }
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }
    await route.continue()
  })

  // Turbopack dev occasionally 404s the very first request or two right
  // after "Ready" — retry the initial navigation instead of racing it.
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    if (await page.locator('#email').count() > 0) break
    await sleep(1000)
  }
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(500)

  // The reported bug screenshot shows the panel header in "compact" mode
  // (day-box + month/weekday inline + the 4 small icons) — that's the mode
  // whose row wraps at narrow panel widths. Force it via the same
  // localStorage key panel-header.tsx reads on mount, then reload so the
  // header renders in that mode from the start.
  await page.evaluate(() => localStorage.setItem('waddle-header-mode', 'compact'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(500)

  const widths = [380, 460, 540, 700]
  let allOk = true

  for (const w of widths) {
    const result = await page.evaluate((width) => {
      const anchor = document.querySelector('[data-tour="task-shortcut-row"]')
      if (!anchor) return { ok: false, reason: 'task-shortcut-row not found' }
      const wrapper = anchor.closest('.flex-shrink-0')
      if (!wrapper) return { ok: false, reason: 'panel wrapper not found' }
      // Kill the 300ms width transition so the new width applies
      // synchronously — otherwise this readback (and the next screenshot)
      // races the CSS transition and reports/shoots the stale width.
      wrapper.style.transition = 'none'
      wrapper.style.maxWidth = 'none'
      wrapper.style.width = `${width}px`
      // Force layout so the transition removal + new width are both flushed
      // before we read anything back.
      void wrapper.getBoundingClientRect()
      return { ok: true, actualWidth: Math.round(wrapper.getBoundingClientRect().width) }
    }, w)
    if (!result.ok) {
      console.log(`FAIL — set panel width ${w}px — ${result.reason}`)
      allOk = false
      continue
    }
    await page.waitForTimeout(200)

    // Assert: quick-access row height is a single line (no wrap) and the
    // "已完成" trigger is on the SAME row as "今日會議" (not pushed below).
    const layout = await page.evaluate(() => {
      const row = document.querySelector('[data-tour="task-shortcut-row"]')
      const completedBtn = document.querySelector('[data-tour="completed-tasks-button"]')
      const meetingsBtn = row?.querySelector('button')
      if (!row || !completedBtn || !meetingsBtn) return null
      const rowRect = row.getBoundingClientRect()
      const completedRect = completedBtn.getBoundingClientRect()
      const meetingsRect = meetingsBtn.getBoundingClientRect()
      return {
        rowHeight: Math.round(rowRect.height),
        // Tolerance 6px: the meetings chip enforces min-h-[32px] while the
        // overdue/completed chips don't, so there's a small constant
        // baseline offset between them at every width (not a wrap) —
        // confirmed by screenshot. This only needs to catch a REAL wrap,
        // which would put them tens of px apart on a whole separate row.
        sameLine: Math.abs(completedRect.top - meetingsRect.top) < 6,
        meetingsTop: Math.round(meetingsRect.top),
        completedTop: Math.round(completedRect.top),
      }
    })

    // Assert: the compact-header icon row (4 icons) is on the same line as
    // the date info, not wrapped to a second row.
    const headerLayout = await page.evaluate(() => {
      const pendingBadge = Array.from(document.querySelectorAll('span')).find((s) =>
        /\d+\s*待辦/.test(s.textContent || '')
      )
      const closeBtn = document.querySelector(
        '[title="收合成最小列"], [title="收起面板"], [title="展開任務面板"], [title="顯示日曆"]'
      )
      if (!pendingBadge || !closeBtn) return { sameLine: null, foundBadge: !!pendingBadge, foundBtn: !!closeBtn }
      const a = pendingBadge.getBoundingClientRect()
      const b = closeBtn.getBoundingClientRect()
      return { sameLine: Math.abs(a.top - b.top) < 6 }
    })

    const shotPath = path.join(SHOT_DIR, `panel-${w}.png`)
    await page.screenshot({ path: shotPath, clip: { x: 0, y: 0, width: Math.min(w + 20, 1440), height: 400 } })

    const ok = layout?.sameLine && headerLayout?.sameLine
    if (!ok) allOk = false
    console.log(
      `${ok ? 'PASS' : 'FAIL'} — panel ${w}px (actual ${result.actualWidth}px) — ` +
      `quickRow.sameLine=${layout?.sameLine} quickRow.height=${layout?.rowHeight} meetingsTop=${layout?.meetingsTop} completedTop=${layout?.completedTop} ` +
      `headerRow.sameLine=${headerLayout?.sameLine} — screenshot: ${shotPath}`
    )
  }

  await browser.close()
  exitCode = allOk ? 0 : 1
  console.log('')
  console.log(`Screenshots: ${SHOT_DIR}/panel-*.png`)
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
