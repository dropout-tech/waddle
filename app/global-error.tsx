'use client'

import { useEffect } from 'react'
import { ErrorScreen } from '@/components/errors/error-screen'

// Root-level error page: replaces the root layout when the layout itself (or
// a provider in it) throws, so it must render its own <html>/<body>. No
// globals.css here — ErrorScreen styles itself. Client component only (the
// Capacitor build exports this statically).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/global-error]', error)
  }, [error])

  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <body style={{ margin: 0 }}>
        <ErrorScreen
          title="出了點小狀況"
          message="這一頁暫時打不開。請再試一次；如果還是不行，先回首頁看看。"
          digest={error.digest}
          onRetry={reset}
        />
      </body>
    </html>
  )
}
