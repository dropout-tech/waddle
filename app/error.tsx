'use client'

import { useEffect } from 'react'
import { ErrorScreen } from '@/components/errors/error-screen'
import { captureClientError } from '@/lib/monitoring/sentry'

// Segment-level error page. Catches render errors in any route below the root
// layout, so a crash shows a calm bilingual page with a retry button instead
// of Next.js's English "Application error" screen. Client component only —
// the Capacitor build exports this statically.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/error]', error)
    captureClientError(error)
  }, [error])

  return (
    <ErrorScreen
      title="出了點小狀況"
      message="這一頁暫時打不開。請再試一次；如果還是不行，先回首頁看看。"
      digest={error.digest}
      onRetry={reset}
    />
  )
}
