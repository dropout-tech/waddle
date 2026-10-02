// node --test supabase/functions/_shared/web-billing/slp.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { createSlpClient, SLP_PATHS } from './slp.mjs'

const API_KEY = 'sk_test_DO_NOT_LOG_7f3a9c'
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function client(fetchImpl, extra = {}) {
  const calls = []
  const logs = []
  const slp = createSlpClient({
    fetch: async (url, init) => { calls.push({ url, init }); return fetchImpl(url, init) },
    apiBase: 'https://api-sandbox.shoplinepayments.com/', merchantId: 'M123', apiKey: API_KEY,
    log: (e) => logs.push(e), ...extra,
  })
  return { slp, calls, logs }
}

test('request shape: POST JSON to the documented path with merchantId / apiKey / unique 32-hex requestId / idempotentKey', async () => {
  const { slp, calls } = client(async () => json(200, { tradeOrderId: 'T1', status: 'PROCESSING' }))
  const r = await slp.createPayment({ referenceOrderId: 'hsAbCdEf0123456789c0001a01', amount: { value: 15000, currency: 'TWD' } },
    { idempotentKey: 'hsAbCdEf0123456789c0001a01' })
  await slp.getPayment('T1')
  assert.equal(r.ok, true)
  assert.equal(r.data.tradeOrderId, 'T1')
  assert.equal(calls[0].url, 'https://api-sandbox.shoplinepayments.com' + SLP_PATHS.createPayment)
  assert.equal(calls[0].init.method, 'POST')
  const h = calls[0].init.headers
  assert.equal(h.merchantId, 'M123')
  assert.equal(h.apiKey, API_KEY)
  assert.equal(h['Content-Type'], 'application/json')
  assert.equal(h.idempotentKey, 'hsAbCdEf0123456789c0001a01')
  assert.match(h.requestId, /^[0-9a-f]{32}$/)
  assert.notEqual(calls[1].init.headers.requestId, h.requestId)
  assert.equal('idempotentKey' in calls[1].init.headers, false)
  assert.deepEqual(JSON.parse(calls[1].init.body), { tradeOrderId: 'T1' })
  assert.equal(calls[1].url.endsWith('/api/v1/trade/payment/get'), true)
})

test('10-second timeout (here 30 ms): aborted request reports timeout, never throws', async () => {
  const { slp, logs } = client((url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  }), { timeoutMs: 30 })
  const started = Date.now()
  const r = await slp.createPayment({ referenceOrderId: 'hsX' })
  assert.deepEqual(r, { ok: false, kind: 'timeout' })
  assert.ok(Date.now() - started < 2000)
  assert.deepEqual(logs, [{ slp: 'createPayment', ref: 'hsX', outcome: 'timeout' }])
})

test('timeout also covers a body that never finishes', async () => {
  const { slp } = client((url, init) => Promise.resolve({
    status: 200,
    text: () => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
  }), { timeoutMs: 30 })
  assert.equal((await slp.getPayment('T1')).kind, 'timeout')
})

test('default timeout is 10 seconds', async () => {
  let seen
  const realSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (fn, ms) => { seen = ms; return realSetTimeout(fn, 0 * ms + 1e9) }
  try {
    const { slp } = client(async () => json(200, {}))
    await slp.getRefund('R1')
  } finally { globalThis.setTimeout = realSetTimeout }
  assert.equal(seen, 10000)
})

test('network error and SLP error bodies are classified; codes kept, nothing thrown', async () => {
  const net = client(async () => { throw new TypeError('connection reset') })
  assert.deepEqual(await net.slp.getPayment('T1'), { ok: false, kind: 'network' })
  const err = client(async () => json(400, { code: 4900, msg: 'Need 3DS' }))
  assert.deepEqual(await err.slp.createPayment({ referenceOrderId: 'hsY' }), { ok: false, kind: 'http', status: 400, code: '4900', msg: 'Need 3DS' })
  const html = client(async () => new Response('<html>bad gateway</html>', { status: 502 }))
  assert.deepEqual(await html.slp.getPayment('T1'), { ok: false, kind: 'http', status: 502, code: null, msg: null })
  const notJson = client(async () => new Response('ok', { status: 200 }))
  assert.equal((await notJson.slp.getPayment('T1')).kind, 'invalid_json')
})

test('logs never contain the apiKey or response bodies (card data, tokens)', async () => {
  const secretBody = { tradeOrderId: 'T1', status: 'SUCCEEDED', customerToken: 'ctok_SECRET', order: { payment: { creditCard: { bin: '414763', last4: '8405' } } } }
  const { slp, logs } = client(async (url) => url.endsWith('/get') ? json(500, { code: '9999', msg: 'apiKey sk_test_DO_NOT_LOG_7f3a9c echoed' }) : json(200, secretBody))
  await slp.createPayment({ referenceOrderId: 'hsZ', paySession: 'ps_SECRET' })
  await slp.customerToken('CUS1')
  await slp.getPayment('T1')
  const text = JSON.stringify(logs)
  for (const forbidden of [API_KEY, 'ctok_SECRET', '414763', '8405', 'ps_SECRET', 'echoed', 'SUCCEEDED']) {
    assert.equal(text.includes(forbidden), false, `log leaked ${forbidden}`)
  }
  assert.deepEqual(logs[0], { slp: 'createPayment', ref: 'hsZ', http: 200 })
  assert.deepEqual(logs[2], { slp: 'getPayment', ref: null, http: 500, code: '9999' })
})

test('every documented endpoint maps to its path and body', async () => {
  const { slp, calls } = client(async () => json(200, {}))
  await slp.createRefund({ referenceOrderId: 'hsR', tradeOrderId: 'T1', amount: { value: 15000, currency: 'TWD' } })
  await slp.getRefund('R1')
  await slp.customerToken('CUS1')
  await slp.queryInstruments('CUS1')
  await slp.queryInstruments('CUS1', 'INS1')
  await slp.unbind('CUS1', 'INS1')
  assert.deepEqual(calls.map((c) => c.url.replace('https://api-sandbox.shoplinepayments.com', '')), [
    SLP_PATHS.createRefund, SLP_PATHS.getRefund, SLP_PATHS.customerToken, SLP_PATHS.queryInstruments, SLP_PATHS.queryInstruments, SLP_PATHS.unbind])
  assert.deepEqual(JSON.parse(calls[1].init.body), { refundOrderId: 'R1' })
  assert.deepEqual(JSON.parse(calls[4].init.body), { customerId: 'CUS1', paymentInstrument: { instrumentId: 'INS1' } })
  assert.deepEqual(JSON.parse(calls[5].init.body), { customerId: 'CUS1', paymentInstrumentId: 'INS1' })
})
