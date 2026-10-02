// Supabase Edge Function: retry RevenueCat customer deletions that delete-account had to queue
// (RevenueCat was unreachable when the member deleted their account). Meant to be called on a
// schedule (Supabase Cron, daily, created with its "Add secret key" header). Only callers that send
// one of the project's server keys — `apikey` header or Bearer token — are let in.
//
// Deploy:  supabase functions deploy revenuecat-deletion-retry --no-verify-jwt
// Secrets: REVENUECAT_SECRET_API_KEY (shared with revenuecat-webhook); SUPABASE_* are injected.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { drainQueue } from '../_shared/revenuecat-deletion-queue.ts'
import { isServiceCaller, serverKeys } from '../_shared/service-auth.mjs'

const env = (key: string) => Deno.env.get(key) ?? ''

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 })
  if (!await isServiceCaller(req.headers, env)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || serverKeys(env)[0]
  try {
    const admin = createClient(env('SUPABASE_URL'), serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const summary = await drainQueue(admin, env('REVENUECAT_SECRET_API_KEY'), 100)
    return Response.json(summary, { status: 200 })
  } catch (e) {
    console.error('[revenuecat-deletion-retry] failed', e instanceof Error ? e.message : String(e))
    return Response.json({ error: 'retry_failed' }, { status: 503 })
  }
})
