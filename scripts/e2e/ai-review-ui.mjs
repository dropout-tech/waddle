/* eslint-disable no-console -- end-to-end verification script, stdout is the evidence */
// AI review front-end, real browser, everything mocked.
//
//   pnpm dev -p 3190            (in another terminal; any NEXT_PUBLIC_SUPABASE_URL ending in .supabase.co works)
//   node scripts/e2e/ai-review-ui.mjs
//   E2E_BASE_URL=http://127.0.0.1:3190 E2E_CHECK_BUILD=1 node scripts/e2e/ai-review-ui.mjs   (also greps .next for test hooks)
//   pnpm build && E2E_ONLY_BUILD=1 E2E_CHECK_BUILD=1 node scripts/e2e/ai-review-ui.mjs        (only the production-bundle check)
//
// Every request to *.supabase.co is intercepted with page.route: sign-in, task
// data, the `ai-review` Edge Function (responses follow docs/features/ai-review-design.md §4)
// and the ai_review_reports table. Nothing reaches a real Supabase project or OpenAI.
//
// Covers spec F1-F8 UI acceptance: invisible gate (status failures, empty operator
// info), consent flow, plain-text report, quota / empty states, history delete
// confirmation, English without leftover Chinese, and 390x844 touch targets.
// Exit code 1 when any check fails. Screenshots: scripts/e2e/shots/ai-review/.
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3190'
const SHOTS = path.join(process.cwd(), 'scripts/e2e/shots/ai-review')
mkdirSync(SHOTS, { recursive: true })

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const user = {
  id: id(1),
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ai-review-ui@example.invalid',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
}
const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
  JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' }),
).toString('base64url')}.fake`

const OPERATOR = { name: 'Test Operator', email: 'operator@example.invalid' }
const CJK = /[㐀-鿿豈-﫿]/
const EVIL = 'https://evil.example'

let failed = 0
let passed = 0
const check = (label, ok, detail = '') => {
  if (ok) {
    passed++
    console.log('PASS', label)
  } else {
    failed++
    console.log('FAIL', label, detail)
  }
}

// ---------- mock server state ----------

const quotaFor = (over = {}) => ({
  month: '2026-10-01',
  is_pro: false,
  report_limit: 4,
  reports_used: 1,
  reports_remaining: 3,
  attempt_limit: 12,
  attempts_used: 2,
  hourly_attempt_limit: 3,
  hourly_attempts_used: 0,
  hourly_retry_at: null,
  in_progress: false,
  resets_on: '2026-11-01',
  resets_at: '2026-10-31T16:00:00+00:00',
  blocked: null,
  ...over,
})

const ERROR_TABLE = {
  MONTHLY_LIMIT: [429, () => ({ quota: quotaFor({ reports_used: 4, reports_remaining: 0, blocked: 'MONTHLY_LIMIT' }) })],
  RATE_LIMIT: [429, () => ({ quota: quotaFor({ hourly_attempts_used: 3, blocked: 'RATE_LIMIT', hourly_retry_at: new Date(Date.now() + 40 * 60000).toISOString() }) })],
  ATTEMPT_LIMIT: [429, () => ({ quota: quotaFor({ attempts_used: 12, blocked: 'ATTEMPT_LIMIT' }) })],
  IN_PROGRESS: [409, () => ({ quota: quotaFor({ in_progress: true }) })],
  DUPLICATE_REQUEST: [409, () => ({})],
  CONSENT_CHANGED: [409, () => ({})],
  CONSENT_VERSION_MISMATCH: [409, () => ({ required: { scope_version: 2, copy_versions: ['2026-12-01.1'] } })],
  MATERIAL_BLOCKED: [422, () => ({})],
  GENERATION_FAILED: [502, () => ({})],
  GENERATION_TIMEOUT: [504, () => ({})],
  AI_NOT_CONFIGURED: [503, () => ({})],
  SERVICE_PAUSED: [503, () => ({})],
  DATABASE_ERROR: [503, () => ({})],
  UNAUTHORIZED: [401, () => ({})],
  ACCOUNT_SUSPENDED: [403, () => ({})],
  ANONYMOUS_NOT_ALLOWED: [403, () => ({})],
  INVALID_INPUT: [400, () => ({})],
  NO_DATA: [422, () => ({})],
  CONSENT_REQUIRED: [403, () => ({})],
}

const reportText = (locale) =>
  locale === 'en'
    ? {
        rhythm: `Most of your work landed in the afternoon. Details at ${EVIL}/rhythm and ![x](${EVIL}/a.png)`,
        done: `You finished the quarterly report. <img src="${EVIL}/pixel.png" onerror="window.__pwned=1"> [click me](${EVIL}/click)`,
        time_spent: 'Most scheduled time went to work, with a two-hour block on Tuesday.',
        pending: 'The invoice task has been open since September 10.',
        observation: 'Your tasks mostly finish in the afternoon, and Sunday stands out.',
      }
    : {
        rhythm: `這段期間你的事情多半在下午完成。詳情見 ${EVIL}/rhythm 與 ![x](${EVIL}/a.png)`,
        done: `寫完了季報。<img src="${EVIL}/pixel.png" onerror="window.__pwned=1"> [點我](${EVIL}/click)`,
        time_spent: '排進行事曆的時間大多給了工作，最長的一段是週二下午兩小時。',
        pending: '「整理發票」從 9 月 10 日放到現在。',
        observation: '這週你的事情多半在下午完成，而且週日特別集中。',
      }

function makeReport(requestId, period, locale, n) {
  return {
    id: id(900 + n),
    usage_id: requestId,
    period_key: period,
    period_start: '2026-09-19T02:00:00+00:00',
    period_end: '2026-09-26T02:00:00+00:00',
    locale,
    ...reportText(locale),
    stats: { completed_count: 12, focus_minutes: 420, meeting_count: 2, time_block_minutes: 95, scheduled_minutes: 540 },
    created_at: new Date(Date.now() - n * 3600000).toISOString(),
  }
}

function freshState() {
  return {
    statusMode: 'ok', // ok | 404 | abort | badbody | disabled | 503
    granted: false,
    highlights: false,
    quotaOver: {},
    generateMode: 'ok', // ok | hang | hang-saved | <error code>
    reports: [],
    counter: 0,
    calls: { status: [], consent: [], generate: [], deleted: [], usageQueries: [] },
  }
}

function consentFor(S) {
  return {
    feature: 'ai_review',
    granted: S.granted,
    needs_reconsent: false,
    consent_id: S.granted ? 12 : null,
    scope_version: 1,
    copy_version: '2026-10-01.1',
    scope_options: { meeting_highlights: S.highlights },
    last_action: S.granted ? 'granted' : null,
    decided_at: S.granted ? '2026-10-02T09:00:00+00:00' : null,
    required_scope_version: 1,
  }
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, content-profile, accept',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': 'content-range',
}

async function installMocks(context, S) {
  await context.route('**/*.supabase.co/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (json, status = 200, extra = {}) =>
      route.fulfill({ status, headers: { ...cors, ...extra }, json })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors, body: 'ok' })
    const body = req.postData() ? req.postDataJSON() : {}

    if (url.pathname === '/auth/v1/token')
      return reply({ access_token: jwt, refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600, user })
    if (url.pathname === '/auth/v1/user') return reply(user)

    if (url.pathname.endsWith('/functions/v1/ai-review')) {
      if (body.action === 'status') {
        S.calls.status.push(body)
        if (S.statusMode === '404') return reply({ error: 'NOT_FOUND', message: 'Requested function was not found' }, 404)
        if (S.statusMode === '503') return reply({ error: 'AI_NOT_CONFIGURED' }, 503)
        if (S.statusMode === 'abort') return route.abort()
        if (S.statusMode === 'badbody') return reply({ hello: 'world' })
        return reply({
          feature: 'ai_review',
          enabled: S.statusMode !== 'disabled',
          required: { scope_version: 1, copy_versions: ['2026-10-01.1'] },
          consent: consentFor(S),
          quota: quotaFor({ reports_used: 1 + S.reports.length, reports_remaining: Math.max(0, 3 - S.reports.length), ...S.quotaOver }),
        })
      }
      if (body.action === 'consent') {
        S.calls.consent.push(body)
        let deleted = 0
        if (body.decision === 'grant') {
          S.granted = true
          S.highlights = body.meetingHighlights === true
        } else {
          S.granted = false
          if (body.deleteReports) {
            deleted = S.reports.length
            S.reports = []
          }
        }
        return reply({ recorded: true, deleted_reports: deleted, consent: consentFor(S) })
      }
      if (body.action === 'generate') {
        S.calls.generate.push(body)
        const mode = S.generateMode
        if (mode === 'hang') return new Promise(() => {})
        if (mode === 'hang-saved') {
          S.reports.unshift(makeReport(body.requestId, body.period, body.locale, ++S.counter))
          return new Promise(() => {})
        }
        if (mode !== 'ok') {
          const [status, extra] = ERROR_TABLE[mode]
          return reply({ error: mode, ...extra() }, status)
        }
        const report = makeReport(body.requestId, body.period, body.locale, ++S.counter)
        S.reports.unshift(report)
        return reply({ report, quota: quotaFor({ reports_used: 1 + S.reports.length, reports_remaining: Math.max(0, 3 - S.reports.length) }) })
      }
      return reply({ error: 'INVALID_INPUT' }, 400)
    }
    if (url.pathname.endsWith('/functions/v1/google-calendar')) {
      if (body.action === 'status') return reply({ configured: false, connected: false, status: 'disconnected' })
      return reply({ busy: [], unavailable: [] })
    }
    if (url.pathname.includes('/functions/v1/')) return reply({})

    if (!url.pathname.includes('/rest/v1/')) return route.abort()

    if (url.pathname.endsWith('/rest/v1/ai_review_reports')) {
      if (req.method() === 'DELETE') {
        const target = (url.searchParams.get('id') || '').replace(/^eq\./, '')
        S.calls.deleted.push(target)
        S.reports = S.reports.filter((r) => r.id !== target)
        return route.fulfill({ status: 204, headers: cors, body: '' })
      }
      const usage = (url.searchParams.get('usage_id') || '').replace(/^eq\./, '')
      if (usage) {
        S.calls.usageQueries.push(usage)
        return reply(S.reports.filter((r) => r.usage_id === usage))
      }
      return reply(S.reports)
    }
    if (url.pathname.includes('/rpc/')) {
      const name = url.pathname.split('/').pop()
      if (name === 'get_meeting_notifications') return reply({ items: [], unread_count: 0 })
      if (name === 'huddle_operations')
        return reply(body.p_action === 'announcements' ? [] : { is_admin: false, days_remaining: 30, status: 'active' })
      return reply([])
    }
    if (req.method() !== 'GET') return reply([])
    const fixtures = {
      workspaces: [{ id: id(50), name: 'Demo studio', color: '#789185', icon: '🌿', sort_order: 0, is_default: true }],
      categories: [{ id: id(51), workspace_id: id(50), name: 'Plans', sort_order: 0, is_default: true }],
      tasks: [
        { id: id(55), workspace_id: id(50), category_id: id(51), title: 'Write report', task_type: 'one_time', sort_order: 0, is_completed: true, completed_at: new Date().toISOString(), is_archived: false },
      ],
    }
    const name = url.pathname.split('/').pop()
    if (name === 'user_settings')
      return route.fulfill({ headers: cors, contentType: 'application/json', body: 'null' })
    const rows = fixtures[name] || []
    return reply(rows, 200, { 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' })
  })
}

// ---------- browser helpers ----------

async function newSession(browser, { locale, mobile }) {
  const context = await browser.newContext({
    locale: locale === 'en' ? 'en-US' : 'zh-TW',
    timezoneId: 'Asia/Taipei',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1700, height: 1000 },
    serviceWorkers: 'block',
    ...(mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}),
  })
  context.setDefaultTimeout(20000)
  context.setDefaultNavigationTimeout(90000)
  await context.addInitScript((lang) => {
    try {
      localStorage.setItem('waddle-language-v1', lang)
      const op = sessionStorage.getItem('__e2e_operator')
      if (op) window.__HUDDLE_AI_REVIEW_TEST_OPERATOR__ = JSON.parse(op)
      const to = sessionStorage.getItem('__e2e_timeout')
      if (to) window.__HUDDLE_AI_REVIEW_TEST_TIMEOUT_MS__ = Number(to)
    } catch {
      /* storage blocked */
    }
    const hide = () => {
      const style = document.createElement('style')
      style.textContent = '[data-pet-adopt]{display:none!important}'
      document.head?.appendChild(style)
    }
    if (document.head) hide()
    else document.addEventListener('DOMContentLoaded', hide)
  }, locale)
  const S = freshState()
  await installMocks(context, S)
  const page = await context.newPage()
  const log = { requests: [], consoleErrors: [], pageErrors: [] }
  page.on('request', (r) => log.requests.push(r.url()))
  page.on('console', (m) => {
    if (m.type() === 'error') log.consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => log.pageErrors.push(e.message))
  return { context, page, S, log, locale, mobile }
}

async function login(sess) {
  const { page } = sess
  await page.goto(base + '/login?method=email', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await page.locator('#email').fill(user.email)
  await page.locator('#password').fill('Mock-password-123')
  await page.locator('button[type=submit]').click()
  await page.waitForURL((url) => url.pathname !== '/login', { waitUntil: 'domcontentloaded' })
}

const setOperator = (sess, on) =>
  sess.page.evaluate((v) => {
    if (v) sessionStorage.setItem('__e2e_operator', JSON.stringify(v))
    else sessionStorage.removeItem('__e2e_operator')
  }, on ? OPERATOR : null)

const setTimeoutOverride = (sess, ms) =>
  sess.page.evaluate((v) => {
    if (v) sessionStorage.setItem('__e2e_timeout', String(v))
    else sessionStorage.removeItem('__e2e_timeout')
  }, ms)

const L = (sess) =>
  sess.locale === 'en'
    ? {
        reviewHeading: /every step counted/,
        more: 'More',
        report: 'Reports',
        settings: 'Settings',
        generate: 'Generate report',
        agree: 'Agree and continue',
        decline: 'Decline',
        sections: ['Your rhythm in this period', 'What you got done', 'Where the time went', 'Still open', 'A quiet observation'],
        noDataTitle: /Nothing recorded in this period yet/,
        delete: 'Delete',
        cancel: 'Cancel',
        history: 'Past reports',
        withdraw: 'Withdraw consent',
        resetDate: 'Nov 1',
      }
    : {
        reviewHeading: /走過的都算數/,
        more: '更多',
        report: '報告',
        settings: '設定',
        generate: '產生報告',
        agree: '同意並繼續',
        decline: '不同意',
        sections: ['這段時間的節奏', '做了哪些事', '時間花在哪', '還掛著的事', '一兩句觀察'],
        noDataTitle: /這段期間還沒有紀錄/,
        delete: '刪除',
        cancel: '取消',
        history: '歷史報告',
        withdraw: '撤回同意',
        resetDate: '11 月 1 日',
      }

/** Reload the app and bring the review dashboard on screen (pane on wide desktop, full page on phone). */
async function openReview(sess) {
  const { page, mobile } = sess
  const t = L(sess)
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
  if (mobile) {
    const more = page.locator('[data-tour="mobile-more"]')
    await more.waitFor()
    await more.click()
    await page.getByRole('button', { name: t.report, exact: true }).click()
  }
  await page.getByText(t.reviewHeading).first().waitFor({ state: 'visible' })
}

/** Wait until the app has asked for status (when it is expected to), then let late renders settle. */
async function settle(sess, expectStatusCall = true) {
  const start = sess.S.calls.status.length
  if (expectStatusCall) {
    const deadline = Date.now() + 15000
    while (sess.S.calls.status.length === start && Date.now() < deadline) await sleep(100)
  }
  await sleep(900)
}

async function shot(sess, name) {
  await sleep(600) // let dialog open animations finish before the picture
  const file = path.join(SHOTS, `${sess.locale}-${sess.mobile ? 'mobile390' : 'desktop'}-${name}.png`)
  await sess.page.screenshot({ path: file })
  return file
}

const block = (sess) => sess.page.locator('[data-ai-review]')

async function scrollBlock(sess) {
  await block(sess).first().scrollIntoViewIfNeeded()
  // Real scroll so scroll-triggered reveals run before any screenshot.
  await sess.page.mouse.wheel(0, 120)
  await sleep(300)
}

async function box(locator) {
  const b = await locator.boundingBox()
  return b || { width: 0, height: 0 }
}

const noHorizontalScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1)

// ---------- scenarios ----------

async function gateChecks(sess) {
  const { page, S, log } = sess
  const tag = `[${sess.locale}${sess.mobile ? ' 390' : ''}]`
  await login(sess)

  // 1) status failures: no entry, no visible error, nothing logged by our code
  for (const mode of ['404', 'abort', 'badbody', '503', 'disabled']) {
    S.statusMode = mode
    S.granted = false
    await setOperator(sess, true)
    log.consoleErrors.length = 0
    log.pageErrors.length = 0
    await openReview(sess)
    await settle(sess)
    const count = await block(sess).count()
    const text = await page.locator('body').innerText()
    const ours = log.consoleErrors.filter((m) => !/Failed to load resource/i.test(m) && /ai[- ]?review|AiReview/i.test(m))
    check(
      `${tag} status=${mode}: AI review block absent`,
      count === 0 && !/AI 回顧|AI Review/.test(text),
      `blocks=${count}`,
    )
    check(`${tag} status=${mode}: nothing printed by our code (console errors / page errors)`, ours.length === 0 && log.pageErrors.length === 0, JSON.stringify({ ours, page: log.pageErrors }))
  }

  // 2) operator info empty: no entry, and not even a status request
  S.statusMode = 'ok'
  await setOperator(sess, false)
  await openReview(sess)
  const before = S.calls.status.length
  await sleep(2500)
  check(`${tag} operator constants empty, server enabled: block absent`, (await block(sess).count()) === 0)
  check(`${tag} operator constants empty: no status request sent`, S.calls.status.length === before, `calls=${S.calls.status.length - before}`)
  // and with the operator info present the same server answer shows it
  await setOperator(sess, true)
  await openReview(sess)
  await block(sess).first().waitFor({ state: 'visible' })
  check(`${tag} operator filled + server enabled: block appears`, (await block(sess).count()) === 1)
}

async function consentAndReport(sess, { shots }) {
  const { page, S, log } = sess
  const t = L(sess)
  const tag = `[${sess.locale}${sess.mobile ? ' 390' : ''}]`
  S.statusMode = 'ok'
  S.granted = false
  S.reports = []
  S.generateMode = 'ok'
  S.calls.consent.length = 0
  S.calls.generate.length = 0
  await setOperator(sess, true)
  await openReview(sess)
  await block(sess).first().waitFor({ state: 'visible' })
  await scrollBlock(sess)
  if (shots) await shot(sess, '1-block')

  // 3) not consented -> consent screen; decline sends nothing
  await page.locator('[data-ai-generate]').click()
  const dialog = page.locator('[data-ai-consent="ai_review"]')
  await dialog.waitFor({ state: 'visible' })
  const dText = await dialog.innerText()
  check(`${tag} not consented: Generate opens the consent screen`, await dialog.isVisible())
  check(`${tag} consent screen shows operator name and contact Email`, dText.includes(OPERATOR.name) && dText.includes(OPERATOR.email))
  check(
    `${tag} consent screen names OpenAI, United States, and the 18+ line sits above the buttons`,
    /OpenAI/.test(dText) && /(美國|United States)/.test(dText) && (await dialog.locator('[data-ai-age-line]').isVisible()),
  )
  const ageY = (await box(dialog.locator('[data-ai-age-line]'))).y
  const agreeBox = await box(dialog.locator('[data-ai-consent-agree]'))
  const declineBox = await box(dialog.locator('[data-ai-consent-decline]'))
  check(`${tag} 18+ statement is above both buttons`, ageY < agreeBox.y && ageY < declineBox.y)
  check(
    `${tag} Agree and Decline are the same size`,
    Math.abs(agreeBox.width - declineBox.width) < 1.5 && Math.abs(agreeBox.height - declineBox.height) < 1.5,
    JSON.stringify({ agreeBox, declineBox }),
  )
  const sameStyle = await dialog.evaluate((el) => {
    const a = getComputedStyle(el.querySelector('[data-ai-consent-agree]'))
    const d = getComputedStyle(el.querySelector('[data-ai-consent-decline]'))
    return ['backgroundColor', 'color', 'fontWeight', 'fontSize', 'borderTopWidth', 'borderTopColor'].every((k) => a[k] === d[k])
  })
  check(`${tag} Agree and Decline have identical colour / weight / border`, sameStyle)
  const toggle = dialog.getByRole('switch')
  check(`${tag} meeting-highlights switch exists and is off (nothing pre-selected)`, (await toggle.count()) === 1 && (await toggle.getAttribute('aria-checked')) === 'false')
  check(`${tag} privacy link is a real link`, (await dialog.locator('a[href$="/privacy"]').count()) === 1)
  if (sess.locale === 'en') check(`${tag} consent screen has no Chinese characters`, !CJK.test(dText), dText.match(CJK)?.[0])
  if (sess.mobile) {
    check(`${tag} consent buttons >= 44px tall`, agreeBox.height >= 44 && declineBox.height >= 44, JSON.stringify({ agreeBox, declineBox }))
    check(`${tag} consent screen has no horizontal scroll`, await noHorizontalScroll(page))
  }
  if (shots) await shot(sess, '2-consent')

  await dialog.locator('[data-ai-consent-decline]').click()
  await dialog.waitFor({ state: 'detached' })
  await sleep(500)
  check(
    `${tag} Decline: no consent request and no generate request were sent`,
    S.calls.consent.length === 0 && S.calls.generate.length === 0,
    JSON.stringify({ c: S.calls.consent.length, g: S.calls.generate.length }),
  )
  check(`${tag} Decline: rest of the app still usable (block still there, Generate enabled)`, await page.locator('[data-ai-generate]').isEnabled())

  // 4) agree -> generate -> report view
  await page.locator('[data-ai-generate]').click()
  await dialog.waitFor({ state: 'visible' })
  await dialog.locator('[data-ai-consent-agree]').click()
  const view = page.locator('[data-ai-report-view]')
  await view.waitFor({ state: 'visible', timeout: 30000 })
  check(
    `${tag} Agree: server asked to record consent (grant, versions, meetingHighlights=false)`,
    S.calls.consent.length === 1 &&
      S.calls.consent[0].decision === 'grant' &&
      S.calls.consent[0].copyVersion === '2026-10-01.1' &&
      S.calls.consent[0].scopeVersion === 1 &&
      S.calls.consent[0].meetingHighlights === false &&
      S.calls.consent[0].feature === 'ai_review',
    JSON.stringify(S.calls.consent),
  )
  check(
    `${tag} then exactly one generate request with a uuid requestId and the chosen period`,
    S.calls.generate.length === 1 &&
      /^[0-9a-f-]{36}$/.test(S.calls.generate[0].requestId) &&
      S.calls.generate[0].period === 'last_week' &&
      S.calls.generate[0].locale === (sess.locale === 'en' ? 'en' : 'zh-TW'),
    JSON.stringify(S.calls.generate),
  )
  await sleep(600)
  const labels = await view.locator('section[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  check(`${tag} report shows the five sections in the fixed order`, JSON.stringify(labels) === JSON.stringify(t.sections), JSON.stringify(labels))
  const statsText = await view.locator('[data-ai-report-stats]').innerText()
  check(`${tag} headline numbers come from stats (12 done, 7 focus hours, 2 meetings)`, /12/.test(statsText) && /\b7\b/.test(statsText) && /\b2\b/.test(statsText), statsText)
  const vText = await view.innerText()
  check(`${tag} untrusted text rendered as plain text (evil URL visible as text)`, vText.includes('evil.example'))
  const dom = await view.evaluate((el) => ({
    anchors: el.querySelectorAll('a').length,
    imgs: el.querySelectorAll('img').length,
    hrefOrSrc: [...el.querySelectorAll('*')].filter((n) => n.hasAttribute('href') || n.hasAttribute('src')).length,
    evilLinks: [...document.querySelectorAll('a[href*="evil.example"], img[src*="evil.example"]')].length,
    pwned: window.__pwned === 1,
  }))
  check(`${tag} report has no <a> and no <img> (nothing points to evil.example)`, dom.anchors === 0 && dom.imgs === 0 && dom.hrefOrSrc === 0 && dom.evilLinks === 0, JSON.stringify(dom))
  check(`${tag} injected onerror handler never ran`, !dom.pwned)
  check(`${tag} no network request to evil.example`, !log.requests.some((u) => u.includes('evil.example')))
  if (sess.locale === 'en') {
    const cjk = (await view.innerText()).match(CJK)
    check(`${tag} report view has no Chinese characters`, !cjk, cjk?.[0])
  }
  if (sess.mobile) {
    const close = await box(view.locator('[data-ai-report-close]'))
    const del = await box(view.locator('[data-ai-report-delete]'))
    check(`${tag} report view buttons >= 44px`, close.width >= 44 && close.height >= 44 && del.width >= 44 && del.height >= 44, JSON.stringify({ close, del }))
    check(`${tag} report view has no horizontal scroll`, await noHorizontalScroll(page))
  }
  if (shots) await shot(sess, '3-report')
  await view.locator('[data-ai-report-close]').click()
  await view.waitFor({ state: 'detached' })
}

async function errorsAndEmpty(sess, { shots }) {
  const { page, S } = sess
  const t = L(sess)
  const tag = `[${sess.locale}${sess.mobile ? ' 390' : ''}]`
  S.statusMode = 'ok'
  S.granted = true
  S.reports = []
  S.quotaOver = {}
  await setOperator(sess, true)
  await openReview(sess)
  await block(sess).first().waitFor({ state: 'visible' })
  await scrollBlock(sess)

  // 5a) empty period
  S.generateMode = 'NO_DATA'
  await page.locator('[data-ai-generate]').click()
  const empty = page.locator('[data-ai-empty]')
  await empty.waitFor({ state: 'visible' })
  const emptyText = await empty.innerText()
  const penguin = empty.locator('img[src*="/art/penguin/sleep.webp"]')
  await penguin.scrollIntoViewIfNeeded()
  const imgOk = await penguin
    .evaluate(
      (img) =>
        new Promise((resolve) => {
          const done = () => resolve(img.complete && img.naturalWidth > 0)
          if (img.complete) return done()
          img.addEventListener('load', done)
          img.addEventListener('error', done)
          setTimeout(done, 8000)
        }),
    )
    .catch(() => false)
  check(`${tag} empty period: penguin sleep illustration loads`, imgOk)
  check(`${tag} empty period: friendly empty-state text`, t.noDataTitle.test(emptyText), emptyText)
  if (sess.locale === 'en') check(`${tag} empty state has no Chinese characters`, !CJK.test(emptyText))
  if (shots) await shot(sess, '4-empty')

  // 5b) every error code gets a plain explanation (and quota-full shows the reset date)
  const codes = Object.keys(ERROR_TABLE).filter((c) => c !== 'NO_DATA' && c !== 'CONSENT_REQUIRED')
  for (const code of codes) {
    S.generateMode = code
    await page.locator('[data-ai-generate]').click()
    const err = page.locator(`[data-ai-error="${code}"]`)
    await err.waitFor({ state: 'visible' })
    const text = (await err.innerText()).trim()
    let ok = text.length > 8
    if (sess.locale === 'en') ok = ok && !CJK.test(text)
    if (code === 'MONTHLY_LIMIT') ok = ok && text.includes(t.resetDate)
    check(`${tag} error ${code}: clear message${code === 'MONTHLY_LIMIT' ? ' with reset date ' + t.resetDate : ''}`, ok, text)
    if (code === 'MONTHLY_LIMIT' && shots) await shot(sess, '5-quota-full')
    // the button must be usable again except where the server says no
    await sleep(150)
  }
  if (sess.locale === 'en') {
    const all = await block(sess).first().innerText()
    check(`${tag} whole AI review block has no Chinese characters (after errors)`, !CJK.test(all), all.match(CJK)?.[0])
  }
  // 5c) quota already full according to status
  S.generateMode = 'ok'
  S.quotaOver = { reports_used: 4, reports_remaining: 0, blocked: 'MONTHLY_LIMIT' }
  await openReview(sess)
  await block(sess).first().waitFor({ state: 'visible' })
  await sleep(500)
  const blockedText = await block(sess).first().innerText()
  check(`${tag} status says quota full: reset date shown and Generate disabled`, blockedText.includes(t.resetDate) && (await page.locator('[data-ai-generate]').isDisabled()), blockedText)
  S.quotaOver = {}

  // 5d) consent withdrawn elsewhere: server answers CONSENT_REQUIRED -> consent screen again
  S.generateMode = 'CONSENT_REQUIRED'
  S.granted = true
  await openReview(sess)
  await block(sess).first().waitFor({ state: 'visible' })
  S.granted = false
  await page.locator('[data-ai-generate]').click()
  await page.locator('[data-ai-consent="ai_review"]').waitFor({ state: 'visible' })
  check(`${tag} CONSENT_REQUIRED from the server re-opens the consent screen`, true)
  await page.locator('[data-ai-consent-decline]').click()
  S.generateMode = 'ok'
}

async function historyChecks(sess, { shots }) {
  const { page, S } = sess
  const t = L(sess)
  const tag = `[${sess.locale}${sess.mobile ? ' 390' : ''}]`
  S.statusMode = 'ok'
  S.granted = true
  S.generateMode = 'ok'
  S.quotaOver = {}
  S.reports = [makeReport(id(701), 'last_week', sess.locale === 'en' ? 'en' : 'zh-TW', 1), makeReport(id(702), 'this_month', sess.locale === 'en' ? 'en' : 'zh-TW', 2)]
  S.counter = 5
  S.calls.deleted.length = 0
  await openReview(sess)
  await block(sess).first().waitFor({ state: 'visible' })
  await scrollBlock(sess)
  await page.locator('[data-ai-history-toggle]').click()
  const items = page.locator('[data-ai-history-item]')
  await items.first().waitFor({ state: 'visible' })
  check(`${tag} history lists saved reports`, (await items.count()) === 2)
  if (sess.mobile) {
    const trash = await box(page.locator('[data-ai-history-delete]').first())
    const toggle = await box(page.locator('[data-ai-history-toggle]'))
    const withdrawBtn = await box(page.locator('[data-ai-withdraw-open]'))
    const gen = await box(page.locator('[data-ai-generate]'))
    const pills = await page.locator('[data-ai-period]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
    const row = await box(items.first().locator('button').first())
    check(`${tag} touch targets >= 44px (generate, history, withdraw, delete, history row)`,
      gen.height >= 44 && toggle.height >= 44 && withdrawBtn.height >= 44 && trash.width >= 44 && trash.height >= 44 && row.height >= 44,
      JSON.stringify({ gen, toggle, withdrawBtn, trash, row }))
    check(`${tag} the four period buttons are >= 44px tall`, pills.length === 4 && pills.every((h) => h >= 44), JSON.stringify(pills))
    check(`${tag} review block has no horizontal scroll`, await noHorizontalScroll(page))
    await shot(sess, '2b-history')
  } else if (shots) {
    await shot(sess, '2b-history')
  }
  // open an old report
  await items.first().locator('button').first().click()
  const view = page.locator('[data-ai-report-view]')
  await view.waitFor({ state: 'visible' })
  check(`${tag} an old report can be opened`, (await view.locator('section[aria-label]').count()) === 5)
  await view.locator('[data-ai-report-close]').click()
  await view.waitFor({ state: 'detached' })

  // delete needs a second confirmation
  await page.locator('[data-ai-history-delete]').first().click()
  const confirm = page.locator('[data-ai-delete-confirm]')
  await confirm.waitFor({ state: 'visible' })
  check(`${tag} delete asks for confirmation first (no DELETE request yet)`, S.calls.deleted.length === 0)
  await confirm.getByRole('button', { name: t.cancel, exact: true }).click()
  await confirm.waitFor({ state: 'detached' })
  await sleep(300)
  check(`${tag} cancelling the confirmation deletes nothing`, S.calls.deleted.length === 0 && (await items.count()) === 2)
  const firstId = S.reports[0].id
  await page.locator('[data-ai-history-delete]').first().click()
  await confirm.waitFor({ state: 'visible' })
  await confirm.getByRole('button', { name: t.delete, exact: true }).click()
  await confirm.waitFor({ state: 'detached' })
  await sleep(500)
  check(`${tag} confirming deletes exactly that report (DELETE id=eq.<id>) and the row disappears`, S.calls.deleted.length === 1 && S.calls.deleted[0] === firstId && (await items.count()) === 1, JSON.stringify(S.calls.deleted))
}

async function timeoutChecks(sess) {
  const { page, S } = sess
  const tag = `[${sess.locale}${sess.mobile ? ' 390' : ''}]`
  S.statusMode = 'ok'
  S.granted = true
  S.reports = []
  S.quotaOver = {}
  S.calls.usageQueries.length = 0
  S.calls.generate.length = 0
  await setOperator(sess, true)
  await setTimeoutOverride(sess, 2500)
  // lost connection, nothing saved server-side -> failure text, no resend
  S.generateMode = 'hang'
  await openReview(sess)
  await block(sess).first().waitFor({ state: 'visible' })
  await page.locator('[data-ai-generate]').click()
  await page.locator('[data-ai-generating]').waitFor({ state: 'visible' })
  check(`${tag} while waiting: progress text mentions 90 seconds and Generate is disabled`, /90/.test(await page.locator('[data-ai-generating]').innerText()) && (await page.locator('[data-ai-generate]').isDisabled()))
  const err = page.locator('[data-ai-error="TIMEOUT"]')
  await err.waitFor({ state: 'visible', timeout: 15000 })
  check(`${tag} timeout: failure shown, says nothing was deducted`, /(沒有扣掉|none was used up)/.test(await err.innerText()))
  check(`${tag} timeout: looked the report up by requestId and did NOT resend`, S.calls.generate.length === 1 && S.calls.usageQueries.length === 1 && S.calls.usageQueries[0] === S.calls.generate[0].requestId, JSON.stringify({ g: S.calls.generate.length, u: S.calls.usageQueries }))
  // server finished anyway -> the report is recovered
  S.generateMode = 'hang-saved'
  S.calls.generate.length = 0
  await page.locator('[data-ai-generate]').click()
  await page.locator('[data-ai-report-view]').waitFor({ state: 'visible', timeout: 15000 })
  check(`${tag} timeout but server had saved it: report is shown`, true)
  await setTimeoutOverride(sess, 0)
}

async function settingsChecks(sess, { shots }) {
  const { page, S } = sess
  const t = L(sess)
  const tag = `[${sess.locale}${sess.mobile ? ' 390' : ''}]`
  S.statusMode = 'ok'
  S.granted = true
  S.highlights = false
  S.reports = [makeReport(id(711), 'last_week', sess.locale === 'en' ? 'en' : 'zh-TW', 1)]
  S.calls.consent.length = 0
  await setOperator(sess, true)
  // open settings (desktop: gear button; phone: overflow menu)
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
  if (sess.mobile) {
    const more = page.locator('[data-tour="mobile-more"]')
    await more.waitFor()
    await more.click()
    await page.getByRole('button', { name: t.settings, exact: true }).click()
  } else {
    await page.getByRole('button', { name: t.settings, exact: true }).first().waitFor()
    await page.getByRole('button', { name: t.settings, exact: true }).first().click()
  }
  const section = page.locator('[data-ai-review-settings]')
  await section.waitFor({ state: 'visible' })
  await section.scrollIntoViewIfNeeded()
  check(`${tag} settings: AI review section with a visible withdraw button`, await page.locator('[data-ai-settings-withdraw]').isVisible())
  if (sess.locale === 'en') check(`${tag} settings section has no Chinese characters`, !CJK.test(await section.innerText()))
  if (sess.mobile) {
    const wb = await box(page.locator('[data-ai-settings-withdraw]'))
    check(`${tag} settings withdraw button >= 44px`, wb.height >= 44, JSON.stringify(wb))
  }
  if (shots) await shot(sess, '6-settings')
  await page.locator('[data-ai-settings-withdraw]').click()
  const dlg = page.locator('[data-ai-withdraw]')
  await dlg.waitFor({ state: 'visible' })
  const cb = dlg.getByRole('checkbox')
  check(`${tag} withdraw dialog: "also delete all reports" starts unchecked`, (await cb.getAttribute('aria-checked')) === 'false')
  if (sess.locale === 'en') check(`${tag} withdraw dialog has no Chinese characters`, !CJK.test(await dlg.innerText()))
  if (shots) await shot(sess, '7-withdraw')
  await cb.click()
  await dlg.locator('[data-ai-withdraw-confirm]').click()
  await dlg.waitFor({ state: 'detached' })
  await sleep(500)
  check(
    `${tag} withdraw + delete: server asked to withdraw with deleteReports=true`,
    S.calls.consent.length === 1 && S.calls.consent[0].decision === 'withdraw' && S.calls.consent[0].deleteReports === true && S.reports.length === 0,
    JSON.stringify(S.calls.consent),
  )
}

// ---------- optional: production build must not contain the test hooks ----------

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(js|html|json|map)$/.test(name) && st.size < 20_000_000) out.push(p)
  }
  return out
}

function buildChecks() {
  const roots = ['.next/static', '.next/server'].map((r) => path.join(process.cwd(), r))
  const files = roots.flatMap((r) => {
    try {
      return walk(r)
    } catch {
      return []
    }
  })
  check('build: scanned a production build (found AI review code in .next)', files.some((f) => !f.endsWith('.map') && readFileSync(f, 'utf8').includes('data-ai-review')), `files=${files.length}`)
  const hooks = ['__HUDDLE_AI_REVIEW_TEST_OPERATOR__', '__HUDDLE_AI_REVIEW_TEST_TIMEOUT_MS__']
  const hits = files.filter((f) => !f.endsWith('.map')).filter((f) => {
    const txt = readFileSync(f, 'utf8')
    return hooks.some((h) => txt.includes(h))
  })
  check('build: production bundle contains no test-override hooks (operator gate cannot be bypassed)', hits.length === 0, hits.slice(0, 3).join(', '))
}

// ---------- main ----------

const browser = process.env.E2E_ONLY_BUILD ? null : await chromium.launch()
try {
  if (process.env.E2E_ONLY_BUILD) throw new Error('__skip__')
  // A) desktop, Chinese: the gate and every flow
  const zh = await newSession(browser, { locale: 'zh-TW', mobile: false })
  await gateChecks(zh)
  await consentAndReport(zh, { shots: true })
  await errorsAndEmpty(zh, { shots: true })
  await historyChecks(zh, { shots: true })
  await timeoutChecks(zh)
  await settingsChecks(zh, { shots: true })
  check('[zh] no uncaught page errors during the whole run', zh.log.pageErrors.length === 0, zh.log.pageErrors.join(' | '))
  await zh.context.close()

  // B) desktop, English
  const en = await newSession(browser, { locale: 'en', mobile: false })
  await login(en)
  await consentAndReport(en, { shots: true })
  await errorsAndEmpty(en, { shots: true })
  await historyChecks(en, { shots: true })
  await settingsChecks(en, { shots: true })
  await en.context.close()

  // C) phone 390x844, Chinese and English
  for (const locale of ['zh-TW', 'en']) {
    const m = await newSession(browser, { locale, mobile: true })
    await login(m)
    await consentAndReport(m, { shots: true })
    await errorsAndEmpty(m, { shots: true })
    await historyChecks(m, { shots: true })
    await settingsChecks(m, { shots: true })
    check(`[${locale} 390] no uncaught page errors during the whole run`, m.log.pageErrors.length === 0, m.log.pageErrors.join(' | '))
    await m.context.close()
  }
} catch (error) {
  if (error && error.message === '__skip__') {
    /* E2E_ONLY_BUILD: only the build check below runs */
  } else {
    failed++
    console.log('FAIL unexpected exception', error && error.stack ? error.stack : String(error))
  }
} finally {
  await browser?.close()
}

if (process.env.E2E_CHECK_BUILD) buildChecks()

console.log(`\nSUMMARY passed=${passed} failed=${failed}`)
console.log(`Screenshots: ${SHOTS}`)
process.exit(failed === 0 ? 0 : 1)
