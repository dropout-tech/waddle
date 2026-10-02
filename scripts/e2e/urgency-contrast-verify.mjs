#!/usr/bin/env node
/**
 * Urgency-critical contrast verification (no CSS injection).
 *
 * Seeds "[色票測試]" tasks on the e2e test account, then for
 * 2 themes x 2 viewports (desktop 1440x900 full-screen task list, mobile
 * 390x844 task-detail modal) asserts on the real rendered page:
 *   1. >=1 visible .text-urgency-critical-ink, 0 visible legacy .text-urgency-critical
 *   2. every visible ink element: WCAG contrast vs first opaque background >= 4.5
 *   3. visible .bg-urgency-critical-strong: white text contrast >= 4.5 (SKIP if none)
 *   4. computed ink color ~ light rgb(180,67,52) / dark rgb(244,124,110), +-3 per channel
 * Screenshots -> docs/design/urgency-contrast-20261002/after/<theme>-<viewport>.png
 * Seeded tasks are always deleted at the end. Spawns its own `next dev` on :3100
 * if none is running and kills it on exit.
 *
 * Needs .env.local + .env.e2e.local in cwd. Run: node scripts/e2e/urgency-contrast-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = 'http://localhost:3100'
const AFTER = path.resolve('docs/design/urgency-contrast-20261002/after')
mkdirSync(AFTER, { recursive: true })
const SEED_FILE = path.join(tmpdir(), 'urgency-verify-seed-ids.json')
const PREFIX = '[色票測試]'
const TITLE = `${PREFIX} 緊急 10 逾期一天`

const rd = (f) =>
  Object.fromEntries(
    readFileSync(f, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
  )
if (!existsSync('.env.e2e.local') || !existsSync('.env.local')) {
  console.error('[verify] need .env.local and .env.e2e.local in cwd'); process.exit(1)
}
const e2e = rd('.env.e2e.local')
const app = rd('.env.local')
const SB = app.NEXT_PUBLIC_SUPABASE_URL
const KEY = app.NEXT_PUBLIC_SUPABASE_ANON_KEY

const THEMES = ['light', 'dark']
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
const EXPECTED_INK = { light: [180, 67, 52], dark: [244, 124, 110] }

// ------------------------------------------------------------ assertions
let failed = 0, passed = 0
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} — ${msg}`); ok ? passed++ : failed++ }
const skip = (msg) => console.log(`SKIP — ${msg}`)

// ------------------------------------------------------------ supabase (test account only)
let token, userId
async function rfetch(url, init) { // retry transient network failures (cleanup must not be skipped)
  let err
  for (let i = 0; i < 5; i++) {
    try { return await fetch(url, { ...init, signal: AbortSignal.timeout(30000) }) } catch (e) { err = e; await sleep(2000) }
  }
  throw err
}
async function sbLogin() {
  const r = await rfetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: e2e.E2E_EMAIL, password: e2e.E2E_PASSWORD }),
  }).then((x) => x.json())
  if (!r.access_token) throw new Error('supabase login failed')
  token = r.access_token; userId = r.user.id
}
const rest = (q, init = {}) => rfetch(`${SB}/rest/v1/${q}`, {
  ...init, headers: { apikey: KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
})
const ymd = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

async function seed() {
  const ws = (await (await rest('workspaces?select=id&name=eq.工作')).json())[0]
  const cat = (await (await rest(`categories?select=id&workspace_id=eq.${ws.id}&name=eq.本週`)).json())[0]
  const rows = [
    { t: '緊急 10 逾期一天', u: 10, d: ymd(-1) }, { t: '逾期三天 週報', u: 6, d: ymd(-3) },
    { t: '緊急 9 後天到期', u: 9, d: ymd(2) }, { t: '逾期五天 發票', u: 7, d: ymd(-5) },
  ].map((x, i) => ({
    id: crypto.randomUUID(), user_id: userId, workspace_id: ws.id, category_id: cat.id,
    title: `${PREFIX} ${x.t}`, urgency: x.u, due_date: x.d, task_type: 'one_time', calendar_color: '#c9847a', sort_order: 900 + i,
  }))
  const r = await rest('tasks', { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'return=minimal' } })
  if (!r.ok) throw new Error('seed failed ' + (await r.text()))
  writeFileSync(SEED_FILE, JSON.stringify(rows.map((x) => x.id)))
  return rows.length
}
async function cleanup() {
  await sbLogin()
  const ids = existsSync(SEED_FILE) ? JSON.parse(readFileSync(SEED_FILE, 'utf8')) : []
  let deleted = 0
  if (ids.length) {
    const r = await rest(`tasks?id=in.(${ids.join(',')})&user_id=eq.${userId}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
    const j = await r.json(); deleted += Array.isArray(j) ? j.length : 0
  }
  const r2 = await rest(`tasks?title=like.${encodeURIComponent(PREFIX + '*')}&user_id=eq.${userId}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
  const j2 = await r2.json(); deleted += Array.isArray(j2) ? j2.length : 0
  const left = await (await rest(`tasks?select=id&title=like.${encodeURIComponent(PREFIX + '*')}`)).json()
  return { deleted, remaining: left.length }
}

// ------------------------------------------------------------ dev server
let dev
async function up() { try { return (await fetch(BASE)).status < 500 } catch { return false } }
async function startDev() {
  if (await up()) { console.log('[verify] reusing running dev server on :3100'); return }
  dev = spawn('pnpm', ['exec', 'next', 'dev', '-p', '3100'], { detached: true, stdio: ['ignore', 'ignore', 'ignore'] })
  const t0 = Date.now()
  while (Date.now() - t0 < 120000) { if (await up()) return; await sleep(500) }
  throw new Error('dev server not ready')
}
// First hit of each route compiles it (can take a minute) — warm them so
// Playwright's own timeouts don't fire on cold compiles.
async function warm() {
  for (const p of ['/login?method=email', '/']) await fetch(BASE + p, { signal: AbortSignal.timeout(240000) }).catch(() => {})
}
function stopDev() { if (dev?.pid) { try { process.kill(-dev.pid, 'SIGTERM') } catch { try { dev.kill('SIGTERM') } catch {} } } }

// ------------------------------------------------------------ in-page measurement
const MEASURE = ({ inkSel, legacySel, strongSel }) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const rgba = (c) => { // any CSS color -> [r,g,b,a(0..1)] via canvas
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    const a = d[3] / 255
    return a === 0 ? [0, 0, 0, 0] : [d[0], d[1], d[2], a] // getImageData is non-premultiplied
  }
  const over = (top, bottom) => { // composite rgba top over opaque-or-not bottom
    const a = top[3] + bottom[3] * (1 - top[3])
    if (a === 0) return [0, 0, 0, 0]
    return [0, 1, 2].map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a)
  }
  const bgOf = (el) => { // walk up until opaque; composite downward
    const layers = []
    for (let n = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor)
      if (c[3] > 0) layers.push(c)
      if (c[3] >= 0.999) break
    }
    let acc = layers.length ? layers[layers.length - 1] : [255, 255, 255, 1]
    for (let i = layers.length - 2; i >= 0; i--) acc = over(layers[i], acc)
    return acc.slice(0, 3)
  }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const cr = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) }
  const desc = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].filter((c) => /urgency-critical/.test(c)).join('.')} "${(el.textContent || '').trim().slice(0, 24)}"`

  const ink = [...document.querySelectorAll(inkSel)].filter(vis).map((el) => {
    const col = rgba(getComputedStyle(el).color); const bg = bgOf(el)
    return { desc: desc(el), color: col.slice(0, 3), bg: bg.map(Math.round), ratio: cr(col.slice(0, 3), bg) }
  })
  const strong = [...document.querySelectorAll(strongSel)].filter(vis).map((el) => {
    const bg = bgOf(el)
    return { desc: desc(el), bg: bg.map(Math.round), ratio: cr([255, 255, 255], bg) }
  })
  return { ink, strong, legacy: [...document.querySelectorAll(legacySel)].filter(vis).map(desc), html: document.documentElement.className }
}

// ------------------------------------------------------------ flow
async function loginState(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login?method=email`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(e2e.E2E_EMAIL)
  await page.locator('#password').fill(e2e.E2E_PASSWORD)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE}/`, { timeout: 120000, waitUntil: 'commit' })
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 120000 })
  const s = await ctx.storageState(); await ctx.close(); return s
}

async function openScreen(page, vp) {
  if (vp === 'desktop') {
    await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 120000 })
    await page.getByRole('button', { name: '展開任務面板' }).first().click()
    await page.getByText(TITLE).first().waitFor({ state: 'visible', timeout: 30000 })
  } else {
    const tab = page.locator('button', { hasText: /^任務$/ }).last()
    await tab.waitFor({ state: 'visible', timeout: 120000 }); await tab.click()
    await page.getByText(TITLE).first().waitFor({ state: 'visible', timeout: 30000 })
    await page.getByText(TITLE).first().click()
    await page.getByText('急迫度').first().waitFor({ state: 'visible', timeout: 15000 })
  }
  await page.mouse.wheel(0, 400).catch(() => {}); await page.waitForTimeout(400)
  await page.mouse.wheel(0, -400).catch(() => {}); await page.waitForTimeout(700)
}

async function verify(browser, state, theme, vp) {
  const v = VIEWPORTS[vp]
  const ctx = await browser.newContext({
    storageState: state, locale: 'zh-TW', viewport: v, deviceScaleFactor: vp === 'mobile' ? 2 : 1,
    isMobile: vp === 'mobile', hasTouch: vp === 'mobile',
  })
  await ctx.addInitScript((th) => { try { localStorage.setItem('theme', th) } catch {} }, theme)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openScreen(page, vp)
  const m = await page.evaluate(MEASURE, { inkSel: '.text-urgency-critical-ink', legacySel: '.text-urgency-critical', strongSel: '.bg-urgency-critical-strong' })
  await page.screenshot({ path: path.join(AFTER, `${theme}-${vp}.png`) })
  await ctx.close()

  const tag = `[${theme}-${vp}]`
  check(m.html.split(/\s+/).includes(theme === 'dark' ? 'dark' : 'light'), `${tag} theme really applied (html class="${m.html}")`)
  check(m.ink.length >= 1, `${tag} visible .text-urgency-critical-ink = ${m.ink.length} (>=1)`)
  check(m.legacy.length === 0, `${tag} visible legacy .text-urgency-critical = ${m.legacy.length} (must be 0)${m.legacy.length ? ' ' + JSON.stringify(m.legacy) : ''}`)
  let min = Infinity
  for (const el of m.ink) {
    min = Math.min(min, el.ratio)
    if (el.ratio < 4.5) check(false, `${tag} contrast ${el.ratio.toFixed(2)} < 4.5 for ${el.desc} color=rgb(${el.color}) bg=rgb(${el.bg})`)
  }
  if (m.ink.length) check(min >= 4.5, `${tag} min ink contrast over ${m.ink.length} elements = ${min.toFixed(2)} (>=4.5)`)
  const exp = EXPECTED_INK[theme]
  const bad = m.ink.filter((el) => el.color.some((c, i) => Math.abs(c - exp[i]) > 3))
  check(m.ink.length > 0 && bad.length === 0, `${tag} ink computed color ~ rgb(${exp}) +-3${bad.length ? ' — off: ' + bad.map((b) => `${b.desc} rgb(${b.color})`).join('; ') : ` (sample rgb(${m.ink[0]?.color}))`}`)
  if (m.strong.length) {
    const sMin = Math.min(...m.strong.map((s) => s.ratio))
    check(sMin >= 4.5, `${tag} white text on ${m.strong.length} .bg-urgency-critical-strong, min contrast = ${sMin.toFixed(2)} (>=4.5) bg=rgb(${m.strong[0].bg})`)
    for (const s of m.strong.filter((s) => s.ratio < 4.5)) check(false, `${tag} strong ${s.desc} ratio ${s.ratio.toFixed(2)}`)
  } else skip(`${tag} no visible .bg-urgency-critical-strong`)
  console.log(`INFO — ${tag} min ink contrast = ${min === Infinity ? 'n/a' : min.toFixed(2)}; screenshot after/${theme}-${vp}.png`)
}

async function main() {
  if (process.argv.includes('--cleanup-only')) { console.log('cleanup:', await cleanup()); return }
  await startDev()
  await warm()
  await sbLogin()
  const pre = await cleanup()
  await sbLogin()
  console.log(`seeded ${await seed()} tasks (stale pre-clean deleted ${pre.deleted})`)
  const browser = await chromium.launch()
  try {
    const state = await loginState(browser)
    for (const theme of THEMES) for (const vp of Object.keys(VIEWPORTS)) await verify(browser, state, theme, vp)
  } finally {
    await browser.close().catch(() => {})
    const c = await cleanup()
    console.log(`cleanup: deleted=${c.deleted} remaining_with_prefix=${c.remaining}`)
    if (c.remaining !== 0) failed++
  }
  console.log(failed === 0 ? `ALL PASSED (${passed} checks)` : `${failed} FAILED (${passed} passed)`)
}

main().catch((e) => { console.error('FATAL', e); failed++ }).finally(() => { stopDev(); process.exit(failed ? 1 : 0) })
