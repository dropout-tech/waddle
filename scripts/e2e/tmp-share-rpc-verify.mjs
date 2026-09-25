// Historical probe: use an isolated test project; may write/delete test data.
if (!process.env.E2E_SECONDARY_EMAIL || !process.env.E2E_SECONDARY_PASSWORD) throw new Error('Set E2E_SECONDARY_EMAIL and E2E_SECONDARY_PASSWORD for an isolated test account');
// Wire-level verification of migration 0016 (calendar sharing RPCs + RLS).
// Runs against the live Supabase project with the e2e test account (A) and a
// dedicated second test account (B, created via service_role admin API).
// Deterministic assertions; stdout is the evidence. Cleans up shares/invites;
// keeps account B for future sharing e2e.
import { readFileSync } from 'node:fs'

const env = {}
for (const f of ['.env.e2e.local', '.env.admin.local']) {
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
}
const URL_ = env.SUPABASE_URL
const ANON = env.SUPABASE_ANON_KEY
const SR = env.SUPABASE_SERVICE_ROLE_KEY
const A_EMAIL = env.E2E_EMAIL
const A_PASS = env.E2E_PASSWORD
const B_EMAIL = process.env.E2E_SECONDARY_EMAIL
const B_PASS = process.env.E2E_SECONDARY_PASSWORD

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} — ${detail}`) }
}

const rpc = async (fn, args, jwt) => {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify(args ?? {}),
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body }
}

const rest = async (method, path, jwt, body) => {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = text }
  return { status: res.status, body: parsed }
}

const signIn = async (email, password) => {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!body.access_token) throw new Error(`signIn ${email} failed: ${JSON.stringify(body)}`)
  return { jwt: body.access_token, id: body.user.id }
}

// ── 0. ensure account B exists (admin API, email pre-confirmed) ──────────────
const adminHeaders = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' }
{
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email: B_EMAIL, password: B_PASS, email_confirm: true }),
  })
  const body = await res.json()
  if (res.status === 200 || res.status === 201) console.log(`account B created (${body.id})`)
  else if (JSON.stringify(body).includes('already')) console.log('account B already exists')
  else throw new Error(`admin create B failed: ${res.status} ${JSON.stringify(body)}`)
}

const A = await signIn(A_EMAIL, A_PASS)
const B = await signIn(B_EMAIL, B_PASS)
console.log(`signed in A=${A.id} B=${B.id}`)

// pre-clean: drop any leftover share between A and B from earlier runs
await rest('DELETE', `calendar_shares?or=(user_lo.eq.${A.id},user_hi.eq.${A.id})`, A.jwt)
await rest('DELETE', `calendar_share_invites?inviter_id=eq.${A.id}`, A.jwt)

console.log('\n[1] invite minting & anon lockout')
const mint = await rpc('create_share_invite', {}, A.jwt)
ok('A mints invite token', mint.status === 200 && typeof mint.body === 'string' && mint.body.length >= 40, JSON.stringify(mint))
const TOKEN = mint.body

const anonMint = await rpc('create_share_invite', {}, null)
ok('anon cannot call create_share_invite', anonMint.status === 401 || anonMint.status === 403 || anonMint.status === 404, JSON.stringify(anonMint))
const anonCal = await rpc('get_shared_calendar', { p_peer: A.id, p_from: '2026-07-01', p_to: '2026-07-31' }, null)
ok('anon cannot call get_shared_calendar', anonCal.status === 401 || anonCal.status === 403 || anonCal.status === 404, JSON.stringify(anonCal))

console.log('\n[2] preview / accept / single-use')
const prev = await rpc('preview_share_invite', { p_token: TOKEN }, B.jwt)
ok('B previews inviter profile', prev.status === 200 && Array.isArray(prev.body) && prev.body.length === 1, JSON.stringify(prev))
const prevBad = await rpc('preview_share_invite', { p_token: 'garbage-token' }, B.jwt)
const prevSelf = await rpc('preview_share_invite', { p_token: TOKEN }, A.jwt)
ok('bad token and self-preview yield the SAME uniform error',
  prevBad.status >= 400 && prevSelf.status >= 400 &&
  JSON.stringify(prevBad.body?.message) === JSON.stringify(prevSelf.body?.message),
  JSON.stringify({ prevBad, prevSelf }))

const acc = await rpc('accept_share_invite', { p_token: TOKEN }, B.jwt)
ok('B accepts → share id', acc.status === 200 && typeof acc.body === 'string' && acc.body.length === 36, JSON.stringify(acc))
const SHARE_ID = acc.body
const acc2 = await rpc('accept_share_invite', { p_token: TOKEN }, B.jwt)
ok('token is single-use (2nd accept rejected)', acc2.status >= 400, JSON.stringify(acc2))

console.log('\n[3] peers visibility')
const peersA = await rpc('get_share_peers', {}, A.jwt)
ok('A sees B as peer', peersA.status === 200 && Array.isArray(peersA.body) && peersA.body.some((p) => p.peer_id === B.id), JSON.stringify(peersA.body))
const peersB = await rpc('get_share_peers', {}, B.jwt)
ok('B sees A as peer', peersB.status === 200 && peersB.body.some?.((p) => p.peer_id === A.id), JSON.stringify(peersB.body))

console.log('\n[4] default-deny & RLS walls')
const cal0 = await rpc('get_shared_calendar', { p_peer: A.id, p_from: '2026-07-01', p_to: '2026-07-31' }, B.jwt)
ok('no grants → B sees empty calendar', cal0.status === 200 && Array.isArray(cal0.body) && cal0.body.length === 0, JSON.stringify(cal0))
const tasksB = await rest('GET', 'tasks?select=id&limit=5', B.jwt)
ok("B cannot read A's tasks via REST (RLS)", tasksB.status === 200 && tasksB.body.length === 0, JSON.stringify(tasksB))
const noRel = await rpc('get_shared_calendar', { p_peer: B.id, p_from: '2026-07-01', p_to: '2026-07-31' }, A.jwt)
ok('viewer↔peer reversed but no grants → empty too', noRel.status === 200 && noRel.body.length === 0, JSON.stringify(noRel))

console.log('\n[5] grant spoofing attempts')
const wsA = await rest('GET', 'workspaces?select=id&limit=1', A.jwt)
const A_WS = wsA.body[0]?.id
ok("fetched one of A's workspace ids", !!A_WS, JSON.stringify(wsA))
const spoofOwner = await rest('POST', 'calendar_share_grants', B.jwt,
  { share_id: SHARE_ID, owner_id: A.id, kind: 'workspace', ref: A_WS, detail: 'full' })
ok('B cannot insert a grant impersonating A as owner', spoofOwner.status >= 400, JSON.stringify(spoofOwner))
const spoofRef = await rest('POST', 'calendar_share_grants', B.jwt,
  { share_id: SHARE_ID, owner_id: B.id, kind: 'workspace', ref: A_WS, detail: 'full' })
ok("B cannot grant A's workspace as their own ref", spoofRef.status >= 400, JSON.stringify(spoofRef))

console.log('\n[6] a real grant round-trip (A grants → B sees, busy hides title)')
const grant = await rest('POST', 'calendar_share_grants', A.jwt,
  { share_id: SHARE_ID, owner_id: A.id, kind: 'workspace', ref: A_WS, detail: 'busy' })
ok('A inserts own busy grant for own workspace', grant.status === 201, JSON.stringify(grant))
// seed one scheduled task for A in that workspace (today), then read as B
const catA = await rest('GET', `categories?select=id&workspace_id=eq.${A_WS}&limit=1`, A.jwt)
const A_CAT = catA.body[0]?.id
let taskId = null
if (A_CAT) {
  const today = new Date().toISOString().slice(0, 10)
  const t = await rest('POST', 'tasks', A.jwt, {
    user_id: A.id, workspace_id: A_WS, category_id: A_CAT,
    title: 'SHARETEST-SECRET-TITLE', scheduled_date: today,
    scheduled_start_time: '23:00', scheduled_end_time: '23:15',
  })
  taskId = t.body?.[0]?.id ?? null
  ok('seeded a scheduled task for A', t.status === 201, JSON.stringify(t.body).slice(0, 200))
  const cal1 = await rpc('get_shared_calendar', { p_peer: A.id, p_from: today, p_to: today }, B.jwt)
  const row = Array.isArray(cal1.body) ? cal1.body.find((r) => r.id === taskId) : null
  ok('B sees the busy row (time visible)', !!row && row.start_time === '23:00:00', JSON.stringify(cal1.body).slice(0, 300))
  ok('busy row leaks NO title', !!row && row.title === null, JSON.stringify(row))
  ok('busy row has NO extra fields (whitelist shape)',
    !!row && ['description', 'notes', 'attendees', 'location', 'meeting_url'].every((k) => !(k in row)),
    JSON.stringify(row && Object.keys(row)))
} else {
  ok('seeded a scheduled task for A', false, 'no category found in workspace A')
}

console.log('\n[7] revocation')
const del = await rest('DELETE', `calendar_shares?id=eq.${SHARE_ID}`, B.jwt)
ok('B can dissolve the share', del.status === 200 || del.status === 204, JSON.stringify(del))
const calAfter = await rpc('get_shared_calendar', { p_peer: A.id, p_from: '2026-07-01', p_to: '2026-07-31' }, B.jwt)
ok('after dissolve → empty result', calAfter.status === 200 && calAfter.body.length === 0, JSON.stringify(calAfter))
const grantsLeft = await rest('GET', `calendar_share_grants?share_id=eq.${SHARE_ID}`, A.jwt)
ok('grants cascaded away', grantsLeft.status === 200 && grantsLeft.body.length === 0, JSON.stringify(grantsLeft))

// cleanup: test task + A's invites
if (taskId) await rest('DELETE', `tasks?id=eq.${taskId}`, A.jwt)
await rest('DELETE', `calendar_share_invites?inviter_id=eq.${A.id}`, A.jwt)
const leftover = await rest('GET', `tasks?select=id&title=eq.SHARETEST-SECRET-TITLE`, A.jwt)
ok('cleanup: test task gone', leftover.body.length === 0, JSON.stringify(leftover))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
