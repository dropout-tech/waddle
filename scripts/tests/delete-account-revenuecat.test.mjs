// Account deletion releases the RevenueCat customer (supabase/functions/_shared/revenuecat-deletion.mjs).
import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteRevenueCatCustomer, releaseRevenueCatCustomer, drainDeletionQueue } from '../../supabase/functions/_shared/revenuecat-deletion.mjs'

const userId = 'e33d985b-4bcb-456f-9658-9cc1085185ab'
function fakeFetch(status) {
  const calls = []
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response('{}', { status }) }
  return { calls, fetchImpl }
}

test('billing not configured: nothing is called, deletion may continue', async () => {
  const { calls, fetchImpl } = fakeFetch(200)
  assert.equal(await deleteRevenueCatCustomer({ apiKey: '', userId, fetchImpl }), 'skipped')
  assert.equal(calls.length, 0)
})
test('deletes exactly this member, with the secret key, by DELETE', async () => {
  const { calls, fetchImpl } = fakeFetch(200)
  assert.equal(await deleteRevenueCatCustomer({ apiKey: 'sk_test', userId, fetchImpl }), 'deleted')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `https://api.revenuecat.com/v1/subscribers/${userId}`)
  assert.equal(calls[0].init.method, 'DELETE')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk_test')
})
test('a member who never bought anything (404) does not block deletion', async () => {
  assert.equal(await deleteRevenueCatCustomer({ apiKey: 'sk_test', userId, fetchImpl: fakeFetch(404).fetchImpl }), 'not_found')
})
test('RevenueCat errors and outages are reported as failures', async () => {
  for (const status of [401, 429, 500, 503]) {
    await assert.rejects(deleteRevenueCatCustomer({ apiKey: 'sk_test', userId, fetchImpl: fakeFetch(status).fetchImpl }), new RegExp(String(status)))
  }
  await assert.rejects(deleteRevenueCatCustomer({ apiKey: 'sk_test', userId, fetchImpl: async () => { throw new Error('network down') } }), /network down/)
})
test('never sends a request without a real user id', async () => {
  const { calls, fetchImpl } = fakeFetch(200)
  for (const bad of ['', undefined, '../subscribers', 'user@example.test']) {
    await assert.rejects(deleteRevenueCatCustomer({ apiKey: 'sk_test', userId: bad, fetchImpl }))
  }
  assert.equal(calls.length, 0)
})

const noSleep = async () => {}
test('account deletion path: an outage is retried, then queued — never blocks the deletion', async () => {
  const queued = []
  const enqueue = async (id, message) => { queued.push([id, message]) }
  const down = fakeFetch(503)
  assert.equal(await releaseRevenueCatCustomer({ apiKey: 'sk_test', userId, enqueue, fetchImpl: down.fetchImpl, sleep: noSleep }), 'queued')
  assert.equal(down.calls.length, 3, 'three quick tries before queueing')
  assert.deepEqual(queued.map(([id]) => id), [userId])
  assert.match(queued[0][1], /503/)
})
test('account deletion path: a blip that recovers is not queued', async () => {
  let n = 0
  const fetchImpl = async () => new Response('{}', { status: ++n === 1 ? 500 : 200 })
  const queued = []
  assert.equal(await releaseRevenueCatCustomer({ apiKey: 'sk_test', userId, enqueue: async (id) => queued.push(id), fetchImpl, sleep: noSleep }), 'deleted')
  assert.equal(queued.length, 0)
})
test('account deletion path: not configured or never bought → nothing queued', async () => {
  const queued = []
  const enqueue = async (id) => queued.push(id)
  assert.equal(await releaseRevenueCatCustomer({ apiKey: '', userId, enqueue, sleep: noSleep }), 'skipped')
  assert.equal(await releaseRevenueCatCustomer({ apiKey: 'sk_test', userId, enqueue, fetchImpl: fakeFetch(404).fetchImpl, sleep: noSleep }), 'not_found')
  assert.equal(queued.length, 0)
})
test('account deletion path: if even queueing fails, the caller is told (so it can refuse to delete)', async () => {
  const enqueue = async () => { throw new Error('db down') }
  await assert.rejects(releaseRevenueCatCustomer({ apiKey: 'sk_test', userId, enqueue, fetchImpl: fakeFetch(503).fetchImpl, sleep: noSleep }), /db down/)
})
test('retry queue: confirmed rows are removed, failures recorded with one more attempt, one bad row does not stop the rest', async () => {
  const other = 'a33d985b-4bcb-456f-9658-9cc1085185ab'
  const rows = [{ app_user_id: userId, attempts: 2 }, { app_user_id: other, attempts: 0 }]
  const done = []; const failed = []
  const fetchImpl = async (url) => new Response('{}', { status: url.endsWith(userId) ? 503 : 200 })
  const summary = await drainDeletionQueue({
    apiKey: 'sk_test', fetchImpl, limit: 10,
    list: async (n) => { assert.equal(n, 10); return rows },
    done: async (id) => done.push(id),
    failed: async (id, attempts, message) => failed.push([id, attempts, message]),
  })
  assert.deepEqual(summary, { deleted: 1, failed: 1 })
  assert.deepEqual(done, [other])
  assert.equal(failed[0][0], userId); assert.equal(failed[0][1], 3); assert.match(failed[0][2], /503/)
})
test('retry queue: does nothing until billing is configured', async () => {
  let listed = false
  const summary = await drainDeletionQueue({ apiKey: '', list: async () => { listed = true; return [] }, done: async () => {}, failed: async () => {} })
  assert.deepEqual(summary, { deleted: 0, failed: 0 }); assert.equal(listed, false)
})
