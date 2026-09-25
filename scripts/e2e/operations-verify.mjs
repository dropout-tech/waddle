// UI contract tests use synthetic members and intercepted Supabase requests.
// Real permission/reward invariants are tested separately against local Postgres.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from 'playwright'
const base = process.env.E2E_BASE_URL || 'http://localhost:3197'
const env = await fs.readFile('.env.local', 'utf8')
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/)[1]
const ref = new URL(supabaseUrl).hostname.split('.')[0]
const id = '00000000-0000-4000-8000-000000000001'
const user = {
  id,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'operator@example.invalid',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
}
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' })).toString('base64url')}.fake`
const session = {
  access_token: token,
  refresh_token: 'fake',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
}
const settings = {
  gifts_enabled: true,
  trial_enabled: true,
  trial_days: 14,
  coupons_enabled: true,
  referrals_enabled: true,
  referral_days: 30,
  friend_days: 30,
  annual_reward_cap: 360,
  leaderboard_enabled: true,
  reminder_enabled: false,
  reminder_days: 3,
}
const member = {
  user_id: id,
  alias: '慢慢企鵝',
  referral_code: null,
  leaderboard_visible: false,
}
const grants = [
  {
    id: 'g1',
    days: 30,
    source: 'referral',
    reason: '成功推薦新會員',
    created_at: new Date().toISOString(),
    expires_at: '2026-12-01T00:00:00Z',
    revoked_at: null,
  },
]
const summary = {
  members: 128,
  new_30: 36,
  dau: 24,
  wau: 64,
  mau: 92,
  paid: 12,
  gifted: 48,
  referrals: 19,
  redemptions: 27,
  ended_trials: 10,
  converted_trials: 3,
  settings,
}
const coupons = []
const calls = []
let role = 'admin'
let errorMode = false
let signupPayload
const browser = await chromium.launch()
await fs.mkdir('/tmp/huddle-operations-screens', { recursive: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  locale: 'zh-TW',
})
await context.addCookies([
  {
    name: `sb-${ref}-auth-token`,
    value:
      'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
    url: base,
  },
])
await context.route('**/*.supabase.co/**', async (route) => {
  const u = new URL(route.request().url())
  if (u.pathname.endsWith('/signup')) {
    signupPayload = route.request().postDataJSON()
    return route.fulfill({ json: { user, session: null } })
  }
  if (u.pathname.endsWith('/user')) return route.fulfill({ json: user })
  if (u.pathname.endsWith('/huddle_operations')) {
    const { p_action: a, p_data: p = {} } = route.request().postDataJSON()
    calls.push({ a, p })
    if (errorMode || (a === 'redeem' && p.code === 'EXPIRED'))
      return route.fulfill({
        status: 400,
        json: { code: 'P0001', message: '測試：優惠碼名額已滿' },
      })
    let data = { message: '已儲存' }
    if (a === 'self')
      data = {
        member,
        admin: role === 'admin',
        settings,
        paid_until: null,
        pro_until: '2026-12-01T00:00:00Z',
        grants,
        referral_count: 3,
        reward_days: 90,
        referred: false,
      }
    if (a === 'leaderboard')
      data = [
        { rank: 1, alias: '森林旅人', referrals: 8, is_self: false },
        { rank: 2, alias: member.alias, referrals: 3, is_self: true },
      ]
    if (a === 'announcements' || a === 'admin_announcements') data = []
    if (a === 'admin_analytics')
      data = [
        {
          channel: '會員推薦',
          registrations: 19,
          activated: 14,
          retention_eligible: 12,
          retained: 8,
          paid: 2,
        },
      ]
    if (a === 'generate') {
      member.referral_code = 'H1234567890ABCDEF'
      data = { code: member.referral_code }
    }
    if (a === 'profile') {
      member.alias = p.alias
      member.leaderboard_visible = p.visible
    }
    if (a === 'admin_overview') data = summary
    if (a === 'admin_settings') Object.assign(settings, p)
    if (a === 'admin_coupons') data = coupons
    if (a === 'admin_coupon')
      coupons.push({
        ...p,
        id: 'c1',
        enabled: true,
        used: 0,
        active: 0,
        paid: 0,
      })
    if (a === 'admin_update_coupon') Object.assign(coupons[0], p)
    if (a === 'admin_toggle_coupon') coupons[0].enabled = p.enabled
    if (a === 'admin_members')
      data = [
        {
          id,
          email: 'member@example.invalid',
          alias: member.alias,
          created_at: new Date().toISOString(),
          last_active: new Date().toISOString(),
          suspended: false,
          paid_until: null,
          gift_until: '2026-12-01T00:00:00Z',
          referrals: 3,
        },
      ]
    if (a === 'admin_member')
      data = { grants, referrer: '森林旅人', referrals: [] }
    if (a === 'admin_referrals')
      data = [
        {
          id: 'r1',
          referrer: '森林旅人',
          friend: member.alias,
          reward_days: 30,
          status: 'valid',
          created_at: new Date().toISOString(),
        },
      ]
    if (a === 'admin_billing' || a === 'admin_redemptions') data = []
    if (a === 'admin_audit')
      data = [
        {
          id: 1,
          actor_id: id,
          action: 'admin_grant',
          target: id,
          detail: { reason: '測試紀錄' },
          created_at: new Date().toISOString(),
        },
      ]
    return route.fulfill({ json: data })
  }
  if (u.pathname.includes('/rest/v1/')) return route.fulfill({ json: [] })
  return route.abort()
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
let checks = 0
function check(label, value) {
  assert.ok(value, label)
  console.log('PASS', label)
  checks++
}
try {
  await page.goto(base + '/membership')
  await page.getByRole('heading', { name: '你的推薦碼', exact: true }).waitFor()
  await page.getByRole('button', { name: '產生我的推薦碼' }).click()
  await page.getByLabel('專屬推薦連結').waitFor()
  check(
    'generate referral link',
    (await page.getByLabel('專屬推薦連結').inputValue()).includes(
      '/signup?ref=H1234567890ABCDEF'
    )
  )
  await page.getByLabel('公開化名', { exact: true }).fill('新的化名')
  await page.getByLabel('讓我的化名出現在推薦排行榜').check()
  await page.getByRole('button', { name: '儲存化名與公開設定' }).click()
  await page.getByRole('status').filter({ hasText: '已儲存' }).waitFor()
  check(
    'alias and opt-in saved',
    member.alias === '新的化名' && member.leaderboard_visible
  )
  await page.getByLabel('活動優惠碼', { exact: true }).fill('FULL30')
  errorMode = true
  await page.getByRole('button', { name: '兌換使用時間' }).click()
  await page
    .locator('main [role=alert]')
    .filter({ hasText: '優惠碼名額已滿' })
    .waitFor()
  check(
    'redemption errors actionable',
    (await page.locator('main [role=alert]').innerText()).includes(
      '優惠碼名額已滿'
    )
  )
  errorMode = false
  await page.screenshot({
    path: '/tmp/huddle-operations-screens/member-desktop.png',
    fullPage: true,
  })
  await page.goto(base + '/admin')
  await page.getByRole('button', { name: '優惠碼', exact: true }).click()
  await page.getByRole('heading', { name: '建立優惠碼', exact: true }).waitFor()
  await page.getByLabel('活動名稱', { exact: true }).fill('第一批體驗朋友')
  await page.getByLabel('優惠碼', { exact: true }).fill('FRIENDS60')
  await page.getByLabel('贈送天數', { exact: true }).fill('60')
  await page.getByRole('button', { name: '建立優惠碼', exact: true }).click()
  await page.getByRole('cell', { name: /FRIENDS60/ }).waitFor()
  check(
    'coupon creation persists expected rules',
    coupons.length === 1 &&
      coupons[0].days === 60 &&
      coupons[0].max_uses === 100
  )
  await page.getByRole('button', { name: '停用', exact: true }).click()
  await page.getByRole('button', { name: '啟用', exact: true }).waitFor()
  check('coupon can be disabled', !coupons[0].enabled)
  await page.screenshot({
    path: '/tmp/huddle-operations-screens/admin-coupons-desktop.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '活動設定', exact: true }).click()
  await page.getByLabel('開啟推薦獎勵').uncheck()
  await page.getByRole('button', { name: '儲存活動設定' }).click()
  await page.getByRole('status').filter({ hasText: '已儲存' }).waitFor()
  check(
    'independent referral switch saved',
    settings.referrals_enabled === false
  )
  await page.getByRole('button', { name: '會員', exact: true }).click()
  await page.getByRole('button', { name: '查看會員' }).click()
  await page.getByLabel('贈送／補發原因').fill('活動補發')
  await page.getByRole('button', { name: '贈送使用時間', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '使用時間已贈送' }).waitFor()
  check(
    'manual grant carries reason and idempotency key',
    calls.some(
      (c) =>
        c.a === 'admin_grant' && c.p.reason === '活動補發' && c.p.request_id
    )
  )
  for (const name of [
    '推薦紀錄',
    '訂單與訂閱',
    '操作紀錄',
    '公告與通知',
    '來源分析',
    '數據總覽',
  ]) {
    await page.getByRole('button', { name, exact: true }).click()
    await page.waitForFunction(
      () => !document.body.innerText.includes('正在讀取資料')
    )
    check(
      `admin section ${name}`,
      !(await page.locator('main [role=alert]').count())
    )
  }
  await page.screenshot({
    path: '/tmp/huddle-operations-screens/admin-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: '/tmp/huddle-operations-screens/admin-mobile.png',
    fullPage: true,
  })
  check(
    'admin no page overflow',
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  )
  await page.goto(base + '/membership')
  await page.getByRole('heading', { name: '你的推薦碼', exact: true }).waitFor()
  await page.screenshot({
    path: '/tmp/huddle-operations-screens/member-mobile.png',
    fullPage: true,
  })
  check(
    'membership no page overflow',
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  )
  role = 'member'
  await page.goto(base + '/admin')
  await page.getByRole('heading', { name: '此帳號沒有後台權限' }).waitFor()
  check(
    'member sees denied state',
    (await page.getByRole('navigation', { name: '營運功能' }).count()) === 0
  )
  await page.evaluate(() =>
    localStorage.setItem(
      'huddle-enrollment-v1',
      JSON.stringify({
        coupon: 'EXPIRED',
        referral: 'VALIDREF',
        savedAt: Date.now(),
      })
    )
  )
  const beforeEnrollment = calls.length
  await page.goto(base + '/membership')
  await page
    .getByRole('status')
    .filter({ hasText: '未成功的碼可在會員頁重試' })
    .waitFor()
  check(
    'invalid coupon does not block referral',
    calls
      .slice(beforeEnrollment)
      .some((c) => c.a === 'refer' && c.p.code === 'VALIDREF')
  )
  check(
    'pending coupon is restored for recovery',
    (await page.getByLabel('活動優惠碼', { exact: true }).inputValue()) ===
      'EXPIRED'
  )
  check(
    'only failed enrollment remains pending',
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('huddle-enrollment-v1')).referral === ''
    )
  )
  await context.clearCookies()
  await page.evaluate(() => localStorage.clear())
  await page.goto(base + '/signup?ref=FRIENDCODE&coupon=WELCOME60')
  await page.getByLabel('朋友的推薦碼', { exact: true }).waitFor()
  check(
    'signup link automatically fills referral',
    (await page.getByLabel('朋友的推薦碼', { exact: true }).inputValue()) ===
      'FRIENDCODE'
  )
  check(
    'signup link automatically fills coupon',
    (await page.getByLabel('活動優惠碼', { exact: true }).inputValue()) ===
      'WELCOME60'
  )
  await page.getByLabel('Email', { exact: true }).fill('new@example.invalid')
  await page.getByLabel('密碼', { exact: true }).fill('synthetic-password-123')
  await page.getByRole('button', { name: '建立帳號', exact: true }).click()
  await page.getByRole('heading', { name: '檢查你的信箱' }).waitFor()
  check(
    'email verification carries enrollment across devices',
    signupPayload.data.huddle_enrollment.referral === 'FRIENDCODE' &&
      signupPayload.data.huddle_enrollment.coupon === 'WELCOME60'
  )
  check('no browser exceptions', errors.length === 0)
  console.log(`${checks} UI checks passed; all remote traffic intercepted.`)
} catch (e) {
  console.log(
    'DIAGNOSTIC',
    JSON.stringify({
      calls: calls.slice(-8),
      errors,
      invalid: await page.locator('input:invalid').evaluateAll((xs) =>
        xs.map((x) => ({
          name: x.name,
          value: x.value,
          message: x.validationMessage,
        }))
      ),
      text: (await page.locator('main').innerText()).slice(-2200),
    })
  )
  await page.screenshot({ path: '/tmp/huddle-operations-screens/failure.png' })
  throw e
} finally {
  await browser.close()
}
