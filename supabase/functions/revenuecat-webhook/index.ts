import { createHandler } from './core.mjs'

const env = (key: string) => Deno.env.get(key) ?? ''
const supabaseUrl = env('SUPABASE_URL')
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
const apiKey = env('REVENUECAT_SECRET_API_KEY')
Deno.serve(createHandler({
  config: {
    secret: env('REVENUECAT_WEBHOOK_AUTHORIZATION'),
    apiKey,
    entitlementId: env('REVENUECAT_PRO_ENTITLEMENT_ID'),
    appIds: env('REVENUECAT_APP_IDS').split(',').map((id) => id.trim()).filter(Boolean),
    databaseReady: Boolean(supabaseUrl && serviceKey),
  },
  async fetchSubscriber(id: string) {
    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error('Subscriber lookup failed')
    return response.json()
  },
  async persist(eventId: string, snapshots: unknown[]) {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/apply_billing_snapshot`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_event_id: eventId, p_snapshots: snapshots }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error('Snapshot persistence failed')
  },
}))
