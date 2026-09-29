'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { useI18n } from '@/lib/i18n/react'
import { isDesktop, isNative } from '@/lib/platform'
import { fetchGoogleCalendarStatus, invokeGoogleCalendar, setGoogleShareBusy, type GoogleCalendarStatus } from '@/lib/google-calendar'
import { Button } from '@/components/ui/button'

/**
 * /settings/google-calendar — connect / disconnect the READ-ONLY Google
 * Calendar integration. The connection lives server-side (Edge Function
 * google-calendar), so connecting once on the web makes the events show up in
 * the iOS app for the same account too. The native app / desktop shell does
 * not run the OAuth round-trip itself (Google blocks embedded web views and
 * the return deep link is not built yet) — it points to the web version.
 */
export default function GoogleCalendarSettingsPage() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null)
  const [appShell, setAppShell] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [message, setMessage] = useState('')
  const uid = user?.id

  useEffect(() => { setAppShell(isNative() || isDesktop()) }, [])
  const reload = useCallback(async () => setStatus(await fetchGoogleCalendarStatus()), [])
  useEffect(() => { setStatus(null); if (uid) void reload() }, [uid, reload])

  const connect = async () => {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const { url } = await invokeGoogleCalendar<{ url: string }>({ action: 'start' })
      const target = new URL(url)
      if (target.origin !== 'https://accounts.google.com' || !target.pathname.startsWith('/o/oauth2/')) throw new Error('authorization_url')
      window.location.assign(target.href)
    } catch {
      setMessage(t('無法開始連結，請稍後再試。'))
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const r = await invokeGoogleCalendar<{ revoked?: boolean }>({ action: 'disconnect' })
      setConfirm(false)
      setMessage(r?.revoked === false
        ? t('已解除連結。若要完全移除授權，請到 Google 帳戶的「第三方應用程式」移除 Huddle。')
        : t('已解除連結，Huddle 不會再讀取你的 Google 日曆。'))
      await reload()
    } catch {
      setMessage(t('操作未完成，請稍後再試。'))
    } finally {
      setBusy(false)
    }
  }

  const toggleShareBusy = async (value: boolean) => {
    if (busy || !status) return
    const previous = status
    setBusy(true); setMessage('')
    setStatus({ ...status, shareBusy: value })
    try {
      if (!(await setGoogleShareBusy(value))) throw new Error('share_busy')
    } catch {
      setStatus(previous)
      setMessage(t('操作未完成，請稍後再試。'))
    } finally {
      setBusy(false)
    }
  }

  const state = !status ? 'loading'
    : !status.configured ? 'unconfigured'
    : status.connected && status.status === 'reauth_required' ? 'reauth'
    : status.connected ? 'connected'
    : 'disconnected'

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-2xl px-5 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] text-foreground">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">← {t('返回 Huddle')}</Link>
      <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold">
        <CalendarDays className="h-6 w-6 text-[#1A73E8]" aria-hidden />
        {t('Google 日曆')}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {t('只讀取你的 Google 主日曆，不會修改；共享夥伴看不到這些會議。')}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('別人寄給你的 Google 會議邀請，會自動出現在 Huddle 行事曆上。')}
      </p>

      <section className="mt-6 space-y-4 rounded-xl border border-border p-4" data-gcal-state={loading || (uid && !status) ? 'loading' : !user ? 'signed-out' : state}>
        {loading || (uid && !status) ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('載入中…')}</p>
        ) : !user ? (
          <Link href="/login" className="inline-flex min-h-11 items-center text-sm text-primary underline">{t('登入後才能連結 Google 日曆')}</Link>
        ) : state === 'unconfigured' ? (
          <p className="text-sm">{t('Google 日曆整合尚未啟用。')}</p>
        ) : (
          <>
            <p className="text-sm font-medium">
              {t('狀態：{status}', { status: state === 'connected' ? t('已連結') : state === 'reauth' ? t('需要重新授權') : t('尚未連結') })}
            </p>
            {state === 'reauth' && (
              <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                {t('Google 的授權已失效或被移除，會議暫時不會顯示。請重新連結。')}
              </p>
            )}
            {state === 'connected' && (
              <p className="text-sm text-muted-foreground">{t('你 Google 主日曆上的會議會顯示在 Huddle 的週、日、月視圖。')}</p>
            )}
            {(state === 'connected' || state === 'reauth') && (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm" data-testid="gcal-share-busy">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 flex-shrink-0 accent-primary"
                  checked={status?.shareBusy !== false}
                  disabled={busy}
                  onChange={(e) => void toggleShareBusy(e.target.checked)}
                />
                <span>{t('讓共享夥伴約時間時避開我的 Google 會議（對方只看到忙碌，看不到標題）')}</span>
              </label>
            )}
            {(state === 'disconnected' || state === 'reauth') && (
              appShell ? (
                <p className="text-sm" data-testid="gcal-use-web">{t('請到網頁版連結，連好後 App 也會顯示。')}</p>
              ) : (
                <Button className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={connect}>
                  {busy ? t('處理中…') : state === 'reauth' ? t('重新連結 Google 日曆') : t('連結 Google 日曆')}
                </Button>
              )
            )}
            {(state === 'connected' || state === 'reauth') && (
              confirm ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-sm">{t('解除連結後，Huddle 會刪除保存的授權，行事曆不再顯示 Google 會議。Google 上的資料不受影響。')}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="destructive" className="min-h-11" disabled={busy} onClick={disconnect}>{t('確認解除連結')}</Button>
                    <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => setConfirm(false)}>{t('取消')}</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={() => setConfirm(true)}>{t('解除連結')}</Button>
              )
            )}
          </>
        )}
      </section>
      {message && <p role="status" className="mt-4 rounded-md border border-border p-3 text-sm">{message}</p>}
      {!appShell && state !== 'unconfigured' && state !== 'loading' && (
        <p className="mt-6 text-xs text-muted-foreground">{t('連結時 Google 會詢問是否允許 Huddle「查看你擁有的 Google 日曆中的活動」，Huddle 只會讀取主日曆。')}</p>
      )}
    </main>
  )
}
