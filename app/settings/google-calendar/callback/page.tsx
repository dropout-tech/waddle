'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth/auth-provider'
import { useI18n } from '@/lib/i18n/react'
import { invokeGoogleCalendar } from '@/lib/google-calendar'

/**
 * Google OAuth redirect target for the read-only Calendar integration. The
 * `code` here belongs to the Calendar OAuth only: lib/supabase/client.ts
 * excludes this path from detectSessionInUrl so Supabase Auth never sees it,
 * and the Edge Function exchanges it (PKCE, one-time state bound to this
 * signed-in session).
 */
export default function GoogleCalendarCallbackPage() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const started = useRef(false)
  const [state, setState] = useState<'waiting' | 'success' | 'failed' | 'denied'>('waiting')

  useEffect(() => {
    if (loading || !user || started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code'), oauthState = params.get('state')
    // Drop the one-time code from the address bar / history right away.
    window.history.replaceState(null, '', window.location.pathname)
    if (params.has('error')) { setState('denied'); return }
    if (!code || !oauthState) { setState('failed'); return }
    const watchdog = setTimeout(() => setState('failed'), 25000)
    invokeGoogleCalendar({ action: 'finish', code, state: oauthState })
      .then(() => setState('success'))
      .catch(() => setState('failed'))
      .finally(() => clearTimeout(watchdog))
  }, [loading, user])

  const text = !loading && !user
    ? t('請先登入 Huddle，再到設定重新連結 Google 日曆。')
    : state === 'success' ? t('Google 日曆已連結，會議會顯示在行事曆上。')
    : state === 'denied' ? t('已取消授權，沒有做任何變更。')
    : state === 'failed' ? t('連結沒有完成，請回到設定頁查看狀態後再試一次。')
    : t('正在連結 Google 日曆…')

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-xl space-y-5 px-5 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-[calc(3rem+env(safe-area-inset-top))] text-foreground">
      <h1 className="text-2xl font-semibold">{t('Google 日曆')}</h1>
      <p role="status" data-gcal-callback={state}>{text}</p>
      <div className="flex flex-wrap gap-3">
        <Link className="inline-flex min-h-11 items-center text-sm text-primary underline" href="/settings/google-calendar">{t('返回 Google 日曆設定')}</Link>
        {state === 'success' && <Link className="inline-flex min-h-11 items-center text-sm text-primary underline" href="/">{t('回到行事曆')}</Link>}
      </div>
    </main>
  )
}
