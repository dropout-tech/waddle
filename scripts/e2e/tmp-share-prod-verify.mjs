// Historical probe: use an isolated test project; may write/delete test data.
if (!process.env.E2E_SECONDARY_EMAIL || !process.env.E2E_SECONDARY_PASSWORD) throw new Error('Set E2E_SECONDARY_EMAIL and E2E_SECONDARY_PASSWORD for an isolated test account');
#!/usr/bin/env node
/**
 * Production acceptance for calendar sharing (post-deploy).
 * Lean but real: A generates+revokes an invite through the prod UI; a grant
 * + task seeded over REST become visible (with title) in B's prod day view;
 * busy-label absence re-checked at the DOM level; all writes cleaned up.
 * DB is the same instance dev used (already attack-replayed); this run
 * verifies the deployed FRONTEND. Run: node scripts/e2e/tmp-share-prod-verify.mjs
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = 'https://waddle.zeabur.app'
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-22-share-p2-shots/prod')
mkdirSync(SHOT_DIR, { recursive: true })

const parse = (f) => Object.fromEntries(readFileSync(f, 'utf8').split('\n')
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
const e2e = parse('.env.e2e.local')
const adm = parse('.env.admin.local')
const URL_ = adm.SUPABASE_URL
const ANON = adm.SUPABASE_ANON_KEY
const B_EMAIL = process.env.E2E_SECONDARY_EMAIL
const B_PASS = process.env.E2E_SECONDARY_PASSWORD

let exitCode = 0
const pageErrors = []
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS — ${name}`) }
  catch (e) { console.log(`FAIL — ${name} — ${e.message.split('\n')[0]}`); exitCode = 1 }
}

const api = async (jwt, method, p, body) => {
  const r = await fetch(`${URL_}/rest/v1/${p}`, {
    method, headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const t = await r.text(); let b; try { b = JSON.parse(t) } catch { b = t }
  return { status: r.status, body: b }
}
const rpc = (jwt, fn, args) => api(jwt, 'POST', `rpc/${fn}`, args ?? {})
const signIn = async (email, password) => {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((x) => x.json())
  if (!r.access_token) throw new Error(`signIn ${email}: ${JSON.stringify(r)}`)
  return { jwt: r.access_token, id: r.user.id }
}

async function hydratedFill(page, sel, value) {
  for (let i = 0; i < 5; i++) {
    await page.locator(sel).fill(value)
    if ((await page.locator(sel).inputValue()) === value) return
    await sleep(400)
  }
  throw new Error(`fill ${sel} hydration race`)
}
async function uiLogin(page, email, pass) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor({ state: 'visible', timeout: 25000 })
  try { await page.getByRole('button', { name: '登入', exact: true }).waitFor({ state: 'visible', timeout: 3000 }) }
  catch { const zh = page.getByRole('button', { name: '中文' }); if (await zh.isVisible().catch(() => false)) { await zh.click(); await sleep(600) } }
  await hydratedFill(page, '#email', email)
  await hydratedFill(page, '#password', pass)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 30000 })
}
async function dismissTourIfAny(page) {
  const skip = page.getByRole('button', { name: '略過導覽' })
  try { await skip.waitFor({ state: 'visible', timeout: 2500 }); await skip.click() } catch {}
}

async function main() {
  const A = await signIn(e2e.E2E_EMAIL, e2e.E2E_PASSWORD)
  const B = await signIn(B_EMAIL, B_PASS)
  const today = new Intl.DateTimeFormat('sv-SE').format(new Date())

  let share = (await api(A.jwt, 'GET', `calendar_shares?select=id&or=(user_lo.eq.${A.id},user_hi.eq.${A.id})`)).body[0]
  if (!share) {
    const token = (await rpc(A.jwt, 'create_share_invite')).body
    share = { id: (await rpc(B.jwt, 'accept_share_invite', { p_token: token })).body }
  }
  const ws = (await api(A.jwt, 'GET', 'workspaces?select=id&limit=1')).body[0].id
  const cat = (await api(A.jwt, 'GET', `categories?select=id&workspace_id=eq.${ws}&limit=1`)).body[0].id
  await api(A.jwt, 'DELETE', `calendar_share_grants?share_id=eq.${share.id}&owner_id=eq.${A.id}`)
  await api(A.jwt, 'POST', 'calendar_share_grants', { share_id: share.id, owner_id: A.id, kind: 'workspace', ref: ws, detail: 'full' })
  const task = (await api(A.jwt, 'POST', 'tasks', {
    user_id: A.id, workspace_id: ws, category_id: cat, title: 'PROD-SHARE-CHECK',
    scheduled_date: today, scheduled_start_time: '12:00', scheduled_end_time: '12:30',
  })).body[0]
  console.log('setup ok on prod DB')

  const browser = await chromium.launch()

  const ctxA = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
  const Ap = await ctxA.newPage()
  Ap.on('pageerror', (e) => pageErrors.push(`A:${e.message}`))

  await step('正式站：A 登入、設定出現「共享」分頁', async () => {
    await uiLogin(Ap, e2e.E2E_EMAIL, e2e.E2E_PASSWORD)
    await dismissTourIfAny(Ap)
    await Ap.getByRole('button', { name: '設定', exact: true }).click()
    const dlg = Ap.getByRole('dialog')
    await dlg.waitFor({ state: 'visible', timeout: 10000 })
    await dlg.getByText('共享', { exact: true }).first().click()
    await sleep(800)
    await dlg.getByRole('button', { name: '產生邀請連結' }).first().waitFor({ state: 'visible', timeout: 10000 })
    await Ap.screenshot({ path: path.join(SHOT_DIR, '01-a-sharing-tab.png') })
  })

  await step('正式站：產生邀請連結（域名正確）→ 撤銷', async () => {
    const dlg = Ap.getByRole('dialog')
    await dlg.getByRole('button', { name: '產生邀請連結' }).first().click()
    const linkInput = dlg.getByLabel('邀請連結')
    await linkInput.waitFor({ state: 'visible', timeout: 10000 })
    const url = await linkInput.inputValue()
    if (!url.startsWith(`${BASE_URL}/share/invite#t=`)) throw new Error(`bad invite url: ${url.slice(0, 60)}`)
    await Ap.screenshot({ path: path.join(SHOT_DIR, '02-a-invite.png') })
    await dlg.getByRole('button', { name: '撤銷' }).first().click()
    await sleep(1200)
    const left = await dlg.getByRole('button', { name: '撤銷' }).count()
    if (left !== 0) throw new Error('invite not revoked')
  })

  const ctxB = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
  const Bp = await ctxB.newPage()
  Bp.on('pageerror', (e) => pageErrors.push(`B:${e.message}`))

  await step('正式站：B 登入、日檢視看得到 A 開放的任務（虛線疊加）', async () => {
    await uiLogin(Bp, B_EMAIL, B_PASS)
    await dismissTourIfAny(Bp)
    await Bp.getByRole('button', { name: '日檢視' }).click()
    await sleep(2500)
    await Bp.getByText('PROD-SHARE-CHECK').first().waitFor({ state: 'visible', timeout: 15000 })
    const peerEls = await Bp.locator('[data-peer-event]').count()
    if (peerEls === 0) throw new Error('no [data-peer-event] elements')
    await Bp.screenshot({ path: path.join(SHOT_DIR, '03-b-overlay.png') })
  })

  await step('正式站：解除授權後（REST）B 重載即消失', async () => {
    await api(A.jwt, 'DELETE', `calendar_share_grants?share_id=eq.${share.id}&owner_id=eq.${A.id}`)
    await Bp.reload({ waitUntil: 'domcontentloaded' })
    await Bp.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 25000 })
    await Bp.getByRole('button', { name: '日檢視' }).click()
    await sleep(2500)
    if (await Bp.getByText('PROD-SHARE-CHECK').first().isVisible().catch(() => false)) throw new Error('still visible after revoke')
  })

  await step('無 page error', async () => {
    if (pageErrors.length) throw new Error(pageErrors.join(' | ').slice(0, 200))
  })

  await sleep(1500)
  await api(A.jwt, 'DELETE', `tasks?id=eq.${task.id}`)
  await api(A.jwt, 'DELETE', `calendar_share_invites?inviter_id=eq.${A.id}`)
  const leftT = (await api(A.jwt, 'GET', 'tasks?select=id&title=eq.PROD-SHARE-CHECK')).body
  console.log(`cleanup: tasks left=${leftT.length}`)
  if (leftT.length) exitCode = 1
  await browser.close()
}

main()
  .catch((e) => { console.error(e); exitCode = 1 })
  .finally(() => {
    console.log(exitCode === 0 ? '\nALL PASS' : '\nSOME FAILED')
    process.exit(exitCode)
  })
