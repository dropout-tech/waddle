'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { signInWithGoogle, signInWithApple } from '@/lib/auth/oauth'
import { useBrowserFinished } from '@/lib/auth/use-browser-finished'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { t } from '@/lib/i18n'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.998 10.998 0 0 0 12 23Z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.998 10.998 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84Z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1A10.998 10.998 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/>
    </svg>
  )
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.13 2.99-.78.86-2.04 1.52-3.1 1.44-.13-1.1.42-2.27 1.07-3 .73-.83 2-1.46 3.07-1.5.02.02.02.04.02.07h.07zM20.5 17.06c-.46 1.07-.68 1.55-1.27 2.5-.83 1.32-2 2.96-3.45 2.97-1.29.01-1.62-.84-3.37-.83-1.75.01-2.11.85-3.4.84-1.45-.01-2.56-1.49-3.39-2.81-2.32-3.7-2.57-8.03-1.13-10.34 1.02-1.64 2.63-2.6 4.15-2.6 1.54 0 2.51.85 3.78.85 1.24 0 1.99-.85 3.78-.85 1.35 0 2.78.74 3.8 2.01-3.34 1.83-2.8 6.6.17 7.6z"/>
    </svg>
  )
}

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()
  // Subscribes this component to language changes; translations below use the
  // plain `t` import (same underlying function) so the helper translateError
  // outside this component can share it without a naming clash.
  // Hook-bound t shadows the module-level import inside the component so
  // render output follows the hydration-safe language (SSR = zh first paint).
  const { t } = useI18n()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [appleLoading, setAppleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const oauthBusy = loading || googleLoading || appleLoading

  // Native: user closed the OAuth browser sheet without completing → unstick
  // the spinner (it otherwise waits for a deep link that never comes).
  useBrowserFinished(() => setGoogleLoading(false))

  async function handleEmailSignup(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError(t('密碼至少需要 6 個字元'))
      return
    }

    setLoading(true)

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (err) {
      setError(translateError(err.message))
      setLoading(false)
      return
    }

    // If "Confirm email" is OFF in Supabase, session is created immediately.
    // If ON, user needs to click the email link first.
    if (data.session) {
      router.push('/')
      router.refresh()
      return
    }

    setNeedsConfirmation(true)
    setLoading(false)
  }

  async function handleGoogleSignup() {
    setError(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(translateError(err instanceof Error ? err.message : String(err)))
      setGoogleLoading(false)
    }
  }

  async function handleAppleSignup() {
    setError(null)
    setAppleLoading(true)
    try {
      await signInWithApple()
    } catch (err) {
      setError(translateError(err instanceof Error ? err.message : String(err)))
      setAppleLoading(false)
    }
  }

  if (needsConfirmation) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-ceramic p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('檢查你的信箱')}</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {t('我們已寄出驗證連結到')} <span className="font-medium text-foreground">{email}</span>
            <br />
            {t('點擊連結後即可登入。')}
          </p>
          <Link
            href="/login"
            className="mt-6 text-sm text-foreground font-medium hover:underline"
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
        <h1 className="text-2xl font-semibold tracking-tight">{t('建立帳號')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('幾秒鐘就能開始使用 Huddle')}</p>
      </div>

      <div className="space-y-2.5">
        <Button
          type="button"
          variant="outline"
          className="w-full h-11"
          onClick={handleGoogleSignup}
          disabled={oauthBusy}
        >
          {googleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <GoogleIcon className="w-4 h-4" />
          )}
          <span className="ml-2">{t('使用 Google 註冊')}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full h-11"
          onClick={handleAppleSignup}
          disabled={oauthBusy}
        >
          {appleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <AppleIcon className="w-4 h-4" />
          )}
          <span className="ml-2">{t('使用 Apple 註冊')}</span>
        </Button>
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">{t('或使用 Email')}</span>
        </div>
      </div>

      <form onSubmit={handleEmailSignup} className="space-y-4">
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

        <div className="space-y-2">
          <Label htmlFor="password">{t('密碼')}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="h-11 pr-10"
              placeholder={t('至少 6 個字元')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? t('隱藏密碼') : t('顯示密碼')}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{t('至少 6 個字元')}</p>
        </div>

        {error && (
          <div className={cn(
            'flex items-start gap-2 p-3 rounded-lg',
            'bg-destructive/10 text-destructive text-sm border border-destructive/20'
          )}>
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button type="submit" className="w-full h-11" disabled={oauthBusy}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('建立帳號')}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        {t('已經有帳號了？')}{' '}
        <Link href="/login" className="text-foreground font-medium hover:underline">
          {t('登入')}
        </Link>
      </p>
    </div>
  )
}

function translateError(message: string): string {
  const map: Record<string, string> = {
    'User already registered': t('此 Email 已註冊，請直接登入'),
    'Password should be at least 6 characters': t('密碼至少需要 6 個字元'),
    'Unable to validate email address: invalid format': t('Email 格式不正確'),
  }
  return map[message] ?? message
}
