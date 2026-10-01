// Google Calendar (read-only) Edge handler — mock Google + mock Supabase.
// No network, no real credentials: the AES key is generated per run.
//   node scripts/test/google-calendar-handler-verify.mjs
import fs from 'node:fs'
import vm from 'node:vm'
import { randomBytes } from 'node:crypto'
import ts from 'typescript'
import * as core from '../../supabase/functions/google-calendar/core.mjs'

const source = fs.readFileSync(new URL('../../supabase/functions/google-calendar/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*\n/gm, '').replace('export async function handler', 'async function handler')
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText

const uid = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002'
const session = '10000000-0000-4000-8000-000000000001'
const key = randomBytes(32).toString('base64url')
const REFRESH = 'rt-' + randomBytes(12).toString('hex'), ACCESS = 'at-' + randomBytes(12).toString('hex'), ACCESS2 = 'at2-' + randomBytes(12).toString('hex')
const jwtFor = (sid) => 'x.' + Buffer.from(JSON.stringify({ session_id: sid })).toString('base64url') + '.x'
const allResponses = []

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) pass++; else fail++; console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`) }

async function setup(o = {}) {
  let handler
  const calls = []
  const tables = {
    google_calendar_connections: [
      ...(o.connected ? [{ user_id: uid, refresh_cipher: await core.seal(REFRESH, key, uid), scope: core.SCOPE, status: 'connected', share_busy: true, ...o.connection }] : []),
      // other users' connections: refresh token 'rt-<user>' sealed under THEIR id
      ...await Promise.all((o.others || []).map(async (c) => ({ user_id: c.user_id, refresh_cipher: await core.seal('rt-' + c.user_id, key, c.user_id), scope: core.SCOPE, status: 'connected', share_busy: true, ...c }))),
    ],
    google_calendar_oauth_states: [],
  }
  const admin = {
    auth: { getUser: async () => ({ data: { user: o.badAuth ? null : { id: uid, is_anonymous: false } }, error: null }) },
    rpc: async (name) => name === 'account_access_allowed' ? { data: !o.suspended, error: null } : { data: null, error: 'unknown rpc' },
    from(table) {
      let mode = 'select', patch, single = false
      const filters = []
      const q = {
        select() { return q }, eq(k, v) { filters.push((r) => r[k] === v); return q }, in(k, v) { filters.push((r) => v.includes(r[k])); return q }, gt(k, v) { filters.push((r) => r[k] > v); return q }, lt(k, v) { filters.push((r) => r[k] < v); return q },
        update(p) { mode = 'update'; patch = p; return q }, insert(p) { mode = 'insert'; patch = p; return q }, upsert(p) { mode = 'upsert'; patch = p; return q }, delete() { mode = 'delete'; return q }, maybeSingle() { single = true; return q },
        then(resolve, reject) {
          let found = tables[table].filter((r) => filters.every((fn) => fn(r)))
          if (mode === 'insert') { const row = { ...patch }; if (table === 'google_calendar_oauth_states') row.expires_at = new Date(Date.now() + 600000).toISOString(); tables[table].push(row); found = [row] }
          if (mode === 'upsert') { const ex = tables[table].find((r) => r.user_id === patch.user_id); if (ex) Object.assign(ex, patch); else tables[table].push({ ...patch }); found = [] }
          if (mode === 'update') found.forEach((r) => Object.assign(r, patch))
          if (mode === 'delete') tables[table] = tables[table].filter((r) => !found.includes(r))
          return Promise.resolve({ data: single ? found[0] || null : found, error: null }).then(resolve, reject)
        },
      }
      return q
    },
  }
  // The caller-JWT client (anon key): get_share_peers + calendar_share_grants under the caller's RLS.
  const callerCalls = []
  const asCaller = {
    rpc(name) { callerCalls.push(name); const q = { order() { return q }, range() { return q }, then(res, rej) { return Promise.resolve(name === 'get_share_peers' ? { data: o.sharePeers || [], error: null } : { data: null, error: 'unknown rpc' }).then(res, rej) } }; return q },
    from(table) { callerCalls.push(table); let ids = []; const q = { select() { return q }, in(_k, v) { ids = v; return q }, limit() { return q }, then(res, rej) { return Promise.resolve({ data: table === 'calendar_share_grants' ? (o.grants || []).filter((g) => ids.includes(g.owner_id)) : null, error: table === 'calendar_share_grants' ? null : 'no' }).then(res, rej) } }; return q },
  }
  const env = { SUPABASE_URL: 'https://fake.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', GOOGLE_CALENDAR_CLIENT_ID: 'client', GOOGLE_CALENDAR_CLIENT_SECRET: 'secret', GOOGLE_CALENDAR_TOKEN_KEY: key, GOOGLE_CALENDAR_REDIRECT_URI: 'https://app.invalid/settings/google-calendar/callback', ...o.env }
  let eventGets = 0, tokenCalls = 0
  const fetchMock = async (url, req = {}) => {
    calls.push({ url: String(url), ...req })
    if (String(url).includes('oauth2.googleapis.com/token')) {
      tokenCalls++
      const p = new URLSearchParams(req.body)
      if (o.invalidGrant && p.get('grant_type') === 'refresh_token') return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
      if (p.get('grant_type') === 'refresh_token' && p.get('refresh_token').startsWith('rt-0')) {
        if ((o.badRefresh || []).includes(p.get('refresh_token').slice(3))) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
        return new Response(JSON.stringify({ access_token: 'at-for-' + p.get('refresh_token').slice(3) }))
      }
      if (p.get('grant_type') === 'authorization_code') return new Response(JSON.stringify(o.codeToken ?? { access_token: ACCESS, refresh_token: REFRESH, scope: `openid ${core.SCOPE}` }))
      return new Response(JSON.stringify({ access_token: tokenCalls > 1 ? ACCESS2 : ACCESS }))
    }
    if (String(url).includes('/revoke')) return new Response('{}', { status: o.revokeFailure ? 500 : 200 })
    if (String(url).startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events')) {
      eventGets++
      if (o.first401 && eventGets === 1) return new Response('{}', { status: 401 })
      const token = new URL(url).searchParams.get('pageToken') || ''
      const bearer = (req.headers?.Authorization || '').replace('Bearer ', '')
      if (bearer.startsWith('at-for-')) return new Response(JSON.stringify({ items: (o.userItems || {})[bearer.slice(7)] || [] }))
      const page = (o.pages || { '': { items: [] } })[token]
      return new Response(JSON.stringify(page))
    }
    throw Error('unexpected fetch ' + url)
  }
  vm.runInNewContext(js, { ...core, Deno: { env: { get: (k) => env[k] }, serve: (fn) => { handler = fn } }, createClient: (_url, k) => (k === 'anon' ? asCaller : admin), crypto, Response, Request, URL, URLSearchParams, AbortSignal, Date, JSON, atob, setTimeout, fetch: fetchMock, Error })
  const send = async (body, sid = session, headers, origin) => {
    const res = await handler(new Request('https://fake.invalid', { method: 'POST', headers: { ...(headers ?? (o.noToken ? {} : { Authorization: 'Bearer ' + jwtFor(sid) })), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) }))
    const text = await res.text(); allResponses.push(text)
    return { http: res.status, ...JSON.parse(text) }
  }
  return { send, tables, calls, callerCalls, counts: () => ({ eventGets, tokenCalls }) }
}
const busyRange = () => ({ time_min: new Date(Date.now() + 3600000).toISOString(), time_max: new Date(Date.now() + 10 * 86400000).toISOString() })
const range = (days = 60) => { const a = new Date('2026-09-01T00:00:00+08:00'); return { time_min: a.toISOString(), time_max: new Date(a.getTime() + days * 86400000).toISOString() } }

// ── auth ──
{ const m = await setup({ noToken: true }); ok((await m.send({ action: 'status' })).http === 401 && m.calls.length === 0, 'no JWT → 401, no outbound call') }
{ const m = await setup({ badAuth: true }); ok((await m.send({ action: 'status' })).http === 401, 'invalid JWT → 401') }
{ const m = await setup({ suspended: true, connected: true }); const r = await m.send({ action: 'events', ...range() }); ok(r.http === 403 && m.calls.length === 0, 'suspended account → 403 before touching Google') }

// ── configuration switch ──
{ const m = await setup({ env: { GOOGLE_CALENDAR_CLIENT_ID: '' } }); const s = await m.send({ action: 'status' }); ok(s.configured === false && s.connected === false, 'missing CLIENT_ID → status configured:false'); const st = await m.send({ action: 'start' }); ok(st.http === 503 && st.error === 'not_configured', 'unconfigured start → 503 not_configured') }
for (const k of ['GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_TOKEN_KEY', 'GOOGLE_CALENDAR_REDIRECT_URI']) { const m = await setup({ env: { [k]: '' } }); ok((await m.send({ action: 'status' })).configured === false, `missing ${k} → configured:false`) }
{ const m = await setup(); ok((await m.send({ action: 'status' })).configured === true, 'all four env vars → configured:true') }

// ── start: PKCE S256 + scope ──
{
  const m = await setup()
  const start = await m.send({ action: 'start' })
  const url = new URL(start.url)
  ok(url.origin === 'https://accounts.google.com' && url.searchParams.get('scope') === core.SCOPE, `start URL requests only ${core.SCOPE}`)
  ok(url.searchParams.get('code_challenge_method') === 'S256' && url.searchParams.get('access_type') === 'offline', 'start URL uses PKCE S256 + offline access')
  const row = m.tables.google_calendar_oauth_states[0]
  const verifier = await core.unseal(row.verifier_cipher, key, uid)
  ok(url.searchParams.get('code_challenge') === await core.hash(verifier), 'code_challenge = SHA-256(verifier); verifier only stored sealed')
  ok(row.state_hash === await core.hash(url.searchParams.get('state')) && !JSON.stringify(row).includes(url.searchParams.get('state')), 'state stored only as hash')
  ok(!JSON.stringify(start).includes(verifier), 'start response does not leak the PKCE verifier')
}

// ── finish: expiry / replay / session / user / scope ──
{
  const m = await setup(); const state = new URL((await m.send({ action: 'start' })).url).searchParams.get('state')
  m.tables.google_calendar_oauth_states[0].expires_at = new Date(Date.now() - 1000).toISOString()
  const r = await m.send({ action: 'finish', state, code: 'code' })
  ok(r.error === 'invalid_state' && m.counts().tokenCalls === 0, 'expired state → invalid_state, no token exchange')
}
{
  const m = await setup(); const state = new URL((await m.send({ action: 'start' })).url).searchParams.get('state')
  const r = await m.send({ action: 'finish', state, code: 'code' }, '10000000-0000-4000-8000-00000000abcd')
  ok(r.error === 'invalid_state' && m.counts().tokenCalls === 0, 'different JWT session → invalid_state')
  m.tables.google_calendar_oauth_states[0].user_id = other
  ok((await m.send({ action: 'finish', state, code: 'code' })).error === 'invalid_state', 'state owned by another user → invalid_state')
}
{
  const m = await setup(); const state = new URL((await m.send({ action: 'start' })).url).searchParams.get('state')
  const r = await m.send({ action: 'finish', state, code: 'code' })
  const conn = m.tables.google_calendar_connections[0]
  ok(r.connected === true && conn && conn.status === 'connected' && conn.scope === core.SCOPE, 'valid finish → connection stored')
  ok(!conn.refresh_cipher.includes(REFRESH) && await core.unseal(conn.refresh_cipher, key, uid) === REFRESH, 'refresh token stored only sealed')
  ok((await m.send({ action: 'finish', state, code: 'code' })).error === 'already_connected', 'replay while connected → rejected')
  conn.status = 'reauth_required' // lift the already_connected guard: the state itself must be spent
  const before = m.counts().tokenCalls
  ok((await m.send({ action: 'finish', state, code: 'code' })).error === 'invalid_state' && m.counts().tokenCalls === before, 'replayed state → invalid_state (one-time), no token exchange')
}
{
  const m = await setup({ codeToken: { access_token: ACCESS, refresh_token: REFRESH, scope: 'openid https://www.googleapis.com/auth/userinfo.email' } })
  const state = new URL((await m.send({ action: 'start' })).url).searchParams.get('state')
  const r = await m.send({ action: 'finish', state, code: 'code' })
  ok(r.error === 'google_permission_denied' && m.tables.google_calendar_connections.length === 0, 'scope without calendar.events.owned.readonly → rejected, nothing stored')
  ok(m.calls.some((c) => c.url.includes('/revoke')), 'rejected grant is revoked at Google')
}
{
  const m = await setup({ codeToken: { access_token: ACCESS, scope: core.SCOPE } })
  const state = new URL((await m.send({ action: 'start' })).url).searchParams.get('state')
  ok((await m.send({ action: 'finish', state, code: 'code' })).error === 'google_permission_denied', 'grant without refresh_token → rejected')
}

// ── events ──
const timed = (id, extra = {}) => ({ id, status: 'confirmed', summary: 'Meet ' + id, start: { dateTime: '2026-09-10T10:00:00+08:00' }, end: { dateTime: '2026-09-10T11:00:00+08:00' }, htmlLink: `https://www.google.com/calendar/event?eid=${id}`, ...extra })
const pages = {
  '': { items: [timed('a1'), timed('cx', { status: 'cancelled' }), timed('dec', { attendees: [{ email: 'x', self: true, responseStatus: 'declined' }] })], nextPageToken: 'p2' },
  p2: { items: [timed('na', { attendees: [{ self: true, responseStatus: 'needsAction' }, { responseStatus: 'accepted' }] }), { id: 'ad', status: 'confirmed', summary: 'Holiday', start: { date: '2026-09-11' }, end: { date: '2026-09-12' } }], nextPageToken: 'p3' },
  p3: { items: [timed('nt', { summary: undefined, htmlLink: 'javascript:alert(1)' }), timed('wl', { eventType: 'workingLocation' })] },
}
{
  const m = await setup({ connected: true, pages })
  const r = await m.send({ action: 'events', ...range() })
  const ids = (r.events || []).map((e) => e.id)
  ok(r.status === 'connected' && m.counts().eventGets === 3 && ['a1', 'na', 'ad', 'nt'].every((x) => ids.includes(x)), `3 pages merged (${ids.join(',')})`)
  const first = m.calls.find((c) => c.url.includes('/calendars/primary/events'))
  const q = new URL(first.url).searchParams
  ok(q.get('singleEvents') === 'true' && q.get('orderBy') === 'startTime' && q.get('timeMin') && q.get('timeMax'), 'query uses primary calendar, singleEvents, orderBy=startTime, timeMin/timeMax')
  ok(!ids.includes('cx') && !ids.includes('dec'), 'cancelled + declined filtered out')
  ok(!ids.includes('wl'), 'workingLocation marker filtered out')
  const byId = Object.fromEntries(r.events.map((e) => [e.id, e]))
  ok(byId.ad.all_day === true && byId.ad.start === '2026-09-11' && byId.ad.end === '2026-09-12', 'all-day event → all_day:true with date-only start/end')
  ok(byId.a1.all_day === false && byId.a1.start === '2026-09-10T10:00:00+08:00', 'timed event keeps Google offset dateTime')
  ok(byId.na.response_status === 'needsAction' && byId.a1.response_status === null, 'response_status from the self attendee (null when organiser-only)')
  ok(byId.nt.title === '' && byId.nt.html_link === null && byId.a1.html_link.startsWith('https://www.google.com/'), 'missing summary → "", non-Google link dropped')
  const keys = new Set(r.events.flatMap((e) => Object.keys(e)))
  ok([...keys].sort().join(',') === 'all_day,end,html_link,id,location,response_status,start,title', `only minimal fields returned (${[...keys].sort().join(',')})`)
  ok(!m.tables.google_calendar_connections.some((row) => JSON.stringify(row).includes('Meet ')), 'no event content written to the DB')
}
{
  const m = await setup({ connected: true, first401: true, pages: { '': { items: [timed('x1')] } } })
  const r = await m.send({ action: 'events', ...range() })
  const auths = m.calls.filter((c) => c.url.includes('/calendars/primary/events')).map((c) => c.headers.Authorization)
  ok(r.status === 'connected' && r.events.length === 1 && m.counts().tokenCalls === 2 && auths[1] === 'Bearer ' + ACCESS2, '401 → one refresh → retried with new access token')
}
{
  const m = await setup({ connected: true, invalidGrant: true })
  const r = await m.send({ action: 'events', ...range() })
  ok(r.http === 200 && r.status === 'reauth_required' && Array.isArray(r.events) && r.events.length === 0, 'invalid_grant → 200 {status:reauth_required}, not 500')
  ok(m.tables.google_calendar_connections[0].status === 'reauth_required', 'connection marked reauth_required')
  const before = m.counts().tokenCalls
  const again = await m.send({ action: 'events', ...range() })
  ok(again.status === 'reauth_required' && m.counts().tokenCalls === before, 'while reauth_required, events does not call Google')
  ok((await m.send({ action: 'status' })).status === 'reauth_required', 'status reports reauth_required')
  ok(typeof (await m.send({ action: 'start' })).url === 'string', 'reauth_required connection may start OAuth again')
}
{
  const m = await setup({ connected: true })
  ok((await m.send({ action: 'events', ...range(121) })).error === 'invalid_range', '121-day window → invalid_range')
  ok((await m.send({ action: 'events', ...range(120) })).status === 'connected', '120-day window accepted')
  ok((await m.send({ action: 'events', time_min: 'yesterday', time_max: range().time_max })).error === 'invalid_range', 'non-ISO time → invalid_range')
  const r = range(); ok((await m.send({ action: 'events', time_min: r.time_max, time_max: r.time_min })).error === 'invalid_range', 'reversed window → invalid_range')
}
{ const m = await setup(); ok((await m.send({ action: 'events', ...range() })).error === 'not_connected', 'events without connection → not_connected') }

// ── disconnect ──
{
  const m = await setup({ connected: true })
  const r = await m.send({ action: 'disconnect' })
  const rv = m.calls.find((c) => c.url.includes('/revoke'))
  ok(r.connected === false && r.revoked === true && new URLSearchParams(rv.body).get('token') === REFRESH && m.tables.google_calendar_connections.length === 0, 'disconnect revokes at Google and deletes the credential')
}
{ const m = await setup({ connected: true, revokeFailure: true }); const r = await m.send({ action: 'disconnect' }); ok(r.revoked === false && m.tables.google_calendar_connections.length === 0, 'revoke failure still forgets the credential') }
{ const m = await setup({ connected: true }); ok((await m.send({ action: 'nope' })).error === 'invalid_action', 'unknown action → invalid_action') }


// ── busy (約交集): cross-user, busy intervals only ──
{
  const P1 = '00000000-0000-4000-8000-0000000000b1' // share + grant → included
  const P2 = '00000000-0000-4000-8000-0000000000b2' // share, grant only on ANOTHER share → ignored
  const P3 = '00000000-0000-4000-8000-0000000000b3' // stranger (no share) → ignored
  const P4 = '00000000-0000-4000-8000-0000000000b4' // share + grant but share_busy=false → not returned
  const P5 = '00000000-0000-4000-8000-0000000000b5' // share + grant, Google grant revoked → unavailable
  const secretItems = (tag) => [
    { status: 'confirmed', summary: `SECRET-TITLE-${tag}`, location: 'SECRET-LOC', htmlLink: 'https://www.google.com/calendar/event?eid=SECRETID', id: 'SECRETID', start: { dateTime: '2026-09-10T10:00:00+08:00' }, end: { dateTime: '2026-09-10T11:00:00+08:00' } },
    { status: 'confirmed', summary: 'SECRET-free', transparency: 'transparent', start: { dateTime: '2026-09-10T12:00:00+08:00' }, end: { dateTime: '2026-09-10T13:00:00+08:00' } },
    { status: 'cancelled', start: { dateTime: '2026-09-10T14:00:00+08:00' }, end: { dateTime: '2026-09-10T15:00:00+08:00' } },
    { status: 'confirmed', attendees: [{ self: true, responseStatus: 'declined' }], start: { dateTime: '2026-09-10T16:00:00+08:00' }, end: { dateTime: '2026-09-10T17:00:00+08:00' } },
    { status: 'confirmed', start: { date: '2026-09-11' }, end: { date: '2026-09-12' } },
  ]
  const m = await setup({
    connected: true, connection: { share_busy: false }, // own flag off: own searches still count own meetings
    others: [{ user_id: P1 }, { user_id: P2 }, { user_id: P3 }, { user_id: P4, share_busy: false }, { user_id: P5 }],
    sharePeers: [{ share_id: 's1', peer_id: P1 }, { share_id: 's2', peer_id: P2 }, { share_id: 's4', peer_id: P4 }, { share_id: 's5', peer_id: P5 }],
    grants: [{ share_id: 's1', owner_id: P1 }, { share_id: 's9', owner_id: P2 }, { share_id: 's4', owner_id: P4 }, { share_id: 's5', owner_id: P5 }],
    badRefresh: [P5],
    pages: { '': { items: secretItems('own') } },
    userItems: { [P1]: secretItems('p1'), [P2]: secretItems('p2'), [P3]: secretItems('p3'), [P4]: secretItems('p4') },
  })
  const r = await m.send({ action: 'busy', peer_ids: [uid, P1, P2, P3, P4, P5], ...busyRange() })
  const who = new Set((r.busy || []).map((b) => b.user_id))
  ok(r.http === 200 && who.has(uid) && who.has(P1) && who.size === 2, `busy: returns only caller + authorised partner (${[...who].join(',')})`)
  ok(!who.has(P2) && !who.has(P3), 'busy: non-partner and partner-without-grant-on-this-share ignored')
  const refreshed = m.calls.filter((c) => c.url.includes('/token')).map((c) => new URLSearchParams(c.body).get('refresh_token'))
  ok(![P2, P3, P4].some((id) => refreshed.includes('rt-' + id)), 'busy: ignored / opted-out users\' Google grants are never used')
  ok(!who.has(P4), 'busy: share_busy=false partner not returned')
  ok(JSON.stringify(r.unavailable) === JSON.stringify([P5]) && m.tables.google_calendar_connections.find((c) => c.user_id === P5).status === 'reauth_required', 'busy: revoked partner listed in unavailable (request still 200) and marked reauth_required')
  ok(r.busy.every((b) => Object.keys(b).sort().join(',') === 'end,start,user_id'), 'busy: every item is exactly {user_id,start,end}')
  const p1 = r.busy.filter((b) => b.user_id === P1).map((b) => `${b.start}~${b.end}`)
  ok(p1.join('|') === '2026-09-10T10:00:00+08:00~2026-09-10T11:00:00+08:00|2026-09-11~2026-09-12', `busy: transparent / cancelled / declined excluded, opaque all-day kept (${p1.join('|')})`)
  const text = allResponses.at(-1)
  ok(!/SECRET|summary|title|location|html|eid=|at-for-|rt-0/.test(text), 'busy: response has no title / summary / location / link / id / token strings')
  const busyFetch = m.calls.find((c) => c.url.includes('/calendars/primary/events'))
  ok(!/summary|location|htmlLink|\bid\b/.test(new URL(busyFetch.url).searchParams.get('fields')), 'busy: Google is not even asked for titles / places / links / ids')
  ok(m.callerCalls.includes('get_share_peers') && m.callerCalls.includes('calendar_share_grants'), 'busy: partner authorisation runs with the caller\'s JWT (get_share_peers + grants)')
}
{
  const P1 = '00000000-0000-4000-8000-0000000000b1'
  const m = await setup({ others: [{ user_id: P1 }], sharePeers: [{ share_id: 's1', peer_id: P1 }], grants: [{ share_id: 's1', owner_id: P1 }], userItems: { [P1]: [{ status: 'confirmed', start: { dateTime: '2026-09-10T10:00:00Z' }, end: { dateTime: '2026-09-10T11:00:00Z' } }] } })
  const r = await m.send({ action: 'busy', peer_ids: [uid, P1], ...busyRange() })
  ok(r.http === 200 && r.busy.length === 1 && r.busy[0].user_id === P1, 'busy: works when the caller has no Google connection (partner connected)')
}
{
  const m = await setup({ connected: true })
  const stranger = '00000000-0000-4000-8000-0000000000c9'
  const r = await m.send({ action: 'busy', peer_ids: [stranger], ...busyRange() })
  ok(r.http === 200 && r.busy.length === 0 && r.unavailable.length === 0 && m.counts().tokenCalls === 0, 'busy: only unauthorised ids → empty answer, no Google call')
  ok((await m.send({ action: 'busy', peer_ids: Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`), ...busyRange() })).error === 'invalid_peers', 'busy: more than 11 people → invalid_peers')
  ok((await m.send({ action: 'busy', peer_ids: ['not-a-uuid'], ...busyRange() })).error === 'invalid_peers', 'busy: non-uuid id → invalid_peers')
  ok((await m.send({ action: 'busy', peer_ids: [uid], ...range(121) })).error === 'invalid_range', 'busy: >120-day window → invalid_range')
  // strict 約交集 window: no history, ≤ 92 days ahead, ≤ 16 days wide
  const at = (days) => new Date(Date.now() + days * 86400000).toISOString()
  const before = m.counts().tokenCalls
  ok((await m.send({ action: 'busy', peer_ids: [uid], time_min: at(-30), time_max: at(-20) })).error === 'invalid_range', 'busy: past window (30 days ago) → invalid_range')
  ok((await m.send({ action: 'busy', peer_ids: [uid], time_min: at(-1.2), time_max: at(3) })).error === 'invalid_range', 'busy: starting >1 day before now → invalid_range')
  ok((await m.send({ action: 'busy', peer_ids: [uid], time_min: at(200), time_max: at(210) })).error === 'invalid_range', 'busy: far future (200 days ahead) → invalid_range')
  ok((await m.send({ action: 'busy', peer_ids: [uid], time_min: at(85), time_max: at(93) })).error === 'invalid_range', 'busy: ending past the 90+2-day horizon → invalid_range')
  ok((await m.send({ action: 'busy', peer_ids: [uid], time_min: at(1), time_max: at(18) })).error === 'invalid_range', 'busy: 17-day-wide window → invalid_range')
  ok(m.counts().tokenCalls === before, 'busy: rejected windows never touch Google')
  ok((await m.send({ action: 'busy', peer_ids: [uid], time_min: at(-0.5), time_max: at(14.5) })).http === 200 && (await m.send({ action: 'busy', peer_ids: [uid], time_min: at(76), time_max: at(91.5) })).http === 200, 'busy: real 約交集 windows (today+14d, last 15 days before the 90-day horizon) accepted')
  ok((await m.send({ action: 'events', time_min: at(-100), time_max: at(-10) })).status === 'connected', 'events (own calendar) keeps the plain 120-day rule — past months still readable')
}
{ const m = await setup({ env: { GOOGLE_CALENDAR_CLIENT_SECRET: '' } }); const r = await m.send({ action: 'busy', peer_ids: [uid], ...busyRange() }); ok(r.http === 503 && r.error === 'not_configured', 'busy: unconfigured → 503 not_configured (front end treats as "no Google")') }

// ── share_busy toggle ──
{
  const m = await setup({ connected: true })
  ok((await m.send({ action: 'status' })).share_busy === true, 'status: share_busy defaults to true')
  ok((await m.send({ action: 'set_share_busy', value: false })).share_busy === false && m.tables.google_calendar_connections[0].share_busy === false, 'set_share_busy false stored')
  ok((await m.send({ action: 'status' })).share_busy === false, 'status reflects share_busy=false')
  ok((await m.send({ action: 'set_share_busy', value: 'no' })).error === 'invalid_action', 'set_share_busy rejects non-boolean')
}

// ── multi-origin redirect list (GOOGLE_CALENDAR_REDIRECT_URI = "a,b") ──
{
  const A = 'https://old.invalid/settings/google-calendar/callback', B = 'https://new.invalid/settings/google-calendar/callback'
  const redirectOf = (start) => new URL(start.url).searchParams.get('redirect_uri')
  const tokenRedirect = (m) => new URLSearchParams(m.calls.find((c) => c.url.includes('oauth2.googleapis.com/token') && new URLSearchParams(c.body).get('grant_type') === 'authorization_code').body).get('redirect_uri')
  // single URL: unchanged, whatever Origin says
  for (const origin of [undefined, 'https://old.invalid', 'https://evil.example']) {
    const m = await setup(); const st = await m.send({ action: 'start' }, session, undefined, origin)
    ok(redirectOf(st) === 'https://app.invalid/settings/google-calendar/callback', `single URL, Origin ${origin ?? '(none)'} → that one URL (unchanged)`)
  }
  { const m = await setup(); const state = new URL((await m.send({ action: 'start' }, session, undefined, 'https://evil.example')).url).searchParams.get('state'); await m.send({ action: 'finish', state, code: 'c' }, session, undefined, 'https://evil.example'); ok(tokenRedirect(m) === 'https://app.invalid/settings/google-calendar/callback', 'single URL: finish exchanges with that same URL') }
  // two URLs: Origin picks the matching entry; first entry otherwise
  const two = { GOOGLE_CALENDAR_REDIRECT_URI: `${A}, ${B}` }
  for (const [origin, want, label] of [['https://old.invalid', A, 'old origin → old URL'], ['https://new.invalid', B, 'new origin → new URL'], [undefined, A, 'no Origin → first entry'], ['https://stranger.invalid', A, 'unknown Origin → first entry'], ['capacitor://localhost', A, 'native shell Origin → first entry'], ['null', A, 'Origin "null" → first entry'], ['https://new.invalid.evil.example', A, 'look-alike suffix Origin → first entry'], ['https://new.invalid/settings/google-calendar/callback', A, 'Origin carrying a path → first entry']]) {
    const m = await setup({ env: two }); const st = await m.send({ action: 'start' }, session, undefined, origin)
    ok(redirectOf(st) === want, `two URLs: ${label}`)
  }
  // start and finish pick the same entry under the same Origin (Google needs a verbatim match)
  for (const [origin, want] of [['https://new.invalid', B], ['https://old.invalid', A], [undefined, A]]) {
    const m = await setup({ env: two }); const st = await m.send({ action: 'start' }, session, undefined, origin)
    const state = new URL(st.url).searchParams.get('state')
    const fin = await m.send({ action: 'finish', state, code: 'c' }, session, undefined, origin)
    ok(fin.connected === true && redirectOf(st) === want && tokenRedirect(m) === want, `start and finish agree on the same redirect_uri (Origin ${origin ?? '(none)'} → ${want})`)
  }
  // an entry with a bad shape (or an empty slot) switches the whole feature off
  for (const bad of [`${A},http://new.invalid/settings/google-calendar/callback`, `${A},https://new.invalid/wrong-path`, `${A},`, `${A},,${B}`]) {
    const m = await setup({ env: { GOOGLE_CALENDAR_REDIRECT_URI: bad } })
    const s = await m.send({ action: 'status' }, session, undefined, 'https://new.invalid'), st = await m.send({ action: 'start' }, session, undefined, 'https://new.invalid')
    ok(s.configured === false && st.http === 503 && st.error === 'not_configured' && m.calls.length === 0, `invalid list "${bad.slice(0, 60)}" → configured:false, start 503`)
  }
  // a hostile Origin can never put itself into redirect_uri
  for (const evil of ['https://evil.example', 'https://evil.example/settings/google-calendar/callback', 'https://old.invalid@evil.example', 'https://evil.example#https://old.invalid']) {
    const m = await setup({ env: two }); const st = await m.send({ action: 'start' }, session, undefined, evil)
    const state = new URL(st.url).searchParams.get('state')
    await m.send({ action: 'finish', state, code: 'c' }, session, undefined, evil)
    ok(!st.url.includes('evil') && [A, B].includes(redirectOf(st)) && !tokenRedirect(m).includes('evil') && [A, B].includes(tokenRedirect(m)), `hostile Origin "${evil}" → redirect_uri (start and token call) stays inside the secret's list`)
  }
}

// ── no secrets in any response ──
{
  const all = allResponses.join('\n')
  ok(![REFRESH, ACCESS, ACCESS2, key].some((s) => all.includes(s)) && !/refresh_cipher|verifier_cipher|access_token|refresh_token/.test(all), `no token / key / cipher in any of ${allResponses.length} responses`)
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} — PASS ${pass} / FAIL ${fail} (Google Calendar read handler, mock only, no network)`)
process.exit(fail ? 1 : 0)
