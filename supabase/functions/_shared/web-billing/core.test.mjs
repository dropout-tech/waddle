// node --test supabase/functions/_shared/web-billing/core.test.mjs
// (also run in CI through scripts/tests/web-billing-transitions.test.mjs)
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  buildCreateBody, canTransition, classifyCreateFailure, constantTimeEqual, dbErrorCode, failureAction, fetchAttemptResult,
  fromMinor, isChargeableMinor, isOurOrder, normalizeRefund, normalizeTrade, orderId, parseOrderId, referenceCustomerId,
  refundId, requestId, resolveTrade, returnUrl, slpConfigProblem, SLP_BASES, toMinor, tokenExpiry, TRANSITIONS,
  verifyWebhookSignature,
} from './core.mjs'

const KEY = 'test-only-sign-key'
const NOW = 1_790_000_000_000
const sign = (ts, body, key = KEY) => createHmac('sha256', key).update(`${ts}.${body}`, 'utf8').digest('hex')

test('webhook signature: valid HMAC-SHA256(timestamp.body) accepted (hex, any case)', async () => {
  const body = '{"id":"evt_1","type":"trade.succeeded","data":{"referenceOrderId":"hsAbCdEf0123456789c0001a01"}}'
  const ts = String(NOW - 1000)
  assert.deepEqual(await verifyWebhookSignature({ rawBody: body, timestamp: ts, sign: sign(ts, body), signKey: KEY, nowMs: NOW }), { ok: true })
  assert.equal((await verifyWebhookSignature({ rawBody: body, timestamp: ts, sign: sign(ts, body).toUpperCase(), signKey: KEY, nowMs: NOW })).ok, true)
})

test('webhook signature: tampered body, wrong key, swapped timestamp, missing parts all rejected', async () => {
  const body = '{"id":"evt_1","amount":15000}'
  const ts = String(NOW)
  const good = sign(ts, body)
  const v = (o) => verifyWebhookSignature({ rawBody: body, timestamp: ts, sign: good, signKey: KEY, nowMs: NOW, ...o })
  assert.equal((await v({ rawBody: body.replace('15000', '1') })).reason, 'bad_signature')
  assert.equal((await v({ signKey: 'other-key' })).reason, 'bad_signature')
  assert.equal((await v({ sign: sign(String(NOW - 1), body) })).reason, 'bad_signature')
  assert.equal((await v({ sign: good.slice(0, 32) })).reason, 'bad_signature')
  assert.equal((await v({ sign: '' })).reason, 'missing')
  assert.equal((await v({ signKey: '' })).reason, 'missing')
  assert.equal((await v({ timestamp: 'abc' })).reason, 'bad_timestamp')
})

test('webhook time window: ±5 minutes inclusive, older or future events rejected (replay)', async () => {
  const body = '{}'
  const at = (offset) => {
    const ts = String(NOW + offset)
    return verifyWebhookSignature({ rawBody: body, timestamp: ts, sign: sign(ts, body), signKey: KEY, nowMs: NOW })
  }
  assert.equal((await at(-300000)).ok, true)
  assert.equal((await at(300000)).ok, true)
  assert.equal((await at(-300001)).reason, 'stale')
  assert.equal((await at(300001)).reason, 'stale')
  assert.equal((await at(-86400000)).reason, 'stale')
})

test('constant-time compare: equal only for identical strings, length differences handled', () => {
  assert.equal(constantTimeEqual('abc', 'abc'), true)
  assert.equal(constantTimeEqual('abc', 'abd'), false)
  assert.equal(constantTimeEqual('abc', 'abcd'), false)
  assert.equal(constantTimeEqual('', 'a'), false)
  assert.equal(constantTimeEqual(null, ''), true)
})

test('order id: deterministic, ≤ 32 chars, same format as huddle_ops.web_order_id', () => {
  const a = orderId('hs', 'AbCdEf0123456789', 1, 1)
  assert.equal(a, 'hsAbCdEf0123456789c0001a01')
  assert.equal(orderId('hs', 'AbCdEf0123456789', 1, 1), a)
  assert.notEqual(orderId('hs', 'AbCdEf0123456789', 1, 2), a)
  assert.equal(orderId('hp', 'AbCdEf0123456789', 9999, 99).length, 26)
  assert.ok(orderId('hp', 'AbCdEf0123456789', 9999, 99).length <= 32)
  assert.equal(refundId('hs', 'AbCdEf0123456789', 1, 1), 'hsAbCdEf0123456789c0001r01')
  assert.deepEqual(parseOrderId(a), { prefix: 'hs', orderRef: 'AbCdEf0123456789', cycle: 1, kind: 'payment', seq: 1 })
  assert.throws(() => orderId('HS', 'AbCdEf0123456789', 1, 1))
  assert.throws(() => orderId('hs', 'short', 1, 1))
  assert.throws(() => orderId('hs', 'AbCdEf0123456789', 10000, 1))
  assert.throws(() => orderId('hs', 'AbCdEf0123456789', 1, 100))
  assert.throws(() => orderId('hs', 'AbCdEf0123456789', 1.5, 1))
})

test('prefix filter: only our format with our prefix (shared sandbox merchant)', () => {
  assert.equal(isOurOrder('hsAbCdEf0123456789c0001a01', 'hs'), true)
  assert.equal(isOurOrder('hpAbCdEf0123456789c0001a01', 'hs'), false)
  assert.equal(isOurOrder('ORDER-12345', 'hs'), false)
  assert.equal(isOurOrder('hsAbCdEf0123456789c0001a01x', 'hs'), false)
  assert.equal(isOurOrder(null, 'hs'), false)
  assert.equal(referenceCustomerId('E33D985B-4BCB-456F-9658-9CC1085185AB'), 'e33d985b4bcb456f96589cc1085185ab')
})

test('SLP failure codes → action', () => {
  for (const c of ['4900', '4901', '4902', 4900]) assert.deepEqual(failureAction(c), { kind: 'customer_action', retry: false, delayMinutes: null, counts: false })
  assert.deepEqual(failureAction('1201'), { kind: 'soft', retry: true, delayMinutes: 5, counts: false })
  for (const c of ['1203', '4410', '9999', null, undefined]) assert.equal(failureAction(c).kind, 'hard')
  assert.equal(failureAction('1203').counts, true)
})

test('money: minor units only, one conversion, sanity ceiling', () => {
  assert.equal(toMinor(150), 15000)
  assert.equal(toMinor(990), 99000)
  assert.equal(toMinor(1.5), 150)
  assert.equal(fromMinor(15000), 150)
  assert.throws(() => toMinor(1.005))
  assert.throws(() => toMinor(-1))
  assert.throws(() => toMinor('150'))
  assert.equal(isChargeableMinor(15000), true)
  assert.equal(isChargeableMinor(99000), true)
  assert.equal(isChargeableMinor(9900000), false) // ×100 twice
  assert.equal(isChargeableMinor(0), false)
  assert.equal(isChargeableMinor(150.5), false)
})

test('state machine table mirrors the database guard', () => {
  assert.equal(canTransition('incomplete', 'trialing'), true)
  assert.equal(canTransition('trialing', 'past_due'), true)
  assert.equal(canTransition('past_due', 'active'), true)
  assert.equal(canTransition('expired', 'active'), false)
  assert.equal(canTransition('refunded', 'active'), false)
  assert.equal(canTransition('incomplete', 'past_due'), false)
  assert.deepEqual(Object.keys(TRANSITIONS).sort(), ['active', 'expired', 'incomplete', 'incomplete_expired', 'past_due', 'refunded', 'trialing'])
})

test('normalizeTrade: only SUCCEEDED succeeds; unknown statuses stay pending; failure kinds mapped', () => {
  assert.equal(normalizeTrade({ status: 'SUCCEEDED', tradeOrderId: 'T1', paidAmount: { value: 15000 } }).status, 'succeeded')
  assert.equal(normalizeTrade({ status: 'SUCCEEDED', paidAmount: { value: 15000 } }).amount_minor, 15000)
  for (const s of ['PROCESSING', 'CREATED', 'CUSTOMER_ACTION', '', undefined, 'SOMETHING_NEW']) assert.equal(normalizeTrade({ status: s }).status, 'pending')
  const f = normalizeTrade({ status: 'FAILED', paymentMsg: { code: '4900', msg: 'Need 3DS' } })
  assert.deepEqual([f.status, f.failure_code, f.failure_kind], ['failed', '4900', 'customer_action'])
  assert.equal(normalizeTrade({ status: 'EXPIRED' }).failure_kind, 'hard')
  assert.deepEqual(normalizeRefund({ status: 'SUCCEEDED', refundOrderId: 'R1', amount: { value: 15000 } }), { status: 'succeeded', refund_order_id: 'R1', amount_minor: 15000 })
  assert.equal(normalizeRefund({ status: 'WHATEVER' }).status, 'processing')
})

test('create failures: timeouts / 5xx / 1001 are unknown (never retried), 4xx are definite', () => {
  assert.deepEqual(classifyCreateFailure({ ok: false, kind: 'timeout' }), { status: 'unknown', failure_code: 'timeout' })
  assert.equal(classifyCreateFailure({ ok: false, kind: 'network' }).status, 'unknown')
  assert.equal(classifyCreateFailure({ ok: false, kind: 'http', status: 502 }).status, 'unknown')
  assert.equal(classifyCreateFailure({ ok: false, kind: 'invalid_json', status: 200 }).status, 'unknown')
  assert.equal(classifyCreateFailure({ ok: false, kind: 'http', status: 400, code: '1001' }).status, 'unknown')
  assert.deepEqual(classifyCreateFailure({ ok: false, kind: 'http', status: 429, code: null }).failure_kind, 'soft')
  const d = classifyCreateFailure({ ok: false, kind: 'http', status: 400, code: '4901', msg: 'Need cvs' })
  assert.deepEqual([d.status, d.failure_code, d.failure_kind], ['failed', '4901', 'customer_action'])
})

const ctxBase = { reference_order_id: 'hsAbCdEf0123456789c0001a01', order_ref: 'AbCdEf0123456789', plan: 'monthly', charge_amount_minor: 15000,
  reference_customer_id: 'e33d985b4bcb456f96589cc1085185ab', customer_id: 'CUS1', instrument_id: 'INS1' }

test('create body: behaviours, minor amounts, deterministic order id, no paySession for Recurring', () => {
  const rec = buildCreateBody({ ctx: { ...ctxBase, behavior: 'Recurring' }, locale: 'zh-TW', siteUrl: 'https://h.example/', k: 'pay', clientIp: null })
  assert.equal(rec.referenceOrderId, ctxBase.reference_order_id)
  assert.deepEqual(rec.amount, { value: 15000, currency: 'TWD' })
  assert.deepEqual(rec.confirm, { paymentMethod: 'CreditCard', paymentBehavior: 'Recurring', autoConfirm: true, paymentCustomerId: 'CUS1', paymentInstrument: { paymentInstrumentId: 'INS1' } })
  assert.equal('paySession' in rec, false)
  assert.equal(rec.returnUrl, 'https://h.example/billing/return?ref=AbCdEf0123456789&k=pay')
  const bind = buildCreateBody({ ctx: { ...ctxBase, behavior: 'CardBind' }, paySession: 'ps_1', locale: 'en', siteUrl: 'https://h.example', k: 'start', clientIp: '1.2.3.4' })
  assert.deepEqual(bind.confirm, { paymentMethod: 'CreditCard', paymentBehavior: 'CardBind', autoConfirm: false, paymentInstrument: { savePaymentInstrument: true } })
  assert.equal(bind.paySession, 'ps_1')
  assert.equal(bind.language, 'en')
  assert.equal(bind.client.ip, '1.2.3.4')
  assert.equal(bind.customer.referenceCustomerId, ctxBase.reference_customer_id)
  assert.equal(buildCreateBody({ ctx: { ...ctxBase, behavior: 'QuickPayment' }, paySession: 'p', k: 'pay', siteUrl: 'x' }).confirm.paymentCustomerId, 'CUS1')
  assert.throws(() => buildCreateBody({ ctx: { ...ctxBase, behavior: 'Recurring', charge_amount_minor: 9900000 }, k: 'pay', siteUrl: 'x' }))
  assert.throws(() => buildCreateBody({ ctx: { ...ctxBase, behavior: 'Recurring', charge_amount_minor: 150.5 }, k: 'pay', siteUrl: 'x' }))
  assert.equal(returnUrl('https://h.example//', 'AbC', 'card'), 'https://h.example/billing/return?ref=AbC&k=card')
})

const fakeSlp = (over = {}) => ({
  getPayment: async () => ({ ok: true, data: { referenceOrderId: ctxBase.reference_order_id, tradeOrderId: 'T1', status: 'SUCCEEDED', paidAmount: { value: 15000 } } }),
  queryInstruments: async () => ({ ok: true, data: { referenceCustomerId: ctxBase.reference_customer_id,
    paymentInstruments: [{ instrumentId: 'NEW1', instrumentStatus: 'SUCCESSED', instrumentCard: { brand: 'Visa', last: '1234', first: '400000', issuerCountry: 'TW' } }] } }),
  ...over,
})

test('fetchAttemptResult: our stored trade id → authoritative result', async () => {
  const f = await fetchAttemptResult(fakeSlp(), { ...ctxBase, kind: 'recurring', trade_order_id: 'T1' })
  assert.equal(f.result.status, 'succeeded')
  assert.equal(f.result.amount_minor, 15000)
})

test('fetchAttemptResult: an untrusted trade id must prove it belongs to this order', async () => {
  const other = fakeSlp({ getPayment: async () => ({ ok: true, data: { referenceOrderId: 'hsZZZZZZZZZZZZZZZZc0001a01', status: 'SUCCEEDED' } }) })
  assert.deepEqual(await fetchAttemptResult(other, { ...ctxBase, kind: 'recurring', trade_order_id: null }, { tradeOrderId: 'FORGED' }), { ignore: 'order_mismatch' })
  const silent = fakeSlp({ getPayment: async () => ({ ok: true, data: { status: 'SUCCEEDED' } }) })
  assert.deepEqual(await fetchAttemptResult(silent, { ...ctxBase, kind: 'recurring', trade_order_id: null }, { tradeOrderId: 'FORGED' }), { ignore: 'order_mismatch' })
  assert.equal((await fetchAttemptResult(silent, { ...ctxBase, kind: 'recurring', trade_order_id: 'T1' })).result.status, 'succeeded')
  assert.deepEqual(await fetchAttemptResult(fakeSlp(), { ...ctxBase, kind: 'recurring' }), { ignore: 'no_trade_id' })
  assert.deepEqual(await fetchAttemptResult(fakeSlp({ getPayment: async () => ({ ok: false, kind: 'timeout' }) }), { ...ctxBase, kind: 'recurring', trade_order_id: 'T1' }), { retry: true })
})

test('binding: card must belong to THIS member (referenceCustomerId) and be usable; else stays pending', async () => {
  const ctx = { ...ctxBase, kind: 'card_bind', trade_order_id: 'T1', known_instruments: ['OLD1'] }
  const ok = (await fetchAttemptResult(fakeSlp(), ctx)).result
  assert.equal(ok.status, 'succeeded')
  assert.deepEqual(ok.instrument, { id: 'NEW1', brand: 'Visa', issuer_country: 'TW', last4: '1234' })
  assert.equal(JSON.stringify(ok).includes('400000'), false) // first 6 digits never kept
  const foreign = fakeSlp({ queryInstruments: async () => ({ ok: true, data: { referenceCustomerId: 'ffffffffffffffffffffffffffffffff', paymentInstruments: [{ instrumentId: 'NEW1', instrumentStatus: 'SUCCESSED' }] } }) })
  assert.equal((await fetchAttemptResult(foreign, ctx)).result.status, 'pending')
  const disabled = fakeSlp({ queryInstruments: async () => ({ ok: true, data: { referenceCustomerId: ctxBase.reference_customer_id, paymentInstruments: [{ instrumentId: 'NEW1', instrumentStatus: 'DISABLED' }] } }) })
  assert.equal((await fetchAttemptResult(disabled, ctx)).result.status, 'pending')
  const two = fakeSlp({ queryInstruments: async () => ({ ok: true, data: { referenceCustomerId: ctxBase.reference_customer_id,
    paymentInstruments: [{ instrumentId: 'A', instrumentStatus: 'SUCCESSED' }, { instrumentId: 'B', instrumentStatus: 'SUCCESSED' }] } }) })
  assert.equal((await fetchAttemptResult(two, ctx)).result.status, 'pending', 'ambiguous card: wait for the binded event')
  assert.equal((await fetchAttemptResult(two, ctx, { instrumentId: 'B' })).result.instrument.id, 'B')
})

test('binding: a voided NT$1 authorisation (CANCELLED) is not a failure; the card query decides (TODO SLP-Q10)', async () => {
  const ctx = { ...ctxBase, kind: 'card_bind', trade_order_id: 'T1', known_instruments: [] }
  const voided = { referenceOrderId: ctxBase.reference_order_id, status: 'CANCELLED' }
  assert.equal((await resolveTrade(fakeSlp(), ctx, voided)).status, 'succeeded')
  const none = fakeSlp({ queryInstruments: async () => ({ ok: true, data: { referenceCustomerId: ctxBase.reference_customer_id, paymentInstruments: [] } }) })
  const r = await resolveTrade(none, ctx, voided)
  assert.equal(r.status, 'pending')
  assert.equal('failure_code' in r, false)
  assert.equal((await resolveTrade(fakeSlp(), { ...ctx, kind: 'recurring' }, voided)).status, 'failed')
})

test('config gate: missing secrets or prefix/environment mismatch → refuse to run', () => {
  const ok = { apiKey: 'k', merchantId: 'm', apiBase: SLP_BASES.sandbox, prefix: 'hs' }
  assert.equal(slpConfigProblem(ok), null)
  assert.equal(slpConfigProblem({ ...ok, apiBase: SLP_BASES.production, prefix: 'hp' }), null)
  assert.equal(slpConfigProblem({ ...ok, apiKey: '' }), 'missing')
  assert.equal(slpConfigProblem({ ...ok, apiBase: SLP_BASES.production }), 'prefix_env_mismatch')
  assert.equal(slpConfigProblem({ ...ok, prefix: 'hp' }), 'prefix_env_mismatch')
  assert.equal(slpConfigProblem({ ...ok, apiBase: 'https://evil.example', prefix: 'hx' }), 'unknown_api_base')
  assert.equal(slpConfigProblem({ ...ok, prefix: 'HS' }), 'bad_prefix')
})

test('misc: requestId is 32 hex and unique; token expiry forms; DB error codes', () => {
  const a = requestId(); const b = requestId()
  assert.match(a, /^[0-9a-f]{32}$/)
  assert.notEqual(a, b)
  assert.equal(tokenExpiry(600, NOW), new Date(NOW + 600000).toISOString())
  assert.equal(tokenExpiry(1790000600, NOW), new Date(1790000600000).toISOString())
  assert.equal(tokenExpiry(1790000600000, NOW), new Date(1790000600000).toISOString())
  assert.equal(tokenExpiry(null, NOW), null)
  assert.equal(dbErrorCode({ message: 'WEB_BILLING:payment_in_progress' }), 'payment_in_progress')
  assert.equal(dbErrorCode({ message: 'duplicate key value' }), 'unavailable')
})

test('review #2: first purchase paid but card unconfirmable → succeeded WITHOUT card (member gets Pro); binding waits', async () => {
  const foreign = fakeSlp({ queryInstruments: async () => ({ ok: true, data: { referenceCustomerId: 'ffffffffffffffffffffffffffffffff',
    paymentInstruments: [{ instrumentId: 'NEW1', instrumentStatus: 'SUCCESSED' }] } }) })
  const paid = { referenceOrderId: ctxBase.reference_order_id, status: 'SUCCEEDED', paidAmount: { value: 15000 },
    order: { payment: { paymentInstrument: { paymentInstrumentId: 'NEW1' } } }, paymentCustomerId: 'CUS1' }
  const r = await resolveTrade(foreign, { ...ctxBase, kind: 'first_purchase', known_instruments: [] }, paid)
  assert.equal(r.status, 'succeeded')
  assert.equal('instrument' in r, false, 'a card not proven to be this member\'s is never stored')
  assert.equal('customer_id' in r, false)
  assert.equal(r.amount_minor, 15000)
  const down = fakeSlp({ queryInstruments: async () => ({ ok: false, kind: 'timeout' }) })
  assert.equal((await resolveTrade(down, { ...ctxBase, kind: 'first_purchase' }, paid)).status, 'succeeded')
  assert.equal((await resolveTrade(down, { ...ctxBase, kind: 'card_bind' }, paid)).status, 'pending', 'no money moved: binding waits')
})

test('review #6: amount taken from paidAmount; order amount only as a marked fallback (TODO SLP-Q6)', () => {
  const a = normalizeTrade({ status: 'SUCCEEDED', paidAmount: { value: 15000 }, amount: { value: 15000 } })
  assert.deepEqual([a.amount_minor, a.amount_source], [15000, 'paid'])
  const b = normalizeTrade({ status: 'SUCCEEDED', amount: { value: 15000 } })
  assert.deepEqual([b.amount_minor, b.amount_source], [15000, 'order'])
  const c = normalizeTrade({ status: 'SUCCEEDED', paidAmount: { value: 1500 }, amount: { value: 15000 } })
  assert.equal(c.amount_minor, 1500, 'what was paid wins over what was ordered')
  assert.equal('amount_source' in normalizeTrade({ status: 'SUCCEEDED' }), false)
})
