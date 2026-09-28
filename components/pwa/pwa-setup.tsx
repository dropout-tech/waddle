'use client'

import { useEffect } from 'react'
import { isPlainWeb, isStandalone, wireInstallPrompt } from '@/lib/pwa'

const UPDATE_CHECK_MS = 30 * 60 * 1000
// Paper theme backgrounds (app/art-theme.css). The installed app's status bar
// follows the app's own light/dark toggle, not the OS setting the static
// <meta name="theme-color" media=…> tags assume.
const STATUS_BAR = { light: '#f6f3e9', dark: '#22231e' }

/**
 * Website-only PWA glue, mounted once in app/layout.tsx. No-op inside the
 * Capacitor app and the Electron desktop shell.
 *  - Registers public/sw.js (production only) and hands it the hashed assets
 *    this page already loaded, so the very first install can launch offline.
 *  - Re-checks for a new worker whenever the app returns to the foreground.
 *  - In standalone (installed) mode, keeps theme-color = the paper background.
 */
export function PwaSetup() {
  useEffect(() => {
    if (!isPlainWeb()) return
    wireInstallPrompt()
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      // A worker left over from testing a production build on localhost would
      // serve stale bundles to `next dev`.
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()))
      return
    }

    let lastCheck = Date.now()
    let reg: ServiceWorkerRegistration | undefined
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !reg) return
      if (Date.now() - lastCheck < UPDATE_CHECK_MS) return
      lastCheck = Date.now()
      reg.update().catch(() => {})
    }

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async (r) => {
        reg = r
        const ready = await navigator.serviceWorker.ready
        const urls = [
          ...performance.getEntriesByType('resource').map((e) => e.name),
          ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'), (s) => s.src),
          ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[href]'), (l) => l.href),
        ].filter((u) => u.startsWith(`${location.origin}/_next/static/`))
        ready.active?.postMessage({ type: 'CACHE_URLS', urls: Array.from(new Set(urls)) })
      })
      .catch(() => {
        /* private mode / blocked — the site simply works online-only */
      })

    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    if (!isPlainWeb() || !isStandalone()) return
    const root = document.documentElement
    const apply = () => {
      const color = root.classList.contains('dark') ? STATUS_BAR.dark : STATUS_BAR.light
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
        if (m.getAttribute('content') !== color) m.setAttribute('content', color)
      })
    }
    apply()
    // Theme toggle flips `.dark` on <html>; route changes may re-render the
    // metadata tags in <head>.
    const observer = new MutationObserver(apply)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    observer.observe(document.head, { childList: true })
    return () => observer.disconnect()
  }, [])

  return null
}
