// Website billing (SHOPLINE Payments) — pure logic shared by the web-billing,
// web-billing-webhook and web-billing-cron Edge Functions. No Deno APIs and no
// imports: Node (`node --test`) and Deno run the same file. Every network
// call goes through an injected fetch / client.
// Design: docs/billing/2026-10-02-web-billing-design.md; contract:
// docs/billing/2026-10-02-web-billing-contracts.md; SLP facts and guesses:
// docs/billing/2026-10-02-shopline-api-notes.md. TODO(SLP-Qn) = design §9 question n.

// ── Identifiers ─────────────────────────────────────────────────────────────
// 32 hex chars: SLP header requestId is String(32) and unique per request.
export function requestId() {
  return crypto.randomUUID().replace(/-/g, '')
}

const PREFIX = /^[a-z]{2}$/
const ORDER_REF = /^[A-Za-z0-9]{16}$/
const pad = (n, width) => String(n).padStart(width, '0')

// Deterministic SLP referenceOrderId, identical to huddle_ops.web_order_id:
// {prefix2}{order_ref16}c{cycle4}a{attempt2} → 26 chars (≤ 32). The same
// attempt always produces the same number, so a re-sent request can never
// become a second charge on SLP's side (1001 Order exist — TODO(SLP-Q5)).
export function orderId(prefix, orderRef, cycle, attempt, tag = 'a') {
  if (!PREFIX.test(prefix ?? '') || !ORDER_REF.test(orderRef ?? '')) throw new Error('invalid order id parts')
  if (!Number.isInteger(cycle) || cycle < 0 || cycle > 9999) throw new Error('invalid cycle')
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 99) throw new Error('invalid attempt')
  if (tag !== 'a' && tag !== 'r') throw new Error('invalid tag')
  return `${prefix}${orderRef}c${pad(cycle, 4)}${tag}${pad(attempt, 2)}`
}
export function refundId(prefix, orderRef, cycle, seq) {
  return orderId(prefix, orderRef, cycle, seq, 'r')
}
const ORDER_ID = /^([a-z]{2})([A-Za-z0-9]{16})c(\d{4})([ar])(\d{2})$/
export function parseOrderId(id) {
  const m = typeof id === 'string' ? ORDER_ID.exec(id) : null
  if (!m) return null
  return { prefix: m[1], orderRef: m[2], cycle: Number(m[3]), kind: m[4] === 'a' ? 'payment' : 'refund', seq: Number(m[5]) }
}
// Webhooks of the shared sandbox merchant carry other developers' orders:
// only ids in OUR format with OUR prefix are ever looked up.
export function isOurOrder(id, prefix) {
  const parsed = parseOrderId(id)
  return Boolean(parsed && parsed.prefix === prefix)
}
// SLP referenceCustomerId = Supabase user id without dashes (32 hex).
export function referenceCustomerId(userId) {
  return String(userId ?? '').toLowerCase().replace(/-/g, '')
}

// ── Money ───────────────────────────────────────────────────────────────────
// SLP amounts are minor units (TWD × 100): NT$150 → 15000 (SLP notes §2).
// One conversion function, one sanity ceiling (R9: ×100 twice must fail).
export const MAX_CHARGE_MINOR = 200000 // NT$2,000; real prices are 150 / 990
export function toMinor(twd) {
  if (typeof twd !== 'number' || !Number.isFinite(twd) || twd < 0) throw new Error('invalid amount')
  const minor = Math.round(twd * 100)
  if (Math.abs(minor - twd * 100) > 1e-6) throw new Error('amount has more than 2 decimals')
  return minor
}
export function fromMinor(minor) {
  if (!Number.isInteger(minor)) throw new Error('invalid minor amount')
  return minor / 100
}
export function isChargeableMinor(minor) {
  return Number.isInteger(minor) && minor >= 1 && minor <= MAX_CHARGE_MINOR
}

// ── SLP failure code → what we do (design §2.2, SLP notes §5) ──────────────
//   4900 need 3DS / 4901 need CVC / 4902 saved-card error: cannot pass without
//   the customer → stop retrying, ask the customer (needs_customer_action).
//   1201 card still being cloned after binding: retry in 5 minutes, not counted.
//   anything else: ordinary failure → retries at +1 / +3 / +6 days (in SQL).
export const CUSTOMER_ACTION_CODES = new Set(['4900', '4901', '4902'])
export const RETRY_DAYS = [1, 3, 6]
export function failureAction(code) {
  const c = code == null ? '' : String(code)
  if (CUSTOMER_ACTION_CODES.has(c)) return { kind: 'customer_action', retry: false, delayMinutes: null, counts: false }
  if (c === '1201') return { kind: 'soft', retry: true, delayMinutes: 5, counts: false }
  return { kind: 'hard', retry: true, delayMinutes: null, counts: true }
}

// ── State machine (mirror of huddle_ops.web_subscription_guard) ─────────────
export const TRANSITIONS = Object.freeze({
  incomplete: ['trialing', 'active', 'incomplete_expired'],
  trialing: ['active', 'past_due', 'expired', 'refunded'],
  active: ['past_due', 'expired', 'refunded'],
  past_due: ['active', 'expired', 'refunded'],
  expired: [],
  refunded: [],
  incomplete_expired: [],
})
export function canTransition(from, to) {
  return from === to || Boolean(TRANSITIONS[from]?.includes(to))
}
export const OPEN_STATES = ['incomplete', 'trialing', 'active', 'past_due']

// ── Webhook signature (SLP notes §7) ────────────────────────────────────────
// sign = HMAC-SHA256(timestamp + "." + raw body, signKey), hex. Compared in
// constant time; timestamp (ms) must be within ±5 minutes of now.
// TODO(SLP-Q8): hex casing / tolerance confirmed only by third parties.
export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000
const enc = new TextEncoder()
export async function hmacSha256Hex(key, message) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(message)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}
export function constantTimeEqual(a, b) {
  const x = enc.encode(String(a ?? ''))
  const y = enc.encode(String(b ?? ''))
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}
export async function verifyWebhookSignature({ rawBody, timestamp, sign, signKey, nowMs = Date.now(), toleranceMs = SIGNATURE_TOLERANCE_MS }) {
  if (!signKey || typeof rawBody !== 'string' || !timestamp || !sign) return { ok: false, reason: 'missing' }
  if (!/^\d{10,16}$/.test(String(timestamp))) return { ok: false, reason: 'bad_timestamp' }
  if (Math.abs(nowMs - Number(timestamp)) > toleranceMs) return { ok: false, reason: 'stale' }
  const expected = await hmacSha256Hex(signKey, `${timestamp}.${rawBody}`)
  return constantTimeEqual(expected, String(sign).trim().toLowerCase()) ? { ok: true } : { ok: false, reason: 'bad_signature' }
}

// ── Normalising AUTHORITATIVE SLP responses into what the DB applies ────────
// Only responses we fetched from SLP ourselves (create / payment/get /
// refund/get / instrument query) reach these — never a webhook body.
// TODO(SLP-Q6): the complete status / subStatus list is not documented; any
// value we do not recognise stays 'pending' (no state change), which is safe.
const SUCCEEDED = new Set(['SUCCEEDED'])
const FAILED = new Set(['FAILED', 'EXPIRED', 'CANCELLED', 'CANCELED', 'CLOSED'])
const str = (v, max = 64) => (typeof v === 'string' && v ? v.slice(0, max) : typeof v === 'number' ? String(v) : null)
const intOrNull = (v) => (Number.isInteger(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null)

export function normalizeInstrument(raw) {
  if (!raw || typeof raw !== 'object') return null
  const card = raw.instrumentCard ?? raw.card ?? {}
  const id = str(raw.instrumentId ?? raw.paymentInstrumentId, 128)
  if (!id) return null
  const last4 = str(card.last ?? card.last4, 8)
  return {
    id,
    brand: str(card.brand, 20),
    issuer_country: str(card.issuerCountry ?? raw.issuerCountry, 8),
    last4: last4 && /^\d{4}$/.test(last4) ? last4 : null,
    status: str(raw.instrumentStatus, 20),
  }
}
// TODO(SLP-sandbox §12-2): 'SUCCESSED' is documented as chargeable; 'ENABLED'
// appears in the query API without a definition — accepted until sandbox says otherwise.
export function instrumentUsable(inst) {
  return Boolean(inst && (inst.status === 'SUCCESSED' || inst.status === 'ENABLED'))
}

export function normalizeTrade(trade) {
  const status = String(trade?.status ?? '').toUpperCase()
  const code = str(trade?.paymentMsg?.code, 40)
  const result = {
    status: SUCCEEDED.has(status) ? 'succeeded' : FAILED.has(status) ? 'failed' : 'pending',
    trade_order_id: str(trade?.tradeOrderId, 64),
    slp_status: str(trade?.status, 40),
    slp_sub_status: str(trade?.subStatus, 40),
  }
  if (result.status === 'failed') {
    result.failure_code = code ?? status
    result.failure_msg = str(trade?.paymentMsg?.msg, 200)
    result.failure_kind = failureAction(code).kind
  }
  // Prefer what SLP says was PAID. TODO(SLP-Q6): whether payment/get always
  // carries paidAmount is undocumented; without it we fall back to the order
  // amount SLP stored (still SLP's record, so unit errors show) and mark it,
  // instead of blocking every charge. applyAttemptResult logs the fallback.
  const paid = intOrNull(trade?.paidAmount?.value)
  const amount = paid ?? intOrNull(trade?.amount?.value)
  if (result.status === 'succeeded' && amount != null) {
    result.amount_minor = amount
    result.amount_source = paid != null ? 'paid' : 'order'
  }
  // TODO(SLP-sandbox): where payment/get puts the SLP customer and card is not
  // documented; these are the paths the create-trade field table suggests.
  result.customer_id = str(trade?.paymentCustomerId ?? trade?.customer?.customerId ?? trade?.order?.customer?.customerId
    ?? trade?.confirm?.paymentCustomerId, 128)
  const instId = str(trade?.order?.payment?.paymentInstrument?.paymentInstrumentId
    ?? trade?.paymentInstrument?.paymentInstrumentId ?? trade?.confirm?.paymentInstrument?.paymentInstrumentId, 128)
  if (instId) {
    const cc = trade?.order?.payment?.creditCard ?? {}
    result.instrument = { id: instId, brand: str(cc.brand, 20), issuer_country: str(cc.issuerCountry, 8),
      last4: /^\d{4}$/.test(String(cc.last4 ?? '')) ? String(cc.last4) : null }
  }
  return result
}

// TODO(SLP-Q9): refund status list taken from third-party notes (PROCESSING /
// SUCCEEDED / FAILED); anything else is treated as still processing.
export function normalizeRefund(data) {
  const status = String(data?.status ?? '').toUpperCase()
  const out = {
    status: status === 'SUCCEEDED' ? 'succeeded' : status === 'FAILED' ? 'failed' : 'processing',
    refund_order_id: str(data?.refundOrderId, 64),
  }
  const amount = intOrNull(data?.amount?.value)
  if (out.status === 'succeeded' && amount != null) out.amount_minor = amount
  return out
}

// A failed SLP "create" call: did SLP possibly create the trade?
//   timeout / network / 5xx / unreadable → 'unknown' (never retried automatically)
//   1001 Order exist → 'unknown' (TODO(SLP-Q5): query by our order id is not documented)
//   429 / 1904 too frequent → 'failed' soft (request refused, safe to try next tick)
//   other 4xx with a code → 'failed' with that code (e.g. 4900 → customer action)
export function classifyCreateFailure(res) {
  if (!res || res.ok) return null
  if (res.kind !== 'http' || !res.status || res.status >= 500) return { status: 'unknown', failure_code: res.kind === 'http' ? `http_${res.status}` : res.kind }
  if (res.code === '1001') return { status: 'unknown', failure_code: '1001' }
  if (res.status === 429 || res.code === '1904') return { status: 'failed', failure_code: res.code ?? 'http_429', failure_kind: 'soft', failure_msg: res.msg ?? null }
  return { status: 'failed', failure_code: res.code ?? `http_${res.status}`, failure_kind: failureAction(res.code).kind, failure_msg: res.msg ?? null }
}

// ── Building the SLP "create payment" body (SLP notes §4, §5) ───────────────
// TODO(SLP-Q12): the create page marks order / billing / personalInfo /
// returnUrl / language as required while the Recurring example omits them.
// Following the notes we send all of them with neutral placeholders (no
// personal data: we never collect names or addresses); trim after sandbox.
export const SLP_PLACEHOLDERS = Object.freeze({
  personalInfo: { lastName: 'Huddle' },
  billing: { personalInfo: { lastName: 'Huddle' }, address: { countryCode: 'TW' } },
  shipping: { shippingMethod: 'NONE', personalInfo: { lastName: 'Huddle' }, address: { countryCode: 'TW' } },
})
// TODO(SLP-sandbox): accepted language codes are not documented.
export function slpLanguage(locale) {
  return locale === 'en' ? 'en' : 'zh-TW'
}
export function returnUrl(siteUrl, orderRef, k) {
  const base = String(siteUrl ?? '').replace(/\/+$/, '')
  return `${base}/billing/return?ref=${encodeURIComponent(orderRef)}&k=${encodeURIComponent(k)}`
}
// ctx = row returned by web_start_checkout / web_claim_due.
export function buildCreateBody({ ctx, paySession, locale, siteUrl, k, clientIp }) {
  const behavior = ctx.behavior
  const amount = { value: ctx.charge_amount_minor, currency: 'TWD' }
  if (!isChargeableMinor(amount.value)) throw new Error('refusing to send an out-of-range amount')
  const confirm = { paymentMethod: 'CreditCard', paymentBehavior: behavior, autoConfirm: behavior === 'Recurring' }
  if (behavior === 'CardBind' || behavior === 'CardBindPayment') confirm.paymentInstrument = { savePaymentInstrument: true }
  if (behavior === 'QuickPayment' || behavior === 'Recurring') confirm.paymentCustomerId = ctx.customer_id
  if (behavior === 'Recurring') confirm.paymentInstrument = { paymentInstrumentId: ctx.instrument_id }
  const body = {
    acquirerType: 'SDK',
    referenceOrderId: ctx.reference_order_id,
    language: slpLanguage(locale),
    amount,
    returnUrl: returnUrl(siteUrl, ctx.order_ref ?? parseOrderId(ctx.reference_order_id)?.orderRef ?? '', k ?? 'pay'),
    confirm,
    customer: { referenceCustomerId: ctx.reference_customer_id, personalInfo: SLP_PLACEHOLDERS.personalInfo },
    order: {
      products: [{ id: `huddle-pro-${ctx.plan}`, name: ctx.plan === 'annual' ? 'Huddle Pro (annual)' : 'Huddle Pro (monthly)',
        quantity: 1, amount }],
      shipping: SLP_PLACEHOLDERS.shipping,
    },
    billing: SLP_PLACEHOLDERS.billing,
    // TODO(SLP-Q4): customer-present = the member's IP; Recurring = "our server
    // IP" (Edge Functions have no fixed IP).
    client: { ip: clientIp || '0.0.0.0' },
  }
  if (behavior !== 'Recurring') body.paySession = paySession
  return body
}

// ── Asking SLP for the truth about one attempt ──────────────────────────────
// ctx = huddle_ops.web_attempt_json row. hint = UNTRUSTED ids from a webhook
// (only used as lookup keys; whatever they point to is re-read from SLP and
// must match our order / member). Returns
//   { result }        authoritative result to apply (may still be 'pending')
//   { retry: true }   SLP could not be asked right now (webhook answers 503)
//   { ignore: why }   nothing trustworthy to apply (forged / unrelated ids)
const BIND_KINDS = new Set(['card_bind', 'first_purchase'])
export async function fetchAttemptResult(slp, ctx, hint = {}) {
  const ownTrade = ctx.trade_order_id || null
  const tradeId = ownTrade || hint.tradeOrderId || null
  if (!tradeId) return { ignore: 'no_trade_id' }
  const res = await slp.getPayment(tradeId)
  if (!res.ok) return res.kind === 'http' && res.status >= 400 && res.status < 500 && res.status !== 429
    ? { ignore: 'slp_rejected_query' } : { retry: true }
  const trade = res.data ?? {}
  // A trade id we did not store ourselves must prove it is this order; a
  // stored one must not contradict it.
  if (trade.referenceOrderId ? trade.referenceOrderId !== ctx.reference_order_id : !ownTrade) {
    return { ignore: 'order_mismatch' }
  }
  return { result: await resolveTrade(slp, ctx, trade, hint) }
}
// Same as above when we already hold an authoritative trade object (the
// synchronous answer of our own create call).
export async function resolveTrade(slp, ctx, trade, hint = {}) {
  const result = normalizeTrade(trade)
  if (!BIND_KINDS.has(ctx.kind)) return result
  // TODO(SLP-Q10): a card binding is a NT$1 authorisation SLP voids itself;
  // whether its trade then reads SUCCEEDED or CANCELLED is undocumented. A
  // voided binding is therefore never taken as a failure: the card query decides.
  const voidedBinding = ctx.kind === 'card_bind' && result.status === 'failed' && /^CANCEL/.test(String(result.slp_status ?? '').toUpperCase())
  if (result.status !== 'succeeded' && !voidedBinding) return result
  const pending = { ...result, status: 'pending' }
  delete pending.failure_code; delete pending.failure_kind; delete pending.failure_msg
  // Money taken but the card cannot be confirmed: a first purchase is still
  // recorded as paid WITHOUT a card (member gets Pro, card attached later;
  // review #2). A binding (no money) waits instead.
  const unmatched = () => {
    if (ctx.kind !== 'first_purchase' || result.status !== 'succeeded') return pending
    const paidNoCard = { ...result }
    delete paidNoCard.customer_id; delete paidNoCard.instrument
    return paidNoCard
  }
  const customerId = result.customer_id || ctx.customer_id || hint.customerId || null
  if (!customerId) return unmatched() // card arrives with customer.instrument.binded
  const q = await slp.queryInstruments(customerId)
  if (!q.ok) return unmatched()
  const ref = q.data?.referenceCustomerId
  if (!ref || ref !== ctx.reference_customer_id) return unmatched() // card must belong to THIS member
  const usable = (Array.isArray(q.data?.paymentInstruments) ? q.data.paymentInstruments : [])
    .map(normalizeInstrument).filter(instrumentUsable)
  const wanted = result.instrument?.id || hint.instrumentId || null
  let pick = wanted ? usable.find((i) => i.id === wanted) : null
  if (!wanted) {
    const known = new Set(ctx.known_instruments ?? [])
    const fresh = usable.filter((i) => !known.has(i.id))
    pick = fresh.length === 1 ? fresh[0] : null
  }
  if (!pick) return unmatched()
  return { ...pending, status: 'succeeded', customer_id: customerId,
    instrument: { id: pick.id, brand: pick.brand, issuer_country: pick.issuer_country, last4: pick.last4 } }
}

// Apply a result through the DB and, if the DB released a card (card change,
// refund), unbind it at SLP. Unbinding is best effort: the card is already
// disabled on our side and never charged again (admin can retry, P5).
export async function applyAttemptResult({ db, slp, referenceOrderId, result, log = () => {} }) {
  if (result?.status === 'succeeded' && result.amount_source !== 'paid') {
    log({ amount: 'unconfirmed', ref: referenceOrderId, source: result.amount_source ?? 'none' }) // TODO(SLP-Q6)
  }
  const out = await db.server('apply_payment_result', { reference_order_id: referenceOrderId, result })
  await unbindReleased({ slp, out, log })
  return out
}
export async function applyRefundResult({ db, slp, referenceOrderId, result, log = () => {} }) {
  const out = await db.server('apply_refund_result', { reference_order_id: referenceOrderId, result })
  await unbindReleased({ slp, out, log })
  return out
}
async function unbindReleased({ slp, out, log }) {
  const u = out?.unbind
  if (!u?.customer_id || !u?.instrument_id) return
  try {
    const r = await slp.unbind(u.customer_id, u.instrument_id)
    if (!r.ok) log({ unbind: 'failed', http: r.status ?? null, code: r.code ?? null })
  } catch { log({ unbind: 'failed' }) }
}

// ── Small request helpers ───────────────────────────────────────────────────
// Read a request body without trusting Content-Length; null when too large.
export async function readBody(request, maxBytes) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxBytes) { await reader.cancel().catch(() => {}); return null }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) { bytes.set(c, offset); offset += c.length }
  return new TextDecoder().decode(bytes)
}
export function bearerToken(request) {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')
  return m ? m[1].trim() : null
}
// The member's IP for customer-present SLP calls (client.ip).
export function clientIp(request) {
  const first = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  return /^[0-9a-fA-F:.]{3,45}$/.test(first) ? first : null
}
// Apple 3.1.1: no purchase flow inside the iOS shell (Capacitor origins).
export function isNativeOrigin(request) {
  return /^(capacitor|ionic):\/\//i.test(request.headers.get('origin') ?? '')
}
// customer/token expireTime is "an integer, seconds" — TODO(SLP-Q19): whether
// that is a lifetime or a Unix time is undocumented; both are handled.
export function tokenExpiry(expireTime, nowMs = Date.now()) {
  const n = Number(expireTime)
  if (!Number.isFinite(n) || n <= 0) return null
  const ms = n > 1e12 ? n : n > 1e9 ? n * 1000 : nowMs + n * 1000
  return new Date(ms).toISOString()
}

// ── Supabase access (PostgREST) with an injected fetch ──────────────────────
export class DbError extends Error {
  constructor(code, message) { super(message ?? code); this.code = code }
}
// Error code from a function's 'WEB_BILLING:<code>' exception.
export function dbErrorCode(body) {
  const m = /WEB_BILLING:([a-z_]+)/.exec(String(body?.message ?? body ?? ''))
  return m ? m[1] : 'unavailable'
}
export function createRest({ fetch: fetchFn, url, serviceKey, anonKey, timeoutMs = 10000 }) {
  const base = String(url ?? '').replace(/\/+$/, '')
  async function post(path, body, key, bearer) {
    const res = await fetchFn(`${base}${path}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (!res.ok) throw new DbError(dbErrorCode(data))
    return data
  }
  return {
    // public.web_billing_server(op, args) — service role only.
    server: (op, args = {}) => post('/rest/v1/rpc/web_billing_server', { p_op: op, p_args: args }, serviceKey, serviceKey),
    rpc: (fn, args = {}) => post(`/rest/v1/rpc/${fn}`, args, serviceKey, serviceKey),
    // As the member (their JWT): my_web_billing() reads auth.uid().
    userRpc: (token, fn, args = {}) => post(`/rest/v1/rpc/${fn}`, args, anonKey, token),
    async getUser(token) {
      const res = await fetchFn(`${base}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) return null
      const user = await res.json().catch(() => null)
      return user && typeof user.id === 'string' && !user.is_anonymous ? user : null
    },
  }
}

// ── Configuration gates ─────────────────────────────────────────────────────
export const SLP_BASES = Object.freeze({
  production: 'https://api.shoplinepayments.com',
  sandbox: 'https://api-sandbox.shoplinepayments.com',
})
// Missing / inconsistent secrets → the function answers 503 and does nothing.
// The order prefix must match the environment (hp ↔ production, hs ↔ sandbox)
// so sandbox order numbers can never be sent to the production API.
export function slpConfigProblem({ apiKey, merchantId, apiBase, prefix }) {
  if (!apiKey || !merchantId || !apiBase || !prefix) return 'missing'
  if (!PREFIX.test(prefix)) return 'bad_prefix'
  if (apiBase === SLP_BASES.production && prefix !== 'hp') return 'prefix_env_mismatch'
  if (apiBase === SLP_BASES.sandbox && prefix !== 'hs') return 'prefix_env_mismatch'
  if (apiBase !== SLP_BASES.production && apiBase !== SLP_BASES.sandbox) return 'unknown_api_base'
  return null
}
