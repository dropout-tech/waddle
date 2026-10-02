// Guard: test / audit scripts must never make Supabase Auth send email.
// 2026-10-03 Supabase warned that jnikcndiexjojgvicohf's sending privileges
// were at risk from bounces — confirmation / recovery mail had gone to made-up
// test inboxes. Test accounts are created with the admin API instead
// (POST /auth/v1/admin/users with email_confirm: true sends nothing).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const self = fileURLToPath(import.meta.url)
const SCRIPT_EXT = /\.(mjs|cjs|js|ts|sh|py)$/

// Each of these makes GoTrue send a confirmation / recovery / magic-link / invite email.
const MAIL_SENDERS = [
  /\.auth\.signUp\(/, /resetPasswordForEmail\(/, /signInWithOtp\(/, /inviteUserByEmail\(/,
  /\.auth\.resend\(/, /generateLink\(/,
  /\/auth\/v1\/(signup|recover|otp|magiclink|invite|resend)\b/,
]

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (name === 'node_modules' || name.startsWith('.')) return []
    return statSync(p).isDirectory() ? walk(p) : SCRIPT_EXT.test(name) && p !== self ? [p] : []
  })
}

const files = walk(join(root, 'scripts'))

test('no script calls an Auth endpoint that sends email', () => {
  const hits = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').flatMap((line, i) =>
    MAIL_SENDERS.some((re) => re.test(line)) ? [`${relative(root, f)}:${i + 1}`] : []))
  assert.deepEqual(hits, [], 'Create test users with POST /auth/v1/admin/users + email_confirm: true instead')
})

test('admin user creation in scripts always sets email_confirm: true', () => {
  const bad = files.filter((f) => {
    const src = readFileSync(f, 'utf8')
    const creates = /admin\.createUser\(|\/auth\/v1\/admin\/users['"`]\s*,\s*\{\s*method:\s*['"]POST/.test(src)
    return creates && !/email_confirm:\s*true/.test(src)
  }).map((f) => relative(root, f))
  assert.deepEqual(bad, [])
})
