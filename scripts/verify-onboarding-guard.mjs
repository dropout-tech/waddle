// Guards the onboarding "apply template / start blank" wipe: it deletes every
// workspace (and tasks by cascade), so it must only run on an account that
// provably has zero tasks.
//
//   node scripts/verify-onboarding-guard.mjs
//
// Uses a fake supabase — no login, no network, never touches a real database.
import { readFileSync } from 'node:fs'
import { canResetWorkspaces } from '../lib/onboarding/can-reset-workspaces.ts'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

// Mirrors the flow in applyOnboardingChoice: guard first, delete only if allowed.
async function runFlow({ localTaskCount = 0, response }) {
  const calls = { count: 0, delete: 0 }
  const fake = {
    countTasks: async () => {
      calls.count += 1
      if (response instanceof Error) throw response
      return response
    },
    deleteWorkspaces: async () => { calls.delete += 1 },
  }
  const allowed = await canResetWorkspaces({ localTaskCount, fetchServerTaskCount: fake.countTasks })
  if (allowed) await fake.deleteWorkspaces()
  return { allowed, calls }
}

let r = await runFlow({ response: { count: 5, error: null } })
check('server count > 0 -> no delete', !r.allowed && r.calls.delete === 0, JSON.stringify(r.calls))

r = await runFlow({ localTaskCount: 3, response: { count: 0, error: null } })
check('local tasks > 0 -> no delete (server not even needed)', !r.allowed && r.calls.delete === 0, JSON.stringify(r.calls))

r = await runFlow({ response: { count: null, error: { message: 'boom' } } })
check('query error -> no delete (fail safe)', !r.allowed && r.calls.delete === 0, JSON.stringify(r.calls))

r = await runFlow({ response: new Error('network down') })
check('query throws -> no delete (fail safe)', !r.allowed && r.calls.delete === 0, JSON.stringify(r.calls))

r = await runFlow({ response: { count: null, error: null } })
check('count null without error -> no delete (unknown = fail safe)', !r.allowed && r.calls.delete === 0, JSON.stringify(r.calls))

r = await runFlow({ response: { count: 0, error: null } })
check('count === 0, no error -> original flow runs (delete called once)', r.allowed && r.calls.delete === 1, JSON.stringify(r.calls))

// Source-level wiring: the real hook must call the guard before any delete,
// and tell the user (i18n) when it declines.
const src = readFileSync(new URL('../hooks/use-waddle-data.ts', import.meta.url), 'utf8')
const fnStart = src.indexOf('const applyOnboardingChoice = useCallback')
const body = src.slice(fnStart, src.indexOf('}, [supabase, workspaces])', fnStart))
const guardAt = body.indexOf('canResetWorkspaces(')
const firstWrite = Math.min(...[/\bsetWorkspaces\(/, /\.delete\(\)/, /\.insert\(/].map((re) => { const i = body.search(re); return i < 0 ? Infinity : i }))
check('hook: guard runs before any local/remote write', guardAt > -1 && guardAt < firstWrite, `guard@${guardAt} firstWrite@${firstWrite}`)
check('hook: declining path returns before writes', /if \(!allowed\) \{[\s\S]*?return\s*\n\s*\}/.test(body))
const dict = readFileSync(new URL('../lib/i18n/dict/data-layer.ts', import.meta.url), 'utf8')
check('i18n: English string exists for the decline toast', dict.includes("'已保留你現有的工作區與任務':"))

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
process.exit(failed ? 1 : 0)
