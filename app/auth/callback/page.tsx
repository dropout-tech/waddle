'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Client-side OAuth/PKCE callback. Replaces the former server route handler
// (app/auth/callback/route.ts) so the page survives `output: 'export'` and
// works identically on web and inside the Capacitor WebView.
//
// The browser Supabase client (createBrowserClient) auto-detects the `?code=`
// in the URL and exchanges it for a session. We also call exchangeCodeForSession
// explicitly for determinism; if the auto-detect already consumed the code our
// manual call errors harmlessly and we fall through to the getSession check.
function Callback() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    // Only allow same-origin relative paths to guard against open redirect
    // (e.g. ?next=https://evil.com or //evil.com). Anything else falls back to '/'.
    const raw = searchParams.get('next') || '/'
    const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
    const code = searchParams.get('code')

    async function finish() {
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code)
        } catch {
          /* code may already be consumed by detectSessionInUrl — ignore */
        }
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      router.replace(session ? next : '/login?error=auth_callback_failed')
    }

    finish()
    return () => { cancelled = true }
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <Callback />
    </Suspense>
  )
}
