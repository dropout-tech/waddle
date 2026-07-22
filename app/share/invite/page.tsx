'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CalendarHeart } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-provider'
import { HuddleMascot } from '@/components/branding/waddle-mascot'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/react'
import {
  useCalendarSharing,
  PENDING_SHARE_INVITE_KEY,
  type InvitePreview,
} from '@/hooks/use-calendar-sharing'

// Invite landing page (P1). Purely client — no server component APIs, so it
// stays compatible with `output: export` and the Capacitor WebView.
//
// Token lives in the URL *fragment* (`#t=...`, never the path or query) so it
// never reaches a server log. Unauthenticated visitors get stashed into
// sessionStorage and bounced to /login; the login page and /auth/callback
// page both know to read PENDING_SHARE_INVITE_KEY and send the user back
// here once signed in (the hash itself doesn't survive that round trip).

type Status = 'resolving' | 'loading-preview' | 'preview' | 'invalid' | 'accepting'

function readTokenFromHash(): string | null {
  const hash = window.location.hash
  if (!hash.startsWith('#t=')) return null
  const raw = hash.slice(3)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export default function ShareInvitePage() {
  const router = useRouter()
  const { t } = useI18n()
  const { session, loading: authLoading } = useAuth()
  const { previewInvite, acceptInvite } = useCalendarSharing(false)

  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('resolving')
  const [preview, setPreview] = useState<InvitePreview | null>(null)

  // Resolve the token once on mount: hash first (fresh link open), then the
  // sessionStorage fallback (returning here after the login round-trip).
  useEffect(() => {
    const resolved = readTokenFromHash() || window.sessionStorage.getItem(PENDING_SHARE_INVITE_KEY)
    if (!resolved) {
      setStatus('invalid')
      return
    }
    setToken(resolved)
  }, [])

  // Once we know both the token and the auth state, either bounce to login
  // (stashing the token first) or preview the invite.
  useEffect(() => {
    if (!token || authLoading) return

    if (!session) {
      // Navigating away momentarily — no need to track an intermediate
      // status for a screen that's about to unmount.
      window.sessionStorage.setItem(PENDING_SHARE_INVITE_KEY, token)
      router.push('/login')
      return
    }

    window.sessionStorage.removeItem(PENDING_SHARE_INVITE_KEY)
    let cancelled = false
    setStatus('loading-preview')
    void (async () => {
      const result = await previewInvite(token)
      if (cancelled) return
      if (!result) {
        setStatus('invalid')
        return
      }
      setPreview(result)
      setStatus('preview')
    })()
    return () => {
      cancelled = true
    }
    // previewInvite is stable (useCallback) — only re-run when the token or
    // auth state actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authLoading, session, router])

  async function handleAccept() {
    if (!token) return
    setStatus('accepting')
    const ok = await acceptInvite(token)
    if (!ok) {
      setStatus('invalid')
      return
    }
    toast.success(t('已成功建立共享關係'))
    router.push('/')
  }

  const busy = status === 'resolving' || status === 'loading-preview'

  return (
    <main className="min-h-dvh w-full bg-gradient-to-br from-background via-background to-muted/40 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <HuddleMascot withBackground className="w-11 h-11 shadow-sm rounded-xl" />
          <span className="text-xl font-semibold tracking-tight">Huddle</span>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-ceramic p-8 text-center">
          {busy && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('正在確認邀請…')}</p>
            </div>
          )}

          {status === 'invalid' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-base font-medium text-foreground">{t('邀請連結無效或已過期')}</p>
              <p className="text-sm text-muted-foreground">
                {t('請向對方確認連結，或請他重新產生一份邀請')}
              </p>
              <Button className="mt-2 h-11" onClick={() => router.push('/')}>
                {t('回到 Huddle')}
              </Button>
            </div>
          )}

          {(status === 'preview' || status === 'accepting') && preview && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <CalendarHeart className="w-7 h-7 text-primary" aria-hidden />
              </div>
              <div>
                <p className="text-base font-medium text-foreground">
                  {t('{name} 邀請你互相共享行事曆', { name: preview.displayName || t('對方') })}
                </p>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {t('接受後，你們可以各自選擇開放哪些行程給對方查看')}
                </p>
              </div>
              <div className="flex gap-2.5 w-full mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 h-11"
                  onClick={() => router.push('/')}
                  disabled={status === 'accepting'}
                >
                  {t('略過')}
                </Button>
                <Button
                  type="button"
                  className="flex-1 h-11"
                  onClick={handleAccept}
                  disabled={status === 'accepting'}
                >
                  {status === 'accepting' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    t('接受邀請')
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
