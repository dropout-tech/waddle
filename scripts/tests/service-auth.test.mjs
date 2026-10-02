// Server-key check for internal Edge Functions (supabase/functions/_shared/service-auth.mjs).
import test from 'node:test'
import assert from 'node:assert/strict'
import { isServiceCaller, serverKeys } from '../../supabase/functions/_shared/service-auth.mjs'

const LEGACY = 'eyJlegacy.service.role'
const NEW = 'sb_secret_new_key_123'
const envOf = (vars) => (name) => vars[name] ?? ''
const headers = (h) => new Headers(h)

test('Supabase Cron "Add secret key" (apikey header with a new secret key) is accepted', async () => {
  const env = envOf({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: NEW }) })
  assert.equal(await isServiceCaller(headers({ apikey: NEW }), env), true)
})
test('legacy service-role key as a Bearer token or apikey is still accepted', async () => {
  const env = envOf({ SUPABASE_SERVICE_ROLE_KEY: LEGACY })
  assert.equal(await isServiceCaller(headers({ Authorization: `Bearer ${LEGACY}` }), env), true)
  assert.equal(await isServiceCaller(headers({ apikey: LEGACY }), env), true)
})
test('anything else is refused: no key, wrong key, anon-looking key, empty config', async () => {
  const env = envOf({ SUPABASE_SERVICE_ROLE_KEY: LEGACY, SUPABASE_SECRET_KEYS: JSON.stringify({ default: NEW }) })
  assert.equal(await isServiceCaller(headers({}), env), false)
  assert.equal(await isServiceCaller(headers({ apikey: 'sb_publishable_xyz' }), env), false)
  assert.equal(await isServiceCaller(headers({ Authorization: 'Bearer wrong' }), env), false)
  assert.equal(await isServiceCaller(headers({ apikey: '' , Authorization: 'Bearer ' }), env), false)
  assert.equal(await isServiceCaller(headers({ apikey: NEW }), envOf({})), false, 'no configured keys never matches')
})
test('SUPABASE_SECRET_KEYS in any shape: JSON object, JSON array, plain string, comma list', () => {
  assert.deepEqual(serverKeys(envOf({ SUPABASE_SECRET_KEYS: '{"default":"a","cron":"b"}' })), ['a', 'b'])
  assert.deepEqual(serverKeys(envOf({ SUPABASE_SECRET_KEYS: '["a","b"]' })), ['a', 'b'])
  assert.deepEqual(serverKeys(envOf({ SUPABASE_SECRET_KEYS: '"a"' })), ['a'])
  assert.deepEqual(serverKeys(envOf({ SUPABASE_SECRET_KEYS: 'a, b' })), ['a', 'b'])
  assert.deepEqual(serverKeys(envOf({ SUPABASE_SERVICE_ROLE_KEY: 'L', SUPABASE_SECRET_KEYS: '{"x":"L","y":""}' })), ['L'])
})
