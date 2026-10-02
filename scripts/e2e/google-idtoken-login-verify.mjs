// Verifies web Google sign-in via ID token (lib/auth/google-idtoken.ts,
// app/auth/google). Google and Supabase are both intercepted: no real Google
// account, login or data access.
//   E2E_BASE_URL=http://localhost:3187 node scripts/e2e/google-idtoken-login-verify.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'

const base = process.env.E2E_BASE_URL || 'http://localhost:3187'
const id = '00000000-0000-4000-8000-000000000002'
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'google-idtoken@example.invalid', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { full_name: 'ID token runtime' }, created_at: new Date().toISOString() }
const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated', email: user.email })).toString('base64url')}.test-signature`
const session = { access_token: jwt, refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }

let passes = 0
const check = (label, value) => { assert.ok(value, label); console.log('PASS', label); passes++ }
const browser = await chromium.launch()

// mode: 'ok' | 'bad-state' | 'denied'
async function run(mode) {
  const ctx = await browser.newContext()
  await ctx.addInitScript(() => { try { localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {} })
  const authorize = []; const exchanges = []; const supabaseHosts = new Set()
  await ctx.route('https://accounts.google.com/**', route => {
    const u = new URL(route.request().url())
    authorize.push(u)
    const back = new URL(u.searchParams.get('redirect_uri'))
    const state = mode === 'bad-state' ? 'f'.repeat(64) : u.searchParams.get('state')
    back.hash = mode === 'denied' ? `error=access_denied&state=${state}` : `id_token=mock.google.idtoken&state=${state}&authuser=0`
    return route.fulfill({ status: 302, headers: { location: back.href } })
  })
  await ctx.route('**/*.supabase.co/**', route => {
    const req = route.request(); const u = new URL(req.url())
    supabaseHosts.add(u.pathname)
    if (u.pathname === '/auth/v1/token') { exchanges.push({ grant: u.searchParams.get('grant_type'), body: req.postDataJSON() }); return route.fulfill({ json: session }) }
    if (u.pathname === '/auth/v1/user') return route.fulfill({ json: user })
    if (u.pathname.startsWith('/rest/v1/')) {
      const table = u.pathname.split('/').pop()
      let body = []
      if (table === 'workspaces') body = [{ id, name: 'ID token workspace', color: '#63a995', icon: '📋', sort_order: 0, is_default: true }]
      if (table === 'categories') body = [{ id, workspace_id: id, name: 'Runtime category', sort_order: 0, is_default: true }]
      if (table === 'user_settings') body = { onboarding_completed: true }
      return route.fulfill({ json: body })
    }
    return route.fulfill({ json: {} })
  })
  const page = await ctx.newPage()
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Google/ }).first().click()
  return { ctx, page, authorize, exchanges, supabaseHosts }
}

try {
  // 1. Happy path
  {
    const { ctx, page, authorize, exchanges } = await run('ok')
    await page.waitForURL(u => new URL(u).pathname === '/', { timeout: 30000 })
    const a = authorize[0]
    check('Login button goes straight to Google (no supabase.co hop)', authorize.length === 1 && a.hostname === 'accounts.google.com' && a.pathname === '/o/oauth2/v2/auth')
    check('Google request: our client, own-domain redirect, id_token, openid scopes',
      a.searchParams.get('client_id') === '507405611281-d0pmotl6m8psngfm8v6c0p6upi5mtubl.apps.googleusercontent.com'
      && a.searchParams.get('redirect_uri') === `${base}/auth/google`
      && a.searchParams.get('response_type') === 'id_token'
      && a.searchParams.get('scope') === 'openid email profile')
    check('state and hashed nonce are 256-bit hex', /^[a-f0-9]{64}$/.test(a.searchParams.get('state')) && /^[a-f0-9]{64}$/.test(a.searchParams.get('nonce')))
    const ex = exchanges.filter(e => e.grant === 'id_token')
    check('Exactly one Supabase id_token exchange (Strict Mode double mount shared)', ex.length === 1 && exchanges.length === 1)
    check('Supabase receives Google token + raw nonce whose sha256 equals the nonce sent to Google',
      ex[0].body.provider === 'google' && ex[0].body.id_token === 'mock.google.idtoken'
      && createHash('sha256').update(ex[0].body.nonce).digest('hex') === a.searchParams.get('nonce'))
    check('Signed-in landing page has no token in URL', !page.url().includes('id_token') && !page.url().includes('#'))
    check('Pending nonce/state removed after use', await page.evaluate(() => sessionStorage.getItem('huddle-google-idtoken-pending') === null))
    await page.getByText('ID token workspace', { exact: true }).first().waitFor({ timeout: 30000 })
    check('Main app renders with the new session', true)
    await ctx.close()
  }
  // 2. Forged/mismatched state → rejected without calling Supabase
  {
    const { ctx, page, exchanges } = await run('bad-state')
    await page.getByText('登入未完成').waitFor({ timeout: 20000 })
    check('Mismatched state is rejected and never reaches Supabase', exchanges.length === 0 && new URL(page.url()).pathname === '/auth/google')
    check('Rejected URL is scrubbed of the token', !page.url().includes('id_token'))
    await ctx.close()
  }
  // 3. User cancels on Google
  {
    const { ctx, page, exchanges } = await run('denied')
    await page.getByText('登入已取消', { exact: false }).waitFor({ timeout: 20000 })
    check('Cancelled Google login shows cancel message, no exchange', exchanges.length === 0)
    await page.getByRole('link', { name: '返回登入頁' }).click()
    await page.waitForURL(u => new URL(u).pathname.startsWith('/login'))
    check('Return-to-login link works', true)
    await ctx.close()
  }
  // 4. Visiting /auth/google directly (no pending login) does nothing harmful
  {
    const ctx = await browser.newContext()
    await ctx.addInitScript(() => { try { localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {} })
    const page = await ctx.newPage()
    let tokenCalls = 0
    await ctx.route('**/*.supabase.co/**', r => { if (new URL(r.request().url()).pathname === '/auth/v1/token') tokenCalls++; return r.fulfill({ json: {} }) })
    await page.goto(`${base}/auth/google#id_token=attacker.token&state=${'a'.repeat(64)}`)
    await page.getByText('登入未完成').waitFor({ timeout: 20000 })
    check('Unsolicited token link (login CSRF) is ignored', tokenCalls === 0)
    await ctx.close()
  }
  console.log(`\n${passes} checks passed`)
} finally {
  await browser.close()
}
