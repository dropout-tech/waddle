// Historical probe: use an isolated test project; may write/delete test data.
if (!process.env.E2E_SECONDARY_EMAIL || !process.env.E2E_SECONDARY_PASSWORD) throw new Error('Set E2E_SECONDARY_EMAIL and E2E_SECONDARY_PASSWORD for an isolated test account');
// Probe: where does the pending-invite sessionStorage token go?
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 3108
const BASE = `http://localhost:${PORT}`
const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n')
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
const adm = Object.fromEntries(readFileSync('.env.admin.local', 'utf8').split('\n')
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))

const dev = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], { cwd: process.cwd(), detached: true, stdio: ['ignore', 'ignore', 'ignore'] })
for (let i = 0; i < 120; i++) { try { const r = await fetch(BASE); if (r.status < 500) break } catch {} ; await sleep(500) }

// mint invite via REST as A
const auth = await fetch(`${adm.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: adm.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD }),
}).then((r) => r.json())
const mint = await fetch(`${adm.SUPABASE_URL}/rest/v1/rpc/create_share_invite`, {
  method: 'POST', headers: { apikey: adm.SUPABASE_ANON_KEY, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' }, body: '{}',
}).then((r) => r.json())
const url = `${BASE}/share/invite#t=${mint}`
console.log('invite url ok:', /#t=./.test(url))

const browser = await chromium.launch()
const ctx = await browser.newContext({ locale: 'zh-TW' })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 150)) })
const snap = async (tag) => {
  const s = await page.evaluate(() => ({
    url: location.pathname + (location.hash ? '#…' : ''),
    ss: sessionStorage.getItem('huddle-pending-share-invite') ? 'TOKEN-PRESENT' : null,
  })).catch(() => ({ url: 'nav', ss: '?' }))
  console.log(`[${tag}] ${s.url} ss=${s.ss}`)
}
await page.goto(url, { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 8; i++) { await snap(`t+${i * 500}ms`); await sleep(500) }
console.log('BODY:', (await page.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n/g, ' | '))
console.log('HTTP status of route:', (await fetch(url.split('#')[0])).status)
process.exit(0)
// now on /login presumably; log in as B
await page.locator('#email').fill(process.env.E2E_SECONDARY_EMAIL)
await page.locator('#password').fill(process.env.E2E_SECONDARY_PASSWORD)
await snap('before-submit')
const btn = page.getByRole('button', { name: /登入|Log in/ }).first()
await btn.click()
for (let i = 0; i < 16; i++) { await snap(`post+${i * 500}ms`); await sleep(500) }
await browser.close()
try { process.kill(-dev.pid, 'SIGTERM') } catch {}
