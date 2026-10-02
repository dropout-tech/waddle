/* eslint-disable no-console -- executable regression checks */
// Org invite links reach the iOS app (2026-10-02, owner chose "C + B, ease of use first"):
//   1. /.well-known/apple-app-site-association is served as JSON for Universal Links
//   2. iPhone browser, logged out: 「用 Huddle App 開啟」 (huddle://) or 「用網頁登入」
//   3. desktop browser, logged out: unchanged — straight to /login
//   4. org page: paste an invite link → invite preview (bad text → friendly error)
//   5. inside the app (Capacitor faked as iOS): an https:// or huddle:// invite
//      link handed over by iOS opens the invite preview
// preview_org_invite / accept_org_invite are intercepted: no org is joined and
// nothing is written. Start the app separately:
//   E2E_BASE_URL=http://localhost:3187 node scripts/e2e/org-invite-links-verify.mjs
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { chromium, devices } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n')
  .filter(line => line.includes('=') && !line.startsWith('#'))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const base = process.env.E2E_BASE_URL || 'http://localhost:3187'
const shots = process.env.E2E_SCREENSHOT_DIR || path.join(tmpdir(), 'huddle-org-invite-links')
mkdirSync(shots, { recursive: true })
const TOKEN = 'AbC_dEf-0123456789abcdefghijklmnopqrstuvwxy' // fake, 43-char base64url like the real ones

let passes = 0
const check = (label, condition, detail = '') => { assert.ok(condition, `${label} ${detail}`); passes++; console.log('PASS', label) }
const browser = await chromium.launch()
const pageErrors = []
const accepted = []

async function newContext(opts = {}, { native = false, lang = 'zh-TW' } = {}) {
  const context = await browser.newContext({ locale: 'zh-TW', serviceWorkers: 'block', ...opts })
  const previews = []
  await context.route('**/rest/v1/rpc/preview_org_invite', route => {
    previews.push(route.request().postDataJSON()?.p_token)
    return route.fulfill({ json: [{ org_name: '測試組織', inviter_name: '小明', member_count: 3, already_member: false }] })
  })
  await context.route('**/rest/v1/rpc/accept_org_invite', route => { accepted.push(1); return route.fulfill({ json: '00000000-0000-4000-8000-000000000000' }) })
  if (native) {
    // Fake the iOS app. Like the real bridge, App listeners are registered on
    // the "native side" (PluginHeaders + nativeCallback), so the test can fire
    // appUrlOpen exactly the way iOS does. (Relying on the web fallback alone
    // races: concurrent first calls create two AppWeb instances.)
    await context.addInitScript(() => {
      window.CapacitorCustomPlatform = { name: 'ios', plugins: {} }
      const listeners = {}
      window.__fireAppEvent = (eventName, data) => (listeners[eventName] || []).forEach(cb => cb(data))
      window.Capacitor = {
        PluginHeaders: [{ name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }] }],
        nativeCallback: (plugin, method, options, cb) => {
          if (method === 'addListener') (listeners[options.eventName] ||= []).push(cb)
          return `${plugin}-${Math.random()}`
        },
        nativePromise: () => Promise.resolve(),
      }
    })
  }
  await context.addInitScript(l => { try { localStorage.setItem('waddle-language-v1', l) } catch {} }, lang)
  const page = await context.newPage()
  page.on('pageerror', e => pageErrors.push(e.message))
  return { context, page, previews }
}

async function login(page) {
  await page.goto(`${base}/login?method=email`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(env.E2E_EMAIL)
  await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type=submit]').click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 90000 })
}

const previewShown = page => page.getByText('小明 邀請你加入「測試組織」').waitFor({ state: 'visible', timeout: 30000 })

try {
  // 1. Apple's association file
  {
    const res = await fetch(`${base}/.well-known/apple-app-site-association`, { redirect: 'manual' })
    check('AASA: 200 without redirect', res.status === 200, `status ${res.status}`)
    check('AASA: served as application/json', (res.headers.get('content-type') || '').includes('application/json'), res.headers.get('content-type'))
    const json = await res.json()
    const detail = json.applinks?.details?.[0]
    check('AASA: app id = PQZ8V7ZAXU.com.lazylazy.huddle', detail?.appIDs?.includes('PQZ8V7ZAXU.com.lazylazy.huddle'))
    check('AASA: only /org/invite* is claimed', JSON.stringify(detail?.components) === JSON.stringify([{ '/': '/org/invite*', comment: detail.components[0].comment }]))
  }

  // 2. iPhone browser, logged out
  {
    const { context, page } = await newContext({ ...devices['iPhone 13'], locale: 'zh-TW' })
    await page.goto(`${base}/org/invite#t=${TOKEN}`, { waitUntil: 'domcontentloaded' })
    const card = page.getByTestId('org-invite-ios-choice')
    await card.waitFor({ state: 'visible', timeout: 30000 })
    check('iPhone logged out: choice card instead of an instant redirect', page.url().includes('/org/invite'))
    const href = await card.getByRole('link', { name: '用 Huddle App 開啟' }).getAttribute('href')
    check('iPhone: 「用 Huddle App 開啟」 links to huddle://org/invite#t=…', href === `huddle://org/invite#t=${TOKEN}`, href)
    const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('huddle-pending-org-invite') || 'null')?.token)
    check('iPhone: invite parked for the web sign-in route too', pending === TOKEN)
    const btns = await card.locator('a, button').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))
    check('iPhone: both buttons ≥ 44px tall', btns.every(h => h >= 43.5), JSON.stringify(btns))
    await page.screenshot({ path: path.join(shots, 'iphone-choice.png') })
    await card.getByRole('button', { name: '用網頁登入' }).click()
    await page.waitForURL(u => u.pathname.startsWith('/login'), { timeout: 30000 })
    check('iPhone: 「用網頁登入」 goes to /login', true)
    await context.close()
  }
  {
    const { context, page } = await newContext({ ...devices['iPhone 13'], locale: 'en' }, { lang: 'en' })
    await page.goto(`${base}/org/invite#t=${TOKEN}`, { waitUntil: 'domcontentloaded' })
    const card = page.getByTestId('org-invite-ios-choice')
    await card.waitFor({ state: 'visible', timeout: 30000 })
    const text = await card.innerText()
    check('iPhone English: no Chinese left on the choice card', !/[一-鿿]/.test(text), text)
    await page.screenshot({ path: path.join(shots, 'iphone-choice-en.png') })
    await context.close()
  }

  // 3. desktop browser, logged out — unchanged
  {
    const { context, page } = await newContext({ viewport: { width: 1280, height: 900 } })
    await page.goto(`${base}/org/invite#t=${TOKEN}`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(u => u.pathname.startsWith('/login'), { timeout: 30000 })
    check('desktop logged out: still goes straight to /login', await page.getByTestId('org-invite-ios-choice').count() === 0)
    await context.close()
  }

  // 4. org page: paste an invite link
  {
    const { context, page, previews } = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
    await login(page)
    await page.goto(`${base}/org`, { waitUntil: 'domcontentloaded' })
    const toggle = page.getByTestId('org-join-toggle')
    const section = page.getByTestId('org-join')
    await Promise.race([toggle.waitFor({ timeout: 30000 }), section.waitFor({ timeout: 30000 })])
    if (await toggle.isVisible()) await toggle.click()
    await section.waitFor({ state: 'visible' })
    const input = section.getByRole('textbox', { name: '邀請連結' })
    await input.fill('hello')
    await section.getByRole('button', { name: '加入', exact: true }).click()
    await section.getByRole('alert').waitFor({ state: 'visible', timeout: 5000 })
    check('paste box: junk text → friendly error, stays on /org', (await section.getByRole('alert').innerText()).includes('不是邀請連結') && new URL(page.url()).pathname.replace(/\/$/, '') === '/org')
    await page.screenshot({ path: path.join(shots, 'org-paste-error.png') })
    // 「貼上」 button reads the clipboard and joins in one tap.
    await page.evaluate(t => navigator.clipboard.writeText(`https://huddle.lazy72.com/org/invite#t=${t}`), TOKEN)
    await section.getByRole('button', { name: '貼上' }).click()
    await page.waitForURL(u => u.pathname.startsWith('/org/invite'), { timeout: 30000 })
    await previewShown(page)
    check('paste box: 「貼上」 → invite preview for that token', previews.at(-1) === TOKEN, `previewed ${previews.at(-1)}`)
    await page.screenshot({ path: path.join(shots, 'org-paste-preview.png') })
    await context.close()
  }

  // 5. inside the app: links handed over by iOS
  for (const link of [`https://huddle.lazy72.com/org/invite#t=${TOKEN}`, `huddle://org/invite#t=${TOKEN}`]) {
    const { context, page, previews } = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, { native: true })
    await login(page)
    // What iOS does on a Universal Link / custom-scheme open: App 'appUrlOpen'.
    await page.waitForTimeout(2000) // DeepLinkHandler registers its listener after mount
    await page.evaluate(url => window.__fireAppEvent('appUrlOpen', { url }), link)
    await page.waitForURL(u => u.pathname.startsWith('/org/invite'), { timeout: 30000 })
    await previewShown(page)
    check(`app: ${link.split(':')[0]}:// invite link opens the invite preview`, previews.at(-1) === TOKEN, `previewed ${previews.at(-1)}`)
    await page.screenshot({ path: path.join(shots, `app-${link.split(':')[0]}.png`) })
    await context.close()
  }

  check('nothing joined (accept_org_invite never called)', accepted.length === 0)
  check(`no page errors${pageErrors.length ? ': ' + pageErrors.join(' | ') : ''}`, pageErrors.length === 0)
  console.log(`ALL PASSED (${passes}) — screenshots in ${shots}`)
} finally {
  await browser.close()
}
