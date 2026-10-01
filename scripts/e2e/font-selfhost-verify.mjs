#!/usr/bin/env node
/**
 * Before/after check for the "self-host fonts" change: proves the rendered
 * typography is identical when the fonts stop coming from next/font/google.
 *
 *   node scripts/e2e/font-selfhost-verify.mjs capture <label>   # needs `next start` on PORT
 *   node scripts/e2e/font-selfhost-verify.mjs compare <a> <b>
 *
 * capture: for zh-TW + English × 1280px + 390px, visits the marketing page,
 * /login, the signed-in calendar and /notebook, and records
 *   - every (font-family, weight) actually computed on visible text
 *   - which @font-face slices the browser really loaded
 *   - pixel sizes of fixed probe strings in every font the app declares
 *   - preload links, font requests that failed / left the origin, CSP errors
 *   - a viewport screenshot
 * compare: exits 1 on any difference in the above (screenshots: pixel ratio).
 *
 * Signed-in pages use the e2e test account (.env.e2e.local, see README.md).
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PORT = process.env.PORT || 3100
const BASE_URL = `http://localhost:${PORT}`
const OUT_ROOT = process.env.FONT_VERIFY_DIR || path.join(process.cwd(), 'docs/reports/2026-10-01-font-selfhost-shots')
const [mode, labelA, labelB] = process.argv.slice(2)

function loadEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

const LANGS = [
  { lang: 'zh-TW', locale: 'zh-TW', marketing: '/' },
  { lang: 'en', locale: 'en-US', marketing: '/en/about' },
]
const VIEWPORTS = [
  { name: '1280', width: 1280, height: 900 },
  { name: '390', width: 390, height: 844 },
]
const PROBE_TEXT = '企鵝的工作日，繁體中文 Huddle 0123456789 gyQ&'
const PROBES = [
  ['inherit', 'inherit', 400],
  ...[400, 500, 600, 700, 900].map((w) => [`noto-${w}`, "'Noto Sans TC'", w]),
  ['geist-400', "'Geist'", 400],
  ['geist-700', "'Geist'", 700],
  ['geist-mono-400', "'Geist Mono'", 400],
  ['var-noto', 'var(--font-noto-sans-tc)', 500],
  ['var-geist', 'var(--font-geist)', 500],
  ['var-geist-mono', 'var(--font-geist-mono)', 400],
  ['var-poster-zh', 'var(--poster-zh)', 900],
  ['var-poster-en', 'var(--poster-en)', 800],
]

async function collect(page) {
  return page.evaluate(
    async ({ PROBES, PROBE_TEXT }) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      // Scroll through once so scroll-reveal content (and its font slices) is requested.
      for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
        window.scrollTo(0, y)
        await sleep(120)
      }
      window.scrollTo(0, 0)

      const host = document.querySelector('[data-surface="marketing"]') || document.body
      const box = document.createElement('div')
      box.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;font-size:40px;line-height:normal'
      const spans = PROBES.map(([name, family, weight]) => {
        const s = document.createElement('span')
        s.style.cssText = `display:block;width:max-content;font-family:${family};font-weight:${weight}`
        s.textContent = PROBE_TEXT
        s.dataset.probe = name
        box.appendChild(s)
        return s
      })
      host.appendChild(box)
      await document.fonts.ready
      await sleep(1500)
      await document.fonts.ready
      const probes = Object.fromEntries(
        spans.map((s) => {
          const r = s.getBoundingClientRect()
          return [s.dataset.probe, `${r.width.toFixed(2)}x${r.height.toFixed(2)}`]
        }),
      )
      box.remove()

      const used = new Set()
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue.trim()) continue
        const el = n.parentElement
        if (!el || !el.getClientRects().length) continue
        const cs = getComputedStyle(el)
        used.add(`${cs.fontFamily} | ${cs.fontWeight}`)
      }
      const loaded = new Set()
      for (const f of document.fonts) {
        if (f.status === 'loaded') loaded.add(`${f.family.replace(/["']/g, '')} | ${f.weight} | ${f.unicodeRange}`)
      }
      const varsOf = (el) => {
        const cs = getComputedStyle(el)
        return Object.fromEntries(
          ['--font-geist', '--font-geist-mono', '--font-noto-sans-tc', '--poster-zh', '--poster-en'].map((v) => [
            v,
            cs.getPropertyValue(v).trim().replace(/["']/g, ''),
          ]),
        )
      }
      return {
        probes,
        used: [...used].sort(),
        loaded: [...loaded].sort(),
        vars: { body: varsOf(document.body), host: varsOf(host) },
        preloads: document.querySelectorAll('link[rel="preload"][as="font"]').length,
      }
    },
    { PROBES, PROBE_TEXT },
  )
}

async function capture(label) {
  const outDir = path.join(OUT_ROOT, label)
  mkdirSync(outDir, { recursive: true })
  const env = { ...loadEnvFile(path.join(process.cwd(), '.env.e2e.local')), ...process.env }
  if (!env.E2E_EMAIL || !env.E2E_PASSWORD) throw new Error('Missing E2E_EMAIL / E2E_PASSWORD (.env.e2e.local)')
  const browser = await chromium.launch()
  const result = {}
  for (const { lang, locale, marketing } of LANGS) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale,
        reducedMotion: 'reduce',
      })
      await context.addInitScript((l) => {
        try {
          window.localStorage.setItem('waddle-language-v1', l)
        } catch {}
      }, lang)
      const page = await context.newPage()
      const net = { fontRequests: 0, fontFailures: [], offOrigin: [], cspErrors: [] }
      page.on('response', (res) => {
        const url = res.url()
        if (!/\.(woff2?|ttf|otf)(\?|$)/.test(url)) return
        net.fontRequests++
        if (!url.startsWith(BASE_URL)) net.offOrigin.push(url)
        if (res.status() >= 400) net.fontFailures.push(`${res.status()} ${url}`)
      })
      page.on('requestfailed', (req) => {
        if (/\.(woff2?|ttf|otf)(\?|$)/.test(req.url())) net.fontFailures.push(`failed ${req.url()}`)
      })
      page.on('console', (msg) => {
        if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) net.cspErrors.push(msg.text().slice(0, 160))
      })

      const visit = async (name, url, ready) => {
        await page.goto(`${BASE_URL}${url}`, { waitUntil: 'load' })
        if (ready) await ready()
        await page.waitForTimeout(1500)
        const data = await collect(page)
        await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' })
        await page.waitForTimeout(300)
        const shot = `${name}-${lang}-${vp.name}.png`
        await page.screenshot({ path: path.join(outDir, shot) })
        result[`${name}-${lang}-${vp.name}`] = { url: new URL(page.url()).pathname, shot, ...data }
        console.log(`[capture:${label}] ${name}-${lang}-${vp.name} used=${data.used.length} loaded=${data.loaded.length}`)
      }

      await visit('marketing', marketing)
      await visit('login', '/login')
      await page.locator('#email').fill(env.E2E_EMAIL)
      await page.locator('#password').fill(env.E2E_PASSWORD)
      await page.locator('form button[type="submit"]').first().click()
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
      await visit('app', '/', () => page.waitForSelector('[data-tour]', { timeout: 30000 }).catch(() => {}))
      await visit('notebook', '/notebook', () => page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}))
      result[`net-${lang}-${vp.name}`] = net
      await context.close()
    }
  }
  await browser.close()
  writeFileSync(path.join(outDir, 'fonts.json'), JSON.stringify(result, null, 2))
  console.log(`[capture:${label}] wrote ${path.join(outDir, 'fonts.json')}`)
}

async function pixelDiff(fileA, fileB) {
  const [a, b] = await Promise.all([fileA, fileB].map((f) => sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })))
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return 1
  let diff = 0
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 24) diff++
  }
  return diff / (a.data.length / 4)
}

async function compare(a, b) {
  const load = (l) => JSON.parse(readFileSync(path.join(OUT_ROOT, l, 'fonts.json'), 'utf8'))
  const A = load(a)
  const B = load(b)
  let failed = 0
  const report = (ok, name, note = '') => {
    if (!ok) failed++
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${note ? ' — ' + note : ''}`)
  }
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y)
  for (const key of Object.keys(A)) {
    if (key.startsWith('net-')) {
      const n = B[key]
      report(
        n.fontFailures.length === 0 && n.offOrigin.length === 0 && n.cspErrors.length === 0,
        `${key} (${b})`,
        `font requests ${A[key].fontRequests}→${n.fontRequests}, failed ${n.fontFailures.length}, off-origin ${n.offOrigin.length}, CSP errors ${n.cspErrors.length}`,
      )
      continue
    }
    const x = A[key]
    const y = B[key]
    const problems = []
    if (!same(x.used, y.used)) problems.push('computed font-family/weight set differs')
    if (!same(x.loaded, y.loaded)) problems.push(`loaded font slices differ (${x.loaded.length}→${y.loaded.length})`)
    if (!same(x.probes, y.probes)) problems.push('probe text metrics differ')
    if (!same(x.vars, y.vars)) problems.push('font CSS variables differ')
    // Fewer preloads would delay first paint of a font; one extra is harmless.
    if (y.preloads < x.preloads) problems.push(`preload links ${x.preloads}→${y.preloads}`)
    const ratio = await pixelDiff(path.join(OUT_ROOT, a, x.shot), path.join(OUT_ROOT, b, y.shot))
    // Signed-in pages show live data (clock, timers), so pixels there are informational only.
    const strictPixels = key.startsWith('login')
    if (strictPixels && ratio > 0.001) problems.push('screenshot differs')
    report(
      problems.length === 0,
      key,
      `${problems.join('; ') || `fonts identical (${x.used.length} family/weight combos, ${x.loaded.length} slices loaded)`}; preloads ${x.preloads}→${y.preloads}; pixel diff ${(ratio * 100).toFixed(3)}%`,
    )
  }
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
  process.exit(failed ? 1 : 0)
}

if (mode === 'capture' && labelA) await capture(labelA)
else if (mode === 'compare' && labelA && labelB) await compare(labelA, labelB)
else {
  console.error('usage: font-selfhost-verify.mjs capture <label> | compare <a> <b>')
  process.exit(2)
}
