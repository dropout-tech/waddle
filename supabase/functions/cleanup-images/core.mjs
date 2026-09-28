// Orphaned-image cleanup for the `notebook-images` bucket.
// Kept runtime-independent so the exact deletion rules can be tested with Node
// (scripts/tests/cleanup-images.test.mjs); index.ts only wires in Supabase I/O.
//
// Safety rules (every one is covered by a test):
//   - The caller id comes only from the verified JWT (getCallerId); the
//     request body is never read.
//   - Only objects directly under `{callerId}/` are considered, and every path
//     handed to removeObjects is re-checked to start with that prefix.
//   - Objects younger than MIN_AGE_MS are kept (just uploaded, maybe unsaved).
//   - An object is kept if its key appears anywhere in the database, in rows
//     owned by anyone (findReferencedKeys). If that lookup fails, nothing is
//     deleted.

export const BUCKET = 'notebook-images'
export const MIN_AGE_MS = 24 * 60 * 60 * 1000
export const MAX_DELETE = 200
export const MAX_LIST = 5000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Upload code names objects `{crypto.randomUUID()}.{ext}`.
const OBJECT_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[^/]*)?$/i

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value)
}

/** '{ownerId}/{object_uuid}' for an object this app uploaded, else null. */
export function referenceKey(ownerId, name) {
  if (!isUuid(ownerId) || typeof name !== 'string') return null
  const match = OBJECT_NAME.exec(name)
  return match ? `${ownerId}/${match[1]}` : null
}

/** Objects old enough to be considered: files only (folders have id null),
 *  recognisable names, created at least `minAgeMs` before `now`. */
export function candidates({ ownerId, objects, now, minAgeMs = MIN_AGE_MS }) {
  if (!isUuid(ownerId) || !Array.isArray(objects)) return []
  const out = []
  for (const object of objects) {
    if (!object || object.id == null) continue
    const key = referenceKey(ownerId, object.name)
    if (!key) continue
    const created = Date.parse(object.created_at ?? '')
    if (!Number.isFinite(created) || now - created < minAgeMs) continue
    out.push({ path: `${ownerId}/${object.name}`, key })
  }
  return out
}

/** Pure decision: which object paths to delete. */
export function selectDeletions({ ownerId, objects, referencedKeys, now, minAgeMs = MIN_AGE_MS, limit = MAX_DELETE }) {
  if (!Array.isArray(referencedKeys)) throw new Error('referencedKeys must be an array')
  const referenced = new Set(referencedKeys)
  const prefix = `${ownerId}/`
  return candidates({ ownerId, objects, now, minAgeMs })
    .filter((c) => !referenced.has(c.key))
    .map((c) => c.path)
    .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
    .slice(0, Math.max(0, limit))
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * deps:
 *   getCallerId(req)            -> user id from the verified JWT, or null
 *   listObjects(ownerId)        -> [{ name, id, created_at }] directly under `${ownerId}/`
 *   findReferencedKeys(owner, keys) -> subset of keys still referenced anywhere
 *   removeObjects(paths)        -> number of objects removed
 *   now()                       -> ms timestamp
 */
export function createHandler({ getCallerId, listObjects, findReferencedKeys, removeObjects, now = () => Date.now(), log = console.error }) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    try {
      const ownerId = await getCallerId(req)
      if (!isUuid(ownerId)) return json({ error: 'Invalid session' }, 401)

      const objects = (await listObjects(ownerId)) ?? []
      const at = now()
      const pending = candidates({ ownerId, objects, now: at })
      if (pending.length === 0) return json({ scanned: objects.length, deleted: 0 }, 200)

      const referencedKeys = await findReferencedKeys(ownerId, pending.map((c) => c.key))
      const paths = selectDeletions({ ownerId, objects, referencedKeys, now: at })
      const deleted = paths.length > 0 ? await removeObjects(paths) : 0
      return json({ scanned: objects.length, deleted }, 200)
    } catch (e) {
      log('[cleanup-images] failed', e instanceof Error ? e.message : String(e))
      return json({ error: 'Cleanup failed' }, 500)
    }
  }
}
