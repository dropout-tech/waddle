#!/usr/bin/env node
/**
 * LIVE UI screenshots of task assignment with two real test accounts (A, B —
 * see task-assignment-live-verify.mjs for credentials). One login per account
 * (Supabase throttles repeated logins); setup/cleanup reuse A's browser
 * session token. Creates ONE task (e2e-assign-ui-*) owned by A, assigns it to
 * B, lets B return it through the UI, then deletes it in `finally`.
 *
 *   BASE_URL=http://localhost:3100 SHOT_DIR=... E2E_EMAIL_B=... E2E_PASSWORD_B=... \
 *     node scripts/e2e/task-assignment-live-ui.mjs
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const loadEnv = (f) => !existsSync(f) ? {} : Object.fromEntries(readFileSync(f, 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const env = { ...loadEnv('.env.local'), ...loadEnv('.env.e2e.local'), ...process.env }
const BASE = env.BASE_URL || 'http://localhost:3100'
const SHOT = env.SHOT_DIR || path.join(process.cwd(), 'tmp-assign-live')
mkdirSync(SHOT, { recursive: true })
const TITLE = `e2e-assign-ui-${Date.now()}`
let failures = 0
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`); if (!c) failures++ }

async function login(ctx, email, password) {
  const page = await ctx.newPage()
  // Web sessions live in cookies (@supabase/ssr); grab the user JWT from the
  // app's own REST calls instead of logging in a second time.
  page.__auth = null
  page.on('request', (req) => {
    const h = req.headers()['authorization']
    if (!h || !req.url().includes('/rest/v1/')) return
    try {
      const jwt = h.split(' ')[1]
      const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
      if (claims.sub) page.__auth = { token: jwt, id: claims.sub }
    } catch { /* not a JWT */ }
  })
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE}/`, { timeout: 30000 })
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 30000 })
  return page
}
async function tokenOf(page) {
  for (let i = 0; i < 40 && !page.__auth; i++) await page.waitForTimeout(250)
  return page.__auth
}
async function closeDialogs(page) {
  for (let i = 0; i < 6 && (await page.getByRole('dialog').count()) > 0; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250) }
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOT, name) })
async function showTasks(page) {
  const tab = page.getByRole('tab', { name: '任務', exact: true })
  if (await tab.count() && await tab.first().isVisible()) { await tab.first().click(); await page.waitForTimeout(800) }
}

async function main() {
  const browser = await chromium.launch()
  const init = () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal,[data-pet-adopt]{display:none!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)) }
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW' })
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW' })
  await ctxA.addInitScript(init); await ctxB.addInitScript(init)
  const errors = []
  let apiA = null, taskId = null
  try {
    const pa = await login(ctxA, env.E2E_EMAIL, env.E2E_PASSWORD)
    const pb = await login(ctxB, env.E2E_EMAIL_B, env.E2E_PASSWORD_B)
    pa.on('pageerror', (e) => errors.push(`A: ${e.message}`)); pb.on('pageerror', (e) => errors.push(`B: ${e.message}`))
    const a = await tokenOf(pa), b = await tokenOf(pb)
    apiA = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${a.token}` } } })
    const cat = await apiA.from('categories').select('id,workspace_id').eq('user_id', a.id).eq('is_archived', false).order('sort_order').limit(1).single()
    const ins = await apiA.from('tasks').insert({ user_id: a.id, workspace_id: cat.data.workspace_id, category_id: cat.data.id, title: TITLE, notes: '只有 e2e 用', urgency: 7 }).select('id').single()
    if (ins.error) throw ins.error
    taskId = ins.data.id
    const as = await apiA.rpc('assign_task', { p_task: taskId, p_assignee: b.id })
    ok(!as.error, 'setup: A assigns the UI task to B')

    // ── A (1280): chip on row + modal "指派給 B" ──
    await pa.reload({ waitUntil: 'domcontentloaded' }); await pa.getByRole('button', { name: '月檢視' }).waitFor({ timeout: 30000 }); await pa.waitForTimeout(1500)
    const rowA = pa.locator('[data-tour="task-row"]', { hasText: TITLE }).first()
    await rowA.scrollIntoViewIfNeeded()
    ok(await rowA.getByTestId('assignment-chip').isVisible(), 'A row shows the 指派給 chip')
    await rowA.click()
    await pa.getByTestId('task-assign-section').waitFor({ timeout: 10000 })
    ok(/指派給|已完成|進行中/.test(await pa.getByTestId('task-assign-section').textContent()), 'A modal shows the assignee + status')
    await shot(pa, 'A-modal-assigned-1280.png')
    await closeDialogs(pa)
    await pa.goto(`${BASE}/assignments?tab=sent`, { waitUntil: 'domcontentloaded' })
    await pa.getByTestId('assigned-by-me-item').first().waitFor({ timeout: 15000 })
    await shot(pa, 'A-assignments-sent-1280.png')

    // ── B (1280): 指派給我 section, /assignments, return via modal ──
    await pb.reload({ waitUntil: 'domcontentloaded' }); await pb.getByRole('button', { name: '月檢視' }).waitFor({ timeout: 30000 }); await pb.waitForTimeout(1500)
    const sec = pb.getByTestId('assigned-to-me-section')
    ok(await sec.isVisible() && (await sec.textContent()).includes(TITLE), 'B task panel lists the task under 指派給我')
    ok((await sec.textContent()).includes('來自'), 'B row shows 來自 <A>')
    await shot(pb, 'B-panel-from-A-1280.png')
    await pb.goto(`${BASE}/assignments`, { waitUntil: 'domcontentloaded' })
    await pb.getByTestId('assigned-to-me-item').first().waitFor({ timeout: 15000 })
    await shot(pb, 'B-assignments-mine-1280.png')

    // ── 390 before the return (both accounts) ──
    await pa.setViewportSize({ width: 390, height: 844 }); await pb.setViewportSize({ width: 390, height: 844 })
    await shot(pb, 'B-assignments-mine-390.png')
    await pa.reload({ waitUntil: 'domcontentloaded' }); await pa.getByTestId('assigned-by-me-item').first().waitFor({ timeout: 15000 })
    await shot(pa, 'A-assignments-sent-390.png')
    await pb.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await pb.waitForTimeout(2500); await showTasks(pb)
    ok(await pb.getByTestId('assigned-to-me-section').isVisible(), 'B 390 task tab shows 指派給我')
    await shot(pb, 'B-panel-from-A-390.png')
    await pb.getByTestId('assigned-to-me-section').getByText(TITLE).first().click()
    await pb.getByTestId('assignee-banner').waitFor({ timeout: 10000 })
    await pb.getByRole('button', { name: '退回這個任務' }).click()
    await pb.getByPlaceholder('寫一句退回理由（對方會看到）').fill('e2e：這週排不進來')
    await shot(pb, 'B-return-flow-390.png')
    await pb.getByRole('button', { name: '確認退回' }).click()
    await pb.waitForTimeout(1500)
    await closeDialogs(pb)
    const list = await apiA.rpc('list_task_assignments')
    const rec = (list.data ?? []).find((r) => r.task_id === taskId)
    ok(rec?.status === 'returned' && rec?.return_note === 'e2e：這週排不進來', 'B returned through the UI → A sees returned + note in DB')

    // A sees the returned state (390 modal, 1280 row).
    await pa.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await pa.waitForTimeout(2500); await showTasks(pa)
    const rowA2 = pa.locator('[data-tour="task-row"]', { hasText: TITLE }).first()
    await rowA2.scrollIntoViewIfNeeded(); await rowA2.click()
    await pa.getByTestId('task-assign-section').waitFor({ timeout: 10000 })
    ok((await pa.getByTestId('task-assign-section').textContent()).includes('e2e：這週排不進來'), 'A modal shows the return reason')
    await shot(pa, 'A-modal-returned-390.png')
    await closeDialogs(pa)
    await pa.setViewportSize({ width: 1280, height: 900 })
    await pa.goto(`${BASE}/assignments?tab=sent`, { waitUntil: 'domcontentloaded' }); await pa.getByTestId('assigned-by-me-item').first().waitFor({ timeout: 15000 })
    await shot(pa, 'A-assignments-returned-1280.png')
    ok(errors.length === 0, `no page errors${errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''}`)
  } finally {
    if (apiA && taskId) {
      const d = await apiA.from('tasks').delete().eq('id', taskId).select('id')
      const left = await apiA.from('tasks').select('id', { count: 'exact', head: true }).like('title', 'e2e-assign-%')
      console.log(`CLEANUP deleted=${d.data?.length ?? 0} residue(e2e-assign-* tasks of A)=${left.count}`)
      if (left.count !== 0) failures++
    }
    await browser.close()
  }
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => { console.error('ERROR', e); process.exit(1) })
