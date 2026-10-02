'use client'

import { useEffect } from 'react'
import { initMonitoring } from '@/lib/monitoring/sentry'

// Mounted once in the root layout. Does nothing unless NEXT_PUBLIC_SENTRY_DSN
// is set (see lib/monitoring/sentry.ts).
export function SentryInit() {
  useEffect(() => {
    initMonitoring()
  }, [])
  return null
}
