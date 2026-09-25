// Historical probe: use an isolated test project; may write/delete test data.
if (!process.env.E2E_SECONDARY_EMAIL || !process.env.E2E_SECONDARY_PASSWORD) throw new Error('Set E2E_SECONDARY_EMAIL and E2E_SECONDARY_PASSWORD for an isolated test account');
// P2 security attack-replay for calendar sharing (auditor checklist items
// 1-5, 8 at the wire level; anon/token/EXECUTE items covered by
// tmp-share-rpc-verify.mjs and the management-API audit).
// Focus here: field whitelist under FULL detail, busy-title stripping,
// default-deny for ungranted & orphaned slot types, and the
// recurring-master-outside-range rule. Pure REST/RPC — no UI.
import { readFileSync } from 'node:fs'

const parse = (f) => Object.fromEntries(readFileSync(f, 'utf8').split('\n')
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
const e2e = parse('.env.e2e.local')
const adm = parse('.env.admin.local')
const URL_ = adm.SUPABASE_URL
const ANON = adm.SUPABASE_ANON_KEY

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n} — ${d}`) } }

const api = async (jwt, method, path, body) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method, headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const t = await r.text(); let b; try { b = JSON.parse(t) } catch { b = t }
  return { status: r.status, body: b }
}
const rpc = (jwt, fn, args) => api(jwt, 'POST', `rpc/${fn}`, args ?? {})
const signIn = async (email, password) => {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((x) => x.json())
  if (!r.access_token) throw new Error(`signIn ${email}: ${JSON.stringify(r)}`)
  return { jwt: r.access_token, id: r.user.id }
}

const A = await signIn(e2e.E2E_EMAIL, e2e.E2E_PASSWORD)
const B = await signIn(process.env.E2E_SECONDARY_EMAIL, process.env.E2E_SECONDARY_PASSWORD)
const today = new Date().toISOString().slice(0, 10)
const past = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)

// setup relationship
await api(A.jwt, 'DELETE', `calendar_shares?or=(user_lo.eq.${A.id},user_hi.eq.${A.id})`)
await api(A.jwt, 'DELETE', `calendar_share_invites?inviter_id=eq.${A.id}`)
const token = (await rpc(A.jwt, 'create_share_invite')).body
const shareId = (await rpc(B.jwt, 'accept_share_invite', { p_token: token })).body
console.log(`share ${shareId} established`)

const ws = (await api(A.jwt, 'GET', 'workspaces?select=id&limit=1')).body[0].id
const cat = (await api(A.jwt, 'GET', `categories?select=id&workspace_id=eq.${ws}&limit=1`)).body[0].id

// grants: workspace FULL + slot_type tmpz BUSY (custom type created just for this)
const slotType = (await api(A.jwt, 'POST', 'slot_types', {
  user_id: A.id, key: 'tmpz-attack', label: 'TMPZ', icon: 'Clock', color: '#123456',
})).body[0]
await api(A.jwt, 'POST', 'calendar_share_grants', { share_id: shareId, owner_id: A.id, kind: 'workspace', ref: ws, detail: 'full' })
await api(A.jwt, 'POST', 'calendar_share_grants', { share_id: shareId, owner_id: A.id, kind: 'slot_type', ref: 'tmpz-attack', detail: 'busy' })

// seed: meeting task w/ sensitive fields; recurring master far in the past;
// granted-type block; ungranted-type block
const meeting = (await api(A.jwt, 'POST', 'tasks', {
  user_id: A.id, workspace_id: ws, category_id: cat, title: 'ATTACK-MEETING',
  description: 'SECRET-DESC', notes: 'SECRET-NOTES', is_meeting: true,
  attendees: 'SECRET-PEOPLE', location: 'SECRET-ROOM', meeting_url: 'https://secret.example/join',
  scheduled_date: today, scheduled_start_time: '22:00', scheduled_end_time: '22:30',
})).body[0]
const recur = (await api(A.jwt, 'POST', 'tasks', {
  user_id: A.id, workspace_id: ws, category_id: cat, title: 'ATTACK-WEEKLY',
  scheduled_date: past, scheduled_start_time: '21:00', scheduled_end_time: '21:30',
  is_recurring: true, recurrence_type: 'weekly', recurrence_interval: 1,
})).body[0]
const blockOk = (await api(A.jwt, 'POST', 'time_blocks', {
  user_id: A.id, date: today, start_time: '20:00', end_time: '20:30', type: 'tmpz-attack', label: 'SECRET-BLOCK', color: '#123456',
})).body[0]
const blockNo = (await api(A.jwt, 'POST', 'time_blocks', {
  user_id: A.id, date: today, start_time: '19:00', end_time: '19:30', type: 'break', label: 'UNGRANTED-BLOCK', color: '#999999',
})).body[0]

console.log('\n[replay] field whitelist / default-deny / recurrence')
const cal = (await rpc(B.jwt, 'get_shared_calendar', { p_peer: A.id, p_from: today, p_to: today })).body
const mRow = cal.find((r) => r.id === meeting.id)
ok('full 模式回傳會議任務且含標題', !!mRow && mRow.title === 'ATTACK-MEETING', JSON.stringify(mRow))
ok('full 模式仍無任何敏感欄位（meeting_url/attendees/location/description/notes）',
  !!mRow && ['meeting_url', 'attendees', 'location', 'description', 'notes', 'is_meeting'].every((k) => !(k in mRow)),
  JSON.stringify(mRow && Object.keys(mRow)))
ok('回傳 JSON 全文不含任何 SECRET 字串', !JSON.stringify(cal).includes('SECRET'), 'leak!')
const bRow = cal.find((r) => r.id === blockOk.id)
ok('busy slot_type 區塊在、無標題', !!bRow && bRow.title === null && bRow.type_key === 'tmpz-attack', JSON.stringify(bRow))
ok('未授權類型（break）區塊整列不出現', !cal.some((r) => r.id === blockNo.id), JSON.stringify(cal.map((r) => r.id)))
const rRow = cal.find((r) => r.id === recur.id)
ok('起始日在範圍外的每週重複 master 有回傳', !!rRow && rRow.is_recurring === true, JSON.stringify(cal.map((r) => [r.id, r.is_recurring])))

console.log('\n[replay] orphaned slot type → default-deny')
await api(A.jwt, 'DELETE', `slot_types?id=eq.${slotType.id}`)
const cal2 = (await rpc(B.jwt, 'get_shared_calendar', { p_peer: A.id, p_from: today, p_to: today })).body
ok('slot type 刪除後其區塊立刻消失（grant 殘留也不洩）', !cal2.some((r) => r.id === blockOk.id), JSON.stringify(cal2.map((r) => r.id)))

console.log('\n[replay] range guard')
const badRange = await rpc(B.jwt, 'get_shared_calendar', { p_peer: A.id, p_from: '2020-01-01', p_to: '2030-01-01' })
ok('超過 400 天的範圍被拒', badRange.status >= 400, JSON.stringify(badRange))

// cleanup
for (const id of [meeting.id, recur.id]) await api(A.jwt, 'DELETE', `tasks?id=eq.${id}`)
for (const id of [blockOk.id, blockNo.id]) await api(A.jwt, 'DELETE', `time_blocks?id=eq.${id}`)
await api(A.jwt, 'DELETE', `calendar_shares?id=eq.${shareId}`)
await api(A.jwt, 'DELETE', `calendar_share_invites?inviter_id=eq.${A.id}`)
const left = (await api(A.jwt, 'GET', `tasks?select=id&title=like.ATTACK-%`)).body
ok('清理完成（無 ATTACK 殘留）', Array.isArray(left) && left.length === 0, JSON.stringify(left))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
