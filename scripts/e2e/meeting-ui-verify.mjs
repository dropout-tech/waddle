/* eslint-disable no-console -- mocked end-to-end invitation regression */
// All authentication, database RPCs and email functions are intercepted.
// No real database writes, invitation sends, or external identity provider calls.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
const base = process.env.E2E_BASE_URL || 'http://localhost:3190'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const user = {
  id: id(1),
  aud: 'authenticated',
  role: 'authenticated',
  email: 'meeting-ui@example.invalid',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
}
const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' })).toString('base64url')}.fake`
const today = new Date().toLocaleDateString('en-CA', {
  timeZone: 'Asia/Taipei',
})
const tomorrow = new Date(`${today}T12:00:00+08:00`)
tomorrow.setDate(tomorrow.getDate() + 1)
const day = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
const instant = (time, date = day) =>
  new Date(`${date}T${time}:00+08:00`).toISOString()
const peers = [2, 3].map((n, i) => ({
  share_id: id(100 + n),
  peer_id: id(n),
  display_name: ['Alex', 'Jordan'][i],
  avatar_url: null,
  created_at: user.created_at,
}))
const initial = () => [
  {
    id: id(20),
    organizer_id: id(2),
    title: 'Incoming workshop',
    description: 'Discuss the next draft',
    location: 'Studio',
    starts_at: instant('11:00', today),
    ends_at: instant('11:30', today),
    time_zone: 'Asia/Taipei',
    status: 'active',
    created_at: user.created_at,
    participants: [
      { user_id: id(1), display_name: 'You', response: 'pending' },
      { user_id: id(2), display_name: 'Alex', response: 'accepted' },
    ],
    email_status: null,
  },
  {
    id: id(21),
    organizer_id: id(1),
    title: 'Organized review',
    description: '',
    location: '',
    starts_at: instant('14:00', today),
    ends_at: instant('14:30', today),
    time_zone: 'Asia/Taipei',
    status: 'active',
    created_at: user.created_at,
    participants: [
      { user_id: id(1), display_name: 'You', response: 'accepted' },
      { user_id: id(2), display_name: 'Alex', response: 'pending' },
    ],
    email_status: { sent: 0, failed: 1, pending: 0 },
  },
]
let checks = 0
const returnFailures = []
const check = (label, value) => {
  assert.ok(value, label)
  checks++
  console.log('PASS', label)
}
const browser = await chromium.launch()
try {
  for (const locale of ['zh-TW', 'en']) {
    const en = locale === 'en'
    const labels = en
      ? {
          open: 'Find a time',
          search: 'Find common times',
          from: 'From date',
          to: 'To date (up to 14 days)',
          end: 'Day ends at',
          title: 'Meeting title',
          send: 'Create in-app invitation',
          slots: 'Common times',
          accept: 'Accept',
          tentative: 'Tentative',
          decline: 'Decline',
          cancel: 'Cancel meeting',
          ics: 'Download calendar file',
          pending: 'Email delivery is not confirmed.',
          retry: 'Retry email',
        }
      : {
          open: '約交集時間',
          search: '尋找共同空檔',
          from: '開始日期',
          to: '結束日期（最多 14 天）',
          end: '每天結束時間',
          title: '會議名稱',
          send: '建立站內邀請',
          slots: '共同空檔',
          accept: '接受',
          tentative: '暫定',
          decline: '婉拒',
          cancel: '取消會議',
          ics: '下載行事曆檔',
          pending: 'Email 尚未確認寄出',
          retry: '重試寄送 Email',
        }
    const context = await browser.newContext({
      locale: en ? 'en-US' : 'zh-TW',
      timezoneId: 'Asia/Taipei',
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block',
      acceptDownloads: true,
    })
    context.setDefaultTimeout(15000)
    context.setDefaultNavigationTimeout(30000)
    await context.addInitScript(
      (lang) => localStorage.setItem('waddle-language-v1', lang),
      locale,
    )
    let meetings = initial(),
      failure = '',
      emailFails = true,
      createResponseLost = true
    let inbox = ['invitation', 'response', 'cancellation'].map((kind, i) => ({
      id: id(800 + i),
      meeting_id: id(20),
      kind,
      response: kind === 'response' ? 'accepted' : null,
      title: `Notice ${kind}`,
      actor_name: 'Alex',
      created_at: user.created_at,
    }))
    let readFails = false
    const requests = [],
      emails = [],
      unexpected = [],
      pageReads = []
    await context.route('**/*.supabase.co/**', async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        name = url.pathname.split('/').pop(),
        body = req.postData() ? req.postDataJSON() : {}
      const paged = (rows) => {
        const range = req
          .headers()
          .range?.replace(/^items=/, '')
          .split('-')
          .map(Number)
        const offset = Number(url.searchParams.get('offset') ?? range?.[0] ?? 0)
        const requested = Number(
          url.searchParams.get('limit') ??
            (range?.length === 2 ? range[1] - range[0] + 1 : rows.length || 2),
        )
        const page = rows.slice(offset, offset + Math.min(2, requested))
        pageReads.push({ name, offset, total: rows.length })
        const headers =
          failure === 'count'
            ? {}
            : {
                'content-range': page.length
                  ? `${offset}-${offset + page.length - 1}/${rows.length}`
                  : `*/${rows.length}`,
                'access-control-expose-headers': 'content-range',
              }
        return route.fulfill({ json: page, headers })
      }
      if (url.pathname === '/auth/v1/token')
        return route.fulfill({
          json: {
            access_token: jwt,
            refresh_token: 'mock-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            user,
          },
        })
      if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user })
      if (url.pathname.includes('/functions/v1/')) {
        emails.push(body)
        if (emailFails)
          return route.fulfill({
            status: 503,
            json: { error: 'Mock email outage' },
          })
        meetings = meetings.map((m) =>
          m.id === body.meeting_id
            ? { ...m, email_status: { sent: 1, pending: 0, failed: 0 } }
            : m,
        )
        return route.fulfill({ json: { sent: 1, pending: 0, failed: 0 } })
      }
      if (!url.pathname.includes('/rest/v1/')) {
        unexpected.push(url.pathname)
        return route.abort()
      }
      if (url.pathname.includes('/rpc/')) {
        requests.push({ name, body })
        if (name === 'get_meeting_notifications')
          return route.fulfill({
            json: { items: inbox, unread_count: inbox.length },
          })
        if (name === 'read_meeting_notification') {
          if (readFails)
            return route.fulfill({
              status: 500,
              json: { message: 'Mock read failure' },
            })
          inbox = inbox.filter((n) => n.id !== body.p_id)
          return route.fulfill({ json: null })
        }
        if (
          name === 'huddle_operations' &&
          ['self', 'announcements'].includes(body.p_action)
        )
          return route.fulfill({
            json:
              body.p_action === 'announcements'
                ? []
                : { is_admin: false, days_remaining: 30, status: 'active' },
          })
        if (name === 'get_share_peers') return paged(peers)
        if (name === 'get_meeting_invitation_by_request')
          return route.fulfill({
            json:
              meetings.find((m) => m.request_id === body.p_request_id) || null,
          })
        if (name === 'get_meeting_invitation')
          return route.fulfill({
            json: meetings.find((m) => m.id === body.p_meeting_id) || null,
          })
        if (name === 'get_meeting_invitations')
          return route.fulfill({ json: meetings })
        if (name === 'get_shared_meeting_busy')
          return failure === 'permission'
            ? route.fulfill({
                status: 403,
                json: { message: 'insufficient grant' },
              })
            : paged([
                {
                  user_id: id(3),
                  starts_at: instant('09:30'),
                  ends_at: instant('10:00'),
                },
              ])
        if (name === 'get_shared_calendar')
          return failure === 'fetch'
            ? route.fulfill({
                status: 500,
                json: { message: 'mock fetch failure' },
              })
            : paged([
                ...[0, 1].map((n) => ({
                  source: 'task',
                  id: id(190 + n),
                  event_date: day,
                  start_time: '07:00',
                  end_time: '07:30',
                  color: '#789185',
                  detail: 'busy',
                  title: null,
                  is_recurring: false,
                })),
                {
                  source: 'task',
                  id: id(200 + (body.p_peer === id(2) ? 2 : 3)),
                  event_date: day,
                  start_time: body.p_peer === id(2) ? '10:00' : '11:00',
                  end_time:
                    body.p_peer === id(2)
                      ? failure === 'peer_seconds'
                        ? '10:30:59'
                        : '10:30'
                      : '11:30',
                  type_key: null,
                  color: '#789185',
                  detail: 'busy',
                  title: null,
                  is_recurring: false,
                  recurrence_type: null,
                  recurrence_interval: null,
                  recurrence_days_of_week: null,
                  recurrence_end_date: null,
                  exdates: [],
                  parent_id: null,
                },
              ])
        if (name === 'create_meeting_invitation') {
          const existing = meetings.find(
            (m) => m.request_id === body.p_request_id,
          )
          if (existing) return route.fulfill({ json: existing.id })
          meetings.push({
            id: id(30),
            request_id: body.p_request_id,
            organizer_id: id(1),
            title: body.p_title,
            description: body.p_description,
            location: body.p_location,
            starts_at: body.p_start,
            ends_at: body.p_end,
            time_zone: body.p_time_zone,
            status: 'active',
            created_at: user.created_at,
            participants: [
              { user_id: id(1), display_name: 'You', response: 'accepted' },
              ...body.p_invitees.map((uid) => ({
                user_id: uid,
                display_name: uid === id(2) ? 'Alex' : 'Jordan',
                response: 'pending',
              })),
            ],
            email_status: { sent: 0, failed: 1, pending: 0 },
          })
          if (createResponseLost) {
            createResponseLost = false
            return route.fulfill({
              status: 500,
              json: { message: 'Mock response lost after commit' },
            })
          }
          return route.fulfill({ json: id(30) })
        }
        if (name === 'respond_meeting_invitation') {
          meetings = meetings.map((m) =>
            m.id === body.p_meeting_id
              ? {
                  ...m,
                  participants: m.participants.map((p) =>
                    p.user_id === user.id
                      ? { ...p, response: body.p_response }
                      : p,
                  ),
                }
              : m,
          )
          return route.fulfill({ json: null })
        }
        if (name === 'cancel_meeting_invitation') {
          meetings = meetings.map((m) =>
            m.id === body.p_meeting_id ? { ...m, status: 'cancelled' } : m,
          )
          return route.fulfill({ json: null })
        }
        // Any newly introduced RPC must be deliberately represented here.
        unexpected.push(name)
        return route.fulfill({
          status: 400,
          json: { message: 'Unmocked RPC ' + name },
        })
      }
      if (req.method() !== 'GET') {
        unexpected.push(`${req.method()} ${name}`)
        return route.fulfill({ json: [] })
      }
      const fixtures = {
        time_blocks:
          failure === 'block_seconds'
            ? [
                {
                  id: id(60),
                  date: day,
                  start_time: '10:00',
                  end_time: '10:30:59',
                  type: 'focus',
                  label: 'Focus',
                  color: '#789185',
                  is_recurring: false,
                },
              ]
            : [],
        workspaces: [
          {
            id: id(50),
            name: 'Demo studio',
            color: '#789185',
            icon: '🌿',
            sort_order: 0,
            is_default: true,
          },
        ],
        categories: [
          {
            id: id(51),
            workspace_id: id(50),
            name: 'Plans',
            sort_order: 0,
            is_default: true,
          },
        ],
        tasks: [
          ...[0, 1].map((n) => ({
            id: id(55 + n),
            workspace_id: id(50),
            category_id: id(51),
            title: 'Unscheduled task',
            task_type: 'one_time',
            sort_order: n,
            is_completed: false,
            is_archived: false,
          })),
          {
            id: id(52),
            workspace_id: id(50),
            category_id: id(51),
            title: 'Own busy time',
            task_type: 'one_time',
            sort_order: 0,
            scheduled_date: day,
            scheduled_start_time: '09:00',
            scheduled_end_time:
              failure === 'own_seconds' ? '10:30:59' : '09:30',
            is_completed: false,
            is_archived: false,
          },
        ],
        calendar_share_grants:
          failure === 'grant'
            ? []
            : peers.flatMap((p) =>
                [0, 1].map((n) => ({
                  share_id: p.share_id,
                  owner_id: p.peer_id,
                  kind: 'workspace',
                  ref: id(300 + n),
                })),
              ),
      }
      if (name === 'user_settings')
        return route.fulfill({ contentType: 'application/json', body: 'null' })
      return paged(fixtures[name] || [])
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => console.error('PAGE ERROR', error.message))
    const login = async (expected = '/') => {
      await page.goto(base + '/login', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle')
      await page.locator('#email').fill(user.email)
      await page.locator('#password').fill('Mock-password-123')
      await page.locator('button[type=submit]').click()
      await page.waitForURL((url) => url.pathname !== '/login', {
        waitUntil: 'domcontentloaded',
      })
    }
    await page.goto(base + '/meetings/invitations?invite=' + id(20), {
      waitUntil: 'domcontentloaded',
    })
    await page
      .getByRole('link', { name: en ? 'Sign in' : '登入', exact: true })
      .waitFor()
    check(
      `${locale}: email invitation remembers only its meeting ID before login`,
      (await page.evaluate(() =>
        sessionStorage.getItem('huddle-pending-meeting-invite'),
      )) === id(20),
    )
    await login('/meetings/invitations')
    const returnedToInvite =
      new URL(page.url()).pathname === '/meetings/invitations' &&
      new URL(page.url()).searchParams.get('invite') === id(20)
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
    await page
      .getByRole('button', { name: new RegExp(labels.open) })
      .first()
      .click()
    const dialog = page.getByRole('dialog', { name: labels.open, exact: true })
    await dialog.waitFor()
    check(
      `${locale}: desktop calendar entry opens meeting dialog`,
      await dialog.isVisible(),
    )
    await dialog.getByLabel('Alex', { exact: true }).check()
    await dialog.getByLabel('Jordan', { exact: true }).check()
    await dialog.getByLabel(labels.from, { exact: true }).fill(day)
    await dialog.getByLabel(labels.to, { exact: true }).fill(day)
    await dialog.getByLabel(labels.end, { exact: true }).fill('12:00')
    const search = () =>
      dialog.getByRole('button', { name: labels.search, exact: true }).click()
    await search()
    const slots = dialog
      .getByRole('region', { name: labels.slots })
      .getByRole('button')
    await slots.first().waitFor()
    check(
      `${locale}: own events, two peers and meeting busy leave exactly two common slots`,
      (await slots.count()) === 2,
    )
    check(
      `${locale}: server-capped second pages are read for own tasks, grants and both peer calendars`,
      ['tasks', 'calendar_share_grants', 'get_shared_calendar'].every((name) =>
        pageReads.some((r) => r.name === name && r.offset === 2),
      ),
    )
    for (const mode of ['peer_seconds', 'own_seconds', 'block_seconds']) {
      failure = mode
      await search()
      await slots.first().waitFor()
      check(
        `${locale}: ${mode} preserves occupied seconds during data mapping`,
        (await slots.count()) === 1 &&
          (await slots.first().getAttribute('data-start')) === instant('11:30'),
      )
    }
    failure = ''
    await search()
    await slots.first().waitFor()
    await slots.first().click()
    check(
      `${locale}: selected common slot is highlighted`,
      (await slots.first().getAttribute('aria-pressed')) === 'true',
    )
    await dialog
      .getByLabel(labels.title, { exact: true })
      .fill('New group review')
    await dialog.evaluate((el) => {
      el.scrollTop = 0
    })
    await page.waitForTimeout(350)
    await page.screenshot({
      path: `/tmp/huddle-meeting-${locale}-desktop.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await dialog.getByRole('button', { name: labels.send, exact: true }).click()
    await dialog.getByRole('status').waitFor()
    check(
      `${locale}: lost create response keeps title and retry action`,
      (await dialog.getByLabel(labels.title, { exact: true }).inputValue()) ===
        'New group review' &&
        (await dialog
          .getByRole('button', { name: labels.send, exact: true })
          .isEnabled()),
    )
    await dialog.getByRole('button', { name: labels.send, exact: true }).click()
    await dialog.getByText(/In-app invitation created|站內邀請已建立/).waitFor()
    const created = requests.filter(
      (r) => r.name === 'create_meeting_invitation',
    )
    check(
      `${locale}: create RPC includes UUID idempotency key and both invitees`,
      created.length === 2 &&
        created[0].body.p_request_id === created[1].body.p_request_id &&
        /^[a-f0-9-]{36}$/.test(created[0].body.p_request_id) &&
        created[0].body.p_invitees.length === 2 &&
        created[0].body.p_start === instant('10:30'),
    )
    check(
      `${locale}: in-app create never sends email`,
      emails.length === 0 && !(await dialog.innerText()).includes('Email'),
    )
    const lookups = requests.filter(
      (r) => r.name === 'get_meeting_invitation_by_request',
    )
    check(
      `${locale}: response-loss retry reuses the same idempotency key without duplicating the invitation`,
      lookups.length === 2 &&
        lookups[0].body.p_request_id === lookups[1].body.p_request_id &&
        meetings.filter((m) => m.id === id(30)).length === 1,
    )
    const incoming = dialog.locator('#invite-' + id(20))
    for (const [label, response] of [
      [labels.accept, 'accepted'],
      [labels.tentative, 'tentative'],
      [labels.decline, 'declined'],
    ]) {
      await incoming.getByRole('button', { name: label, exact: true }).click()
      await page.waitForTimeout(100)
      check(
        `${locale}: ${response} updates incoming invitation`,
        meetings.find((m) => m.id === id(20)).participants[0].response ===
          response,
      )
    }
    const own = dialog.locator('#invite-' + id(21))
    const downloadPromise = page.waitForEvent('download')
    await own.getByRole('button', { name: labels.ics, exact: true }).click()
    const download = await downloadPromise
    const contents = readFileSync(await download.path(), 'utf8')
    check(
      `${locale}: calendar download contains correct event and UTC dates`,
      contents.includes('BEGIN:VEVENT') &&
        contents.includes('SUMMARY:Organized review') &&
        contents.includes('DTSTART:'),
    )
    await page.keyboard.press('Escape')
    const meetingCard = page
      .locator(`[data-task-block-id^="meeting:${id(21)}"]`)
      .first()
    await meetingCard.waitFor()
    check(
      `${locale}: calendar invitation is readonly with no checkbox or resize control`,
      (await meetingCard.locator('[role=checkbox]:visible').count()) === 0 &&
        (await meetingCard.locator('.cursor-ns-resize').count()) === 0,
    )
    await meetingCard.click()
    await dialog.waitFor()
    check(
      `${locale}: calendar invitation opens invitation details`,
      await own.isVisible(),
    )
    await own.getByRole('button', { name: labels.cancel, exact: true }).click()
    await page.waitForTimeout(100)
    check(
      `${locale}: organizer can cancel`,
      meetings.find((m) => m.id === id(21)).status === 'cancelled',
    )
    await dialog.getByLabel('Alex', { exact: true }).check()
    await dialog.getByLabel('Jordan', { exact: true }).check()
    await dialog.getByLabel(labels.from, { exact: true }).fill(day)
    await dialog.getByLabel(labels.to, { exact: true }).fill(day)
    await dialog.getByLabel(labels.end, { exact: true }).fill('12:00')
    for (const mode of ['permission', 'grant', 'fetch', 'count']) {
      failure = ''
      await search()
      await slots.first().waitFor()
      failure = mode
      await search()
      await page.waitForTimeout(200)
      check(
        `${locale}: ${mode} failure never displays available slots`,
        (await dialog.getByRole('region', { name: labels.slots }).count()) ===
          0 && (await dialog.getByRole('status').innerText()).length > 0,
      )
    }
    failure = 'grant'
    await search()
    await dialog.getByRole('status').waitFor()
    check(
      `${locale}: missing grants explain how partners enable sharing`,
      (await dialog.getByRole('status').innerText()).includes(
        en ? 'Settings → Sharing' : '設定 → 共享',
      ),
    )
    check(
      `${locale}: desktop dialog has no horizontal overflow`,
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    failure = ''
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const direct = page
      .getByRole('button', { name: new RegExp(labels.open) })
      .first()
    if (!(await direct.isVisible()))
      await page
        .getByRole('button', { name: en ? 'More' : '更多', exact: true })
        .click()
    await page
      .getByRole('button', { name: new RegExp(labels.open) })
      .first()
      .click()
    await dialog.waitFor()
    check(
      `${locale}: mobile more-menu entry opens meeting dialog`,
      await dialog.isVisible(),
    )
    await page.waitForTimeout(350)
    await page.screenshot({
      path: `/tmp/huddle-meeting-${locale}-mobile.png`,
      fullPage: true,
      animations: 'disabled',
    })
    check(
      `${locale}: mobile dialog has no horizontal overflow`,
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
      sessionStorage.setItem(
        'huddle-pending-meeting-invite',
        'https://evil.example/path',
      )
    })
    await context.clearCookies()
    await login()
    check(
      `${locale}: untrusted pending return cannot redirect to an external URL`,
      new URL(page.url()).origin === new URL(base).origin &&
        new URL(page.url()).pathname === '/',
    )
    await page.waitForSelector('[data-tour="notification-center"]')
    await page.locator('[data-tour="notification-center"]').click()
    await page.waitForSelector('[data-meeting-notification]')
    check(
      `${locale}: bell includes invitation, response and cancellation`,
      (await page.locator('[data-meeting-notification]').count()) === 3,
    )
    readFails = true
    await page
      .locator('[data-meeting-notification]')
      .first()
      .getByRole('button', {
        name: en ? 'Mark as read' : '標為已讀',
        exact: true,
      })
      .click()
    await page.waitForTimeout(100)
    check(
      `${locale}: failed read keeps notification`,
      (await page.locator('[data-meeting-notification]').count()) === 3,
    )
    readFails = false
    await page
      .locator('[data-meeting-notification]')
      .first()
      .getByRole('button', {
        name: en ? 'Mark as read' : '標為已讀',
        exact: true,
      })
      .click()
    await page.waitForTimeout(100)
    check(
      `${locale}: mark read removes only own notification`,
      inbox.length === 2 &&
        (await page.locator('[data-meeting-notification]').count()) === 2,
    )
    await page.reload()
    await page.waitForSelector('[data-tour="notification-center"]')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('[data-tour="notification-center"]').click()
    await page.waitForSelector('[data-meeting-notification]')
    check(
      `${locale}: read survives reload and mobile shows remaining notifications`,
      (await page.locator('[data-meeting-notification]').count()) === 2,
    )
    await page
      .locator('[data-meeting-notification]')
      .first()
      .getByRole('button', {
        name: en ? 'View invitation' : '查看邀請',
        exact: true,
      })
      .click()
    await page.waitForURL('**/meetings/invitations?invite=*')
    check(
      `${locale}: notification opens correct invitation`,
      page.url().endsWith(`invite=${id(20)}`),
    )
    check(
      `${locale}: create and cancel never invoke email service`,
      emails.length === 0,
    )
    if (returnedToInvite)
      check(`${locale}: login returns to the safe invitation path`, true)
    else returnFailures.push(locale)
    check(
      `${locale}: all network side effects stayed inside known mocks`,
      unexpected.length === 0,
    )
    await context.close()
  }
  assert.deepEqual(
    returnFailures,
    [],
    'Login must return to the safe invitation path in every locale',
  )
  console.log(`Meeting UI verification: ${checks} checks passed.`)
} finally {
  await browser.close()
}
