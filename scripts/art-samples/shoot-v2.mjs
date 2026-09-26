// Dev-only shooter for the 2026-09-26 "bold marketing + paper app" pass.
// node scripts/art-samples/shoot-v2.mjs [filter]
// Env: BASE_URL, OUT_DIR, AUTH_FILE, E2E_ENV_FILE, PROD_URL
// Read-only: every non-GET request to Supabase except sign-in is fulfilled locally.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const FILTER = process.argv[2] || ''
const BASE = process.env.BASE_URL || 'http://localhost:3461'
const PROD = process.env.PROD_URL || 'https://waddle.zeabur.app'
const OUT = process.env.OUT_DIR
const AUTH = process.env.AUTH_FILE
if (!OUT || !AUTH) throw new Error('OUT_DIR and AUTH_FILE are required')
if (process.env.E2E_ENV_FILE && fs.existsSync(process.env.E2E_ENV_FILE)) {
  for (const line of fs.readFileSync(process.env.E2E_ENV_FILE, 'utf8').split('\n')) {
    const m = /^(E2E_EMAIL|E2E_PASSWORD)=(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
fs.mkdirSync(OUT, { recursive: true })
const want = (n) => !FILTER || n.includes(FILTER)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const file = (n) => path.join(OUT, `${n}.png`)
const report = []

async function guard(ctx) {
  await ctx.route(/supabase\.co\//, (route) => {
    const req = route.request()
    const m = req.method()
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue()
    if (/\/auth\/v1\/token/.test(req.url())) return route.continue()
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

async function scrollThrough(page) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < total; y += 400) {
    await page.evaluate((v) => window.scrollTo(0, v), y)
    await sleep(140)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(600)
}

const SECTIONS = [
  ['proof', '#proof-title'],
  ['features', '#features'],
  ['more', '#more-title'],
  ['whiteboard', '#board-title'],
  ['focus', '#focus-title'],
  ['pricing', '#pricing'],
  ['download', '#download'],
]

const browser = await chromium.launch({ headless: true })
try {
  for (const w of [1440, 390]) {
    const h = w === 1440 ? 900 : 844
    const dsf = w === 1440 ? 1 : 2
    const mobile = w < 768
    const pub = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, locale: 'zh-TW', isMobile: mobile, hasTouch: mobile })
    await guard(pub)
    const p = await pub.newPage()

    if (want('home')) {
      let bytes = 0
      const imgs = new Map()
      p.on('response', async (r) => {
        if (r.request().resourceType() !== 'image') return
        try { const b = await r.body(); imgs.set(r.url(), b.length) } catch {}
      })
      await p.goto(`${BASE}/about`, { waitUntil: 'domcontentloaded' })
      await p.locator('#hero-title').waitFor({ timeout: 120000 })
      await p.waitForLoadState('load')
      await sleep(1500)
      const firstLoad = [...imgs.values()].reduce((a, b) => a + b, 0)
      await p.screenshot({ path: file(`home-hero-${w}`) })
      const heroBox = await p.locator('#hero-title').boundingBox()
      const ctaBox = await p.locator('a[href="/signup"]').first().boundingBox()
      report.push(`home ${w}: h1 box ${JSON.stringify(heroBox)} cta ${JSON.stringify(ctaBox)}`)
      await scrollThrough(p)
      for (const [name, sel] of SECTIONS) {
        const sec = p.locator(sel).locator('xpath=ancestor-or-self::section[1]')
        await sec.scrollIntoViewIfNeeded()
        await sleep(500)
        await sec.screenshot({ path: file(`home-${name}-${w}`) })
      }
      await sleep(800)
      bytes = [...imgs.values()].reduce((a, b) => a + b, 0)
      report.push(`home ${w}: images first-load ${Math.round(firstLoad / 1024)}KB, after full scroll ${Math.round(bytes / 1024)}KB (${imgs.size} files)`)
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      report.push(`home ${w}: horizontal overflow ${overflow}px`)
      await p.evaluate(() => window.scrollTo(0, 0))
      await sleep(400)
      await p.screenshot({ path: file(`home-full-${w}`), fullPage: true })
    }
    if (want('en')) {
      await p.goto(`${BASE}/en/about`, { waitUntil: 'domcontentloaded' })
      await p.locator('#hero-title').waitFor({ timeout: 120000 })
      await p.waitForLoadState('load')
      await sleep(1200)
      await p.screenshot({ path: file(`en-hero-${w}`) })
    }
    if (want('prod')) {
      const q = await pub.newPage()
      await q.goto(`${PROD}/about`, { waitUntil: 'load', timeout: 120000 })
      await sleep(2500)
      await scrollThrough(q)
      await q.screenshot({ path: file(`prod-full-${w}`), fullPage: true })
      await q.screenshot({ path: file(`prod-hero-${w}`) })
      await q.close()
    }
    if (want('login')) {
      await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
      await p.locator('#email').waitFor({ timeout: 120000 })
      await sleep(1500)
      await p.screenshot({ path: file(`login-${w}`) })
      await p.evaluate(() => localStorage.setItem('theme', 'dark'))
      await p.reload({ waitUntil: 'domcontentloaded' })
      await p.locator('#email').waitFor({ timeout: 120000 })
      await sleep(1200)
      await p.screenshot({ path: file(`login-dark-${w}`) })
      await p.evaluate(() => localStorage.setItem('theme', 'light'))
    }
    await pub.close()

    if (want('app')) {
      if (!fs.existsSync(AUTH)) {
        const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' })
        await guard(c)
        const lp = await c.newPage()
        await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
        await lp.locator('#email').fill(process.env.E2E_EMAIL)
        await lp.locator('#password').fill(process.env.E2E_PASSWORD)
        await lp.getByRole('button', { name: '登入', exact: true }).click()
        await lp.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 })
        await sleep(4000)
        await c.storageState({ path: AUTH })
        await c.close()
      }
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, storageState: AUTH, locale: 'zh-TW', isMobile: mobile, hasTouch: mobile })
      await guard(ctx)
      const a = await ctx.newPage()
      for (const theme of ['light', 'dark']) {
        await a.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
        await a.evaluate((t) => localStorage.setItem('theme', t), theme)
        await a.reload({ waitUntil: 'domcontentloaded' })
        await sleep(7000)
        await a.keyboard.press('Escape').catch(() => {})
        await sleep(500)
        const art = await a.evaluate(() => [document.documentElement.dataset.art, !!document.querySelector('[data-surface="marketing"]')])
        report.push(`app ${w} ${theme}: data-art=${art[0]} marketingVisible=${art[1]}`)
        await a.screenshot({ path: file(`app-${theme}-${w}`) })
      }
      await a.evaluate(() => localStorage.setItem('theme', 'light'))
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}
console.log(report.join('\n'))
