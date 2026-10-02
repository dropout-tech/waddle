import { createClient } from '@/lib/supabase/client'
import { t } from '@/lib/i18n'

// Google sign-in without the <project>.supabase.co hop. Google shows the
// redirect target's domain on its account chooser, so instead of letting
// Supabase run the OAuth redirect we obtain a Google ID token ourselves and
// hand it to supabase.auth.signInWithIdToken:
//   - web: OpenID Connect implicit redirect (response_type=id_token) back to
//     <origin>/auth/google, so the chooser shows huddle.lazy72.com;
//   - iOS: the native GoogleSignIn sheet (@capgo/capacitor-social-login).
// Nonce rule (both paths): Google receives sha256(raw) in hex, Supabase
// receives the raw value and re-hashes it to compare with the token claim.
// Desktop keeps the PKCE relay in desktop-oauth.ts (no token may cross apps).

/** Web OAuth client (also the one configured on the Supabase Google provider). */
export const GOOGLE_WEB_CLIENT_ID = '507405611281-d0pmotl6m8psngfm8v6c0p6upi5mtubl.apps.googleusercontent.com'

/**
 * iOS OAuth client (Google Cloud → Clients → iOS, bundle com.lazylazy.huddle).
 * Empty = native app keeps the old system-browser flow. When filling it in,
 * also add its reversed form as a URL scheme in ios/App/App/Info.plist and
 * list it under the Supabase Google provider's additional client IDs.
 */
export const GOOGLE_IOS_CLIENT_ID = ''

export const GOOGLE_WEB_CALLBACK_PATH = '/auth/google'
const PENDING_KEY = 'huddle-google-idtoken-pending'
const PENDING_TTL_MS = 10 * 60 * 1000

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

/** Web: leave for Google's account chooser; /auth/google finishes the sign-in. */
export async function startGoogleWebLogin(): Promise<void> {
  const nonce = randomHex(32)
  const state = randomHex(32)
  window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ nonce, state, expires: Date.now() + PENDING_TTL_MS }))
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', GOOGLE_WEB_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${window.location.origin}${GOOGLE_WEB_CALLBACK_PATH}`)
  url.searchParams.set('response_type', 'id_token')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('nonce', await sha256Hex(nonce))
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  window.location.assign(url.href)
}

export type GoogleWebResult = 'ok' | 'cancelled' | 'failed'

// React Strict Mode mounts the callback twice; the pending record is
// single-use, so both mounts must share one exchange.
let inflight: Promise<GoogleWebResult> | undefined

/**
 * Web: finish the redirect. `fragment` is location.hash captured before the
 * caller scrubbed it from the address bar (it carries the ID token).
 */
export function completeGoogleWebLogin(fragment: string): Promise<GoogleWebResult> {
  if (inflight) return inflight
  inflight = (async (): Promise<GoogleWebResult> => {
    const params = new URLSearchParams(fragment.replace(/^#/, ''))
    let pending: { nonce?: string; state?: string; expires?: number } | null = null
    try { pending = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) || 'null') } catch {}
    window.sessionStorage.removeItem(PENDING_KEY)
    // state must match the value this tab generated; anything else is a
    // replayed or forged response and is ignored.
    if (!pending?.nonce || !pending.state || (pending.expires ?? 0) < Date.now()) return 'failed'
    if (params.get('state') !== pending.state) return 'failed'
    if (params.get('error')) return params.get('error') === 'access_denied' ? 'cancelled' : 'failed'
    const token = params.get('id_token')
    if (!token) return 'failed'
    const { data, error } = await createClient().auth.signInWithIdToken({ provider: 'google', token, nonce: pending.nonce })
    return !error && data.session ? 'ok' : 'failed'
  })().catch((): GoogleWebResult => 'failed')
  return inflight
}

/** iOS: native Google sheet → ID token → Supabase session (resolves inline). */
export async function nativeGoogleLogin(): Promise<void> {
  const { SocialLogin } = await import('@capgo/capacitor-social-login')
  await SocialLogin.initialize({
    google: { iOSClientId: GOOGLE_IOS_CLIENT_ID, iOSServerClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' },
  })
  const nonce = randomHex(32)
  const res = await SocialLogin.login({
    provider: 'google',
    options: { scopes: ['email', 'profile'], nonce: await sha256Hex(nonce) },
  }).catch((err: unknown) => {
    // Closing the Google sheet is a normal choice, not an error to report raw.
    if (/cancel/i.test(err instanceof Error ? err.message : String(err))) throw new Error(t('已取消 Google 登入'))
    throw err
  })
  const token = res.result.responseType === 'online' ? res.result.idToken : null
  if (!token) throw new Error(t('Google 登入未取得憑證'))
  const { error } = await createClient().auth.signInWithIdToken({ provider: 'google', token, nonce })
  if (error) throw error
}
