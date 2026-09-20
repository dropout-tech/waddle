// Kept runtime-independent so the exact webhook logic can be tested with Node.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function subscriberIds(event) {
  const ids = event.type === 'TRANSFER'
    ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
    : [event.app_user_id, ...(event.aliases ?? [])]
  return [...new Set(ids.filter((id) => typeof id === 'string' && uuid.test(id)))]
}
export function snapshot(body, userId, entitlementId) {
  if (!body?.subscriber || !Number.isFinite(body.request_date_ms)) throw new Error('Invalid subscriber response')
  const entitlement = body.subscriber.entitlements?.[entitlementId]
  const subscription = body.subscriber.subscriptions?.[entitlement?.product_identifier]
  const expiry = Date.parse(entitlement?.expires_date ?? '')
  const grace = Date.parse(subscription?.grace_period_expires_date ?? '')
  // This launch only supports recurring production subscriptions, never lifetime grants.
  const eligible = subscription?.is_sandbox === false && !subscription.refunded_at && Number.isFinite(expiry)
  const validUntil = eligible ? Math.max(expiry, Number.isFinite(grace) ? grace : 0) : 0
  return {
    user_id: userId,
    entitlement: 'pro',
    expires_at: validUntil > 0 ? new Date(validUntil).toISOString() : null,
    observed_at_ms: body.request_date_ms,
  }
}
async function secretMatches(actual, expected) {
  const digest = async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  const [a, b] = await Promise.all([digest(actual), digest(expected)])
  return a.reduce((difference, byte, index) => difference | (byte ^ b[index]), 0) === 0
}
export function createHandler({ config, fetchSubscriber, persist }) {
  return async (request) => {
    const reply = (status, result) => Response.json(result, { status })
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
    if (!config.secret || !config.apiKey || !config.entitlementId || !config.appIds?.length || !config.databaseReady) {
      return reply(503, { error: 'billing_not_configured' })
    }
    if (!await secretMatches(request.headers.get('authorization') ?? '', config.secret)) return reply(401, { error: 'unauthorized' })
    try {
      const raw = await request.text()
      if (raw.length > 100000) return reply(413, { error: 'payload_too_large' })
      let payload
      try { payload = JSON.parse(raw) } catch { return reply(400, { error: 'invalid_json' }) }
      const event = payload?.event
      if (!event || typeof event.id !== 'string' || !event.id || typeof event.type !== 'string') return reply(400, { error: 'invalid_event' })
      if (event.type === 'TEST') return reply(200, { received: true, test: true })
      if (!config.appIds.includes(event.app_id)) return reply(403, { error: 'unexpected_app' })
      // TRANSFER may omit environment; authoritative snapshots still reject sandbox products.
      if (event.environment && event.environment !== 'PRODUCTION') return reply(200, { ignored: 'sandbox' })
      const ids = subscriberIds(event)
      if (!ids.length) return reply(200, { ignored: 'no_authenticated_user' })
      if (ids.length > 20) return reply(422, { error: 'too_many_identities' })
      const snapshots = await Promise.all(ids.map(async (id) => snapshot(await fetchSubscriber(id), id, config.entitlementId)))
      await persist(event.id, snapshots)
      return reply(200, { received: true })
    } catch {
      // No event is acknowledged until atomic persistence succeeds; RevenueCat can retry.
      return reply(503, { error: 'billing_sync_failed' })
    }
  }
}
