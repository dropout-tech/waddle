'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { completeGoogleWebLogin } from '@/lib/auth/google-idtoken'
import { pendingMeetingPath } from '@/lib/auth/meeting-return'
import { PENDING_SHARE_INVITE_KEY } from '@/hooks/use-calendar-sharing'
import { pendingOrgInvitePath } from '@/lib/assignments'
import { useI18n } from '@/lib/i18n/react'

// Google returns here with #id_token=…&state=… (see google-idtoken.ts). The
// fragment never reaches a server; we read it once, scrub it from the address
// bar/history, then trade the ID token for a Supabase session.
let capturedFragment: string | null = null

export default function GoogleCallbackPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (capturedFragment === null) {
      capturedFragment = window.location.hash
      window.history.replaceState(null, '', window.location.pathname)
    }
    const timer = window.setTimeout(() => {
      if (!cancelled) setFailure('登入連線逾時，請返回登入頁重試。')
    }, 20000)
    completeGoogleWebLogin(capturedFragment).then(result => {
      if (cancelled) return
      window.clearTimeout(timer)
      if (result === 'cancelled') return setFailure('登入已取消，請返回登入頁重新選擇登入方式。')
      if (result === 'failed') return setFailure('登入連結已失效，或登入驗證未完成。請使用原本的瀏覽器重新登入。')
      const pendingInvite = window.sessionStorage.getItem(PENDING_SHARE_INVITE_KEY)
      router.replace(pendingMeetingPath() || pendingOrgInvitePath() || (pendingInvite ? '/share/invite' : '/'))
    })
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [router])

  // A full document navigation releases a stuck SDK instance / navigator lock.
  if (failure) return <div role="alert" className="min-h-screen flex flex-col gap-4 items-center justify-center p-6 text-center">
    <h1 className="text-xl font-semibold">{t('登入未完成')}</h1>
    <p className="max-w-md text-muted-foreground">{t(failure)}</p>
    <a className="rounded-xl bg-primary text-primary-foreground px-6 py-3" href="/login">{t('返回登入頁')}</a>
  </div>
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )
}
