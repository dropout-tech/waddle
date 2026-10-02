// Pre-pack gate for the App Store build — run: node scripts/checks/ios-release-env.mjs
// Reads env the way `next build` does (process.env > .env.production.local > .env.local > .env.production > .env)
// and refuses to continue if the bundle would ship without purchases, with a test key, or pointed at the wrong backend.
// Prints variable names and verdicts only; values never reach the terminal.
import { existsSync, readFileSync } from 'node:fs'

const files = ['.env', '.env.production', '.env.local', '.env.production.local']
const env = {}
for (const f of files) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
for (const k of Object.keys(process.env)) if (k.startsWith('NEXT_PUBLIC_')) env[k] = process.env[k]

const PROD_REF = 'jnikcndiexjojgvicohf'
const checks = [
  ['NEXT_PUBLIC_BILLING_ENABLED is "true" (purchase card shows)', env.NEXT_PUBLIC_BILLING_ENABLED === 'true'],
  ['NEXT_PUBLIC_REVENUECAT_IOS_KEY is a production key (appl_…), not test_ (test keys crash Release builds)',
    /^appl_[A-Za-z0-9]+$/.test(env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? '')],
  ['NEXT_PUBLIC_SENTRY_DSN points at Sentry US ingest', /^https:\/\/[0-9a-f]+@o\d+\.ingest\.us\.sentry\.io\/\d+$/.test(env.NEXT_PUBLIC_SENTRY_DSN ?? '')],
  ['NEXT_PUBLIC_SUPABASE_URL is the production project', (env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(PROD_REF)],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY is set', (env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').length > 20],
  // Website card checkout must never be compiled into the app (App Store 3.1.1).
  ['NEXT_PUBLIC_WEB_BILLING_ENABLED is not "true"', env.NEXT_PUBLIC_WEB_BILLING_ENABLED !== 'true'],
]

let fail = 0
for (const [label, ok] of checks) {
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}
console.log(fail ? `${fail} FAILED — fix .env.local before \`pnpm cap:sync\`` : 'ALL PASS')
process.exit(fail ? 1 : 0)
