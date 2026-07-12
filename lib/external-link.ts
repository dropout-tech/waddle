import type { MouseEvent } from 'react'
import { isNative } from '@/lib/platform'

/**
 * Open an external URL the right way per platform: on native, the in-app
 * system browser sheet (@capacitor/browser) so the WebView is never navigated
 * away from the app; on web, a regular new tab. Mirrors the pattern already
 * used by lib/auth/oauth.ts and lib/notifications/index.ts.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * onClick companion for `<a target="_blank">`: inside the native WebView a
 * _blank anchor navigates the whole app away, so intercept it and route
 * through the browser sheet instead. No-op on web (anchor works as-is).
 */
export function handleExternalAnchorClick(e: MouseEvent, url: string): void {
  if (!isNative()) return
  e.preventDefault()
  void openExternalUrl(url)
}
