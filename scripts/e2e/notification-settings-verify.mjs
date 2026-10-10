/**
 * 設定 › 提醒設定 → the notification bell and the 每日規劃提醒, in the real app
 * (components/notifications/notification-center.tsx, hooks/use-daily-planning-reminder.ts).
 * The pure rules are covered by scripts/tests/task-reminders.test.mjs; this checks the glue they can't see:
 * the settings reach the bell, the bell redraws, the settings tab survives a stored blob with sections missing,
 * English has no Chinese left, and the web daily-planning reminder fires once a day.
 *
 *   node_modules/.bin/next dev -p 3496            (separate terminal; this worktree; needs a non-sandboxed shell)
 *   E2E_BASE_URL=http://localhost:3496 E2E_SERVER_PID=<next-server pid> E2E_STATE_FILE=$TMPDIR/e2e-state.json \
 *     node scripts/e2e/notification-settings-verify.mjs
 *
 * Uses the test account in .env.e2e.local (one login, the saved session is reused). Reads go to the account's data;
 * EVERY Supabase write (REST non-GET, storage, functions) is intercepted and answered locally — the script counts
 * them and fails if one slipped through. The task list is replaced by a synthetic one and user_settings is rewritten
 * per scenario. Time is controlled with page.clock; scenario times are EARLIER than the real clock so the stored
 * login never looks expired (no token refresh happens). Exit code 1 on any failure; stdout is the evidence.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'

const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3496'
const STATE_FILE = process.env.E2E_STATE_FILE
const SHOT_DIR = process.env.E2E_SHOT_DIR || path.join(process.env.TMPDIR || '/tmp', 'notification-settings-shots')
mkdirSync(SHOT_DIR, { recursive: true })
const READ_RPCS = /\/rpc\/(get_|preview_)/
// stdout is the evidence (the repo lint allows only console.warn/error).
const out = (line) => process.stdout.write(line + '\n')

// ── are we talking to OUR dev server? (a port taken by someone else's server answers just as happily) ──
{
  const port = new URL(BASE).port
  const pids = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).toString().trim().split('\n').filter(Boolean)
  assert.ok(pids.length > 0, `nothing listens on ${BASE}`)
  const decode = (s) => Buffer.from(s.replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8')
  for (const pid of pids) {
    const out = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn']).toString()
    const cwd = decode(out.split('\n').find((l) => l.startsWith('n')).slice(1))
    assert.equal(cwd, process.cwd(), `port ${port} is served by pid ${pid} from ${cwd}, not from this worktree — aborting`)
    if (process.env.E2E_SERVER_PID) assert.equal(pid, process.env.E2E_SERVER_PID, 'unexpected server pid')
  }
  out(`server identity OK: ${BASE} is pid ${pids.join(',')} running from ${process.cwd()}`)
}

const results = []
const ok = (name, detail = '') => { results.push(name); out(`PASS  ${name}${detail ? ' — ' + detail : ''}`) }
const writes = []
const writeLog = []
const slipped = []

// ── time: "today" in every scenario is YESTERDAY by the calendar, so every fake clock reading is before the real one ──
const real = new Date()
const D0 = new Date(real.getFullYear(), real.getMonth(), real.getDate() - 1)
const at = (h, m = 0, s = 0, plusDays = 0) => new Date(D0.getFullYear(), D0.getMonth(), D0.getDate() + plusDays, h, m, s, 0)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayStr = (offset) => ymd(new Date(D0.getFullYear(), D0.getMonth(), D0.getDate() + offset))
const agoIso = (days) => at(10, 0, 0, -days).toISOString()

// ── the settings blob ──
const DEFAULTS = {
  enabled: true,
  overdue: { enabled: true, criticalDays: 7, showInBell: true, dailyDigest: true },
  dueSoon: { enabled: true, daysBeforeDue: 3, notifyOnDueDay: true, notifyDayBefore: true },
  staleTasks: { enabled: true, daysUntilStale: 14, includeUnscheduled: true, includeNoDueDate: true },
  highPriority: { enabled: true, minUrgency: 8, alertWhenTooMany: true, maxBeforeAlert: 5 },
  scheduling: { enabled: true, remindUnscheduled: true, percentThreshold: 50, dailyPlanningReminder: false, planningReminderTime: '08:00' },
  workspaceOverrides: {},
  quietHours: { enabled: false, startTime: '22:00', endTime: '08:00', allowUrgent: true },
  appearance: { showBadgeCount: true, groupByType: true, autoCollapse: false, maxVisible: 10 },
}
/** DEFAULTS with `patch` merged one level deep per section. */
const settings = (patch = {}) => {
  const base = JSON.parse(JSON.stringify(DEFAULTS))
  for (const [k, v] of Object.entries(patch)) base[k] = v && typeof v === 'object' && !Array.isArray(v) && k !== 'workspaceOverrides' ? { ...base[k], ...v } : v
  return base
}

// ── the synthetic task list (offsets are days from the scenario's "today") ──
// open tasks: 15 → undated ones are 6 (40 %), 4 urgent ones are scheduled in the future.
const FIXTURE = [
  { k: 'od10', title: 'Overdue ten days', due: -10, ws: 'B' },
  { k: 'od5', title: 'Overdue five days', due: -5, ws: 'B' },
  { k: 'd0', title: 'Due today', due: 0 },
  { k: 'd1', title: 'Due tomorrow', due: 1 },
  { k: 'd3', title: 'Due in three days', due: 3 },
  { k: 'stale', title: 'Old undated task', created: -20 },
  ...[0, 1, 2, 3].map((i) => ({ k: `u${i}`, title: `Urgent ${i}`, urgency: 9, sched: 5 + i })),
  ...[0, 1, 2, 3, 4].map((i) => ({ k: `n${i}`, title: `Undated ${i}` })),
]

// ── backend interception ──
async function installBackend(context, { notifications, meta }) {
  let cats = null
  let wss = null
  let resolveReady
  const ready = new Promise((r) => { resolveReady = r })
  const maybeReady = () => { if (cats && wss) resolveReady() }
  await context.route('**/rest/v1/**', async (route) => {
    try {
      const req = route.request()
      const url = new URL(req.url())
      const method = req.method()
      const isRead = method === 'GET' || method === 'HEAD' || (method === 'POST' && READ_RPCS.test(url.pathname))
      if (!isRead) {
        let body = null
        try { body = req.postDataJSON() } catch { body = req.postData() }
        writes.push(`${method} ${url.pathname}`)
        writeLog.push({ method, path: url.pathname, body })
        return route.fulfill({ status: 204, body: '' })
      }
      if (method === 'GET' && url.pathname.endsWith('/user_settings')) {
        const res = await route.fetch()
        let json = await res.json()
        const fix = (row) => {
          if (!row || typeof row !== 'object') return row
          return { ...row, notifications: notifications, onboarding_completed: true }
        }
        json = Array.isArray(json) ? json.map(fix) : fix(json)
        return route.fulfill({ response: res, json })
      }
      if (method === 'GET' && url.pathname.endsWith('/workspaces')) {
        const res = await route.fetch()
        const json = await res.json()
        if (Array.isArray(json)) { wss = json; meta.workspaces = json; maybeReady() }
        return route.fulfill({ response: res, json })
      }
      if (method === 'GET' && url.pathname.endsWith('/categories')) {
        const res = await route.fetch()
        const json = await res.json()
        if (Array.isArray(json)) { cats = json; meta.categories = json; maybeReady() }
        return route.fulfill({ response: res, json })
      }
      if (method === 'GET' && url.pathname.endsWith('/tasks')) {
        await Promise.race([ready, new Promise((r) => setTimeout(r, 10000))])
        const live = (cats ?? []).filter((c) => !c.is_archived && (wss ?? []).some((w) => w.id === c.workspace_id && !w.is_archived))
        const catA = live[0]
        const catB = live.find((c) => c.workspace_id !== catA?.workspace_id) ?? catA
        meta.wsA = catA?.workspace_id
        meta.wsB = catB?.workspace_id
        const rows = !catA ? [] : FIXTURE.map((f, i) => {
          const cat = f.ws === 'B' ? catB : catA
          const created = f.created !== undefined ? agoIso(-f.created) : agoIso(1)
          return {
            id: randomUUID(), category_id: cat.id, workspace_id: cat.workspace_id, title: f.title, description: null, task_type: 'one_time',
            urgency: f.urgency ?? 5, estimated_minutes: null, actual_minutes: null,
            due_date: f.due !== undefined ? dayStr(f.due) : null,
            scheduled_date: f.sched !== undefined ? dayStr(f.sched) : null,
            scheduled_start_time: f.sched !== undefined ? '10:00:00' : null, scheduled_end_time: f.sched !== undefined ? '11:00:00' : null,
            calendar_color: '#7c8f7a', is_completed: false, completed_at: null, is_archived: false, archived_at: null, notes: null, sort_order: i,
            created_at: created, updated_at: created, is_recurring: false, show_in_task_list: true, is_meeting: false, attendees: null, location: null,
            meeting_url: null, parent_id: null, exdates: null, recurrence_type: null, recurrence_interval: null, recurrence_days_of_week: null,
            recurrence_end_date: null, user_id: cat.user_id,
          }
        })
        return route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json', 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
          body: JSON.stringify(rows),
        })
      }
      return route.continue()
    } catch { /* the scenario ended while this request was in flight */ }
  })
  await context.route('**/storage/v1/**', (route) => (route.request().method() === 'GET' ? route.continue() : (writes.push('storage'), route.fulfill({ status: 204, body: '' }))))
  await context.route('**/functions/v1/**', (route) => (writes.push('functions ' + route.request().url()), route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })))
}

// Fake Notification (permission already granted) + the language, installed before the app runs.
const INIT = ({ lang }) => {
  try {
    localStorage.setItem('waddle.waterReminder.enabled', '0')
    localStorage.removeItem('waddle.meetingReminder.minutes')
    localStorage.setItem('waddle-language-v1', lang)
  } catch {}
  window.__notes = []
  class FakeNotification {
    constructor(title, opts) { window.__notes.push({ title, body: opts?.body ?? '', tag: opts?.tag ?? '' }) }
    close() {}
    static get permission() { return 'granted' }
    static requestPermission() { return Promise.resolve('granted') }
  }
  window.Notification = FakeNotification
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style')
    st.textContent = 'nextjs-portal{display:none!important}'
    document.head.appendChild(st)
  })
}

const browser = await chromium.launch()
let storageState = STATE_FILE && existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : undefined
if (!storageState) {
  const ctx = await browser.newContext({ locale: 'zh-TW' })
  const page = await ctx.newPage()
  await page.goto(BASE + '/login?method=email', { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(env.E2E_EMAIL)
  await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type=submit]').click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000, waitUntil: 'domcontentloaded' })
  storageState = await ctx.storageState()
  if (STATE_FILE) writeFileSync(STATE_FILE, JSON.stringify(storageState))
  await ctx.close()
  ok('login (single login, session reused for every scenario)')
}

/** Open the app at fake time `time` with the stored notification settings `notifications`. */
async function openApp({ time = at(9, 0), notifications = settings(), lang = 'zh-TW', viewport = { width: 1280, height: 800 } } = {}) {
  assert.ok(time.getTime() < Date.now() - 60_000, 'scenario time must be earlier than the real clock')
  const context = await browser.newContext({ storageState, viewport, locale: lang === 'en' ? 'en-US' : 'zh-TW' })
  const meta = {}
  await installBackend(context, { notifications, meta })
  await context.addInitScript(INIT, { lang })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  // A write that reached Supabase without being intercepted would have a real server behind it.
  page.on('response', async (r) => {
    const m = r.request().method()
    if (m === 'GET' || m === 'HEAD' || !/supabase\.co/.test(r.url()) || /\/auth\/v1\//.test(r.url()) || READ_RPCS.test(r.url())) return
    if ((await r.serverAddr().catch(() => null)) !== null) slipped.push(`${m} ${r.url()}`)
  })
  await page.clock.install({ time })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-tour="focus-timer"]').first().waitFor({ timeout: 90000 })
  const isMobile = viewport.width < 768
  const api = {
    context, page, errors, meta,
    close: async () => { await context.unrouteAll({ behavior: 'ignoreErrors' }); await context.close() },
    panel: () => page.locator('[data-bell-item], [data-bell-group]').first(),
    /** Open the bell (desktop: the icon; mobile: ⋯ → 通知), wait until the task list has been computed. */
    openBell: async () => {
      if (isMobile) {
        await page.locator('[data-tour="mobile-more"]').click()
        await page.getByRole('menuitem', { name: /^(通知|Notifications)/ }).click()
      } else {
        await page.locator('[data-tour="notification-center"]').first().click()
      }
      await page.locator('[data-bell-item], :text("一切順利！"), :text("All clear!")').first().waitFor({ timeout: 15000 })
      await page.waitForTimeout(250)
    },
    closeBell: async () => {
      await page.locator('div.fixed.inset-0.z-overlay').click({ position: { x: 4, y: 400 } })
      await page.waitForTimeout(150)
    },
    items: () => page.locator('[data-bell-item]').evaluateAll((els) => els.map((e) => ({
      id: e.getAttribute('data-bell-item'),
      text: e.innerText,
      iconClass: e.querySelector('div.w-8')?.className ?? '',
    }))),
    headers: () => page.locator('[data-bell-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-bell-group'))),
    ids: async () => (await api.items()).map((i) => i.id),
    /** Badge number on the bell icon ('' when there is none). */
    badge: async () => {
      const b = page.locator('[data-tour="notification-center"] [role="status"]').first()
      return (await b.count()) ? (await b.innerText()).trim() : ''
    },
    notes: () => page.evaluate(() => window.__notes),
    tick: async (ms = 31_000) => { await page.clock.fastForward(ms); await page.waitForTimeout(300) },
    tickTo: async (d) => { const now = await page.evaluate(() => Date.now()); await page.clock.fastForward(Math.max(1, d.getTime() - now)); await page.waitForTimeout(400) },
    shot: (name) => page.screenshot({ path: path.join(SHOT_DIR, name) }),
    /** Settings modal → 提醒設定 tab. */
    openNotificationSettings: async () => {
      await page.getByRole('button', { name: /^(設定|Settings)$/ }).first().click()
      const dlg = page.getByRole('dialog', { name: /^(設定|Settings)$/ })
      await dlg.waitFor({ timeout: 10000 })
      await dlg.getByRole('button', { name: /^(提醒設定|Reminders)$/ }).click()
      return dlg
    },
  }
  return api
}

const ID_ORDER_DEFAULT = ['daily-digest', 'critical-overdue', 'recent-overdue', 'due-today', 'due-tomorrow', 'due-soon', 'stale-tasks']

// ───────────────────────────── A. stock settings ─────────────────────────────
{
  const a = await openApp()
  // The number on the bell BEFORE it was ever opened: 7 cards, none read yet.
  for (let i = 0; i < 40 && (await a.badge()) === ''; i++) await a.page.waitForTimeout(250)
  assert.equal(await a.badge(), '7', 'A0: badge counts all 7 cards before the bell was opened')
  ok('A0 badge shows 7 before the bell is opened')
  await a.openBell()
  const ids = await a.ids()
  assert.deepEqual(ids, ID_ORDER_DEFAULT, `A1: stock cards (got ${ids})`)
  assert.deepEqual(await a.headers(), ['today', 'overdue', 'due_soon', 'stale'], 'A1: grouped by type, in order')
  const digest = (await a.items())[0].text
  assert.ok(digest.includes('2 件逾期') && digest.includes('今天 1 件到期') && digest.includes('明天 1 件到期'), `A1: digest wording (${digest.replace(/\n/g, ' | ')})`)
  ok('A1 stock settings → digest + 2 overdue cards + today/tomorrow/soon + stale, grouped under 4 headers', ids.join(' '))
  await a.shot('A-default-open.png')
  assert.equal(await a.badge(), '7', 'A2: while the panel is open the badge still agrees with it')
  await a.closeBell()
  assert.equal(await a.badge(), '6', 'A2: once the panel that showed the digest is closed, it no longer counts')
  ok('A2 badge stays 7 while the bell is open; closing it marks the daily digest read → 6')
  await a.page.reload({ waitUntil: 'domcontentloaded' })
  await a.page.locator('[data-tour="focus-timer"]').first().waitFor({ timeout: 60000 })
  await a.page.waitForTimeout(1500)
  assert.equal(await a.badge(), '6', 'A3: still read after a reload (remembered for the day)')
  ok('A3 …and stays read after a reload (same day, per account)')
  // dismissing the digest hides it for the day
  await a.openBell()
  await a.page.locator('[data-bell-item="daily-digest"] button:has(svg.lucide-x)').click()
  assert.ok(!(await a.ids()).includes('daily-digest'), 'A4: dismissed digest is gone')
  await a.page.reload({ waitUntil: 'domcontentloaded' })
  await a.page.locator('[data-tour="focus-timer"]').first().waitFor({ timeout: 60000 })
  await a.openBell()
  assert.ok(!(await a.ids()).includes('daily-digest'), 'A4: …and stays dismissed after a reload')
  ok('A4 dismissing the digest keeps it away for the rest of the day (survives a reload)')
  assert.deepEqual(a.errors, [], 'A: no page errors')
  await a.close()
}

// ───────────────────────────── B. numbers & toggles injected as stored settings ─────────────────────────────
async function withSettings(patch, fn, opts = {}) {
  const a = await openApp({ notifications: settings(patch), ...opts })
  await a.openBell()
  try { await fn(a) } finally { assert.deepEqual(a.errors, [], 'no page errors'); await a.close() }
}
const has = (items, id) => items.some((i) => i.id === id)
const get = (items, id) => items.find((i) => i.id === id)

await withSettings({ overdue: { criticalDays: 3 } }, async (a) => {
  const items = await a.items()
  assert.ok(!has(items, 'recent-overdue'), 'B1: nothing is merely "recent" when the bar is 3 days')
  const c = get(items, 'critical-overdue')
  assert.ok(c.text.includes('Overdue ten days') && c.text.includes('Overdue five days'), `B1: both overdue tasks are critical (${c.text.replace(/\n/g, ' | ')})`)
  ok('B1 overdue.criticalDays 7 → 3: the 5-day-overdue task moves into the critical card (old bell: always 7)')
})
await withSettings({ overdue: { criticalDays: 30 } }, async (a) => {
  const items = await a.items()
  assert.ok(!has(items, 'critical-overdue') && has(items, 'recent-overdue'), 'B1b: with a 30-day bar both are "recent"')
  ok('B1b overdue.criticalDays → 30: no critical card, both overdue tasks are "just overdue"')
})
await withSettings({ overdue: { showInBell: false } }, async (a) => {
  const items = await a.items()
  assert.ok(!has(items, 'critical-overdue') && !has(items, 'recent-overdue') && has(items, 'daily-digest'), 'B2')
  assert.ok(get(items, 'daily-digest').text.includes('2 件逾期'), 'B2: digest still counts them')
  ok('B2 overdue.showInBell off → no overdue cards, the digest still counts the 2 overdue')
})
await withSettings({ overdue: { dailyDigest: false } }, async (a) => {
  assert.deepEqual(await a.ids(), ID_ORDER_DEFAULT.slice(1))
  await a.closeBell()
  assert.equal(await a.badge(), '6', 'B3: one card fewer → badge 6 straight away')
  ok('B3 overdue.dailyDigest off → no digest card (badge 6 without opening)')
})
await withSettings({ staleTasks: { daysUntilStale: 30 } }, async (a) => {
  assert.ok(!(await a.ids()).includes('stale-tasks'))
  ok('B4 staleTasks.daysUntilStale 14 → 30: the 20-day-old task is no longer stale')
})
await withSettings({ staleTasks: { daysUntilStale: 1 } }, async (a) => {
  const s = get(await a.items(), 'stale-tasks')
  assert.ok(s.text.includes('6 個任務靜靜躺了 1 天以上'), `B4b: ${s.text.replace(/\n/g, ' | ')}`)
  ok('B4b staleTasks.daysUntilStale → 1: the 5 tasks made yesterday join in (6 tasks, wording says "1 天以上")')
})
await withSettings({ staleTasks: { includeNoDueDate: false } }, async (a) => {
  assert.ok(!(await a.ids()).includes('stale-tasks'), 'B5: every stale candidate here has no due date')
  ok('B5 staleTasks.includeNoDueDate off → undated tasks are not stale')
})
await withSettings({ staleTasks: { includeUnscheduled: false } }, async (a) => {
  assert.ok(!(await a.ids()).includes('stale-tasks'))
  ok('B5b staleTasks.includeUnscheduled off → no stale card')
})
await withSettings({ dueSoon: { daysBeforeDue: 1 } }, async (a) => {
  const ids = await a.ids()
  assert.ok(!ids.includes('due-soon') && ids.includes('due-today') && ids.includes('due-tomorrow'), `B6 (got ${ids})`)
  ok('B6 dueSoon.daysBeforeDue 3 → 1: the task due in 3 days drops out')
})
await withSettings({ dueSoon: { daysBeforeDue: 7 } }, async (a) => {
  assert.equal(get(await a.items(), 'due-soon').text.includes('接下來 7 天'), true)
  ok('B6b dueSoon.daysBeforeDue → 7: wording follows ("接下來 7 天")')
})
await withSettings({ dueSoon: { notifyOnDueDay: false } }, async (a) => {
  const items = await a.items()
  assert.ok(!has(items, 'due-today') && get(items, 'due-soon').text.includes('Due today'), 'B7: folded into the general card')
  ok('B7 dueSoon.notifyOnDueDay off → no separate "today" card; the task folds into 這幾天到期')
})
await withSettings({ dueSoon: { notifyDayBefore: false } }, async (a) => {
  const items = await a.items()
  assert.ok(!has(items, 'due-tomorrow') && get(items, 'due-soon').text.includes('Due tomorrow'), 'B8')
  ok('B8 dueSoon.notifyDayBefore off → no separate "tomorrow" card; folded in')
})
await withSettings({ highPriority: { maxBeforeAlert: 3 } }, async (a) => {
  const c = get(await a.items(), 'too-many-urgent')
  assert.ok(c && c.text.includes('4 個任務的優先等級在 8/10 以上'), `B9 (${c?.text})`)
  ok('B9 highPriority.maxBeforeAlert 5 → 3: 4 urgent tasks now trigger the card (old bell: needed 5)')
})
await withSettings({ highPriority: { maxBeforeAlert: 3, minUrgency: 10 } }, async (a) => {
  assert.ok(!(await a.ids()).includes('too-many-urgent'))
  ok('B9b highPriority.minUrgency → 10: those urgent tasks no longer count')
})
await withSettings({ scheduling: { percentThreshold: 30 } }, async (a) => {
  const c = get(await a.items(), 'unscheduled-tasks')
  assert.ok(c && c.text.includes('不少任務還沒排程') && c.text.includes('6 個任務'), `B10 (${c?.text})`)
  ok('B10 scheduling.percentThreshold 50 → 30: 40 % unscheduled now triggers the card (old bell: only above 50 %)')
})
await withSettings({ scheduling: { percentThreshold: 30, remindUnscheduled: false } }, async (a) => {
  assert.ok(!(await a.ids()).includes('unscheduled-tasks'))
  ok('B10b scheduling.remindUnscheduled off → no card')
})
await withSettings({ enabled: false }, async (a) => {
  assert.deepEqual(await a.ids(), [])
  ok('B11 master switch off → empty bell ("一切順利！")')
})

// ── 顯示設定 ──
await withSettings({ appearance: { groupByType: false } }, async (a) => {
  assert.deepEqual(await a.headers(), [], 'C1: no section headers')
  const ids = await a.ids()
  assert.equal(ids[0], 'daily-digest')
  const prio = (await a.items()).slice(1).map((i) => (i.iconClass.includes('urgency-critical-ink') ? 'high' : i.iconClass.includes('urgency-medium') ? 'medium' : 'low'))
  const rank = { high: 2, medium: 1, low: 0 }
  assert.ok(prio.every((p, i) => i === 0 || rank[prio[i - 1]] >= rank[p]), `C1: most urgent first (${prio})`)
  ok('C1 appearance.groupByType off → one flat list, most urgent first, no headers', ids.join(' '))
})
await withSettings({ appearance: { maxVisible: 3 } }, async (a) => {
  assert.equal((await a.items()).length, 3)
  const btn = a.page.locator('[data-bell-show-all]')
  assert.equal((await btn.innerText()).trim(), '顯示其餘 4 則')
  await btn.click()
  assert.equal((await a.items()).length, 7)
  assert.equal((await btn.innerText()).trim(), '只顯示前 3 則')
  ok('C2 appearance.maxVisible 10 → 3: three cards + 「顯示其餘 4 則」, which opens the rest')
})
await withSettings({ appearance: { showBadgeCount: false } }, async (a) => {
  await a.closeBell()
  assert.equal(await a.badge(), '')
  ok('C3 appearance.showBadgeCount off → no number on the bell')
})

// ── 工作區設定 ──
{
  const a = await openApp({ notifications: settings() })
  await a.openBell()
  if (!a.meta.wsB || a.meta.wsB === a.meta.wsA) {
    out('SKIP  D1/D2: the test account has a single live workspace — cannot split the fixture')
  } else {
    await a.close()
    const m = await openApp({ notifications: settings({ workspaceOverrides: { [a.meta.wsB]: { enabled: false, overduePriority: 'default' } } }) })
    await m.openBell()
    const items = await m.items()
    assert.ok(!has(items, 'critical-overdue') && !has(items, 'recent-overdue'), 'D1: the muted workspace owns both overdue tasks')
    const digestText = get(items, 'daily-digest').text
    assert.ok(!digestText.includes('逾期') && digestText.includes('今天 1 件到期'), `D1: digest no longer counts them (${digestText.replace(/\n/g, ' | ')})`)
    ok('D1 workspaceOverrides[B].enabled off → that workspace\'s overdue tasks vanish from the cards and from the digest')
    await m.close()
    const p = await openApp({ notifications: settings({ workspaceOverrides: { [a.meta.wsB]: { enabled: true, overduePriority: 'low' } } }) })
    await p.openBell()
    const crit = get(await p.items(), 'critical-overdue')
    assert.ok(crit.iconClass.includes('text-info'), `D2: low priority colour (${crit.iconClass})`)
    ok('D2 workspaceOverrides[B].overduePriority low → its overdue card is drawn as low priority (default: high)')
    await p.close()
  }
  try { await a.close() } catch { /* already closed */ }
}

// ───────────────────────────── E. changing a setting through the settings page ─────────────────────────────
{
  const a = await openApp()
  const before = (await (async () => { await a.openBell(); const i = await a.items(); await a.closeBell(); return i })()).map((i) => i.id)
  assert.ok(before.includes('recent-overdue'))
  const dlg = await a.openNotificationSettings()
  const row = dlg.getByText('嚴重過期天數', { exact: true }).locator('xpath=ancestor::div[1]')
  await row.locator('input[type=number]').fill('3')
  await a.shot('E-settings-tab.png')
  await dlg.getByRole('button', { name: /^(儲存|Save)$/ }).click()
  await dlg.waitFor({ state: 'hidden', timeout: 10000 })
  await a.openBell()
  const after = await a.ids()
  assert.ok(!after.includes('recent-overdue') && after.includes('critical-overdue'), `E1 (got ${after})`)
  ok('E1 settings page: 嚴重過期天數 7 → 3 + 儲存 → the open app\'s bell re-sorts at once (no reload)')
  const saved = writeLog.filter((w) => w.path.endsWith('/user_settings')).pop()
  assert.equal(saved?.body?.notifications?.overdue?.criticalDays, 3, `E1b: the save carried criticalDays 3 (${JSON.stringify(saved?.body?.notifications?.overdue)})`)
  ok('E1b the intercepted save body contains overdue.criticalDays = 3 (and was NOT sent to the real database)')
  assert.deepEqual(a.errors, [])
  await a.close()
}

// ───────────────────────────── F. a stored blob with sections missing ─────────────────────────────
{
  const broken = { enabled: true, overdue: { enabled: true, criticalDays: 5, showInBell: true, dailyDigest: true } } // no quietHours, no appearance, ...
  const a = await openApp({ notifications: broken })
  const dlg = await a.openNotificationSettings()
  await dlg.getByText('勿擾時段', { exact: true }).waitFor({ timeout: 5000 })
  await dlg.getByText('顯示設定', { exact: true }).waitFor({ timeout: 5000 })
  assert.equal(await dlg.getByText('嚴重過期天數', { exact: true }).locator('xpath=ancestor::div[1]').locator('input[type=number]').inputValue(), '5', 'F1: what was stored is shown')
  assert.equal(await dlg.getByText('閒置天數門檻', { exact: true }).locator('xpath=ancestor::div[1]').locator('input[type=number]').inputValue(), '14', 'F1: what was missing shows the default')
  assert.deepEqual(a.errors, [], `F1: no page errors (${a.errors})`)
  ok('F1 stored blob without quietHours/appearance/…: the 提醒設定 tab renders (old: crashed on notifications.quietHours.enabled), stored 5 kept, missing ones default')
  await dlg.getByRole('button', { name: '取消' }).click()
  await a.openBell()
  assert.ok((await a.ids()).includes('daily-digest'), 'F2: the bell works on the same blob')
  ok('F2 …and so does the bell')
  await a.close()
}

// ───────────────────────────── G. 每日規劃提醒 (web path) ─────────────────────────────
{
  const quiet = { enabled: true, startTime: '00:00', endTime: '23:59', allowUrgent: false } // whole-day 勿擾時段: must NOT matter
  const plan = settings({ scheduling: { dailyPlanningReminder: true, planningReminderTime: '08:00' }, quietHours: quiet })
  const a = await openApp({ time: at(7, 0), notifications: plan })
  await a.openBell()
  assert.ok(!(await a.ids()).includes('daily-planning'), 'G1: nothing before the time')
  await a.closeBell()
  assert.deepEqual(await a.notes(), [], 'G1: no notification before the time')
  ok('G1 07:00, reminder set for 08:00 → no card, no notification yet')
  await a.tickTo(at(8, 0, 40))
  const notes1 = await a.notes()
  assert.equal(notes1.length, 1, `G2: one browser notification (${JSON.stringify(notes1)})`)
  assert.equal(notes1[0].title, 'Huddle · 每日規劃')
  assert.equal(notes1[0].body, '花一分鐘看看待辦，把接下來的時間排一排。')
  assert.equal(notes1[0].tag, 'huddle-planning')
  ok('G2 08:00 → exactly one notification "Huddle · 每日規劃", although 勿擾時段 covers the whole day (it is the user\'s own alarm)')
  await a.openBell()
  const ids = await a.ids()
  assert.deepEqual(ids.slice(0, 2), ['daily-digest', 'daily-planning'], `G2b: the two daily cards are pinned on top (${ids})`)
  assert.ok((await a.items())[1].text.includes('每日規劃時間到了'))
  ok('G2b the bell shows the 每日規劃 card, pinned right under the digest')
  await a.closeBell()
  await a.tick(); await a.tick(); await a.tick()
  assert.equal((await a.notes()).length, 1, 'G3: not repeated on later polls')
  ok('G3 later polls the same day → still ONE notification')
  const nextDayEnd = at(8, 5, 0, 1)
  if (nextDayEnd.getTime() < Date.now() - 3_600_000) {
    await a.tickTo(nextDayEnd)
    assert.equal((await a.notes()).length, 2, 'G4: a new day fires once more')
    ok('G4 the next morning (fake clock +1 day) → fires again, once')
  } else {
    out('SKIP  G4: next-day fake time would be later than the real clock (token would look expired)')
  }
  assert.deepEqual(a.errors, [])
  await a.close()
}
{
  const a = await openApp({ time: at(7, 0), notifications: settings({ scheduling: { dailyPlanningReminder: true, planningReminderTime: '08:00' } }) })
  await a.tickTo(at(8, 0, 40))
  assert.equal((await a.notes()).length, 1)
  await a.page.reload({ waitUntil: 'domcontentloaded' })
  await a.page.locator('[data-tour="focus-timer"]').first().waitFor({ timeout: 60000 })
  await a.page.clock.fastForward(40_000)
  await a.page.waitForTimeout(500)
  assert.equal((await a.notes()).length, 0, 'G5: a reload later the same day does not fire it again (remembered in localStorage)')
  ok('G5 reload the same day → no second notification')
  await a.close()
}
{
  const a = await openApp({ time: at(7, 0), notifications: settings({ scheduling: { dailyPlanningReminder: false } }) })
  await a.tickTo(at(9, 0))
  assert.deepEqual(await a.notes(), [])
  await a.openBell()
  assert.ok(!(await a.ids()).includes('daily-planning'))
  ok('G6 switch off → nothing at 09:00, no card')
  await a.close()
}
{
  // Changing the time through the settings page: 08:00 → 13:30 while it is 09:00 → no notification (already past 08:00 is irrelevant).
  const a = await openApp({ time: at(9, 0), notifications: settings({ scheduling: { dailyPlanningReminder: true, planningReminderTime: '13:30' } }) })
  await a.tick(); await a.tick()
  assert.deepEqual(await a.notes(), [], 'G7: 09:00 < 13:30')
  await a.tickTo(at(13, 31))
  assert.equal((await a.notes()).length, 1)
  ok('G7 time set to 13:30 → silent at 09:00, fires at 13:30')
  const dlg = await a.openNotificationSettings()
  await dlg.getByText('這是你自己指定的提醒時間', { exact: false }).waitFor({ timeout: 5000 })
  ok('G8 the settings page explains it (own alarm, not affected by 勿擾時段; phone vs web/Mac)')
  await a.close()
}

// ───────────────────────────── H. English: no Chinese left ─────────────────────────────
{
  const CJK = /[㐀-鿿]/
  const a = await openApp({ lang: 'en', notifications: settings({ scheduling: { dailyPlanningReminder: true, planningReminderTime: '08:00' }, staleTasks: { daysUntilStale: 1 }, highPriority: { maxBeforeAlert: 3 } }), time: at(9, 0) })
  await a.openBell()
  const ids = await a.ids()
  for (const id of ['daily-digest', 'daily-planning', 'critical-overdue', 'recent-overdue', 'due-today', 'due-tomorrow', 'due-soon', 'stale-tasks', 'too-many-urgent']) assert.ok(ids.includes(id), `H1: ${id} present (got ${ids})`)
  const panelText = await a.page.locator('[data-bell-item], [data-bell-group]').evaluateAll((els) => els.map((e) => e.innerText).join('\n'))
  const header = await a.page.locator('div.absolute.right-0 span.font-semibold, div.md\\:absolute span.font-semibold').allInnerTexts().catch(() => [])
  assert.ok(!CJK.test(panelText), `H1: Chinese left in the English bell: ${panelText.match(/.{0,20}[㐀-鿿]+.{0,20}/g)?.join(' || ')}`)
  assert.ok(!CJK.test(header.join(' ')), 'H1: header')
  ok('H1 English: bell with 9 kinds of card (digest, planning, overdue×2, due×3, stale, urgent) → no Chinese characters', ids.join(' '))
  await a.shot('H-english-bell.png')
  await a.closeBell()
  const dlg = await a.openNotificationSettings()
  const names = (a.meta.workspaces ?? []).map((w) => w.name).filter(Boolean)
  let tabText = await dlg.innerText()
  for (const n of names) tabText = tabText.split(n).join('')
  await dlg.getByText('Daily planning reminder', { exact: true }).waitFor({ timeout: 5000 })
  const left = tabText.match(/.{0,30}[㐀-鿿]+.{0,30}/g)
  assert.ok(!left, `H2: Chinese left in the English 提醒設定 tab: ${left?.join(' || ')}`)
  await a.shot('H-english-settings.png')
  ok('H2 English: the whole 提醒設定 tab (incl. the new planning note) has no Chinese characters', `workspace names ignored: ${names.join(', ')}`)
  assert.deepEqual(a.errors, [])
  await a.close()
}

// ───────────────────────────── I. phone-sized screen ─────────────────────────────
{
  const a = await openApp({ viewport: { width: 390, height: 844 } })
  await a.openBell()
  assert.deepEqual(await a.ids(), ID_ORDER_DEFAULT)
  const overflow = await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert.ok(overflow <= 0, `I1: horizontal overflow ${overflow}px`)
  await a.shot('I-mobile-bell.png')
  ok('I1 390px: the bell panel (opened from ⋯) lists the same 7 cards, no horizontal overflow')
  assert.deepEqual(a.errors, [])
  await a.close()
}

assert.deepEqual(slipped, [], `writes that reached Supabase un-intercepted: ${slipped.join(' ; ')}`)
out(`\nintercepted writes: ${writes.length} (${[...new Set(writes)].join(', ') || 'none'}) — slipped through to Supabase: ${slipped.length}`)
out(`ALL ${results.length} CHECKS PASSED   screenshots: ${SHOT_DIR}`)
await browser.close()
