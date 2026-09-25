'use client'

import { useEffect, useState } from 'react'
import { operations } from '@/lib/operations/client'
import { createClient } from '@/lib/supabase/client'
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
  const [suspendedUser, setSuspendedUser] = useState<string | null>(null)
  useEffect(() => {
    if (!session?.user.id) return
    let active = true
    operations('self').catch(error => {
      if (active && error.message.includes('帳號已停用')) setSuspendedUser(session.user.id)
    })
    return () => { active = false }
  }, [session?.user.id])
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

  if (suspendedUser === session.user.id) return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">帳號已停用</h1>
      <p>如有疑問，請聯絡客服。你的資料未因停用而刪除。</p>
      <a href="/support" className="min-h-11 underline">聯絡客服</a>
      <button className="min-h-11 rounded-lg bg-secondary px-4" onClick={() => void createClient().auth.signOut()}>登出</button>
    </main>
  )
  return <>{children}</>
}
