'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Loader2, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isNative } from '@/lib/platform'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n/react'

// The reset email must link to the web origin — inside the Capacitor shell
// window.location.origin is capacitor://localhost, which is useless in an
// email opened on any device. (Same reasoning as the OAuth deep-link split
// in lib/auth/oauth.ts, except email links can only ever be https.)
const WEB_ORIGIN = 'https://waddle.zeabur.app'

export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const origin = isNative() ? WEB_ORIGIN : window.location.origin
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (err) {
      setError(
        /rate|too many/i.test(err.message)
          ? t('嘗試次數太多，請稍後再試')
          : t('寄送失敗，請稍後再試')
      )
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-ceramic p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-4">
            <MailCheck className="w-6 h-6 text-success" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{t('重設連結已寄出')}</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {t('如果 {email} 有 Huddle 帳號，你會收到一封重設密碼的信。請點擊信中連結設定新密碼。', { email })}
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            {t('沒收到？檢查垃圾信件匣，或稍後再試一次。')}
          </p>
          <Link
            href="/login"
            className="mt-6 text-sm text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors"
          >
            {t('返回登入')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-2xl shadow-ceramic p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('重設密碼')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('輸入註冊時的 Email，我們會寄一封重設連結給你。')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="h-11"
            placeholder="you@example.com"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full h-11" disabled={loading || !email}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('寄送重設連結')}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground text-center mt-6">
        {t('想起密碼了？')}{' '}
        <Link href="/login" className="text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors">
          {t('返回登入')}
        </Link>
      </p>
    </div>
  )
}
