#!/usr/bin/env node
/**
 * LIVE end-to-end check of task assignment + organizations (migration
 * 20260927120000) against the database in .env.local, using two real test
 * accounts that already share calendars.
 *
 *   E2E_EMAIL_B=... E2E_PASSWORD_B=... node scripts/e2e/task-assignment-live-verify.mjs
 *
 * Account A = .env.e2e.local E2E_EMAIL/E2E_PASSWORD; account B from env
 * (E2E_EMAIL_B / E2E_PASSWORD_B, or the same keys in .env.e2e.local).
 * Writes ONLY rows owned by A/B (tasks titled e2e-assign-*, one org named
 * e2e-org-*). If A has no Pro, a 1-hour `billing_entitlements` pro row is
 * inserted for A only (service role, .env.admin.local) and deleted in
 * `finally`. huddle_ops.grants is not reachable through PostgREST (schema not
 * exposed); A has no unexpired grants when it's non-Pro, so the
 * operations_defer_gifts trigger on billing_entitlements has nothing to move.
 * Everything created is removed in `finally`; residue counts are printed.
 * Exit code 0 = every assertion passed and residue is zero.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

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
const cwd = process.cwd()
const env = { ...loadEnv(path.join(cwd, '.env.local')), ...loadEnv(path.join(cwd, '.env.e2e.local')), ...process.env }
const admin = loadEnv(path.join(cwd, '.env.admin.local'))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const REF = new URL(URL_).hostname.split('.')[0]
const need = { E2E_EMAIL: env.E2E_EMAIL, E2E_PASSWORD: env.E2E_PASSWORD, E2E_EMAIL_B: env.E2E_EMAIL_B, E2E_PASSWORD_B: env.E2E_PASSWORD_B }
for (const [k, v] of Object.entries(need)) if (!v) { console.error(`missing ${k}`); process.exit(2) }

let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`); if (!cond) failures++ }
const errText = (e) => (e ? `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}` : '')
const TS = Date.now()
const opts = { auth: { persistSession: false, autoRefreshToken: false } }


async function main() {
  console.log(`target project ref: ${REF}`)
  const A = createClient(URL_, ANON, opts)
  const B = createClient(URL_, ANON, opts)
  const anon = createClient(URL_, ANON, opts)
  const svc = createClient(URL_, admin.SUPABASE_SERVICE_ROLE_KEY, opts)
  const la = await A.auth.signInWithPassword({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD })
  const lb = await B.auth.signInWithPassword({ email: env.E2E_EMAIL_B, password: env.E2E_PASSWORD_B })
  if (la.error || lb.error) { console.error('login failed', errText(la.error), errText(lb.error)); process.exit(2) }
  const aId = la.data.user.id, bId = lb.data.user.id

  const peers = await A.rpc('get_share_peers')
  if (!(peers.data ?? []).some((p) => p.peer_id === bId)) {
    console.error('ABORT: A and B have no calendar_shares link — nothing written.'); process.exit(3)
  }
  ok(true, 'precondition: A and B are calendar-share peers')

  const created = { tasks: [], orgs: [], proRow: false }
  const cat = await A.from('categories').select('id,workspace_id').eq('user_id', aId).limit(1).single()
  if (cat.error) throw cat.error
  const newTask = async (title) => {
    const r = await A.from('tasks').insert({ user_id: aId, workspace_id: cat.data.workspace_id, category_id: cat.data.id, title, notes: 'e2e notes' }).select('id').single()
    if (r.error) throw r.error
    created.tasks.push(r.data.id)
    return r.data.id
  }

  try {
    // ── 1. Owner regression: guard trigger must not misfire on normal writes ──
    const t0 = await newTask(`e2e-assign-regress-${TS}`)
    const u1 = await A.from('tasks').update({ title: `e2e-assign-regress-${TS}-edited`, urgency: 8, scheduled_date: '2030-01-01' }).eq('id', t0).select('title')
    ok(!u1.error && u1.data?.[0]?.title.endsWith('-edited'), `owner edits own task (${errText(u1.error) || 'ok'})`)
    const u2 = await A.from('tasks').update({ is_completed: true, completed_at: new Date().toISOString() }).eq('id', t0).select('is_completed')
    ok(!u2.error && u2.data?.[0]?.is_completed === true, 'owner completes own task')
    const d0 = await A.from('tasks').delete().eq('id', t0).select('id')
    ok(!d0.error && d0.data?.length === 1, 'owner deletes own task')
    const g0 = await A.from('tasks').select('id').eq('id', t0)
    ok(g0.data?.length === 0, 'deleted task is gone')
    const sneaky = await A.from('tasks').insert({ user_id: aId, workspace_id: cat.data.workspace_id, category_id: cat.data.id, title: `e2e-assign-sneaky-${TS}`, assignee_id: bId, assignment_status: 'active' }).select('id')
    if (sneaky.data?.[0]) created.tasks.push(sneaky.data[0].id)
    ok(!!sneaky.error && errText(sneaky.error).includes('ASSIGNMENT_VIA_RPC_ONLY'), 'owner cannot INSERT a pre-assigned task directly')

    // ── 2. One-to-one assignment lifecycle ──
    const t1 = await newTask(`e2e-assign-${TS}`)
    const direct = await A.from('tasks').update({ assignee_id: bId, assignment_status: 'active' }).eq('id', t1)
    ok(!!direct.error && errText(direct.error).includes('ASSIGNMENT_VIA_RPC_ONLY'), 'owner cannot set assignee_id with a plain UPDATE')
    const as1 = await A.rpc('assign_task', { p_task: t1, p_assignee: bId })
    ok(!as1.error, `A assign_task → B (${errText(as1.error) || 'ok'})`)
    const bRead = await B.from('tasks').select('id,title,notes').eq('id', t1)
    ok(bRead.data?.length === 1 && bRead.data[0].title === `e2e-assign-${TS}`, 'B can read the assigned task')
    const bTitle = await B.from('tasks').update({ title: 'hacked by B' }).eq('id', t1).select('id')
    ok(!!bTitle.error && errText(bTitle.error).includes('ASSIGNEE_FIELD_LOCKED'), 'B cannot change the title (ASSIGNEE_FIELD_LOCKED)')
    const aTitle = await A.from('tasks').select('title').eq('id', t1).single()
    ok(aTitle.data?.title === `e2e-assign-${TS}`, 'title unchanged after B attempt')
    const bDel = await B.from('tasks').delete().eq('id', t1).select('id')
    const aStill = await A.from('tasks').select('id').eq('id', t1)
    ok((bDel.data?.length ?? 0) === 0 && aStill.data?.length === 1, 'B cannot delete the assigned task')
    const bDone = await B.from('tasks').update({ is_completed: true, completed_at: new Date().toISOString(), actual_minutes: 15 }).eq('id', t1).select('id')
    ok(!bDone.error && bDone.data?.length === 1, `B completes the task (${errText(bDone.error) || 'ok'})`)
    const aDone = await A.from('tasks').select('is_completed,actual_minutes').eq('id', t1).single()
    ok(aDone.data?.is_completed === true && aDone.data?.actual_minutes === 15, 'A reads is_completed=true (and B\'s actual time)')
    const ret = await B.rpc('return_task', { p_task: t1, p_note: 'e2e 退回理由' })
    ok(!ret.error, `B return_task with note (${errText(ret.error) || 'ok'})`)
    const aList = await A.rpc('list_task_assignments')
    const rec = (aList.data ?? []).find((r) => r.task_id === t1)
    ok(rec?.status === 'returned' && rec?.return_note === 'e2e 退回理由' && rec?.role === 'assigner', 'A sees status=returned + note')
    const bAfterReturn = await B.from('tasks').select('id').eq('id', t1)
    ok(bAfterReturn.data?.length === 0, 'returned task leaves B\'s view')
    await A.rpc('assign_task', { p_task: t1, p_assignee: bId })
    const bAgain = await B.from('tasks').select('id').eq('id', t1)
    ok(bAgain.data?.length === 1, 'A re-assigns → B sees it again')
    const un = await A.rpc('unassign_task', { p_task: t1 })
    ok(!un.error, 'A unassign_task')
    const bGone = await B.from('tasks').select('id').eq('id', t1)
    ok(bGone.data?.length === 0, 'after unassign B can no longer read it')
    const bSteal = await B.rpc('assign_task', { p_task: t1, p_assignee: bId })
    ok(!!bSteal.error && errText(bSteal.error).includes('TASK_NOT_FOUND'), 'B cannot assign A\'s task')

    // ── 3. Stranger (anon key, not logged in) ──
    await A.rpc('assign_task', { p_task: t1, p_assignee: bId })
    const an = await anon.from('tasks').select('id').eq('id', t1)
    ok((an.data?.length ?? 0) === 0, `anon cannot read the assigned task (${an.data?.length ?? 0} rows${an.error ? ', ' + an.error.code : ''})`)
    const anRpc = await anon.rpc('list_task_assignments')
    ok(!!anRpc.error, 'anon cannot call list_task_assignments')
    await A.rpc('unassign_task', { p_task: t1 })

    // ── 4. Organizations ──
    const mine = await A.rpc('get_my_organizations')
    if (!mine.data?.can_create) {
      const denied = await A.rpc('create_organization', { p_name: `e2e-org-${TS}` })
      if (denied.data) created.orgs.push(denied.data)
      ok(!!denied.error && errText(denied.error).includes('PRO_REQUIRED'), 'non-Pro A → create_organization PRO_REQUIRED')
      const existing = await svc.from('billing_entitlements').select('user_id').eq('user_id', aId)
      if (existing.data?.length) throw new Error('A already has a billing_entitlements row — refusing to overwrite it')
      const pro = await svc.from('billing_entitlements').insert({ user_id: aId, entitlement: 'pro', expires_at: new Date(Date.now() + 3600e3).toISOString(), observed_at_ms: 1 })
      if (pro.error) throw pro.error
      created.proRow = true
      console.log('INFO: 1-hour Pro entitlement inserted for test account A only')
    } else {
      console.log('INFO: A already has Pro; PRO_REQUIRED path not exercised')
    }
    const org = await A.rpc('create_organization', { p_name: `e2e-org-${TS}` })
    ok(!org.error && !!org.data, `Pro A creates an organization (${errText(org.error) || 'ok'})`)
    if (org.data) created.orgs.push(org.data)
    const orgId = org.data
    const inv = await A.rpc('create_org_invite', { p_org: orgId })
    ok(!inv.error && typeof inv.data === 'string', 'A mints an invite token')
    const pv = await B.rpc('preview_org_invite', { p_token: inv.data })
    ok(pv.data?.[0]?.org_name === `e2e-org-${TS}`, 'B previews the invite')
    const acc = await B.rpc('accept_org_invite', { p_token: inv.data })
    ok(!acc.error && acc.data === orgId, 'B accepts the invite')
    const t2 = await newTask(`e2e-assign-org-${TS}`)
    const t3 = await newTask(`e2e-assign-private-${TS}`)
    const as2 = await A.rpc('assign_task', { p_task: t2, p_assignee: bId, p_org: orgId })
    ok(!as2.error, 'A assigns inside the org')
    const boardB = await B.rpc('get_org_board', { p_org: orgId })
    ok((boardB.data ?? []).some((r) => r.task_id === t2) && !(boardB.data ?? []).some((r) => r.task_id === t3), 'B\'s org board shows the org task, not A\'s private task')
    const bPriv = await B.from('tasks').select('id').eq('id', t3)
    ok(bPriv.data?.length === 0, 'B cannot read A\'s private task')
    const members = await B.rpc('get_org_members', { p_org: orgId })
    ok((members.data ?? []).length === 2, 'org has 2 members')
    const rm = await A.rpc('remove_org_member', { p_org: orgId, p_user: bId })
    ok(!rm.error, 'A removes B from the org')
    const bT2 = await B.from('tasks').select('id').eq('id', t2)
    ok(bT2.data?.length === 0, 'removed B loses the org-assigned task')
    const rejoin = await B.rpc('accept_org_invite', { p_token: inv.data })
    ok(!!rejoin.error && errText(rejoin.error).includes('REMOVED_FROM_ORG'), 'removed B cannot rejoin with the old link (REMOVED_FROM_ORG)')
    const boardGone = await B.rpc('get_org_board', { p_org: orgId })
    ok(!!boardGone.error, 'removed B cannot read the org board')
  } finally {
    for (const id of created.orgs) {
      const d = await A.rpc('delete_organization', { p_org: id })
      if (d.error) await svc.from('organizations').delete().eq('id', id)
    }
    if (created.tasks.length) await A.from('tasks').delete().in('id', created.tasks)
    if (created.proRow) await svc.from('billing_entitlements').delete().eq('user_id', aId).eq('observed_at_ms', 1)
    const rt = await svc.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', aId).like('title', 'e2e-assign-%')
    const ro = await svc.from('organizations').select('id', { count: 'exact', head: true }).like('name', 'e2e-org-%')
    const rb = await svc.from('organization_blocks').select('user_id', { count: 'exact', head: true }).eq('user_id', bId)
    const rm = await svc.from('organization_members').select('user_id', { count: 'exact', head: true }).in('user_id', [aId, bId])
    const assignedToB = await svc.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', aId).eq('assignee_id', bId)
    const rp = await svc.from('billing_entitlements').select('user_id', { count: 'exact', head: true }).eq('user_id', aId)
    const residue = { tasks: rt.count, orgs: ro.count, blocks: rb.count, memberships: rm.count, assignedToB: assignedToB.count, proRowsA: rp.count }
    console.log(`RESIDUE ${JSON.stringify(residue)}`)
    ok(Object.values(residue).every((n) => n === 0), 'zero residue after cleanup')
    await A.auth.signOut(); await B.auth.signOut()
  }
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => { console.error('ERROR', e); process.exit(1) })
