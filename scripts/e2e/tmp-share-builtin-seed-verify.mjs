#!/usr/bin/env node
// Historical probe: use an isolated test project; may write/delete test data.
if (!process.env.E2E_SECONDARY_EMAIL || !process.env.E2E_SECONDARY_PASSWORD) throw new Error('Set E2E_SECONDARY_EMAIL and E2E_SECONDARY_PASSWORD for an isolated test account');
/**
 * Verify the "seed built-in slot type on grant" flow end-to-end against the
 * live DB, replicating exactly what useCalendarSharing.setGrant now does:
 *
 *  1. A: slot_types has no 'focus' row → insert (is_built_in: true, fields
 *     from the front-end built-in definition) → upsert busy grant.
 *  2. A: create a 'focus' time_block today.
 *  3. B: get_shared_calendar → the block IS returned, title === null (busy),
 *     type_key === 'focus'.
 *  4. Cleanup: delete the block + the grant; the seeded slot_types row stays
 *     (harmless by design — prune only clears is_built_in=false).
 *
 * Run: node scripts/e2e/tmp-share-builtin-seed-verify.mjs
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

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = new Date()

const a = await login(env.E2E_EMAIL, env.E2E_PASSWORD)
const b = await login(process.env.E2E_SECONDARY_EMAIL, process.env.E2E_SECONDARY_PASSWORD)

const aPeers = await a.client.rpc('get_share_peers')
const share = (aPeers.data ?? []).find((p) => p.peer_id === b.userId)
if (!share) throw new Error('no A↔B share (run tmp-share-p2-rpc-verify.mjs first)')

// 1) seed-on-grant, exactly as setGrant does
const pre = await a.client.from('slot_types').select('id').eq('user_id', a.userId).eq('key', 'focus').limit(1)
console.error(`pre-existing 'focus' slot_types row: ${(pre.data ?? []).length > 0}`)
if ((pre.data ?? []).length === 0) {
  const seed = await a.client.from('slot_types').insert({
    user_id: a.userId, key: 'focus', label: '專注', description: '專注工作時段',
    icon: 'Crosshair', icon_type: 'lucide', color: '#D46B8A', is_built_in: true, sort_order: 0,
  })
  check('seed insert focus slot_types row', !seed.error, seed.error?.message)
}
const grant = await a.client.from('calendar_share_grants').upsert(
  { share_id: share.share_id, owner_id: a.userId, kind: 'slot_type', ref: 'focus', detail: 'busy' },
  { onConflict: 'share_id,owner_id,kind,ref' },
)
check("busy grant on built-in 'focus' accepted by RLS WITH CHECK", !grant.error, grant.error?.message)

// 2) a focus time_block today
const blockId = crypto.randomUUID()
const blk = await a.client.from('time_blocks').insert({
  id: blockId, user_id: a.userId, date: iso(today), start_time: '14:00', end_time: '15:00',
  type: 'focus', label: 'SEEDTEST-祕密專注', color: '#D46B8A',
})
check('focus time_block created', !blk.error, blk.error?.message)

// 3) B reads
const feed = await b.client.rpc('get_shared_calendar', { p_peer: a.userId, p_from: iso(today), p_to: iso(today) })
if (feed.error) throw new Error(`get_shared_calendar: ${feed.error.message}`)
const rows = feed.data ?? []
const row = rows.find((r) => r.id === blockId)
check('B sees the focus block', !!row)
check('busy block title is null (raw JSON)', row ? row.title === null : false, row ? `title=${JSON.stringify(row.title)}` : '')
check("type_key === 'focus' (viewer maps to its own label)", row?.type_key === 'focus', `type_key=${row?.type_key}`)
check('secret label absent from payload', !JSON.stringify(rows).includes('祕密專注'))
if (row) console.error(`row: ${JSON.stringify(row)}`)

// 4) cleanup — block + grant; seeded slot_types row intentionally stays
await a.client.from('time_blocks').delete().eq('id', blockId)
await a.client.from('calendar_share_grants').delete()
  .eq('share_id', share.share_id).eq('owner_id', a.userId).eq('kind', 'slot_type').eq('ref', 'focus')
const post = await b.client.rpc('get_shared_calendar', { p_peer: a.userId, p_from: iso(today), p_to: iso(today) })
check('after grant removal the block is gone for B', !(post.data ?? []).some((r) => r.id === blockId))

console.error(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
