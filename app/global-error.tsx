'use client'

import { useEffect } from 'react'
import { captureClientError } from '@/lib/monitoring/sentry'

// Last-resort boundary: only renders when the root layout itself crashes, so
// it must supply its own <html>/<body> and cannot rely on providers or i18n
// (hence the hard-coded zh/en text). Reports to Sentry (no-op without DSN).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureClientError(error)
  }, [error])

  return (
    <html lang="zh-TW">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fdf8ec', color: '#2a2a2a' }}>
        <div
          role="alert"
          style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>發生錯誤 · Something went wrong</h2>
          <button
            type="button"
            onClick={reset}
            style={{ padding: '8px 16px', borderRadius: 8, border: 0, background: '#2a2a2a', color: '#fdf8ec', fontSize: 14, cursor: 'pointer' }}
          >
            重試 · Retry
          </button>
        </div>
      </body>
    </html>
  )
}
