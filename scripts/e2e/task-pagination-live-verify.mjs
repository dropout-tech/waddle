#!/usr/bin/env node
/**
 * LIVE check of the "tasks vanish past row 1000" bug and its fix, against the
 * real PostgREST of the database in .env.local.
 *
 *   node scripts/e2e/task-pagination-live-verify.mjs
 *   HUDDLE_ENV_DIR=/path/to/main/checkout node scripts/e2e/task-pagination-live-verify.mjs
 *
 * Seeds 1050 throwaway tasks into the e2e TEST account (.env.e2e.local
 * E2E_EMAIL — never a real user), then reads that account's tasks two ways:
 *   1. the query use-waddle-data.ts used before the fix (one unranged select)
 *   2. the query it uses now (fetchAllRows + exact count + id tiebreaker)
 * and compares both against the true row count.
 *
 * No login: the service role (.env.admin.local) writes and reads, scoped by
 * `.eq('user_id', <test account>)`. PostgREST's max_rows applies to every
 * role, so the truncation is the same one a signed-in user hits; what this
 * does NOT cover is the RLS path itself. Because auth.uid() is null, the
 * operations_task_activity trigger records nothing for these rows.
 *
 * Seeded rows are archived and sorted last (sort_order ≥ 1,000,000), so the
 * account's own tasks stay inside the first 1000 and anything else using the
 * account meanwhile sees no change. Everything seeded is deleted in `finally`
 * (matched by user_id + title prefix); the residue count is printed.
 * Exit code 0 = every assertion passed and residue is zero.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from '../../lib/supabase/fetch-all-rows.ts'

function loadEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}
const envDir = process.env.HUDDLE_ENV_DIR || process.cwd()
const env = { ...loadEnv(path.join(envDir, '.env.local')), ...loadEnv(path.join(envDir, '.env.e2e.local')), ...process.env }
const admin = loadEnv(path.join(envDir, '.env.admin.local'))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const need = { NEXT_PUBLIC_SUPABASE_URL: URL_, E2E_EMAIL: env.E2E_EMAIL, SUPABASE_SERVICE_ROLE_KEY: admin.SUPABASE_SERVICE_ROLE_KEY }
for (const [k, v] of Object.entries(need)) if (!v) { console.error(`missing ${k} (looked in ${envDir})`); process.exit(2) }
const REF = new URL(URL_).hostname.split('.')[0]

let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`); if (!cond) failures++ }
const SEED = 1050
const PREFIX = '__pagination-probe__'
const RUN = `${PREFIX}${Date.now()}`
const svc = createClient(URL_, admin.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

async function findTestUserId() {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === env.E2E_EMAIL.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < 200) break
  }
  return null
}
const countTasks = async (uid, probeOnly = false) => {
  let q = svc.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', uid)
  if (probeOnly) q = q.like('title', `${PREFIX}%`)
  const { count, error } = await q
  if (error) throw error
  return count
}
const deleteProbes = (uid) => svc.from('tasks').delete().eq('user_id', uid).like('title', `${PREFIX}%`)

async function main() {
  console.log(`target project ref: ${REF}`)
  const uid = await findTestUserId()
  if (!uid) { console.error('ABORT: E2E_EMAIL account not found — nothing written.'); process.exit(3) }
  console.log(`test account: ${uid.slice(0, 8)}… (from E2E_EMAIL)`)

  const stale = await countTasks(uid, true)
  if (stale > 0) {
    console.log(`removing ${stale} probe row(s) left by an earlier run`)
    const { error } = await deleteProbes(uid)
    if (error) throw error
  }
  const baseline = await countTasks(uid)
  console.log(`baseline: the account owns ${baseline} task(s)`)

  const cat = await svc.from('categories').select('id,workspace_id').eq('user_id', uid).limit(1).single()
  if (cat.error) throw cat.error

  try {
    const rows = Array.from({ length: SEED }, (_, i) => ({
      user_id: uid, workspace_id: cat.data.workspace_id, category_id: cat.data.id,
      title: `${RUN} #${String(i).padStart(4, '0')}`,
      is_archived: true, archived_at: new Date().toISOString(),
      // 25 distinct sort_order values → 42 rows share each one, so the page
      // boundary falls inside a tie and the id tiebreaker is really exercised.
      sort_order: 1_000_000 + (i % 25),
    }))
    for (let i = 0; i < rows.length; i += 350) {
      const { error } = await svc.from('tasks').insert(rows.slice(i, i + 350))
      if (error) throw error
    }
    const total = await countTasks(uid)
    ok(total === baseline + SEED, `seeded ${SEED} probe tasks → the account now owns ${total}`)

    // ── 1. Before the fix: the hook's original query ──
    const before = await svc.from('tasks').select('*').order('sort_order', { ascending: true }).eq('user_id', uid)
    console.log(`old query: HTTP ${before.status}, error=${before.error?.message ?? 'none'}, rows=${before.data?.length}`)
    ok(before.error === null && before.data.length < total,
      `BUG REPRODUCED — old query returned ${before.data?.length} of ${total} tasks, with no error (${total - (before.data?.length ?? 0)} tasks missing)`)
    console.log(`=> effective PostgREST max rows on ${REF}: ${before.data?.length}`)

    // ── 2. After the fix: the hook's current query ──
    let requests = 0
    const after = await fetchAllRows((from, to) => {
      requests++
      return svc.from('tasks').select('*', { count: 'exact' })
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .eq('user_id', uid).range(from, to)
    })
    const ids = new Set((after.data ?? []).map((r) => r.id))
    console.log(`new query: error=${after.error?.message ?? 'none'}, rows=${after.data?.length}, requests=${requests}`)
    ok(after.error === null && after.data.length === total, `FIXED — fetchAllRows returned ${after.data?.length} of ${total} tasks`)
    ok(ids.size === total, `no task repeated across the page boundary (${ids.size} distinct ids)`)
    const missingBefore = new Set(before.data.map((r) => r.id))
    const recovered = (after.data ?? []).filter((r) => !missingBefore.has(r.id)).length
    ok(recovered === total - before.data.length, `the ${recovered} tasks the old query dropped are all present now`)
    // Rows seeded in one INSERT share created_at exactly, so id decides between them.
    const inOrder = (p, r) => p.sort_order !== r.sort_order ? p.sort_order < r.sort_order
      : p.created_at !== r.created_at ? Date.parse(p.created_at) <= Date.parse(r.created_at)
        : p.id < r.id
    const sorted = (after.data ?? []).every((r, i, a) => i === 0 || inOrder(a[i - 1], r))
    const idDecided = (after.data ?? []).filter((r, i, a) => i > 0 && a[i - 1].sort_order === r.sort_order && a[i - 1].created_at === r.created_at).length
    ok(sorted, `rows arrive in (sort_order, created_at, id) order across pages (${idDecided} neighbours decided by id)`)
    ok(requests === Math.ceil(total / 1000), `${requests} request(s) for ${total} rows — no wasted round trip`)

    // ── 3. The assumption fetchAllRows makes about a range past the end ──
    const past = await svc.from('tasks').select('id', { count: 'exact' }).order('id').eq('user_id', uid).range(total + 5, total + 1004)
    console.log(`range past the end: HTTP ${past.status}, code=${past.error?.code ?? 'none'}, rows=${past.data?.length ?? 'null'}`)
    ok(past.error?.code === 'PGRST103' || (past.error === null && past.data.length === 0),
      'a range past the last row is PGRST103 or an empty page (both end the loop)')
  } finally {
    const { error } = await deleteProbes(uid)
    if (error) console.error('CLEANUP FAILED:', error.message)
    const residue = await countTasks(uid, true)
    const final = await countTasks(uid)
    ok(residue === 0, `cleanup: ${residue} probe row(s) left`)
    ok(final === baseline, `the account is back to its ${baseline} task(s) (now ${final})`)
  }
}

main().then(
  () => { console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`); process.exit(failures === 0 ? 0 : 1) },
  (err) => { console.error('ERROR:', err?.message ?? err); process.exit(1) },
)
