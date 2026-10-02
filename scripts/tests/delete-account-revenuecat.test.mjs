// Account deletion releases the RevenueCat customer (supabase/functions/delete-account/revenuecat.mjs).
import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteRevenueCatCustomer } from '../../supabase/functions/delete-account/revenuecat.mjs'

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
test('RevenueCat errors and outages stop the deletion so the member can retry', async () => {
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
