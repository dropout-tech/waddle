'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { isNative } from '@/lib/platform'
import { DeepLinkHandler } from './deep-link-handler'

// Client-side auth state shared across the app. Replaces the deleted server
// middleware (proxy.ts) as the single source of truth for "is the user logged
// in", so the same auth model serves both the web build and the Capacitor
// WebView (which has no Next.js server).
interface AuthState {
  session: Session | null
  user: User | null
  /** True until the initial getSession() resolves. */
  loading: boolean
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setLoading(false)
    })

    // On native, Supabase recommends pausing token auto-refresh while the app
    // is backgrounded and resuming it on foreground (timers are unreliable when
    // suspended). Wire this to the Capacitor App lifecycle.
    let removeAppListener: (() => void) | undefined
    if (isNative()) {
      supabase.auth.startAutoRefresh()
      import('@capacitor/app').then(({ App }) => {
        if (!mounted) return
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) supabase.auth.startAutoRefresh()
          else supabase.auth.stopAutoRefresh()
        }).then((handle) => {
          removeAppListener = () => handle.remove()
        })
      })
    }

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
      removeAppListener?.()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      <DeepLinkHandler />
      {children}
    </AuthContext.Provider>
  )
}
