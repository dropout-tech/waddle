'use client'

import { useEffect } from 'react'
import { isNative } from '@/lib/platform'

// Runtime glue for native-only shell concerns. No-op on web (everything is
// guarded by isNative()). Mounted once near the app root.
//
//  - Status bar style tracks the app theme (cream/light vs charcoal/dark).
//  - The keyboard resizes the WebView so inputs aren't hidden behind it.
//  - The splash screen is hidden once the web layer has mounted.
export function NativeShell() {
  useEffect(() => {
    if (!isNative()) return

    let cancelled = false
    let cleanup: (() => void) | undefined

    ;(async () => {
      const [{ SplashScreen }, { StatusBar, Style }, { Keyboard, KeyboardResize }] =
        await Promise.all([
          import('@capacitor/splash-screen'),
          import('@capacitor/status-bar'),
          import('@capacitor/keyboard'),
        ])
      if (cancelled) return

      // Capacitor's Style naming is counter-intuitive: Style.Dark = light text
      // (for dark backgrounds), Style.Light = dark text (for light backgrounds).
      const applyStatusBar = async () => {
        const dark =
          document.documentElement.classList.contains('dark') ||
          window.matchMedia('(prefers-color-scheme: dark)').matches
        try {
          await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
        } catch {
          /* status bar not available (e.g. iPad in some modes) */
        }
      }
      await applyStatusBar()

      const observer = new MutationObserver(applyStatusBar)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', applyStatusBar)

      try {
        await Keyboard.setResizeMode({ mode: KeyboardResize.Native })
      } catch {
        /* keyboard plugin unavailable */
      }

      try {
        await SplashScreen.hide()
      } catch {
        /* already hidden */
      }

      cleanup = () => {
        observer.disconnect()
        mq.removeEventListener('change', applyStatusBar)
      }
    })()

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])

  return null
}
