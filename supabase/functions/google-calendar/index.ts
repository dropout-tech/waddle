// Google Calendar — READ-ONLY integration.
//
// Actions (POST JSON { action, ... }, user JWT in Authorization):
//   status          → { configured, connected, status, share_busy }
//   start           → { url }  Google consent URL (PKCE S256, state stored hashed, 10 min);
//                     403 { error: 'PRO_REQUIRED' } when the Pro limits switch is on and the
//                     caller is neither Pro nor grandfathered
//   finish          → { connected: true }  one-time state, bound to user + JWT session_id
//   disconnect      → { connected: false, revoked }
//   set_share_busy  → { share_busy }
//   events          → { status, events[] }  caller's primary calendar, [time_min, time_max) ≤ 120 days
//   busy            → { busy: [{user_id, start, end}], unavailable: [user_id] }  free-slot search
//
// Event content is never written to the database — it is fetched from Google
// per request and returned in memory only. The only secret at rest is the
// AES-GCM sealed refresh token (key GOOGLE_CALENDAR_TOKEN_KEY never in the DB).
//
// `busy` is the one cross-user read: for a share partner the caller is
// authorised to schedule with (same rule as the 約交集 search: a calendar
// share + a grant from that partner), it reads the PARTNER's primary calendar
// with the PARTNER's own Google grant (only if they left share_busy on) and
// returns start/end pairs only — never a title, place, link or event id.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.105.1'
import { SCOPE, MAX_PAGES, PAGE_SIZE, MAX_BUSY_PEOPLE, b64, hash, seal, unseal, parseRange, parseBusyRange, normalizeEvents, normalizeBusy } from './core.mjs'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const env = (key: string) => Deno.env.get(key) || ''
const safeErrors = new Set(['not_configured', 'already_connected', 'invalid_state', 'not_connected', 'reauth_required', 'google_permission_denied', 'google_retry_later', 'google_failed', 'invalid_range', 'invalid_peers', 'invalid_action', 'database_failed', 'configuration_invalid'])
const EVENT_FIELDS = 'nextPageToken,items(id,status,eventType,summary,location,htmlLink,start,end,attendees(self,responseStatus))'
// Busy reads never even ask Google for titles, places, links or ids.
const BUSY_FIELDS = 'nextPageToken,items(status,eventType,transparency,start,end,attendees(self,responseStatus))'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Connection = { user_id: string; refresh_cipher: string; status: string; share_busy: boolean }

export async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  try {
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'unauthorized' }, 401)
    const admin: SupabaseClient = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: auth, error: authError } = await admin.auth.getUser(jwt)
    if (authError || !auth.user || auth.user.is_anonymous) return json({ error: 'unauthorized' }, 401)
    const uid = auth.user.id
    let sessionId = ''
    try { sessionId = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id } catch { /* rejected below */ }
    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: 'unauthorized' }, 401)
    // Service role bypasses RLS: refuse suspended accounts up front (fails closed).
    const { data: allowed, error: accessError } = await admin.rpc('account_access_allowed', { p_user: uid })
    if (accessError) return json({ error: 'database_failed' }, 503)
    if (allowed !== true) return json({ error: 'account_suspended' }, 403)

    const body = await req.json().catch(() => ({}))
    const clientId = env('GOOGLE_CALENDAR_CLIENT_ID'), secret = env('GOOGLE_CALENDAR_CLIENT_SECRET'), cipherKey = env('GOOGLE_CALENDAR_TOKEN_KEY'), redirectList = env('GOOGLE_CALENDAR_REDIRECT_URI')
    // GOOGLE_CALENDAR_REDIRECT_URI is one https callback URL, or several separated by commas
    // (one per site origin). EVERY entry must be well formed, else the feature stays off.
    const redirects = redirectList.split(',').map((u) => u.trim())
    // All four present (and sane redirects) is also the feature switch.
    const configured = !!(clientId && secret && cipherKey && redirects.every((u) => /^https:\/\/[^?#]+\/settings\/google-calendar\/callback\/?$/.test(u)))
    // start and finish MUST resolve to the same entry (Google compares redirect_uri verbatim),
    // so both go through this one picker. It only ever returns an entry of the secret's list:
    // the Origin header selects, it is never copied into the URL. Unknown/absent Origin → first.
    const origin = req.headers.get('Origin') || ''
    const redirect = (/^https:\/\/[^/?#]+$/.test(origin) && redirects.find((u) => u.startsWith(origin + '/'))) || redirects[0]
    const check = <T extends { error: unknown }>(r: T) => { if (r.error) throw Error('database_failed'); return r }
    const COLUMNS = 'user_id,refresh_cipher,status,share_busy'
    const { data: connection } = check(await admin.from('google_calendar_connections').select(COLUMNS).eq('user_id', uid).maybeSingle()) as { data: Connection | null }
    if (body.action === 'status') return json({ configured, connected: !!connection, status: connection?.status || 'disconnected', share_busy: connection ? connection.share_busy !== false : null })
    if (!configured) throw Error('not_configured')

    const tokenCall = async (params: Record<string, string>) => {
      const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, ...params }), signal: AbortSignal.timeout(10_000) })
      const t = await r.json().catch(() => ({}))
      if (!r.ok) throw Error(t.error === 'invalid_grant' ? 'reauth_required' : 'google_failed')
      return t
    }
    // Read one user's primary calendar with THAT user's grant (AAD = that user id).
    const listPrimary = async (conn: Connection, range: { timeMin: string; timeMax: string }, fields: string) => {
      const refreshAccess = async () => (await tokenCall({ grant_type: 'refresh_token', refresh_token: await unseal(conn.refresh_cipher, cipherKey, conn.user_id) })).access_token as string
      let access = await refreshAccess()
      const google = async (url: string) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const r = await fetch(url, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(10_000) })
          if (r.status === 401 && attempt === 0) { access = await refreshAccess(); continue }
          if (r.status === 401) throw Error('reauth_required')
          let limited = r.status === 429 || r.status >= 500
          if (r.status === 403) {
            const reason = JSON.stringify((await r.clone().json().catch(() => ({})))?.error?.errors ?? '')
            if (!/rateLimitExceeded/i.test(reason)) throw Error('google_permission_denied')
            limited = true
          }
          if (limited && attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt + Math.random() * 200)); continue }
          if (limited) throw Error('google_retry_later')
          if (!r.ok) throw Error('google_failed')
          return r.json()
        }
        throw Error('google_failed')
      }
      const items: unknown[] = []
      let pageToken = '', truncated = false
      for (let page = 0; ; page++) {
        if (page >= MAX_PAGES) { truncated = true; break }
        const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
        url.search = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin: range.timeMin, timeMax: range.timeMax, maxResults: String(PAGE_SIZE), fields, ...(pageToken ? { pageToken } : {}) }).toString()
        const data = await google(url.href)
        items.push(...(Array.isArray(data?.items) ? data.items : []))
        pageToken = typeof data?.nextPageToken === 'string' ? data.nextPageToken : ''
        if (!pageToken) break
      }
      return { items, truncated }
    }
    const markReauth = async (userId: string) => {
      check(await admin.from('google_calendar_connections').update({ status: 'reauth_required', last_error: 'reauth_required', updated_at: new Date().toISOString() }).eq('user_id', userId))
    }
    // A connection that needs re-authorisation may run the OAuth flow again.
    const reconnecting = connection?.status === 'reauth_required'

    if (body.action === 'start') {
      if (connection && !reconnecting) throw Error('already_connected')
      // Pro feature once the Pro limits switch is on; members who linked while
      // it was off are grandfathered (20261001200000_pro_limits.sql). Linked
      // members' events/busy reads are never gated — only starting a link.
      const { data: mayLink, error: planError } = await admin.rpc('google_calendar_connect_allowed', { p_user: uid })
      if (planError) throw Error('database_failed')
      if (mayLink !== true) return json({ error: 'PRO_REQUIRED' }, 403)
      const state = b64(crypto.getRandomValues(new Uint8Array(32))), verifier = b64(crypto.getRandomValues(new Uint8Array(32)))
      check(await admin.from('google_calendar_oauth_states').delete().eq('user_id', uid))
      check(await admin.from('google_calendar_oauth_states').delete().lt('expires_at', new Date().toISOString()))
      check(await admin.from('google_calendar_oauth_states').insert({ state_hash: await hash(state), user_id: uid, session_id: sessionId, verifier_cipher: await seal(verifier, cipherKey, uid) }))
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state, code_challenge: await hash(verifier), code_challenge_method: 'S256' }).toString()
      return json({ url: url.href })
    }

    if (body.action === 'finish') {
      if (connection && !reconnecting) throw Error('already_connected')
      if (typeof body.state !== 'string' || body.state.length > 200 || typeof body.code !== 'string' || body.code.length > 4096) throw Error('invalid_state')
      // Delete-returning = one-time consumption; expired / other user / other session never match.
      const state = check(await admin.from('google_calendar_oauth_states').delete().eq('state_hash', await hash(body.state)).eq('user_id', uid).eq('session_id', sessionId).gt('expires_at', new Date().toISOString()).select('verifier_cipher').maybeSingle()).data
      if (!state) throw Error('invalid_state')
      const token = await tokenCall({ grant_type: 'authorization_code', code: body.code, redirect_uri: redirect, code_verifier: await unseal(state.verifier_cipher, cipherKey, uid) }).catch((e) => { throw Error(e.message === 'reauth_required' ? 'invalid_state' : e.message) })
      const granted = typeof token.scope === 'string' ? token.scope.split(' ') : []
      if (!token.refresh_token || !granted.includes(SCOPE)) {
        // Unusable grant (scope unticked on the consent screen): give it back.
        if (token.access_token) await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: token.access_token }), signal: AbortSignal.timeout(10_000) }).catch(() => {})
        throw Error('google_permission_denied')
      }
      check(await admin.from('google_calendar_connections').upsert({ user_id: uid, refresh_cipher: await seal(token.refresh_token, cipherKey, uid), scope: SCOPE, status: 'connected', last_error: null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }))
      return json({ connected: true, status: 'connected' })
    }

    if (body.action === 'busy') {
      // Strict window (not the 120-day `events` rule): no history, ≤ ~3 months
      // ahead, ≤ 16 days wide — a partner cannot page through a whole calendar.
      const range = parseBusyRange(body.time_min, body.time_max)
      const ids = body.peer_ids
      if (!Array.isArray(ids) || !ids.length || ids.length > MAX_BUSY_PEOPLE || ids.some((x: unknown) => typeof x !== 'string' || !UUID.test(x))) throw Error('invalid_peers')
      const requested = [...new Set(ids.map((x: string) => x.toLowerCase()))] as string[]
      const allowedIds = requested.includes(uid) ? [uid] : []
      const others = requested.filter((id) => id !== uid)
      if (others.length) {
        // Authorise with the CALLER's JWT (RLS + get_share_peers), exactly the
        // rule the 約交集 search applies: a share exists AND that partner
        // granted something on that share. Anyone else is silently ignored.
        const asCaller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false } })
        const shareOf = new Map<string, string>()
        for (let page = 0; page < 10; page++) {
          const rows = check(await asCaller.rpc('get_share_peers').order('peer_id').range(page * 1000, page * 1000 + 999)).data as { share_id: string; peer_id: string }[] | null
          for (const r of rows ?? []) shareOf.set(String(r.peer_id).toLowerCase(), String(r.share_id))
          if (!rows || rows.length < 1000) break
        }
        const candidates = others.filter((id) => shareOf.has(id))
        if (candidates.length) {
          const grants = check(await asCaller.from('calendar_share_grants').select('share_id,owner_id').in('owner_id', candidates).limit(5000)).data as { share_id: string; owner_id: string }[] | null
          for (const id of candidates) if ((grants ?? []).some((g) => String(g.owner_id).toLowerCase() === id && String(g.share_id) === shareOf.get(id))) allowedIds.push(id)
        }
      }
      if (!allowedIds.length) return json({ busy: [], unavailable: [] })
      const conns = (check(await admin.from('google_calendar_connections').select(COLUMNS).in('user_id', allowedIds)).data ?? []) as Connection[]
      // The caller's own meetings always count; a partner's only with share_busy on.
      const included = conns.filter((c) => c.user_id === uid || c.share_busy === true)
      const unavailable = included.filter((c) => c.status !== 'connected').map((c) => c.user_id)
      const results = await Promise.all(included.filter((c) => c.status === 'connected').map(async (c) => {
        try {
          const { items, truncated } = await listPrimary(c, range, BUSY_FIELDS)
          if (truncated) unavailable.push(c.user_id)
          return normalizeBusy(items).map((b: { start: string; end: string }) => ({ user_id: c.user_id, start: b.start, end: b.end }))
        } catch (error) {
          // One partner's broken grant must never fail the whole search.
          if (error instanceof Error && error.message === 'reauth_required') await markReauth(c.user_id).catch(() => {})
          unavailable.push(c.user_id)
          return []
        }
      }))
      return json({ busy: results.flat(), unavailable })
    }

    if (!connection) throw Error('not_connected')

    if (body.action === 'set_share_busy') {
      if (typeof body.value !== 'boolean') throw Error('invalid_action')
      check(await admin.from('google_calendar_connections').update({ share_busy: body.value, updated_at: new Date().toISOString() }).eq('user_id', uid))
      return json({ share_busy: body.value })
    }

    if (body.action === 'disconnect') {
      let revoked = false
      try {
        const refresh = await unseal(connection.refresh_cipher, cipherKey, uid)
        const r = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refresh }), signal: AbortSignal.timeout(10_000) })
        revoked = r.ok
      } catch { /* the local credential is still forgotten below */ }
      check(await admin.from('google_calendar_connections').delete().eq('user_id', uid))
      check(await admin.from('google_calendar_oauth_states').delete().eq('user_id', uid))
      return json({ connected: false, revoked })
    }

    if (body.action !== 'events') throw Error('invalid_action')
    const range = parseRange(body.time_min, body.time_max)
    if (reconnecting) return json({ status: 'reauth_required', events: [] })
    try {
      const { items, truncated } = await listPrimary(connection, range, EVENT_FIELDS)
      if (connection.status !== 'connected') check(await admin.from('google_calendar_connections').update({ status: 'connected', last_error: null, updated_at: new Date().toISOString() }).eq('user_id', uid))
      return json({ status: 'connected', events: normalizeEvents(items), truncated })
    } catch (error) {
      if (error instanceof Error && error.message === 'reauth_required') {
        await markReauth(uid)
        return json({ status: 'reauth_required', events: [] })
      }
      throw error
    }
  } catch (error) {
    const code = error instanceof Error && safeErrors.has(error.message) ? error.message : 'integration_failed'
    return json({ error: code }, code === 'not_configured' ? 503 : code === 'google_retry_later' ? 503 : 400)
  }
}
Deno.serve(handler)
