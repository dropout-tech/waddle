import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { SCOPE, b64, hash, eventId, seal, unseal, desiredEvents, sameEvent } from './core.mjs'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const env = (key: string) => Deno.env.get(key) || ''
const safeErrors = new Set(['not_configured','already_connected','invalid_state','invalid_workspace','invalid_time_zone','not_connected','sync_busy','lease_lost','reauth_required','calendar_creation_uncertain','google_conflict','google_permission_denied','google_retry_later','google_failed','sync_capacity_exceeded','invalid_source_date','invalid_source_time','unsupported_recurrence','invalid_action'])
export async function handler(req: Request) {
 if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
 if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
 let admin: SupabaseClient | undefined, uid = '', lease = '', calendarUncertain = false
 try {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /i, '')
  if (!jwt) return json({ error: 'unauthorized' }, 401)
  admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth, error: authError } = await admin.auth.getUser(jwt)
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401)
  uid = auth.user.id
  let sessionId = ''
  try { sessionId = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id } catch { /* rejected below */ }
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: 'unauthorized' }, 401)
  const body = await req.json()
  const clientId = env('GOOGLE_CALENDAR_CLIENT_ID'), secret = env('GOOGLE_CALENDAR_CLIENT_SECRET'), cipherKey = env('GOOGLE_CALENDAR_TOKEN_KEY'), redirect = env('GOOGLE_CALENDAR_REDIRECT_URI')
  const configured = !!(clientId && secret && cipherKey && /^https:\/\/[^?#]+\/settings\/google-calendar\/callback$/.test(redirect))
  const check = <T extends { error: unknown }>(r: T) => { if (r.error) throw Error('database_failed'); return r }
  const { data: connection } = check(await admin.from('google_calendar_connections').select('*').eq('user_id', uid).maybeSingle())
  if (body.action === 'status') return json({ configured, connected: !!connection, status: connection?.status || 'disconnected', last_synced_at: connection?.last_synced_at || null, error: connection?.last_error || null, calendar_id: connection?.calendar_id || null, time_zone: connection?.time_zone || null, workspace_ids: connection?.workspace_ids || [], range: { past_days: 30, future_days: 365 }, mode: 'one_way' })
  if (!configured) throw Error('not_configured')
  const tokenCall = async (params: Record<string, string>) => {
   const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, ...params }), signal: AbortSignal.timeout(10_000) })
   const t = await r.json()
   if (!r.ok) throw Error(t.error === 'invalid_grant' ? 'reauth_required' : 'google_failed')
   return t
  }
  if (body.action === 'start') {
   if (connection) throw Error('already_connected')
   const zone = body.time_zone
   try { new Intl.DateTimeFormat('en', { timeZone: zone }).format() } catch { throw Error('invalid_time_zone') }
   if (typeof zone !== 'string' || !zone) throw Error('invalid_time_zone')
   if (!Array.isArray(body.workspace_ids) || !body.workspace_ids.length || body.workspace_ids.length > 100 || body.workspace_ids.some((x: unknown) => typeof x !== 'string' || !/^[0-9a-f-]{36}$/i.test(x))) throw Error('invalid_workspace')
   const ids = [...new Set(body.workspace_ids)]
   const owned = check(await admin.from('workspaces').select('id').eq('user_id', uid).in('id', ids)).data
   if (!owned || owned.length !== ids.length) throw Error('invalid_workspace')
   const state = b64(crypto.getRandomValues(new Uint8Array(32))), verifier = b64(crypto.getRandomValues(new Uint8Array(32)))
   check(await admin.from('google_calendar_oauth_states').delete().eq('user_id', uid))
   check(await admin.from('google_calendar_oauth_states').insert({ state_hash: await hash(state), user_id: uid, session_id: sessionId, verifier_cipher: await seal(verifier, cipherKey, uid), time_zone: zone, workspace_ids: ids }))
   const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
   url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state, code_challenge: await hash(verifier), code_challenge_method: 'S256' }).toString()
   return json({ url: url.href })
  }
  if (body.action === 'finish') {
   if (connection) throw Error('already_connected')
   if (typeof body.state !== 'string' || body.state.length > 200 || typeof body.code !== 'string' || body.code.length > 4096) throw Error('invalid_state')
   const state = check(await admin.from('google_calendar_oauth_states').delete().eq('state_hash', await hash(body.state)).eq('user_id', uid).eq('session_id', sessionId).gt('expires_at', new Date().toISOString()).select('*').maybeSingle()).data
   if (!state) throw Error('invalid_state')
   const token = await tokenCall({ grant_type: 'authorization_code', code: body.code, redirect_uri: redirect, code_verifier: await unseal(state.verifier_cipher, cipherKey, uid) })
   if (!token.refresh_token || !token.scope?.split(' ').includes(SCOPE)) throw Error('google_permission_denied')
   check(await admin.from('google_calendar_connections').insert({ user_id: uid, refresh_cipher: await seal(token.refresh_token, cipherKey, uid), workspace_ids: state.workspace_ids, time_zone: state.time_zone }))
   return json({ connected: true, status: 'pending' })
  }
  if (!connection) throw Error('not_connected')
  lease = crypto.randomUUID()
  if (!check(await admin.rpc('google_calendar_claim', { p_user: uid, p_lease: lease, p_generation: connection.generation })).data) { lease = ''; throw Error('sync_busy') }
  const renew = async () => {
   const r = check(await admin!.from('google_calendar_connections').update({ lease_until: new Date(Date.now() + 120_000).toISOString() }).eq('user_id', uid).eq('generation', connection.generation).eq('lease_id', lease).gt('lease_until', new Date().toISOString()).select('user_id').maybeSingle())
   if (!r.data) throw Error('lease_lost')
  }
  if (body.action === 'disconnect') {
   const refresh = await unseal(connection.refresh_cipher, cipherKey, uid)
   let revoked = false
   try { const r = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refresh }), signal: AbortSignal.timeout(10_000) }); revoked = r.ok } catch { /* local credentials are still removed */ }
   check(await admin.from('google_calendar_connections').delete().eq('user_id', uid).eq('lease_id', lease))
   check(await admin.from('google_calendar_oauth_states').delete().eq('user_id', uid))
   return json({ connected: false, revoked, calendar_preserved: true })
  }
  if (body.action !== 'sync') throw Error('invalid_action')
  if (connection.status === 'calendar_creation_uncertain') throw Error('calendar_creation_uncertain')
  const started = Date.now()
  let access = (await tokenCall({ grant_type: 'refresh_token', refresh_token: await unseal(connection.refresh_cipher, cipherKey, uid) })).access_token
  const google = async (path: string, method = 'GET', data?: unknown, etag?: string) => {
   await renew()
   for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, { method, headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}) }, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(10_000) })
    if (r.status === 401 && attempt === 0) { access = (await tokenCall({ grant_type: 'refresh_token', refresh_token: await unseal(connection.refresh_cipher, cipherKey, uid) })).access_token; continue }
    if ((r.status === 429 || r.status >= 500) && method !== 'POST' && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt + Math.random() * 200)); continue }
    if (r.status === 403) throw Error('google_permission_denied')
    if (r.status === 429 || r.status >= 500) throw Error('google_retry_later')
    return r
   }
   throw Error('google_failed')
  }
  let calendar = connection.calendar_id
  if (!calendar) {
   calendarUncertain = true
   // Calendar insertion has no idempotency key. Persist uncertainty BEFORE the
   // request; a lost response must never silently create another calendar.
   check(await admin.from('google_calendar_connections').update({ status: 'calendar_creation_uncertain', last_error: 'calendar_creation_uncertain' }).eq('user_id', uid).eq('lease_id', lease).eq('generation', connection.generation))
   const r = await google('calendars', 'POST', { summary: 'Huddle', timeZone: connection.time_zone, description: 'Managed by Huddle. One-way sync; edit events in Huddle.' }).catch(() => { throw Error('calendar_creation_uncertain') })
   if (!r.ok) throw Error('calendar_creation_uncertain')
   calendar = (await r.json()).id
   if (!calendar) throw Error('calendar_creation_uncertain')
   check(await admin.from('google_calendar_connections').update({ calendar_id: calendar, status: 'syncing', last_error: null }).eq('user_id', uid).eq('lease_id', lease).eq('generation', connection.generation))
   calendarUncertain = false
  }
  const snapshot = check(await admin.rpc('google_calendar_snapshot', { p_user: uid })).data
  const { events, from, to } = desiredEvents(snapshot, connection)
  const mappings = new Map<string, any>(snapshot.mappings.map((x: any) => [x.source_key, x]))
  const signature = await hash(JSON.stringify([body.resolve_conflicts === true,[...events.entries()].sort(([a],[b])=>a.localeCompare(b))]))
  const continuing = connection.sync_signature === signature
  const cursor = continuing ? connection.sync_cursor || '' : ''
  const keys = [...new Set<string>([...events.keys(), ...mappings.keys()])].sort().filter(key => key > cursor)
  let processed = 0, conflicts = continuing ? connection.sync_conflicts : 0, changed = 0, remaining = 0
  const checkpoint = async (key: string) => { check(await admin!.from('google_calendar_connections').update({ sync_cursor: key, sync_signature: signature, sync_conflicts: conflicts }).eq('user_id', uid).eq('lease_id', lease)) }
  for (const key of keys) {
   if (Date.now() - started > 40_000 || processed >= 80) { remaining++; continue }
   processed++
   const desired = events.get(key)
   let mapping = mappings.get(key)
   if (!mapping) {
    mapping = { user_id: uid, source_key: key, event_id: await eventId(`${uid}:${connection.generation}:${key}`), payload: null, etag: null }
    check(await admin.from('google_calendar_event_mappings').insert(mapping))
   }
   let path = `calendars/${encodeURIComponent(calendar)}/events/${mapping.event_id}`
   let r = await google(path), remote: any = null
   if (r.ok) remote = await r.json()
   else if (![404, 410].includes(r.status)) throw Error('google_failed')
   const removedInGoogle = r.status === 410 || remote?.status === 'cancelled' || (r.status === 404 && !!mapping.payload)
   if (remote?.status === 'cancelled') remote = null
   if (desired && removedInGoogle) {
    if (body.resolve_conflicts !== true) { conflicts++; await checkpoint(key); continue }
    mapping.event_id = await eventId(`${mapping.event_id}:restore`)
    check(await admin.from('google_calendar_event_mappings').update({ event_id: mapping.event_id, payload: null, etag: null }).eq('user_id', uid).eq('source_key', key))
    path = `calendars/${encodeURIComponent(calendar)}/events/${mapping.event_id}`
    remote = null
   }
   if (remote && (!mapping.payload || !sameEvent(remote, mapping.payload)) && !(desired && sameEvent(remote, desired)) && body.resolve_conflicts !== true) { conflicts++; await checkpoint(key); continue }
   if (!desired) {
    if (remote) { r = await google(`${path}?sendUpdates=none`, 'DELETE', undefined, remote.etag); if (r.status === 412) { conflicts++; await checkpoint(key); continue } if (!r.ok && ![404, 410].includes(r.status)) throw Error('google_failed') }
    check(await admin.from('google_calendar_event_mappings').delete().eq('user_id', uid).eq('source_key', key)); changed++; await checkpoint(key); continue
   }
   if (!remote || !sameEvent(remote, desired)) {
    const payload = { ...desired, extendedProperties: { private: { huddleSource: key } } }
    r = remote ? await google(`${path}?sendUpdates=none`, 'PUT', payload, remote.etag) : await google(`calendars/${encodeURIComponent(calendar)}/events?sendUpdates=none`, 'POST', { ...payload, id: mapping.event_id })
    if ([409, 412].includes(r.status)) { throw Error('google_retry_later') }
    if (!r.ok) throw Error('google_failed')
    remote = await r.json(); changed++
   }
   check(await admin.from('google_calendar_event_mappings').update({ payload: desired, etag: remote.etag }).eq('user_id', uid).eq('source_key', key))
   await checkpoint(key)
  }
  const status = conflicts ? 'conflict' : remaining ? 'partial' : 'connected'
  check(await admin.from('google_calendar_connections').update({ status, ...(!remaining ? { sync_cursor: null, sync_signature: null, sync_conflicts: 0 } : {}), last_error: conflicts ? 'google_conflict' : null, ...(!remaining && !conflicts ? { last_synced_at: new Date().toISOString() } : {}) }).eq('user_id', uid).eq('lease_id', lease))
  return json({ status, processed, changed, conflicts, remaining, from, to })
 } catch (error) {
  const code = calendarUncertain ? 'calendar_creation_uncertain' : error instanceof Error && safeErrors.has(error.message) ? error.message : 'integration_failed'
  if (admin && uid && lease) await admin.from('google_calendar_connections').update({ status: code === 'reauth_required' ? 'reauth_required' : code === 'calendar_creation_uncertain' ? 'calendar_creation_uncertain' : 'partial', last_error: code }).eq('user_id', uid).eq('lease_id', lease)
  return json({ error: code }, code === 'not_configured' ? 503 : code === 'sync_busy' ? 409 : 400)
 } finally {
  if (admin && uid && lease) await admin.from('google_calendar_connections').update({ lease_id: null, lease_until: null }).eq('user_id', uid).eq('lease_id', lease)
 }
}
Deno.serve(handler)
