#!/usr/bin/env node
/**
 * Sentry wiring verification. Assertions live in code; stdout is the evidence.
 * Nothing is ever sent to a real Sentry: every request to the ingest host is
 * intercepted by Playwright and answered locally.
 *
 * Two modes, chosen by NEXT_PUBLIC_SENTRY_DSN in THIS process's environment
 * (it must be the same value `pnpm build` ran with — NEXT_PUBLIC_ vars are
 * inlined at build time):
 *
 *   ENABLED  (DSN set, e.g. a fake https://abc123@o0.ingest.us.sentry.io/0)
 *     NEXT_PUBLIC_SENTRY_DSN=https://abc123@o0.ingest.us.sentry.io/0 pnpm build
 *     NEXT_PUBLIC_SENTRY_DSN=https://abc123@o0.ingest.us.sentry.io/0 node scripts/e2e/sentry-verify.mjs
 *   DISABLED (DSN unset)
 *     pnpm build && node scripts/e2e/sentry-verify.mjs
 *
 * Needs a production build in .next/ (CSP headers only exist in the server
 * build). Spawns `next start` on PORT 3101 and tears it down.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 3101
const BASE_URL = `http://localhost:${PORT}`
const DSN = (process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim()
const ENABLED = DSN.length > 0
const INGEST_ORIGIN = ENABLED ? new URL(DSN).origin : ''

let failures = 0
function assert(cond, label, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

if (!existsSync('.next/BUILD_ID')) {
  console.error('[sentry-verify] no production build in .next/ — run `pnpm build` first (same env as this run).')
  process.exit(2)
}
console.log(`[sentry-verify] mode=${ENABLED ? 'ENABLED' : 'DISABLED'} ingest=${INGEST_ORIGIN || '(none)'}`)

// ── 1. CSP as built (routes-manifest) ─────────────────────────────────────
const manifest = JSON.parse(readFileSync('.next/routes-manifest.json', 'utf8'))
const cspHeader = manifest.headers
  .flatMap((h) => h.headers)
  .find((h) => h.key === 'Content-Security-Policy')
const connectSrc = (cspHeader?.value.split(';').map((s) => s.trim()).find((d) => d.startsWith('connect-src')) || '').split(/\s+/)
console.log(`[csp] ${connectSrc.join(' ')}`)
if (ENABLED) {
  assert(connectSrc.includes(INGEST_ORIGIN), 'CSP connect-src contains the Sentry ingest origin', INGEST_ORIGIN)
} else {
  assert(
    connectSrc.length === 4 && connectSrc[1] === "'self'" && connectSrc[3].startsWith('wss://'),
    "CSP connect-src is exactly 'self' + supabase https + supabase wss (no Sentry origin)",
  )
}

// ── 2. Run the app and throw errors ───────────────────────────────────────
const server = spawn('pnpm', ['exec', 'next', 'start', '-p', String(PORT)], {
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env },
})
server.stdout.on('data', () => {})
server.stderr.on('data', () => {})
const stop = () => {
  try { process.kill(-server.pid, 'SIGTERM') } catch { try { server.kill('SIGTERM') } catch {} }
}
process.on('exit', stop)

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE_URL)).status < 500) return } catch {}
    await sleep(500)
  }
  throw new Error('next start did not become ready')
}

const SECRETS = {
  query: 'SECRETQUERY123',
  hash: 'SECRETHASH456',
  body: 'SECRETBODY789',
  fetchQuery: 'SECRETFETCHQ',
  email: 'private.person@example.com',
  cjk: '我的機密任務標題',
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop',
  code: 'SECRETCODE123', // OAuth-style ?code= on the page URL (leaks via stack-frame file names when there is no stack)
  uuid: '123e4567-e89b-12d3-a456-426614174000', // e.g. a user id in a storage path
  unclosedCjk: '今天要跟客戶', // truncated ProseMirror-style message: quote never closed
  quotedAscii: 'Buy milk tomorrow', // quoted ASCII prose
}

try {
  await waitReady()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW' })

  const sentryRequests = [] // requests whose host looks like Sentry
  const envelopes = [] // parsed ingest payloads
  const cspViolations = []
  const consoleCsp = []

  page.on('console', (m) => {
    if (/content security policy/i.test(m.text())) consoleCsp.push(m.text())
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(window.__cspViolations ||= []).push(`${e.violatedDirective} ${e.blockedURI}`)
    })
  })

  // Answer ingest locally (never touches the network). In DISABLED mode any
  // request to a *sentry* host is recorded and aborted.
  await page.route(/sentry/i, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.hostname === 'localhost') return route.continue() // chunk names may contain "sentry"
    sentryRequests.push(req.url())
    if (ENABLED && url.origin === INGEST_ORIGIN) {
      const buf = req.postDataBuffer()
      envelopes.push({ url: req.url(), body: buf ? buf.toString('utf8') : '' })
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' })
    }
    return route.abort()
  })

  await page.goto(`${BASE_URL}/login?method=email&q=${SECRETS.query}&code=${SECRETS.code}#${SECRETS.hash}`, { waitUntil: 'load' })
  await sleep(2500) // let the lazy Sentry chunk init

  // A fetch breadcrumb with a secret query + secret body, then three errors.
  await page.evaluate(async (s) => {
    await fetch(`/robots.txt?token=${s.fetchQuery}`, { method: 'POST', body: s.body }).catch(() => {})
    console.log('console breadcrumb text', s.cjk)
    setTimeout(() => { throw new Error(`Cannot find task "${s.cjk}" for ${s.email} using ${s.jwt} ${'lorem ipsum '.repeat(60)}`) }, 0)
    setTimeout(() => { Promise.reject(new TypeError(`unhandled rejection for ${s.email}`)) }, 50)
    setTimeout(() => { throw new RangeError('plain range error') }, 100)

    // Privacy regressions: data: URL payload, UUID in a path, unclosed / ASCII quoted
    // prose, and a string throw (no stack -> SDK uses location.href as the frame file).
    await fetch('data:image/png;base64,' + 'A'.repeat(5000)).catch(() => {}) // CSP blocks it; the breadcrumb is still recorded
    await fetch(`/storage/v1/object/x/${s.uuid}/abc.png`).catch(() => {}) // 404 is fine
    setTimeout(() => { throw new Error('data and uuid fetched') }, 150)
    setTimeout(() => { throw new Error(`Cannot find "${s.unclosedCjk}`) }, 200)
    setTimeout(() => { throw new Error(`Not found: "${s.quotedAscii}"`) }, 250)
    setTimeout(() => { throw 'string error' }, 300)
  }, SECRETS)
  await sleep(ENABLED ? 4000 : 3000)

  const viol = await page.evaluate(() => window.__cspViolations || [])
  // The deliberate fetch('data:...') above is expected to be blocked by connect-src.
  cspViolations.push(...viol.filter((v) => !/\bdata\b/.test(v)))
  const expectedDataBlocks = viol.length - cspViolations.length
  for (let i = consoleCsp.length - 1; i >= 0; i--) if (/data:/.test(consoleCsp[i])) consoleCsp.splice(i, 1)

  if (!ENABLED) {
    assert(sentryRequests.length === 0, 'DSN unset: zero requests to any *sentry* host after 3 thrown errors', `count=${sentryRequests.length}`)
    assert(consoleCsp.length === 0 && cspViolations.length === 0, 'DSN unset: no CSP violations')
  } else {
    assert(sentryRequests.length > 0, 'ingest request attempted (reached the interceptor, so CSP did not block it)', `requests=${sentryRequests.length}`)
    assert(consoleCsp.length === 0 && cspViolations.length === 0, `no CSP violations / console CSP errors (excluding ${expectedDataBlocks} deliberate data: fetch block)`, JSON.stringify([...consoleCsp, ...cspViolations].slice(0, 3)))

    // Parse envelopes: each is newline-delimited JSON (header, item header, item payload, ...).
    const items = []
    for (const e of envelopes) {
      const lines = e.body.split('\n').filter(Boolean)
      for (let i = 1; i + 1 < lines.length; i += 2) {
        try { items.push({ header: JSON.parse(lines[i]), payload: JSON.parse(lines[i + 1]) }) } catch {}
      }
      assert(/\/api\/0\/envelope\/\?.*sentry_key=abc123/.test(e.url) || !/abc123/.test(DSN), 'ingest URL shape', e.url)
    }
    const types = [...new Set(items.map((i) => i.header.type))]
    console.log(`[payload] envelope item types: ${types.join(',')} (events=${items.filter((i) => i.header.type === 'event').length})`)
    assert(types.every((t) => t === 'event' || t === 'client_report'), 'only error events sent (no session/transaction/replay/span/log items)', types.join(','))
    const events = items.filter((i) => i.header.type === 'event').map((i) => i.payload)
    for (const ev of events) console.log(`[payload] event: ${ev.exception?.values?.[0]?.type}: ${(ev.exception?.values?.[0]?.value || '').slice(0, 70)}`)
    assert(events.length >= 7, 'all 7 thrown errors captured', `events=${events.length}`)

    const all = envelopes.map((e) => e.body).join('\n')
    for (const [name, value] of Object.entries(SECRETS)) {
      assert(!all.includes(value), `payload does not contain secret: ${name}`)
    }
    assert(!all.includes('AAAA') && !all.includes('base64,'), 'data: URL payload (AAAA…/base64,) absent from every payload')
    assert(!all.includes('Buy milk'), 'quoted ASCII prose ("Buy milk tomorrow") absent')
    const dataCrumb = events.flatMap((e) => e.breadcrumbs || []).find((b) => /^data:/.test(b.data?.url || ''))
    console.log(`[payload] data: fetch breadcrumb: ${JSON.stringify(dataCrumb?.data)}`)
    assert(dataCrumb?.data?.url === 'data:[redacted]', 'data: fetch breadcrumb url is exactly data:[redacted]')
    const uuidCrumb = events.flatMap((e) => e.breadcrumbs || []).find((b) => /storage\/v1\/object/.test(b.data?.url || ''))
    console.log(`[payload] uuid-path fetch breadcrumb: ${JSON.stringify(uuidCrumb?.data)}`)
    assert(!!uuidCrumb && /\/:id\/abc\.png$/.test(uuidCrumb.data.url), 'UUID path segment replaced by :id in the fetch breadcrumb url')
    const unclosed = events.find((e) => /Cannot find/.test(e.exception?.values?.[0]?.value || '') && !/task/.test(e.exception.values[0].value))
    console.log(`[payload] unclosed-quote message: ${unclosed?.exception?.values?.[0]?.value}`)
    assert(!!unclosed && !/[^\x00-\x7F]/.test(unclosed.exception.values[0].value), 'unclosed-quote message has no non-ASCII text left')
    const quoted = events.find((e) => /Not found/.test(e.exception?.values?.[0]?.value || ''))
    console.log(`[payload] ascii-quoted message: ${quoted?.exception?.values?.[0]?.value}`)
    assert(!!quoted && quoted.exception.values[0].value === 'Not found: "[text]"', 'quoted ASCII prose replaced by [text]')
    const strErr = events.find((e) => e.exception?.values?.some((v) => /string error/.test(v.value || '')))
    assert(!!strErr, 'string throw captured (stack-less error)')
    const frameFiles = events.flatMap((e) => (e.exception?.values || []).flatMap((v) => (v.stacktrace?.frames || []).flatMap((f) => [f.filename, f.abs_path]))).filter(Boolean)
    console.log(`[payload] frame files sampled: ${frameFiles.length}; with '?': ${frameFiles.filter((f) => /[?#]/.test(f)).length}`)
    assert(frameFiles.length > 0 && frameFiles.every((f) => !/[?#]/.test(f)), 'no stack-frame filename / abs_path carries a query or hash')
    assert(!/ip_address/.test(all), 'payload has no ip_address field')
    assert(!/"cookies?"/i.test(all) && !/"query_string"/.test(all), 'payload has no cookies / query_string')

    for (const ev of events) {
      const ex = ev.exception?.values?.[0]
      const tag = `${ex?.type}`
      assert(ev.user === undefined, `[${tag}] no user object`)
      if (ev.request) {
        assert(!/[?#]/.test(ev.request.url || ''), `[${tag}] request.url has no query/hash`, ev.request.url)
        const hk = Object.keys(ev.request.headers || {}).map((k) => k.toLowerCase())
        assert(hk.every((k) => k === 'user-agent'), `[${tag}] request headers limited to User-Agent`, hk.join(','))
        assert(ev.request.data === undefined, `[${tag}] no request body`)
      }
      assert(ex && (ex.value || '').length <= 220, `[${tag}] message truncated (<=200 + marker)`, `len=${(ex?.value || '').length}`)
      assert(ev.tags?.app_platform === 'web', `[${tag}] tag app_platform=web`, JSON.stringify(ev.tags))
      assert(/^huddle@\d+\.\d+\.\d+/.test(ev.release || ''), `[${tag}] release set`, ev.release)
      assert(ev.environment === 'production', `[${tag}] environment=production`, ev.environment)
      const bc = ev.breadcrumbs || []
      assert(bc.every((b) => b.category !== 'console' && !String(b.category).startsWith('ui.')), `[${tag}] no console/ui breadcrumbs`, bc.map((b) => b.category).join(','))
      assert(bc.every((b) => !b.data?.url || !/[?#]/.test(b.data.url)), `[${tag}] breadcrumb urls have no query/hash`)
    }
    const sample = events.find((e) => e.exception?.values?.[0]?.type === 'Error')
    if (sample) console.log(`[payload] sample message: ${sample.exception.values[0].value.slice(0, 160)}`)
    const fetchCrumb = events.flatMap((e) => e.breadcrumbs || []).find((b) => b.category === 'fetch')
    console.log(`[payload] sample fetch breadcrumb: ${JSON.stringify(fetchCrumb)}`)
    assert(!!fetchCrumb, 'a fetch breadcrumb exists (so the URL-scrub assertion above was meaningful)')
    const robots = events.flatMap((e) => e.breadcrumbs || []).find((b) => /robots\.txt/.test(b.data?.url || ''))
    assert(!!robots && [`${BASE_URL}/robots.txt`, '/robots.txt'].includes(robots.data.url), 'the POST /robots.txt?token=... breadcrumb is present with the query stripped', JSON.stringify(robots?.data))
  }

  await browser.close()
} catch (e) {
  console.log(`FAIL — exception: ${e.stack || e.message}`)
  failures++
} finally {
  stop()
}

console.log(failures === 0 ? 'RESULT: ALL ASSERTIONS PASSED' : `RESULT: ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
