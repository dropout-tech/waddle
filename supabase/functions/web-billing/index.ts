// Thin Deno shell: read env, inject fetch-based clients, serve. All logic is
// in handler.mjs / ../_shared/web-billing (tested with node --test).
// Deploy: supabase functions deploy web-billing (JWT verified by the gateway;
// the handler re-reads the user from the token). Secrets: SHOPLINE_API_KEY,
// SHOPLINE_MERCHANT_ID, SHOPLINE_API_BASE, SHOPLINE_ORDER_PREFIX,
// WEB_BILLING_SITE_URL. Any missing → every request answers 503 `unavailable`.
// Optional SHOPLINE_SERVER_IP: used as client.ip only if the member's IP is unreadable.
import { createRest, slpConfigProblem } from '../_shared/web-billing/core.mjs'
import { createSlpClient } from '../_shared/web-billing/slp.mjs'
import { createWebBillingHandler } from './handler.mjs'

const env = (key: string) => Deno.env.get(key) ?? ''
const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry))
const url = env('SUPABASE_URL')
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
const anonKey = env('SUPABASE_ANON_KEY')
const slpConfig = {
  apiKey: env('SHOPLINE_API_KEY'),
  merchantId: env('SHOPLINE_MERCHANT_ID'),
  apiBase: env('SHOPLINE_API_BASE'),
  prefix: env('SHOPLINE_ORDER_PREFIX'),
}

Deno.serve(createWebBillingHandler({
  config: {
    ready: Boolean(url && serviceKey && anonKey),
    slpProblem: slpConfigProblem(slpConfig),
    prefix: slpConfig.prefix,
    siteUrl: env('WEB_BILLING_SITE_URL'),
    serverIp: env('SHOPLINE_SERVER_IP') || null,
  },
  db: createRest({ fetch, url, serviceKey, anonKey }),
  slp: createSlpClient({ fetch, apiBase: slpConfig.apiBase, merchantId: slpConfig.merchantId, apiKey: slpConfig.apiKey, log }),
  log,
}))
