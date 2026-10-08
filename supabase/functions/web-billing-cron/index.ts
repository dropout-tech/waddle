// Thin Deno shell for the billing tick (pg_cron → pg_net POST every 10 min,
// design §4.1). Deploy WITHOUT gateway JWT verification:
// `supabase functions deploy web-billing-cron --no-verify-jwt`; the caller
// must send header x-cron-secret = WEB_BILLING_CRON_SECRET (constant-time
// compare). Secrets: the SLP set (see web-billing), WEB_BILLING_CRON_SECRET,
// RESEND_API_KEY, RESEND_FROM_ADDRESS, WEB_BILLING_SITE_URL. Missing → 503.
// SHOPLINE_SERVER_IP (client.ip for Recurring, ≤ 32 chars; REQUIRED for charging,
// TODO(SLP-Q4)): without a valid value the tick still runs but sends no charges
// (logged as SHOPLINE_SERVER_IP_missing_or_invalid).
import { createRest, slpConfigProblem } from '../_shared/web-billing/core.mjs'
import { createSlpClient } from '../_shared/web-billing/slp.mjs'
import { processOutbox, renderEmail, sendEmail } from '../_shared/web-billing/email.mjs'
import { createCronHandler } from './handler.mjs'

const env = (key: string) => Deno.env.get(key) ?? ''
const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry))
const url = env('SUPABASE_URL')
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
const slpConfig = {
  apiKey: env('SHOPLINE_API_KEY'),
  merchantId: env('SHOPLINE_MERCHANT_ID'),
  apiBase: env('SHOPLINE_API_BASE'),
  prefix: env('SHOPLINE_ORDER_PREFIX'),
}

Deno.serve(createCronHandler({
  config: {
    ready: Boolean(url && serviceKey),
    slpProblem: slpConfigProblem(slpConfig),
    cronSecret: env('WEB_BILLING_CRON_SECRET'),
    prefix: slpConfig.prefix,
    siteUrl: env('WEB_BILLING_SITE_URL'),
    resendApiKey: env('RESEND_API_KEY'),
    resendFrom: env('RESEND_FROM_ADDRESS'),
    serverIp: env('SHOPLINE_SERVER_IP') || null,
  },
  db: createRest({ fetch, url, serviceKey, anonKey: serviceKey }),
  slp: createSlpClient({ fetch, apiBase: slpConfig.apiBase, merchantId: slpConfig.merchantId, apiKey: slpConfig.apiKey, log }),
  email: { processOutbox, renderEmail, sendEmail },
  fetch,
  log,
}))
