'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { completeDesktopOAuth } from '@/lib/auth/desktop-oauth'
import { createClient } from '@/lib/supabase/client'
import { PENDING_SHARE_INVITE_KEY } from '@/hooks/use-calendar-sharing'

// Client-side OAuth/PKCE callback. Replaces the former server route handler
// (app/auth/callback/route.ts) so the page survives `output: 'export'` and
// works identically on web and inside the Capacitor WebView.
//
// The browser Supabase client (createBrowserClient) auto-detects the `?code=`
// in the URL and exchanges it for a session. We also call exchangeCodeForSession
// explicitly for determinism; if the auto-detect already consumed the code our
// manual call errors harmlessly and we fall through to the getSession check.
function Callback() {
  const [desktopLink, setDesktopLink] = useState<string | null>(null)
  const [desktopError, setDesktopError] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    let cancelled = false
    // External browser is only a relay: never consume the desktop PKCE code here.
    if (searchParams.get('desktop') === '1') {
      const state = searchParams.get('desktop_state') || ''
      const code = searchParams.get('code')
      if (!/^[a-f0-9]{64}$/.test(state) || (!code && !searchParams.get('error'))) { setDesktopError(true); return }
      const link = new URL('huddle-desktop://auth/callback')
      link.searchParams.set('state', state)
      if (code) link.searchParams.set('code', code)
      else link.searchParams.set('error', 'oauth_failed')
      setDesktopLink(link.href)
      // A deliberate click avoids blocked automatic custom-protocol navigation.
      return
    }
    const supabase = createClient()
    // Only allow same-origin relative paths to guard against open redirect
    // (e.g. ?next=https://evil.com or //evil.com). Anything else falls back to '/'.
    const raw = searchParams.get('next') || '/'
    const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
    const code = searchParams.get('code')

    async function finish() {
      if (searchParams.get('desktop_return') === '1') {
        const success = !searchParams.get('error') && await completeDesktopOAuth(code || '', searchParams.get('desktop_state') || '')
        if (cancelled) return
        window.history.replaceState(null, '', '/auth/callback')
        router.replace(success ? '/' : '/login?error=auth_callback_failed')
        return
      }
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code)
        } catch {
          /* code may already be consumed by detectSessionInUrl — ignore */
        }
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) {
        router.replace('/login?error=auth_callback_failed')
        return
      }
      // Same share-invite handoff as the email-login path: the fragment
      // token doesn't survive the OAuth round-trip, so it was stashed in
      // sessionStorage before leaving for the provider.
      const pendingInvite = window.sessionStorage.getItem(PENDING_SHARE_INVITE_KEY)
      router.replace(pendingInvite ? '/share/invite' : next)
    }

    finish()
    return () => { cancelled = true }
  }, [router, searchParams])

  if (desktopLink || desktopError) return <div className="min-h-screen flex flex-col gap-4 items-center justify-center p-6 text-center">
    <h1 className="text-xl font-semibold">{desktopError ? '登入連結已失效' : '返回 Huddle 完成登入'}</h1>
    <p>{desktopError ? '請回到桌面程式重新登入。' : '點擊下方按鈕，並允許瀏覽器開啟 Huddle。'}</p>
    {desktopLink && <a className="rounded-xl bg-primary text-primary-foreground px-6 py-3" href={desktopLink}>開啟 Huddle</a>}
  </div>
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
