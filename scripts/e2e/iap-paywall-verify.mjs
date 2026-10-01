// iOS in-app purchase card (components/billing) — UI contract test.
//
// Nothing here talks to a real backend: the dev server is started with a
// Supabase URL on the reserved `.invalid` TLD and every request to it is
// answered by this script. The store is a fake driver injected through the
// development-only hook `window.__huddleBillingTest` (see
// components/billing/billing-session.ts — the hook is compiled out of
// production builds).
//
// Start the dev server first:
//   NEXT_PUBLIC_SUPABASE_URL=https://huddlemock.invalid \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key pnpm exec next dev -p 3217
//
// Then:
//   node scripts/e2e/iap-paywall-verify.mjs baseline   # before a change: reference shots
//   node scripts/e2e/iap-paywall-verify.mjs verify     # after: compare + purchase card states
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const mode = process.argv[2] || 'verify'
const base = process.env.E2E_BASE_URL || 'http://localhost:3217'
const mockHost = new URL(process.env.E2E_SUPABASE_URL || 'https://huddlemock.invalid').hostname
const ref = mockHost.split('.')[0]
const outDir = process.env.E2E_SCREENSHOT_DIR || 'docs/reports/2026-10-01-ios-iap-paywall'
await fs.mkdir(outDir, { recursive: true })

const id = '00000000-0000-4000-8000-000000000001'
const user = {
  id, aud: 'authenticated', role: 'authenticated', email: 'member@example.invalid',
  app_metadata: { provider: 'email' }, user_metadata: {},
  email_confirmed_at: '2026-09-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z',
}
const exp = Math.floor(Date.now() / 1000) + 3600
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp, aud: 'authenticated', role: 'authenticated' })).toString('base64url')}.fake`
const session = { access_token: token, refresh_token: 'fake', token_type: 'bearer', expires_in: 3600, expires_at: exp, user }
const settings = {
  gifts_enabled: true, trial_enabled: true, trial_days: 14, coupons_enabled: true, referrals_enabled: true,
  referral_days: 30, friend_days: 30, annual_reward_cap: 360, leaderboard_enabled: true,
  reminder_enabled: false, reminder_days: 3,
}
const FUTURE = '2027-10-01T00:00:00Z'

const browser = await chromium.launch()
const external = new Set()
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * One isolated browser context. `server` is the mutable fake backend state the
 * route handler reads, so a test can flip paid_until mid-flow.
 */
async function open({ width, height, lang = 'zh-TW', dark = false, billing = null, server = {}, scale = 2 }) {
  const state = { paid_until: null, pro_until: null, selfCalls: 0, unexpected: [], ...server }
  const context = await browser.newContext({
    viewport: { width, height }, locale: 'zh-TW', timezoneId: 'Asia/Taipei',
    deviceScaleFactor: scale, colorScheme: dark ? 'dark' : 'light',
  })
  await context.addCookies([{ name: `sb-${ref}-auth-token`, value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: base }])
  await context.addInitScript(({ lang, dark, billing }) => {
    try {
      window.localStorage.setItem('waddle-language-v1', lang)
      window.localStorage.setItem('theme', dark ? 'dark' : 'light')
    } catch {}
    // The dev-only Next.js indicator sits bottom-left and would end up in shots.
    const hide = () => {
      const style = document.createElement('style')
      style.textContent = 'nextjs-portal{display:none!important}'
      document.documentElement.appendChild(style)
    }
    if (document.documentElement) hide(); else document.addEventListener('DOMContentLoaded', hide)
    if (!billing) return
    if (billing.nativeOnly) {
      // Native iOS shell, but no fake store: the real loader decides (launch flag off → not configured).
      window.__huddleBillingTest = { nativeIos: true }
      return
    }
    // Fake store. Never grants anything by itself: the page must still wait
    // for the (mocked) server before showing a subscription as active.
    const log = (window.__billingCalls = [])
    const outcome = (kind) => {
      const o = billing[kind]
      // Same contract as lib/billing/revenuecat-driver.ts hands to the adapter
      // (the SDK's numeric codes are mapped there and unit tested).
      if (o === 'cancel') throw { userCancelled: true }
      if (o === 'pending') throw { paymentPending: true }
      if (o === 'fail') throw new Error('There was a problem with the App Store.')
    }
    let listCalls = 0
    window.__huddleBillingTest = {
      nativeIos: true,
      syncMaxWaitMs: billing.syncMaxWaitMs,
      driver: {
        async configure(options) { log.push(['configure', options.appUserID]) },
        async listPackages() {
          log.push(['listPackages'])
          listCalls++
          if (billing.list === 'hang') return new Promise(() => {})
          if (billing.list === 'fail' || (billing.list === 'fail-once' && listCalls === 1)) throw new Error('offline')
          return billing.packages
        },
        async purchase(identifier) {
          log.push(['purchase', identifier])
          if (billing.purchase === 'hang') return new Promise(() => {})
          outcome('purchase')
        },
        async restore() {
          log.push(['restore'])
          outcome('restore')
          return { hasActiveSubscription: billing.restore === 'found' }
        },
        async logOut() { log.push(['logOut']) },
      },
    }
  }, { lang, dark, billing })
  // Belt and braces: nothing may leave the machine. Any host other than the
  // dev server and the fake backend is refused and reported.
  const appHost = new URL(base).hostname
  await context.route((url) => url.hostname !== appHost && url.hostname !== mockHost, (route) => {
    external.add(new URL(route.request().url()).hostname)
    return route.abort()
  })
  await context.route((url) => url.hostname === mockHost, async (route) => {
    const request = route.request()
    const u = new URL(request.url())
    if (u.pathname.endsWith('/auth/v1/user')) return route.fulfill({ json: user })
    if (u.pathname.endsWith('/auth/v1/token')) return route.fulfill({ json: session })
    if (u.pathname.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' })
    if (u.pathname.endsWith('/rpc/huddle_operations')) {
      const { p_action: action } = request.postDataJSON()
      if (action === 'self') {
        state.selfCalls++
        if (state.paidAfterSelfCalls && state.selfCalls >= state.paidAfterSelfCalls) {
          state.paid_until = FUTURE
          state.pro_until = FUTURE
        }
        return route.fulfill({ json: {
          member: { user_id: id, alias: '慢慢企鵝', referral_code: 'H1234567890ABCDEF', leaderboard_visible: false },
          admin: false, settings, paid_until: state.paid_until, pro_until: state.pro_until,
          grants: [], referral_count: 0, reward_days: 0, referred: false,
        } })
      }
      if (action === 'leaderboard' || action === 'announcements') return route.fulfill({ json: [] })
      state.unexpected.push(action)
      return route.fulfill({ json: { message: '已儲存' } })
    }
    if (request.method() === 'GET' || request.method() === 'HEAD') return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
    state.unexpected.push(`${request.method()} ${u.pathname}`)
    return route.fulfill({ json: [] })
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto(`${base}/membership`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 60000 })
  // The ledger heading is the last panel; once it is there the data has loaded.
  await page.locator('main h2').last().waitFor({ timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  return { context, page, state, pageErrors }
}

async function shot(page, name) {
  const file = path.join(outDir, name)
  // Phone shots are JPEG: the paper texture makes lossless PNGs close to 1 MB each.
  await page.screenshot(name.endsWith('.jpg') ? { path: file, type: 'jpeg', quality: 88 } : { path: file })
  const { size } = await fs.stat(file)
  console.log(`shot  ${file} (${size} bytes)`)
  return file
}

// ── Flag off, web: must look exactly like it did before the change ─────────
const FLAG_OFF = [
  { width: 390, height: 2400 },
  { width: 1280, height: 1700 },
]
for (const size of FLAG_OFF) {
  const label = mode === 'baseline' ? 'before' : 'after'
  // Scale 1 keeps the lossless comparison shots small enough to keep in git.
  const { context, page, pageErrors } = await open({ ...size, scale: 1 })
  const file = await shot(page, `flag-off-web-${size.width}-${label}.png`)
  if (mode !== 'baseline') {
    check(`flag off / web ${size.width}: no purchase card`, (await page.locator('[data-billing-card]').count()) === 0)
    check(`flag off / web ${size.width}: coupon and referral inputs still shown`, (await page.locator('main form input[maxlength="32"]').count()) === 2)
    const before = path.join(outDir, `flag-off-web-${size.width}-before.png`)
    const same = Buffer.compare(await fs.readFile(before), await fs.readFile(file)) === 0
    check(`flag off / web ${size.width}: screenshot identical to the pre-change baseline`, same, same ? 'byte-identical PNG' : `${before} vs ${file}`)
    check(`flag off / web ${size.width}: no page errors`, pageErrors.length === 0, pageErrors.join(' | '))
  }
  await context.close()
}
if (mode === 'baseline') {
  await browser.close()
  console.log(`baseline captured; external hosts refused: ${[...external].join(', ') || 'none'}`)
  process.exit(0)
}

// ── Native iOS (simulated) with a fake store ───────────────────────────────
const PHONE = { width: 390, height: 844 }
const PACKAGES = [
  { identifier: '$rc_monthly', localizedPrice: 'NT$149.00', subscriptionPeriod: 'P1M' },
  { identifier: '$rc_annual', localizedPrice: 'NT$1,290.00', subscriptionPeriod: 'P1Y' },
]
const CJK = /[㐀-鿿]/
const card = (page) => page.locator('[data-billing-card]')
const phase = (page, name) => page.locator(`[data-billing-card][data-phase="${name}"]`).waitFor({ timeout: 15000 })
const calls = (page) => page.evaluate(() => window.__billingCalls)
/** Scroll the card to the top of the phone viewport and capture what a user sees. */
async function cardShot(page, name) {
  await card(page).evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(250)
  return shot(page, name)
}
/** Layout rules every state must keep at 390 px. */
async function layout(page, label) {
  const m = await page.evaluate(() => {
    const root = document.querySelector('[data-billing-card]')
    const shell = root.closest('main')
    const small = [...root.querySelectorAll('button, a, label')]
      .map((el) => ({ text: el.textContent.trim().slice(0, 24), height: Math.round(el.getBoundingClientRect().height) }))
      .filter((el) => el.height < 44)
    const box = root.getBoundingClientRect()
    return {
      small, overflowX: document.documentElement.scrollWidth - window.innerWidth,
      shellOverflowX: shell.scrollWidth - shell.clientWidth, left: box.left, right: window.innerWidth - box.right,
      bottomPad: parseFloat(getComputedStyle(shell).paddingBottom),
    }
  })
  check(`${label}: no horizontal overflow at 390`, m.overflowX <= 0 && m.shellOverflowX <= 0 && m.left >= 0 && m.right >= 0, JSON.stringify({ overflowX: m.overflowX, shell: m.shellOverflowX }))
  check(`${label}: every button, link and plan row is at least 44 px tall`, m.small.length === 0, JSON.stringify(m.small))
  check(`${label}: page keeps its bottom safe-area padding`, m.bottomPad >= 60, `${m.bottomPad}px`)
}

for (const lang of ['zh-TW', 'en']) {
  const tag = lang === 'en' ? 'en' : 'zh'
  const english = lang === 'en'
  const { context, page, state, pageErrors } = await open({ ...PHONE, lang, billing: { packages: PACKAGES } })
  await phase(page, 'ready')
  const text = await card(page).innerText()
  check(`paywall ${tag}: plan name and both plans with the store's price and period`,
    text.includes('Huddle Pro') && text.includes('NT$149.00') && text.includes('NT$1,290.00')
      && text.includes(english ? 'Monthly' : '月繳') && text.includes(english ? 'Yearly' : '年繳')
      && text.includes(english ? 'Renews monthly' : '每月自動續訂') && text.includes(english ? 'Renews yearly' : '每年自動續訂'))
  check(`paywall ${tag}: auto-renewal disclosure (24 hours, cancel in Apple ID settings)`,
    english ? /24 hours/.test(text) && /Apple ID subscription settings/.test(text) : /24 小時/.test(text) && /Apple ID 的「訂閱」設定/.test(text))
  check(`paywall ${tag}: restore purchases button`, await card(page).getByRole('button', { name: english ? 'Restore purchases' : '恢復購買' }).isEnabled())
  const hrefs = await card(page).locator('a').evaluateAll((links) => links.map((a) => a.getAttribute('href')))
  check(`paywall ${tag}: terms and privacy links`, hrefs.join(',') === (english ? '/en/terms,/en/privacy' : '/terms,/privacy'), hrefs.join(','))
  for (const href of hrefs) {
    const response = await page.request.get(base + href)
    check(`paywall ${tag}: ${href} exists`, response.status() === 200, `HTTP ${response.status()}`)
  }
  check(`paywall ${tag}: coupon and friend-referral code inputs hidden on native iOS`, (await page.locator('main form input[maxlength="32"]').count()) === 0)
  check(`paywall ${tag}: own referral code (sharing) still shown`, (await page.getByText('H1234567890ABCDEF').count()) === 1)
  check(`paywall ${tag}: store configured with the signed-in user's id`, JSON.stringify((await calls(page))[0]) === JSON.stringify(['configure', id]))
  if (english) {
    check('paywall en: no Chinese left in the card', !CJK.test(text), text.match(CJK)?.[0])
    const whole = await page.locator('main').innerText()
    check('paywall en: no Chinese left anywhere on the page', !CJK.test(whole), whole.match(/.{0,12}[㐀-鿿].{0,12}/)?.[0])
  }
  await layout(page, `paywall ${tag}`)
  await cardShot(page, `paywall-390-${tag}.jpg`)

  // Buy the monthly plan. The fake store succeeds; the fake server says nothing yet.
  await card(page).getByRole('button', { name: /NT\$149\.00/ }).click()
  await phase(page, 'syncing')
  const syncing = await card(page).innerText()
  check(`syncing ${tag}: says the purchase is complete and syncing`, syncing.includes(english ? 'Purchase complete — syncing' : '購買已完成，正在同步'))
  check(`syncing ${tag}: store was asked for the selected package`, JSON.stringify((await calls(page)).at(-1)) === JSON.stringify(['purchase', '$rc_monthly']))
  const heading = await page.locator('main h2').first().innerText()
  check(`syncing ${tag}: still shown as the basic plan until the server confirms`, heading === (english ? 'Currently on the free plan' : '目前使用基本版'), heading)
  check(`syncing ${tag}: not shown as subscribed, no manage-subscription link`, !syncing.includes(english ? "You're subscribed" : '你已訂閱') && (await card(page).locator('a[href*="apps.apple.com"]').count()) === 0)
  if (english) check('syncing en: no Chinese left in the card', !CJK.test(syncing), syncing.match(CJK)?.[0])
  await layout(page, `syncing ${tag}`)
  await cardShot(page, `syncing-390-${tag}.jpg`)

  // Now the server confirms: only this turns the card into "subscribed".
  const before = state.selfCalls
  state.paid_until = FUTURE
  state.pro_until = FUTURE
  await phase(page, 'ready')
  const done = await card(page).innerText()
  check(`confirmed ${tag}: server was polled, then the card shows the subscription`,
    state.selfCalls > before && done.includes(english ? 'Huddle Pro is now active.' : 'Huddle Pro 已生效。') && done.includes(english ? "You're subscribed to Huddle Pro" : '你已訂閱 Huddle Pro'))
  check(`confirmed ${tag}: manage-subscription link goes to Apple, plans no longer offered`,
    (await card(page).locator('a[href="https://apps.apple.com/account/subscriptions"]').count()) === 1 && (await card(page).locator('input[type="radio"]').count()) === 0)
  check(`confirmed ${tag}: restore still available`, await card(page).getByRole('button', { name: english ? 'Restore purchases' : '恢復購買' }).isEnabled())
  if (english) check('confirmed en: no Chinese left in the card', !CJK.test(done), done.match(CJK)?.[0])
  await layout(page, `confirmed ${tag}`)
  await cardShot(page, `subscribed-390-${tag}.jpg`)
  check(`paywall ${tag}: no page errors, nothing unexpected sent to the backend`, pageErrors.length === 0 && state.unexpected.length === 0, [...pageErrors, ...state.unexpected].join(' | '))
  await context.close()
}

// Dark theme: same card, readable.
{
  const { context, page } = await open({ ...PHONE, dark: true, billing: { packages: PACKAGES } })
  await phase(page, 'ready')
  const contrast = await page.evaluate(() => {
    const lum = (rgb) => {
      const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    // Resolve any CSS colour (oklch included) to sRGB bytes through a canvas.
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const rgb = (color) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    const ratio = (fg, bg) => { const [a, b] = [lum(rgb(fg)), lum(rgb(bg))].sort((x, y) => y - x); return Math.round(((a + 0.05) / (b + 0.05)) * 10) / 10 }
    const root = document.querySelector('[data-billing-card]')
    const style = (selector) => getComputedStyle(root.querySelector(selector))
    const panel = getComputedStyle(root).backgroundColor
    const plan = style('label').backgroundColor
    const cta = style('button[class*="primary"]')
    return {
      dark: document.documentElement.classList.contains('dark'),
      title: ratio(style('h2').color, panel), body: ratio(style('p').color, panel),
      price: ratio(style('label span:last-child').color, plan), period: ratio(style('label small').color, plan),
      cta: ratio(cta.color, cta.backgroundColor), terms: ratio(getComputedStyle(root.querySelectorAll('p')[1]).color, panel),
    }
  })
  check('dark: theme applied and every text colour in the card meets 4.5:1', contrast.dark && Object.entries(contrast).every(([key, value]) => key === 'dark' || value >= 4.5), JSON.stringify(contrast))
  await layout(page, 'dark')
  await cardShot(page, 'paywall-390-dark-zh.jpg')
  await context.close()
}

// Remaining purchase outcomes (assertions only).
{
  // Prices are whatever the store returns — never the 149 / 1,290 reference amounts.
  const foreign = [
    { identifier: '$rc_monthly', localizedPrice: 'US$4.99', subscriptionPeriod: 'P1M' },
    { identifier: '$rc_annual', localizedPrice: 'Rp 1.249.000,00', subscriptionPeriod: 'P1Y' },
  ]
  const { context, page } = await open({ ...PHONE, billing: { packages: foreign, purchase: 'cancel' } })
  await phase(page, 'ready')
  const text = await card(page).innerText()
  check('price: shows the store price and not the reference amounts', text.includes('US$4.99') && text.includes('Rp 1.249.000,00') && !/149|1,290|1290/.test(text))
  await layout(page, 'long price format')
  await card(page).locator('label[data-plan="year"]').click()
  check('plan: choosing yearly updates the subscribe button', (await card(page).getByRole('button', { name: /Rp 1\.249\.000,00/ }).count()) === 1)
  await card(page).getByRole('button', { name: /Rp 1\.249\.000,00/ }).click()
  await page.waitForFunction(() => window.__billingCalls.some((call) => call[0] === 'purchase'))
  await phase(page, 'ready')
  check('cancel: store got the yearly package; cancelling shows no message at all',
    JSON.stringify((await calls(page)).at(-1)) === JSON.stringify(['purchase', '$rc_annual'])
      && (await card(page).locator('[data-billing-notice], [role="alert"]').count()) === 0 && (await card(page).locator('input[type="radio"]').count()) === 2)
  await context.close()
}
for (const [outcome, notice, words] of [['fail', 'purchase_failed', '購買沒有完成'], ['pending', 'purchase_pending', '等待核准']]) {
  const { context, page } = await open({ ...PHONE, billing: { packages: PACKAGES, purchase: outcome } })
  await phase(page, 'ready')
  await card(page).getByRole('button', { name: /NT\$149\.00/ }).click()
  await card(page).locator(`[data-billing-notice="${notice}"]`).waitFor({ timeout: 15000 })
  const text = await card(page).innerText()
  check(`${outcome}: message shown, plans still offered, not syncing`, text.includes(words) && (await card(page).getAttribute('data-phase')) === 'ready' && (await card(page).locator('input[type="radio"]').count()) === 2)
  await layout(page, outcome)
  await context.close()
}
{
  const { context, page } = await open({ ...PHONE, billing: { packages: PACKAGES, purchase: 'hang' } })
  await phase(page, 'ready')
  await card(page).getByRole('button', { name: /NT\$149\.00/ }).click()
  await phase(page, 'purchasing')
  const cta = card(page).getByRole('button', { name: '等待 App Store 確認…' })
  check('purchasing: button shows it is waiting and cannot be pressed twice', await cta.isDisabled())
  check('purchasing: restore locked while the store sheet is up', await card(page).getByRole('button', { name: '恢復購買' }).isDisabled())
  check('purchasing: plan choice locked', await card(page).locator('fieldset').evaluate((el) => el.disabled && [...el.querySelectorAll('input')].every((input) => input.matches(':disabled'))))
  await context.close()
}
{
  const { context, page } = await open({ ...PHONE, billing: { packages: PACKAGES, list: 'hang' } })
  await phase(page, 'loading')
  check('loading: says it is loading plans, no plan or price shown yet', (await card(page).innerText()).includes('正在向 App Store 取得方案') && (await card(page).locator('input[type="radio"]').count()) === 0)
  await context.close()
}
{
  const { context, page } = await open({ ...PHONE, billing: { packages: PACKAGES, list: 'fail-once' } })
  await phase(page, 'load_failed')
  check('load failed: message and retry, restore still reachable',
    (await card(page).innerText()).includes('目前無法取得訂閱方案') && (await card(page).getByRole('button', { name: '恢復購買' }).isEnabled()))
  await layout(page, 'load failed')
  await card(page).getByRole('button', { name: '重試' }).click()
  await phase(page, 'ready')
  check('load failed: retry loads the plans', (await card(page).locator('input[type="radio"]').count()) === 2)
  await context.close()
}
{
  const { context, page } = await open({ ...PHONE, billing: { packages: PACKAGES, restore: 'none' } })
  await phase(page, 'ready')
  await card(page).getByRole('button', { name: '恢復購買' }).click()
  await card(page).locator('[data-billing-notice="restore_nothing"]').waitFor({ timeout: 15000 })
  check('restore: nothing to restore', (await card(page).innerText()).includes('沒有可恢復的 Huddle Pro 訂閱'))
  await context.close()
}
{
  const { context, page } = await open({ ...PHONE, billing: { packages: PACKAGES, restore: 'fail' } })
  await phase(page, 'ready')
  await card(page).getByRole('button', { name: '恢復購買' }).click()
  await card(page).locator('[data-billing-notice="restore_failed"]').waitFor({ timeout: 15000 })
  check('restore: failure message', (await card(page).innerText()).includes('恢復購買沒有成功'))
  await context.close()
}
{
  const { context, page, state } = await open({ ...PHONE, billing: { packages: PACKAGES, restore: 'found' } })
  await phase(page, 'ready')
  await card(page).getByRole('button', { name: '恢復購買' }).click()
  await phase(page, 'syncing')
  check('restore: found a subscription, waits for the server', (await card(page).innerText()).includes('已找到你的訂閱，正在同步'))
  state.paid_until = FUTURE
  state.pro_until = FUTURE
  await card(page).locator('[data-billing-notice="activated"]').waitFor({ timeout: 15000 })
  check('restore: server confirmation shows the subscription', (await card(page).innerText()).includes('你已訂閱 Huddle Pro'))
  await context.close()
}
{
  // Server never confirms; the wait limit is shortened through the dev hook.
  const { context, page } = await open({ ...PHONE, billing: { packages: PACKAGES, syncMaxWaitMs: 1500 } })
  await phase(page, 'ready')
  await card(page).getByRole('button', { name: /NT\$149\.00/ }).click()
  await phase(page, 'sync_delayed')
  const text = await card(page).innerText()
  check('slow sync: explains it will apply later and offers restore; still not shown as subscribed',
    text.includes('稍後會自動生效') && text.includes('恢復購買') && !text.includes('你已訂閱')
      && (await card(page).getByRole('button', { name: '恢復購買' }).isEnabled()) && (await page.locator('main h2').first().innerText()) === '目前使用基本版')
  await layout(page, 'slow sync')
  await cardShot(page, 'sync-delayed-390-zh.jpg')
  await context.close()
}
{
  // Native iOS with the launch flag off (no fake store): real loader runs and reports "not configured".
  const { context, page, pageErrors } = await open({ ...PHONE, height: 1900, billing: { nativeOnly: true } })
  await page.waitForTimeout(800)
  check('iOS, flag off: no purchase card, nothing broken',
    (await card(page).count()) === 0 && pageErrors.length === 0 && (await page.locator('main h2').first().innerText()) === '目前使用基本版')
  check('iOS, flag off: code inputs hidden, own referral code kept', (await page.locator('main form input[maxlength="32"]').count()) === 0 && (await page.getByText('H1234567890ABCDEF').count()) === 1)
  await shot(page, 'ios-flag-off-390-zh.jpg')
  await context.close()
}
{
  // Leaving the page keeps the store session; signing out releases it.
  const { context, page } = await open({ width: 1280, height: 900, billing: { packages: PACKAGES } })
  await phase(page, 'ready')
  await page.getByRole('link', { name: '回工作空間' }).click()
  await page.getByRole('button', { name: '使用者選單' }).waitFor({ timeout: 60000 })
  check('session: leaving the membership page does not log the store out', !(await calls(page)).some((call) => call[0] === 'logOut'))
  await page.getByRole('button', { name: '使用者選單' }).click({ force: true })
  await page.getByText('登出', { exact: true }).click({ force: true })
  await page.waitForFunction(() => window.__billingCalls.some((call) => call[0] === 'logOut'), null, { timeout: 15000 }).catch(() => {})
  check('session: signing out logs the store out', (await calls(page)).some((call) => call[0] === 'logOut'), JSON.stringify(await calls(page)))
  await context.close()
}

check('no request left for any host other than the dev server and the fake backend', external.size === 0, [...external].join(', '))
await browser.close()
assert.ok(results.length > 0)
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
