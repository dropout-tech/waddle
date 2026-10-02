'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIsNativeShell } from '@/components/legal/web-only'
import { isNative } from '@/lib/platform'
import { useI18n } from '@/lib/i18n/react'
import type { BillingView } from './billing-views'

/**
 * Entry for every /billing/* route. This file holds NO purchase wording: the
 * real pages live in billing-views.tsx, which is only referenced when the build
 * flag is on. The Capacitor export blanks the flag (next.config.mjs), so there
 * the dynamic import is dead code and nothing purchase-related is bundled
 * (Apple 3.1.1). A native shell that somehow lands here is sent home.
 */
const Views =
  process.env.NEXT_PUBLIC_WEB_BILLING_ENABLED === 'true'
    ? dynamic(() => import('./billing-views'), { ssr: false })
    : null

export function BillingRoute({ view }: { view: BillingView }) {
  const { t } = useI18n()
  const router = useRouter()
  const nativeShell = useIsNativeShell()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (isNative()) router.replace('/')
  }, [router])

  // Client-only: the static HTML (and the Capacitor export) stays empty.
  if (!mounted || nativeShell) return null
  if (!Views) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground" data-testid="billing-unavailable">
        <p className="text-base">{t('這個頁面目前不可用。')}</p>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-lg bg-secondary px-4 text-sm">{t('回到 Huddle')}</Link>
      </main>
    )
  }
  return <Views view={view} />
}
