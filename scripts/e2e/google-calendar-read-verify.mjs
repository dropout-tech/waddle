// Read-only Google Calendar overlay + settings page (feat/google-calendar-read).
//   BASE_URL=http://localhost:3147 node scripts/e2e/google-calendar-read-verify.mjs
// Logs in ONCE with test account A (.env.e2e.local). The google-calendar Edge
// Function is fully mocked with page routing (status / events), so nothing is
// sent to Google or written anywhere; the script performs no data writes.
import { chromium } from 'playwright'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:3147'
const SHOTS = process.env.SHOT_DIR || path.join(process.cwd(), 'scripts/e2e/shots/gcal-read')
mkdirSync(SHOTS, { recursive: true })
const load = (f) => { const o = {}; if (!existsSync(f)) return o; for (const l of readFileSync(f, 'utf8').split('\n')) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const i = t.indexOf('='); if (i < 0) continue; let v = t.slice(i + 1).trim(); if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1); o[t.slice(0, i).trim()] = v } return o }
const env = { ...load(path.join(process.cwd(), '.env.local')), ...load(path.join(process.cwd(), '.env.e2e.local')) }
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else fail++; console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CJK = /[㐀-鿿　-〿＀-￯]/

// ── mock data (Asia/Taipei browser clock) ──
const TZ = 'Asia/Taipei'
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const today = ymd(new Date()), tomorrow = ymd(new Date(Date.now() + 86400000))
const EVENTS = [
  // 02:00Z = 10:00 in Taipei → proves the offset is converted to local time.
  { id: 'e-sync', title: 'GCAL Weekly Sync', start: `${today}T02:00:00Z`, end: `${today}T03:00:00Z`, all_day: false, location: 'Room 5', response_status: 'accepted', html_link: 'https://www.google.com/calendar/event?eid=sync' },
  { id: 'e-pending', title: 'GCAL Pending Invite', start: `${today}T14:00:00+08:00`, end: `${today}T15:00:00+08:00`, all_day: false, location: null, response_status: 'needsAction', html_link: 'https://www.google.com/calendar/event?eid=pending' },
  { id: 'e-allday', title: 'GCAL Offsite Day', start: today, end: tomorrow, all_day: true, location: null, response_status: null, html_link: 'https://www.google.com/calendar/event?eid=allday' },
  { id: 'e-late', title: 'GCAL Late Call', start: `${today}T22:30:00+08:00`, end: `${tomorrow}T01:30:00+08:00`, all_day: false, location: null, response_status: 'accepted', html_link: 'https://www.google.com/calendar/event?eid=late' },
]
const mock = { mode: 'connected', calls: [], shareBusy: true, meeting: false, busyMode: 'empty', busyWindow: null }
// Fake share partner for the 約交集 part (REST reads mocked; nothing is written).
const PEER = '00000000-0000-4000-8000-00000000e2e1'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'zh-TW', timezoneId: TZ })
  await ctx.addInitScript(() => {
    try { if (!localStorage.getItem('waddle-language-v1')) localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {}
    const css = 'nextjs-portal{display:none!important}[data-pet-adopt]{display:none!important}'
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s) }
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add)
  })
  await ctx.route((u) => u.pathname.endsWith('/functions/v1/google-calendar'), async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors, body: 'ok' })
    const body = JSON.parse(req.postData() || '{}')
    mock.calls.push({ action: body.action, mode: mock.mode, body })
    const reply = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (body.action === 'status') {
      if (mock.mode === 'unconfigured') return reply({ configured: false, connected: false, status: 'disconnected' })
      if (mock.mode === 'disconnected') return reply({ configured: true, connected: false, status: 'disconnected' })
      if (mock.mode === 'reauth') return reply({ configured: true, connected: true, status: 'reauth_required' })
      return reply({ configured: true, connected: true, status: 'connected', share_busy: mock.shareBusy })
    }
    if (body.action === 'set_share_busy') { mock.shareBusy = body.value; return reply({ share_busy: body.value }) }
    if (body.action === 'busy') {
      // Same strict window as the real function (core.mjs parseBusyRange).
      const a = Date.parse(body.time_min), z = Date.parse(body.time_max), D = 86400000
      if (!(a >= Date.now() - D && z <= Date.now() + 92 * D && z - a <= 16 * D && z > a)) { mock.badBusyWindow = (mock.badBusyWindow || 0) + 1; return reply({ error: 'invalid_range' }, 400) }
      if (mock.busyMode === 'fail') return reply({ error: 'integration_failed' }, 500)
      if (mock.busyMode === 'unavailable') return reply({ busy: [], unavailable: [PEER] })
      if (mock.busyMode === 'block') return reply({ busy: [{ user_id: PEER, start: mock.busyWindow[0], end: mock.busyWindow[1] }], unavailable: [] })
      return reply({ busy: [], unavailable: [] })
    }
    if (body.action === 'events') {
      const span = Date.parse(body.time_max) - Date.parse(body.time_min)
      if (!(span > 0 && span <= 120 * 86400000)) return reply({ error: 'invalid_range' }, 400)
      const lo = Date.parse(body.time_min), hi = Date.parse(body.time_max)
      const inRange = EVENTS.filter((e) => Date.parse(e.all_day ? e.start + 'T00:00:00+08:00' : e.start) < hi && Date.parse(e.all_day ? e.end + 'T00:00:00+08:00' : e.end) > lo)
      return reply({ status: 'connected', events: inRange, truncated: false })
    }
    return reply({ error: 'invalid_action' }, 400)
  })
  // REST reads for the fake partner (only while mock.meeting is on; otherwise real passthrough).
  const rest = (rows, status = 200) => ({ status, headers: { ...cors, 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0', 'Content-Type': 'application/json' }, body: JSON.stringify(rows) })
  await ctx.route((u) => /\/rest\/v1\/(rpc\/(get_share_peers|get_shared_meeting_busy|get_shared_calendar)|calendar_share_grants)$/.test(u.pathname), async (route) => {
    const req = route.request()
    if (!mock.meeting) return route.continue()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...cors, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }, body: 'ok' })
    const path = new URL(req.url()).pathname
    if (path.endsWith('/get_share_peers')) return route.fulfill(rest([{ share_id: 'e2e-share', peer_id: PEER, display_name: 'GCAL Peer', avatar_url: null, created_at: '2026-09-01T00:00:00Z' }]))
    if (path.endsWith('/calendar_share_grants')) return req.method() === 'GET' ? route.fulfill(rest([{ share_id: 'e2e-share', owner_id: PEER, kind: 'workspace', ref: 'e2e', detail: 'busy' }])) : route.abort()
    return route.fulfill(rest([]))
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  // ── login once ──
  await page.goto(`${BASE}/login?method=email`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor({ timeout: 120000 }); await page.waitForLoadState('networkidle').catch(() => {})
  await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('#password').press('Enter')
  await page.waitForURL(`${BASE}/`, { timeout: 120000 })
  await page.getByRole('button', { name: '週檢視' }).waitFor({ timeout: 60000 })

  const gcal = (title) => page.locator('[data-google-event]', { hasText: title })
  const closePopovers = async () => { for (let i = 0; i < 4 && (await page.locator('[data-google-event-details]').count()); i++) { await page.keyboard.press('Escape'); await sleep(200) } }

  // ── week view ──
  await page.getByRole('button', { name: '週檢視' }).click()
  await gcal('GCAL Weekly Sync').first().waitFor({ timeout: 30000 })
  ok(await gcal('GCAL Weekly Sync').first().isVisible(), 'week: Google meeting visible')
  ok((await gcal('GCAL Weekly Sync').first().innerText()).includes('10:00-11:00'), 'week: 02:00Z shown as 10:00-11:00 local (Asia/Taipei)')
  ok((await gcal('GCAL Pending Invite').first().getAttribute('data-google-event')) === 'needsAction', 'week: needsAction meeting rendered with pending style')
  ok(await page.locator('[data-google-all-day]', { hasText: 'GCAL Offsite Day' }).first().isVisible(), 'week: all-day event shown as a chip in the all-day row')
  const grid = await page.locator(`[data-day-date="${today}"]`).first().evaluate((el) => ({ start: Number(el.dataset.startMinute), end: Number(el.dataset.startMinute) + Math.round(el.offsetHeight / Number(el.dataset.hourHeight) * 60) }))
  const clampTxt = (s, e) => { const lo = Math.max(s, grid.start), hi = Math.min(e, grid.end); const f = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return hi > lo ? `${f(lo)}-${f(hi)}` : null }
  console.log(`  (test account grid: ${grid.start / 60}:00–${grid.end / 60}:00)`)
  const lateToday = clampTxt(22 * 60 + 30, 24 * 60), lateTomorrow = clampTxt(0, 90)
  const lateTodayEl = page.locator(`[data-day-date="${today}"] [data-google-event]`, { hasText: 'GCAL Late Call' })
  const lateTodayTxt = (await lateTodayEl.allInnerTexts()).join(' / ').replace(/\n/g, ' ')
  ok(lateToday ? lateTodayTxt.includes(lateToday) : (await lateTodayEl.count()) === 0, `week: overnight event today piece = ${lateToday ?? 'outside visible hours → not drawn'} (rendered: "${lateTodayTxt}")`)
  const evCalls = mock.calls.filter((c) => c.action === 'events')
  ok(evCalls.length >= 2 && evCalls.every((c) => Date.parse(c.body.time_max) - Date.parse(c.body.time_min) <= 120 * 86400000), `events requested in ≤120-day halves (${evCalls.length} calls)`)
  ok((await page.locator('[data-google-event] [data-google-badge]').count()) >= 4 && (await page.locator('[data-google-all-day] [data-google-badge]').count()) >= 1, 'week: every Google block / all-day chip carries the "G" badge')
  const syncBlk = gcal('GCAL Weekly Sync').first()
  const syncLayout = await syncBlk.getAttribute('data-google-layout')
  const syncClip = await syncBlk.locator('span.break-words').evaluate((el) => ({ clipped: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1 }))
  ok(syncLayout === 'tall' && !syncClip.clipped && (await syncBlk.innerText()).includes('10:00-11:00'), `week: 1-hour block shows full title on up to 2 lines + time row (layout ${syncLayout}, clipped ${syncClip.clipped})`)
  const pendBlk = gcal('GCAL Pending Invite').first()
  ok((await pendBlk.locator('[data-google-reply-tag]').innerText()) === '未回覆' && Number(await pendBlk.evaluate((el) => getComputedStyle(el).opacity)) <= 0.56, 'week: needsAction block shows「未回覆」and is lighter (opacity ≤ .55)')
  await page.screenshot({ path: path.join(SHOTS, '1-week-desktop.png') })

  // click → read-only popover, never the task editor
  await gcal('GCAL Weekly Sync').first().click()
  const pop = page.locator('[data-google-event-details]')
  await pop.waitFor({ timeout: 5000 })
  const link = pop.getByRole('link', { name: '在 Google 日曆開啟' })
  ok((await link.getAttribute('href')) === 'https://www.google.com/calendar/event?eid=sync' && (await link.getAttribute('target')) === '_blank', 'click: details popover with "open in Google Calendar" link')
  ok((await page.getByRole('dialog').count()) === 1 && (await pop.innerText()).includes('Room 5'), 'click: only the read-only popover opened (no task editor)')
  await sleep(500); const lb = await link.boundingBox(); ok(lb && lb.height >= 44, `popover link touch target ${lb?.height}px ≥ 44`)
  await page.screenshot({ path: path.join(SHOTS, '2-week-popover.png') })
  await closePopovers()
  // drag attempt: block must not move, nothing else opens
  const blk = gcal('GCAL Weekly Sync').first(); const b0 = await blk.boundingBox()
  await page.mouse.move(b0.x + b0.width / 2, b0.y + 8); await page.mouse.down(); await page.mouse.move(b0.x + b0.width / 2, b0.y + 140, { steps: 8 }); await page.mouse.up(); await sleep(400)
  await closePopovers()
  const b1 = await blk.boundingBox()
  ok(Math.abs(b1.y - b0.y) < 1 && (await page.getByRole('dialog').count()) === 0, 'drag on Google block: no move, no editor')
  ok((await page.locator('[data-google-all-day]', { hasText: 'GCAL Offsite Day' }).first().click().then(() => pop.waitFor({ timeout: 3000 })).then(() => true).catch(() => false)), 'all-day chip click opens popover (not a new-task form)')
  await closePopovers()
  ok((await page.getByRole('dialog').count()) === 0, 'no dialog left open after all-day chip click')

  // ── day view ──
  await page.getByRole('button', { name: '日檢視' }).click(); await sleep(800)
  ok(await gcal('GCAL Weekly Sync').first().isVisible(), 'day: Google meeting visible')
  ok(await page.locator('[data-google-all-day]', { hasText: 'GCAL Offsite Day' }).first().isVisible(), 'day: all-day chip visible')
  ok((await page.locator('[data-google-event] [data-google-badge]').count()) >= 2, 'day: Google blocks carry the "G" badge')
  await page.screenshot({ path: path.join(SHOTS, '3-day-desktop.png') })
  const tomorrowPiece = page.locator(`[data-day-date="${tomorrow}"] [data-google-event]`, { hasText: 'GCAL Late Call' })
  if (!(await tomorrowPiece.count())) { await page.getByRole('button', { name: '後一天' }).click(); await sleep(800) }
  await page.locator(`[data-day-date="${tomorrow}"]`).first().waitFor({ timeout: 10000 })
  ok(lateTomorrow ? (await tomorrowPiece.first().innerText().catch(() => '')).includes(lateTomorrow) : (await tomorrowPiece.count()) === 0, `day: overnight event next-day piece = ${lateTomorrow ?? 'outside visible hours → not drawn'} (00:00-01:30 clamped to grid)`)
  ok((await page.locator('[data-google-event]').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height > 0))), 'day: every drawn Google piece has positive height (nothing inverted)')

  // ── month view ──
  await page.getByRole('button', { name: '月檢視' }).click(); await sleep(800)
  const monthChips = page.locator('[data-google-event]')
  await monthChips.first().waitFor({ timeout: 10000 })
  ok((await monthChips.count()) >= 2 && (await page.locator('[data-google-event]', { hasText: 'GCAL' }).count()) >= 2, `month: Google chips shown (${await monthChips.count()})`)
  const allDayMonth = page.locator('[data-google-month-all-day]', { hasText: 'GCAL Offsite Day' }).first()
  ok(await allDayMonth.isVisible(), 'month: Google all-day event visible in the day cell (not folded into +N)')
  ok(await allDayMonth.evaluate((el) => el.parentElement.firstElementChild === el), 'month: all-day event is first in its cell')
  await page.screenshot({ path: path.join(SHOTS, '4-month-desktop.png') })
  ok(errors.length === 0, `0 pageerror in week/day/month (${errors.join(' | ') || 'none'})`)

  // ── settings modal entry → settings page (connected) ──
  await page.getByRole('button', { name: '週檢視' }).click()
  await page.getByRole('button', { name: '設定', exact: true }).first().click()
  const entry = page.locator('[data-testid="settings-google-calendar-link"]')
  await entry.waitFor({ timeout: 10000 }); await entry.scrollIntoViewIfNeeded()
  ok((await entry.boundingBox()).height >= 44, 'settings modal has a Google 日曆 entry (≥44px)')
  await entry.click(); await page.waitForURL(/\/settings\/google-calendar\/?$/, { timeout: 30000 })
  const section = page.locator('[data-gcal-state]')
  const settingsState = async () => { await page.waitForFunction(() => { const s = document.querySelector('[data-gcal-state]')?.getAttribute('data-gcal-state'); return s && s !== 'loading' }, null, { timeout: 30000 }); return section.getAttribute('data-gcal-state') }
  ok((await settingsState()) === 'connected' && (await page.getByText('已連結').count()) > 0 && (await page.getByRole('button', { name: '解除連結' }).count()) === 1, 'settings page: connected state (已連結 + 解除連結)')
  ok((await page.locator('main').innerText()).includes('只讀取你的 Google 主日曆，不會修改。共享夥伴看不到會議內容；若開啟下方選項，他們約時間時只會知道你那段時間忙碌。'), 'settings page: read-only + busy-only explanation shown')
  await page.screenshot({ path: path.join(SHOTS, '5-settings-connected.png') })
  mock.mode = 'disconnected'; await page.reload()
  ok((await settingsState()) === 'disconnected' && (await page.getByRole('button', { name: '連結 Google 日曆' }).count()) === 1, 'settings page: not-connected state (連結 Google 日曆 button)')
  await page.screenshot({ path: path.join(SHOTS, '6-settings-disconnected.png') })
  mock.mode = 'reauth'; await page.reload()
  ok((await settingsState()) === 'reauth' && (await page.locator('main [role=alert]').count()) === 1 && (await page.getByRole('button', { name: '重新連結 Google 日曆' }).count()) === 1, 'settings page: reauth_required state (alert + reconnect)')
  await page.screenshot({ path: path.join(SHOTS, '6b-settings-reauth.png') })
  mock.mode = 'unconfigured'; await page.reload()
  ok((await settingsState()) === 'unconfigured' && (await page.getByText('此功能尚未開放').count()) === 1 && (await page.getByRole('button', { name: '連結 Google 日曆' }).count()) === 0, 'settings page: unconfigured state (尚未啟用, no connect button)')
  await page.screenshot({ path: path.join(SHOTS, '7-settings-unconfigured.png') })

  // unconfigured → calendar makes NO events request and shows nothing
  mock.calls.length = 0
  await page.goto(`${BASE}/`); await page.getByRole('button', { name: '週檢視' }).waitFor({ timeout: 60000 }); await sleep(2500)
  ok(mock.calls.some((c) => c.action === 'status') && !mock.calls.some((c) => c.action === 'events') && (await page.locator('[data-google-event]').count()) === 0, 'configured:false → status only, zero events requests, no Google blocks')
  mock.mode = 'disconnected'; mock.calls.length = 0; await page.reload(); await page.getByRole('button', { name: '週檢視' }).waitFor({ timeout: 60000 }); await sleep(2500)
  ok(!mock.calls.some((c) => c.action === 'events'), 'not connected → zero events requests')


  // ── settings: share_busy toggle ──
  mock.mode = 'connected'; mock.shareBusy = true
  await page.goto(`${BASE}/settings/google-calendar`); await settingsState()
  const toggle = page.locator('[data-testid="gcal-share-busy"] input[type=checkbox]')
  ok(await toggle.isChecked(), 'settings: share_busy toggle shown and on by default')
  ok((await page.locator('[data-testid="gcal-share-busy"]').innerText()).includes('對方只看到忙碌，看不到標題'), 'settings: toggle explains partners only see busy (no titles)')
  await toggle.click(); await sleep(600)
  ok(mock.calls.some((c) => c.action === 'set_share_busy' && c.body.value === false) && !(await toggle.isChecked()), 'settings: turning it off calls set_share_busy(false)')
  const tb = await page.locator('[data-testid="gcal-share-busy"]').boundingBox(); ok(tb.height >= 44, `settings: toggle row ${tb.height}px ≥ 44`)
  await page.screenshot({ path: path.join(SHOTS, '7b-settings-share-busy.png') })
  mock.shareBusy = true

  // ── 約交集: Google busy avoided; failure → visible hint ──
  mock.meeting = true; mock.busyMode = 'empty'
  await page.goto(`${BASE}/`); await page.getByRole('button', { name: '週檢視' }).waitFor({ timeout: 60000 }); await sleep(1500)
  await page.getByRole('button', { name: '更多工具' }).first().click()
  await page.getByRole('menuitem', { name: /約交集/ }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByText('GCAL Peer').waitFor({ timeout: 20000 })
  await dlg.getByLabel('GCAL Peer').check()
  const day = ymd(new Date(Date.now() + 2 * 86400000))
  await dlg.locator('input[type=date]').first().fill(day); await dlg.locator('input[type=date]').nth(1).fill(day)
  const searchOnce = async () => {
    const before = mock.calls.filter((c) => c.action === 'busy').length
    await dlg.getByRole('button', { name: '尋找共同空檔' }).click()
    await dlg.locator('section[aria-label="共同空檔"]').waitFor({ timeout: 30000 })
    await sleep(300)
    return { starts: await dlg.locator('section[aria-label="共同空檔"] button[data-start]').evaluateAll((els) => els.map((e) => e.getAttribute('data-start'))), hint: await dlg.locator('[data-testid="google-busy-incomplete"]').count(), busyCalls: mock.calls.filter((c) => c.action === 'busy').slice(before) }
  }
  const base = await searchOnce()
  const bc = base.busyCalls.at(-1)
  ok(base.busyCalls.length === 1 && bc.body.peer_ids.includes(PEER) && bc.body.peer_ids.length === 2 && Date.parse(bc.body.time_max) - Date.parse(bc.body.time_min) <= 120 * 86400000, 'meet: one busy request for me + partner, window ≤120 days')
  ok(base.starts.length > 0 && base.hint === 0, `meet: baseline slots found (${base.starts.length}), no hint`)
  const s0 = Date.parse(base.starts[0]); mock.busyWindow = [new Date(s0).toISOString(), new Date(s0 + 2 * 3600000).toISOString()]; mock.busyMode = 'block'
  const blocked = await searchOnce()
  const overlaps = blocked.starts.filter((x) => { const a = Date.parse(x); return a < s0 + 2 * 3600000 && a + 30 * 60000 > s0 })
  ok(blocked.starts.length > 0 && overlaps.length === 0 && blocked.hint === 0, `meet: partner's Google busy ${new Date(s0).toTimeString().slice(0, 5)}+2h avoided (${blocked.starts.length} slots, ${overlaps.length} overlapping)`)
  await page.screenshot({ path: path.join(SHOTS, '13-meet-google-busy-avoided.png') })
  mock.busyMode = 'fail'
  const failed = await searchOnce()
  const hintTxt = await dlg.locator('[data-testid="google-busy-incomplete"]').innerText()
  const hintBox = await dlg.locator('[data-testid="google-busy-incomplete"]').boundingBox(), firstSlot = await dlg.locator('section[aria-label="共同空檔"] button[data-start]').first().boundingBox()
  ok(failed.starts.length === base.starts.length && failed.hint === 1 && hintTxt.includes('部分 Google 行程未納入') && hintTxt.includes('這些時段可能與部分人的 Google 會議衝突，送出前請先確認。'), 'meet: busy call fails → slots still computed + hint with consequence text')
  ok(hintBox.y + hintBox.height <= firstSlot.y && (await dlg.locator('[data-testid="google-busy-incomplete"] p').last().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) >= 14, 'meet: hint sits above the result list at body text size (≥14px)')
  ok((await dlg.innerText()).includes('已連結 Google 日曆的人，其 Google 會議會算成忙碌；未共享的行事曆不包含。'), 'meet: dialog scope text mentions Google meetings count as busy')
  await page.screenshot({ path: path.join(SHOTS, '14-meet-google-busy-failed.png') })
  mock.busyMode = 'unavailable'
  ok((await searchOnce()).hint === 1, 'meet: a partner in `unavailable` → hint shown')
  mock.busyMode = 'empty'
  ok((await searchOnce()).hint === 0, 'meet: hint cleared on a clean search')
  for (let i = 0; i < 4 && (await page.getByRole('dialog').count()); i++) { await page.keyboard.press('Escape'); await sleep(250) }
  mock.meeting = false

  // ── English ──
  mock.mode = 'connected'
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en')); await page.reload()
  await page.getByRole('button', { name: 'Week view' }).click()
  await gcal('GCAL Weekly Sync').first().waitFor({ timeout: 30000 })
  await gcal('GCAL Pending Invite').first().click(); await pop.waitFor({ timeout: 5000 })
  const popText = await pop.innerText()
  const labels = await page.locator('[data-google-event]').evaluateAll((els) => els.map((e) => `${e.innerText} ${e.getAttribute('aria-label') || ''} ${e.getAttribute('title') || ''}`).join('\n'))
  ok(!CJK.test(popText) && popText.includes('Open in Google Calendar') && popText.includes('Not answered yet'), `EN: popover has no Chinese (${JSON.stringify(popText.slice(0, 80))})`)
  ok(!CJK.test(labels), 'EN: Google blocks / aria-labels have no Chinese')
  await page.screenshot({ path: path.join(SHOTS, '8-week-english.png') })
  await closePopovers()
  // EN 約交集 dialog with the Google hint
  mock.meeting = true; mock.busyMode = 'fail'
  await page.reload(); await page.getByRole('button', { name: 'Week view' }).waitFor({ timeout: 60000 }); await sleep(1500)
  await page.getByRole('button', { name: 'More tools' }).first().click()
  await page.getByRole('menuitem', { name: /Find a time/ }).click()
  await dlg.getByLabel('GCAL Peer').check()
  await dlg.locator('input[type=date]').first().fill(day); await dlg.locator('input[type=date]').nth(1).fill(day)
  await dlg.getByRole('button', { name: 'Find common times' }).click()
  await dlg.locator('[data-testid="google-busy-incomplete"]').waitFor({ timeout: 30000 })
  const enDlg = await dlg.innerText()
  ok(!CJK.test(enDlg) && enDlg.includes('Please check before sending') && enDlg.includes('their Google meetings count as busy'), `EN: 約交集 dialog (scope + Google hint) has no Chinese`)
  await page.screenshot({ path: path.join(SHOTS, '15-meet-english-hint.png') })
  for (let i = 0; i < 4 && (await page.getByRole('dialog').count()); i++) { await page.keyboard.press('Escape'); await sleep(250) }
  mock.meeting = false; mock.busyMode = 'empty'
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
  await entry.waitFor({ timeout: 10000 }); await entry.scrollIntoViewIfNeeded()
  const entryBlock = await entry.locator('xpath=..').innerText()
  ok(!CJK.test(entryBlock) && entryBlock.includes('Google Calendar'), `EN: settings modal entry has no Chinese (${JSON.stringify(entryBlock)})`)
  await entry.click(); await page.waitForURL(/\/settings\/google-calendar\/?$/, { timeout: 30000 }); await settingsState()
  for (const m of ['connected', 'disconnected', 'reauth', 'unconfigured']) {
    mock.mode = m; if (m !== 'connected') await page.reload(); await settingsState()
    const txt = await page.locator('main').innerText()
    ok(!CJK.test(txt), `EN: settings page (${m}) has no Chinese`)
    if (m === 'connected' || m === 'unconfigured') await page.screenshot({ path: path.join(SHOTS, `16-settings-english-${m}.png`) })
  }
  await page.goto(`${BASE}/settings/google-calendar/callback?error=access_denied`)
  await page.locator('[data-gcal-callback="denied"]').waitFor({ timeout: 30000 })
  ok(!CJK.test(await page.locator('main').innerText()), 'EN: callback page (denied) has no Chinese')

  // ── 390px (iPhone) ──
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))
  mock.mode = 'connected'
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/`); await page.getByRole('tab', { name: '日曆' }).waitFor({ timeout: 60000 })
  await page.getByRole('tab', { name: '日曆' }).click(); await sleep(800)
  await page.getByRole('button', { name: /目前是.檢視/ }).click(); await page.getByRole('menuitem', { name: /週檢視/ }).click(); await sleep(800)
  await gcal('GCAL Weekly Sync').first().waitFor({ timeout: 30000 })
  const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok((await overflow()) <= 0, `390 week: no horizontal page overflow (${await overflow()}px)`)
  ok(await page.locator('[data-google-all-day]', { hasText: 'GCAL Offsite Day' }).first().isVisible(), '390 week: all-day chip visible')
  await page.screenshot({ path: path.join(SHOTS, '9-week-390.png') })
  await gcal('GCAL Weekly Sync').first().click(); await pop.waitFor({ timeout: 5000 })
  await sleep(500); const pb = await pop.boundingBox(); const lb2 = await pop.getByRole('link').boundingBox()
  ok(pb.x >= 0 && pb.x + pb.width <= 390 && lb2.height >= 44, `390 popover inside viewport (x ${Math.round(pb.x)}–${Math.round(pb.x + pb.width)}), link ${lb2.height}px`)
  await page.screenshot({ path: path.join(SHOTS, '10-popover-390.png') })
  await closePopovers()
  await page.getByRole('button', { name: /目前是.檢視/ }).click(); await page.getByRole('menuitem', { name: /月檢視/ }).click(); await sleep(800)
  ok((await page.locator('[data-google-event]').count()) >= 1 && (await overflow()) <= 0, '390 month: Google items shown, no overflow')
  await page.screenshot({ path: path.join(SHOTS, '11-month-390.png') })
  await page.goto(`${BASE}/settings/google-calendar`); await settingsState()
  ok((await overflow()) <= 0, '390 settings page: no horizontal overflow')
  const btn = await page.getByRole('button', { name: '解除連結' }).boundingBox(); ok(btn.height >= 44, `390 settings button ${btn.height}px ≥ 44`)
  await page.screenshot({ path: path.join(SHOTS, '12-settings-390.png') })

  ok(!mock.badBusyWindow, `every busy request stayed inside the strict 約交集 window (${mock.badBusyWindow || 0} rejected)`)
  ok(errors.length === 0, `0 pageerror overall (${errors.join(' | ') || 'none'})`)
} catch (e) {
  fail++; console.log('FAIL: script aborted —', e.message)
} finally {
  await browser.close()
}
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} — PASS ${pass} / FAIL ${fail}; screenshots in ${SHOTS}`)
process.exit(fail ? 1 : 0)
