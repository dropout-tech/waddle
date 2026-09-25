import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
const source = fs
  .readFileSync(
    new URL(
      '../../supabase/functions/send-meeting-invitations/index.ts',
      import.meta.url,
    ),
    'utf8',
  )
  .replace(/^import .*\n/, '')
const js = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  },
}).outputText
async function setup(options = {}) {
  let handler,
    sends = [],
    updates = []
  const env = {
    SUPABASE_URL: 'https://example.invalid',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    RESEND_API_KEY: 'test-key',
    MEETING_EMAIL_FROM: 'Huddle <test@example.invalid>',
    APP_SITE_URL: 'https://huddle.example',
    ...options.env,
  }
  const meeting = {
    id: '10000000-0000-0000-0000-000000000001',
    organizer_id: 'owner',
    title: '<img src=x onerror=alert(1)>',
    description: 'a & b',
    location: 'room',
    starts_at: '2026-10-01T01:00:00Z',
    ends_at: '2026-10-01T02:00:00Z',
    time_zone: 'Asia/Taipei',
    status: options.cancelled ? 'cancelled' : 'active',
  }
  const rows = options.rows ?? [
    {
      id: 'mail-1',
      recipient_id: 'peer',
      status: 'pending',
      first_attempt_at: null,
    },
  ]
  const admin = {
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { email: 'private@example.invalid' } },
          error: null,
        }),
      },
    },
    from(table) {
      let patch,
        filters = []
      const q = {
        select() {
          return q
        },
        eq(...args) {
          filters.push(args)
          return q
        },
        neq() {
          return q
        },
        is() {
          return q
        },
        update(value) {
          patch = value
          return q
        },
        maybeSingle() {
          return Promise.resolve({
            data: options.notOwner ? null : meeting,
            error: null,
          })
        },
        then(resolve) {
          if (patch) {
            updates.push(patch)
            return Promise.resolve({ error: null }).then(resolve)
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve)
        },
      }
      return q
    },
  }
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options.invalidAuth ? null : { id: 'owner' } },
        error: null,
      }),
    },
  }
  vm.runInNewContext(js, {
    Deno: { env: { get: (k) => env[k] }, serve: (fn) => (handler = fn) },
    createClient: (url, key) => (key === 'service' ? admin : client),
    Response,
    Request,
    URL,
    AbortSignal,
    Date,
    fetch: async (url, req) => {
      sends.push({ url, ...req })
      return new Response('{}', { status: options.providerFailure ? 500 : 200 })
    },
  })
  const res = await handler(
    new Request('https://local.invalid', {
      method: 'POST',
      headers: options.noToken ? {} : { Authorization: 'Bearer test' },
      body: JSON.stringify({ meeting_id: meeting.id }),
    }),
  )
  return { res, data: await res.json(), sends, updates }
}
let r = await setup({ noToken: true })
assert.equal(r.res.status, 401)
assert.equal(r.sends.length, 0)
r = await setup({ invalidAuth: true })
assert.equal(r.res.status, 401)
r = await setup({ notOwner: true })
assert.equal(r.res.status, 403)
assert.equal(r.sends.length, 0)
r = await setup({ env: { RESEND_API_KEY: undefined } })
assert.equal(r.res.status, 503)
assert.equal(r.data.error, 'email_not_configured')
assert.equal(r.updates.length, 0)
r = await setup()
assert.equal(r.data.sent, 1)
assert.equal(r.sends[0].headers['Idempotency-Key'], 'huddle-meeting/mail-1')
const body = JSON.parse(r.sends[0].body)
assert.ok(body.html.includes('&lt;img'))
assert.ok(!body.html.includes('<img'))
assert.ok(body.html.includes('/meetings/invitations?invite='))
assert.ok(body.html.includes('9:00'))
assert.ok(!body.html.includes('01:00:00Z'))
assert.ok(!JSON.stringify(r.data).includes('private@'))
r = await setup({
  rows: [{ id: 'mail-1', recipient_id: 'peer', status: 'sent' }],
})
assert.equal(r.sends.length, 0)
assert.equal(r.data.sent, 1)
r = await setup({ providerFailure: true })
assert.equal(r.data.failed, 1)
assert.ok(!r.updates.some((x) => x.status === 'sent'))
r = await setup({
  rows: [
    {
      id: 'mail-1',
      recipient_id: 'peer',
      status: 'failed',
      first_attempt_at: new Date(Date.now() - 25 * 3600000).toISOString(),
    },
  ],
})
assert.equal(r.sends.length, 0)
assert.equal(r.updates[0].last_error, 'delivery_reconciliation_required')
r = await setup({ cancelled: true })
assert.ok(JSON.parse(r.sends[0].body).subject.includes('Cancelled'))
console.log(
  'PASS: 9 email handler scenarios; auth/ownership, missing configuration, escaped bilingual email, idempotency, prior sent, provider failure, expired retry and cancellation. No network requests.',
)
