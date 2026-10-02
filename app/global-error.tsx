'use client'

import { useEffect } from 'react'
import { ErrorScreen } from '@/components/errors/error-screen'
import { useI18n } from '@/lib/i18n/react'

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
  // SSR/first render is zh-TW; flips to the stored/detected language after mount.
  const { lang } = useI18n()

  useEffect(() => {
    console.error('[app/global-error]', error)
    // The theme provider is gone here; honor the user's saved dark choice (next-themes key).
    try {
      if (window.localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark')
    } catch {
      /* storage blocked — stay light */
    }
  }, [error])

  return (
    <html lang={lang} suppressHydrationWarning>
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
