'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-provider'
import { HuddleMascot } from '@/components/branding/waddle-mascot'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/react'
import {
  PENDING_ORG_INVITE_KEY,
  previewOrgInvite,
  acceptOrgInvite,
  assignmentErrorMessage,
} from '@/lib/assignments'

// Organization invite landing page — mirrors app/share/invite/page.tsx:
// token in the URL fragment (#t=…, never sent to a server), stashed in
// sessionStorage across the login round-trip and cleared on return.

type Status = 'resolving' | 'loading-preview' | 'preview' | 'invalid' | 'accepting'
type Preview = NonNullable<Awaited<ReturnType<typeof previewOrgInvite>>>

function readTokenFromHash(): string | null {
  const hash = window.location.hash
  if (!hash.startsWith('#t=')) return null
  const raw = hash.slice(3)
  try { return decodeURIComponent(raw) } catch { return raw }
}

function safeSessionGet(key: string) {
  try { return window.sessionStorage.getItem(key) } catch { return null }
}

export default function OrgInvitePage() {
  const router = useRouter()
  const { t } = useI18n()
  const { session, loading: authLoading } = useAuth()
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('resolving')
  const [preview, setPreview] = useState<Preview | null>(null)

  useEffect(() => {
    const resolved = readTokenFromHash() || safeSessionGet(PENDING_ORG_INVITE_KEY)
    if (!resolved) { setStatus('invalid'); return }
    setToken(resolved)
  }, [])

  useEffect(() => {
    if (!token || authLoading) return
    if (!session) {
      try { window.sessionStorage.setItem(PENDING_ORG_INVITE_KEY, token) } catch { /* private mode */ }
      router.push('/login')
      return
    }
    try { window.sessionStorage.removeItem(PENDING_ORG_INVITE_KEY) } catch { /* private mode */ }
    let cancelled = false
    setStatus('loading-preview')
    void (async () => {
      try {
        const result = await previewOrgInvite(token)
        if (cancelled) return
        if (!result) { setStatus('invalid'); return }
        setPreview(result)
        setStatus('preview')
      } catch {
        if (!cancelled) setStatus('invalid')
      }
    })()
    return () => { cancelled = true }
  }, [token, authLoading, session, router])

  async function handleAccept() {
    if (!token) return
    setStatus('accepting')
    try {
      await acceptOrgInvite(token)
      toast.success(t('已加入組織'))
      router.push('/org')
    } catch (err) {
      toast.error(assignmentErrorMessage(err))
      setStatus('invalid')
    }
  }

  const busy = status === 'resolving' || status === 'loading-preview'
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted/40 px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <HuddleMascot withBackground className="h-11 w-11 rounded-xl shadow-sm" />
          <span className="text-xl font-semibold tracking-tight">Huddle</span>
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-ceramic">
          {busy && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('正在確認邀請…')}</p>
            </div>
          )}
          {status === 'invalid' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-base font-medium">{t('邀請連結無效或已過期')}</p>
              <p className="text-sm text-muted-foreground">{t('請向組織管理員索取新的邀請連結')}</p>
              <Button className="mt-2 h-11" onClick={() => router.push('/')}>{t('回到 Huddle')}</Button>
            </div>
          )}
          {(status === 'preview' || status === 'accepting') && preview && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Building2 className="h-7 w-7 text-primary" aria-hidden />
              </div>
              <div>
                <p className="text-base font-medium">
                  {t('{name} 邀請你加入「{org}」', { name: preview.inviterName || t('對方'), org: preview.orgName })}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {preview.alreadyMember
                    ? t('你已經是這個組織的成員')
                    : t('加入後，成員可以彼此指派任務；你的私人任務不會公開。')}
                </p>
              </div>
              <div className="mt-2 flex w-full gap-2.5">
                <Button type="button" variant="secondary" className="h-11 flex-1" onClick={() => router.push('/')} disabled={status === 'accepting'}>{t('略過')}</Button>
                <Button type="button" className="h-11 flex-1" onClick={preview.alreadyMember ? () => router.push('/org') : handleAccept} disabled={status === 'accepting'}>
                  {status === 'accepting' ? <Loader2 className="h-4 w-4 animate-spin" /> : preview.alreadyMember ? t('前往組織') : t('加入組織')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
