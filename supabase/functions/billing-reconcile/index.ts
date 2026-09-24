import { createReconcileHandler } from './core.mjs'
const env = (key: string) => Deno.env.get(key) ?? ''
const url = env('SUPABASE_URL'), service = env('SUPABASE_SERVICE_ROLE_KEY'), apiKey = env('REVENUECAT_SECRET_API_KEY'), entitlementId = env('REVENUECAT_PRO_ENTITLEMENT_ID')
Deno.serve(createReconcileHandler({
 configured: Boolean(url && service && apiKey && entitlementId), entitlementId,
 async authenticate(authorization: string) {
  if (!authorization.startsWith('Bearer ')) return null
  const response = await fetch(`${url}/auth/v1/user`, {headers:{Authorization:authorization,apikey:service},signal:AbortSignal.timeout(10000)})
  return response.ok ? response.json() : null
 },
 async fetchSubscriber(id: string) {
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(10000)})
  if (!response.ok) throw new Error('Lookup failed')
  return response.json()
 },
 async persist(eventId: string,snapshots: unknown[]) {
  const response = await fetch(`${url}/rest/v1/rpc/apply_billing_snapshot`,{method:'POST',headers:{Authorization:`Bearer ${service}`,apikey:service,'Content-Type':'application/json'},body:JSON.stringify({p_event_id:eventId,p_snapshots:snapshots}),signal:AbortSignal.timeout(10000)})
  if (!response.ok) throw new Error('Persistence failed')
 }
}))
