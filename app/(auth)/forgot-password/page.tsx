'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/react'

/**
 * Password accounts were retired (owner decision 2026-10-01: Google / Apple
 * sign-in only), so there is nothing to reset. Old bookmarks and help links
 * land here — send them to /login. Client-side because the iOS build is a
 * static export.
 */
export default function ForgotPasswordPage() {
  const router = useRouter()
  const { t } = useI18n()

  useEffect(() => {
    router.replace('/login')
  }, [router])

  return (
    <div className="bg-card border border-border rounded-2xl shadow-ceramic p-8 text-center">
      <p className="text-sm text-muted-foreground">
        {t('Huddle 現在只用 Google 或 Apple 登入。')}{' '}
        <Link href="/login" className="text-foreground font-medium hover:underline">
          {t('返回登入')}
        </Link>
      </p>
    </div>
  )
}
