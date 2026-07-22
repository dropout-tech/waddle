'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { HuddleMascot } from '@/components/branding/waddle-mascot'
import { useAuth } from './auth-provider'
import { useI18n } from '@/lib/i18n/react'

/**
 * Gates protected content behind an active Supabase session. Replaces the old
 * server-side redirect in proxy.ts middleware: while the session is resolving
 * we show the mascot loader, and an unauthenticated user is sent to /login
 * before any empty app shell can paint.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const router = useRouter()
  const { t } = useI18n()

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/login')
    }
  }, [loading, session, router])

  if (loading || !session) {
    return (
      <main className="h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <HuddleMascot className="w-20 h-20 animate-waddle-bob" />
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{t('載入中...')}</span>
          </div>
        </div>
      </main>
    )
  }

  return <>{children}</>
}
