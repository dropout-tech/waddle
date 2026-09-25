#!/usr/bin/env node
/**
 * Forgot-password flow verification — spawns its own dev server, asserts:
 *  A. /forgot-password renders in zh and en; login-page link reaches it.
 *  B. Submitting the test email calls resetPasswordForEmail (network-level
 *     assert on /auth/v1/recover → success card). Sends a REAL email to the
 *     test inbox (allowed: test mailbox).
 *  C. /reset-password without a session shows the invalid-link view.
 *  D. /reset-password with a session: mismatch error → set a temp password
 *     (real updateUser) → restore the original password → re-login works.
 *  E. Zero pageerror.
 * Run: node scripts/e2e/tmp-forgot-password-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3109
const BASE = `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-07-22-forgot-password-shots')
mkdirSync(SHOTS, { recursive: true })

function loadEnvFile(p) {
  const out = {}
  if (!existsSync(p)) return out
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
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
const env = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = env.E2E_EMAIL, PASSWORD = env.E2E_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('missing creds'); process.exit(1) }
const TEMP_PASSWORD = PASSWORD + '-tmp1'

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  ok ? passed++ : failed++
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function fillStable(page, sel, value) {
  for (let i = 0; i < 5; i++) {
    await page.fill(sel, value)
    await sleep(150)
    if ((await page.inputValue(sel)) === value) return
  }
  throw new Error('fill unstable: ' + sel)
}

const server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(), stdio: ['ignore', 'ignore', 'ignore'], detached: true,
})
const pageErrors = []
let browser
try {
  for (let i = 0; i < 90; i++) { try { const r = await fetch(`${BASE}/login`); if (r.ok) break } catch {} await sleep(1000) }
  browser = await chromium.launch()

  // ── A. rendering, zh + en, link from login ─────────────────────────
  const zhCtx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
  const zh = await zhCtx.newPage()
  zh.on('pageerror', (e) => pageErrors.push('zh: ' + String(e).slice(0, 200)))
  await zh.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await zh.click('a[href="/forgot-password"]')
  await zh.waitForURL('**/forgot-password')
  await sleep(800)
  check('A1 login link reaches /forgot-password (zh)', await zh.locator('h1', { hasText: '重設密碼' }).isVisible())
  await zh.screenshot({ path: path.join(SHOTS, 'forgot-zh.png') })

  const enCtx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } })
  const en = await enCtx.newPage()
  en.on('pageerror', (e) => pageErrors.push('en: ' + String(e).slice(0, 200)))
  await en.goto(`${BASE}/forgot-password`, { waitUntil: 'networkidle' })
  await sleep(1500)
  check('A2 /forgot-password renders in English', await en.locator('h1', { hasText: 'Reset password' }).isVisible())
  await en.screenshot({ path: path.join(SHOTS, 'forgot-en.png') })
  await enCtx.close()

  // ── B. real submit → recover endpoint ──────────────────────────────
  // KNOWN PROJECT LIMITATION: Supabase's built-in email service only
  // delivers to project team members; any other address (incl. the test
  // Gmail) gets 400 email_address_invalid until custom SMTP is configured.
  // So: 200 → success card must show; 400 → the graceful inline error must
  // show (never the success card). Both prove the page is wired correctly.
  let recoverStatus = null
  zh.on('response', (r) => { if (r.url().includes('/auth/v1/recover')) recoverStatus = r.status() })
  await fillStable(zh, 'input[type="email"]', EMAIL)
  await zh.click('button[type="submit"]')
  await sleep(4000)
  check('B1 recover API called', recoverStatus === 200 || recoverStatus === 400 || recoverStatus === 429, `status=${recoverStatus}`)
  if (recoverStatus === 200) {
    check('B2 success card shown', await zh.locator('h1', { hasText: '重設連結已寄出' }).isVisible())
  } else {
    // 400 email_address_invalid → 寄送失敗; 429 rate limit → 嘗試次數太多
    const expected = recoverStatus === 429 ? '嘗試次數太多' : '寄送失敗'
    const gracefulError = await zh.locator('[role="alert"]', { hasText: expected }).isVisible()
    const noFakeSuccess = !(await zh.locator('h1', { hasText: '重設連結已寄出' }).isVisible())
    check(`B2 graceful error shown (${expected}), no fake success`, gracefulError && noFakeSuccess,
      recoverStatus === 400 ? 'delivery blocked by built-in email service — configure custom SMTP to enable' : '')
  }
  await zh.screenshot({ path: path.join(SHOTS, 'forgot-sent-zh.png') })
  await zhCtx.close()

  // ── C. /reset-password without session ─────────────────────────────
  const anonCtx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
  const anon = await anonCtx.newPage()
  anon.on('pageerror', (e) => pageErrors.push('anon: ' + String(e).slice(0, 200)))
  await anon.goto(`${BASE}/reset-password`, { waitUntil: 'networkidle' })
  await sleep(2000)
  check('C1 no-session shows invalid-link view', await anon.locator('h1', { hasText: '連結已失效' }).isVisible())
  check('C2 re-request link points to /forgot-password', await anon.locator('a[href="/forgot-password"]').isVisible())
  await anon.screenshot({ path: path.join(SHOTS, 'reset-invalid.png') })
  await anonCtx.close()

  // ── D. with session: mismatch → temp password → restore ────────────
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => pageErrors.push('main: ' + String(e).slice(0, 200)))
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await fillStable(p, 'input[type="email"]', EMAIL)
  await fillStable(p, 'input[type="password"]', PASSWORD)
  await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })
  await p.goto(`${BASE}/reset-password`, { waitUntil: 'networkidle' })
  await sleep(2000)
  check('D1 with session shows the form', await p.locator('h1', { hasText: '設定新密碼' }).isVisible())
  await p.screenshot({ path: path.join(SHOTS, 'reset-form-zh.png') })

  await fillStable(p, '#new-password', TEMP_PASSWORD)
  await fillStable(p, '#confirm-password', TEMP_PASSWORD + 'x')
  await p.click('button[type="submit"]')
  await sleep(600)
  check('D2 mismatch shows inline error', await p.locator('[role="alert"]', { hasText: '兩次輸入的密碼不一致' }).isVisible())

  await fillStable(p, '#confirm-password', TEMP_PASSWORD)
  await p.click('button[type="submit"]')
  await p.locator('h1', { hasText: '密碼已更新' }).waitFor({ timeout: 15000 }).catch(() => {})
  check('D3 password updated (temp)', await p.locator('h1', { hasText: '密碼已更新' }).isVisible())
  await p.waitForURL((u) => u.pathname === '/', { timeout: 10000 }).catch(() => {})
  check('D4 redirected home after update', new URL(p.url()).pathname === '/')

  // restore the original password immediately (shared test account)
  await p.goto(`${BASE}/reset-password`, { waitUntil: 'networkidle' })
  await sleep(1500)
  await fillStable(p, '#new-password', PASSWORD)
  await fillStable(p, '#confirm-password', PASSWORD)
  await p.click('button[type="submit"]')
  await p.locator('h1', { hasText: '密碼已更新' }).waitFor({ timeout: 15000 }).catch(() => {})
  check('D5 original password restored', await p.locator('h1', { hasText: '密碼已更新' }).isVisible())
  await ctx.close()

  // fresh context: original credentials still log in
  const ctx2 = await browser.newContext({ locale: 'zh-TW' })
  const p2 = await ctx2.newPage()
  await p2.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await fillStable(p2, 'input[type="email"]', EMAIL)
  await fillStable(p2, 'input[type="password"]', PASSWORD)
  await p2.click('button[type="submit"]')
  const loggedIn = await p2.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 }).then(() => true).catch(() => false)
  check('D6 re-login with original password works', loggedIn)
  await ctx2.close()

  // ── E ──────────────────────────────────────────────────────────────
  check('E1 zero pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (err) {
  check('FATAL', false, String(err).slice(0, 300))
} finally {
  try { await browser?.close() } catch {}
  try { process.kill(-server.pid, 'SIGTERM') } catch {}
}
console.log(`\n${passed}/${passed + failed} passed`)
process.exit(failed ? 1 : 0)
