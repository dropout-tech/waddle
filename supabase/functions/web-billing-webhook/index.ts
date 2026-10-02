// Thin Deno shell for SLP webhooks. Deploy WITHOUT gateway JWT verification
// (like revenuecat-webhook): `supabase functions deploy web-billing-webhook
// --no-verify-jwt`. Authenticity = HMAC signature + merchantId + re-query of
// SLP (see handler.mjs). Secrets: SHOPLINE_WEBHOOK_SIGN_KEY, SHOPLINE_API_KEY,
// SHOPLINE_MERCHANT_ID, SHOPLINE_API_BASE, SHOPLINE_ORDER_PREFIX; missing → 503.
import { createRest, slpConfigProblem } from '../_shared/web-billing/core.mjs'
import { createSlpClient } from '../_shared/web-billing/slp.mjs'
import { createWebhookHandler } from './handler.mjs'

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

Deno.serve(createWebhookHandler({
  config: {
    ready: Boolean(url && serviceKey),
    slpProblem: slpConfigProblem(slpConfig),
    signKey: env('SHOPLINE_WEBHOOK_SIGN_KEY'),
    merchantId: slpConfig.merchantId,
    prefix: slpConfig.prefix,
  },
  db: createRest({ fetch, url, serviceKey, anonKey: serviceKey }),
  slp: createSlpClient({ fetch, apiBase: slpConfig.apiBase, merchantId: slpConfig.merchantId, apiKey: slpConfig.apiKey, log }),
  log,
}))
