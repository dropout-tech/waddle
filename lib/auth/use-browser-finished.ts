'use client'

import { useEffect, useRef } from 'react'
import { isNative } from '@/lib/platform'

/**
 * Native only: invokes `onFinished` whenever the in-app browser sheet closes
 * (@capacitor/browser's `browserFinished`). This is the only signal that the
 * user abandoned an OAuth round-trip midway — without it the login/signup
 * pages' OAuth loading state stays stuck after a manual close, which also
 * disables the Email submit button via `oauthBusy` (hit on-device 2026-07-13).
 * Also fires after a successful round-trip when the deep-link handler calls
 * Browser.close(); resetting the flag then is a harmless no-op. No-op on web.
 */
export function useBrowserFinished(onFinished: () => void) {
  const callbackRef = useRef(onFinished)
  useEffect(() => {
    callbackRef.current = onFinished
  })

  useEffect(() => {
    if (!isNative()) return
    let handle: { remove: () => Promise<void> } | undefined
    let cancelled = false
    ;(async () => {
      const { Browser } = await import('@capacitor/browser')
      const h = await Browser.addListener('browserFinished', () => callbackRef.current())
      if (cancelled) void h.remove()
      else handle = h
    })()
    return () => {
      cancelled = true
      void handle?.remove()
    }
  }, [])
}
