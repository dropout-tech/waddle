#!/usr/bin/env node
// Historical probe: use an isolated test project; may write/delete test data.
if (!process.env.E2E_SECONDARY_EMAIL || !process.env.E2E_SECONDARY_PASSWORD) throw new Error('Set E2E_SECONDARY_EMAIL and E2E_SECONDARY_PASSWORD for an isolated test account');
/**
 * P2 acceptance: shared-calendar overlay + grant editor through the real UI.
 * Data seeded via REST (deterministic), then verified visually as peer B:
 * full-detail task title visible, busy block shows 「忙碌」 and NEVER leaks
 * the real label anywhere in the DOM, peer chip toggles the layer, grant
 * changes propagate, mobile agenda renders. Not committed (tmp- convention).
 * Run: node scripts/e2e/tmp-share-p2-ui-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3107
const BASE_URL = `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-22-share-p2-shots')
mkdirSync(SHOT_DIR, { recursive: true })
const P1_DIR = path.join(process.cwd(), 'docs/reports/2026-07-22-share-p1-shots')

const parse = (f) => Object.fromEntries(readFileSync(f, 'utf8').split('\n')
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
const e2e = parse('.env.e2e.local')
const adm = parse('.env.admin.local')
const URL_ = adm.SUPABASE_URL
const ANON = adm.SUPABASE_ANON_KEY
const B_EMAIL = process.env.E2E_SECONDARY_EMAIL
const B_PASS = process.env.E2E_SECONDARY_PASSWORD

let devServer, exitCode = 0
const pageErrors = []
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS — ${name}`) }
  catch (e) { console.log(`FAIL — ${name} — ${e.message.split('\n')[0]}`); exitCode = 1 }
}

// ── REST helpers ─────────────────────────────────────────────────────────────
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
async function dismissTourIfAny(page) {
  const skip = page.getByRole('button', { name: '略過導覽' })
  try { await skip.waitFor({ state: 'visible', timeout: 2500 }); await skip.click() } catch {}
}
async function contextWithSession(browser, opts, stateFile, email, pass) {
  if (existsSync(stateFile)) {
    const ctx = await browser.newContext({ locale: 'zh-TW', storageState: stateFile, ...opts })
    const pg = await ctx.newPage()
    await pg.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    try {
      await pg.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 15000 })
      return { ctx, pg }
    } catch { await ctx.close() }
  }
  const ctx = await browser.newContext({ locale: 'zh-TW', ...opts })
  const pg = await ctx.newPage()
  for (let attempt = 0; attempt < 3; attempt++) {
    await pg.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await pg.locator('#email').waitFor({ state: 'visible', timeout: 20000 })
    try { await pg.getByRole('button', { name: '登入', exact: true }).waitFor({ state: 'visible', timeout: 3000 }) }
    catch { const zh = pg.getByRole('button', { name: '中文' }); if (await zh.isVisible().catch(() => false)) { await zh.click(); await sleep(600) } }
    await hydratedFill(pg, '#email', email)
    await hydratedFill(pg, '#password', pass)
    await pg.getByRole('button', { name: '登入', exact: true }).click()
    try { await pg.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }); break }
    catch { console.log(`  [login retry ${attempt}]`); await sleep(45000) }
  }
  await pg.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 25000 })
  writeFileSync(stateFile, JSON.stringify(await ctx.storageState()))
  return { ctx, pg }
}

async function main() {
  // ── data setup over REST ───────────────────────────────────────────────────
  const A = await signIn(e2e.E2E_EMAIL, e2e.E2E_PASSWORD)
  const B = await signIn(B_EMAIL, B_PASS)
  const today = new Intl.DateTimeFormat('sv-SE').format(new Date()) // LOCAL date — the app's "today" is local, UTC slice was off by one after 16:00 UTC+8

  let share = (await api(A.jwt, 'GET', `calendar_shares?select=id&or=(user_lo.eq.${A.id},user_hi.eq.${A.id})`)).body[0]
  if (!share) {
    const token = (await rpc(A.jwt, 'create_share_invite')).body
    const sid = (await rpc(B.jwt, 'accept_share_invite', { p_token: token })).body
    share = { id: sid }
  }
  const shareId = share.id
  const ws = (await api(A.jwt, 'GET', 'workspaces?select=id&limit=1')).body[0].id
  const cat = (await api(A.jwt, 'GET', `categories?select=id&workspace_id=eq.${ws}&limit=1`)).body[0].id
  // clean previous residue, then grants: workspace FULL + custom slot BUSY
  await api(A.jwt, 'DELETE', `calendar_share_grants?share_id=eq.${shareId}&owner_id=eq.${A.id}`)
  let slot = (await api(A.jwt, 'GET', `slot_types?select=id&key=eq.p2ui-busy`)).body[0]
  if (!slot) slot = (await api(A.jwt, 'POST', 'slot_types', { user_id: A.id, key: 'p2ui-busy', label: 'P2UI', icon: 'Clock', color: '#7c5cff' })).body[0]
  await api(A.jwt, 'POST', 'calendar_share_grants', { share_id: shareId, owner_id: A.id, kind: 'workspace', ref: ws, detail: 'full' })
  await api(A.jwt, 'POST', 'calendar_share_grants', { share_id: shareId, owner_id: A.id, kind: 'slot_type', ref: 'p2ui-busy', detail: 'busy' })
  const task = (await api(A.jwt, 'POST', 'tasks', {
    user_id: A.id, workspace_id: ws, category_id: cat, title: 'P2-FULL-TITLE',
    scheduled_date: today, scheduled_start_time: '11:00', scheduled_end_time: '11:30',
  })).body[0]
  const block = (await api(A.jwt, 'POST', 'time_blocks', {
    user_id: A.id, date: today, start_time: '10:00', end_time: '10:30', type: 'p2ui-busy', label: 'P2-SECRET-LABEL', color: '#7c5cff',
  })).body[0]
  const peerOfB = (await rpc(B.jwt, 'get_share_peers')).body[0]
  console.log(`setup ok: share=${shareId} peer(A) shown to B as “${peerOfB?.display_name}”`)

  devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], { cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  for (let i = 0; i < 120; i++) { try { const r = await fetch(BASE_URL); if (r.status < 500) break } catch {} ; await sleep(500) }

  const browser = await chromium.launch()
  const stateB = path.join(P1_DIR, 'stateB.json')
  const stateA = path.join(P1_DIR, 'stateA.json')

  let Bp
  await step('B 登入（或重用 session）', async () => {
    const r = await contextWithSession(browser, { viewport: { width: 1280, height: 900 } }, stateB, B_EMAIL, B_PASS)
    Bp = r.pg
    Bp.on('pageerror', (e) => { pageErrors.push(`B:${e.message}`); console.log(`[pageerror B] ${e.message}`) })
    await dismissTourIfAny(Bp)
  })

  await step('日曆頭部出現 peer chip；開啟後日檢視看得到 full 任務標題', async () => {
    await Bp.getByRole('button', { name: '日檢視' }).click()
    await sleep(1200)
    const title = Bp.getByText('P2-FULL-TITLE', { exact: false }).first()
    if (!(await title.isVisible().catch(() => false))) {
      // layer may default off — toggle the peer chip (named after A) and retry
      const chip = Bp.getByRole('button', { name: new RegExp(peerOfB.display_name || '.') }).first()
      await chip.click()
      await sleep(1500)
    }
    await title.waitFor({ state: 'visible', timeout: 10000 })
    await Bp.screenshot({ path: path.join(SHOT_DIR, '01-b-day-full-title.png') })
  })

  await step('busy 區塊顯示「忙碌」且真實標籤不在 DOM 任何角落', async () => {
    const html = await Bp.evaluate(() => document.documentElement.outerHTML)
    if (html.includes('P2-SECRET-LABEL')) throw new Error('busy label leaked into DOM!')
    await Bp.getByText('忙碌', { exact: true }).first().waitFor({ state: 'visible', timeout: 8000 })
    await Bp.screenshot({ path: path.join(SHOT_DIR, '02-b-busy-block.png') })
  })

  await step('點 peer 事件不會打開編輯視窗（唯讀）', async () => {
    await Bp.getByText('P2-FULL-TITLE', { exact: false }).first().click({ force: true })
    await sleep(900)
    const dlgCount = await Bp.getByRole('dialog').count()
    if (dlgCount > 0) throw new Error('clicking a peer event opened a dialog')
  })

  await step('關掉 peer chip → peer 事件消失；再開 → 回來', async () => {
    const chip = Bp.getByRole('button', { name: new RegExp(peerOfB.display_name || '.') }).first()
    await chip.click(); await sleep(1000)
    if (await Bp.getByText('P2-FULL-TITLE').first().isVisible().catch(() => false)) throw new Error('still visible after toggle off')
    await chip.click(); await sleep(1500)
    await Bp.getByText('P2-FULL-TITLE').first().waitFor({ state: 'visible', timeout: 8000 })
  })

  await step('週檢視也渲染 peer 事件', async () => {
    await Bp.getByRole('button', { name: '週檢視' }).click()
    await sleep(1500)
    await Bp.getByText('P2-FULL-TITLE').first().waitFor({ state: 'visible', timeout: 10000 })
    await Bp.screenshot({ path: path.join(SHOT_DIR, '03-b-week.png') })
  })

  await step('手機 390px：agenda 顯示 peer 事件、無水平溢出', async () => {
    const ctxM = await browser.newContext({ locale: 'zh-TW', storageState: stateB, viewport: { width: 390, height: 844 } })
    const M = await ctxM.newPage()
    M.on('pageerror', (e) => pageErrors.push(`M:${e.message}`))
    await M.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await sleep(2500)
    await M.evaluate(() => document.querySelector('nextjs-portal')?.remove())
    await dismissTourIfAny(M)
    const calTab = M.getByRole('tab', { name: '日曆' })
    if (await calTab.isVisible().catch(() => false)) { await calTab.click(); await sleep(1200) }
    const w = await M.evaluate(() => document.documentElement.scrollWidth)
    if (w > 390) throw new Error(`overflow ${w}`)
    await M.getByText('P2-FULL-TITLE').first().waitFor({ state: 'visible', timeout: 10000 })
    const html = await M.evaluate(() => document.documentElement.outerHTML)
    if (html.includes('P2-SECRET-LABEL')) throw new Error('busy label leaked on mobile')
    await M.screenshot({ path: path.join(SHOT_DIR, '04-mobile-agenda.png') })
    await ctxM.close()
  })

  let Ap
  await step('A 設定 → 共享 → 開放範圍編輯器（三態控制可見）', async () => {
    const r = await contextWithSession(browser, { viewport: { width: 1280, height: 900 } }, stateA, e2e.E2E_EMAIL, e2e.E2E_PASSWORD)
    Ap = r.pg
    Ap.on('pageerror', (e) => { pageErrors.push(`A:${e.message}`); console.log(`[pageerror A] ${e.message}`) })
    await dismissTourIfAny(Ap)
    await Ap.getByRole('button', { name: '設定', exact: true }).click()
    const dlg = Ap.getByRole('dialog')
    await dlg.waitFor({ state: 'visible', timeout: 10000 })
    await dlg.getByText('共享', { exact: true }).first().click()
    await sleep(800)
    await dlg.getByRole('button', { name: '開放範圍' }).first().click()
    await sleep(800)
    await dlg.getByText('完整內容').first().waitFor({ state: 'visible', timeout: 8000 })
    await Ap.screenshot({ path: path.join(SHOT_DIR, '05-a-grant-editor.png') })
  })

  await step('A 把大分類改「不開放」→ B 重載後 full 任務消失；改回「完整內容」→ 回來', async () => {
    const dlg = Ap.getByRole('dialog')
    // the segmented control renders as role=radio; target the row whose
    // current selection is 完整內容 (the workspace we granted full)
    const checkedFull = dlg.getByRole('radio', { name: '完整內容' }).and(Ap.locator('[aria-checked="true"]')).first()
    await checkedFull.waitFor({ state: 'visible', timeout: 8000 })
    const group = checkedFull.locator('xpath=ancestor::*[@role="radiogroup"]')
    const groupLabel = await group.getAttribute('aria-label')
    await group.getByRole('radio', { name: '不開放' }).click()
    await sleep(1500)
    await Bp.reload({ waitUntil: 'domcontentloaded' })
    await Bp.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    await Bp.getByRole('button', { name: '日檢視' }).click()
    await sleep(1500)
    if (await Bp.getByText('P2-FULL-TITLE').first().isVisible().catch(() => false)) throw new Error('task still visible after un-granting')
    await dlg.getByRole('radiogroup', { name: groupLabel }).getByRole('radio', { name: '完整內容' }).click()
    await sleep(1500)
    await Bp.reload({ waitUntil: 'domcontentloaded' })
    await Bp.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
    await Bp.getByRole('button', { name: '日檢視' }).click()
    await Bp.getByText('P2-FULL-TITLE').first().waitFor({ state: 'visible', timeout: 10000 })
  })

  await step('無 page error', async () => {
    if (pageErrors.length) throw new Error(pageErrors.join(' | '))
  })

  // ── cleanup (keep the share + seeded built-in-style slot row) ─────────────
  await sleep(1500)
  await api(A.jwt, 'DELETE', `tasks?id=eq.${task.id}`)
  await api(A.jwt, 'DELETE', `time_blocks?id=eq.${block.id}`)
  await api(A.jwt, 'DELETE', `calendar_share_grants?share_id=eq.${shareId}&owner_id=eq.${A.id}`)
  await api(A.jwt, 'DELETE', `slot_types?id=eq.${slot.id}`)
  const leftT = (await api(A.jwt, 'GET', 'tasks?select=id&title=eq.P2-FULL-TITLE')).body
  const leftB = (await api(A.jwt, 'GET', 'time_blocks?select=id&type=eq.p2ui-busy')).body
  console.log(`cleanup: tasks left=${leftT.length} blocks left=${leftB.length}`)
  if (leftT.length || leftB.length) exitCode = 1

  await browser.close()
}

main()
  .catch((e) => { console.error(e); exitCode = 1 })
  .finally(() => {
    if (devServer?.pid) { try { process.kill(-devServer.pid, 'SIGTERM') } catch {} }
    console.log(exitCode === 0 ? '\nALL PASS' : '\nSOME FAILED')
    process.exit(exitCode)
  })
