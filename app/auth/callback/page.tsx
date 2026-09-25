'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { completeDesktopOAuth } from '@/lib/auth/desktop-oauth'
import { completeWebOAuth } from '@/lib/auth/web-oauth-callback'
import { pendingMeetingPath } from '@/lib/auth/meeting-return'
import { PENDING_SHARE_INVITE_KEY } from '@/hooks/use-calendar-sharing'

// Client-side OAuth/PKCE callback. Replaces the former server route handler
// (app/auth/callback/route.ts) so the page survives `output: 'export'` and
// works identically on web and inside the Capacitor WebView.
//
// The callback owns PKCE exchange; SDK URL auto-detection is disabled here.
function Callback() {
  const [failure, setFailure] = useState<string | null>(null)
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
    // Only allow same-origin relative paths to guard against open redirect
    // (e.g. ?next=https://evil.com or //evil.com). Anything else falls back to '/'.
    const raw = searchParams.get('next') || '/'
    const next = raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/'
    const code = searchParams.get('code')

    // A stalled network or auth lock must leave a usable way back to login.
    let timedOut = false
    const timer = window.setTimeout(() => {
      timedOut = true
      if (!cancelled) setFailure('登入連線逾時，請返回登入頁重試。')
    }, 20000)
    async function finish() {
      if (searchParams.get('desktop_return') === '1') {
        const success = !searchParams.get('error') && await completeDesktopOAuth(code || '', searchParams.get('desktop_state') || '')
        if (cancelled || timedOut) return
        window.history.replaceState(null, '', '/auth/callback')
        window.clearTimeout(timer)
        if (success) router.replace(pendingMeetingPath() || '/')
        else setFailure('無法完成桌面登入，請返回桌面程式重新登入。')
        return
      }
      const success = !searchParams.get('error') && await completeWebOAuth(code || '')
      if (cancelled || timedOut) return
      window.clearTimeout(timer)
      if (!success) {
        setFailure(searchParams.get('error') === 'access_denied'
          ? '登入已取消，請返回登入頁重新選擇登入方式。'
          : '登入連結已失效，或登入驗證未完成。請使用原本的瀏覽器重新登入。')
        return
      }
      // Same share-invite handoff as the email-login path: the fragment
      // token doesn't survive the OAuth round-trip, so it was stashed in
      // sessionStorage before leaving for the provider.
      const pendingInvite = window.sessionStorage.getItem(PENDING_SHARE_INVITE_KEY)
      router.replace(pendingMeetingPath() || (pendingInvite ? '/share/invite' : next))
    }

    finish()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [router, searchParams])

  // A full document navigation releases a stuck SDK instance / navigator lock.
  // Client-side routing would retain the singleton that timed out.
  if (failure) return <div role="alert" className="min-h-screen flex flex-col gap-4 items-center justify-center p-6 text-center">
    <h1 className="text-xl font-semibold">登入未完成</h1>
    <p className="max-w-md text-muted-foreground">{failure}</p>
    <a className="rounded-xl bg-primary text-primary-foreground px-6 py-3" href="/login">返回登入頁</a>
  </div>
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
