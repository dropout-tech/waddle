'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isNative } from '@/lib/platform'

/**
 * Completes native OAuth. When the system browser redirects back to
 * `huddle://auth/callback?code=...`, Capacitor fires `appUrlOpen`; we pull the
 * PKCE code, exchange it for a session, close the browser, and route home.
 * No-op on web (there the /auth/callback page handles it). Mounted app-wide via
 * AuthProvider so it catches the deep link regardless of the current route.
 */
export function DeepLinkHandler() {
  const router = useRouter()

  useEffect(() => {
    if (!isNative()) return

    let remove: (() => void) | undefined
    const supabase = createClient()

    import('@capacitor/app').then(({ App }) => {
      App.addListener('appUrlOpen', async ({ url }) => {
        if (!url.includes('auth/callback')) return
        try {
          const code = new URL(url).searchParams.get('code')
          if (code) await supabase.auth.exchangeCodeForSession(code)
          const { Browser } = await import('@capacitor/browser')
          await Browser.close().catch(() => {})
          router.replace('/')
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
