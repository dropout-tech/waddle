// Meeting polish (feat/meeting-polish): A prefill from calendar, B "全部加入", C task -> source
// meeting, D "等對方的事" list, E done-state badges, plus 390px and English checks.
//
//   node scripts/e2e/meeting-polish-verify.mjs        (needs `pnpm build:web` first; E2E_DEV=1 uses next dev)
//
// Real test-account login (read only). Everything else is mocked: workspaces / categories / tasks
// reads, the two new RPCs, the meeting-import and google-calendar Edge Functions. Any REST write
// is swallowed and counted; the script asserts there were none.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import path from 'node:path'

const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const PORT = process.env.E2E_PORT || '3173'
const BASE = `http://localhost:${PORT}`
const SHOTS = process.env.SHOTS_DIR || path.join(process.cwd(), 'scripts/e2e/shots/meeting-polish')
mkdirSync(SHOTS, { recursive: true })
const server = spawn('node', ['node_modules/next/dist/bin/next', process.env.E2E_DEV ? 'dev' : 'start', '-p', PORT], { stdio: 'ignore' })

let pass = 0
const ok = (cond, msg) => { assert(cond, msg); pass++; console.log(`PASS: ${msg}`) }
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); pass++; console.log(`PASS: ${msg}`) }
const cjk = /[㐀-鿿]/

const TZ = 'Asia/Taipei'
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const DAY = 86400000
const today = ymd(new Date()), yesterday = ymd(new Date(Date.now() - DAY)), in3 = ymd(new Date(Date.now() + 3 * DAY))
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const WS = id(1), CAT = id(2), PEER = id(3), TASK = id(4), MEETING = id(5)
const OWN_DONE = id(10), OWN_OPEN = id(11), OWN_GONE = id(12)
const F_LATE = id(20), F_SOON = id(21), F_NONE = id(22)

const state = { rpcMissing: false, imports: [], writes: 0, listCalls: 0, followupCalls: 0, sourceCalls: [] }
const mkMeeting = () => ({
  id: MEETING, title: '測試驗收會議', meeting_date: '2026-09-25', status: 'succeeded', created_at: new Date().toISOString(),
  context: { meetingTime: '14:30', purpose: '確認驗收', participants: [{ id: 'p1', name: '測試本人', organization: '', aliases: [], userId: '', side: 'ours' }], categoryId: CAT, autoSelf: true },
  checklist: {}, assignments: [{ id: id(30), source_index: 2, recipient_id: PEER, status: 'pending' }],
  imported_tasks: { 0: OWN_DONE, 1: OWN_OPEN, 4: OWN_GONE },
  result: {
    summary: '確認驗收與後續報價。', decisions: ['先完成驗收。'], questions: ['期限待確認。'],
    tasks: ['核對驗收清單', '更新報價', '請小林準備報價', '追 王經理：提供報價單', '已被刪掉的任務'].map((title, i) => ({
      title, owner: '', dueDate: '', source: '原文 ' + i, ownerParticipantId: '', assignmentConfidence: 'uncertain', assignmentReason: '待確認', ...(i === 3 ? { followUp: true, ownerSide: 'theirs', owner: '王經理' } : {}),
    })),
  },
})
let meetings = [mkMeeting()]

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW', timezoneId: TZ })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
if (process.env.DEBUG_E2E) page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 300)) })
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

await context.addInitScript(() => {
  localStorage.setItem('waddle.waterReminder.enabled', '0')
  localStorage.setItem('waddle-language-v1', sessionStorage.getItem('e2e-en') ? 'en' : 'zh-TW')
  const add = () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}[data-pet-adopt]{display:none!important}'; document.head.appendChild(s) }
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add)
})

// Google Calendar overlay (status + one event today, 15:00 Taipei).
const GCAL_START = `${today}T15:00:00+08:00`, GCAL_END = `${today}T16:00:00+08:00`
await context.route((u) => u.pathname.endsWith('/functions/v1/google-calendar'), async (route) => {
  const req = route.request()
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors, body: 'ok' })
  const b = JSON.parse(req.postData() || '{}')
  const reply = (d, status = 200) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
  if (b.action === 'status') return reply({ configured: true, connected: true, status: 'connected', share_busy: false })
  if (b.action === 'events') return reply({ status: 'connected', events: [{ id: 'g1', title: 'GCAL 客戶週會', start: GCAL_START, end: GCAL_END, all_day: false, location: null, response_status: 'accepted', html_link: 'https://www.google.com/calendar/event?eid=g1' }], truncated: false })
  return reply({ error: 'invalid_action' }, 400)
})

// REST: fabricate the board, mock the new RPCs, swallow writes.
await context.route('**/rest/v1/**', async (route) => {
  const req = route.request(), url = new URL(req.url()), p = url.pathname, table = p.split('/').pop()
  if (req.method() === 'OPTIONS') return route.continue()
  const bearer = (req.headers().authorization || '').replace(/^Bearer /, '')
  try { const sub = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).sub; if (sub) state.uid = sub } catch {}
  if (p.includes('/rpc/')) {
    if (table === 'get_task_meeting_source') {
      if (state.rpcMissing) return route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'function not found' } })
      const b = req.postDataJSON(); state.sourceCalls.push(b.p_task_id)
      return route.fulfill({ json: b.p_task_id === TASK ? [{ import_id: MEETING, title: '測試驗收會議', meeting_date: '2026-09-25' }] : [] })
    }
    if (table === 'list_meeting_followups') {
      state.followupCalls++
      if (state.rpcMissing) return route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'function not found' } })
      assert.equal(req.postDataJSON().p_include_done, false)
      return route.fulfill({ json: [
        { task_id: F_LATE, title: '提供報價單', due_date: yesterday, is_completed: false, counterpart: '王經理', import_id: MEETING, meeting_title: '測試驗收會議', meeting_date: '2026-09-25' },
        { task_id: F_SOON, title: '回覆合約修改', due_date: in3, is_completed: false, counterpart: '李小姐', import_id: MEETING, meeting_title: '測試驗收會議', meeting_date: '2026-09-25' },
        { task_id: F_NONE, title: '確認場地', due_date: null, is_completed: false, counterpart: null, import_id: MEETING, meeting_title: '測試驗收會議', meeting_date: '2026-09-25' },
      ] })
    }
    return route.continue()
  }
  if (req.method() !== 'GET' && req.method() !== 'HEAD') { state.writes++; return route.fulfill({ status: 201, json: [] }) }
  if (table === 'workspaces') return route.fulfill({ json: [{ id: WS, user_id: id(99), name: '工作', color: '#9BBFAC', icon: 'folder', sort_order: 0, is_archived: false, is_default: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }] })
  if (table === 'categories') return route.fulfill({ json: [{ id: CAT, workspace_id: WS, user_id: id(99), name: '待辦', sort_order: 0, is_collapsed: false, is_archived: false, is_default: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }] })
  if (table === 'tasks') {
    const f = url.searchParams.get('id')
    if (f && f.startsWith('in.')) {
      const wanted = f.slice(3).replace(/[()"]/g, '').split(',')
      state.doneQuery = wanted
      return route.fulfill({ json: [{ id: OWN_DONE, is_completed: true }, { id: OWN_OPEN, is_completed: false }, { id: id(43), is_completed: false }].filter((r) => wanted.includes(r.id)) })
    }
    return route.fulfill({ json: [{
      id: TASK, user_id: state.uid || id(99), workspace_id: WS, category_id: CAT, title: '康庭專案週會', description: null, task_type: 'one_time', urgency: 3, estimated_minutes: 60, actual_minutes: null,
      due_date: null, scheduled_date: today, scheduled_start_time: '10:00', scheduled_end_time: '11:00', calendar_color: '#9BBFAC', is_completed: false, completed_at: null, is_archived: false, archived_at: null,
      notes: null, sort_order: 0, is_recurring: false, recurrence_type: null, recurrence_interval: null, recurrence_days_of_week: null, recurrence_end_date: null, google_event_id: null,
      show_in_task_list: true, is_meeting: true, attendees: 'Alice、Bob, Carol', location: null, meeting_url: null, exdates: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }] })
  }
  if (['time_blocks', 'slot_types', 'scratchpad_items'].includes(table)) return route.fulfill({ json: [] })
  return route.continue() // user_settings & friends: real read
})

await context.route('**/functions/v1/meeting-import', async (route) => {
  const b = route.request().postDataJSON()
  if (b.action === 'directory') return route.fulfill({ json: { peers: [{ peer_id: PEER, display_name: '共享夥伴小林' }] } })
  if (b.action === 'inbox') return route.fulfill({ json: { assignments: [] } })
  if (b.action === 'list') { state.listCalls++; return route.fulfill({ json: { meetings, used: 1, pending: 0, limit: 20, month: '2026-10-01', enabled: true } }) }
  if (b.action === 'import') {
    state.imports.push(b)
    for (const t of b.tasks) { meetings[0].checklist[t.index] = t; if (t.assigneeId && t.assigneeId !== PEER) meetings[0].imported_tasks[t.index] = id(40 + t.index) }
    return route.fulfill({ json: { importedTasks: meetings[0].imported_tasks, checklist: meetings[0].checklist } })
  }
  throw new Error('Unexpected action ' + b.action)
})

const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
// Wait out every finite animation / transition (drawer slide-in, popover fade) before a screenshot.
const settle = async () => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime)).map((a) => a.finished.catch(() => {}))))
  await page.waitForTimeout(250)
}
const shot = async (name) => { await settle(); await page.screenshot({ path: `${SHOTS}/${name}.png` }) }
const inView = async (loc) => { const b = await loc.boundingBox(); const vp = page.viewportSize(); return !!b && b.y >= 0 && b.y + b.height <= vp.height && b.x >= 0 && b.x + b.width <= vp.width }
const meetingForm = () => ({ title: page.getByLabel('會議名稱', { exact: true }), date: page.getByLabel('會議日期', { exact: true }) })

try {
  let ready = false
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/login`)).ok) { ready = true; break } } catch {} await new Promise((r) => setTimeout(r, 500)) }
  assert(ready, 'server did not start')
  await page.goto(`${BASE}/login?method=email`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type=submit]').click(); await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000 })

  // ── A (meeting task) + C (source link): task detail from the board ──
  await page.goto(`${BASE}/?widget=tasks&task=${TASK}`)
  const drawer = page.getByRole('dialog', { name: '任務詳情' })
  await drawer.waitFor({ timeout: 60000 })
  const source = drawer.getByTestId('meeting-source-link')
  await source.waitFor({ timeout: 15000 })
  eq((await source.innerText()).trim(), '來自會議：測試驗收會議（2026-09-25）', 'C: task detail shows 來自會議 line')
  eq(await source.getAttribute('href'), `/meetings?import=${MEETING}`, 'C: source link points at /meetings?import=<id>')
  ok((await source.boundingBox()).height >= 44, 'C: source link touch target >= 44px')
  const organize = drawer.getByTestId('organize-meeting')
  const orgHref = new URL(await organize.getAttribute('href'), BASE)
  eq([orgHref.pathname, orgHref.searchParams.get('title'), orgHref.searchParams.get('date'), orgHref.searchParams.getAll('p')], ['/meetings', '康庭專案週會', today, ['Alice', 'Bob', 'Carol']], 'A: 整理這場會議 link carries title, date, attendees split into names')
  await settle()
  const dbox = await drawer.boundingBox()
  ok(Math.abs(dbox.x + dbox.width - 1280) <= 1 && Number(await drawer.evaluate((el) => getComputedStyle(el).opacity)) === 1, 'drawer fully slid in (right edge at viewport edge, opacity 1) before the screenshot')
  await shot('task-detail-desktop')
  await organize.scrollIntoViewIfNeeded(); await shot('task-detail-organize-button')
  await organize.click(); await page.waitForURL(/\/meetings/)
  await page.getByLabel('會議名稱', { exact: true }).waitFor()
  eq(await meetingForm().title.inputValue(), '康庭專案週會', 'A: meeting title prefilled from task')
  eq(await meetingForm().date.inputValue(), today, 'A: meeting date prefilled from task')
  eq([await page.getByLabel('與會者 1 姓名').inputValue(), await page.getByLabel('與會者 2 姓名').inputValue(), await page.getByLabel('與會者 3 姓名').inputValue()], ['Alice', 'Bob', 'Carol'], 'A: attendees split into 3 participants')
  const grp = page.getByRole('group', { name: '與會者 1 立場' })
  eq(await grp.getByRole('button', { name: '我方' }).getAttribute('aria-pressed'), 'true', 'A: participant side keeps the default (我方)')
  eq(await page.evaluate(() => location.search), '', 'A: URL params cleared after prefill')
  await meetingForm().title.fill('我改過的標題')
  await page.reload(); await page.getByLabel('會議名稱', { exact: true }).waitFor()
  eq(await meetingForm().title.inputValue(), '', 'A: reload does not re-apply the prefill')

  // Prefill screenshots (desktop + 390), scrolled to the form itself. The date is deliberately not
  // today, so the reload shot shows what a refresh does to each field.
  const PRE = '2026-09-25'
  const prefillUrl = `${BASE}/meetings?title=${encodeURIComponent('康庭專案週會')}&date=${PRE}&p=Alice&p=Bob`
  await page.goto(prefillUrl)
  await page.getByLabel('與會者 2 姓名').waitFor()
  const toForm = () => meetingForm().title.evaluate((el) => { el.scrollIntoView({ block: 'start' }); el.closest('main').scrollBy(0, -56) })
  await toForm()
  eq([await meetingForm().title.inputValue(), await meetingForm().date.inputValue(), await page.getByLabel('與會者 1 姓名').inputValue()], ['康庭專案週會', PRE, 'Alice'], 'A: prefilled values visible in the form')
  await shot('prefill-desktop')
  await page.setViewportSize({ width: 390, height: 844 }); await toForm()
  ok(await inView(meetingForm().title) && await inView(meetingForm().date), 'A: mobile viewport shows title and date fields')
  await shot('prefill-mobile')
  await page.getByLabel('與會者 1 姓名').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  ok(await inView(page.getByLabel('與會者 1 姓名')), 'A: mobile viewport shows the prefilled participant fields')
  await shot('prefill-mobile-participants')
  ok(!(await overflow()), 'A: no horizontal overflow at 390px (prefilled form)')
  await page.setViewportSize({ width: 1280, height: 900 })
  // Refresh: the params were already removed from the URL, so the form is back to its defaults:
  // empty title / no participants, and the date field is today (its normal default, not the prefilled one).
  await page.reload(); await page.getByLabel('會議名稱', { exact: true }).waitFor()
  await toForm()
  eq([await meetingForm().title.inputValue(), await meetingForm().date.inputValue(), await page.getByLabel('與會者 1 姓名').count()], ['', today, 0], 'A: after reload the form is blank: title empty, date back to today (not 2026-09-25), no participants')
  await shot('prefill-after-reload')

  // C: follow the link from the task detail
  await page.goto(`${BASE}/?widget=tasks&task=${TASK}`)
  await drawer.getByTestId('meeting-source-link').click(); await page.waitForURL(/\/meetings/)
  await page.getByRole('heading', { level: 2, name: '測試驗收會議' }).waitFor({ timeout: 15000 })
  ok(await page.getByRole('region', { name: '整理結果' }).isVisible(), 'C: link opens the record straight in the result view')
  eq(await page.evaluate(() => location.search), '', 'C: import param cleared from URL')

  // ── E: done state of imported tasks; B: 全部加入 ──
  await page.getByTestId('done-badge').first().waitFor()
  const states = await page.getByTestId('done-badge').evaluateAll((els) => els.map((e) => [e.dataset.state, e.textContent.trim()]))
  eq(states, [['done', '已完成'], ['open', '尚未完成'], ['gone', '任務已不存在']], 'E: own imported tasks show 已完成 / 尚未完成 / 任務已不存在')
  ok(state.doneQuery.sort().join() === [OWN_DONE, OWN_OPEN, OWN_GONE].sort().join(), 'E: only my own imported task ids were queried (peer assignment not read)')
  ok(await page.getByText('已送出，等待接受', { exact: true }).isVisible(), 'E: peer-assigned item keeps its waiting label')
  eq(await page.locator('[data-testid="done-badge"]').count(), 3, 'E: no done badge on the peer-assigned item')
  const addAll = page.getByTestId('add-all')
  ok((await addAll.innerText()).startsWith('全部加入'), 'B: button reads 全部加入')
  ok(await addAll.isEnabled(), 'B: 全部加入 enabled with the unprocessed item pre-checked')
  eq(state.imports.length, 0, 'B: nothing was written before the button press (no auto-import)')
  ok((await addAll.boundingBox()).height >= 44, 'B: button >= 44px tall')
  eq((await addAll.innerText()).replace(/\s+/g, ' '), '全部加入（1 項）', 'B: label reads 全部加入（1 項） with no stray space')
  await addAll.scrollIntoViewIfNeeded(); await shot('add-all-desktop')
  await page.getByRole('checkbox', { name: '選取任務 4' }).uncheck()
  ok(await addAll.isDisabled(), 'B: unticking every item disables the button (individual items can be skipped)')
  await page.getByRole('checkbox', { name: '選取任務 4' }).check()
  await page.getByLabel('任務 4 指派給', { exact: true }).selectOption({ label: '我' })
  await addAll.click()
  await page.getByText('已儲存 checklist', { exact: false }).waitFor()
  eq([state.imports.length, state.imports[0].tasks.map((t) => t.index)], [1, [3]], 'B: one click sent exactly the ticked item')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTestId('done-badge').first().scrollIntoViewIfNeeded(); await shot('record-done-mobile')
  await page.getByTestId('add-all').scrollIntoViewIfNeeded().catch(() => {})
  ok(!(await overflow()), 'E/B: no horizontal overflow at 390px (record view)')
  await page.setViewportSize({ width: 1280, height: 900 })

  // ── D: follow-up list ──
  await page.goto(`${BASE}/meetings`)
  const fu = page.getByTestId('followups'); await fu.waitFor({ timeout: 15000 })
  eq(await page.getByTestId('followup-item').count(), 3, 'D: 3 follow-ups listed')
  const items = await page.getByTestId('followup-item').allInnerTexts()
  ok(items[0].includes('王經理') && items[0].includes('提供報價單') && items[0].includes('已過期') && items[0].includes(yesterday), 'D: overdue item shows counterpart, title and 已過期 label')
  ok(items[1].includes('李小姐') && items[1].includes(`期限 ${in3}`) && !items[1].includes('已過期'), 'D: future item shows its due date, not marked overdue')
  ok(items[2].includes('沒有期限') && items[2].includes('來自「測試驗收會議」'), 'D: undated item and meeting source shown')
  eq(await fu.getByRole('link', { name: '開啟任務' }).first().getAttribute('href'), `/?widget=tasks&task=${F_LATE}`, 'D: 開啟任務 link opens the task')
  ok((await fu.getByRole('link', { name: '開啟任務' }).first().boundingBox()).height >= 44, 'D: row actions >= 44px')
  await shot('followups-desktop')
  await fu.getByRole('button', { name: '看會議紀錄' }).nth(1).click()
  await page.getByRole('heading', { level: 2, name: '測試驗收會議' }).waitFor()
  ok(true, 'D: 看會議紀錄 opens the source record')
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await fu.waitFor()
  await fu.scrollIntoViewIfNeeded(); await settle()
  const act = async (name) => Promise.all((await fu.getByRole(name === '開啟任務' ? 'link' : 'button', { name }).all()).map((l) => l.boundingBox()))
  const openBoxes = await act('開啟任務'), viewBoxes = await act('看會議紀錄')
  ok([...openBoxes, ...viewBoxes].every((b) => b.height >= 44 && b.width >= 44), 'D: 390px row actions are >= 44x44px')
  eq([new Set(openBoxes.map((b) => Math.round(b.x))).size, new Set(viewBoxes.map((b) => Math.round(b.x))).size], [1, 1], 'D: 390px action buttons line up in the same columns on every row')
  const txt = await fu.innerText()
  ok(!/」\s*·\s*(\n|$)/.test(txt), 'D: no dangling separator dot after the meeting name')
  await shot('followups-mobile'); ok(!(await overflow()), 'D: no horizontal overflow at 390px (follow-ups)')
  await page.setViewportSize({ width: 1280, height: 900 })

  // ── A (Google event) on the board ──
  await page.goto(`${BASE}/`)
  await page.getByRole('button', { name: '週檢視' }).click()
  const gev = page.locator('[data-google-event]', { hasText: 'GCAL 客戶週會' }).first()
  await gev.waitFor({ timeout: 30000 }); await gev.click()
  const link = page.getByTestId('organize-google-meeting'); await link.waitFor()
  const gh = new URL(await link.getAttribute('href'), BASE)
  eq([gh.pathname, gh.searchParams.get('title'), gh.searchParams.get('date'), gh.searchParams.getAll('p')], ['/meetings', 'GCAL 客戶週會', today, []], 'A: Google event button carries title + date only (no attendees)')
  const pop = page.locator('[data-google-event-details]')
  await settle()
  eq(Number(await pop.evaluate((el) => getComputedStyle(el).opacity)), 1, 'google popover fully opaque before the screenshot')
  await shot('google-popover')
  await link.click(); await page.waitForURL(/\/meetings/); await meetingForm().title.waitFor()
  eq([await meetingForm().title.inputValue(), await meetingForm().date.inputValue()], ['GCAL 客戶週會', today], 'A: Google event prefilled the meeting form')

  // ── RPCs not deployed: silent degrade ──
  state.rpcMissing = true
  await page.goto(`${BASE}/meetings`); await page.getByLabel('會議名稱', { exact: true }).waitFor()
  eq(await page.getByTestId('followups').count(), 0, 'D: follow-up block hidden when the RPC is missing')
  ok(!(await page.locator('main p[role=alert]').count()), 'D: no error banner when the RPC is missing')
  await page.goto(`${BASE}/?widget=tasks&task=${TASK}`); await drawer.waitFor({ timeout: 60000 })
  eq(await drawer.getByTestId('meeting-source-link').count(), 0, 'C: no source line when the RPC is missing')
  state.rpcMissing = false

  // ── English ──
  meetings = [mkMeeting()]
  await page.evaluate(() => sessionStorage.setItem('e2e-en', '1'))
  await page.goto(`${BASE}/meetings`)
  await fu.waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: /Test|測試驗收會議/ }).first().click()
  await page.getByTestId('add-all').waitFor()
  const text = async (loc) => (await loc.innerText())
  const enChunks = [await text(fu), await text(page.getByTestId('add-all')), await text(page.getByTestId('add-all').locator('xpath=preceding-sibling::p[1]'))]
  await page.getByTestId('done-badge').first().waitFor()
  const badges = await page.getByTestId('done-badge').allInnerTexts()
  console.log('EN follow-ups:', JSON.stringify(enChunks[0].slice(0, 160)), '| badges:', JSON.stringify(badges))
  ok(enChunks.every((x) => !cjk.test(x.replace(/王經理|李小姐|測試驗收會議|提供報價單|回覆合約修改|確認場地/g, ''))), 'EN: follow-ups / add-all copy has no Chinese residue (user data excluded)')
  eq(badges, ['Completed', 'Not done yet', 'Task no longer exists'], 'EN: done badges translated')
  eq((await text(page.getByTestId('add-all'))).replace(/\s+/g, ' '), 'Add all (1)', 'EN: add-all label spacing')
  ok(enChunks[0].includes('Waiting on others') && enChunks[0].includes('Overdue') && enChunks[1].startsWith('Add all'), 'EN: expected English strings present')
  await shot('english-meetings')
  await page.goto(`${BASE}/?widget=tasks&task=${TASK}`)
  const drawerEn = page.getByRole('dialog', { name: 'Task details' }).or(page.getByRole('dialog')).first()
  await drawerEn.getByTestId('meeting-source-link').waitFor({ timeout: 60000 })
  const srcEn = await drawerEn.getByTestId('meeting-source-link').innerText(), orgEn = await drawerEn.getByTestId('organize-meeting').innerText()
  console.log('EN task detail:', JSON.stringify([srcEn, orgEn]))
  ok(srcEn.startsWith('From meeting:') && orgEn.trim() === 'Organize this meeting', 'EN: task-detail source line and button translated')
  await shot('english-task-detail')

  eq(state.writes, 0, 'no REST write was attempted')
  eq(errors, [], 'no page errors')
  console.log(`PASS: all ${pass} assertions`)
} catch (e) {
  console.log('FAIL:', e.message)
  await page.screenshot({ path: `${SHOTS}/FAIL.png` }).catch(() => {})
  process.exitCode = 1
} finally { await browser.close(); server.kill() }
