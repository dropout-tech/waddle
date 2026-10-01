#!/usr/bin/env node
/**
 * Post-merge review fixes (REVIEW.md S1–S5 + suggestions), mocked, ONE login.
 *
 *   BASE_URL=http://localhost:3100 SHOT_DIR=... node scripts/e2e/assign-review-fixes-verify.mjs
 *
 * Every tasks write and every assignment/org RPC is intercepted with a
 * PATHNAME predicate (an INSERT hits /rest/v1/tasks with no query string, so
 * a `tasks?*` glob would let it through to the real DB).
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const loadEnv = (f) => !existsSync(f) ? {} : Object.fromEntries(readFileSync(f, 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const env = { ...loadEnv('.env.e2e.local'), ...process.env }
const BASE = env.BASE_URL || 'http://localhost:3100'
const SHOT = env.SHOT_DIR || path.join(process.cwd(), 'tmp-assign-fixes')
mkdirSync(SHOT, { recursive: true })
let failures = 0
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`); if (!c) failures++ }

const PEER = '11111111-1111-4111-8111-111111111111'
const FOREIGN = '44444444-4444-4444-8444-444444444443'
const FOREIGN_ARCH = '44444444-4444-4444-8444-444444444444'
const OWN_ASSIGNED = '44444444-4444-4444-8444-444444444441'
const OWN_RETURNED = '44444444-4444-4444-8444-444444444442'
const today = new Date().toLocaleDateString('sv-SE')
const log = []
const state = { me: null, cat: null, zeroRowsFor: null, orgs: { can_create: false, orgs: [] } }

function row(o) {
  return {
    id: o.id, user_id: o.user_id, workspace_id: o.workspace_id ?? '55555555-5555-4555-8555-555555555555', category_id: o.category_id ?? '66666666-6666-4666-8666-666666666666',
    title: o.title, description: 'desc', task_type: 'one_time', urgency: 6, estimated_minutes: 30, actual_minutes: null,
    due_date: today, scheduled_date: o.scheduled ? today : null, scheduled_start_time: o.scheduled ? '10:00:00' : null, scheduled_end_time: o.scheduled ? '11:00:00' : null,
    calendar_color: '#E1755A', is_completed: false, completed_at: null, is_archived: !!o.archived, archived_at: o.archived ? new Date().toISOString() : null,
    notes: null, sort_order: 0, is_recurring: false, recurrence_type: null, recurrence_interval: null, recurrence_days_of_week: null,
    recurrence_end_date: null, google_event_id: null, show_in_task_list: true, is_meeting: false, attendees: null, location: null, meeting_url: null,
    exdates: [], parent_id: null, assignee_id: o.assignee_id, organization_id: null, assignment_status: o.status ?? 'active',
    return_note: o.note ?? null, assigned_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
}
const assignRows = () => [
  { task_id: FOREIGN, role: 'assignee', peer_id: PEER, peer_name: '小安', peer_avatar: null, status: 'active', return_note: null, organization_id: null, organization_name: null, assigned_at: null, title: '確認報價單', is_completed: false, completed_at: null, scheduled_date: today, due_date: today },
  { task_id: OWN_ASSIGNED, role: 'assigner', peer_id: PEER, peer_name: '小安', peer_avatar: null, status: 'active', return_note: null, organization_id: null, organization_name: null, assigned_at: null, title: '準備週會簡報', is_completed: false, completed_at: null, scheduled_date: null, due_date: today },
  { task_id: OWN_RETURNED, role: 'assigner', peer_id: PEER, peer_name: '小安', peer_avatar: null, status: 'returned', return_note: 'busy this week', organization_id: null, organization_name: null, assigned_at: null, title: '整理客戶名單', is_completed: false, completed_at: null, scheduled_date: null, due_date: null },
]

async function routes(ctx) {
  await ctx.route((u) => u.pathname.endsWith('/rest/v1/categories'), async (route) => {
    const res = await route.fetch(); const body = await res.json().catch(() => [])
    if (Array.isArray(body) && body[0] && !state.cat) state.cat = body[0]
    await route.fulfill({ response: res, json: body })
  })
  await ctx.route((u) => u.pathname.endsWith('/rest/v1/tasks'), async (route) => {
    const req = route.request()
    if (req.method() !== 'GET') {
      const id = new URL(req.url()).searchParams.get('id')?.replace('eq.', '')
      log.push({ kind: `tasks:${req.method()}`, id, body: req.postData() || '' })
      if (req.method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
      if (req.method() === 'PATCH' && id && id === state.zeroRowsFor) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(id ? [{ id, scheduled_date: null }] : []) })
    }
    const res = await route.fetch(); const rows = await res.json().catch(() => [])
    try { state.me = state.me || JSON.parse(Buffer.from((req.headers().authorization || '').split('.')[1], 'base64url').toString()).sub } catch { /* anon */ }
    for (let i = 0; i < 40 && !state.cat; i++) await new Promise((r) => setTimeout(r, 100))
    if (!state.me || !state.cat) return route.fulfill({ response: res, json: rows })
    const c = state.cat
    await route.fulfill({ response: res, json: [...rows,
      row({ id: FOREIGN, user_id: PEER, title: '確認報價單', assignee_id: state.me, scheduled: true }),
      row({ id: FOREIGN_ARCH, user_id: PEER, title: '已封存的指派', assignee_id: state.me, scheduled: true, archived: true }),
      row({ id: OWN_ASSIGNED, user_id: state.me, workspace_id: c.workspace_id, category_id: c.id, title: '準備週會簡報', assignee_id: PEER }),
      row({ id: OWN_RETURNED, user_id: state.me, workspace_id: c.workspace_id, category_id: c.id, title: '整理客戶名單', assignee_id: PEER, status: 'returned', note: 'busy this week' }),
    ] })
  })
  await ctx.route((u) => u.pathname.includes('/rest/v1/rpc/'), async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const body = route.request().postData() || ''
    const json = (v) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (name === 'list_task_assignments') return json(assignRows())
    if (name === 'get_assignable_people') return json([{ user_id: PEER, display_name: '小安', avatar_url: null, source: 'share', org_id: null, org_name: null }])
    if (name === 'preview_org_invite') return json([{ org_name: 'Huddle 團隊', inviter_name: '小安', member_count: 3, already_member: false }])
    if (name === 'get_my_organizations') return json(state.orgs)
    if (['assign_task', 'unassign_task', 'return_task', 'accept_org_invite', 'create_organization'].includes(name)) {
      log.push({ kind: `rpc:${name}`, body })
      return name === 'accept_org_invite' ? json('33333333-3333-4333-8333-333333333333') : route.fulfill({ status: 204, body: '' })
    }
    return route.continue()
  })
}
const closeDialogs = async (page) => { for (let i = 0; i < 6 && (await page.getByRole('dialog').count()) > 0; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250) } }
const shot = (page, n) => page.screenshot({ path: path.join(SHOT, n) })
const fontPx = (loc) => loc.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
const waitLog = async (page, pred) => { for (let i = 0; i < 24 && !log.some(pred); i++) await page.waitForTimeout(250) }

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW' })
  await ctx.addInitScript(() => {
    const s = document.createElement('style'); s.textContent = 'nextjs-portal,[data-pet-adopt]{display:none!important}'
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s))
  })
  await routes(ctx)
  const errors = []
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))

  // ── Suggestion: image retry budget is per URL (marketing page, logged out) ──
  const hits = {}
  await ctx.route((u) => /\/e2e-fail-[ab]\.png$/.test(u.pathname), (route) => {
    const k = new URL(route.request().url()).pathname; hits[k] = (hits[k] || 0) + 1
    return route.fulfill({ status: 404, body: '' })
  })
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.locator('#top img').first().waitFor({ state: 'attached', timeout: 20000 })
  await page.evaluate(() => { const img = document.querySelector('#top img'); img.removeAttribute('srcset'); img.src = '/e2e-fail-a.png' })
  await page.waitForTimeout(3200)
  await page.evaluate(() => { document.querySelector('#top img').src = '/e2e-fail-b.png' })
  await page.waitForTimeout(3200)
  ok(hits['/e2e-fail-a.png'] === 3 && hits['/e2e-fail-b.png'] === 3, `reused <img> gets 2 retries per URL (a=${hits['/e2e-fail-a.png']}, b=${hits['/e2e-fail-b.png']})`)

  // ── S3 + Back-loop: invite → login in a NEW tab (sessionStorage gone) → join ──
  await page.goto(`${BASE}/org/invite#t=mock-tok`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/login/, { timeout: 15000 })
  const stored = await page.evaluate(() => localStorage.getItem('huddle-pending-org-invite'))
  ok(!!stored && JSON.parse(stored).token === 'mock-tok', 'invite token persisted in localStorage with an expiry')
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(800)
  ok(!page.url().includes('/org/invite'), `Back from /login does not bounce into the invite again (${new URL(page.url()).pathname})`)
  const tab2 = await ctx.newPage() // e.g. the email-confirmation link opening in a new tab
  tab2.on('pageerror', (e) => errors.push(e.message))
  await tab2.goto(`${BASE}/login?method=email`, { waitUntil: 'domcontentloaded' })
  ok(await tab2.evaluate(() => sessionStorage.length === 0), 'new tab has an empty sessionStorage')
  await tab2.locator('#email').fill(env.E2E_EMAIL)
  await tab2.locator('#password').fill(env.E2E_PASSWORD)
  await tab2.getByRole('button', { name: '登入', exact: true }).click()
  await tab2.waitForURL(/\/org\/invite/, { timeout: 30000 })
  ok(true, 'after login in the new tab the app resumes /org/invite')
  await tab2.getByRole('button', { name: '加入組織' }).click()
  await waitLog(tab2, (e) => e.kind === 'rpc:accept_org_invite')
  const acc = log.find((e) => e.kind === 'rpc:accept_org_invite')
  ok(!!acc && JSON.parse(acc.body).p_token === 'mock-tok', 'accept_org_invite called with the carried token')
  await tab2.waitForURL(/\/org$/, { timeout: 15000 }).catch(() => {})
  ok(await tab2.evaluate(() => localStorage.getItem('huddle-pending-org-invite') === null), 'pending invite cleared after use')
  await page.close()
  const p = tab2

  // ── Board ──
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await p.getByRole('button', { name: '月檢視' }).waitFor({ timeout: 30000 })
  await p.waitForTimeout(2000)
  const sec = p.getByTestId('assigned-to-me-section')
  ok((await sec.textContent()).includes('確認報價單'), 'active assigned task listed')
  ok(!(await p.locator('body').textContent()).includes('已封存的指派'), 'S1: owner-archived assigned task hidden from list and calendar')

  // Suggestion: assignee edits are undoable on their own.
  let n0 = log.length
  await sec.getByRole('checkbox').first().click()
  await waitLog(p, (e, i) => false)
  await p.waitForTimeout(700)
  await p.keyboard.press('ControlOrMeta+z')
  await p.waitForTimeout(900)
  const patches = log.slice(n0).filter((e) => e.kind === 'tasks:PATCH' && e.id === FOREIGN).map((e) => JSON.parse(e.body).is_completed)
  ok(patches.length >= 2 && patches[0] === true && patches[1] === false, `⌘Z reverts the assignee's own completion (${JSON.stringify(patches)})`)

  // Suggestion: 0 rows → removed locally at once.
  state.zeroRowsFor = FOREIGN
  await sec.getByRole('checkbox').first().click()
  await p.waitForTimeout(1200)
  ok(!(await p.getByTestId('assigned-to-me-section').count()) || !(await p.getByTestId('assigned-to-me-section').textContent()).includes('確認報價單'), 'withdrawn task disappears immediately on 0-row update')
  state.zeroRowsFor = null

  // S5: owner's assigned task → recurrence locked.
  await p.locator('[data-tour="task-row"]:visible', { hasText: '準備週會簡報' }).first().click()
  await p.getByTestId('recurrence-locked-hint').waitFor({ timeout: 8000 })
  ok(await p.getByRole('dialog').getByRole('button', { name: '重複設定' }).isDisabled(), 'S5: recurrence toggle disabled on an assigned task (hint shown)')
  await shot(p, 'owner-recurrence-locked-1280.png')
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400)
  await shot(p, 'owner-recurrence-locked-390.png')
  await p.setViewportSize({ width: 1280, height: 900 }); await p.waitForTimeout(400)

  // S2: delete an assigned task, ⌘Z → insert (no assignment cols) then assign_task again.
  n0 = log.length
  await p.getByRole('dialog').getByTitle('刪除任務').click()
  await p.waitForTimeout(800)
  await p.keyboard.press('ControlOrMeta+z')
  await waitLog(p, (e) => e.kind === 'rpc:assign_task')
  const tail = log.slice(n0)
  const ins = tail.findIndex((e) => e.kind === 'tasks:POST' && e.body.includes(OWN_ASSIGNED))
  const asg = tail.findIndex((e) => e.kind === 'rpc:assign_task' && e.body.includes(OWN_ASSIGNED))
  ok(tail.some((e) => e.kind === 'tasks:DELETE' && e.id === OWN_ASSIGNED), 'delete went out')
  ok(ins >= 0 && asg > ins && !tail[ins].body.includes('assignee_id'), `S2: undo re-inserts (#${ins}, no assignment cols) then re-assigns via assign_task (#${asg})`)

  // S4: 16px inputs on mobile.
  await p.setViewportSize({ width: 390, height: 844 })
  await p.goto(`${BASE}/assignments`, { waitUntil: 'domcontentloaded' })
  await p.getByTestId('assigned-to-me-item').first().waitFor({ timeout: 15000 })
  await p.getByTestId('assigned-to-me-item').first().getByRole('button', { name: '退回' }).click()
  ok(await fontPx(p.locator('main textarea').first()) >= 16, 'S4: /assignments return textarea is 16px at 390')
  await shot(p, 'assignments-return-390.png')
  state.orgs = { can_create: true, orgs: [] }
  await p.goto(`${BASE}/org`, { waitUntil: 'domcontentloaded' })
  await p.getByLabel('組織名稱').waitFor({ timeout: 15000 })
  ok(await fontPx(p.getByLabel('組織名稱')) >= 16, 'S4: org name input is 16px at 390')
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  const tasksTab = p.getByRole('tab', { name: '任務', exact: true }); if (await tasksTab.count()) await tasksTab.first().click()
  await p.waitForTimeout(800)
  await p.getByTestId('assigned-to-me-section').getByText('確認報價單').first().click()
  await p.getByTestId('task-assign-button').click()
  const ta = p.getByTestId('task-assign-popover').locator('textarea')
  ok(await fontPx(ta) >= 16, 'S4: return-reason textarea in the modal popover is 16px at 390')
  await shot(p, 'assignee-popover-390.png')
  await closeDialogs(p)
  await p.setViewportSize({ width: 1280, height: 900 })

  // Suggestion: English tooltip + missing key.
  await p.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await p.getByRole('button', { name: 'Month view' }).waitFor({ timeout: 30000 }).catch(() => {})
  await p.waitForTimeout(2000)
  const tip = await p.getByTestId('assignment-chip').evaluateAll((els) => els.map((e) => e.getAttribute('title')).find((x) => x && x.includes('busy this week')))
  ok(!!tip && tip.includes(': busy this week') && !tip.includes('：'), `English returned tooltip uses ": " (${tip})`)
  const done = await p.locator('[data-tour="completed-tasks-button"]').getAttribute('title')
  ok(!!done && /tasks completed/.test(done) && !/[一-鿿]/.test(done), `completed-tasks title translated (${done})`)
  await shot(p, 'board-en-1280.png')
  await p.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))

  ok(errors.length === 0, `no page errors${errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''}`)
  await browser.close()
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
  process.exit(failures ? 1 : 0)
}
main().catch((e) => { console.error('ERROR', e); process.exit(1) })
