// Website billing P2 Edge Function handlers with fake DB / SLP / clock.
// CI runs `node --test scripts/tests/*.test.mjs`; the core / slp unit tests
// live next to the code (contract §0) and are pulled in here so CI runs them.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import '../../supabase/functions/_shared/web-billing/core.test.mjs'
import '../../supabase/functions/_shared/web-billing/slp.test.mjs'
import { DbError } from '../../supabase/functions/_shared/web-billing/core.mjs'
import { createWebBillingHandler } from '../../supabase/functions/web-billing/handler.mjs'
import { createWebhookHandler, eventCategory } from '../../supabase/functions/web-billing-webhook/handler.mjs'
import { createCronHandler, MAX_CHARGES_PER_TICK } from '../../supabase/functions/web-billing-cron/handler.mjs'

const USER = 'e33d985b-4bcb-456f-9658-9cc1085185ab'
const REFC = 'e33d985b4bcb456f96589cc1085185ab'
const REF = 'hsAbCdEf0123456789c0001a01'

// Fake DB: per-op handlers, every call recorded.
function fakeDb(ops = {}, { user = { id: USER }, allowed = true, billing = { subscription: null } } = {}) {
  const calls = []
  return {
    calls,
    ops: (name) => calls.filter((c) => c.op === name),
    async getUser(token) { calls.push({ op: 'getUser', token }); return token === 'good-jwt' ? user : null },
    async rpc(fn, args) { calls.push({ op: `rpc:${fn}`, args }); return allowed },
    async userRpc(token, fn) { calls.push({ op: `user:${fn}`, token }); return billing },
    async server(op, args = {}) {
      calls.push({ op, args })
      const h = ops[op]
      if (h instanceof Error) throw h
      if (typeof h === 'function') return h(args)
      if (h !== undefined) return h
      if (op === 'apply_payment_result') return { applied: true, status: args.result.status }
      if (op === 'apply_refund_result') return { applied: true, status: args.result.status }
      return { ok: true }
    },
  }
}
function fakeSlp(over = {}) {
  const calls = []
  const wrap = (name, fn) => async (...args) => { calls.push({ name, args }); return fn(...args) }
  const base = {
    createPayment: async () => ({ ok: true, data: { tradeOrderId: 'T9', status: 'PROCESSING', nextAction: { type: 'redirect', url: 'https://3ds.example' } } }),
    getPayment: async () => ({ ok: true, data: { referenceOrderId: REF, tradeOrderId: 'T9', status: 'SUCCEEDED', paidAmount: { value: 15000 } } }),
    createRefund: async () => ({ ok: true, data: { refundOrderId: 'RF1', status: 'PROCESSING' } }),
    getRefund: async () => ({ ok: true, data: { referenceOrderId: 'hsAbCdEf0123456789c0001r01', refundOrderId: 'RF1', status: 'SUCCEEDED', amount: { value: 15000 } } }),
    customerToken: async () => ({ ok: true, data: { customerToken: 'ctok', expireTime: 600 } }),
    queryInstruments: async () => ({ ok: true, data: { referenceCustomerId: REFC, paymentInstruments: [{ instrumentId: 'INS9', instrumentStatus: 'SUCCESSED', instrumentCard: { brand: 'Visa', last: '8405' } }] } }),
    unbind: async () => ({ ok: true, data: {} }),
    cancelPayment: async () => ({ ok: true, data: { status: 'PROCESSING' } }),
    ...over,
  }
  const slp = { calls }
  for (const [k, v] of Object.entries(base)) slp[k] = wrap(k, v)
  return slp
}
const ctxStart = { subscription_id: 'sub-1', attempt_id: 'att-1', reference_order_id: REF, order_ref: 'AbCdEf0123456789', kind: 'card_bind',
  behavior: 'CardBind', plan: 'monthly', with_trial: true, cycle: 0, amount_minor: 0, charge_amount_minor: 15000, customer_id: null, reference_customer_id: REFC }

// ── web-billing ────────────────────────────────────────────────────────────
const wbConfig = { ready: true, slpProblem: null, prefix: 'hs', siteUrl: 'https://huddle.example' }
const wbRequest = (body, headers = {}) => new Request('https://fn.example/web-billing', {
  method: 'POST', headers: { authorization: 'Bearer good-jwt', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
const wb = (db, slp, config = wbConfig) => createWebBillingHandler({ config, db, slp })

test('web-billing: missing secrets → 503 unavailable before touching anything', async () => {
  const db = fakeDb(); const slp = fakeSlp()
  for (const config of [{ ...wbConfig, ready: false }, { ...wbConfig, slpProblem: 'missing' }, { ...wbConfig, siteUrl: '' }]) {
    const r = await wb(db, slp, config)(wbRequest({ action: 'status' }))
    assert.equal(r.status, 503)
    assert.deepEqual(await r.json(), { ok: false, error: 'unavailable' })
  }
  assert.equal(db.calls.length, 0)
  assert.equal(slp.calls.length, 0)
})

test('web-billing: no / bad JWT → 401; bad body or action → 400; suspended → 401', async () => {
  const db = fakeDb(); const slp = fakeSlp()
  assert.equal((await wb(db, slp)(wbRequest({ action: 'status' }, { authorization: '' }))).status, 401)
  assert.equal((await wb(db, slp)(wbRequest({ action: 'status' }, { authorization: 'Bearer forged' }))).status, 401)
  assert.equal((await wb(db, slp)(wbRequest({ action: 'delete_everything' }))).status, 400)
  const raw = new Request('https://fn.example', { method: 'POST', headers: { authorization: 'Bearer good-jwt' }, body: '{not json' })
  assert.equal((await wb(db, slp)(raw)).status, 400)
  const big = new Request('https://fn.example', { method: 'POST', headers: { authorization: 'Bearer good-jwt' }, body: JSON.stringify({ action: 'status', pad: 'x'.repeat(20000) }) })
  assert.equal((await wb(db, slp)(big)).status, 400)
  const suspended = fakeDb({}, { allowed: false })
  const r = await wb(suspended, slp)(wbRequest({ action: 'cancel' }))
  assert.deepEqual([r.status, (await r.json()).error], [401, 'unauthorized'])
  assert.equal(suspended.ops('cancel').length, 0)
})

test('web-billing start: member id from JWT only, deterministic order id as idempotentKey, next_action returned', async () => {
  const db = fakeDb({ start_checkout: ctxStart })
  const slp = fakeSlp()
  const r = await wb(db, slp)(wbRequest({ action: 'start', plan: 'monthly', paySession: 'ps_1', locale: 'en', user_id: 'attacker-id' },
    { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { ok: true, subscription_id: 'sub-1', next_action: { type: 'redirect', url: 'https://3ds.example' } })
  assert.deepEqual(db.ops('rate_hit')[0].args, { user_id: USER, bucket: 'write' })
  assert.deepEqual(db.ops('start_checkout')[0].args, { user_id: USER, kind: 'start', plan: 'monthly', prefix: 'hs', expect_trial: null })
  const [body, opts] = slp.calls[0].args
  assert.equal(body.referenceOrderId, REF)
  assert.equal(opts.idempotentKey, REF)
  assert.deepEqual(body.amount, { value: 15000, currency: 'TWD' })
  assert.equal(body.paySession, 'ps_1')
  assert.equal(body.client.ip, '203.0.113.9')
  assert.equal(body.returnUrl, 'https://huddle.example/billing/return?ref=AbCdEf0123456789&k=start')
  assert.equal(body.confirm.paymentBehavior, 'CardBind')
  assert.deepEqual(db.ops('apply_payment_result')[0].args, { reference_order_id: REF, result: { status: 'pending', trade_order_id: 'T9', slp_status: 'PROCESSING', slp_sub_status: null } })
})

test('web-billing start: member e-mail goes into the three personalInfo blocks; unreadable member IP → server IP, logged', async () => {
  const db = fakeDb({ start_checkout: ctxStart }, { user: { id: USER, email: 'member@example.com' } })
  const slp = fakeSlp()
  const logs = []
  const handler = createWebBillingHandler({ config: { ...wbConfig, serverIp: '198.51.100.7' }, db, slp, log: (e) => logs.push(e), now: () => NOW })
  const r = await handler(wbRequest({ action: 'start', plan: 'monthly', paySession: 'ps_1' }))
  assert.equal(r.status, 200)
  const [body] = slp.calls[0].args
  for (const p of [body.customer.personalInfo, body.order.shipping.personalInfo, body.billing.personalInfo]) assert.equal(p.email, 'member@example.com')
  assert.equal(body.client.ip, '198.51.100.7')
  assert.equal(logs.find((l) => l.client_ip)?.client_ip, 'fallback')
  assert.equal(JSON.stringify(logs).includes('member@example.com'), false, 'e-mail never logged')
})

test('web-billing start: SLP timeout → attempt marked unknown (never retried), 502 slp_error', async () => {
  const db = fakeDb({ start_checkout: { ...ctxStart, kind: 'first_purchase', behavior: 'CardBindPayment', amount_minor: 15000 } })
  const slp = fakeSlp({ createPayment: async () => ({ ok: false, kind: 'timeout' }) })
  const r = await wb(db, slp)(wbRequest({ action: 'start', plan: 'monthly', paySession: 'ps' }))
  assert.deepEqual([r.status, (await r.json()).error], [502, 'slp_error'])
  assert.deepEqual(db.ops('apply_payment_result')[0].args.result, { status: 'unknown', failure_code: 'timeout' })
  assert.equal(slp.calls.length, 1)
})

test('web-billing start: synchronous decline → failed recorded, 502; DB refusals map to contract codes', async () => {
  const db = fakeDb({ start_checkout: { ...ctxStart, kind: 'first_purchase', behavior: 'CardBindPayment' },
    attempt_context: { ...ctxStart, kind: 'first_purchase', trade_order_id: 'T9', known_instruments: [] } })
  const slp = fakeSlp({ createPayment: async () => ({ ok: true, data: { tradeOrderId: 'T9', status: 'FAILED', paymentMsg: { code: '1203' } } }) })
  const r = await wb(db, slp)(wbRequest({ action: 'start', plan: 'annual', paySession: 'ps' }))
  assert.equal(r.status, 502)
  assert.equal(db.ops('apply_payment_result')[1].args.result.status, 'failed')
  for (const [code, status] of [['already_subscribed', 409], ['apple_active', 409], ['disabled', 403], ['payment_in_progress', 409], ['trial_used', 409], ['rate_limited', 429]]) {
    const d = fakeDb({ start_checkout: new DbError(code) })
    const res = await wb(d, fakeSlp())(wbRequest({ action: 'start', plan: 'monthly', paySession: 'ps', expectTrial: true }))
    assert.deepEqual([res.status, (await res.json()).error], [status, code])
  }
  const weird = await wb(fakeDb({ start_checkout: new DbError('something_else') }), fakeSlp())(wbRequest({ action: 'start', plan: 'monthly', paySession: 'ps' }))
  assert.deepEqual([weird.status, (await weird.json()).error], [503, 'unavailable'])
})

test('web-billing: purchase actions refused inside the iOS shell (Apple 3.1.1) and with bad input', async () => {
  const db = fakeDb({ start_checkout: ctxStart }); const slp = fakeSlp()
  for (const action of ['start', 'card_start', 'pay_now']) {
    const r = await wb(db, slp)(wbRequest({ action, plan: 'monthly', paySession: 'ps' }, { origin: 'capacitor://localhost' }))
    assert.deepEqual([r.status, (await r.json()).error], [403, 'native_not_allowed'])
  }
  assert.equal((await wb(db, slp)(wbRequest({ action: 'start', plan: 'weekly', paySession: 'ps' }))).status, 400)
  assert.equal((await wb(db, slp)(wbRequest({ action: 'start', plan: 'monthly' }))).status, 400)
  assert.equal((await wb(db, slp)(wbRequest({ action: 'pay_now', paySession: 'ps', locale: 'fr' }))).status, 400)
  assert.equal((await wb(db, slp)(wbRequest({ action: 'start', plan: 'monthly', paySession: 'ps', expectTrial: 'yes' }))).status, 400)
  assert.equal(db.ops('start_checkout').length, 0)
  assert.equal(slp.calls.length, 0)
})

test('web-billing status: asks SLP about own undecided requests before answering (not only webhooks)', async () => {
  const open = [{ ...ctxStart, kind: 'recurring', status: 'pending', trade_order_id: 'T9' }, { ...ctxStart, reference_order_id: 'hsAbCdEf0123456789c0002a01', trade_order_id: null }]
  const db = fakeDb({ open_attempts: open }, { billing: { subscription: { status: 'active' } } })
  const slp = fakeSlp()
  const r = await wb(db, slp)(wbRequest({ action: 'status' }))
  assert.deepEqual(await r.json(), { ok: true, billing: { subscription: { status: 'active' } } })
  assert.deepEqual(db.ops('rate_hit')[0].args.bucket, 'read')
  assert.equal(slp.calls.filter((c) => c.name === 'getPayment').length, 1)
  assert.equal(db.ops('apply_payment_result')[0].args.result.status, 'succeeded')
  assert.equal(db.ops('user:my_web_billing').length, 1)
})

test('web-billing refund: automatic SLP refund with deterministic id; SLP refusal → needs_review; card unbound on success', async () => {
  const req = { refund_id: 'rf-1', reference_order_id: 'hsAbCdEf0123456789c0001r01', status: 'requested', amount_minor: 15000, trade_order_id: 'T1' }
  const db = fakeDb({ request_refund: req })
  const slp = fakeSlp()
  const r = await wb(db, slp)(wbRequest({ action: 'refund', payment_id: '5b2c9a8e-1111-4222-8333-944455556666' }))
  assert.equal((await r.json()).refund_status, 'processing')
  assert.deepEqual(db.ops('request_refund')[0].args, { user_id: USER, payment_id: '5b2c9a8e-1111-4222-8333-944455556666', prefix: 'hs' })
  const [body, opts] = slp.calls[0].args
  assert.deepEqual(body, { referenceOrderId: req.reference_order_id, tradeOrderId: 'T1', amount: { value: 15000, currency: 'TWD' }, reason: 'cooling_off' })
  assert.equal(opts.idempotentKey, req.reference_order_id)
  const refused = fakeDb({ request_refund: req, apply_refund_result: { applied: true, status: 'needs_review' } })
  const r2 = await wb(refused, fakeSlp({ createRefund: async () => ({ ok: false, kind: 'http', status: 400, code: '1099' }) }))(wbRequest({ action: 'refund', payment_id: '5b2c9a8e-1111-4222-8333-944455556666' }))
  assert.equal((await r2.json()).refund_status, 'needs_review')
  assert.deepEqual(refused.ops('apply_refund_result')[0].args.result, { status: 'failed' })
  const timeout = fakeDb({ request_refund: req })
  await wb(timeout, fakeSlp({ createRefund: async () => ({ ok: false, kind: 'timeout' }) }))(wbRequest({ action: 'refund', payment_id: '5b2c9a8e-1111-4222-8333-944455556666' }))
  assert.equal(timeout.ops('apply_refund_result').length, 0, 'timeout: left requested for a human, never re-sent')
  const done = fakeDb({ request_refund: req, apply_refund_result: { applied: true, status: 'succeeded', unbind: { customer_id: 'CUS1', instrument_id: 'INS1' } } })
  const s3 = fakeSlp()
  await wb(done, s3)(wbRequest({ action: 'refund', payment_id: '5b2c9a8e-1111-4222-8333-944455556666' }))
  assert.deepEqual(s3.calls.find((c) => c.name === 'unbind').args, ['CUS1', 'INS1'])
  const manual = fakeDb({ request_refund: { ...req, status: 'needs_review' } })
  const s4 = fakeSlp()
  assert.equal((await (await wb(manual, s4)(wbRequest({ action: 'refund', payment_id: '5b2c9a8e-1111-4222-8333-944455556666' }))).json()).refund_status, 'needs_review')
  assert.equal(s4.calls.length, 0, 'second refund of a member goes to a human, no SLP call')
  assert.equal((await wb(db, slp)(wbRequest({ action: 'refund', payment_id: 'not-a-uuid' }))).status, 400)
})

test('web-billing customer_token / cancel / resume', async () => {
  const db = fakeDb({ customer_of: { customer_id: 'CUS1' } }, { billing: { subscription: { cancel_at_period_end: true } } })
  const slp = fakeSlp()
  const t = await (await createWebBillingHandler({ config: wbConfig, db, slp, now: () => 1_790_000_000_000 })(wbRequest({ action: 'customer_token' }))).json()
  assert.deepEqual(t, { ok: true, customer_token: 'ctok', expires_at: new Date(1_790_000_600_000).toISOString() })
  assert.deepEqual(slp.calls[0].args, ['CUS1'])
  assert.equal((await wb(fakeDb({ customer_of: null }), slp)(wbRequest({ action: 'customer_token' }))).status, 404)
  const c = await (await wb(db, slp)(wbRequest({ action: 'cancel' }))).json()
  assert.deepEqual(c, { ok: true, billing: { subscription: { cancel_at_period_end: true } } })
  assert.deepEqual(db.ops('cancel')[0].args, { user_id: USER })
  await wb(db, slp)(wbRequest({ action: 'resume' }))
  assert.deepEqual(db.ops('resume')[0].args, { user_id: USER })
  const nf = await wb(fakeDb({ resume: new DbError('not_found') }), slp)(wbRequest({ action: 'resume' }))
  assert.deepEqual([nf.status, (await nf.json()).error], [404, 'not_found'])
})

// ── web-billing-webhook ────────────────────────────────────────────────────
const SIGN_KEY = 'whsec-test-only'
const NOW = 1_790_000_000_000
const whConfig = { ready: true, slpProblem: null, signKey: SIGN_KEY, merchantId: 'M123', prefix: 'hs' }
function whRequest(event, { ts = String(NOW), key = SIGN_KEY, merchant = 'M123', raw } = {}) {
  const body = raw ?? JSON.stringify(event)
  const sign = createHmac('sha256', key).update(`${ts}.${body}`).digest('hex')
  return new Request('https://fn.example/web-billing-webhook', { method: 'POST', headers: { timestamp: ts, sign, merchantId: merchant, apiVersion: 'V1.2', 'content-type': 'application/json' }, body })
}
const wh = (db, slp, config = whConfig) => createWebhookHandler({ config, db, slp, now: () => NOW })
const tradeEvent = (over = {}) => ({ id: 'evt_1', type: 'trade.succeeded', created: NOW, data: { referenceOrderId: REF, tradeOrderId: 'T9', status: 'SUCCEEDED', ...over } })
const attemptCtx = { reference_order_id: REF, kind: 'recurring', status: 'pending', trade_order_id: 'T9', reference_customer_id: REFC, customer_id: 'CUS1', known_instruments: [] }

test('webhook: unsigned, badly signed, replayed, wrong merchant, oversized → rejected before any DB / SLP call', async () => {
  const db = fakeDb(); const slp = fakeSlp()
  assert.equal((await wh(db, slp, { ...whConfig, signKey: '' })(whRequest(tradeEvent()))).status, 503)
  assert.equal((await wh(db, slp)(whRequest(tradeEvent(), { key: 'attacker-key' }))).status, 401)
  assert.equal((await wh(db, slp)(whRequest(tradeEvent(), { ts: String(NOW - 301000) }))).status, 401)
  assert.equal((await wh(db, slp)(whRequest(tradeEvent(), { merchant: 'M999' }))).status, 403)
  assert.equal((await wh(db, slp)(whRequest(null, { raw: JSON.stringify({ ...tradeEvent(), pad: 'x'.repeat(100001) }) }))).status, 413)
  const tampered = whRequest(tradeEvent())
  const body = (await tampered.clone().text()).replace('SUCCEEDED', 'FAILED')
  const forged = new Request(tampered.url, { method: 'POST', headers: tampered.headers, body })
  assert.equal((await wh(db, slp)(forged)).status, 401)
  assert.equal(db.calls.length, 0)
  assert.equal(slp.calls.length, 0)
})

test('webhook: merchantId header is optional (not in the docs) but a different one is refused', async () => {
  const db = fakeDb(); const slp = fakeSlp()
  const noHeader = whRequest(tradeEvent())
  const headers = new Headers(noHeader.headers); headers.delete('merchantId')
  const absent = new Request(noHeader.url, { method: 'POST', headers, body: await noHeader.clone().text() })
  assert.equal((await wh(db, slp)(absent)).status, 200, 'signed event without the header is accepted')
  assert.equal((await wh(fakeDb(), slp)(whRequest(tradeEvent(), { merchant: 'M999' }))).status, 403)
  assert.equal((await wh(fakeDb(), slp)(whRequest(tradeEvent(), { merchant: 'M123' }))).status, 200)
})

test('webhook: other developers\' orders (shared sandbox) and irrelevant types are acknowledged and ignored', async () => {
  const db = fakeDb(); const slp = fakeSlp()
  const r = await wh(db, slp)(whRequest(tradeEvent({ referenceOrderId: 'woo-12345' })))
  assert.deepEqual([r.status, (await r.json()).ignored], [200, 'not_ours'])
  const r2 = await wh(db, slp)(whRequest({ id: 'evt_2', type: 'dispute.created', data: {} }))
  assert.deepEqual([r2.status, (await r2.json()).ignored], [200, 'type'])
  assert.equal(db.calls.length, 0)
  assert.equal(eventCategory('trade.refund.succeeded'), 'refund')
  assert.equal(eventCategory('refund.succeeded'), 'refund')
})

test('webhook: body is never trusted — "succeeded" in the event, SLP says FAILED → failure applied', async () => {
  const db = fakeDb({ webhook_begin: 'new', attempt_context: attemptCtx })
  const slp = fakeSlp({ getPayment: async () => ({ ok: true, data: { referenceOrderId: REF, tradeOrderId: 'T9', status: 'FAILED', paymentMsg: { code: '4900' } } }) })
  const r = await wh(db, slp)(whRequest(tradeEvent()))
  assert.equal(r.status, 200)
  const applied = db.ops('apply_payment_result')[0].args
  assert.equal(applied.reference_order_id, REF)
  assert.deepEqual([applied.result.status, applied.result.failure_kind], ['failed', 'customer_action'])
  assert.deepEqual(db.ops('webhook_begin')[0].args.payload, { type: 'trade.succeeded', referenceOrderId: REF, tradeOrderId: 'T9', refundOrderId: null, status: 'SUCCEEDED' })
  assert.equal(db.ops('webhook_finish')[0].args.outcome, 'applied_failed')
})

test('webhook: a forged trade id pointing at another order changes nothing', async () => {
  const db = fakeDb({ webhook_begin: 'new', attempt_context: { ...attemptCtx, trade_order_id: null } })
  const slp = fakeSlp({ getPayment: async () => ({ ok: true, data: { referenceOrderId: 'hsZZZZZZZZZZZZZZZZc0001a01', tradeOrderId: 'OTHER', status: 'SUCCEEDED' } }) })
  const r = await wh(db, slp)(whRequest(tradeEvent({ tradeOrderId: 'OTHER' })))
  assert.equal(r.status, 200)
  assert.equal(db.ops('apply_payment_result').length, 0)
  assert.equal(db.ops('webhook_finish')[0].args.outcome, 'order_mismatch')
})

test('webhook: SLP unreachable → 503 and the event stays unprocessed (SLP re-sends); duplicates skipped', async () => {
  const db = fakeDb({ webhook_begin: 'new', attempt_context: attemptCtx })
  const r = await wh(db, fakeSlp({ getPayment: async () => ({ ok: false, kind: 'timeout' }) }))(whRequest(tradeEvent()))
  assert.equal(r.status, 503)
  assert.equal(db.ops('webhook_finish').length, 0)
  const dup = fakeDb({ webhook_begin: 'duplicate' }); const slp = fakeSlp()
  const r2 = await wh(dup, slp)(whRequest(tradeEvent()))
  assert.deepEqual([r2.status, (await r2.json()).duplicate], [200, true])
  assert.equal(slp.calls.length, 0)
  const dbDown = fakeDb({ webhook_begin: new DbError('unavailable') })
  assert.equal((await wh(dbDown, fakeSlp())(whRequest(tradeEvent()))).status, 503)
})

test('webhook refund: re-read from SLP refund/get, applied, card unbound', async () => {
  const refRef = 'hsAbCdEf0123456789c0001r01'
  const db = fakeDb({ webhook_begin: 'new', refund_context: { reference_order_id: refRef, status: 'processing', refund_order_id: 'RF1' },
    apply_refund_result: { applied: true, status: 'succeeded', unbind: { customer_id: 'CUS1', instrument_id: 'INS1' } } })
  const slp = fakeSlp()
  const r = await wh(db, slp)(whRequest({ id: 'evt_r', type: 'trade.refund.succeeded', data: { referenceOrderId: refRef, refundOrderId: 'RF-FORGED', status: 'SUCCEEDED' } }))
  assert.equal(r.status, 200)
  assert.deepEqual(slp.calls.find((c) => c.name === 'getRefund').args, ['RF1'], 'stored SLP refund id wins over the event body')
  assert.deepEqual(db.ops('apply_refund_result')[0].args.result, { status: 'succeeded', refund_order_id: 'RF1', amount_minor: 15000 })
  assert.deepEqual(slp.calls.find((c) => c.name === 'unbind').args, ['CUS1', 'INS1'])
})

test('webhook customer.instrument.binded: member found by referenceCustomerId, card verified with SLP before trialing', async () => {
  const bind = { ...ctxStart, kind: 'card_bind', status: 'pending', trade_order_id: 'T9', customer_id: null, known_instruments: [] }
  const db = fakeDb({ webhook_begin: 'new', user_by_ref: { user_id: USER, open_attempts: [bind] } })
  const slp = fakeSlp({ getPayment: async () => ({ ok: true, data: { referenceOrderId: REF, tradeOrderId: 'T9', status: 'SUCCEEDED' } }) })
  const ev = { id: 'evt_b', type: 'customer.instrument.binded', data: { customerId: 'CUS9', referenceCustomerId: REFC, paymentInstrument: { instrumentId: 'INS9', instrumentStatus: 'SUCCESSED' } } }
  assert.equal((await wh(db, slp)(whRequest(ev))).status, 200)
  assert.deepEqual(slp.calls.find((c) => c.name === 'queryInstruments').args, ['CUS9'])
  const res = db.ops('apply_payment_result')[0].args.result
  assert.deepEqual([res.status, res.customer_id, res.instrument.id, res.instrument.last4], ['succeeded', 'CUS9', 'INS9', '8405'])
  // The card must belong to THIS member at SLP, whatever the event says.
  const db2 = fakeDb({ webhook_begin: 'new', user_by_ref: { user_id: USER, open_attempts: [bind] } })
  const slp2 = fakeSlp({ getPayment: async () => ({ ok: true, data: { referenceOrderId: REF, status: 'SUCCEEDED' } }),
    queryInstruments: async () => ({ ok: true, data: { referenceCustomerId: 'ffffffffffffffffffffffffffffffff', paymentInstruments: [{ instrumentId: 'INS9', instrumentStatus: 'SUCCESSED' }] } }) })
  await wh(db2, slp2)(whRequest(ev))
  assert.equal(db2.ops('apply_payment_result')[0].args.result.status, 'pending')
  const db3 = fakeDb({ webhook_begin: 'new', user_by_ref: null })
  const r3 = await wh(db3, fakeSlp())(whRequest(ev))
  assert.equal(r3.status, 200)
  assert.equal(db3.ops('webhook_finish')[0].args.outcome, 'unknown_customer')
})

// ── web-billing-cron ───────────────────────────────────────────────────────
const crConfig = { ready: true, slpProblem: null, cronSecret: 'cron-secret-test', prefix: 'hs', siteUrl: 'https://huddle.example',
  resendApiKey: 're_test', resendFrom: 'Huddle <billing@example.invalid>', serverIp: '198.51.100.7' }
const crRequest = (secret = 'cron-secret-test', method = 'POST') => new Request('https://fn.example/web-billing-cron', { method, headers: { 'x-cron-secret': secret }, body: method === 'POST' ? '{"job":"tick"}' : undefined })
function fakeEmail() {
  const seen = { process: [], send: [] }
  return {
    seen,
    renderEmail: () => ({ subject: 's', html: 'h', text: 't' }),
    sendEmail: async (fetchFn, args) => { seen.send.push(args); return { ok: true, providerId: 're_1' } },
    processOutbox: async (deps) => {
      seen.process.push(deps)
      const rows = await deps.claim(deps.max)
      for (const row of rows) {
        const r = await deps.send({ to: row.to_email, subject: 's', html: 'h', text: 't', idempotencyKey: row.id })
        await deps.finish(row.id, r.ok, r.providerId, false)
      }
      return { sent: rows.length, failed: 0, skipped: 0, errors: [] }
    },
  }
}
const cron = (db, slp, { email = fakeEmail(), now = () => NOW, config = crConfig } = {}) =>
  createCronHandler({ config, db, slp, email, fetch: async () => { throw new Error('no network in tests') }, now })
const baseCron = (over = {}) => ({ config: { checkout_mode: 'on', renewals_enabled: true }, take_lease: '2026-10-02T10:05:00.000000+00:00',
  reconcile_candidates: { attempts: [], refunds: [] }, claim_due: [], expire_due: { expired: 0 }, enqueue_reminders: { missing: true },
  claim_outbox: { missing: true }, ...over })

test('cron: POST + constant-time secret only; missing secrets → 503', async () => {
  const db = fakeDb(baseCron()); const slp = fakeSlp()
  assert.equal((await cron(db, slp)(crRequest('wrong'))).status, 401)
  assert.equal((await cron(db, slp)(crRequest('cron-secret-test', 'GET'))).status, 405)
  assert.equal((await cron(db, slp, { config: { ...crConfig, resendApiKey: '' } })(crRequest())).status, 503)
  assert.equal((await cron(db, slp, { config: { ...crConfig, cronSecret: '' } })(crRequest(''))).status, 503)
  assert.equal(db.calls.length, 0)
})

test('cron: both switches off → no-op (not even the lease); lease held → skip', async () => {
  const off = fakeDb(baseCron({ config: { checkout_mode: 'off', renewals_enabled: false } }))
  const r = await cron(off, fakeSlp())(crRequest())
  assert.deepEqual(await r.json(), { skipped: 'disabled' })
  assert.deepEqual(off.calls.map((c) => c.op), ['config'])
  const held = fakeDb(baseCron({ take_lease: null }))
  assert.deepEqual(await (await cron(held, fakeSlp())(crRequest())).json(), { skipped: 'lease_held' })
  assert.equal(held.ops('claim_due').length, 0)
})

test('cron: at most 10 charges per tick, one claim at a time, results recorded, lease released', async () => {
  let n = 0
  const claimed = () => { n++; return [{ attempt_id: `a${n}`, reference_order_id: `hsAbCdEf0123456789c${String(n).padStart(4, '0')}a01`, kind: 'recurring', behavior: 'Recurring',
    plan: 'monthly', amount_minor: 15000, charge_amount_minor: 15000, customer_id: 'CUS1', instrument_id: 'INS1', reference_customer_id: REFC, order_ref: 'AbCdEf0123456789' }] }
  const db = fakeDb(baseCron({ claim_due: claimed }))
  let i = 0
  const outcomes = [
    { ok: true, data: { tradeOrderId: 'T1', status: 'SUCCEEDED', paidAmount: { value: 15000 } } },
    { ok: false, kind: 'http', status: 400, code: '4900', msg: 'Need 3DS' },
    { ok: false, kind: 'timeout' },
    { ok: true, data: { tradeOrderId: 'T4', status: 'PROCESSING' } },
  ]
  const slp = fakeSlp({ createPayment: async () => outcomes[Math.min(i++, 3)] })
  const r = await (await cron(db, slp)(crRequest())).json()
  assert.equal(MAX_CHARGES_PER_TICK, 10)
  assert.deepEqual(r.charges, { sent: 10, succeeded: 1, failed: 1, undecided: 8 })
  assert.equal(db.ops('claim_due').length, 10)
  assert.ok(db.ops('claim_due').every((c) => c.args.limit === 1 && c.args.prefix === 'hs'))
  const results = db.ops('apply_payment_result').map((c) => c.args.result)
  assert.deepEqual([results[0].status, results[0].amount_minor], ['succeeded', 15000])
  assert.deepEqual([results[1].status, results[1].failure_code, results[1].failure_kind], ['failed', '4900', 'customer_action'])
  assert.deepEqual(results[2], { status: 'unknown', failure_code: 'timeout' })
  assert.deepEqual([results[3].status, results[3].trade_order_id], ['pending', 'T4'])
  const [body, opts] = slp.calls[0].args
  assert.deepEqual([body.confirm.paymentBehavior, body.confirm.autoConfirm, opts.idempotentKey], ['Recurring', true, body.referenceOrderId])
  assert.deepEqual(db.ops('release_lease')[0].args, { lease: '2026-10-02T10:05:00.000000+00:00' })
  assert.equal(r.ok, true)
})

test('cron: no charge is claimed without time left to send it (120 s budget)', async () => {
  let t = NOW
  const db = fakeDb(baseCron({ claim_due: () => { t += 50000; return [{ reference_order_id: REF, behavior: 'Recurring', plan: 'monthly', charge_amount_minor: 15000, customer_id: 'C', instrument_id: 'I', reference_customer_id: REFC }] } }))
  const r = await (await cron(db, fakeSlp(), { now: () => t })(crRequest())).json()
  assert.ok(db.ops('claim_due').length <= 2)
  assert.equal(r.charges.sent, db.ops('claim_due').length, 'every claimed charge was sent')
  assert.equal(db.ops('release_lease').length, 1)
})

test('cron reconcile: ask SLP, never re-send; stuck binding closed after 1 h; no trade id → unknown', async () => {
  const old = new Date(NOW - 2 * 3600 * 1000).toISOString()
  const recent = new Date(NOW - 20 * 60 * 1000).toISOString()
  const attempts = [
    { ...attemptCtx, reference_order_id: 'hsAbCdEf0123456789c0001a01', created_at: recent },                         // SLP says succeeded
    { ...attemptCtx, reference_order_id: 'hsAbCdEf0123456789c0002a01', trade_order_id: null, created_at: recent },  // lost answer
    { ...ctxStart, reference_order_id: 'hsAbCdEf0123456789c0000a02', status: 'pending', trade_order_id: null, created_at: old }, // abandoned binding
  ]
  const db = fakeDb(baseCron({ reconcile_candidates: { attempts, refunds: [{ reference_order_id: 'hsAbCdEf0123456789c0001r01', refund_order_id: 'RF1' }] } }))
  const slp = fakeSlp({ getPayment: async () => ({ ok: true, data: { referenceOrderId: 'hsAbCdEf0123456789c0001a01', tradeOrderId: 'T9', status: 'SUCCEEDED', paidAmount: { value: 15000 } } }) })
  const r = await (await cron(db, slp)(crRequest())).json()
  assert.deepEqual(r.reconciled, { resolved: 1, unknown: 1, abandoned: 1, stale: 0 })
  const applied = db.ops('apply_payment_result').map((c) => [c.args.reference_order_id, c.args.result.status, c.args.result.failure_code ?? null])
  assert.deepEqual(applied, [['hsAbCdEf0123456789c0001a01', 'succeeded', null], ['hsAbCdEf0123456789c0002a01', 'unknown', 'no_trade_id'],
    ['hsAbCdEf0123456789c0000a02', 'failed', 'abandoned']])
  assert.equal(slp.calls.filter((c) => c.name === 'createPayment').length, 0, 'reconciliation never sends a payment')
  assert.deepEqual(r.refunds, { done: 1 })
  assert.equal(db.ops('apply_refund_result')[0].args.result.status, 'succeeded')
})

test('cron e-mail step: module C processOutbox gets positional claim(limit) / finish(id, ok, providerId, skip), max inside budget', async () => {
  const rows = [{ id: 'o1', to_email: 'a@example.invalid', kind: 'receipt', payload: {} }]
  const db = fakeDb(baseCron({ claim_outbox: { rows }, enqueue_reminders: { count: 2 } }))
  const email = fakeEmail()
  const r = await (await cron(db, fakeSlp(), { email })(crRequest())).json()
  assert.equal(r.reminders, 2)
  assert.deepEqual(r.emails, { sent: 1, failed: 0, skipped: 0, errors: [] })
  assert.equal(email.seen.process[0].max, 30)
  assert.equal(email.seen.process[0].siteUrl, 'https://huddle.example')
  assert.deepEqual(db.ops('claim_outbox')[0].args, { limit: 30 })
  assert.deepEqual(db.ops('finish_outbox')[0].args, { id: 'o1', ok: true, provider_id: 're_1', skip: false })
  assert.deepEqual(email.seen.send[0], { apiKey: 're_test', from: 'Huddle <billing@example.invalid>', to: 'a@example.invalid', subject: 's', html: 'h', text: 't', idempotencyKey: 'o1' })
  const missing = fakeDb(baseCron())
  const r2 = await (await cron(missing, fakeSlp())(crRequest())).json()
  assert.equal(r2.reminders, 'missing')
  assert.deepEqual(r2.emails.sent, 0)
})

test('cron: a failing step does not stop the others and the lease is always released', async () => {
  const db = fakeDb(baseCron({ reconcile_candidates: new DbError('unavailable'), expire_due: new Error('boom') }))
  const r = await (await cron(db, fakeSlp())(crRequest())).json()
  assert.deepEqual(r.errors, ['reconciled', 'expired'])
  assert.equal(r.ok, false)
  assert.equal(db.ops('claim_due').length, 1)
  assert.equal(db.ops('release_lease').length, 1)
})

// ── Review 2026-10-02 regressions (each failed on 41a7a08) ─────────────────
test('review #2 cron: customer-present request undecided for > 24 h is voided at SLP, then decided (member unblocked)', async () => {
  const ctx = { ...attemptCtx, kind: 'customer_present', created_at: new Date(NOW - 25 * 3600 * 1000).toISOString() }
  const db = fakeDb(baseCron({ reconcile_candidates: { attempts: [ctx], refunds: [] } }))
  let canceled = false
  const slp = fakeSlp({
    getPayment: async () => ({ ok: true, data: { referenceOrderId: REF, tradeOrderId: 'T9', status: canceled ? 'CANCELLED' : 'PROCESSING' } }),
    cancelPayment: async () => { canceled = true; return { ok: true, data: { status: 'PROCESSING' } } },
  })
  const r = await (await cron(db, slp)(crRequest())).json()
  assert.deepEqual(slp.calls.find((c) => c.name === 'cancelPayment').args, [REF, 'T9'])
  assert.deepEqual(r.reconciled, { resolved: 1, unknown: 0, abandoned: 0, stale: 0 })
  assert.equal(db.ops('apply_payment_result')[0].args.result.status, 'failed')
  assert.equal(slp.calls.filter((c) => c.name === 'createPayment').length, 0)
})

test('review #2 cron: unattended charge (or void refused) undecided > 24 h → unknown stale_pending for a human, never re-sent', async () => {
  const old = new Date(NOW - 25 * 3600 * 1000).toISOString()
  const attempts = [{ ...attemptCtx, kind: 'recurring', created_at: old },
    { ...attemptCtx, reference_order_id: 'hsAbCdEf0123456789c0002a01', trade_order_id: 'T10', kind: 'first_purchase', created_at: old }]
  const db = fakeDb(baseCron({ reconcile_candidates: { attempts, refunds: [] }, anomalies: [{ kind: 'attempt_unknown' }, { kind: 'claim_blocked' }] }))
  const slp = fakeSlp({
    getPayment: async (id) => ({ ok: true, data: { referenceOrderId: id === 'T9' ? REF : 'hsAbCdEf0123456789c0002a01', tradeOrderId: id, status: 'PROCESSING' } }),
    cancelPayment: async () => ({ ok: false, kind: 'http', status: 400, code: '1099' }),
  })
  const r = await (await cron(db, slp)(crRequest())).json()
  assert.deepEqual(r.reconciled, { resolved: 0, unknown: 0, abandoned: 0, stale: 2 })
  assert.deepEqual(db.ops('apply_payment_result').map((c) => c.args.result), [{ status: 'unknown', failure_code: 'stale_pending' }, { status: 'unknown', failure_code: 'stale_pending' }])
  assert.equal(slp.calls.filter((c) => c.name === 'cancelPayment').length, 1, 'only the customer-present request is voided')
  assert.equal(slp.calls.filter((c) => c.name === 'createPayment').length, 0)
  assert.equal(r.anomalies, 2)
  // younger than a day: left alone
  const young = fakeDb(baseCron({ reconcile_candidates: { attempts: [{ ...attemptCtx, created_at: new Date(NOW - 3600 * 1000).toISOString() }], refunds: [] } }))
  await cron(young, fakeSlp({ getPayment: async () => ({ ok: true, data: { referenceOrderId: REF, status: 'PROCESSING' } }) }))(crRequest())
  assert.equal(young.ops('apply_payment_result').length, 0)
})

test('review #2 webhook: card binding event attaches the card to a first purchase that was paid without one', async () => {
  const paid = { ...ctxStart, kind: 'first_purchase', status: 'succeeded', failure_code: 'card_unmatched', trade_order_id: 'T9', customer_id: null, known_instruments: [] }
  const db = fakeDb({ webhook_begin: 'new', user_by_ref: { user_id: USER, open_attempts: [], unmatched_attempts: [paid] } })
  const slp = fakeSlp({ getPayment: async () => ({ ok: true, data: { referenceOrderId: REF, tradeOrderId: 'T9', status: 'SUCCEEDED', paidAmount: { value: 15000 } } }) })
  const ev = { id: 'evt_c', type: 'customer.instrument.binded', data: { customerId: 'CUS9', referenceCustomerId: REFC, paymentInstrument: { instrumentId: 'INS9' } } }
  assert.equal((await wh(db, slp)(whRequest(ev))).status, 200)
  const res = db.ops('apply_payment_result')[0].args
  assert.deepEqual([res.reference_order_id, res.result.status, res.result.customer_id, res.result.instrument.id], [REF, 'succeeded', 'CUS9', 'INS9'])
})

test('cron: no valid SHOPLINE_SERVER_IP → no charge is claimed or sent, loud warning, rest of the tick still runs', async () => {
  for (const serverIp of [null, '', 'not-an-ip', '2001:db8:aaaa:bbbb:cccc:dddd:eeee:ffff']) {
    const logs = []
    const db = fakeDb(baseCron({}))
    const slp = fakeSlp()
    const res = await createCronHandler({ config: { ...crConfig, serverIp }, db, slp, email: fakeEmail(), fetch: async () => {}, now: () => NOW, log: (e) => logs.push(e) })(crRequest())
    assert.equal(res.status, 200)
    assert.equal(db.ops('claim_due').length, 0, `no claim with serverIp=${serverIp}`)
    assert.equal(slp.calls.filter((c) => c.name === 'createPayment').length, 0)
    assert.equal(logs.some((l) => l.warn === 'SHOPLINE_SERVER_IP_missing_or_invalid'), true)
    assert.equal(db.ops('expire_due').length, 1, 'other steps are unaffected')
  }
})

test('cron: the Recurring charge carries the server IP and paySession {}', async () => {
  const db = fakeDb(baseCron({ claim_due: (() => { let done = false; return () => (done ? [] : (done = true, [{ reference_order_id: REF, behavior: 'Recurring', plan: 'monthly',
    charge_amount_minor: 15000, customer_id: 'C', instrument_id: 'I', reference_customer_id: REFC }])) })() }))
  const slp = fakeSlp()
  await createCronHandler({ config: crConfig, db, slp, email: fakeEmail(), fetch: async () => {}, now: () => NOW })(crRequest())
  const [body] = slp.calls.find((c) => c.name === 'createPayment').args
  assert.equal(body.client.ip, '198.51.100.7')
  assert.deepEqual(body.paySession, {})
})

test('review #6: a success whose amount SLP did not confirm as paid is logged (TODO SLP-Q6)', async () => {
  const logs = []
  const db = fakeDb(baseCron({ claim_due: (() => { let done = false; return () => (done ? [] : (done = true, [{ reference_order_id: REF, behavior: 'Recurring', plan: 'monthly',
    charge_amount_minor: 15000, customer_id: 'C', instrument_id: 'I', reference_customer_id: REFC }])) })() }))
  const slp = fakeSlp({ createPayment: async () => ({ ok: true, data: { tradeOrderId: 'T1', status: 'SUCCEEDED', amount: { value: 15000 } } }) })
  await createCronHandler({ config: crConfig, db, slp, email: fakeEmail(), fetch: async () => {}, now: () => NOW, log: (e) => logs.push(e) })(crRequest())
  assert.deepEqual(logs.find((l) => l.amount), { amount: 'unconfirmed', ref: REF, source: 'order' })
  assert.equal(db.ops('apply_payment_result')[0].args.result.amount_source, 'order')
})
