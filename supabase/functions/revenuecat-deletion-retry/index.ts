// Supabase Edge Function: retry RevenueCat customer deletions that delete-account had to queue
// (RevenueCat was unreachable when the member deleted their account). Meant to be called on a
// schedule — e.g. Supabase Dashboard → Integrations → Cron, daily, POST with the service-role key
// as the Bearer token. Anything else is refused.
//
// Deploy:  supabase functions deploy revenuecat-deletion-retry --no-verify-jwt
// Secrets: REVENUECAT_SECRET_API_KEY (shared with revenuecat-webhook); SUPABASE_* are injected.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { drainQueue } from '../_shared/revenuecat-deletion-queue.ts'

const env = (key: string) => Deno.env.get(key) ?? ''

async function sameSecret(actual: string, expected: string) {
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  const [a, b] = await Promise.all([digest(actual), digest(expected)])
  return a.reduce((difference, byte, index) => difference | (byte ^ b[index]), 0) === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 })
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceKey || !await sameSecret(req.headers.get('Authorization') ?? '', `Bearer ${serviceKey}`)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const admin = createClient(env('SUPABASE_URL'), serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const summary = await drainQueue(admin, env('REVENUECAT_SECRET_API_KEY'), 100)
    return Response.json(summary, { status: 200 })
  } catch (e) {
    console.error('[revenuecat-deletion-retry] failed', e instanceof Error ? e.message : String(e))
    return Response.json({ error: 'retry_failed' }, { status: 503 })
  }
})
