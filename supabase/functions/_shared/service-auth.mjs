// Kept runtime-independent so it can be tested with Node (scripts/tests/service-auth.test.mjs).
//
// Who may call internal Edge Functions such as revenuecat-deletion-retry: only the project itself.
// Supabase now issues two kinds of server keys and its Cron "Add secret key" button sends the new
// one in an `apikey` header, while older callers send the legacy service-role JWT as a Bearer token.
// Both are accepted; nothing else is.

/** Every configured server key: the legacy service-role key plus the new secret keys. */
export function serverKeys(env) {
  const keys = []
  const legacy = env('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) keys.push(legacy)
  const raw = env('SUPABASE_SECRET_KEYS')
  if (raw) {
    let parsed
    try { parsed = JSON.parse(raw) } catch { parsed = raw.split(',') }
    const values = typeof parsed === 'string' ? [parsed]
      : Array.isArray(parsed) ? parsed
      : parsed && typeof parsed === 'object' ? Object.values(parsed)
      : []
    for (const value of values) if (typeof value === 'string' && value.trim()) keys.push(value.trim())
  }
  return [...new Set(keys)]
}

async function sameSecret(actual, expected) {
  const digest = async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  const [a, b] = await Promise.all([digest(actual), digest(expected)])
  return a.reduce((difference, byte, index) => difference | (byte ^ b[index]), 0) === 0
}

/** True only when the request carries one of the project's server keys (apikey header or Bearer token). */
export async function isServiceCaller(headers, env) {
  const keys = serverKeys(env)
  if (!keys.length) return false
  const bearer = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const candidates = [headers.get('apikey') ?? '', bearer].filter(Boolean)
  let ok = false
  for (const candidate of candidates) for (const key of keys) ok = (await sameSecret(candidate, key)) || ok
  return ok
}
