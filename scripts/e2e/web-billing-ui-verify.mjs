#!/usr/bin/env node
// Website-billing front end (Settings -> 訂閱, /billing/*), real browser, NO real backend.
//
//   node scripts/e2e/web-billing-ui-verify.mjs
//
// Everything the app talks to is intercepted by Playwright: Supabase Auth /
// REST / Edge Functions (`my_web_billing`, `web-billing`) and the SHOPLINE SDK
// script itself (replaced by a tiny fake that renders one input). No credentials
// are needed, nothing is sent to Supabase or SHOPLINE.
//
// Two dev servers run one after the other (Next allows one `next dev` per
// directory): flag OFF (part A) then flag ON (part B). Assertions are in code;
// every line prints PASS/FAIL; exit code 1 on any FAIL.
//
// Screenshots go to scripts/e2e/shots/web-billing/ (gitignored, never committed).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const ONLY = (process.env.E2E_ONLY || '').split(',').filter(Boolean)
const want = (id) => ONLY.length === 0 || ONLY.includes(id)
const SHOTS = path.join(process.cwd(), 'scripts/e2e/shots/web-billing')
mkdirSync(SHOTS, { recursive: true })

const SUPABASE = 'https://e2e-mock.supabase.co'
const USER_ID = '11111111-2222-4333-8444-555555555555'
const CJK = /[㐀-鿿＀-￯]/ // CJK + fullwidth punctuation

let cancelBgGlobal = ''
let failed = 0
let passed = 0
const check = (name, ok, detail = '') => {
  if (ok) passed += 1
  else failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : detail ? `  -> ${detail}` : ''}`)
}

// ── dev server ──────────────────────────────────────────────────────────────
let dev
function startServer(port, flag) {
  dev = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
      NEXT_PUBLIC_WEB_BILLING_ENABLED: flag ? 'true' : '',
      NEXT_PUBLIC_SHOPLINE_CLIENT_KEY: 'ck_test',
      NEXT_PUBLIC_SHOPLINE_MERCHANT_ID: 'mid_test',
      NEXT_PUBLIC_SHOPLINE_ENV: 'sandbox',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  })
  dev.stdout.on('data', () => {})
  dev.stderr.on('data', () => {})
}
function stopServer() {
  if (!dev?.pid) return
  try { process.kill(-dev.pid, 'SIGTERM') } catch { try { dev.kill('SIGTERM') } catch { /* gone */ } }
  dev = null
}
async function waitForServer(base, ms = 240000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { if ((await fetch(base)).status < 500) return } catch { /* not yet */ }
    await sleep(1000)
  }
  throw new Error('dev server did not start')
}

// ── fake backend ────────────────────────────────────────────────────────────
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const exp = Math.floor(Date.now() / 1000) + 3600 * 12
const ACCESS_TOKEN = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', exp })}.sig`
const USER = {
  id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'e2e@example.test',
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
}
const SESSION = { access_token: ACCESS_TOKEN, token_type: 'bearer', expires_in: 43200, expires_at: exp, refresh_token: 'e2e-refresh', user: USER }

const day = 86_400_000
const inDays = (n) => new Date(Date.now() + n * day).toISOString()
/** 00:00 Asia/Taipei of the day n days from now — what refund_deadline really looks like. */
const taipeiMidnight = (n) => {
  const d = new Date(Date.now() + n * day + 8 * 3600_000)
  return `${d.toISOString().slice(0, 10)}T00:00:00+08:00`
}
const PRICES = { monthly: 15000, annual: 99000, currency: 'TWD' }
const base = (over = {}) => ({
  checkout_available: true, trial_eligible: true, apple_active: false, prices: PRICES, trial_days: 14,
  subscription: null, card: null, payments: [], open_refund: null, ...over,
})
const sub = (over = {}) => ({
  plan: 'monthly', status: 'active', trial_end: null, current_period_end: inDays(25), cancel_at_period_end: false,
  needs_customer_action: false, grace_until: null, price_minor: 15000, ...over,
})
const CARD = { brand: 'visa', last4: '4242' }
const SCENARIOS = {
  none: base(),
  none_used: base({ trial_eligible: false }),
  unavailable: base({ checkout_available: false }),
  apple: base({ apple_active: true }),
  trialing: base({ trial_eligible: false, subscription: sub({ status: 'trialing', trial_end: inDays(10), current_period_end: inDays(10) }), card: CARD }),
  active_refundable: base({
    trial_eligible: false,
    subscription: sub({ plan: 'annual', price_minor: 99000, current_period_end: inDays(358) }), card: CARD,
    payments: [{ id: 'pay-1', date: inDays(-1), amount_minor: 99000, status: 'succeeded', refunded_minor: 0, refundable_until: taipeiMidnight(7) }],
  }),
  active_plain: base({
    trial_eligible: false, subscription: sub({ current_period_end: inDays(20) }), card: CARD,
    payments: [{ id: 'pay-2', date: inDays(-10), amount_minor: 15000, status: 'succeeded', refunded_minor: 0, refundable_until: null }],
  }),
  past_due: base({
    trial_eligible: false, card: CARD,
    subscription: sub({ status: 'past_due', needs_customer_action: true, grace_until: inDays(5), current_period_end: inDays(-2) }),
    payments: [{ id: 'pay-3', date: inDays(-2), amount_minor: 15000, status: 'failed', refunded_minor: 0, refundable_until: null }],
  }),
  past_due_plain: base({
    trial_eligible: false, card: CARD,
    subscription: sub({ status: 'past_due', needs_customer_action: false, grace_until: inDays(6), current_period_end: inDays(-1) }),
    payments: [{ id: 'pay-5', date: inDays(-1), amount_minor: 15000, status: 'failed', refunded_minor: 0, refundable_until: null }],
  }),
  canceled: base({
    trial_eligible: false, card: CARD,
    subscription: sub({ cancel_at_period_end: true, current_period_end: inDays(12) }),
    payments: [{ id: 'pay-4', date: inDays(-18), amount_minor: 15000, status: 'succeeded', refunded_minor: 0, refundable_until: null }],
  }),
  expired: base({ trial_eligible: false, subscription: sub({ status: 'expired' }) }),
}

const ERROR_CODES = ['unauthorized', 'disabled', 'native_not_allowed', 'apple_active', 'already_subscribed', 'trial_used',
  'not_found', 'not_refundable', 'payment_in_progress', 'rate_limited', 'slp_error', 'invalid_input', 'unavailable']

/** Fake SHOPLINE SDK: one text input in `element`; records its init config. */
const FAKE_SDK = `
window.ShoplinePayments = async function (config) {
  window.__slpConfig = config;
  const el = document.querySelector(config.element);
  if (!el) return { error: { message: 'no element' } };
  el.innerHTML = '<div style="padding:12px;border:1px solid #ccc;border-radius:8px"><input aria-label="card" style="width:100%;min-height:44px" placeholder="4242 4242 4242 4242"></div>';
  return { payment: {
    createPayment: async () => ({ paySession: 'ps_test_session' }),
    pay: async (na) => { window.__slpPaid = na; return undefined },
    destroy: () => { el.innerHTML = '' },
  } };
};`

/** Per-page mutable fake state + request log. */
function newBackend(initial) {
  const st = {
    snapshot: structuredClone(SCENARIOS[initial]),
    calls: [], // { action, body }
    rpcCalls: 0,
    startError: null, // error code to answer start/card_start/pay_now/cancel/... with
    after: {}, // action -> function(snapshot) mutating it after a successful call
    statusSequence: null,
  }
  return st
}

async function installBackend(context, st) {
  await context.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    }
    if (p.startsWith('/auth/v1/token')) return json(200, SESSION)
    if (p.startsWith('/auth/v1/user')) return json(200, USER)
    if (p.startsWith('/auth/v1/')) return json(200, {})
    if (p.startsWith('/functions/v1/web-billing')) {
      const body = JSON.parse(req.postData() || '{}')
      st.calls.push({ action: body.action, body })
      if (st.startError && body.action !== 'status') { st.onStartError?.(st.snapshot); return json(409, { ok: false, error: st.startError }) }
      const snap = st.snapshot
      switch (body.action) {
        case 'status': return json(200, { ok: true, billing: snap })
        case 'start': {
          st.after.start?.(snap)
          return json(200, { ok: true, subscription_id: 'sub-1', next_action: 'next-action-token' })
        }
        case 'card_start': st.after.card_start?.(snap); return json(200, { ok: true, next_action: null })
        case 'pay_now': st.after.pay_now?.(snap); return json(200, { ok: true, next_action: 'na-pay' })
        case 'customer_token': return json(200, { ok: true, customer_token: 'ct_test', expires_at: inDays(1) })
        case 'cancel': {
          snap.subscription.cancel_at_period_end = true
          return json(200, { ok: true, billing: snap })
        }
        case 'resume': {
          snap.subscription.cancel_at_period_end = false
          return json(200, { ok: true, billing: snap })
        }
        case 'refund': {
          snap.payments[0].refundable_until = null
          snap.open_refund = { status: 'processing', due_by: inDays(15) }
          snap.subscription.cancel_at_period_end = true
          return json(200, { ok: true, refund_status: 'processing', billing: snap })
        }
        default: return json(400, { ok: false, error: 'invalid_input' })
      }
    }
    if (p.startsWith('/functions/v1/')) return json(200, {})
    if (p.startsWith('/rest/v1/rpc/my_web_billing')) {
      st.rpcCalls += 1
      return json(200, st.snapshot)
    }
    if (p.startsWith('/rest/v1/rpc/')) return json(404, { code: 'PGRST202', message: 'function not found', details: null, hint: null })
    if (p.startsWith('/rest/v1/')) {
      if ((req.headers().accept || '').includes('vnd.pgrst.object')) return json(406, { code: 'PGRST116', message: 'no rows', details: null, hint: null })
      return json(req.method() === 'GET' ? 200 : 201, [])
    }
    return json(200, {})
  })
  await context.route('https://cdn.shoplinepayments.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE_SDK }))
}

async function login(browser, port) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW' })
  const st = newBackend('none')
  await installBackend(ctx, st)
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${port}/login?method=email`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.locator('#email').fill('e2e@example.test')
  await page.locator('#password').fill('not-a-real-password')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`http://localhost:${port}/`, { timeout: 120000 })
  const state = await ctx.storageState()
  await ctx.close()
  return state
}

async function openPage(browser, state, port, { scenario = 'none', viewport, lang = 'zh-TW', native = false }) {
  const ctx = await browser.newContext({ viewport, locale: lang === 'en' ? 'en-US' : 'zh-TW', storageState: state })
  const st = newBackend(scenario)
  await installBackend(ctx, st)
  await ctx.addInitScript(([l, nat]) => {
    try { localStorage.setItem('waddle-language-v1', l) } catch { /* */ }
    try { sessionStorage.setItem('huddle-tour-seen', '1') } catch { /* */ }
    if (nat) {
      // Pretend to be the iOS WKWebView shell: @capacitor/core decides "native" from
      // webkit.messageHandlers.bridge; every native plugin call is answered with {}.
      window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
      window.Capacitor = {
        PluginHeaders: { find: () => ({ name: '*', methods: { find: () => ({ rtype: 'promise' }) } }) },
        nativePromise: async () => ({}),
        nativeCallback: () => 'cb',
      }
    }
  }, [lang, native])
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  const cspErrors = []
  const consoleErrors = []
  const badResponses = []
  page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${new URL(r.url()).pathname}`) })
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) cspErrors.push(m.text())
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300))
  })
  return { ctx, page, st, pageErrors, cspErrors, consoleErrors, badResponses }
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })

async function hOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement.scrollWidth - window.innerWidth
    const scroller = document.querySelector('[data-testid="sub-live"], [data-testid="sub-none"]')?.closest('.overflow-y-auto')
    const inner = scroller ? scroller.scrollWidth - scroller.clientWidth : 0
    return { doc, inner }
  })
}

async function smallTargets(page, rootSelector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) return ['(root missing)']
    return [...root.querySelectorAll('button, a[href], input[type="checkbox"], input[type="radio"]')]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => {
        const target = el.closest('label') ?? el
        return target.getBoundingClientRect().height < 43.5
      })
      .map((el) => (el.textContent || el.getAttribute('data-testid') || el.tagName).trim().slice(0, 30))
  }, rootSelector)
}

async function openSubscriptionTab(page, port) {
  await page.goto(`http://localhost:${port}/?settings=subscription`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForSelector('[data-testid="sub-live"], [data-testid="sub-none"], [data-testid="sub-load-error"]', { timeout: 120000 })
}

// ── part A: flag OFF ────────────────────────────────────────────────────────
async function partA(browser, port, state) {
  console.log('\n== Part A: flag OFF — live site must look unchanged ==')
  for (const [name, viewport] of [['1280', { width: 1280, height: 900 }], ['390', { width: 390, height: 844 }]]) {
    const o = await openPage(browser, state, port, { viewport })
    await o.page.goto(`http://localhost:${port}/?settings=subscription`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
    await sleep(2500)
    const settingsOpen = await o.page.getByText('一般設定', { exact: true }).count()
    check(`A@${name}: ?settings=subscription does NOT open settings`, settingsOpen === 0, `settingsOpen=${settingsOpen}`)
    // open settings the normal way and look at the tabs
    if (name === '1280') {
      await o.page.getByRole('button', { name: '設定', exact: true }).first().click({ timeout: 60000 }).catch(() => {})
      await sleep(1000)
      const modal = o.page.locator('[role="dialog"]').first()
      const tabsText = await modal.innerText().catch(() => '')
      check('A@1280: settings modal opens', /一般設定/.test(tabsText), tabsText.slice(0, 80))
      check('A@1280: no 訂閱 tab in settings', await o.page.locator('[data-testid="settings-tab-subscription"]').count() === 0 && !/訂閱/.test(tabsText))
      check('A@1280: footer keeps 取消／儲存', /取消/.test(tabsText) && /儲存/.test(tabsText))
      await shot(o.page, 'A-flag-off-settings-1280')
    }
    check(`A@${name}: no my_web_billing / web-billing request`, o.st.rpcCalls === 0 && o.st.calls.length === 0, `rpc=${o.st.rpcCalls} fn=${o.st.calls.length}`)
    await o.ctx.close()
  }
  for (const route of ['/billing', '/billing/return', '/billing/card', '/billing/pay']) {
    const o = await openPage(browser, state, port, { viewport: { width: 390, height: 844 } })
    await o.page.goto(`http://localhost:${port}${route}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.waitForSelector('[data-testid="billing-unavailable"]', { timeout: 60000 }).catch(() => {})
    const text = await o.page.evaluate(() => document.body.innerText)
    check(`A ${route}: shows only 「這個頁面目前不可用」`, (await o.page.locator('[data-testid="billing-unavailable"]').count()) === 1 && /這個頁面目前不可用/.test(text) && !/試用|NT\$|信用卡/.test(text), text.slice(0, 120))
    check(`A ${route}: no billing requests, no SDK`, o.st.rpcCalls === 0 && o.st.calls.length === 0)
    if (route === '/billing') await shot(o.page, 'A-flag-off-billing-390')
    await o.ctx.close()
  }
}

// ── part B: flag ON ─────────────────────────────────────────────────────────
const TAB_EXPECT = {
  none: { root: 'sub-none', has: ['開始免費試用'], hasNot: ['取消續訂', '申請退款'] },
  none_used: { root: 'sub-none', has: ['訂閱 Pro'], hasNot: ['開始免費試用'] },
  unavailable: { root: 'sub-none', has: ['尚未對你的帳號開放'], hasNot: ['開始免費試用'] },
  apple: { root: 'sub-none', has: ['Apple', 'iPhone'], hasNot: ['開始免費試用', '訂閱 Pro', '/billing'] },
  trialing: { root: 'sub-live', has: ['試用中', '下次扣款', 'NT$150', 'VISA •••• 4242', '取消續訂', '更換信用卡', '免費試用中，', '前取消不會扣款'], hasNot: ['申請退款', '立即付款', '恢復續訂'] },
  active_refundable: { root: 'sub-live', has: ['使用中', 'Pro 年繳', 'NT$990', '申請退款', '23:59', '扣款紀錄', '取消續訂'], hasNot: ['立即付款'] },
  active_plain: { root: 'sub-live', has: ['使用中', '已付款', '取消續訂'], hasNot: ['申請退款'] },
  past_due: { root: 'sub-live', has: ['付款失敗', '立即付款', '請在 ', ' 前補付，逾期 Pro 會停用', '本人確認', '未成功'], hasNot: ['申請退款'] },
  past_due_plain: { root: 'sub-live', has: ['付款失敗', '立即付款', ' 前補付，逾期 Pro 會停用', '這一期的扣款沒有成功', '更換信用卡'], hasNot: ['本人確認', '申請退款'] },
  canceled: { root: 'sub-live', has: ['已取消', '恢復續訂', 'Pro 可使用到'], hasNot: ['下次扣款', '申請退款'] },
  expired: { root: 'sub-none', has: ['已經結束', '訂閱 Pro'], hasNot: ['取消續訂'] },
}

async function partBTabs(browser, port, state) {
  if (want('B1')) {
  console.log('\n== Part B1: Settings -> 訂閱 states, 390px and 1280px ==')
  for (const [sizeName, viewport] of [['390', { width: 390, height: 844 }], ['1280', { width: 1280, height: 900 }]]) {
    for (const [scenario, exp_] of Object.entries(TAB_EXPECT)) {
      const o = await openPage(browser, state, port, { scenario, viewport })
      await openSubscriptionTab(o.page, port)
      const tag = `B1 ${scenario}@${sizeName}`
      const text = await o.page.locator(`[data-testid="${exp_.root}"]`).innerText()
      const missing = exp_.has.filter((s) => !text.includes(s))
      const extra = exp_.hasNot.filter((s) => text.includes(s))
      check(`${tag}: shows expected state text`, missing.length === 0, `missing: ${missing.join(' | ')}  (text: ${text.replace(/\n/g, ' / ').slice(0, 200)})`)
      check(`${tag}: hides what must not be there`, extra.length === 0, `unexpected: ${extra.join(' | ')}`)
      const modalHtmlOk = await o.page.locator('[data-testid="settings-tab-subscription"]').count()
      check(`${tag}: 訂閱 tab present, URL param cleaned`, modalHtmlOk === 1 && !o.page.url().includes('settings='), o.page.url())
      const ov = await hOverflow(o.page)
      check(`${tag}: no horizontal overflow (page ${ov.doc}, panel ${ov.inner})`, ov.doc <= 0 && ov.inner <= 0)
      const small = await smallTargets(o.page, `[data-testid="${exp_.root}"]`)
      check(`${tag}: buttons/links >= 44px`, small.length === 0, small.join(', '))
      check(`${tag}: no page errors`, o.pageErrors.length === 0, o.pageErrors.join(' | '))
      if (scenario === 'trialing') {
        const tabs = await o.page.evaluate(() => {
          const btns = [...document.querySelectorAll('[role="dialog"] button, [data-testid="settings-tab-subscription"]')].filter((b) => /一般設定|提醒設定|時間區塊|共享|訂閱/.test(b.textContent || '') && b.className.includes('flex-1'))
          const nav = btns[0]?.parentElement
          return { heights: btns.map((b) => Math.round(b.getBoundingClientRect().height)), overflow: nav ? nav.scrollWidth - nav.clientWidth : -1, n: btns.length }
        })
        check(`${tag}: 5 settings tabs, each on ONE line (same height), tab strip does not scroll`, tabs.n === 5 && new Set(tabs.heights).size === 1 && tabs.overflow <= 0, JSON.stringify(tabs))
        check(`${tag}: console errors are only the mock's 404s on unrelated RPCs (nothing from billing code, no React errors)`, o.consoleErrors.every((m) => /Failed to load resource|\[calendar-sharing\] load peers failed/.test(m)) && !o.badResponses.some((r) => /billing/.test(r)), o.consoleErrors.filter((m) => !/Failed to load resource|\[calendar-sharing\] load peers failed/.test(m)).join(' | ') || o.badResponses.join(', '))
        console.log(`INFO  ${tag}: console.error count=${o.consoleErrors.length}; failing requests: ${[...new Set(o.badResponses)].join(', ') || 'none'}`)
      }
      await shot(o.page, `B1-${scenario}-${sizeName}`)
      await o.ctx.close()
    }
  }

  }

  if (want('B2')) {
  console.log('\n== Part B2: two-step confirmations (cancel / refund) ==')
  {
    const o = await openPage(browser, state, port, { scenario: 'active_refundable', viewport: { width: 390, height: 844 } })
    await openSubscriptionTab(o.page, port)
    await o.page.getByTestId('sub-cancel').click()
    check('B2: cancel asks first', await o.page.getByTestId('confirm-cancel').isVisible())
    check('B2: cancel NOT sent before confirming', !o.st.calls.some((c) => c.action === 'cancel'))
    cancelBgGlobal = await o.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="confirm-cancel-confirm"]')).backgroundColor)
    await shot(o.page, 'B2-cancel-confirm-390')
    await o.page.getByTestId('confirm-cancel-back').click()
    check('B2: "先不要" closes the confirmation, nothing sent', (await o.page.getByTestId('confirm-cancel').count()) === 0 && !o.st.calls.some((c) => c.action === 'cancel'))
    await o.page.getByTestId('sub-refund').click()
    check('B2: refund asks first (shows amount)', (await o.page.getByTestId('confirm-refund').innerText()).includes('NT$990'))
    const strength = await o.page.evaluate(() => {
      const bg = (id) => getComputedStyle(document.querySelector(`[data-testid="${id}"]`)).backgroundColor
      const emp = document.querySelector('[data-testid="confirm-refund-emphasis"]')
      return { refundBtn: bg('confirm-refund-confirm'), emphWeight: emp ? Number(getComputedStyle(emp).fontWeight) : 0, emphText: emp?.textContent ?? '' }
    })
    check('B2: refund confirm is a solid filled button (different from cancel\'s light one), with a bold 「Pro 會立刻停止」 line', !/rgba\(0, 0, 0, 0\)/.test(strength.refundBtn) && strength.refundBtn !== cancelBgGlobal && strength.emphWeight >= 700 && /Pro 會立刻停止/.test(strength.emphText), JSON.stringify({ ...strength, cancelBg: cancelBgGlobal }))
    check('B2: refund NOT sent before confirming', !o.st.calls.some((c) => c.action === 'refund'))
    await shot(o.page, 'B2-refund-confirm-390')
    await o.page.getByTestId('confirm-refund-confirm').click()
    await o.page.getByTestId('sub-refund-open').waitFor({ timeout: 20000 })
    const refundCall = o.st.calls.find((c) => c.action === 'refund')
    check('B2: refund sent once with the payment id after confirming', o.st.calls.filter((c) => c.action === 'refund').length === 1 && refundCall?.body.payment_id === 'pay-1', JSON.stringify(refundCall))
    check('B2: after refund request the refund button is gone and progress is shown', (await o.page.getByTestId('sub-refund').count()) === 0)
    await o.ctx.close()
  }
  {
    const o = await openPage(browser, state, port, { scenario: 'trialing', viewport: { width: 1280, height: 900 } })
    await openSubscriptionTab(o.page, port)
    await o.page.getByTestId('sub-cancel').click()
    await o.page.getByTestId('confirm-cancel-confirm').click()
    await o.page.getByTestId('sub-resume').waitFor({ timeout: 20000 })
    check('B2: cancel sent once after confirming; badge now says canceled; resume offered',
      o.st.calls.filter((c) => c.action === 'cancel').length === 1 && /已取消/.test(await o.page.getByTestId('sub-badge').innerText()))
    await shot(o.page, 'B2-after-cancel-1280')
    await o.page.getByTestId('sub-resume').click()
    await o.page.getByTestId('sub-cancel').waitFor({ timeout: 20000 })
    check('B2: resume sent, cancel button back', o.st.calls.some((c) => c.action === 'resume'))
    await o.ctx.close()
  }
  {
    // a failing cancel shows a friendly message, not a raw code
    const o = await openPage(browser, state, port, { scenario: 'active_plain', viewport: { width: 390, height: 844 } })
    await openSubscriptionTab(o.page, port)
    o.st.startError = 'rate_limited'
    await o.page.getByTestId('sub-cancel').click()
    await o.page.getByTestId('confirm-cancel-confirm').click()
    const msg = await o.page.getByTestId('sub-action-error').innerText()
    check('B2: failed cancel shows friendly Chinese message', /太頻繁/.test(msg) && !msg.includes('rate_limited'), msg)
    await o.ctx.close()
  }

  }

  if (want('B3')) {
  console.log('\n== Part B3: English has no leftover Chinese ==')
  for (const scenario of ['none', 'trialing', 'active_refundable', 'past_due', 'past_due_plain', 'canceled', 'apple', 'expired', 'unavailable']) {
    const o = await openPage(browser, state, port, { scenario, viewport: { width: 390, height: 844 }, lang: 'en' })
    await openSubscriptionTab(o.page, port)
    const root = (await o.page.locator('[data-testid="sub-live"]').count()) ? 'sub-live' : 'sub-none'
    if (scenario === 'active_refundable') {
      await o.page.getByTestId('sub-cancel').click()
      const t1 = await o.page.getByTestId('confirm-cancel').innerText()
      check('B3 en cancel confirmation: no Chinese', !CJK.test(t1), t1)
      await o.page.getByTestId('confirm-cancel-back').click()
      await o.page.getByTestId('sub-refund').click()
      const t2 = await o.page.getByTestId('confirm-refund').innerText()
      check('B3 en refund confirmation: no Chinese', !CJK.test(t2), t2)
      await o.page.getByTestId('confirm-refund-back').click()
    }
    const text = await o.page.locator(`[data-testid="${root}"]`).innerText()
    check(`B3 en ${scenario}: no Chinese in the tab`, !CJK.test(text), text.match(CJK) ? text.slice(Math.max(0, text.search(CJK) - 30), text.search(CJK) + 40).replace(/\n/g, ' / ') : '')
    if (scenario === 'trialing') {
      const strip = await o.page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')].filter((b) => b.className.includes('flex-1') && b.className.includes('py-2.5'))
        const nav = btns[0]?.parentElement
        return { labels: btns.map((b) => (b.textContent || '').trim()), heights: btns.map((b) => Math.round(b.getBoundingClientRect().height)), overflow: nav ? nav.scrollWidth - nav.clientWidth : -1 }
      })
      check('B3 en: settings tab strip has no Chinese ("Subscription" tab), 5 tabs on one line, no scrolling', strip.labels.length === 5 && !strip.labels.some((l) => CJK.test(l)) && strip.labels.includes('Subscription') && new Set(strip.heights).size === 1 && strip.overflow <= 0, JSON.stringify(strip))
      await shot(o.page, 'B3-en-trialing-390')
    }
    if (scenario === 'past_due_plain') await shot(o.page, 'B3-en-past_due_plain-390')
    await o.ctx.close()
  }
}

  }

async function partBPages(browser, port, state) {
  if (want('B4')) {
  console.log('\n== Part B4: /billing purchase page ==')
  for (const [sizeName, viewport] of [['390', { width: 390, height: 844 }], ['1280', { width: 1280, height: 900 }]]) {
    const o = await openPage(browser, state, port, { scenario: 'none', viewport })
    await o.page.goto(`http://localhost:${port}/billing`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.getByTestId('billing-submit').waitFor({ timeout: 120000 })
    await o.page.waitForFunction(() => !!window.__slpConfig, null, { timeout: 30000 })
    const tag = `B4 /billing@${sizeName}`
    const text = await o.page.evaluate(() => document.body.innerText)
    for (const s of ['付款前請確認', 'NT$150', 'NT$990', '免費試用 14 天', '自動續訂', '取消續訂', 'SHOPLINE Payments', '法定代理人', '服務條款', '取消與退款']) {
      check(`${tag}: discloses 「${s}」`, text.includes(s))
    }
    const summary = await o.page.evaluate(() => { const el = document.querySelector('[data-testid="disclosure-summary"]'); const ul = el?.parentElement?.querySelector('ul'); return { text: el?.textContent ?? '', weight: el ? Number(getComputedStyle(el).fontWeight) : 0, aboveList: !!(el && ul && (el.compareDocumentPosition(ul) & Node.DOCUMENT_POSITION_FOLLOWING)) } })
    check(`${tag}: bold summary line above the bullets (trial end date + amount)`, summary.weight >= 700 && summary.aboveList && /\d{4}\/\d{2}\/\d{2}/.test(summary.text) && summary.text.includes('NT$150'), JSON.stringify(summary))
    check(`${tag}: trial charge date shown (will be charged NT$150 on <date>)`, /試用到 \d{4}\/\d{2}\/\d{2} 結束，我們會在 \d{4}\/\d{2}\/\d{2} 自動扣款 NT\$150/.test(text), text.match(/免費試用 14 天[^\n]*/)?.[0])
    const cfg = await o.page.evaluate(() => window.__slpConfig)
    check(`${tag}: SDK init config (key, merchant, TWD, minor-unit amount, bindCard, mustAccept)`,
      cfg.clientKey === 'ck_test' && cfg.merchantId === 'mid_test' && cfg.currency === 'TWD' && cfg.amount === 15000 &&
      cfg.paymentMethod === 'CreditCard' && cfg.env === 'sandbox' && cfg.paymentInstrument.bindCard.enable === true &&
      cfg.paymentInstrument.bindCard.protocol.mustAccept === true, JSON.stringify(cfg))
    check(`${tag}: submit disabled until the agreement box is ticked`, await o.page.getByTestId('billing-submit').isDisabled())
    const ov = await o.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(`${tag}: no horizontal overflow`, ov <= 0, String(ov))
    const small = await smallTargets(o.page, 'main')
    check(`${tag}: buttons/links/inputs >= 44px`, small.length === 0, small.join(', '))
    check(`${tag}: no CSP violations / page errors`, o.cspErrors.length === 0 && o.pageErrors.length === 0, [...o.cspErrors, ...o.pageErrors].join(' | '))
    await shot(o.page, `B4-purchase-${sizeName}`)

    if (sizeName === '390') {
      // annual plan re-inits the SDK with the annual amount
      await o.page.getByTestId('plan-annual').check()
      await o.page.waitForFunction(() => window.__slpConfig?.amount === 99000, null, { timeout: 15000 })
      check(`${tag}: choosing annual re-inits SDK with 99000 and shows NT$990`, (await o.page.evaluate(() => document.body.innerText)).includes('NT$990／年'))
      await o.page.getByTestId('plan-monthly').check()
      await o.page.waitForFunction(() => window.__slpConfig?.amount === 15000, null, { timeout: 15000 })
      // pay: success path -> start -> pay(nextAction) -> /billing/return -> polls status -> ok
      await o.page.getByTestId('agree').check()
      check(`${tag}: submit enabled after agreement`, await o.page.getByTestId('billing-submit').isEnabled())
      o.st.after.start = (snap) => {
        snap.subscription = sub({ status: 'trialing', trial_end: inDays(14), current_period_end: inDays(14) })
        snap.card = CARD
      }
      await o.page.getByTestId('billing-submit').click()
      await o.page.getByTestId('return-ok').waitFor({ timeout: 60000 })
      const startCall = o.st.calls.find((c) => c.action === 'start')
      check(`${tag}: start carries expectTrial=true (page offered a trial)`, startCall?.body.expectTrial === true, JSON.stringify(startCall?.body))
      check(`${tag}: start called with plan, paySession, locale`, startCall?.body.plan === 'monthly' && startCall.body.paySession === 'ps_test_session' && startCall.body.locale === 'zh-TW', JSON.stringify(startCall))
      check(`${tag}: SDK pay() was handed the next_action from the server`, (await o.page.evaluate(() => window.__slpPaid)) === 'next-action-token')
      check(`${tag}: /billing/return confirms the trial`, (await o.page.getByTestId('return-ok').innerText()).includes('免費試用已經開始'))
      await shot(o.page, 'B4-return-ok-390')
    }
    await o.ctx.close()
  }

  // trial used elsewhere after the page loaded: server answers trial_used (nothing charged)
  {
    const o = await openPage(browser, state, port, { scenario: 'none', viewport: { width: 390, height: 844 } })
    await o.page.goto(`http://localhost:${port}/billing`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.getByTestId('billing-submit').waitFor({ timeout: 120000 })
    await o.page.waitForFunction(() => !!window.__slpConfig, null, { timeout: 30000 })
    check('B4 trial_used: page first offers the free trial', (await o.page.getByTestId('disclosure-trial').count()) === 1)
    await o.page.getByTestId('agree').check()
    o.st.startError = 'trial_used'
    o.st.onStartError = (snap) => { snap.trial_eligible = false } // the trial got used in another tab
    await o.page.getByTestId('billing-submit').click()
    await o.page.getByTestId('billing-submit-error').waitFor({ timeout: 20000 })
    await o.page.getByTestId('disclosure-charge').waitFor({ timeout: 20000 })
    const msg = await o.page.getByTestId('billing-submit-error').innerText()
    const errBox = await o.page.getByTestId('billing-submit-error').boundingBox()
    const vh = await o.page.evaluate(() => window.innerHeight)
    await sleep(800) // smooth scroll
    const errBox2 = await o.page.getByTestId('billing-submit-error').boundingBox()
    check('B4 trial_used: the error is scrolled into view next to the submit button', !!errBox2 && errBox2.y >= 0 && errBox2.y + errBox2.height <= vh, JSON.stringify({ errBox, errBox2, vh }))
    check('B4 trial_used: friendly message says nothing was charged', /用過免費試用/.test(msg) && /還沒有被扣款/.test(msg), msg)
    check('B4 trial_used: page re-read the state and now shows the paid offer (charged today, 「付款並開通 Pro」)', (await o.page.getByTestId('disclosure-charge').innerText()).includes('今天就會扣款') && (await o.page.getByTestId('billing-submit').innerText()).includes('付款並開通 Pro'))
    check('B4 trial_used: agreement unticked, submit disabled until the member agrees again', !(await o.page.getByTestId('agree').isChecked()) && await o.page.getByTestId('billing-submit').isDisabled())
    check('B4 trial_used: nothing else was sent (single start call)', o.st.calls.filter((c) => c.action === 'start').length === 1)
    await shot(o.page, 'B4-trial-used-390')
    await o.ctx.close()
  }

  // not eligible for trial -> direct charge wording
  {
    const o = await openPage(browser, state, port, { scenario: 'none_used', viewport: { width: 390, height: 844 } })
    await o.page.goto(`http://localhost:${port}/billing`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.getByTestId('billing-submit').waitFor({ timeout: 120000 })
    const text = await o.page.evaluate(() => document.body.innerText)
    check('B4 no-trial: says it charges today, button 「付款並開通 Pro」', text.includes('今天就會扣款 NT$150') && text.includes('付款並開通 Pro') && !text.includes('開始免費試用'))
    await o.ctx.close()
  }

  // gates
  for (const [scenario, testId, label] of [['unavailable', 'billing-disabled', 'closed to this account'], ['apple', 'billing-apple', 'Apple subscriber'], ['trialing', 'billing-already', 'already subscribed']]) {
    const o = await openPage(browser, state, port, { scenario, viewport: { width: 390, height: 844 } })
    await o.page.goto(`http://localhost:${port}/billing`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.getByTestId(testId).waitFor({ timeout: 120000 })
    check(`B4 gate (${label}): notice shown, no card form, no SDK`, (await o.page.getByTestId('slp-container').count()) === 0 && !(await o.page.evaluate(() => !!window.__slpConfig)))
    await o.ctx.close()
  }

  }

  if (want('B5')) {
  console.log('\n== Part B5: every error code has friendly zh + en text ==')
  for (const lang of ['zh-TW', 'en']) {
    const o = await openPage(browser, state, port, { scenario: 'none', viewport: { width: 390, height: 844 }, lang })
    await o.page.goto(`http://localhost:${port}/billing`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.getByTestId('billing-submit').waitFor({ timeout: 120000 })
    await o.page.waitForFunction(() => !!window.__slpConfig, null, { timeout: 30000 })
    await o.page.getByTestId('agree').check()
    const seen = new Set()
    let bad = []
    for (const code of ERROR_CODES) {
      o.st.startError = code
      if (!(await o.page.getByTestId('agree').isChecked())) await o.page.getByTestId('agree').check()
      await o.page.getByTestId('billing-submit').click()
      await o.page.getByTestId('billing-submit-error').waitFor({ timeout: 20000 })
      const msg = (await o.page.getByTestId('billing-submit-error').innerText()).trim()
      const okMsg = msg.length > 8 && msg !== code && !(code.includes('_') && msg.includes(code)) && !/undefined|\[object/.test(msg) && (lang === 'en' ? !CJK.test(msg) : CJK.test(msg)) && !seen.has(msg)
      seen.add(msg)
      if (!okMsg) bad.push(`${code}: ${msg}`)
      await o.page.waitForFunction(() => document.querySelector('[data-testid="billing-submit"]')?.getAttribute('aria-busy') !== 'true' && !document.querySelector('[data-testid="agree"]')?.disabled, null, { timeout: 15000 })
    }
    check(`B5 ${lang}: 13 error codes -> 13 distinct friendly messages`, bad.length === 0 && seen.size === 13, `${bad.join(' || ')} (distinct=${seen.size}: ${[...seen].map((m) => m.slice(0, 25)).join(' ; ')})`)
    await o.ctx.close()
  }

  }

  if (want('B6')) {
  console.log('\n== Part B6: English purchase / return / card / pay pages ==')
  {
    const o = await openPage(browser, state, port, { scenario: 'none', viewport: { width: 390, height: 844 }, lang: 'en' })
    await o.page.goto(`http://localhost:${port}/billing`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.getByTestId('billing-submit').waitFor({ timeout: 120000 })
    const text = await o.page.evaluate(() => document.body.innerText)
    check('B6 en /billing: no Chinese', !CJK.test(text), text.match(CJK) ? text.slice(Math.max(0, text.search(CJK) - 30), text.search(CJK) + 40) : '')
    check('B6 en /billing: SDK language en', (await o.page.evaluate(() => window.__slpConfig.language)) === 'en')
    await shot(o.page, 'B6-en-purchase-390')
    await o.ctx.close()
  }
  {
    // card change
    const o = await openPage(browser, state, port, { scenario: 'trialing', viewport: { width: 390, height: 844 } })
    await o.page.goto(`http://localhost:${port}/billing/card`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.getByTestId('card-submit').waitFor({ timeout: 120000 })
    check('B7 /billing/card: shows current card', (await o.page.getByTestId('card-current').innerText()).includes('4242'))
    await o.page.waitForFunction(() => !!window.__slpConfig, null, { timeout: 30000 })
    o.st.after.card_start = (snap) => { snap.card = { brand: 'mastercard', last4: '5555' } }
    await o.page.getByTestId('card-submit').click()
    await o.page.getByTestId('return-ok').waitFor({ timeout: 60000 })
    check('B7 /billing/card -> return: card_start sent, success shown', o.st.calls.some((c) => c.action === 'card_start' && c.body.paySession === 'ps_test_session') && (await o.page.getByTestId('return-ok').innerText()).includes('新的信用卡'))
    await shot(o.page, 'B7-card-return-390')
    await o.ctx.close()
  }
  {
    // pay now (past_due)
    const o = await openPage(browser, state, port, { scenario: 'past_due', viewport: { width: 390, height: 844 } })
    await o.page.goto(`http://localhost:${port}/billing/pay`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.getByTestId('pay-submit').waitFor({ timeout: 120000 })
    await o.page.waitForFunction(() => !!window.__slpConfig, null, { timeout: 30000 })
    check('B8 /billing/pay: amount shown, SDK got customerToken', (await o.page.getByTestId('pay-amount').innerText()).includes('NT$150') && (await o.page.evaluate(() => window.__slpConfig.customerToken)) === 'ct_test')
    o.st.after.pay_now = (snap) => { snap.subscription = sub({ status: 'active' }) }
    await o.page.getByTestId('pay-submit').click()
    await o.page.getByTestId('return-ok').waitFor({ timeout: 60000 })
    check('B8 /billing/pay -> return: pay_now sent, success shown', o.st.calls.some((c) => c.action === 'pay_now') && (await o.page.getByTestId('return-ok').innerText()).includes('付款完成'))
    await shot(o.page, 'B8-pay-return-390')
    await o.ctx.close()
  }
  {
    // pay page when nothing is due
    const o = await openPage(browser, state, port, { scenario: 'trialing', viewport: { width: 390, height: 844 } })
    await o.page.goto(`http://localhost:${port}/billing/pay`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.getByTestId('pay-none').waitFor({ timeout: 120000 })
    check('B8 /billing/pay with nothing due: friendly note, no card form', (await o.page.getByTestId('slp-container').count()) === 0)
    await o.ctx.close()
  }
  {
    // return page: stays in "waiting" then gives up politely (status never completes) — shortened by an unreachable condition
    const o = await openPage(browser, state, port, { scenario: 'none', viewport: { width: 390, height: 844 } })
    await o.page.goto(`http://localhost:${port}/billing/return?k=start&ref=abc`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.getByTestId('return-wait').waitFor({ timeout: 120000 })
    check('B9 /billing/return polls `status` (waiting state shown, status called)', o.st.calls.some((c) => c.action === 'status'))
    await o.page.getByTestId('return-slow').waitFor({ timeout: 75000 })
    const widths = await o.page.evaluate(() => { const root = document.querySelector('[data-testid="return-slow"]'); const w = root.getBoundingClientRect().width; return { w, links: [...root.querySelectorAll('a')].map((a) => ({ t: a.textContent.trim(), w: Math.round(a.getBoundingClientRect().width) })) } })
    check('B9 /billing/return gives up after ~60s with a "still processing" note; full-width 「回到 Huddle」 and 「查看訂閱」 buttons', widths.links.length === 2 && widths.links.some((l) => l.t === '回到 Huddle') && widths.links.every((l) => l.w >= widths.w - 2), JSON.stringify(widths))
    await shot(o.page, 'B9-return-slow-390')
    await o.ctx.close()
  }

  }

  if (want('B10')) {
  console.log('\n== Part B10: native shell safety (spoofed iOS WebView) ==')
  for (const route of ['/billing', '/billing/card']) {
    const o = await openPage(browser, state, port, { scenario: 'none', viewport: { width: 390, height: 844 }, native: true })
    if (process.env.E2E_DEBUG) { o.page.on('requestfailed', (r) => console.log('   [reqfailed]', r.url().slice(0, 160), r.failure()?.errorText)); o.page.on('framenavigated', (f) => console.log('   [nav]', f.url())); o.page.on('request', (r) => { if (r.url().includes('_rsc')) console.log('   [rsc]', r.url().slice(0, 140)) }) }
    if (process.env.E2E_DEBUG) o.page.on('console', (m) => console.log('   [console]', m.type(), m.text().slice(0, 300)))
    await o.page.goto(`http://localhost:${port}${route}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await sleep(6000)
    if (process.env.E2E_DEBUG) console.log('   url=', o.page.url(), 'errors=', o.pageErrors.join('|'))
    const text = await o.page.evaluate(() => document.body.innerText)
    const isNativeNow = await o.page.evaluate(() => window.Capacitor?.isNativePlatform?.() === true).catch(() => false)
    check(`B10 native ${route}: shell detected as native (test validity)`, isNativeNow)
    check(`B10 native ${route}: no purchase text, no billing requests, SDK never loaded`, !/試用|NT\$|信用卡|Pro/.test(text) && o.st.rpcCalls === 0 && o.st.calls.length === 0 && !(await o.page.evaluate(() => !!window.__slpConfig)), text.slice(0, 120))
    check(`B10 native ${route}: sent back to home`, !new URL(o.page.url()).pathname.startsWith('/billing'), o.page.url())
    await o.ctx.close()
  }
  {
    const o = await openPage(browser, state, port, { scenario: 'none', viewport: { width: 1280, height: 900 }, native: true })
    await o.page.goto(`http://localhost:${port}/?settings=subscription`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await o.page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
    await sleep(3000)
    check('B10 native: ?settings=subscription opens nothing and no billing requests', (await o.page.locator('[data-testid="settings-tab-subscription"]').count()) === 0 && o.st.rpcCalls === 0)
    await o.ctx.close()
  }
  }

}

async function main() {
  const browser = await chromium.launch()
  try {
    let port = 3211
    let state
    if (want('A')) {
      startServer(port, false)
      await waitForServer(`http://localhost:${port}/login`)
      state = await login(browser, port)
      check('login with the fake backend', true)
      await partA(browser, port, state)
      stopServer()
      await sleep(3000)
    }

    // Part B — flag on
    if (['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B10'].some(want)) {
      port = 3212
      startServer(port, true)
      await waitForServer(`http://localhost:${port}/login`)
      state = await login(browser, port)
      await partBTabs(browser, port, state)
      await partBPages(browser, port, state)
    }
  } finally {
    await browser.close()
    stopServer()
  }
  console.log('\nscreenshots:')
  if (existsSync(SHOTS)) for (const f of readdirSync(SHOTS).sort()) console.log(`  ${path.join('scripts/e2e/shots/web-billing', f)}  ${statSync(path.join(SHOTS, f)).size} bytes`)
  console.log(`\n${passed} PASS, ${failed} FAIL`)
  console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
  process.exitCode = failed === 0 ? 0 : 1
}
main().catch((e) => { console.error(e); stopServer(); process.exit(1) })
