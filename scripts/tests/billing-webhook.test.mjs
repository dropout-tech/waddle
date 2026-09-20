import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandler, snapshot, subscriberIds } from '../../supabase/functions/revenuecat-webhook/core.mjs'
const id = 'e33d985b-4bcb-456f-9658-9cc1085185ab'
const other = 'a33d985b-4bcb-456f-9658-9cc1085185ab'
const now = Date.now()
const config = { secret: 'Bearer test-only-secret', apiKey: 'test-key', entitlementId: 'pro', appIds: ['app-test'], databaseReady: true }
const body = () => ({ request_date_ms: now, subscriber: { entitlements: { pro: { product_identifier: 'monthly', expires_date: new Date(now + 60000).toISOString() } }, subscriptions: { monthly: { is_sandbox: false } } } })
const event = { id: 'evt-1', type: 'INITIAL_PURCHASE', app_id: 'app-test', app_user_id: id, environment: 'PRODUCTION' }
const request = (evt = event, authorization = config.secret) => new Request('https://example.test', { method: 'POST', headers: { authorization }, body: JSON.stringify({ event: evt }) })
function setup(overrides = {}) {
  const writes = []
  const handler = createHandler({ config, fetchSubscriber: async () => body(), persist: async (...args) => writes.push(args), ...overrides })
  return { handler, writes }
}
test('missing configuration and bad authorization cannot grant anything', async () => {
  const a = setup({ config: { ...config, apiKey: '' } }); assert.equal((await a.handler(request())).status, 503); assert.equal(a.writes.length, 0)
  const b = setup(); assert.equal((await b.handler(request(event, 'wrong'))).status, 401); assert.equal(b.writes.length, 0)
})
test('production purchase fetches authoritative snapshot and stores one event', async () => {
  const { handler, writes } = setup(); assert.equal((await handler(request())).status, 200)
  assert.equal(writes[0][0], 'evt-1'); assert.equal(writes[0][1][0].user_id, id); assert.ok(writes[0][1][0].expires_at)
})
test('untrusted app and sandbox event never write', async () => {
  const { handler, writes } = setup(); assert.equal((await handler(request({ ...event, app_id: 'wrong' }))).status, 403)
  assert.equal((await handler(request({ ...event, environment: 'SANDBOX' }))).status, 200); assert.equal(writes.length, 0)
})
test('transfer reconciles both authenticated account ids, not email or anonymous keys', () => {
  assert.deepEqual(subscriberIds({ type: 'TRANSFER', transferred_from: [id, '$RCAnonymousID:abc'], transferred_to: [other, 'user@example.test'] }), [id, other])
})
test('expired/refunded/sandbox/lifetime subscriptions cannot confer valid Pro', () => {
  const expired = body(); expired.subscriber.entitlements.pro.expires_date = new Date(now - 1000).toISOString()
  assert.ok(Date.parse(snapshot(expired, id, 'pro').expires_at) < now)
  for (const change of [{ is_sandbox: true }, { refunded_at: new Date(now).toISOString() }]) {
    const data = body(); Object.assign(data.subscriber.subscriptions.monthly, change); assert.equal(snapshot(data, id, 'pro').expires_at, null)
  }
  const data = body(); data.subscriber.entitlements.pro.expires_date = null; assert.equal(snapshot(data, id, 'pro').expires_at, null)
})
test('cancelled renewal keeps paid period, billing grace uses authoritative grace deadline', () => {
  const data = body(); data.subscriber.subscriptions.monthly.unsubscribe_detected_at = new Date(now).toISOString()
  assert.ok(Date.parse(snapshot(data, id, 'pro').expires_at) > now)
  data.subscriber.subscriptions.monthly.grace_period_expires_date = new Date(now + 120000).toISOString()
  assert.equal(Date.parse(snapshot(data, id, 'pro').expires_at), now + 120000)
})
test('upstream errors and DB errors remain retryable, never acknowledged', async () => {
  for (const key of ['fetchSubscriber', 'persist']) {
    const { handler } = setup({ [key]: async () => { throw new Error('outage') } })
    assert.equal((await handler(request())).status, 503)
  }
})
test('removing entitlement writes revocation with authoritative ordering timestamp', () => {
  const data = body(); data.subscriber.entitlements = {}
  assert.deepEqual(snapshot(data, id, 'pro'), { user_id: id, entitlement: 'pro', expires_at: null, observed_at_ms: now })
})
