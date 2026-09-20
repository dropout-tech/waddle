import { snapshot } from '../revenuecat-webhook/core.mjs'
export function createReconcileHandler({ configured, authenticate, fetchSubscriber, persist, entitlementId, eventId = () => crypto.randomUUID() }) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
  return async request => {
    const reply = (status, body) => Response.json(body, {status, headers})
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers})
    if (request.method !== 'POST') return reply(405,{error:'method_not_allowed'})
    if (!configured) return reply(503,{error:'billing_not_configured'})
    try {
      const user = await authenticate(request.headers.get('authorization') ?? '')
      if (!user?.id || user.is_anonymous) return reply(401,{error:'unauthorized'})
      // Never accept identity or entitlement fields from the request body.
      const authoritative = snapshot(await fetchSubscriber(user.id),user.id,entitlementId)
      await persist(`reconcile:${eventId()}`,[authoritative])
      return reply(200,{synced:true})
    } catch { return reply(503,{error:'billing_sync_failed'}) }
  }
}
