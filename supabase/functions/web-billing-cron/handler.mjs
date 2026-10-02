// web-billing-cron: one tick (design §4.2), called by pg_cron + pg_net every
// 10 minutes with header x-cron-secret. Every step scans for work, so a
// missed or failed tick is simply caught up by the next one.
//   1 lease  2 reconcile  3 charge (≤ 10, one claim at a time)  4 expire
//   5 reminders (module C)  6 refund tracking  7 e-mail outbox (module C)
//   8 heartbeat + release
// Whole tick ≤ 120 s; every SLP call ≤ 10 s. A charge is only claimed when
// there is time left to send it, so nothing is claimed and then abandoned.
import {
  applyAttemptResult, applyRefundResult, buildCreateBody, classifyCreateFailure, constantTimeEqual, DbError,
  fetchAttemptResult, normalizeRefund, normalizeTrade,
} from '../_shared/web-billing/core.mjs'

export const TICK_BUDGET_MS = 120000
export const MAX_CHARGES_PER_TICK = 10
const SLP_CALL_MS = 10000
const BINDING_ABANDON_MS = 60 * 60 * 1000

// config: { ready, slpProblem, cronSecret, prefix, siteUrl, resendApiKey, resendFrom, serverIp }
// email: { processOutbox, renderEmail, sendEmail } from _shared/web-billing/email.mjs (module C)
export function createCronHandler({ config, db, slp, email, fetch: fetchFn, log = () => {}, now = () => Date.now() }) {
  return async (request) => {
    const reply = (status, body) => Response.json(body, { status })
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
    if (!config.ready || config.slpProblem || !config.cronSecret || !config.prefix || !config.siteUrl
        || !config.resendApiKey || !config.resendFrom || !email?.processOutbox) {
      return reply(503, { error: 'billing_not_configured' })
    }
    if (!constantTimeEqual(request.headers.get('x-cron-secret') ?? '', config.cronSecret)) return reply(401, { error: 'unauthorized' })

    const deadline = now() + TICK_BUDGET_MS
    const left = () => deadline - now()
    let cfg
    try { cfg = await db.server('config') } catch { return reply(503, { error: 'database_unavailable' }) }
    // Both switches off = feature off: touch nothing (not even the lease).
    if (!cfg || (cfg.checkout_mode === 'off' && !cfg.renewals_enabled)) return reply(200, { skipped: 'disabled' })
    let lease
    try { lease = await db.server('take_lease', { seconds: 300 }) } catch { return reply(503, { error: 'database_unavailable' }) }
    if (!lease) return reply(200, { skipped: 'lease_held' })

    const summary = { errors: [] }
    const step = async (name, fn) => {
      try { summary[name] = await fn() } catch (e) {
        summary.errors.push(name)
        log({ fn: 'web-billing-cron', step: name, error: e instanceof DbError ? e.code : 'exception' })
      }
    }
    let candidates = { attempts: [], refunds: [] }
    try {
      await step('reconciled', async () => {
        candidates = (await db.server('reconcile_candidates', { limit: 20 })) ?? candidates
        return reconcile(candidates.attempts ?? [])
      })
      await step('charges', chargeDue)
      await step('expired', () => db.server('expire_due'))
      await step('reminders', async () => {
        const r = await db.server('enqueue_reminders')
        return r?.missing ? 'missing' : r?.count ?? 0
      })
      await step('refunds', () => trackRefunds(candidates.refunds ?? []))
      await step('emails', async () => {
        // module C sleeps ~600 ms between e-mails: keep it inside the budget.
        const max = Math.max(0, Math.min(30, Math.floor((left() - 10000) / 1500)))
        if (max === 0) return 'no_time'
        return email.processOutbox({
          claim: async (limit) => {
            const r = await db.server('claim_outbox', { limit })
            return r?.missing ? [] : (r?.rows ?? [])
          },
          finish: (id, ok, providerId, skip) =>
            db.server('finish_outbox', { id, ok: Boolean(ok), provider_id: providerId ?? null, skip: Boolean(skip) }),
          send: (msg) => email.sendEmail(fetchFn, { apiKey: config.resendApiKey, from: config.resendFrom, ...msg }),
          render: email.renderEmail,
          siteUrl: config.siteUrl,
          max,
        })
      })
    } finally {
      try { await db.server('release_lease', { lease }) } catch { summary.errors.push('release_lease') }
    }
    return reply(200, { ok: summary.errors.length === 0, ...summary })

    // Step 2: requests SLP has not answered. Ask SLP; never re-send.
    async function reconcile(attempts) {
      let resolved = 0, unknown = 0, abandoned = 0
      for (const ctx of attempts) {
        if (left() < 60000) break
        const ref = ctx.reference_order_id
        if (ctx.trade_order_id) {
          const f = await fetchAttemptResult(slp, ctx)
          if (f.result && f.result.status !== 'pending') {
            await applyAttemptResult({ db, slp, referenceOrderId: ref, result: f.result, log }); resolved++; continue
          }
        }
        const age = now() - Date.parse(ctx.created_at)
        if (ctx.kind === 'card_bind' && age > BINDING_ABANDON_MS) {
          // A card binding moves no money: after an hour it is closed so the
          // member can try again (a late success is then ignored).
          await applyAttemptResult({ db, slp, referenceOrderId: ref, result: { status: 'failed', failure_code: 'abandoned', failure_kind: 'hard' }, log })
          abandoned++
        } else if (!ctx.trade_order_id && ctx.status === 'pending') {
          // Sent but no trade id came back (timeout): we cannot ask SLP by our
          // order id (TODO(SLP-Q5)), so it waits for the webhook or a human.
          await applyAttemptResult({ db, slp, referenceOrderId: ref, result: { status: 'unknown', failure_code: 'no_trade_id' }, log })
          unknown++
        }
      }
      return { resolved, unknown, abandoned }
    }

    // Step 3: claim ONE due subscription, send it, record the answer; repeat.
    async function chargeDue() {
      let sent = 0, succeeded = 0, failed = 0, undecided = 0
      while (sent < MAX_CHARGES_PER_TICK && left() > SLP_CALL_MS + 20000) {
        const claimed = await db.server('claim_due', { prefix: config.prefix, limit: 1 })
        const ctx = Array.isArray(claimed) ? claimed[0] : null
        if (!ctx) break
        sent++
        let result
        try {
          const body = buildCreateBody({ ctx, locale: 'zh-TW', siteUrl: config.siteUrl, k: 'pay', clientIp: config.serverIp })
          const res = await slp.createPayment(body, { idempotentKey: ctx.reference_order_id })
          result = res.ok ? normalizeTrade(res.data) : classifyCreateFailure(res)
        } catch {
          result = { status: 'unknown', failure_code: 'not_sent' } // a human checks; never auto-retried
        }
        await applyAttemptResult({ db, slp, referenceOrderId: ctx.reference_order_id, result, log })
        if (result.status === 'succeeded') succeeded++
        else if (result.status === 'failed') failed++
        else undecided++
      }
      return { sent, succeeded, failed, undecided }
    }

    // Step 6: refunds SLP is still processing.
    async function trackRefunds(refunds) {
      let done = 0
      for (const r of refunds) {
        if (left() < 30000) break
        const res = await slp.getRefund(r.refund_order_id)
        if (!res.ok) continue
        if (res.data?.referenceOrderId && res.data.referenceOrderId !== r.reference_order_id) continue
        const result = normalizeRefund(res.data)
        if (result.status === 'processing') continue
        await applyRefundResult({ db, slp, referenceOrderId: r.reference_order_id, result, log })
        done++
      }
      return { done }
    }
  }
}
