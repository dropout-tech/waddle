// Historical probe: use an isolated test project; may write/delete test data.
if (!process.env.E2E_SECONDARY_EMAIL || !process.env.E2E_SECONDARY_PASSWORD) throw new Error('Set E2E_SECONDARY_EMAIL and E2E_SECONDARY_PASSWORD for an isolated test account');
#!/usr/bin/env node
/**
 * P2 self-test: verify the get_shared_calendar RPC field mapping used by
 * hooks/use-calendar-sharing.ts against the live database (deterministic,
 * assertions in code, stdout is the evidence).
 *
 * Steps:
 *  1. Sign in as A (.env.e2e.local) and B (test account) with the anon key.
 *  2. Confirm the A↔B share exists (get_share_peers both ways).
 *  3. As A: create one full workspace grant + one busy workspace grant
 *     (temporary — deleted at the end), plus a probe task in the busy
 *     workspace scheduled today.
 *  4. As B: call get_shared_calendar and assert:
 *     - row shape matches SharedCalendarRow (all expected keys present)
 *     - busy rows have title === null (raw JSON, not UI)
 *     - full rows carry the real title
 *     - time format is HH:MM:SS (the hook slices to HH:mm)
 *  5. Also dump A's slot_types rows (are built-ins stored or not?).
 *  6. Cleanup: remove probe task + the grants created by this script.
 *
 * Run: node scripts/e2e/tmp-share-p2-rpc-verify.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'

function loadEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...loadEnvFile('.env.local'), ...loadEnvFile('.env.e2e.local') }
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL || !ANON) throw new Error('missing supabase env')

const A_EMAIL = env.E2E_EMAIL
const A_PASSWORD = env.E2E_PASSWORD
const B_EMAIL = process.env.E2E_SECONDARY_EMAIL
const B_PASSWORD = process.env.E2E_SECONDARY_PASSWORD

let failures = 0
const check = (name, ok, extra = '') => {
  console.error(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

async function login(email, password) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email} failed: ${error.message}`)
  return { client, userId: data.user.id }
}

const today = new Date()
const iso = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const FROM = iso(new Date(today.getFullYear(), today.getMonth() - 1, 1))
const TO = iso(new Date(today.getFullYear(), today.getMonth() + 3, 0))

const a = await login(A_EMAIL, A_PASSWORD)
const b = await login(B_EMAIL, B_PASSWORD)

// 1) share exists — if not (P1 e2e dissolves at the end), establish one via
// the real RPC flow (A mints an invite token, B accepts). Left in place
// afterwards: the upcoming Playwright acceptance needs a live share anyway.
let aPeers = await a.client.rpc('get_share_peers')
if (aPeers.error) throw new Error(`get_share_peers(A): ${aPeers.error.message}`)
let share = (aPeers.data ?? []).find((p) => p.peer_id === b.userId)
if (!share) {
  console.error('no existing A↔B share — creating via invite/accept RPCs')
  const inv = await a.client.rpc('create_share_invite')
  if (inv.error) throw new Error(`create_share_invite: ${inv.error.message}`)
  const acc = await b.client.rpc('accept_share_invite', { p_token: inv.data })
  if (acc.error) throw new Error(`accept_share_invite: ${acc.error.message}`)
  aPeers = await a.client.rpc('get_share_peers')
  share = (aPeers.data ?? []).find((p) => p.peer_id === b.userId)
}
check('A↔B share exists', !!share, share ? `share_id=${share.share_id}` : 'no share with B')
if (!share) process.exit(1)

// 2) A's workspaces + slot_types inventory
const wsRes = await a.client.from('workspaces').select('id, name').eq('is_archived', false).order('sort_order')
const stRes = await a.client.from('slot_types').select('key, label, is_built_in, workspace_id')
console.error(`A workspaces: ${(wsRes.data ?? []).map((w) => w.name).join(', ') || '(none)'}`)
console.error(`A slot_types rows in DB: ${JSON.stringify(stRes.data ?? [])}`)
if ((wsRes.data ?? []).length < 2) throw new Error('need ≥2 workspaces on A to test full+busy')
const [wsFull, wsBusy] = wsRes.data

// 3) grants (full on ws1, busy on ws2) — remember pre-existing state to restore
const preGrants = await a.client
  .from('calendar_share_grants')
  .select('kind, ref, detail')
  .eq('share_id', share.share_id)
  .eq('owner_id', a.userId)
console.error(`A pre-existing grants on this share: ${JSON.stringify(preGrants.data ?? [])}`)

const up1 = await a.client.from('calendar_share_grants').upsert(
  { share_id: share.share_id, owner_id: a.userId, kind: 'workspace', ref: wsFull.id, detail: 'full' },
  { onConflict: 'share_id,owner_id,kind,ref' },
)
const up2 = await a.client.from('calendar_share_grants').upsert(
  { share_id: share.share_id, owner_id: a.userId, kind: 'workspace', ref: wsBusy.id, detail: 'busy' },
  { onConflict: 'share_id,owner_id,kind,ref' },
)
check('grant upsert full (RLS WITH CHECK)', !up1.error, up1.error?.message)
check('grant upsert busy (RLS WITH CHECK)', !up2.error, up2.error?.message)

// re-read to prove persistence (the "重新整理仍在" data-layer half)
const reread = await a.client
  .from('calendar_share_grants')
  .select('kind, ref, detail')
  .eq('share_id', share.share_id)
  .eq('owner_id', a.userId)
const hasFull = (reread.data ?? []).some((g) => g.ref === wsFull.id && g.detail === 'full')
const hasBusy = (reread.data ?? []).some((g) => g.ref === wsBusy.id && g.detail === 'busy')
check('grants persisted (read-back)', hasFull && hasBusy)

// 4) probe tasks — one in each workspace, scheduled today
const catFull = await a.client.from('categories').select('id').eq('workspace_id', wsFull.id).limit(1)
const catBusy = await a.client.from('categories').select('id').eq('workspace_id', wsBusy.id).limit(1)
if (!catFull.data?.[0] || !catBusy.data?.[0]) throw new Error('workspaces need at least one category')
const probeIds = []
for (const [cat, ws, title, s, e] of [
  [catFull.data[0].id, wsFull.id, 'P2RPC-FULL-探針', '09:00', '10:00'],
  [catBusy.data[0].id, wsBusy.id, 'P2RPC-BUSY-祕密標題', '11:00', '12:00'],
]) {
  const id = crypto.randomUUID()
  probeIds.push(id)
  const ins = await a.client.from('tasks').insert({
    id, user_id: a.userId, category_id: cat, workspace_id: ws, title,
    task_type: 'one_time', urgency: 5, calendar_color: '#e07b5a',
    scheduled_date: iso(today), scheduled_start_time: s, scheduled_end_time: e,
    sort_order: 999,
  })
  if (ins.error) throw new Error(`probe task insert: ${ins.error.message}`)
}

// 5) B reads the shared calendar
const feed = await b.client.rpc('get_shared_calendar', { p_peer: a.userId, p_from: FROM, p_to: TO })
if (feed.error) throw new Error(`get_shared_calendar(B→A): ${feed.error.message}`)
const rows = feed.data ?? []
console.error(`rows returned: ${rows.length}`)
const fullRow = rows.find((r) => r.title === 'P2RPC-FULL-探針')
const busyRow = rows.find((r) => r.id === probeIds[1])

check('full-grant task visible with real title', !!fullRow)
check('busy-grant task visible', !!busyRow)
check('busy row title is null in raw JSON', busyRow ? busyRow.title === null : false,
  busyRow ? `title=${JSON.stringify(busyRow.title)}` : 'row missing')
check('busy secret title absent from entire payload',
  !JSON.stringify(rows).includes('祕密標題'))

const expectedKeys = ['source','id','event_date','start_time','end_time','type_key','color','detail',
  'title','is_recurring','recurrence_type','recurrence_interval','recurrence_days_of_week',
  'recurrence_end_date','exdates','parent_id']
if (fullRow) {
  const missing = expectedKeys.filter((k) => !(k in fullRow))
  const extra = Object.keys(fullRow).filter((k) => !expectedKeys.includes(k))
  check('row shape matches SharedCalendarRow', missing.length === 0 && extra.length === 0,
    `missing=[${missing}] extra=[${extra}]`)
  check('event_date is YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(fullRow.event_date), fullRow.event_date)
  check('start_time is HH:MM:SS (hook slices to HH:mm)', /^\d{2}:\d{2}:\d{2}$/.test(fullRow.start_time), fullRow.start_time)
  check('detail field is full', fullRow.detail === 'full')
  console.error(`sample full row: ${JSON.stringify(fullRow)}`)
}
if (busyRow) console.error(`sample busy row: ${JSON.stringify(busyRow)}`)

// 6) cleanup — probe tasks + only the grants this script created (restore pre state)
for (const id of probeIds) await a.client.from('tasks').delete().eq('id', id)
const pre = preGrants.data ?? []
for (const ref of [wsFull.id, wsBusy.id]) {
  const had = pre.find((g) => g.kind === 'workspace' && g.ref === ref)
  if (had) {
    await a.client.from('calendar_share_grants').upsert(
      { share_id: share.share_id, owner_id: a.userId, kind: 'workspace', ref, detail: had.detail },
      { onConflict: 'share_id,owner_id,kind,ref' },
    )
  } else {
    await a.client.from('calendar_share_grants').delete()
      .eq('share_id', share.share_id).eq('owner_id', a.userId).eq('kind', 'workspace').eq('ref', ref)
  }
}
const post = await a.client.from('calendar_share_grants').select('kind, ref, detail')
  .eq('share_id', share.share_id).eq('owner_id', a.userId)
check('cleanup: grants restored to pre-test state',
  JSON.stringify((post.data ?? []).sort((x, y) => x.ref.localeCompare(y.ref))) ===
  JSON.stringify(pre.sort((x, y) => x.ref.localeCompare(y.ref))))

console.error(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
