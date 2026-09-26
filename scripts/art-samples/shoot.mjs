// Art-direction sample shooter (dev-only).
// node scripts/art-samples/shoot.mjs <current|paper|sketch> [shotFilter]
// Env: BASE_URL (default http://localhost:3417), OUT_DIR, AUTH_FILE, E2E_EMAIL, E2E_PASSWORD
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const MODE = process.argv[2] || 'current'
const FILTER = process.argv[3] || ''
const BASE = process.env.BASE_URL || 'http://localhost:3417'
const OUT = process.env.OUT_DIR
const AUTH = process.env.AUTH_FILE
if (!OUT || !AUTH) throw new Error('OUT_DIR and AUTH_FILE are required')
if (process.env.E2E_ENV_FILE && fs.existsSync(process.env.E2E_ENV_FILE)) {
  for (const line of fs.readFileSync(process.env.E2E_ENV_FILE, 'utf8').split('\n')) {
    const m = /^(E2E_EMAIL|E2E_PASSWORD)=(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2]
  }
}
fs.mkdirSync(OUT, { recursive: true })

const q = MODE === 'current' ? '?art=off' : `?art=${MODE}`
const WIDTHS = [
  { w: 1440, h: 900, dsf: 1 },
  { w: 390, h: 844, dsf: 2 },
]
const want = (name) => !FILTER || name.includes(FILTER)
const file = (name) => path.join(OUT, `${MODE}-${name}.png`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function scrollThrough(page) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < total; y += 500) {
    await page.evaluate((v) => window.scrollTo(0, v), y)
    await sleep(120)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(500)
}

async function ensureAuth(browser) {
  if (fs.existsSync(AUTH)) return
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(process.env.E2E_EMAIL)
  await page.locator('#password').fill(process.env.E2E_PASSWORD)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 60000 })
  await ctx.storageState({ path: AUTH })
  await ctx.close()
}

async function setTheme(page, theme) {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme)
}

const browser = await chromium.launch({ headless: true })
try {
  for (const { w, h, dsf } of WIDTHS) {
    // ---- public pages (signed out) ----
    const pub = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, locale: 'zh-TW' })
    const p = await pub.newPage()
    if (want('home')) {
      await p.goto(`${BASE}/${q}`, { waitUntil: 'domcontentloaded' })
      await p.locator('#hero-title').waitFor({ timeout: 90000 })
      await sleep(1500)
      await scrollThrough(p)
      await p.screenshot({ path: file(`home-${w}`) })
      await p.locator('#features').evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await sleep(900)
      await p.screenshot({ path: file(`features-${w}`) })
    }
    if (want('login')) {
      await p.goto(`${BASE}/login${q}`, { waitUntil: 'domcontentloaded' })
      await p.locator('#email').waitFor({ timeout: 90000 })
      await sleep(1500)
      await p.screenshot({ path: file(`login-${w}`) })
      await setTheme(p, 'dark')
      await p.reload({ waitUntil: 'domcontentloaded' })
      await p.locator('#email').waitFor({ timeout: 90000 })
      await sleep(1200)
      await p.screenshot({ path: file(`login-dark-${w}`) })
      await setTheme(p, 'light')
    }
    await pub.close()

    // ---- signed-in app ----
    if (want('app') || want('empty')) {
      await ensureAuth(browser)
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: dsf,
        storageState: AUTH,
        locale: 'zh-TW',
        hasTouch: w < 768,
        isMobile: w < 768,
      })
      const a = await ctx.newPage()
      // Keep the sample read-only: block every write to Supabase.
      await a.route('**/rest/v1/**', (route) => {
        if (route.request().method() === 'GET' || route.request().method() === 'HEAD') return route.continue()
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      })
      if (want('app')) {
        await a.goto(`${BASE}/${q}`, { waitUntil: 'domcontentloaded' })
        await a.waitForFunction(() => !!document.querySelector('[data-tour], main'), null, { timeout: 90000 })
        await sleep(6000)
        await a.keyboard.press('Escape').catch(() => {})
        await sleep(400)
        await a.screenshot({ path: file(`app-${w}`) })
        await setTheme(a, 'dark')
        await a.reload({ waitUntil: 'domcontentloaded' })
        await sleep(6000)
        await a.keyboard.press('Escape').catch(() => {})
        await sleep(400)
        await a.screenshot({ path: file(`app-dark-${w}`) })
        await setTheme(a, 'light')
      }
      if (want('empty')) {
        // Empty notebook: serve an empty list for notebook reads only.
        await a.route('**/rest/v1/notebook_**', (route) =>
          route.request().method() === 'GET'
            ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
            : route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
        )
        await a.goto(`${BASE}/notebook${q}`, { waitUntil: 'domcontentloaded' })
        await sleep(6000)
        await a.screenshot({ path: file(`empty-${w}`) })
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}
console.log('done', MODE)
