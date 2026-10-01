// Guards the onboarding "apply template / start blank" wipe: it deletes every
// workspace (and tasks by cascade), so it may only run when every task in the
// account is an untouched demo task (what seed.ts plants at signup).
//
//   node scripts/verify-onboarding-guard.mjs
//
// Uses a fake supabase — no login, no network, never touches a real database.
// The real demo data / i18n / seedUserData are loaded through a tiny in-process
// resolver (extensionless + "@/" imports -> .ts); no extra packages needed.
import { readFileSync } from 'node:fs'
import { register } from 'node:module'

const root = new URL('../', import.meta.url)
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
  let url
  if (spec.startsWith('@/')) url = tryExt(root + spec.slice(2))
  else if (spec.startsWith('.') && !/\\.[a-z]+$/.test(spec) && ctx.parentURL) url = tryExt(new URL(spec, ctx.parentURL).href)
  return url ? { url, shortCircuit: true } : next(spec, ctx)
}
`
register('data:text/javascript,' + encodeURIComponent(hooks))

const { canResetWorkspaces, collectDemoTaskInfo } = await import('../lib/onboarding/can-reset-workspaces.ts')
const { demoWorkspaces } = await import('../lib/demo-data.ts')
const { translateFor, setLang } = await import('../lib/i18n/index.ts')
const { seedUserData } = await import('../lib/supabase/seed.ts')

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const demo = collectDemoTaskInfo(demoWorkspaces, translateFor)
const N = demo.count
const zhTitles = demoWorkspaces.flatMap((w) => w.categories.flatMap((c) => c.tasks.map((t) => translateFor('zh-TW', t.title))))
const enTitles = demoWorkspaces.flatMap((w) => w.categories.flatMap((c) => c.tasks.map((t) => translateFor('en', t.title))))
console.log(`demo tasks N=${N}, distinct accepted titles=${demo.titles.size}, en differs from zh for ${enTitles.filter((t, i) => t !== zhTitles[i]).length}/${N}`)

// Mirrors the flow in applyOnboardingChoice: guard first, delete only if allowed.
// The fake enforces the .limit(N+1) the real query uses.
async function runFlow({ local = [], server }) {
  const calls = { query: 0, delete: 0 }
  const fetchServerTasks = async () => {
    calls.query += 1
    if (server instanceof Error) throw server
    if (server.rows) return { data: server.rows.slice(0, N + 1).map((title) => ({ title })), count: server.rows.length, error: null }
    return server
  }
  const allowed = await canResetWorkspaces({ demo, localTaskTitles: local, fetchServerTasks })
  if (allowed) calls.delete += 1
  return { allowed, calls }
}
const blocked = (r) => !r.allowed && r.calls.delete === 0
const show = (r) => JSON.stringify(r.calls)

let r = await runFlow({ local: zhTitles, server: { rows: zhTitles } })
check('all demo titles (zh) -> allowed, delete called', r.allowed && r.calls.delete === 1, show(r))

r = await runFlow({ local: enTitles, server: { rows: enTitles } })
check('all demo titles (en) -> allowed, delete called', r.allowed && r.calls.delete === 1, show(r))

r = await runFlow({ local: [], server: { rows: [] } })
check('0 tasks -> allowed', r.allowed && r.calls.delete === 1, show(r))

r = await runFlow({ local: zhTitles, server: { rows: [...zhTitles, 'my own task'] } })
check('demo + 1 user-made task -> blocked', blocked(r), show(r))

r = await runFlow({ local: [...zhTitles, 'my own task'], server: { rows: zhTitles } })
check('local state has a user-made task -> blocked (server not queried)', blocked(r) && r.calls.query === 0, show(r))

r = await runFlow({ server: { rows: [...zhTitles.slice(1), `${zhTitles[0]} (edited)`] } })
check('one demo task renamed -> blocked', blocked(r), show(r))

r = await runFlow({ server: { rows: [...zhTitles, zhTitles[0]] } })
check('count > N (all titles are demo titles) -> blocked', blocked(r), show(r))

r = await runFlow({ server: { data: [], count: null, error: null } })
check('count null -> blocked (fail safe)', blocked(r), show(r))

r = await runFlow({ server: { data: null, count: null, error: { message: 'boom' } } })
check('query error -> blocked (fail safe)', blocked(r), show(r))

r = await runFlow({ server: new Error('network down') })
check('query throws -> blocked (fail safe)', blocked(r), show(r))

r = await runFlow({ server: { data: [], count: 0, error: { message: 'boom' } } })
check('error alongside count 0 -> blocked', blocked(r), show(r))

// Real seed output: run the actual seedUserData for a normal (non-owner) signup
// with a recording fake, in both languages, and feed what it would insert.
function fakeSupabase(tasksOut) {
  return {
    from: (table) => ({
      insert: async (rows) => {
        if (table === 'tasks') tasksOut.push(...rows.map((row) => row.title))
        return { error: null }
      },
    }),
  }
}
for (const lang of ['zh-TW', 'en']) {
  setLang(lang)
  const seeded = []
  await seedUserData('user-1', 'someone@example.com', fakeSupabase(seeded))
  const rr = await runFlow({ local: seeded, server: { rows: seeded } })
  check(`real seedUserData output (${lang}, ${seeded.length} tasks) -> allowed`, seeded.length === N && rr.allowed && rr.calls.delete === 1, show(rr))
  const rr2 = await runFlow({ local: seeded, server: { rows: [...seeded, 'extra'] } })
  check(`real seedUserData output (${lang}) + 1 extra task -> blocked`, blocked(rr2), show(rr2))
}

// Source-level wiring: the real hook must call the guard before any write.
const src = readFileSync(new URL('../hooks/use-waddle-data.ts', import.meta.url), 'utf8')
const fnStart = src.indexOf('const applyOnboardingChoice = useCallback')
const body = src.slice(fnStart, src.indexOf('}, [supabase, workspaces])', fnStart))
const guardAt = body.indexOf('canResetWorkspaces(')
const firstWrite = Math.min(...[/\bsetWorkspaces\(/, /\.delete\(\)/, /\.insert\(/].map((re) => { const i = body.search(re); return i < 0 ? Infinity : i }))
check('hook: guard runs before any local/remote write', guardAt > -1 && guardAt < firstWrite, `guard@${guardAt} firstWrite@${firstWrite}`)
check('hook: server query is capped at N+1 rows', body.includes(".select('title', { count: 'exact' }).limit(demo.count + 1)"))
check('hook: declining path returns before writes', /if \(!allowed\) \{[\s\S]*?return\s*\n\s*\}/.test(body))
const dict = readFileSync(new URL('../lib/i18n/dict/data-layer.ts', import.meta.url), 'utf8')
check('i18n: English string exists for the decline toast', dict.includes("'已保留你現有的工作區與任務':"))

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
process.exit(failed ? 1 : 0)
