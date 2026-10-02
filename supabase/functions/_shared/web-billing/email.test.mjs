// node --test supabase/functions/_shared/web-billing/email.test.mjs
// No network: sendEmail gets a fake fetch. No database: processOutbox gets fake claim/finish.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SUPPORT_EMAIL, SUPPORT_PHONE, escapeHtml, formatDate, formatMoney, processOutbox, renderEmail, sendEmail } from './email.mjs'
import { PREVIEW_SITE_URL, SAMPLES, previewHtml } from './email.previews.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SITE = 'https://huddle.lazy72.com'
const r = (kind, payload) => renderEmail(kind, payload, { siteUrl: SITE })
const both = (m, ...needles) => { for (const n of needles) assert.ok(m.text.includes(n), `text missing ${n}\n${m.text}`) }

test('formatMoney: NT$ from minor units', () => {
  assert.equal(formatMoney(99000), 'NT$990')
  assert.equal(formatMoney(15000), 'NT$150')
  assert.equal(formatMoney(123456700), 'NT$1,234,567')
  assert.equal(formatMoney(15050), 'NT$150.50')
  assert.throws(() => formatMoney(-1))
  assert.throws(() => formatMoney('990'))
  assert.throws(() => formatMoney(undefined))
})

test('formatDate: Taipei calendar day (UTC+8, no DST)', () => {
  assert.equal(formatDate('2026-10-15T15:59:59Z'), '2026/10/15')
  assert.equal(formatDate('2026-10-15T16:00:00Z'), '2026/10/16')
  assert.equal(formatDate('2026-12-31T16:30:00Z'), '2027/01/01')
  assert.throws(() => formatDate('not a date'))
  assert.throws(() => formatDate(null))
})

test('escapeHtml', () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
})

test('receipt: amount, dates, card, order number, refund deadline, cancel route', () => {
  const m = r('receipt', SAMPLES.receipt)
  assert.match(m.subject, /NT\$990/)
  assert.ok(m.subject.includes('收據') && m.subject.includes('receipt'))
  both(m, 'NT$990', '2026/10/16', '2027/10/16', '末四碼 4242', 'VISA', 'hpAB12CD34EF56GH78c0001a01', '2026/10/23 23:59', 'Pro 年繳', 'Pro (annual)', '取消續訂', 'Cancel renewal', SUPPORT_PHONE)
  assert.ok(m.html.includes(`${SITE}/?settings=subscription`))
  assert.ok(m.html.startsWith('<!doctype html>'))
  // zh section before en section
  assert.ok(m.text.indexOf('付款成功') < m.text.indexOf('Payment received'))
  assert.ok(m.html.indexOf('lang="zh-Hant"') < m.html.indexOf('lang="en"'))
})

test('receipt: no refund line when refund_deadline is null (monthly renewal)', () => {
  const m = r('receipt', { ...SAMPLES.receipt, plan: 'monthly', amount_minor: 15000, refund_deadline: null, card_brand: null, reference_order_id: null })
  assert.ok(!m.text.includes('全額退款') && !m.text.includes('full refund'))
  both(m, 'NT$150', '末四碼 4242')
  assert.ok(!m.text.includes('訂單編號'))
})

test('trial_ending: charge date, amount, cancel-before day, how to cancel', () => {
  const m = r('trial_ending', SAMPLES.trial_ending)
  assert.ok(m.subject.includes('NT$150') && m.subject.includes('2026/10/16'))
  both(m, '2026/10/16', 'NT$150', '2026/10/15 結束前取消', 'before the end of 2026/10/15', '末四碼 4242', '「設定」→「訂閱」→「取消續訂」', 'Settings → Subscription → Cancel renewal', SUPPORT_PHONE)
  assert.ok(m.html.includes(`${SITE}/?settings=subscription`))
})

test('renewal_reminder: renewal date, amount, cancel route, refund window', () => {
  const m = r('renewal_reminder', SAMPLES.renewal_reminder)
  assert.ok(m.subject.includes('2027/10/16') && m.subject.includes('NT$990'))
  both(m, '2027/10/16', 'NT$990', '2027/10/15 結束前取消', '取消續訂', '7 天內', 'within 7 days', SUPPORT_PHONE)
})

test('payment_failed: grace end, retry info, pay + change-card links', () => {
  const m = r('payment_failed', SAMPLES.payment_failed)
  both(m, 'NT$150', '2026/11/16', '2026/11/23', '最多再嘗試扣款 3 次', '2026/11/17', 'up to 3 more times', '不會向你追收', 'will not collect')
  assert.ok(m.html.includes(`${SITE}/billing/pay`) && m.html.includes(`${SITE}/billing/card`))
  const noRetry = r('payment_failed', { ...SAMPLES.payment_failed, next_retry_at: null })
  assert.ok(!noRetry.text.includes('下一次約'))
})

test('action_required: go to site, deadline, links', () => {
  const m = r('action_required', SAMPLES.action_required)
  both(m, 'NT$990', '2027/10/23', '銀行驗證', 'bank verification')
  assert.ok(m.html.includes(`${SITE}/billing/pay`) && m.html.includes(`${SITE}/billing/card`))
})

test('refund_done: amount, date, card issuer wording, order number', () => {
  const m = r('refund_done', SAMPLES.refund_done)
  assert.ok(m.subject.includes('NT$990'))
  both(m, 'NT$990', '2026/10/20', '發卡銀行', 'card issuer', 'hpAB12CD34EF56GH78c0001a01', '資料不會被刪除')
})

test('canceled: user / grace_exhausted / admin / refund variants', () => {
  const user = r('canceled', SAMPLES.canceled)
  both(user, '2026/11/16', '不會再扣款', 'not be charged again', '恢復續訂')
  const grace = r('canceled', SAMPLES.canceled_grace_exhausted)
  both(grace, '2026/11/23', '不會向你追收', '7 天內仍無法成功扣款')
  assert.ok(grace.subject.includes('已結束'))
  const admin = r('canceled', { plan: 'annual', access_until: '2027-01-01T00:00:00Z', reason: 'admin' })
  both(admin, '2027/01/01', '不會再扣款')
  const refund = r('canceled', { plan: 'annual', access_until: '2026-10-20T03:00:00Z', reason: 'refund' })
  both(refund, '退款', 'refund')
  assert.notEqual(user.subject, grace.subject)
})

test('price_change, service_notice and unknown kinds are not sent (null)', () => {
  assert.equal(r('price_change', {}), null)
  assert.equal(r('service_notice', {}), null)
  assert.equal(r('something_else', {}), null)
})

test('missing / malformed payload throws a clear error', () => {
  assert.throws(() => r('receipt', { ...SAMPLES.receipt, amount_minor: undefined }), /invalid payload: amount_minor/)
  assert.throws(() => r('trial_ending', { ...SAMPLES.trial_ending, first_charge_at: 'garbage' }), /invalid payload: first_charge_at/)
  assert.throws(() => r('canceled', null), /invalid payload/)
  assert.throws(() => renderEmail('receipt', SAMPLES.receipt, {}), /siteUrl/)
  assert.throws(() => renderEmail('receipt', SAMPLES.receipt, { siteUrl: 'javascript:alert(1)' }), /siteUrl/)
})

test('siteUrl trailing slash is normalised', () => {
  const m = renderEmail('payment_failed', SAMPLES.payment_failed, { siteUrl: 'https://example.com/' })
  assert.ok(m.html.includes('https://example.com/billing/pay') && !m.html.includes('com//billing'))
})

test('HTML escape: user-controlled strings cannot inject markup', () => {
  const evil = `<script>alert(1)</script>"'&`
  const m = r('receipt', { ...SAMPLES.receipt, card_brand: evil, reference_order_id: evil, plan: evil })
  assert.ok(!m.html.includes('<script>'), 'raw <script> in html')
  assert.ok(m.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;'))
  const m2 = renderEmail('payment_failed', SAMPLES.payment_failed, { siteUrl: 'https://x.test/a"onmouseover="y' })
  assert.ok(!m2.html.includes('"onmouseover="'))
})

test('card_last4 that is not 4 digits is dropped, never printed', () => {
  const m = r('trial_ending', { ...SAMPLES.trial_ending, card_last4: '<b>1</b>' })
  assert.ok(!m.text.includes('<b>') && !m.text.includes('末四碼'))
})

test('support phone matches lib/legal/operator.ts', () => {
  const src = readFileSync(join(here, '../../../../lib/legal/operator.ts'), 'utf8')
  assert.equal(src.match(/SUPPORT_PHONE = '([^']+)'/)[1], SUPPORT_PHONE)
  assert.equal(src.match(/SUPPORT_EMAIL = '([^']+)'/)[1], SUPPORT_EMAIL)
})

test('committed previews in docs/billing/email-previews are up to date', () => {
  for (const name of Object.keys(SAMPLES)) {
    const file = readFileSync(join(here, '../../../../docs/billing/email-previews', `${name}.html`), 'utf8')
    assert.equal(file, previewHtml(name), `${name}.html is stale: run node supabase/functions/_shared/web-billing/email.previews.mjs`)
  }
  assert.equal(PREVIEW_SITE_URL, 'https://huddle.lazy72.com')
})

// ── sendEmail ───────────────────────────────────────────────────────────────
const mail = { apiKey: 're_test_key', from: 'Huddle <billing@lazy72.com>', to: 'a@example.com', subject: 's', html: '<p>h</p>', text: 't', idempotencyKey: 'id-1' }
const fakeFetch = (status, body, calls = []) => async (url, init) => {
  calls.push({ url, init })
  return { status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }
}

test('sendEmail: 200 -> ok with provider id, correct request', async () => {
  const calls = []
  const out = await sendEmail(fakeFetch(200, { id: 'em_123' }, calls), mail)
  assert.deepEqual(out, { ok: true, providerId: 'em_123', retryable: false })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.resend.com/emails')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test_key')
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'id-1')
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: mail.from, to: ['a@example.com'], reply_to: SUPPORT_EMAIL, subject: 's', html: '<p>h</p>', text: 't' })
})

test('sendEmail: 422 is permanent, 429 and 5xx are retryable', async () => {
  const bad = await sendEmail(fakeFetch(422, { name: 'validation_error', message: 'Invalid `to` field' }), mail)
  assert.equal(bad.ok, false); assert.equal(bad.retryable, false); assert.match(bad.error, /422.*validation_error/)
  const rate = await sendEmail(fakeFetch(429, { name: 'rate_limit_exceeded', message: 'slow down' }), mail)
  assert.equal(rate.ok, false); assert.equal(rate.retryable, true)
  for (const s of [500, 502, 503]) assert.equal((await sendEmail(fakeFetch(s, 'oops'), mail)).retryable, true, String(s))
  assert.equal((await sendEmail(fakeFetch(401, { name: 'restricted_api_key' }), mail)).retryable, false)
})

test('sendEmail: 409 concurrent idempotent request is retryable, payload mismatch is not', async () => {
  assert.equal((await sendEmail(fakeFetch(409, { name: 'concurrent_idempotent_requests', message: 'x' }), mail)).retryable, true)
  assert.equal((await sendEmail(fakeFetch(409, { name: 'invalid_idempotent_request', message: 'x' }), mail)).retryable, false)
})

test('sendEmail: network error / timeout is retryable and never throws', async () => {
  const out = await sendEmail(async () => { throw new TypeError('fetch failed') }, mail)
  assert.deepEqual(out, { ok: false, error: 'network: TypeError', retryable: true })
  const abort = await sendEmail(async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e }, mail)
  assert.equal(abort.retryable, true)
})

test('sendEmail: missing input is rejected without calling fetch; key never leaks into errors', async () => {
  let called = 0
  const f = async () => { called++; return { status: 200, text: async () => '{}' } }
  for (const patch of [{ apiKey: '' }, { to: '' }, { idempotencyKey: '' }, { from: '' }]) {
    const out = await sendEmail(f, { ...mail, ...patch })
    assert.deepEqual(out, { ok: false, error: 'invalid_input', retryable: false })
  }
  assert.equal(called, 0)
  const out = await sendEmail(fakeFetch(401, { message: 'bad key' }), mail)
  assert.ok(!JSON.stringify(out).includes('re_test_key'))
})

test('sendEmail: 2xx with an unreadable body still counts as sent', async () => {
  const out = await sendEmail(fakeFetch(200, 'not json'), mail)
  assert.equal(out.ok, true); assert.equal(out.providerId, undefined)
})

// ── processOutbox ───────────────────────────────────────────────────────────
const row = (id, kind, payload, to = `${id}@example.com`) => ({ id, kind, payload, to_email: to })
function harness(rows, sendImpl) {
  const finished = []
  const sent = []
  return {
    finished, sent,
    opts: {
      claim: async (limit) => { harness.limit = limit; return rows },
      finish: async (...args) => { finished.push(args) },
      send: async (m) => { sent.push(m); return sendImpl(m) },
      siteUrl: SITE,
      intervalMs: 0,
    },
  }
}

test('processOutbox: success, retryable failure, permanent failure, skip, bad payload each call finish correctly', async () => {
  const rows = [
    row('ok1', 'receipt', SAMPLES.receipt),
    row('bad-send', 'trial_ending', SAMPLES.trial_ending),
    row('skip1', 'price_change', {}),
    row('bad-payload', 'receipt', { plan: 'monthly' }),
    row('ok2', 'refund_done', SAMPLES.refund_done),
  ]
  const h = harness(rows, (m) => (m.idempotencyKey === 'bad-send' ? { ok: false, error: 'http_429', retryable: true } : { ok: true, providerId: `prov-${m.idempotencyKey}` }))
  const out = await processOutbox({ ...h.opts, max: 7 })
  assert.equal(harness.limit, 7)
  assert.equal(out.sent, 2); assert.equal(out.failed, 2); assert.equal(out.skipped, 1)
  assert.deepEqual(h.finished, [
    ['ok1', true, 'prov-ok1', false],
    ['bad-send', false, null, false],
    ['skip1', false, null, true],
    ['bad-payload', false, null, false],
    ['ok2', true, 'prov-ok2', false],
  ])
  assert.deepEqual(h.sent.map((m) => m.idempotencyKey), ['ok1', 'bad-send', 'ok2'])
  assert.equal(h.sent[0].to, 'ok1@example.com')
  assert.ok(h.sent[0].subject && h.sent[0].html && h.sent[0].text)
  assert.ok(out.errors.some((e) => e.includes('bad-payload')) && out.errors.some((e) => e.includes('bad-send')))
})

test('processOutbox: default max is 30, empty queue is fine', async () => {
  const h = harness([], () => ({ ok: true }))
  const out = await processOutbox(h.opts)
  assert.equal(harness.limit, 30)
  assert.deepEqual(out, { sent: 0, failed: 0, skipped: 0, errors: [] })
})

test('processOutbox: a send that throws is a failed attempt; a finish that throws does not stop the batch', async () => {
  const rows = [row('a', 'receipt', SAMPLES.receipt), row('b', 'receipt', SAMPLES.receipt)]
  let n = 0
  const finished = []
  const out = await processOutbox({
    claim: async () => rows,
    finish: async (id, ok) => { finished.push([id, ok]); if (id === 'a') throw new Error('db down') },
    send: async () => { if (n++ === 0) throw new Error('boom'); return { ok: true, providerId: 'p' } },
    siteUrl: SITE, intervalMs: 0,
  })
  assert.equal(out.failed, 1); assert.equal(out.sent, 1)
  assert.deepEqual(finished, [['a', false], ['b', true]])
  assert.ok(out.errors.some((e) => e.includes('finish a')))
})

test('processOutbox: custom render injection (null skips, output is sent as-is)', async () => {
  const h = harness([row('x', 'receipt', {}), row('y', 'receipt', {})], () => ({ ok: true, providerId: 'p' }))
  let calls = 0
  const out = await processOutbox({ ...h.opts, render: () => (calls++ === 0 ? null : { subject: 'S', html: 'H', text: 'T' }) })
  assert.equal(out.skipped, 1); assert.equal(out.sent, 1)
  assert.deepEqual(h.sent[0], { to: 'y@example.com', subject: 'S', html: 'H', text: 'T', idempotencyKey: 'y' })
})

test('processOutbox: claim errors propagate to the caller', async () => {
  await assert.rejects(() => processOutbox({ claim: async () => { throw new Error('rpc failed') }, finish: async () => {}, send: async () => ({ ok: true }), siteUrl: SITE }), /rpc failed/)
})
