#!/usr/bin/env node
/**
 * /org "已移出的成員" panel (owner/admin view, member view, unblock flow,
 * English). Mocked org RPCs, ONE login. Every non-GET REST call other than
 * the mocked RPCs is swallowed and recorded (PATHNAME predicates — a glob with
 * `?*` misses query-less INSERTs), so nothing can be written to the real DB.
 *
 *   BASE_URL=http://localhost:3100 SHOT_DIR=... node scripts/e2e/org-unblock-verify.mjs
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const loadEnv = (f) => !existsSync(f) ? {} : Object.fromEntries(readFileSync(f, 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const env = { ...loadEnv('.env.e2e.local'), ...process.env }
const BASE = env.BASE_URL || 'http://localhost:3100'
const SHOT = env.SHOT_DIR || path.join(process.cwd(), 'tmp-org-unblock')
mkdirSync(SHOT, { recursive: true })
let failures = 0
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`); if (!c) failures++ }

const ORG = '33333333-3333-4333-8333-333333333333'
const KICKED = '22222222-2222-4222-8222-222222222222'
const state = { role: 'owner', blocks: true, calls: [], swallowed: [] }
const blocks = () => state.blocks ? [{ user_id: KICKED, display_name: '阿哲', avatar_url: null, blocked_at: '2026-09-27T08:30:00Z' }] : []

async function routes(ctx) {
  await ctx.route((u) => u.pathname.includes('/rest/v1/') && !u.pathname.includes('/rest/v1/rpc/'), async (route) => {
    const req = route.request()
    if (req.method() === 'GET' || req.method() === 'HEAD') return route.continue()
    state.swallowed.push(`${req.method()} ${new URL(req.url()).pathname}`)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await ctx.route((u) => u.pathname.includes('/rest/v1/rpc/'), async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const json = (v) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    state.calls.push({ name, body: route.request().postData() || '' })
    if (name === 'get_my_organizations') return json({ can_create: true, orgs: [{ id: ORG, name: 'Huddle 團隊', role: state.role, member_count: 2, created_at: '2026-09-27T00:00:00Z' }] })
    if (name === 'get_org_members') return json([
      { user_id: '00000000-0000-4000-8000-00000000000a', display_name: '我', avatar_url: null, role: state.role, joined_at: '2026-09-27T00:00:00Z' },
      { user_id: '11111111-1111-4111-8111-111111111111', display_name: '小安', avatar_url: null, role: state.role === 'owner' ? 'member' : 'owner', joined_at: '2026-09-27T00:00:00Z' },
    ])
    if (name === 'get_org_board') return json([])
    if (name === 'get_org_blocks') return state.role === 'member' ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'FORBIDDEN' }) }) : json(blocks())
    if (name === 'unblock_org_member') { state.blocks = false; return route.fulfill({ status: 204, body: '' }) }
    if (['create_org_invite', 'remove_org_member', 'set_org_member_role', 'leave_org', 'delete_organization', 'create_organization'].includes(name)) return route.fulfill({ status: 204, body: '' })
    state.calls.pop()
    return route.continue()
  })
}
const shot = (page, n) => page.screenshot({ path: path.join(SHOT, n), fullPage: true })
const cjk = (s) => /[一-鿿]/.test(s.replace(/阿哲|小安|Huddle 團隊|我|阿/g, '') /* names + avatar initial are user data */)

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW' })
  await ctx.addInitScript(() => {
    const s = document.createElement('style'); s.textContent = 'nextjs-portal,[data-pet-adopt]{display:none!important}'
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s))
  })
  await routes(ctx)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(env.E2E_EMAIL)
  await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE}/`, { timeout: 30000 })

  // ── Owner view ──
  await page.goto(`${BASE}/org`, { waitUntil: 'domcontentloaded' })
  const sec = page.getByTestId('org-blocks')
  await sec.waitFor({ timeout: 15000 })
  const txt = await sec.textContent()
  ok(txt.includes('已移出的成員') && txt.includes('阿哲') && /移出於 2026\/9\/27/.test(txt), `owner sees removed member with removal date (${txt.replace(/\s+/g, ' ').slice(0, 60)})`)
  await shot(page, 'owner-1280.png')
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400)
  const bb = await sec.getByRole('button', { name: '解除封鎖' }).boundingBox()
  ok(!!bb && bb.height >= 44, `390 unblock button hit area ≥44 (${bb?.height})`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(overflow <= 1, `390 no horizontal overflow (${overflow})`)
  await shot(page, 'owner-390.png')

  // ── Unblock flow ──
  await sec.getByRole('button', { name: '解除封鎖' }).click()
  await page.getByTestId('org-unblock-hint').waitFor({ timeout: 5000 })
  const call = state.calls.find((c) => c.name === 'unblock_org_member')
  ok(!!call && JSON.parse(call.body).p_user === KICKED && JSON.parse(call.body).p_org === ORG, 'unblock calls unblock_org_member(org, user)')
  ok((await page.getByTestId('org-unblock-hint').textContent()).includes('對方可以用邀請連結重新加入'), 'one-line hint: they can rejoin with an invite link')
  ok(!(await sec.textContent()).includes('移出於'), 'row removed from the list; nobody re-added')
  ok(!state.calls.some((c) => c.name === 'accept_org_invite'), 'no automatic re-join')
  await shot(page, 'unblocked-390.png')
  await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(300)
  await shot(page, 'unblocked-1280.png')

  // ── Member view ──
  state.role = 'member'; state.blocks = true
  const before = state.calls.length
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('org-members').waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)
  ok(await page.getByTestId('org-blocks').count() === 0, 'plain member does not see the removed-members section')
  ok(!state.calls.slice(before).some((c) => c.name === 'get_org_blocks'), 'member view does not even request get_org_blocks')
  await shot(page, 'member-1280.png')
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300)
  await shot(page, 'member-390.png')
  await page.setViewportSize({ width: 1280, height: 900 })

  // ── Owner with nobody removed: section hidden ──
  state.role = 'owner'; state.blocks = false
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('org-members').waitFor({ timeout: 15000 }); await page.waitForTimeout(800)
  ok(await page.getByTestId('org-blocks').count() === 0, 'owner with no removed members: section hidden')

  // ── English ──
  state.blocks = true
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('org-blocks').waitFor({ timeout: 15000 })
  const en = await page.getByTestId('org-blocks').textContent()
  ok(en.includes('Removed members') && en.includes('Unblock') && en.includes('Removed 9/27/2026') && !cjk(en), `English section fully translated (${en.replace(/\s+/g, ' ').slice(0, 70)})`)
  await page.getByTestId('org-blocks').getByRole('button', { name: 'Unblock' }).click()
  await page.getByTestId('org-unblock-hint').waitFor({ timeout: 5000 })
  const hint = await page.getByTestId('org-unblock-hint').textContent()
  ok(hint.includes('can rejoin with an invite link') && !cjk(hint), `English hint (${hint})`)
  await shot(page, 'en-1280.png')
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))

  console.log(`INFO: non-RPC writes intercepted (never sent): ${state.swallowed.join(', ') || 'none'}`)
  ok(errors.length === 0, `no page errors${errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''}`)
  await browser.close()
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
  process.exit(failures ? 1 : 0)
}
main().catch((e) => { console.error('ERROR', e); process.exit(1) })
