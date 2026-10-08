// web-billing: the member's own actions (contract §1). Runtime-independent;
// index.ts only reads env and injects fetch-based clients.
// The member id ALWAYS comes from the verified JWT, never from the body.
import {
  applyAttemptResult, applyRefundResult, bearerToken, buildCreateBody, classifyCreateFailure, clientIp, ipSource,
  DbError, fetchAttemptResult, isNativeOrigin, normalizeRefund, normalizeTrade, readBody, resolveTrade, tokenExpiry,
} from '../_shared/web-billing/core.mjs'

export const ERROR_STATUS = Object.freeze({
  unauthorized: 401, disabled: 403, native_not_allowed: 403, apple_active: 409, already_subscribed: 409,
  trial_used: 409, not_found: 404, not_refundable: 409, payment_in_progress: 409, rate_limited: 429,
  slp_error: 502, invalid_input: 400, unavailable: 503,
})
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const ACTIONS = new Set(['status', 'start', 'card_start', 'customer_token', 'pay_now', 'cancel', 'resume', 'refund'])
const CHECKOUT_KIND = { start: 'start', card_start: 'card', pay_now: 'pay' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// config: { ready, slpProblem, prefix, siteUrl, serverIp? }
export function createWebBillingHandler({ config, db, slp, log = () => {}, now = () => Date.now() }) {
  return async (request) => {
    const reply = (status, body) => Response.json(body, { status, headers: { ...CORS, 'Cache-Control': 'no-store' } })
    const fail = (code) => reply(ERROR_STATUS[code] ?? 503, { ok: false, error: ERROR_STATUS[code] ? code : 'unavailable' })
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (request.method !== 'POST') return reply(405, { ok: false, error: 'invalid_input' })
    if (!config.ready || config.slpProblem || !config.prefix || !config.siteUrl) return fail('unavailable')
    const token = bearerToken(request)
    if (!token) return fail('unauthorized')
    let user
    try { user = await db.getUser(token) } catch { return fail('unavailable') }
    if (!user) return fail('unauthorized')

    const raw = await readBody(request, 16384).catch(() => null)
    if (raw == null) return fail('invalid_input')
    let body
    try { body = JSON.parse(raw) } catch { return fail('invalid_input') }
    const action = body?.action
    if (typeof action !== 'string' || !ACTIONS.has(action)) return fail('invalid_input')

    try {
      if ((await db.rpc('account_access_allowed', { p_user: user.id })) !== true) return fail('unauthorized')
      await db.server('rate_hit', { user_id: user.id, bucket: action === 'status' ? 'read' : 'write' })
      const billing = async () => db.userRpc(token, 'my_web_billing')

      if (action === 'status') {
        // Do not depend on the webhook to open Pro: ask SLP about our own
        // undecided requests first (at most 3, each 10 s max).
        const open = await db.server('open_attempts', { user_id: user.id })
        for (const ctx of (Array.isArray(open) ? open : []).filter((c) => c.trade_order_id).slice(0, 3)) {
          try {
            const f = await fetchAttemptResult(slp, ctx)
            if (f.result) await applyAttemptResult({ db, slp, referenceOrderId: ctx.reference_order_id, result: f.result, log })
          } catch { log({ fn: 'web-billing', step: 'status_refresh', ref: ctx.reference_order_id }) }
        }
        return reply(200, { ok: true, billing: await billing() })
      }

      if (action in CHECKOUT_KIND) {
        const kind = CHECKOUT_KIND[action]
        const paySession = body.paySession
        const locale = body.locale ?? 'zh-TW'
        if (typeof paySession !== 'string' || !paySession || paySession.length > 8192) return fail('invalid_input')
        if (locale !== 'zh-TW' && locale !== 'en') return fail('invalid_input')
        if (kind === 'start' && body.plan !== 'monthly' && body.plan !== 'annual') return fail('invalid_input')
        // Optional (contract addendum): what the page promised. true + trial
        // no longer available → trial_used instead of charging today.
        if (body.expectTrial !== undefined && typeof body.expectTrial !== 'boolean') return fail('invalid_input')
        if (isNativeOrigin(request)) return fail('native_not_allowed')
        const ctx = await db.server('start_checkout', {
          user_id: user.id, kind, plan: kind === 'start' ? body.plan : null, prefix: config.prefix,
          expect_trial: body.expectTrial ?? null,
        })
        const ref = ctx.reference_order_id
        const memberIp = clientIp(request)
        const createBody = buildCreateBody({ ctx, paySession, locale, siteUrl: config.siteUrl, k: kind, clientIp: memberIp,
          fallbackIp: config.serverIp, email: user.email })
        const ipFrom = ipSource({ clientIp: memberIp, fallbackIp: config.serverIp })
        if (ipFrom !== 'client') log({ fn: 'web-billing', step: 'create', ref, client_ip: ipFrom }) // 'placeholder' = 0.0.0.0 was sent
        const res = await slp.createPayment(createBody, { idempotentKey: ref })
        if (!res.ok) {
          await applyAttemptResult({ db, slp, referenceOrderId: ref, result: classifyCreateFailure(res), log })
          return fail('slp_error')
        }
        const trade = res.data
        const norm = normalizeTrade(trade)
        if (norm.trade_order_id) {
          await applyAttemptResult({ db, slp, referenceOrderId: ref,
            result: { status: 'pending', trade_order_id: norm.trade_order_id, slp_status: norm.slp_status, slp_sub_status: norm.slp_sub_status }, log })
        }
        if (norm.status !== 'pending') {
          // Synchronous final answer from our own call (no 3-D Secure step).
          const full = await db.server('attempt_context', { reference_order_id: ref })
          const result = await resolveTrade(slp, full ?? ctx, trade)
          const out = await applyAttemptResult({ db, slp, referenceOrderId: ref, result, log })
          if (result.status === 'failed' && out?.status === 'failed') return fail('slp_error')
        }
        // nextAction is opaque: handed to the SDK as-is (TODO(SLP-sandbox): object or string).
        return reply(200, { ok: true, subscription_id: ctx.subscription_id, next_action: trade.nextAction ?? null })
      }

      if (action === 'customer_token') {
        if (isNativeOrigin(request)) return fail('native_not_allowed')
        const c = await db.server('customer_of', { user_id: user.id })
        if (!c?.customer_id) return fail('not_found')
        const res = await slp.customerToken(c.customer_id)
        if (!res.ok || typeof res.data?.customerToken !== 'string') return fail('slp_error')
        return reply(200, { ok: true, customer_token: res.data.customerToken, expires_at: tokenExpiry(res.data.expireTime, now()) })
      }

      if (action === 'cancel' || action === 'resume') {
        await db.server(action, { user_id: user.id })
        return reply(200, { ok: true, billing: await billing() })
      }

      // refund
      if (typeof body.payment_id !== 'string' || !UUID.test(body.payment_id)) return fail('invalid_input')
      const r = await db.server('request_refund', { user_id: user.id, payment_id: body.payment_id, prefix: config.prefix })
      let status = r.status
      if (r.status === 'requested' && r.trade_order_id) {
        const res = await slp.createRefund({
          referenceOrderId: r.reference_order_id, tradeOrderId: r.trade_order_id,
          amount: { value: r.amount_minor, currency: 'TWD' }, reason: 'cooling_off',
        }, { idempotentKey: r.reference_order_id })
        if (res.ok) {
          const out = await applyRefundResult({ db, slp, referenceOrderId: r.reference_order_id, result: normalizeRefund(res.data), log })
          status = out?.status ?? status
        } else if (res.kind === 'http' && res.status >= 400 && res.status < 500 && res.status !== 429 && res.code !== '1013') {
          // Definitely refused: a human takes over (R6 deadline keeps running).
          const out = await applyRefundResult({ db, slp, referenceOrderId: r.reference_order_id, result: { status: 'failed' }, log })
          status = out?.status ?? 'needs_review'
        }
        // Timeout / 5xx / 1013: left 'requested'; the cron hands it to a human
        // after 10 minutes instead of sending money twice.
      }
      return reply(200, { ok: true, refund_status: status === 'needs_review' ? 'needs_review' : 'processing', billing: await billing() })
    } catch (e) {
      if (e instanceof DbError) return fail(e.code)
      log({ fn: 'web-billing', action, error: 'exception' })
      return fail('unavailable')
    }
  }
}
