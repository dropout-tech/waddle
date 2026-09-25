import { createBrowserClient } from '@supabase/ssr'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { isNative, isDesktop } from '@/lib/platform'
import { createCapacitorStorage } from './capacitor-storage'

// Single shared browser client. Many call sites (use-waddle-data, user-menu,
// auth-provider, login/signup) call createClient(); memoizing avoids spinning
// up duplicate `onAuthStateChange` listeners and duplicate storage adapters
// now that client-side auth is the single source of truth.
let client: SupabaseClient<Database> | undefined

export function createClient() {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (isNative()) {
    // Native (Capacitor) shell: persist the session in @capacitor/preferences,
    // use PKCE, and let the deep-link handler complete OAuth (so the client
    // should NOT try to detect a code in the WebView's URL). Use supabase-js
    // directly: @supabase/ssr's createBrowserClient always overrides
    // `auth.storage` with document.cookie, which does not persist in the
    // capacitor:// WKWebView — the PKCE verifier was lost and Google sign-in
    // bounced back to the login page.
    client = createSupabaseClient<Database>(url, anonKey, {
      auth: {
        storage: createCapacitorStorage(),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  } else {
    // /auth/callback owns its one-use PKCE exchange. Other routes retain URL
    // detection (including password recovery / email auth links).
    client = createBrowserClient<Database>(url, anonKey, { auth: {
      flowType: 'pkce',
      detectSessionInUrl: !(isDesktop() || (typeof window !== 'undefined' && window.location.pathname === '/auth/callback')),
    } })
  }

  return client
}
