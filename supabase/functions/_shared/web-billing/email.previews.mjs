// Sample payloads + preview writer for the owner to review wording.
//   node supabase/functions/_shared/web-billing/email.previews.mjs
// writes docs/billing/email-previews/<kind>.html (fake data only). email.test.mjs
// fails if the committed previews are stale, so wording changes always show up in git.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { escapeHtml, renderEmail } from './email.mjs'

export const PREVIEW_SITE_URL = 'https://huddle.lazy72.com'

export const SAMPLES = {
  receipt: {
    plan: 'annual', amount_minor: 99000, paid_at: '2026-10-16T06:30:00Z', period_start: '2026-10-16T06:30:00Z',
    period_end: '2027-10-16T06:30:00Z', card_brand: 'VISA', card_last4: '4242', reference_order_id: 'hpAB12CD34EF56GH78c0001a01',
    refund_deadline: '2026-10-23T16:00:00Z',
  },
  trial_ending: {
    plan: 'monthly', amount_minor: 15000, trial_end: '2026-10-16T06:30:00Z', first_charge_at: '2026-10-16T06:30:00Z', card_last4: '4242',
  },
  renewal_reminder: { plan: 'annual', amount_minor: 99000, renews_at: '2027-10-16T06:30:00Z', card_last4: '4242' },
  payment_failed: {
    plan: 'monthly', amount_minor: 15000, failed_at: '2026-11-16T06:30:00Z', grace_until: '2026-11-23T06:30:00Z', next_retry_at: '2026-11-17T06:30:00Z',
  },
  action_required: { plan: 'annual', amount_minor: 99000, grace_until: '2027-10-23T06:30:00Z' },
  refund_done: { amount_minor: 99000, refunded_at: '2026-10-20T03:00:00Z', reference_order_id: 'hpAB12CD34EF56GH78c0001a01' },
  canceled: { plan: 'monthly', access_until: '2026-11-16T06:30:00Z', reason: 'user' },
  canceled_grace_exhausted: { plan: 'monthly', access_until: '2026-11-23T06:30:00Z', reason: 'grace_exhausted' },
}

/** Preview file = the real HTML plus a subject banner on top and the plain-text part at the bottom. */
export function previewHtml(name) {
  const kind = name.startsWith('canceled') ? 'canceled' : name
  const mail = renderEmail(kind, SAMPLES[name], { siteUrl: PREVIEW_SITE_URL })
  const banner = `<div style="font:14px/1.6 Arial,sans-serif;background:#fffbe6;border-bottom:1px solid #ccc;padding:10px 16px;color:#333">` +
    `<b>預覽（假資料）／Preview, sample data</b> · kind: <code>${escapeHtml(name)}</code><br><b>主旨 Subject:</b> ${escapeHtml(mail.subject)}</div>`
  const textPart = `<details style="font:13px/1.6 Arial,sans-serif;padding:10px 16px"><summary>純文字版 Plain-text part</summary><pre style="white-space:pre-wrap">${escapeHtml(mail.text)}</pre></details>`
  return mail.html.replace(/(<body[^>]*>)/, `$1${banner}`).replace('</body>', `${textPart}</body>`)
}

export function writePreviews(dir) {
  mkdirSync(dir, { recursive: true })
  for (const name of Object.keys(SAMPLES)) writeFileSync(join(dir, `${name}.html`), previewHtml(name))
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
  writePreviews(join(root, 'docs/billing/email-previews'))
  console.log(`wrote ${Object.keys(SAMPLES).length} previews to docs/billing/email-previews/`)
}
