#!/usr/bin/env node
/**
 * Assign-on-create + assignee field lock (mocked RPCs; zero DB writes).
 *
 *   BASE_URL=http://localhost:3100 SHOT_DIR=... node scripts/e2e/assign-on-create-verify.mjs
 *
 * Checks:
 *  1. Create modal: pick someone → staged only (no RPC); save → the task
 *     INSERT goes out first, then assign_task with the new task id.
 *  2. Recurrence and assignee are mutually exclusive (button hides, staged
 *     pick is cleared with a one-line notice).
 *  3. Assignee opens someone else's task → title / description / urgency /
 *     recurrence controls are disabled, schedule stays editable, lock hint shown;
 *     saving sends only schedule columns.
 * All tasks writes and assignment RPCs are intercepted (nothing reaches the DB).
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const loadEnv = (f) => !existsSync(f) ? {} : Object.fromEntries(readFileSync(f, 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const env = { ...loadEnv('.env.e2e.local'), ...process.env }
const BASE = env.BASE_URL || 'http://localhost:3100'
const SHOT = env.SHOT_DIR || path.join(process.cwd(), 'tmp-assign-v2')
mkdirSync(SHOT, { recursive: true })
let failures = 0
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`); if (!c) failures++ }

const PEER = '11111111-1111-4111-8111-111111111111'
const FOREIGN = '44444444-4444-4444-8444-444444444443'
const today = new Date().toLocaleDateString('sv-SE')
const log = [] // ordered network events we care about
let me = null

function row(over) {
  return {
    id: over.id, user_id: over.user_id, workspace_id: '55555555-5555-4555-8555-555555555555', category_id: '66666666-6666-4666-8666-666666666666',
    title: over.title, description: '只有指派人能改的描述', task_type: 'one_time', urgency: 6, estimated_minutes: 60, actual_minutes: null,
    due_date: today, scheduled_date: today, scheduled_start_time: '10:00:00', scheduled_end_time: '11:00:00', calendar_color: '#E1755A',
    is_completed: false, completed_at: null, is_archived: false, archived_at: null, notes: '備註', sort_order: 0, is_recurring: false,
    recurrence_type: null, recurrence_interval: null, recurrence_days_of_week: null, recurrence_end_date: null, google_event_id: null,
    show_in_task_list: true, is_meeting: false, attendees: null, location: null, meeting_url: null, exdates: [], parent_id: null,
    assignee_id: over.assignee_id, organization_id: null, assignment_status: 'active', return_note: null, assigned_at: new Date().toISOString(),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
}

async function routes(page) {
  // Predicate, not a glob: an INSERT hits /rest/v1/tasks with NO query
  // string, which a `tasks?*` glob silently misses (it then reaches the DB).
  await page.route((u) => u.pathname.endsWith('/rest/v1/tasks'), async (route) => {
    const req = route.request()
    if (req.method() !== 'GET') {
      const body = req.postData() || ''
      log.push({ kind: `tasks:${req.method()}`, body, t: Date.now() })
      const id = new URL(req.url()).searchParams.get('id')?.replace('eq.', '')
      if (req.method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(id ? [{ id }] : []) })
    }
    const res = await route.fetch()
    const rows = await res.json().catch(() => [])
    const h = req.headers()['authorization'] || ''
    try { me = me || JSON.parse(Buffer.from(h.split('.')[1], 'base64url').toString()).sub } catch { /* anon */ }
    if (!me) return route.fulfill({ response: res, json: rows })
    await route.fulfill({ response: res, json: [...rows, row({ id: FOREIGN, user_id: PEER, title: '確認報價單', assignee_id: me })] })
  })
  await page.route('**/rest/v1/rpc/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const body = route.request().postData() || ''
    if (name === 'get_assignable_people') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ user_id: PEER, display_name: '小安', avatar_url: null, source: 'share', org_id: null, org_name: null }]) })
    }
    if (name === 'list_task_assignments') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ task_id: FOREIGN, role: 'assignee', peer_id: PEER, peer_name: '小安', peer_avatar: null, status: 'active', return_note: null, organization_id: null, organization_name: null, assigned_at: null, title: '確認報價單', is_completed: false, completed_at: null, scheduled_date: today, due_date: today }]) })
    }
    if (['assign_task', 'unassign_task', 'return_task'].includes(name)) {
      log.push({ kind: `rpc:${name}`, body, t: Date.now() })
      return route.fulfill({ status: 204, body: '' })
    }
    return route.continue()
  })
}
const closeDialogs = async (page) => {
  for (let i = 0; i < 6 && (await page.getByRole('dialog').count()) > 0; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250) }
}
const shot = (page, n) => page.screenshot({ path: path.join(SHOT, n) })

async function openCreateModal(page) {
  // Drag an empty stretch of the day timeline → pick a workspace slot type.
  const panel = page.locator('[data-tour="calendar-panel"]')
  const box = await panel.boundingBox()
  const x = box.x + box.width * 0.6
  for (const frac of [0.55, 0.7, 0.4, 0.85]) {
    const y = box.y + box.height * frac
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 40, { steps: 5 }); await page.mouse.move(x, y + 80, { steps: 5 }); await page.mouse.up()
    const ws = page.getByRole('button').filter({ hasText: /新增任務到「/ }).first()
    if (await ws.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ws.click()
      return true
    }
    await page.keyboard.press('Escape')
  }
  return false
}

async function main() {
  const browser = await browser_()
  async function browser_() { return chromium.launch() }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW' })
  await ctx.addInitScript(() => {
    const s = document.createElement('style'); s.textContent = 'nextjs-portal,[data-pet-adopt]{display:none!important}'
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s))
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await routes(page)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(env.E2E_EMAIL)
  await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE}/`, { timeout: 30000 })
  await page.getByRole('button', { name: '日檢視' }).click().catch(() => {})
  await page.waitForTimeout(2000)

  // ── 1+2. Create modal ──
  ok(await openCreateModal(page), 'opened the create-task modal from the calendar')
  const btn = page.getByTestId('task-assign-button')
  await btn.waitFor({ timeout: 8000 })
  ok(true, 'create modal shows the small assign button')
  await page.getByPlaceholder('輸入任務標題…').fill('e2e 建立即指派')
  await btn.click()
  await page.getByRole('option', { name: /小安/ }).click()
  await page.waitForTimeout(300)
  ok((await btn.getAttribute('aria-label'))?.includes('建立後指派給 小安'), 'picking only stages the choice (button shows the pick)')
  ok(!log.some((e) => e.kind === 'rpc:assign_task'), 'no assign_task RPC before save')
  await shot(page, 'create-staged-1280.png')
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500)
  const bb = await btn.boundingBox()
  ok(!!bb && bb.width >= 44 && bb.height >= 44, `390 assign button hit area ≥44 (${bb?.width}×${bb?.height})`)
  await shot(page, 'create-staged-390.png')
  await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(500)

  const recur = page.getByRole('button', { name: '重複設定' })
  await recur.scrollIntoViewIfNeeded(); await recur.click(); await page.waitForTimeout(300)
  ok(await page.getByTestId('task-assign-button').count() === 0, 'recurrence on → assign button hidden')
  ok((await page.getByTestId('assign-notice').textContent().catch(() => ''))?.includes('重複任務無法指派'), 'staged pick cleared with a one-line notice')
  await shot(page, 'create-recurring-clears-1280.png')
  await recur.click(); await page.waitForTimeout(300)
  ok(!((await page.getByTestId('task-assign-button').getAttribute('aria-label')) || '').includes('小安'), 'recurrence off → button back, previous pick not silently restored')
  await page.getByTestId('task-assign-button').click()
  await page.getByRole('option', { name: /小安/ }).click()
  await page.getByRole('button', { name: '建立任務' }).click()
  for (let i = 0; i < 20 && !log.some((e) => e.kind === 'rpc:assign_task'); i++) await page.waitForTimeout(250)
  const ins = log.findIndex((e) => e.kind === 'tasks:POST' && e.body.includes('e2e 建立即指派'))
  const asg = log.findIndex((e) => e.kind === 'rpc:assign_task')
  ok(ins >= 0 && asg > ins, `network order: tasks INSERT (#${ins}) before assign_task (#${asg})`)
  const insertedId = ins >= 0 ? JSON.parse(log[ins].body).id ?? JSON.parse(log[ins].body)[0]?.id : null
  const asgBody = asg >= 0 ? JSON.parse(log[asg].body) : {}
  ok(!!insertedId && asgBody.p_task === insertedId && asgBody.p_assignee === PEER, 'assign_task targets the new task id and the picked person')
  ok(!log[ins]?.body.includes('assignee_id'), 'the INSERT itself carries no assignment columns')

  // ── 3. Assignee view: locked fields ──
  await closeDialogs(page)
  const sec = page.getByTestId('assigned-to-me-section')
  await sec.getByText('確認報價單').first().click()
  await page.getByTestId('assignee-lock-hint').waitFor({ timeout: 8000 })
  ok((await page.getByTestId('assignee-lock-hint').textContent()).includes('由 小安 指派'), 'lock hint names the assigner')
  const dlg = page.getByRole('dialog')
  ok(await dlg.getByPlaceholder('任務名稱').isDisabled(), 'title input disabled')
  ok(await dlg.getByPlaceholder('添加任務描述...').isDisabled(), 'description textarea disabled')
  ok(await dlg.getByRole('button', { name: '重複設定' }).isDisabled(), 'recurrence toggle disabled')
  ok(await dlg.getByRole('button', { name: '標記為會議' }).isDisabled().catch(async () => (await dlg.locator('button[aria-pressed]').filter({ hasText: '標記為會議' }).isDisabled())), 'meeting toggle disabled')
  ok(!(await dlg.getByRole('button', { name: '今天', exact: true }).isDisabled()), 'schedule controls stay editable')
  await shot(page, 'assignee-locked-1280.png')
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500)
  await shot(page, 'assignee-locked-390.png')
  await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(300)
  const before = log.length
  await dlg.getByRole('button', { name: '明天', exact: true }).click()
  await dlg.getByRole('button', { name: '儲存' }).click()
  for (let i = 0; i < 20 && !log.slice(before).some((e) => e.kind === 'tasks:PATCH'); i++) await page.waitForTimeout(250)
  const patch = log.slice(before).find((e) => e.kind === 'tasks:PATCH')
  const keys = patch ? Object.keys(JSON.parse(patch.body)).sort() : []
  ok(!!patch && keys.length > 0 && keys.every((k) => k.startsWith('scheduled_')), `assignee save sends only schedule columns (${keys.join(',')})`)

  ok(errors.length === 0, `no page errors${errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''}`)
  await browser.close()
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
  process.exit(failures ? 1 : 0)
}
main().catch((e) => { console.error('ERROR', e); process.exit(1) })
