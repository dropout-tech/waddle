// Android PWA verification (manifest, service worker, offline, install entry,
// update rollout). Chromium, Pixel-class 412x915 emulation.
//
//   pnpm build && PORT=3123 pnpm start
//   UPSTREAM=http://localhost:3123 SHOTS=<dir> node scripts/e2e/pwa-verify.mjs
//
// Needs a production build — the worker is not registered under `next dev`.
// The browser talks to a tiny local proxy (PROXY_PORT, default 3124) in front
// of UPSTREAM so the script can simulate "a new deploy" (changed HTML) and "a
// new worker" (changed sw.js) without touching files on disk.
//
// Zero writes anywhere: the only Supabase traffic is two anonymous GETs; the
// signed-in pass uses a fake session cookie with every Supabase request
// aborted in the browser, so nothing reaches the real project.
import { chromium } from 'playwright'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const UPSTREAM = new URL(process.env.UPSTREAM || 'http://localhost:3123')
const PROXY_PORT = Number(process.env.PROXY_PORT || 3124)
const BASE = `http://localhost:${PROXY_PORT}`
const SHOTS = process.env.SHOTS || path.resolve('pwa-shots')
fs.mkdirSync(SHOTS, { recursive: true })

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
  })
)
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const REF = new URL(SUPA).hostname.split('.')[0]

let pass = 0, fail = 0
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Proxy: pass-through, with optional "new deploy" / "new worker" rewrites ──
const sim = { build: null, swVersion: null }
const proxy = http.createServer((req, res) => {
  const rewriteHtml = sim.build && req.method === 'GET' && req.url === '/'
  const rewriteSw = sim.swVersion && req.url === '/sw.js'
  const headers = { ...req.headers, host: UPSTREAM.host, 'accept-encoding': 'identity' }
  if (rewriteHtml || rewriteSw) { delete headers['if-none-match']; delete headers['if-modified-since'] }
  const up = http.request({ hostname: UPSTREAM.hostname, port: UPSTREAM.port, path: req.url, method: req.method, headers }, (ur) => {
    if (!rewriteHtml && !rewriteSw) { res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); return }
    const chunks = []
    ur.on('data', (c) => chunks.push(c))
    ur.on('end', () => {
      let body = Buffer.concat(chunks).toString('utf8')
      if (rewriteHtml) body = body.replace('<head>', `<head><meta name="huddle-test-build" content="${sim.build}">`)
      if (rewriteSw) body = body.replace("const VERSION = 'v1'", `const VERSION = '${sim.swVersion}'`)
      const h = { ...ur.headers }
      delete h['content-length']; delete h.etag
      h['cache-control'] = 'no-store'
      res.writeHead(ur.statusCode, h); res.end(body)
    })
  })
  up.on('error', () => { res.writeHead(502); res.end() })
  req.pipe(up)
})
await new Promise((r) => proxy.listen(PROXY_PORT, r))

const PIXEL = {
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  locale: 'zh-TW',
  serviceWorkers: 'allow',
}

async function cacheDump(page) {
  return page.evaluate(async () => {
    const out = {}
    for (const n of await caches.keys()) {
      const c = await caches.open(n)
      out[n] = (await c.keys()).map((r) => r.url)
    }
    return out
  })
}
async function waitControlled(page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => !!navigator.serviceWorker.controller)) return true
    await sleep(250)
  }
  return false
}
async function waitStaticSettled(page) {
  let last = -1
  for (let i = 0; i < 30; i++) {
    const n = ((await cacheDump(page))['huddle-static'] || []).length
    if (n > 0 && n === last) return n
    last = n
    await sleep(500)
  }
  return last
}
function fakeSessionCookie() {
  const now = Math.floor(Date.now() / 1000)
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const uid = '00000000-0000-4000-8000-000000000001'
  const jwt = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: uid, exp: now + 86400, role: 'authenticated' })}.sig`
  const session = {
    access_token: jwt, token_type: 'bearer', expires_in: 86400, expires_at: now + 86400, refresh_token: 'fake-refresh',
    user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'pwa-offline@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  }
  return { name: `sb-${REF}-auth-token`, value: `base64-${b64u(session)}`, url: BASE }
}
const fakeInstallPrompt = () => {
  const e = new Event('beforeinstallprompt', { cancelable: true })
  e.prompt = async () => { window.__prompted = true }
  e.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' })
  window.dispatchEvent(e)
}

const browser = await chromium.launch()
try {
  // ── 1. Manifest + icons + Chromium installability ─────────────────────────
  const ctx = await browser.newContext(PIXEL)
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  const man = await (await ctx.request.get(`${BASE}/manifest.webmanifest`)).json()
  check('manifest parses', man && man.name === 'Huddle' && man.short_name === 'Huddle')
  check('manifest start_url/scope/display', man.start_url === '/' && man.scope === '/' && man.display === 'standalone')
  check('manifest colours', man.theme_color === '#f6f3e9' && man.background_color === '#f6f3e9')
  const maskable = man.icons.filter((i) => i.purpose === 'maskable').map((i) => i.sizes)
  check('manifest has any 192/512 + maskable 192/512', man.icons.length === 4 && maskable.includes('192x192') && maskable.includes('512x512'))
  for (const src of new Set([...man.icons, ...man.shortcuts.flatMap((s) => s.icons || [])].map((i) => i.src))) {
    const r = await ctx.request.get(`${BASE}${src}`)
    check(`icon ${src} 200 png`, r.status() === 200 && (r.headers()['content-type'] || '').includes('image/png'))
  }
  check('shortcuts', JSON.stringify(man.shortcuts.map((s) => s.url)) === JSON.stringify(['/?widget=new-task', '/?widget=week', '/?widget=whiteboard', '/notebook']), man.shortcuts.map((s) => `${s.name}→${s.url}`).join(', '))

  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  const cdp = await ctx.newCDPSession(page)
  try {
    const inst = await cdp.send('Page.getInstallabilityErrors')
    check('Chromium installability errors = none', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors))
  } catch (e) {
    console.log(`INFO Page.getInstallabilityErrors unavailable: ${e.message}`)
  }

  // ── 2. Service worker registers, activates, controls, precaches ───────────
  const controlled = await waitControlled(page)
  const state = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)
  check('SW activated + controls page', controlled && state === 'activated', `state=${state}`)
  const nStatic = await waitStaticSettled(page)
  let dump = await cacheDump(page)
  check('shell cache has offline page', (dump['huddle-shell-v1'] || []).some((u) => u.endsWith('/offline.html')), `caches=${Object.keys(dump).join(',')}`)
  check('static cache populated', nStatic > 5, `${nStatic} hashed assets`)

  // ── 3. Supabase / HTML / API never cached ─────────────────────────────────
  const supaResponses = []
  page.on('response', (r) => { if (r.url().startsWith(SUPA)) supaResponses.push(r) })
  await page.evaluate(async ({ SUPA, ANON }) => {
    await fetch(`${SUPA}/auth/v1/settings`, { headers: { apikey: ANON } }).catch(() => {})
    await fetch(`${SUPA}/rest/v1/profiles?select=id&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }).catch(() => {})
  }, { SUPA, ANON })
  await page.goto(`${BASE}/login`, { waitUntil: 'load' })
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await sleep(1000)
  dump = await cacheDump(page)
  const all = Object.values(dump).flat()
  check('no Supabase URL in any cache', !all.some((u) => u.includes('supabase')), `${all.length} entries total`)
  const allowed = (u) => {
    const x = new URL(u)
    return x.origin === BASE && (x.pathname.startsWith('/_next/static/') || ['/offline.html', '/manifest.webmanifest'].includes(x.pathname) || /^\/app-icon.*\.png$/.test(x.pathname))
  }
  const bad = all.filter((u) => !allowed(u))
  check('cache holds only offline page, icons, manifest, hashed assets (no HTML)', bad.length === 0, bad.slice(0, 3).join(' '))
  check('Supabase responses bypassed the SW', supaResponses.length >= 2 && supaResponses.every((r) => !r.fromServiceWorker()), `${supaResponses.length} responses`)
  await page.screenshot({ path: path.join(SHOTS, '01-online-home.png') })

  // ── 4. Fully offline ──────────────────────────────────────────────────────
  await ctx.setOffline(true)
  for (const [p, shot] of [['/', '02-offline-launch.png'], ['/?widget=week', null], ['/membership', null]]) {
    await page.goto(`${BASE}${p}`, { waitUntil: 'load' }).catch(() => {})
    const txt = await page.evaluate(() => document.body.innerText)
    check(`offline ${p} → bilingual offline page`, txt.includes('目前沒有網路連線') && txt.includes("You're offline"))
    if (shot) await page.screenshot({ path: path.join(SHOTS, shot) })
  }
  const someStatic = (dump['huddle-static'] || [])[0]
  check('offline: hashed assets still served from cache', (await page.evaluate(async (u) => (await fetch(u)).status, someStatic)) === 200)
  // Going back online fires the page's `online` event → it reloads itself.
  await ctx.setOffline(false)
  await sleep(500)
  await page.waitForLoadState('load')
  await page.waitForFunction(() => !document.body.innerText.includes('目前沒有網路連線'), null, { timeout: 15000 }).then(
    () => check('back online → offline page reloads into the app', true),
    () => check('back online → offline page reloads into the app', false),
  )

  // ── 5. Signed-in board: install entry + standalone mode ──────────────────
  // Fake session; every Supabase request is aborted inside the browser.
  await ctx.route((u) => u.href.startsWith(SUPA), (route) => route.abort())
  await ctx.addCookies([fakeSessionCookie()])
  await ctx.addInitScript(() => {
    const mm = window.matchMedia.bind(window)
    window.matchMedia = (q) => {
      const r = mm(q)
      if (!/display-mode:\s*standalone/.test(q) || localStorage.getItem('__pwaTestStandalone') !== '1') return r
      return { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
    }
    const s = document.createElement('style'); s.textContent = '[data-pet-adopt]{display:none!important}'
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s))
  })
  // The phone board opens on 日曆; the avatar menu trigger lives in the 任務 tab header.
  const openTasksTab = async () => {
    const tab = page.getByRole('tab', { name: /任務/ }).first()
    await tab.waitFor({ timeout: 30000 }).catch(() => {})
    await tab.click().catch(() => {})
  }
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await openTasksTab()
  const menuBtn = page.getByRole('button', { name: '使用者選單' }).first()
  await menuBtn.waitFor({ timeout: 30000 }).catch(() => {})
  if (await menuBtn.isVisible().catch(() => false)) {
    const setMenu = async (open) => {
      if ((await menuBtn.getAttribute('aria-expanded')) !== String(open)) await menuBtn.click()
      await sleep(300)
    }
    await setMenu(true)
    check('browser tab: no install entry before Chrome offers one', (await page.locator('[data-pwa-install]').count()) === 0)
    await setMenu(false)
    await page.evaluate(fakeInstallPrompt)
    await setMenu(true)
    const item = page.locator('[data-pwa-install="android"]')
    check('browser tab: 「安裝到手機」 shown after beforeinstallprompt', await item.isVisible().catch(() => false))
    await page.screenshot({ path: path.join(SHOTS, '03-menu-install-entry.png') })
    if (await item.isVisible().catch(() => false)) {
      await item.click()
      check('tapping it opens Chrome install dialog (prompt())', await page.evaluate(() => window.__prompted === true))
    }
    await setMenu(false)

    // Headless Chromium can't be put into a real installed window, and CDP
    // setEmulatedMedia ignores display-mode, so answer the app's
    // matchMedia('(display-mode: standalone)') query as an installed app would.
    await page.evaluate(() => localStorage.setItem('__pwaTestStandalone', '1'))
    await page.reload({ waitUntil: 'load' })
    await openTasksTab()
    await menuBtn.waitFor({ timeout: 30000 })
    check('display-mode standalone emulated', await page.evaluate(() => matchMedia('(display-mode: standalone)').matches))
    await page.evaluate(fakeInstallPrompt)
    await setMenu(true)
    check('standalone: install entry hidden', (await page.locator('[data-pwa-install]').count()) === 0)
    await page.screenshot({ path: path.join(SHOTS, '04-standalone-menu.png') })
    await setMenu(false)
    const tc = await page.evaluate(() => Array.from(document.querySelectorAll('meta[name="theme-color"]'), (m) => m.content))
    check('standalone: theme-color = paper #f6f3e9', tc.length > 0 && tc.every((c) => c === '#f6f3e9'), tc.join(','))
    const vp = await page.evaluate(() => ({ h: innerHeight, root: Math.round(document.querySelector('.h-\\[100dvh\\]')?.getBoundingClientRect().height ?? -1), sx: document.documentElement.scrollWidth, w: innerWidth }))
    check('standalone: board fills 100dvh, no horizontal overflow', vp.root === vp.h && vp.sx <= vp.w, JSON.stringify(vp))
    await page.screenshot({ path: path.join(SHOTS, '05-standalone-board.png') })
    await page.evaluate(() => localStorage.removeItem('__pwaTestStandalone'))
  } else {
    check('signed-in board renders (user menu)', false, `text="${await page.evaluate(() => document.body.innerText.slice(0, 80))}"`)
    await page.screenshot({ path: path.join(SHOTS, '03-signed-in-FAILED.png') })
  }
  await ctx.unroute((u) => u.href.startsWith(SUPA))
  await ctx.clearCookies()

  // ── 6. New deploy + new worker: nobody gets stuck on the old version ──────
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  sim.build = 'deploy-2'
  await page.reload({ waitUntil: 'load' })
  check('next launch after a deploy shows the new HTML', (await page.evaluate(() => document.querySelector('meta[name="huddle-test-build"]')?.content)) === 'deploy-2')
  sim.build = null

  sim.swVersion = 'v2-test'
  const after = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    const before = reg.active
    const changed = new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', () => r(true), { once: true }))
    await reg.update()
    const t0 = Date.now()
    const swapped = await Promise.race([changed, new Promise((r) => setTimeout(() => r(false), 30000))])
    window.__swapMs = Date.now() - t0
    // controllerchange fires as activation starts; cache cleanup runs inside
    // the activate event, so wait for the worker to reach 'activated'.
    for (let i = 0; i < 40 && (await navigator.serviceWorker.getRegistration()).active?.state !== 'activated'; i++) {
      await new Promise((r) => setTimeout(r, 250))
    }
    const now = await navigator.serviceWorker.getRegistration()
    return { swapped, ms: window.__swapMs, newWorker: now.active !== before, waiting: !!now.waiting, active: now.active?.state, caches: await caches.keys() }
  })
  sim.swVersion = null
  check('updated worker takes control without a reload or waiting phase', after.swapped && after.newWorker && !after.waiting && after.active === 'activated', JSON.stringify({ ...after, caches: undefined }))
  check('old shell cache dropped, new one present, hashed assets kept', after.caches.includes('huddle-shell-v2-test') && !after.caches.includes('huddle-shell-v1') && after.caches.includes('huddle-static'), after.caches.join(','))

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
  await ctx.close()
} finally {
  await browser.close()
  proxy.close()
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
