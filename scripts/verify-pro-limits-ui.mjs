// Deterministic check for the Pro-limits UI (docs/billing/2026-10-01-pro-limits-design.md §3).
//
//   node scripts/verify-pro-limits-ui.mjs
//
// No login, no network, never touches a real database: the Supabase client is
// swapped for an in-process fake. The real lib/billing/*, lib/meeting-import.ts
// and lib/i18n are loaded through a tiny resolver ("@/" and extensionless
// imports -> .ts). Exit code 1 if any assertion fails.
import { readFileSync } from 'node:fs'
import { register } from 'node:module'

const root = new URL('../', import.meta.url)
const fakeClientSource = 'export const createClient = () => globalThis.__fakeSupabase()'
const hooks = `
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = ${JSON.stringify(root.href)}
const tryExt = (base) => {
  for (const s of ['.ts', '.tsx', '/index.ts']) {
    const p = fileURLToPath(base + s)
    if (existsSync(p)) return pathToFileURL(p).href
  }
}
export async function resolve(spec, ctx, next) {
  if (spec === '@/lib/supabase/client') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(fakeClientSource)}), shortCircuit: true }
  let url
  if (spec.startsWith('@/')) url = tryExt(root + spec.slice(2))
  else if (spec.startsWith('.') && !/\\.[a-z]+$/.test(spec) && ctx.parentURL) url = tryExt(new URL(spec, ctx.parentURL).href)
  return url ? { url, shortCircuit: true } : next(spec, ctx)
}
`
register('data:text/javascript,' + encodeURIComponent(hooks))

const core = await import('../lib/billing/plan-usage-core.ts')
const errors = await import('../lib/billing/plan-errors.ts')
const usageLib = await import('../lib/billing/plan-usage.ts')
const meeting = await import('../lib/meeting-import.ts')
const { translateFor } = await import('../lib/i18n/index.ts')

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : detail ? `  -> ${detail}` : ''}`)
}
const hasCjk = (s) => /[㐀-鿿]/.test(s)

// ── 1. Error codes -> non-empty zh + en messages ─────────────────────────
// planLimitMessage reads the current language; exercise both by switching it.
const { setLang } = await import('../lib/i18n/index.ts')
for (const code of ['TASK_LIMIT', 'NOTE_LIMIT', 'PRO_REQUIRED', 'IMAGE_LIMIT']) {
  setLang('zh-TW')
  const zh = errors.planLimitMessage(code)
  setLang('en')
  const en = errors.planLimitMessage(code)
  setLang('zh-TW')
  check(`${code}: zh message non-empty and Chinese`, zh.trim().length > 0 && hasCjk(zh), zh)
  check(`${code}: en message non-empty, translated, no Chinese left`, en.trim().length > 0 && en !== zh && !hasCjk(en), en)
}
// Shapes PostgREST / Storage / Edge Functions actually hand back.
const shapes = [
  [{ code: 'P0001', message: 'TASK_LIMIT', details: null, hint: null }, 'TASK_LIMIT'],
  [{ code: 'P0001', message: 'NOTE_LIMIT' }, 'NOTE_LIMIT'],
  [{ message: 'Error: IMAGE_LIMIT exceeded' }, 'IMAGE_LIMIT'],
  [{ error: 'PRO_REQUIRED' }, 'PRO_REQUIRED'],
  ['TASK_LIMIT', 'TASK_LIMIT'],
  [new errors.PlanLimitError('IMAGE_LIMIT'), 'IMAGE_LIMIT'],
]
for (const [shape, want] of shapes) check(`planLimitCode(${shape instanceof Error ? 'PlanLimitError' : JSON.stringify(shape?.message ?? shape?.error ?? shape)}) = ${want}`, errors.planLimitCode(shape) === want)
for (const benign of [null, undefined, '', { code: 'PGRST301', message: 'JWT expired' }, { code: '23505', message: 'duplicate key' }, new Error('Failed to fetch')])
  check(`unrelated error is not a plan-limit: ${JSON.stringify(benign?.message ?? benign)}`, errors.planLimitCode(benign) === null)

// ── 2. Off / failure => nothing shown, nothing blocked ───────────────────
const enforcedOver = {
  enforced: true, pro: false,
  limits: { active_tasks: 150, notes: 100, image_bytes: 209715200, meeting_imports: 5 },
  used: { active_tasks: 150, notes: 100, image_bytes: 209715200, meeting_imports_this_month: 5 },
  grandfathered: { google_calendar: false },
}
const enforcedUnder = { ...enforcedOver, used: { ...enforcedOver.used, active_tasks: 10, notes: 3, image_bytes: 1024, meeting_imports_this_month: 1 } }
const off = { ...enforcedOver, enforced: false }

for (const [label, raw] of [['null', null], ['undefined', undefined], ['string', 'x'], ['array', []], ['missing enforced', { pro: true }], ['enforced not boolean', { enforced: 'true' }]]) {
  const u = core.parsePlanUsage(raw)
  check(`malformed payload (${label}) -> null`, u === null)
}
for (const [label, u] of [['null (RPC failed)', null], ['enforced=false', core.parsePlanUsage(off)]]) {
  check(`${label}: isEnforced false`, core.isEnforced(u) === false)
  check(`${label}: usage meters empty (membership shows nothing new)`, core.usageMeters(u).length === 0)
  check(`${label}: image upload not blocked`, core.imageQuotaReached(u) === false)
  check(`${label}: Google Calendar button not replaced`, core.googleCalendarLocked(u) === false)
}
check('enforced=false even with used >= limit does not block images', core.imageQuotaReached(core.parsePlanUsage(off)) === false)

// ── 3. Enforced => block when over ───────────────────────────────────────
const over = core.parsePlanUsage(enforcedOver)
const under = core.parsePlanUsage(enforcedUnder)
check('enforced + image full -> blocked', core.imageQuotaReached(over) === true)
check('enforced + image under limit -> not blocked', core.imageQuotaReached(under) === false)
check('enforced + Pro with unlimited image null -> not blocked', core.imageQuotaReached(core.parsePlanUsage({ ...enforcedOver, pro: true, limits: { ...enforcedOver.limits, image_bytes: null } })) === false)
check('enforced + free + not grandfathered -> Google locked', core.googleCalendarLocked(over) === true)
check('enforced + grandfathered -> Google not locked', core.googleCalendarLocked(core.parsePlanUsage({ ...enforcedOver, grandfathered: { google_calendar: true } })) === false)
check('enforced + Pro -> Google not locked', core.googleCalendarLocked(core.parsePlanUsage({ ...enforcedOver, pro: true })) === false)
const meters = core.usageMeters(over)
check('enforced: four meters (tasks, notes, images, meetings)', meters.map((m) => m.key).join() === 'tasks,notes,images,meetings')
check('full meter level = full', meters.every((m) => m.level === 'full'))
const mid = core.usageMeters(core.parsePlanUsage({ ...enforcedOver, used: { active_tasks: 120, notes: 79, image_bytes: 0, meeting_imports_this_month: 4 } }))
check('>= 80% -> warn (120/150, 4/5)', mid[0].level === 'warn' && mid[3].level === 'warn')
check('< 80% -> ok (79/100)', mid[1].level === 'ok')
const pro = core.usageMeters(core.parsePlanUsage({ ...enforcedOver, pro: true, limits: { active_tasks: null, notes: null, image_bytes: 21474836480, meeting_imports: 20 } }))
check('Pro: unlimited tasks/notes -> limit null, level ok', pro[0].limit === null && pro[0].level === 'ok' && pro[1].limit === null)

// ── 4. fetchPlanUsage fails open; assertImageQuota only throws when enforced+full ──
const setRpc = (impl) => {
  // `rpc` must be called as a method (the real client needs `this`); a detached
  // call throws here exactly like it would in the browser.
  globalThis.__fakeSupabase = () => ({
    rpc(...args) {
      if (this === undefined || typeof this.rpc !== 'function') throw new TypeError('rpc called without its client')
      return impl(...args)
    },
  })
  usageLib.resetPlanUsage()
}
setRpc(async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.my_plan_usage' } }))
check('RPC missing (PGRST202) -> fetchPlanUsage null', (await usageLib.fetchPlanUsage()) === null)
await usageLib.assertImageQuota().then(() => check('RPC missing -> upload not blocked', true), (e) => check('RPC missing -> upload not blocked', false, String(e)))
setRpc(async () => { throw new TypeError('Failed to fetch') })
check('RPC network throw -> null', (await usageLib.fetchPlanUsage()) === null)
setRpc(async () => ({ data: { enforced: 'yes' }, error: null }))
check('RPC garbage payload -> null', (await usageLib.fetchPlanUsage()) === null)
setRpc(async () => ({ data: off, error: null }))
await usageLib.assertImageQuota().then(() => check('enforced=false full quota -> upload allowed', true), () => check('enforced=false full quota -> upload allowed', false))
setRpc(async () => ({ data: enforcedUnder, error: null }))
await usageLib.assertImageQuota().then(() => check('enforced, under quota -> upload allowed', true), () => check('enforced, under quota -> upload allowed', false))
setRpc(async () => ({ data: enforcedOver, error: null }))
await usageLib.assertImageQuota().then(
  () => check('enforced, quota full -> upload blocked', false),
  (e) => check('enforced, quota full -> upload blocked with IMAGE_LIMIT', errors.planLimitCode(e) === 'IMAGE_LIMIT' && e.message.length > 0),
)
// A storage 403 is only re-labelled when the server says limits are on.
const storage403 = { message: 'new row violates row-level security policy', statusCode: '403' }
setRpc(async () => ({ data: off, error: null }))
check('storage 403 with limits off -> original error untouched', (await usageLib.explainUploadError(storage403)) === storage403)
setRpc(async () => ({ data: null, error: { message: 'x' } }))
check('storage 403 with usage unknown -> original error untouched', (await usageLib.explainUploadError(storage403)) === storage403)
setRpc(async () => ({ data: enforcedOver, error: null }))
check('storage 403 with limits on -> IMAGE_LIMIT', errors.planLimitCode(await usageLib.explainUploadError(storage403)) === 'IMAGE_LIMIT')
const net = new TypeError('Failed to fetch')
check('non-quota upload error stays as-is even when enforced', (await usageLib.explainUploadError(net)) === net)

// ── 5. Meetings: the limit is the server's number ────────────────────────
for (const n of [5, 20, 7]) check(`meetingLimitFrom(${n}) = ${n}`, core.meetingLimitFrom(n) === n)
check('meetingLimitFrom(undefined) falls back to 20 (old server)', core.meetingLimitFrom(undefined) === 20)
check('meetingLimitFrom(0 / NaN / string) falls back', core.meetingLimitFrom(0) === 20 && core.meetingLimitFrom(NaN) === 20 && core.meetingLimitFrom('5') === 20)
const fakeMeetingClient = (listLimit, errorBody) => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
  functions: {
    invoke: async (_name, { body }) =>
      body.action === 'list'
        ? { data: { meetings: [], used: 0, pending: 0, limit: listLimit, month: '2026-10', enabled: true }, error: null }
        : { data: null, error: { context: { json: async () => errorBody } } },
  },
})
for (const limit of [5, 20]) {
  globalThis.__fakeSupabase = () => fakeMeetingClient(limit, { error: 'MONTHLY_LIMIT' })
  const list = await meeting.meetingRequest('u1', { action: 'list' })
  check(`list passes the server limit through (${limit})`, list.limit === limit)
  const msg = await meeting.meetingRequest('u1', { action: 'generate' }).then(() => '', (e) => e.message)
  check(`MONTHLY_LIMIT message uses the server limit (${limit})`, msg.includes(String(limit)) && (limit === 5 ? !msg.includes('20') : true), msg)
  if (limit === 20) check('MONTHLY_LIMIT at limit 20 is byte-identical to main', msg === '本月已使用 20 次，下個月 1 日（台北時間）會重新開放。', msg)
}
globalThis.__fakeSupabase = () => fakeMeetingClient(5, { error: 'MONTHLY_LIMIT', limit: 7 })
check('MONTHLY_LIMIT body.limit wins when present', (await meeting.meetingRequest('u1', { action: 'generate' }).then(() => '', (e) => e.message)).includes('7'))
const ws = readFileSync(new URL('../components/meetings/meeting-workspace.tsx', import.meta.url), 'utf8')
check('meeting-workspace.tsx has no hard-coded 20 quota', !/\/ 20 次|20 - list|list\.used >= 20|本月 20 次/.test(ws))
check('meeting-workspace.tsx reads list.limit via meetingLimitFrom', /meetingLimitFrom\(list\?\.limit\)/.test(ws))
const mi = readFileSync(new URL('../lib/meeting-import.ts', import.meta.url), 'utf8')
// Limits off (limit 20, or not known yet): the MONTHLY_LIMIT text must be main's exact string.
check('meeting-import.ts keeps main\'s exact "本月已使用 20 次…" text for limit 20', mi.includes('"本月已使用 20 次，下個月 1 日（台北時間）會重新開放。"') && /limit === null \|\| limit === 20\) return MONTHLY_LIMIT_20/.test(mi))

// ── 5b. Recurring "this and following": new series first, old one cut short only after ──
{
  const wd = readFileSync(new URL('../hooks/use-waddle-data.ts', import.meta.url), 'utf8')
  const cuts = [...wd.matchAll(/update\(\{ recurrence_end_date: endDate \}\)/g)].map((m) => m.index)
  const splitCuts = cuts.filter((i) => /recurrenceChoice === 'this_and_following'/.test(wd.slice(Math.max(0, i - 4000), i)) && !/deleteTask/.test(wd.slice(Math.max(0, i - 4000), i)))
  const ordered = splitCuts.filter((i) => {
    const before = wd.slice(Math.max(0, i - 1500), i)
    const ins = before.lastIndexOf("from('tasks').insert(buildTaskInsert(newTask, userId))")
    return ins >= 0 && before.indexOf('if (insertError) {', ins) > ins && /return\n\s*\}/.test(before.slice(ins))
  })
  check(`use-waddle-data: all ${splitCuts.length} "this and following" splits insert the new series before ending the old one (and stop if it fails)`, splitCuts.length === 3 && ordered.length === 3, `${ordered.length}/${splitCuts.length}`)
}

// ── 6. i18n: every new limit string has an English entry ─────────────────
const { en } = await import('../lib/i18n/en.ts')
const newKeys = Object.keys((await import('../lib/i18n/dict/billing.ts')).dict)
check(`billing dict: ${newKeys.length} entries, all with English and no Chinese in it`, newKeys.every((k) => en[k] && !hasCjk(en[k])), newKeys.filter((k) => !en[k] || hasCjk(en[k])).join(' | '))
for (const k of ['本月已用 {used} / {limit} 次', '本月 {limit} 次已用完，下個月 1 日（台北時間）會重新開放。已整理的紀錄仍可建立任務。', '本月已使用 {limit} 次，下個月 1 日（台北時間）會重新開放。', '本月已使用 20 次，下個月 1 日（台北時間）會重新開放。'])
  check(`meetings dict has English for "${k.slice(0, 14)}…"`, !!en[k] && !hasCjk(en[k]))
// Limits off: the zh text a user sees must equal today's text.
check('limit=20 renders the same zh text as before', translateFor('zh-TW', '本月已用 {used} / {limit} 次', { used: 3, limit: 20 }) === '本月已用 3 / 20 次')
check('limit=20 MONTHLY_LIMIT English is the same as main', en['本月已使用 20 次，下個月 1 日（台北時間）會重新開放。'] === "You've used all 20 this month. It resets on the 1st of next month (Taipei time).")

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
