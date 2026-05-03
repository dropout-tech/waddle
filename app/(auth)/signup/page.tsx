'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  async function handleEmailSignup(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('密碼至少需要 6 個字元')
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

    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (err) {
      setError(translateError(err.message))
      setGoogleLoading(false)
    }
  }

  if (needsConfirmation) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-sm p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">檢查你的信箱</h1>
          <p className="text-sm text-muted-foreground mt-2">
            我們已寄出驗證連結到 <span className="font-medium text-foreground">{email}</span>
            <br />
            點擊連結後即可登入。
          </p>
          <Link
            href="/login"
            className="mt-6 text-sm text-foreground font-medium hover:underline"
          >
            返回登入
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">建立帳號</h1>
        <p className="text-sm text-muted-foreground mt-1">幾秒鐘就能開始使用 Waddle</p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full h-11"
        onClick={handleGoogleSignup}
        disabled={googleLoading || loading}
      >
        {googleLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <GoogleIcon className="w-4 h-4" />
        )}
        <span className="ml-2">使用 Google 註冊</span>
      </Button>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">或使用 Email</span>
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
          <Label htmlFor="password">密碼</Label>
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
              placeholder="至少 6 個字元"
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
          <p className="text-xs text-muted-foreground">至少 6 個字元</p>
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

        <Button type="submit" className="w-full h-11" disabled={loading || googleLoading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '建立帳號'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        已經有帳號了？{' '}
        <Link href="/login" className="text-foreground font-medium hover:underline">
          登入
        </Link>
      </p>
    </div>
  )
}

function translateError(message: string): string {
  const map: Record<string, string> = {
    'User already registered': '此 Email 已註冊，請直接登入',
    'Password should be at least 6 characters': '密碼至少需要 6 個字元',
    'Unable to validate email address: invalid format': 'Email 格式不正確',
  }
  return map[message] ?? message
}
