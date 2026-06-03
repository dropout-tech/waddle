'use client'

import { Suspense, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { signInWithGoogle, signInWithApple } from '@/lib/auth/oauth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

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

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginSkeleton() {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-8">
      <div className="h-8 w-32 bg-muted rounded animate-pulse mb-2" />
      <div className="h-4 w-48 bg-muted rounded animate-pulse" />
    </div>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [appleLoading, setAppleLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'auth_callback_failed' ? '登入失敗，請再試一次' : null
  )
  const oauthBusy = loading || googleLoading || appleLoading

  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: err } = await supabase.auth.signInWithPassword({ email, password })

    if (err) {
      setError(translateError(err.message))
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  async function handleGoogleLogin() {
    setError(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
      // Web navigates away; native returns via the deep-link handler. The Apple
      // native path resolves inline, so we only reset on error.
    } catch (err) {
      setError(translateError(err instanceof Error ? err.message : String(err)))
      setGoogleLoading(false)
    }
  }

  async function handleAppleLogin() {
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
    <div className="bg-card border border-border rounded-2xl shadow-sm p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">歡迎回來</h1>
        <p className="text-sm text-muted-foreground mt-1">登入以繼續使用 Huddle</p>
      </div>

      <div className="space-y-2.5">
        <Button
          type="button"
          variant="outline"
          className="w-full h-11"
          onClick={handleGoogleLogin}
          disabled={oauthBusy}
        >
          {googleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <GoogleIcon className="w-4 h-4" />
          )}
          <span className="ml-2">使用 Google 登入</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full h-11"
          onClick={handleAppleLogin}
          disabled={oauthBusy}
        >
          {appleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <AppleIcon className="w-4 h-4" />
          )}
          <span className="ml-2">使用 Apple 登入</span>
        </Button>
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">或使用 Email</span>
        </div>
      </div>

      <form onSubmit={handleEmailLogin} className="space-y-4">
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">密碼</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              忘記密碼？
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="h-11 pr-10"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
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
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '登入'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        還沒有帳號？{' '}
        <Link href="/signup" className="text-foreground font-medium hover:underline">
          建立帳號
        </Link>
      </p>
    </div>
  )
}

function translateError(message: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'Email 或密碼不正確',
    'Email not confirmed': '請先到信箱點擊驗證連結',
    'User already registered': '此 Email 已註冊，請直接登入',
    'Password should be at least 6 characters': '密碼至少需要 6 個字元',
  }
  return map[message] ?? message
}
