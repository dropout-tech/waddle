// Verifies the Google/Apple-only sign-in change (2026-10-01).
//   E2E_BASE_URL=http://localhost:3191 E2E_EMAIL=… E2E_PASSWORD=… SHOTS=<dir> node scripts/e2e/social-login-only-verify.mjs
// Without E2E_EMAIL/E2E_PASSWORD the hidden email-login check is skipped (reported, not passed).
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3191'
const SHOTS = process.env.SHOTS || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let failed = 0
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++ }

const browser = await chromium.launch()

async function open(route, { lang = 'zh-TW', width = 1280 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } })
  await ctx.addInitScript((l) => { try { localStorage.setItem('waddle-language-v1', l) } catch {} }, lang)
  const page = await ctx.newPage()
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  return { ctx, page }
}
const count = (page, sel) => page.locator(sel).count()
const visibleText = (page, text) => page.getByText(text, { exact: false }).first().isVisible().catch(() => false)
const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name), fullPage: true }) }

for (const width of [1280, 390]) {
  const tag = `@${width}`
  // 1. Default login page: only Google + Apple.
  {
    const { ctx, page } = await open('/login', { width })
    check(await visibleText(page, '使用 Google 登入'), `login ${tag}: Google button visible`)
    check(await visibleText(page, '使用 Apple 登入'), `login ${tag}: Apple button visible`)
    check((await count(page, 'input[type=password]')) === 0, `login ${tag}: no password field`)
    check((await count(page, 'input[type=email]')) === 0, `login ${tag}: no email field`)
    check((await count(page, 'a[href="/forgot-password"]')) === 0, `login ${tag}: no forgot-password link`)
    check((await count(page, 'a[href="/signup"]')) === 1, `login ${tag}: sign-up link kept`)
    check((await overflowX(page)) <= 0, `login ${tag}: no horizontal overflow`)
    await shot(page, `login-${width}.png`)
    await ctx.close()
  }
  // 2. Hidden email login.
  {
    const { ctx, page } = await open('/login?method=email', { width })
    check((await count(page, 'input[type=email]')) === 1, `login?method=email ${tag}: email field present`)
    check((await count(page, 'input[type=password]')) === 1, `login?method=email ${tag}: password field present`)
    check((await count(page, 'a[href="/forgot-password"]')) === 0, `login?method=email ${tag}: no forgot-password link`)
    await shot(page, `login-email-${width}.png`)
    await ctx.close()
  }
  // 3. Signup: OAuth + enrollment codes, no email form.
  {
    const { ctx, page } = await open('/signup?ref=FRIENDCODE&coupon=WELCOME60', { width })
    check(await visibleText(page, '使用 Google 註冊'), `signup ${tag}: Google button visible`)
    check(await visibleText(page, '使用 Apple 註冊'), `signup ${tag}: Apple button visible`)
    check((await count(page, 'input[type=password]')) === 0, `signup ${tag}: no password field`)
    check((await count(page, 'input[type=email]')) === 0, `signup ${tag}: no email field`)
    check((await page.locator('#signup-referral').inputValue().catch(() => '')) === 'FRIENDCODE', `signup ${tag}: referral code prefilled from link`)
    check((await page.locator('#signup-coupon').inputValue().catch(() => '')) === 'WELCOME60', `signup ${tag}: coupon prefilled from link`)
    check((await overflowX(page)) <= 0, `signup ${tag}: no horizontal overflow`)
    await shot(page, `signup-${width}.png`)
    await ctx.close()
  }
}

// 4. Old forgot-password links land on /login.
{
  const { ctx, page } = await open('/forgot-password')
  await page.waitForURL(/\/login$/, { timeout: 8000 }).catch(() => {})
  check(new URL(page.url()).pathname === '/login', 'forgot-password redirects to /login')
  await ctx.close()
}

// 5. English.
{
  const { ctx, page } = await open('/login', { lang: 'en' })
  check(await visibleText(page, 'Continue with Google'), 'login en: "Continue with Google"')
  check(await visibleText(page, 'Continue with Apple'), 'login en: "Continue with Apple"')
  // The language switch intentionally reads "中文" so Chinese readers can switch back.
  const zh = await page.evaluate(() => document.body.innerText.split('\n').filter((l) => /[一-鿿]/.test(l) && l.trim() !== '中文'))
  check(zh.length === 0, `login en: no Chinese text besides the language switch ${zh.length ? JSON.stringify(zh) : ''}`)
  await shot(page, 'login-en-1280.png')
  await ctx.close()
}

// 6. Hidden email login still signs in (test account).
if (process.env.E2E_EMAIL && process.env.E2E_PASSWORD) {
  const { ctx, page } = await open('/login?method=email')
  await page.fill('input[type=email]', process.env.E2E_EMAIL)
  await page.fill('input[type=password]', process.env.E2E_PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {})
  check(!new URL(page.url()).pathname.startsWith('/login'), `hidden email login signs in (landed on ${new URL(page.url()).pathname})`)
  await ctx.close()
} else {
  console.log('SKIP  hidden email login (E2E_EMAIL / E2E_PASSWORD not set)')
}

await browser.close()
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
process.exit(failed ? 1 : 0)
