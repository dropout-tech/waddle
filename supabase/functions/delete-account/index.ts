// Supabase Edge Function: delete the calling user's account.
//
// Required for App Store Guideline 5.1.1(v): an app that supports account
// creation must let users delete their account in-app. The anon client can't
// remove an auth user, so this runs server-side with the service-role key.
// Every app table has `on delete cascade` on auth.users(id) (see
// supabase/migrations/0001_initial_schema.sql), so deleting the auth user
// removes all of their table data automatically.
//
// Uploaded images are NOT covered by that cascade: they live in the public
// Storage bucket `notebook-images` under {user_id}/. Those are purged first;
// if the purge fails (or anything is left behind), the account is NOT
// deleted and the request fails, so a retry can finish the job instead of
// leaving orphaned, still-public images with no owner to delete them.
//
// The member's RevenueCat customer is deleted next (see revenuecat.mjs), so a
// subscription bound to this account can be restored on a new one. Same rule:
// if RevenueCat cannot confirm, the account is NOT deleted and the member retries.
// Skipped while REVENUECAT_SECRET_API_KEY is not set (billing not launched).
//
// Deploy:  supabase functions deploy delete-account
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
//  by the platform; REVENUECAT_SECRET_API_KEY is the same project secret the
//  revenuecat-webhook function uses.)

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { deleteRevenueCatCustomer } from './revenuecat.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const IMAGE_BUCKET = 'notebook-images'
const PAGE = 1000
const REMOVE_CHUNK = 100
const MAX_DEPTH = 5
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type StorageClient = ReturnType<typeof createClient>['storage']

/** Every file path under `prefix` (recursing into sub-folders, which the
 *  app never creates but a client could). */
async function listFiles(storage: StorageClient, prefix: string, depth = 0): Promise<string[]> {
  const files: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.from(IMAGE_BUCKET).list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw error
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`
      if (item.id === null) {
        if (depth >= MAX_DEPTH) throw new Error('Image folder nesting too deep')
        files.push(...(await listFiles(storage, path, depth + 1)))
      } else {
        files.push(path)
      }
    }
    if (!data || data.length < PAGE) break
  }
  return files
}

/** Remove every image under `{userId}/`; throws unless the folder ends up empty. */
async function purgeUserImages(storage: StorageClient, userId: string) {
  const files = await listFiles(storage, userId)
  for (let i = 0; i < files.length; i += REMOVE_CHUNK) {
    const chunk = files.slice(i, i + REMOVE_CHUNK)
    if (chunk.some((path) => !path.startsWith(`${userId}/`))) throw new Error('Refusing to delete outside the user folder')
    const { error } = await storage.from(IMAGE_BUCKET).remove(chunk)
    if (error) throw error
  }
  const remaining = await listFiles(storage, userId)
  if (remaining.length > 0) throw new Error(`${remaining.length} image(s) left after purge`)
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Identify the caller from their JWT.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Invalid session' }, 401)

    if (!UUID.test(user.id)) return json({ error: 'Invalid session' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)

    // Purge uploaded images first; any failure aborts before the account is
    // touched. The folder comes only from the verified JWT (user.id).
    try {
      await purgeUserImages(admin.storage, user.id)
    } catch (e) {
      console.error('[delete-account] image purge failed', e instanceof Error ? e.message : String(e))
      return json({ error: 'Could not delete uploaded images; account was not deleted' }, 500)
    }

    // Release any App Store subscription bound to this account (Keep with original App User ID).
    try {
      await deleteRevenueCatCustomer({ apiKey: Deno.env.get('REVENUECAT_SECRET_API_KEY') ?? '', userId: user.id })
    } catch (e) {
      console.error('[delete-account] RevenueCat customer delete failed', e instanceof Error ? e.message : String(e))
      return json({ error: 'Could not remove purchase records; account was not deleted' }, 503)
    }

    // Delete with the service role; FKs cascade-delete all the user's rows.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) return json({ error: delErr.message }, 500)

    return json({ success: true }, 200)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
