// SHOPLINE Payments server API client (SLP notes §2, §4–§6). Pure JS with an
// injected fetch so Node tests can drive it. Every call: POST, JSON, headers
// merchantId / apiKey / requestId (32 hex, unique per HTTP request), optional
// idempotentKey, 10-second timeout that also covers reading the body.
// Logging is a whitelist: operation, our order id, HTTP status, SLP code.
// Never the apiKey, never a response body (it can contain card data).
import { requestId as newRequestId } from './core.mjs'

export const SLP_PATHS = Object.freeze({
  createPayment: '/api/v1/trade/payment/create',
  getPayment: '/api/v1/trade/payment/get',
  createRefund: '/api/v1/trade/refund/create',
  getRefund: '/api/v1/trade/refund/get',
  customerToken: '/api/v1/customer/token',
  queryInstruments: '/api/v1/customer/paymentInstrument/query',
  unbind: '/api/v1/customer/paymentInstrument/unbind',
})

export function createSlpClient({ fetch: fetchFn, apiBase, merchantId, apiKey, timeoutMs = 10000, log = () => {}, makeRequestId = newRequestId }) {
  const base = String(apiBase ?? '').replace(/\/+$/, '')
  async function call(op, body, { idempotentKey, ref } = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const headers = { 'Content-Type': 'application/json', merchantId, apiKey, requestId: makeRequestId() }
    if (idempotentKey) headers.idempotentKey = idempotentKey
    let status = 0
    let text = ''
    try {
      const res = await fetchFn(base + SLP_PATHS[op], { method: 'POST', headers, body: JSON.stringify(body ?? {}), signal: controller.signal })
      status = res.status
      text = await res.text()
    } catch {
      const kind = controller.signal.aborted ? 'timeout' : 'network'
      log({ slp: op, ref: ref ?? null, outcome: kind })
      return { ok: false, kind }
    } finally {
      clearTimeout(timer)
    }
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    const code = data && typeof data === 'object' && data.code != null ? String(data.code).slice(0, 16) : null
    if (status >= 200 && status < 300 && data && typeof data === 'object') {
      log({ slp: op, ref: ref ?? null, http: status })
      return { ok: true, status, data }
    }
    log({ slp: op, ref: ref ?? null, http: status, code })
    return {
      ok: false,
      kind: status >= 200 && status < 300 ? 'invalid_json' : 'http',
      status,
      code,
      msg: data && typeof data.msg === 'string' ? data.msg.slice(0, 200) : null,
    }
  }
  return {
    call,
    createPayment: (body, opts = {}) => call('createPayment', body, { ref: body?.referenceOrderId, ...opts }),
    getPayment: (tradeOrderId) => call('getPayment', { tradeOrderId }),
    createRefund: (body, opts = {}) => call('createRefund', body, { ref: body?.referenceOrderId, ...opts }),
    getRefund: (refundOrderId) => call('getRefund', { refundOrderId }),
    // TODO(SLP-sandbox §12-5): docs disagree whether this takes SLP's customerId
    // or ours; the guide flow passes SLP's, so do we.
    customerToken: (customerId) => call('customerToken', { customerId }),
    queryInstruments: (customerId, instrumentId) => call('queryInstruments',
      instrumentId ? { customerId, paymentInstrument: { instrumentId } } : { customerId }),
    unbind: (customerId, paymentInstrumentId) => call('unbind', { customerId, paymentInstrumentId }),
  }
}
