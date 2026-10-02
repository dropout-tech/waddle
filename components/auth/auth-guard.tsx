'use client'

import { useEffect, useState } from 'react'
import { operations } from '@/lib/operations/client'
import { useSafeSignOut } from './use-safe-sign-out'
import { useRouter } from 'next/navigation'
import { MascotLoader } from '@/components/branding/mascot-loader'
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
  // Same unsynced-notes check as the user menu's sign-out.
  const { requestSignOut, busy: signingOut, dialog: signOutDialog } = useSafeSignOut()
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
    return <MascotLoader />
  }

  if (suspendedUser === session.user.id) return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{t('帳號已停用')}</h1>
      <p>{t('如有疑問，請聯絡客服。你的資料未因停用而刪除。')}</p>
      <a href="/support" className="min-h-11 underline">{t('聯絡客服')}</a>
      <button className="min-h-11 rounded-lg bg-secondary px-4" disabled={signingOut} onClick={() => void requestSignOut()}>{t('登出')}</button>
      {signOutDialog}
    </main>
  )
  return <>{children}</>
}
