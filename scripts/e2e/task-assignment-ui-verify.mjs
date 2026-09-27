#!/usr/bin/env node
/**
 * Task assignment + organization UI smoke (1280 + 390 in ONE login).
 *
 * Runs against an already-running dev server (BASE_URL, default :3100).
 * Until migration 20260927120000 is applied to the target Supabase project the
 * assignment RPCs don't exist, so every assignment/org RPC and the tasks GET
 * are served by Playwright route mocks, and every tasks write is swallowed
 * (zero writes reach the database). Assertions print PASS/FAIL lines; the
 * request bodies the UI *would* have sent are checked too.
 *
 *   BASE_URL=http://localhost:3100 SHOT_DIR=/tmp/shots node scripts/e2e/task-assignment-ui-verify.mjs
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100'
const SHOT_DIR = process.env.SHOT_DIR || path.join(process.cwd(), 'tmp-assign-shots')
mkdirSync(SHOT_DIR, { recursive: true })

function loadEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}
const env = loadEnv(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || env.E2E_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('missing .env.e2e.local credentials'); process.exit(1) }

let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`); if (!cond) failures++ }

const PEER = '11111111-1111-4111-8111-111111111111'
const ORG_PEER = '22222222-2222-4222-8222-222222222222'
const ORG = '33333333-3333-4333-8333-333333333333'
const OWN_ACTIVE = '44444444-4444-4444-8444-444444444441'
const OWN_RETURNED = '44444444-4444-4444-8444-444444444442'
const FOREIGN = '44444444-4444-4444-8444-444444444443'
const today = new Date().toLocaleDateString('sv-SE')

const state = { me: null, catReady: null, cat: null, orgs: { can_create: false, orgs: [] }, writes: [], rpcs: [] }
let resolveCat
state.catReady = new Promise((r) => { resolveCat = r })

function subFromAuth(req) {
  const h = req.headers()['authorization'] || ''
  try { return JSON.parse(Buffer.from(h.split('.')[1], 'base64url').toString()).sub } catch { return null }
}
function taskRow(over) {
  return {
    id: over.id, user_id: over.user_id, workspace_id: over.workspace_id, category_id: over.category_id,
    title: over.title, description: null, task_type: 'one_time', urgency: 6, estimated_minutes: 60,
    actual_minutes: null, due_date: over.due_date ?? null, scheduled_date: over.scheduled_date ?? null,
    scheduled_start_time: over.scheduled_start_time ?? null, scheduled_end_time: over.scheduled_end_time ?? null,
    calendar_color: '#E1755A', is_completed: false, completed_at: null, is_archived: false, archived_at: null,
    notes: null, sort_order: 0, is_recurring: false, recurrence_type: null, recurrence_interval: null,
    recurrence_days_of_week: null, recurrence_end_date: null, google_event_id: null, show_in_task_list: true,
    is_meeting: false, attendees: null, location: null, meeting_url: null, exdates: [], parent_id: null,
    assignee_id: over.assignee_id ?? null, organization_id: over.organization_id ?? null,
    assignment_status: over.assignment_status ?? null, return_note: over.return_note ?? null,
    assigned_at: over.assignee_id ? new Date().toISOString() : null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
}
const assignmentRows = () => [
  { task_id: FOREIGN, role: 'assignee', peer_id: PEER, peer_name: '小安', peer_avatar: null, status: 'active', return_note: null, organization_id: null, organization_name: null, assigned_at: new Date().toISOString(), title: '確認報價單', is_completed: false, completed_at: null, scheduled_date: today, due_date: today },
  { task_id: OWN_ACTIVE, role: 'assigner', peer_id: PEER, peer_name: '小安', peer_avatar: null, status: 'active', return_note: null, organization_id: null, organization_name: null, assigned_at: new Date().toISOString(), title: '準備週會簡報', is_completed: false, completed_at: null, scheduled_date: null, due_date: today },
  { task_id: OWN_RETURNED, role: 'assigner', peer_id: ORG_PEER, peer_name: '阿哲', peer_avatar: null, status: 'returned', return_note: '這週排不進來', organization_id: ORG, organization_name: 'Huddle 團隊', assigned_at: new Date().toISOString(), title: '整理客戶名單', is_completed: false, completed_at: null, scheduled_date: null, due_date: null },
]
const RPC = {
  list_task_assignments: () => assignmentRows(),
  get_assignable_people: () => [
    { user_id: PEER, display_name: '小安', avatar_url: null, source: 'share', org_id: null, org_name: null },
    { user_id: ORG_PEER, display_name: '阿哲', avatar_url: null, source: 'org', org_id: ORG, org_name: 'Huddle 團隊' },
  ],
  get_my_organizations: () => state.orgs,
  get_org_members: () => [
    { user_id: state.me, display_name: '我', avatar_url: null, role: 'owner', joined_at: new Date().toISOString() },
    { user_id: ORG_PEER, display_name: '阿哲', avatar_url: null, role: 'admin', joined_at: new Date().toISOString() },
    { user_id: PEER, display_name: '小安', avatar_url: null, role: 'member', joined_at: new Date().toISOString() },
  ],
  get_org_board: () => [
    { task_id: 'b1', title: '整理客戶名單', assignee_id: ORG_PEER, assignee_name: '阿哲', assigner_id: state.me, assigner_name: '我', is_completed: false, completed_at: null, due_date: today, scheduled_date: null, assigned_at: null },
    { task_id: 'b2', title: '更新官網價格頁', assignee_id: PEER, assignee_name: '小安', assigner_id: state.me, assigner_name: '我', is_completed: true, completed_at: new Date().toISOString(), due_date: null, scheduled_date: null, assigned_at: null },
  ],
  create_org_invite: () => 'mock-token-not-real',
  preview_org_invite: () => [{ org_name: 'Huddle 團隊', inviter_name: '小安', member_count: 3, already_member: false }],
}

async function installRoutes(page) {
  await page.route('**/rest/v1/categories?*', async (route) => {
    const res = await route.fetch()
    const body = await res.json().catch(() => [])
    if (Array.isArray(body) && body[0] && !state.cat) { state.cat = body[0]; resolveCat() }
    await route.fulfill({ response: res, json: body })
  })
  // Predicate, not a glob: an INSERT hits /rest/v1/tasks with NO query
  // string, which a `tasks?*` glob silently misses (it then reaches the DB).
  await page.route((u) => u.pathname.endsWith('/rest/v1/tasks'), async (route) => {
    const req = route.request()
    if (req.method() !== 'GET') {
      state.writes.push({ method: req.method(), url: req.url(), body: req.postData() })
      const id = new URL(req.url()).searchParams.get('id')?.replace('eq.', '')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(id ? [{ id, scheduled_date: null }] : []) })
    }
    const res = await route.fetch()
    const rows = await res.json().catch(() => [])
    state.me = state.me || subFromAuth(req)
    await Promise.race([state.catReady, new Promise((r) => setTimeout(r, 5000))])
    const c = state.cat
    if (!c || !state.me) return route.fulfill({ response: res, json: rows })
    const extra = [
      taskRow({ id: OWN_ACTIVE, user_id: state.me, workspace_id: c.workspace_id, category_id: c.id, title: '準備週會簡報', due_date: today, assignee_id: PEER, assignment_status: 'active' }),
      taskRow({ id: OWN_RETURNED, user_id: state.me, workspace_id: c.workspace_id, category_id: c.id, title: '整理客戶名單', assignee_id: ORG_PEER, organization_id: ORG, assignment_status: 'returned', return_note: '這週排不進來' }),
      taskRow({ id: FOREIGN, user_id: PEER, workspace_id: '55555555-5555-4555-8555-555555555555', category_id: '66666666-6666-4666-8666-666666666666', title: '確認報價單', due_date: today, scheduled_date: today, scheduled_start_time: '10:00:00', scheduled_end_time: '11:00:00', assignee_id: state.me, assignment_status: 'active' }),
    ]
    await route.fulfill({ response: res, json: [...rows, ...extra] })
  })
  await page.route('**/rest/v1/rpc/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    if (!(name in RPC) && !['assign_task', 'unassign_task', 'return_task', 'create_organization', 'accept_org_invite', 'leave_org', 'delete_organization', 'remove_org_member', 'set_org_member_role'].includes(name)) return route.continue()
    state.rpcs.push({ name, body: route.request().postData() })
    if (name in RPC) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[name]()) })
    return route.fulfill({ status: 204, body: '' })
  })
}

async function closeDialogs(page) {
  for (let i = 0; i < 6 && (await page.getByRole('dialog').count()) > 0; i++) {
    await page.keyboard.press('Escape'); await page.waitForTimeout(250)
  }
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false })

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW' })
  await context.addInitScript(() => {
    const s = document.createElement('style'); s.textContent = 'nextjs-portal,[data-pet-adopt]{display:none!important}'
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s))
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await installRoutes(page)

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE_URL}/`, { timeout: 30000 })
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(1500)

  // ── 1280: board ──
  const section = page.getByTestId('assigned-to-me-section')
  ok(await section.isVisible(), '1280 board shows the 指派給我 section')
  ok((await section.textContent())?.includes('確認報價單'), 'assigned-to-me task listed with its title')
  ok(await section.getByRole('img', { name: '來自 小安' }).first().isVisible(), 'assigned-to-me row shows a 來自 小安 avatar (name in aria-label)')
  ok(await page.getByRole('img', { name: '指派給 小安' }).first().isVisible().catch(() => false), 'own assigned task shows a 指派給 小安 avatar')
  ok(await page.getByRole('img', { name: /阿哲 已退回/ }).first().isVisible().catch(() => false), 'returned task shows a 阿哲 已退回 avatar')
  const chipBox = await page.getByTestId('assignment-chip').first().boundingBox()
  ok(!!chipBox && chipBox.width <= 18 && chipBox.height <= 18, `row marker is a tiny avatar (${chipBox?.width}×${chipBox?.height})`)
  ok(!(await page.locator('[data-tour="task-row"]').allTextContents()).some((x) => /來自|指派給|已退回/.test(x)), 'task rows carry no assignment text labels')
  await shot(page, 'board-1280.png')

  // Assignee completes: only whitelisted columns may be sent.
  const before = state.writes.length
  await section.getByRole('checkbox').first().click()
  await page.waitForTimeout(800)
  const w = state.writes.slice(before).find((x) => x.method === 'PATCH' && x.url.includes(FOREIGN))
  const keys = w ? Object.keys(JSON.parse(w.body || '{}')).sort() : []
  ok(!!w && keys.every((k) => ['is_completed', 'completed_at'].includes(k)), `assignee completion PATCH sends only completion columns (${keys.join(',')})`)
  await section.getByRole('checkbox').first().click() // undo back to open
  await page.waitForTimeout(600)

  // Owner modal: assign section + picker.
  await page.getByText('整理客戶名單').first().click()
  const assignBtn = page.getByTestId('task-assign-button')
  await assignBtn.waitFor({ timeout: 8000 })
  ok(await page.getByTestId('task-assign-section').count() === 0, 'modal body has no assignment card')
  const btnBox = await assignBtn.boundingBox()
  ok(!!btnBox && btnBox.width >= 44 && btnBox.height >= 44, `header assign button hit area ≥44 (${btnBox?.width}×${btnBox?.height})`)
  await shot(page, 'modal-owner-closed-1280.png')
  await assignBtn.click()
  const pop = page.getByTestId('task-assign-popover')
  await pop.waitFor({ timeout: 5000 })
  ok((await pop.textContent())?.includes('這週排不進來'), 'popover shows the return reason')
  ok((await pop.textContent())?.includes('對方可以看到描述與備註'), 'privacy hint lives in the popover')
  await page.getByRole('option', { name: /小安/ }).waitFor({ timeout: 5000 })
  await shot(page, 'modal-owner-assign-1280.png')
  await page.getByRole('option', { name: /阿哲/ }).click()
  await page.waitForTimeout(500)
  const assignCall = state.rpcs.find((r) => r.name === 'assign_task')
  ok(!!assignCall && JSON.parse(assignCall.body).p_org === ORG && JSON.parse(assignCall.body).p_assignee === ORG_PEER, 'picking an org member calls assign_task with p_org')
  await closeDialogs(page)

  // Assignee modal: banner + return.
  await section.getByText('確認報價單').click()
  await page.getByTestId('task-assign-button').waitFor({ timeout: 8000 })
  ok(await page.getByRole('dialog').getByTitle('刪除任務').count() === 0, 'assignee modal hides the delete button')
  await shot(page, 'modal-assignee-closed-1280.png')
  await page.getByTestId('task-assign-button').click()
  await page.getByPlaceholder('寫一句退回理由（對方會看到）').fill('需要先確認預算')
  await shot(page, 'modal-assignee-return-1280.png')
  await page.getByTestId('task-assign-popover').getByRole('button', { name: '退回這個任務' }).click()
  await page.waitForTimeout(500)
  const ret = state.rpcs.find((r) => r.name === 'return_task')
  ok(!!ret && JSON.parse(ret.body).p_note === '需要先確認預算', 'return_task called with the reason')
  await closeDialogs(page)

  // ── /assignments ──
  await page.goto(`${BASE_URL}/assignments`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('assigned-to-me-item').first().waitFor({ timeout: 15000 })
  await shot(page, 'assignments-mine-1280.png')
  await page.getByRole('tab', { name: /我指派的/ }).click()
  await page.getByTestId('assigned-by-me-item').first().waitFor({ timeout: 5000 })
  ok((await page.locator('main').textContent())?.includes('這週排不進來'), '我指派的 tab shows returned reason')
  await shot(page, 'assignments-sent-1280.png')
  await page.getByRole('tab', { name: /會議提案/ }).click()
  await page.waitForTimeout(800)
  await shot(page, 'assignments-meetings-1280.png')

  // ── /org (non-Pro, then with an org) ──
  await page.goto(`${BASE_URL}/org`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('org-upgrade').waitFor({ timeout: 15000 })
  ok(true, 'non-Pro /org shows the upgrade prompt')
  await shot(page, 'org-upgrade-1280.png')
  state.orgs = { can_create: true, orgs: [{ id: ORG, name: 'Huddle 團隊', role: 'owner', member_count: 3, created_at: new Date().toISOString() }] }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('org-members').waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: '產生邀請連結' }).click()
  await page.getByLabel('邀請連結').waitFor({ timeout: 5000 })
  ok((await page.getByLabel('邀請連結').inputValue()).includes('/org/invite#t=mock-token-not-real'), 'invite link uses the URL fragment')
  ok((await page.getByTestId('org-board').textContent())?.includes('更新官網價格頁'), 'org board renders member tasks')
  await shot(page, 'org-detail-1280.png')

  await page.goto(`${BASE_URL}/org/invite#t=mock-token-not-real`, { waitUntil: 'domcontentloaded' })
  await page.getByText('邀請你加入').waitFor({ timeout: 15000 })
  await shot(page, 'org-invite-1280.png')

  // English pass (dictionary coverage of the new surfaces).
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.goto(`${BASE_URL}/assignments`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('assigned-to-me-item').first().waitFor({ timeout: 15000 })
  const tabText = await page.getByRole('tablist').textContent()
  ok(!/[一-鿿]/.test(tabText || '') && /Assigned to me/.test(tabText || ''), `English tabs have no Chinese (${tabText})`)
  const uiText = await page.locator('main').evaluate((m) => [...m.querySelectorAll('button,h1,h2,h3,p,[role=tab]')].map((e) => e.textContent).join('|'))
  const cjk = uiText.split('|').filter((s) => /[一-鿿]/.test(s) && !/確認報價單|小安|準備週會簡報|阿哲|整理客戶名單|這週排不進來|Huddle 團隊/.test(s))
  ok(cjk.length === 0, `English /assignments has no untranslated UI strings${cjk.length ? ' → ' + cjk.slice(0, 5).join(' / ') : ''}`)
  await shot(page, 'assignments-en-1280.png')
  await page.goto(`${BASE_URL}/org`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('org-members').waitFor({ timeout: 15000 })
  const orgText = await page.locator('main').evaluate((m) => [...m.querySelectorAll('button,h1,h2,h3,p')].map((e) => e.textContent).join('|'))
  const orgCjk = orgText.split('|').filter((s) => /[一-鿿]/.test(s) && !/小安|阿哲|Huddle 團隊|我|整理客戶名單|更新官網價格頁/.test(s))
  ok(orgCjk.length === 0, `English /org has no untranslated UI strings${orgCjk.length ? ' → ' + orgCjk.slice(0, 5).join(' / ') : ''}`)
  await shot(page, 'org-en-1280.png')
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))

  // ── 390 (same login) ──
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE_URL}/assignments`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('assigned-to-me-item').first().waitFor({ timeout: 15000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(overflow <= 1, `390 /assignments has no horizontal overflow (${overflow}px)`)
  const small = await page.evaluate(() => [...document.querySelectorAll('main button, main [role=tab]')].filter((b) => b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 44).map((b) => b.textContent?.trim()))
  ok(small.length === 0, `390 /assignments touch targets ≥44px${small.length ? ' → ' + small.join(',') : ''}`)
  await shot(page, 'assignments-mine-390.png')
  await page.goto(`${BASE_URL}/org`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('org-members').waitFor({ timeout: 15000 })
  const overflowOrg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(overflowOrg <= 1, `390 /org has no horizontal overflow (${overflowOrg}px)`)
  const smallOrg = await page.evaluate(() => [...document.querySelectorAll('main button')].filter((b) => b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 44).map((b) => b.textContent?.trim()))
  ok(smallOrg.length === 0, `390 /org touch targets ≥44px${smallOrg.length ? ' → ' + smallOrg.join(',') : ''}`)
  await shot(page, 'org-detail-390.png')
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const tasksTab = page.getByRole('tab', { name: '任務', exact: true })
  if (await tasksTab.count()) await tasksTab.first().click().catch(() => {})
  await page.waitForTimeout(1000)
  ok(await page.getByTestId('assigned-to-me-section').isVisible().catch(() => false), '390 task tab shows the 指派給我 section')
  await shot(page, 'board-390.png')
  const row = page.getByTestId('assigned-to-me-section').getByText('確認報價單')
  if (await row.count()) {
    await row.first().click()
    await page.getByTestId('task-assign-button').waitFor({ timeout: 8000 }).catch(() => {})
    await shot(page, 'modal-assignee-390.png')
    await page.getByTestId('task-assign-button').click()
    await page.getByTestId('task-assign-popover').waitFor({ timeout: 5000 })
    const pb = await page.getByTestId('task-assign-popover').boundingBox()
    ok(!!pb && pb.x >= 0 && pb.x + pb.width <= 390, `390 popover fits the viewport (${Math.round(pb?.x)}..${Math.round((pb?.x ?? 0) + (pb?.width ?? 0))})`)
    await shot(page, 'modal-assignee-popover-390.png')
    await closeDialogs(page)
  }
  const own = page.locator('[data-tour="task-row"]:visible', { hasText: '整理客戶名單' }).first()
  if (await own.count()) {
    await own.scrollIntoViewIfNeeded()
    await own.click()
    await page.getByTestId('task-assign-button').click()
    await page.getByTestId('task-assign-popover').waitFor({ timeout: 5000 })
    await shot(page, 'modal-owner-popover-390.png')
    await closeDialogs(page)
  }

  const realWrites = state.writes.filter((x) => !x.url.includes('4444444'))
  ok(realWrites.length === 0, `no task writes to real rows (${realWrites.map((x) => x.method + ' ' + x.url).join(' ; ')})`)
  ok(pageErrors.length === 0, `no page errors${pageErrors.length ? ' → ' + pageErrors.slice(0, 3).join(' | ') : ''}`)
  await browser.close()
  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} — screenshots in ${SHOT_DIR}`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
