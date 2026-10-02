// web-billing-webhook: SLP events (design §3, SLP notes §7). Deployed without
// JWT verification (like revenuecat-webhook); authenticity comes from:
//   1. HMAC-SHA256(timestamp + "." + raw body) in constant time, ±5 minutes;
//   2. merchantId header equals ours;
//   3. only order ids in OUR format with OUR prefix (shared sandbox merchant);
//   4. body ≤ 100 KB; event id de-duplicated in the database;
//   5. and above all: the body is NEVER trusted. Ids in it are only lookup
//      keys; the state applied comes from SLP's query APIs, re-checked against
//      our own order / member. A leaked signing key cannot fake a payment.
// Answers: 200 = done or deliberately ignored; 503 = try again later (SLP
// re-sends up to 16 times); 401/403/413/400 = rejected.
import {
  applyAttemptResult, applyRefundResult, constantTimeEqual, DbError, fetchAttemptResult, isOurOrder,
  normalizeRefund, readBody, verifyWebhookSignature,
} from '../_shared/web-billing/core.mjs'

const BIND_KINDS = new Set(['card_bind', 'first_purchase'])
const s64 = (v) => (typeof v === 'string' && v ? v.slice(0, 64) : null)

export function eventCategory(type) {
  if (typeof type !== 'string') return null
  if (/^trade\.refund\./.test(type) || /^refund\./.test(type)) return 'refund' // SLP notes §12-1: accept both
  if (/^trade\.(succeeded|failed|expired|processing|cancelled|canceled|customer_action)$/.test(type)) return 'trade'
  if (type === 'customer.instrument.binded') return 'instrument'
  return null
}

// config: { ready, slpProblem, signKey, merchantId, prefix }
export function createWebhookHandler({ config, db, slp, log = () => {}, now = () => Date.now() }) {
  return async (request) => {
    const reply = (status, body) => Response.json(body, { status })
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
    if (!config.ready || config.slpProblem || !config.signKey || !config.merchantId || !config.prefix) {
      return reply(503, { error: 'billing_not_configured' })
    }
    const raw = await readBody(request, 100000).catch(() => null)
    if (raw == null) return reply(413, { error: 'payload_too_large' })
    const check = await verifyWebhookSignature({
      rawBody: raw, timestamp: request.headers.get('timestamp'), sign: request.headers.get('sign'),
      signKey: config.signKey, nowMs: now(),
    })
    if (!check.ok) return reply(401, { error: 'unauthorized' })
    if (!constantTimeEqual(request.headers.get('merchantId') ?? '', config.merchantId)) return reply(403, { error: 'unexpected_merchant' })
    let event
    try { event = JSON.parse(raw) } catch { return reply(400, { error: 'invalid_json' }) }
    const id = event?.id
    const type = event?.type
    const data = event?.data && typeof event.data === 'object' ? event.data : {}
    if (typeof id !== 'string' || !id || id.length > 64 || typeof type !== 'string') return reply(400, { error: 'invalid_event' })

    const category = eventCategory(type)
    if (!category) return reply(200, { ignored: 'type' })
    const ref = s64(data.referenceOrderId)
    if (ref && !isOurOrder(ref, config.prefix)) return reply(200, { ignored: 'not_ours' })
    if (category !== 'instrument' && !ref) return reply(200, { ignored: 'no_order' })

    try {
      const begin = await db.server('webhook_begin', {
        event_id: id, type, reference_order_id: ref,
        // Whitelisted fields only: no card data, no headers.
        payload: { type, referenceOrderId: ref, tradeOrderId: s64(data.tradeOrderId), refundOrderId: s64(data.refundOrderId), status: s64(data.status) },
      })
      if (begin === 'duplicate') return reply(200, { duplicate: true })
      let outcome
      if (category === 'trade') outcome = await onTrade(ref, data)
      else if (category === 'refund') outcome = await onRefund(ref, data)
      else outcome = await onInstrument(data)
      if (outcome === 'retry') return reply(503, { error: 'retry_later' }) // event stays unprocessed
      await db.server('webhook_finish', { event_id: id, outcome })
      return reply(200, { received: true, outcome })
    } catch (e) {
      log({ fn: 'web-billing-webhook', type, ref, error: e instanceof DbError ? e.code : 'exception' })
      return reply(503, { error: 'retry_later' })
    }
  }

  async function onTrade(ref, data) {
    const ctx = await db.server('attempt_context', { reference_order_id: ref })
    if (!ctx) return 'unknown_order'
    const f = await fetchAttemptResult(slp, ctx, { tradeOrderId: s64(data.tradeOrderId) })
    if (f.retry) return 'retry'
    if (f.ignore) return f.ignore
    const out = await applyAttemptResult({ db, slp, referenceOrderId: ref, result: f.result, log })
    return out?.applied ? `applied_${f.result.status}` : String(out?.reason ?? 'not_applied')
  }

  async function onRefund(ref, data) {
    const ctx = await db.server('refund_context', { reference_order_id: ref })
    if (!ctx) return 'unknown_refund'
    const refundOrderId = ctx.refund_order_id || s64(data.refundOrderId)
    if (!refundOrderId) return 'no_refund_id'
    const res = await slp.getRefund(refundOrderId)
    if (!res.ok) return res.kind === 'http' && res.status >= 400 && res.status < 500 && res.status !== 429 ? 'slp_rejected_query' : 'retry'
    if (res.data?.referenceOrderId ? res.data.referenceOrderId !== ref : !ctx.refund_order_id) return 'order_mismatch'
    const result = normalizeRefund(res.data)
    if (result.status === 'processing' && ctx.status === 'processing') return 'still_processing'
    const out = await applyRefundResult({ db, slp, referenceOrderId: ref, result, log })
    return out?.applied ? `applied_${out.status}` : String(out?.reason ?? 'not_applied')
  }

  // customer.instrument.binded carries no order id. Find the member from the
  // referenceCustomerId, take their newest undecided binding, and let SLP's
  // own trade + card query decide (the event's card id is only a hint).
  async function onInstrument(data) {
    const refCustomer = s64(data.referenceCustomerId)
    const customerId = typeof data.customerId === 'string' ? data.customerId.slice(0, 128) : null
    const instrumentId = typeof data.paymentInstrument?.instrumentId === 'string' ? data.paymentInstrument.instrumentId.slice(0, 128) : null
    if (!refCustomer || !customerId || !instrumentId) return 'incomplete_event'
    const who = await db.server('user_by_ref', { reference_customer_id: refCustomer })
    if (!who) return 'unknown_customer'
    const ctx = (Array.isArray(who.open_attempts) ? who.open_attempts : []).find((c) => BIND_KINDS.has(c.kind))
    if (!ctx) return 'no_open_binding'
    if (!ctx.trade_order_id) return 'retry' // our create call has not stored its trade id yet
    const f = await fetchAttemptResult(slp, ctx, { customerId, instrumentId })
    if (f.retry) return 'retry'
    if (f.ignore) return f.ignore
    const out = await applyAttemptResult({ db, slp, referenceOrderId: ctx.reference_order_id, result: f.result, log })
    return out?.applied ? `applied_${f.result.status}` : String(out?.reason ?? 'not_applied')
  }
}
