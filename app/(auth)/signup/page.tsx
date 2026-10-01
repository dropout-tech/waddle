'use client'

import { useState } from 'react'
import { EnrollmentFields } from '@/components/operations/enrollment-fields'
import { useIosPurchaseSurface } from '@/components/billing/billing-session'
import Link from 'next/link'
import { Loader2, AlertCircle } from 'lucide-react'
import { LegalConsent } from '@/components/auth/legal-consent'
import { DesktopLoginPending } from '@/components/auth/desktop-login-pending'
import { signInWithGoogle, signInWithApple } from '@/lib/auth/oauth'
import { useBrowserFinished } from '@/lib/auth/use-browser-finished'
import { Button } from '@/components/ui/button'
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
  // Subscribes this component to language changes; translations below use the
  // plain `t` import (same underlying function) so the helper translateError
  // outside this component can share it without a naming clash.
  // Hook-bound t shadows the module-level import inside the component so
  // render output follows the hydration-safe language (SSR = zh first paint).
  const { t } = useI18n()
  // App Store guideline 3.1.1: no typed-in referral/coupon codes in the native iOS app (same rule as the membership page).
  const codeEntry = !useIosPurchaseSurface()

  // Google / Apple only (owner decision 2026-10-01). Enrollment codes in
  // EnrollmentFields are picked up after OAuth by EnrollmentBridge.
  const [googleLoading, setGoogleLoading] = useState(false)
  const [appleLoading, setAppleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const oauthBusy = googleLoading || appleLoading

  // Native: user closed the OAuth browser sheet without completing → unstick
  // the spinner (it otherwise waits for a deep link that never comes).
  useBrowserFinished(() => setGoogleLoading(false))

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

  return (
    <div className="bg-card border border-border rounded-2xl shadow-ceramic p-8">
      <div className="mb-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('建立帳號')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('幾秒鐘就能開始使用 Huddle')}</p>
      </div>
      <LegalConsent mode="signup" />

      {codeEntry && <EnrollmentFields />}
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

      <DesktopLoginPending active={googleLoading || appleLoading} />

      {error && (
        <div className={cn(
          'flex items-start gap-2 p-3 rounded-lg mt-4',
          'bg-destructive/10 text-destructive text-sm border border-destructive/20'
        )}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

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
