'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { t } from '@/lib/i18n'
import { captureClientError } from '@/lib/monitoring/sentry'

// Route-level error boundary (Next.js App Router). Reports the error to
// Sentry (no-op when NEXT_PUBLIC_SENTRY_DSN is unset) and shows a calm
// fallback. The raw error message is not shown: it may contain user content.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureClientError(error)
  }, [error])

  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-medium text-foreground">{t('這個區塊發生錯誤')}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{t('請嘗試重新整理或回報此問題。')}</p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {t('重試')}
      </button>
    </div>
  )
}
