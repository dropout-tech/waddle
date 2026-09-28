// Supabase Edge Function: delete the caller's orphaned uploaded images.
//
// Images in the public `notebook-images` bucket ({user_id}/{uuid}.ext) are
// never deleted when the note / task / whiteboard card that embedded them is
// deleted or edited (task deletes are undoable, so deleting eagerly would
// break "復原"). The app calls this function on launch (≤ once a day) and
// after deleting a note; it removes the caller's objects that are older than
// 24h and no longer referenced by ANY row in the database (see core.mjs for
// the rules and migration 20260928120000_notebook_image_references.sql for
// the reference lookup).
//
// Deploy:  supabase functions deploy cleanup-images   (verify_jwt stays on)
// Requires migration 20260928120000 to be applied first.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { BUCKET, MAX_LIST, createHandler } from './core.mjs'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PAGE = 1000
const REMOVE_CHUNK = 100

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve(createHandler({
  async getCallerId(req: Request) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return null
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await userClient.auth.getUser()
    return error || !data.user ? null : data.user.id
  },

  async listObjects(ownerId: string) {
    const objects: { name: string; id: string | null; created_at: string | null }[] = []
    for (let offset = 0; offset < MAX_LIST; offset += PAGE) {
      const { data, error } = await admin.storage.from(BUCKET).list(ownerId, {
        limit: PAGE,
        offset,
        sortBy: { column: 'created_at', order: 'asc' },
      })
      if (error) throw error
      objects.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    return objects
  },

  async findReferencedKeys(ownerId: string, keys: string[]) {
    const { data, error } = await admin.rpc('notebook_image_references', { p_owner: ownerId, p_keys: keys })
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Unexpected reference lookup result')
    return data as string[]
  },

  async removeObjects(paths: string[]) {
    let removed = 0
    for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
      const { data, error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + REMOVE_CHUNK))
      if (error) throw error
      removed += data?.length ?? 0
    }
    return removed
  },
}))
