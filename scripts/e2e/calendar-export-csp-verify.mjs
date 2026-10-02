#!/usr/bin/env node
/**
 * Calendar image export under the production CSP.
 *
 * The server-hosted web build ships a Content-Security-Policy whose
 * connect-src has no `data:`. The export used to do `fetch(dataUrl)` to turn
 * the PNG into a Blob, which that CSP blocks. This script runs against a
 * production server (`pnpm build && pnpm start`, so the CSP header is real)
 * and asserts:
 *   1. the page really carries a CSP without data: in connect-src
 *   2. fetch('data:…') is blocked there (proves the old code path was broken)
 *   3. 下載 PNG produces a non-empty PNG download + success toast
 *   4. 複製到剪貼簿 succeeds
 *   5. zero CSP violations / page errors during the export
 *
 * Run: pnpm build && pnpm start   (another shell, PORT=3000 by default)
 *      node scripts/e2e/calendar-export-csp-verify.mjs [baseUrl]
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = process.argv[2] || 'http://localhost:3000'

function loadEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[line.slice(0, eq).trim()] = value
  }
  return out
}

const envFile = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || envFile.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || envFile.E2E_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('[export-csp] Missing E2E_EMAIL / E2E_PASSWORD (.env.e2e.local)')
  process.exit(1)
}

let failed = 0
const assert = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  // The app picks its UI language from the browser locale; the labels below are zh-TW.
  locale: 'zh-TW',
  acceptDownloads: true,
  permissions: ['clipboard-read', 'clipboard-write'],
})
// Collect CSP violations from the page itself (more precise than console text).
await context.addInitScript(() => {
  window.__cspViolations = []
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`)
  })
})
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(err.message))

try {
  const res = await page.goto(`${BASE_URL}/login?method=email`, { waitUntil: 'domcontentloaded' })
  const csp = res?.headers()['content-security-policy'] || ''
  const connectSrc = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('connect-src')) || ''
  assert(csp.length > 0, 'CSP header present', connectSrc)
  assert(connectSrc && !/\bdata:/.test(connectSrc), 'connect-src has no data:')

  // The old export path: fetch(dataUrl). Under this CSP it must be refused.
  const oldPath = await page.evaluate(async () => {
    try {
      await fetch('data:image/png;base64,iVBORw0KGgo=')
      return 'allowed'
    } catch (e) {
      return `blocked: ${e.message}`
    }
  })
  const oldPathViolations = await page.evaluate(() => window.__cspViolations)
  assert(
    oldPath.startsWith('blocked') && oldPathViolations.some((v) => v.startsWith('connect-src')),
    'old fetch(dataUrl) path is blocked by CSP',
    `${oldPath}; violation: ${oldPathViolations.join(' | ')}`,
  )

  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type=submit]').click()
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 30000 })
  // Reset the collector: only violations from the export itself count below.
  await page.evaluate(() => { window.__cspViolations = [] })

  await page.getByRole('button', { name: '更多工具' }).click()
  await page.getByRole('menuitem', { name: '匯出' }).click()
  const downloadBtn = page.getByRole('button', { name: '下載 PNG' })
  await downloadBtn.waitFor({ state: 'visible', timeout: 10000 })

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    downloadBtn.click(),
  ])
  const savePath = path.join(tmpdir(), 'huddle-export-csp-verify.png')
  await download.saveAs(savePath)
  const size = statSync(savePath).size
  const magic = readFileSync(savePath).subarray(0, 8).toString('hex')
  assert(size > 10_000 && magic === '89504e470d0a1a0a', 'download is a real PNG', `${download.suggestedFilename()} ${size} bytes → ${savePath}`)
  const okToast = await page.getByText('已下載').first().isVisible().catch(() => false)
  assert(okToast, 'success toast 已下載 shown')

  await page.getByRole('button', { name: '複製到剪貼簿' }).click()
  const copied = await page.getByText('已複製到剪貼簿').first()
    .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
  assert(copied, 'copy to clipboard succeeds (toast 已複製到剪貼簿)')

  const failToast = await page.getByText(/匯出失敗|複製失敗/).count()
  assert(failToast === 0, 'no failure toast')

  const violations = await page.evaluate(() => window.__cspViolations)
  assert(violations.length === 0, 'zero CSP violations during export', violations.join(' | '))
  assert(pageErrors.length === 0, 'zero page errors', pageErrors.join(' | '))
} catch (err) {
  assert(false, 'script ran to completion', err.message)
} finally {
  await browser.close()
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nALL PASSED')
process.exit(failed ? 1 : 0)
