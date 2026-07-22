'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { WaddleMascot } from '@/components/branding/waddle-mascot'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n/react'

// Landing page for the password-reset email link. The link goes through
// /auth/callback?next=/reset-password, which exchanges the code for a
// session — so by the time the user is here they are signed in and we can
// call updateUser. NOT under the (auth) route group on purpose: that layout
// bounces signed-in users to '/'.
export default function ResetPasswordPage() {
  const { t } = useI18n()
  const router = useRouter()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setHasSession(Boolean(session))
      setChecking(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError(t('兩次輸入的密碼不一致'))
      return
    }
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) {
      const msg = err.message || ''
      if (/different from the old/i.test(msg)) setError(t('新密碼不能與舊密碼相同'))
      else if (/at least 6/i.test(msg)) setError(t('密碼至少需要 6 個字元'))
      else if (/rate|too many/i.test(msg)) setError(t('嘗試次數太多，請稍後再試'))
      else setError(t('更新失敗，請再試一次'))
      return
    }
    setDone(true)
    window.setTimeout(() => {
      router.replace('/')
    }, 1500)
  }

  return (
    <main className="min-h-dvh w-full bg-gradient-to-br from-background via-background to-muted/40 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <WaddleMascot withBackground className="w-11 h-11 shadow-sm rounded-xl" />
          <span className="text-xl font-semibold tracking-tight">Huddle</span>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-ceramic p-8">
          {checking ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !hasSession ? (
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-tight">{t('連結已失效')}</h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {t('重設連結可能已過期或已被使用。請重新申請一封。')}
              </p>
              <Link
                href="/forgot-password"
                className="inline-block mt-6 text-sm text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors"
              >
                {t('重新申請重設連結')}
              </Link>
            </div>
          ) : done ? (
            <div className="text-center py-4">
              <h1 className="text-xl font-semibold tracking-tight">{t('密碼已更新')}</h1>
              <p className="text-sm text-muted-foreground mt-2">{t('正在帶你回到 Huddle⋯')}</p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">{t('設定新密碼')}</h1>
                <p className="text-sm text-muted-foreground mt-1">{t('為你的帳號設定一組新密碼。')}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t('新密碼')}</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={saving}
                      className="h-11 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? t('隱藏密碼') : t('顯示密碼')}
                      className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('至少 6 個字元')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t('再輸入一次新密碼')}</Label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={saving}
                    className="h-11"
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full h-11" disabled={saving || !password || !confirm}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('更新密碼')}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
