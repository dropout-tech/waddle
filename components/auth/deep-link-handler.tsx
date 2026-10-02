'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { pendingMeetingPath } from '@/lib/auth/meeting-return'
import { orgInviteTokenFromUrl, pendingOrgInvitePath, savePendingOrgInvite } from '@/lib/pending-org-invite'
import { createClient } from '@/lib/supabase/client'
import { isNative } from '@/lib/platform'

/**
 * Completes native OAuth. When the system browser redirects back to
 * `huddle://auth/callback?code=...`, Capacitor fires `appUrlOpen`; we pull the
 * PKCE code, exchange it for a session, close the browser, and route home.
 * No-op on web (there the /auth/callback page handles it). Mounted app-wide via
 * AuthProvider so it catches the deep link regardless of the current route.
 *
 * Also opens org invites: a tapped https://huddle.lazy72.com/org/invite#t=…
 * (Universal Link, see public/.well-known/apple-app-site-association) or the
 * web page's 「用 Huddle App 開啟」 huddle://org/invite#t=… link. The token is
 * parked like any pending invite so the login round trip keeps it.
 */
export function DeepLinkHandler() {
  const router = useRouter()

  useEffect(() => {
    if (!isNative()) return

    let remove: (() => void) | undefined
    const supabase = createClient()

    import('@capacitor/app').then(({ App }) => {
      App.addListener('appUrlOpen', async ({ url }) => {
        const inviteToken = orgInviteTokenFromUrl(url)
        if (inviteToken) {
          savePendingOrgInvite(inviteToken)
          // Already on the invite page (another link tapped): it only reads
          // the token on mount, so reload it instead of a no-op push.
          if (window.location.pathname.replace(/\/+$/, '') === '/org/invite') window.location.reload()
          else router.push('/org/invite')
          return
        }
        if (!url.includes('auth/callback')) return
        try {
          const code = new URL(url).searchParams.get('code')
          if (code) await supabase.auth.exchangeCodeForSession(code)
          const { Browser } = await import('@capacitor/browser')
          await Browser.close().catch(() => {})
          router.replace(pendingMeetingPath() || pendingOrgInvitePath() || '/')
        } catch {
          router.replace('/login?error=auth_callback_failed')
        }
      }).then((handle) => {
        remove = () => handle.remove()
      })
    })

    return () => {
      remove?.()
    }
  }, [router])

  return null
}
