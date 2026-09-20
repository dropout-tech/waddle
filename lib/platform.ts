import { Capacitor } from '@capacitor/core'

/**
 * True only when running inside the native Capacitor shell (iOS/Android).
 * Safe to call in the web build and during Node prerender — `@capacitor/core`
 * is isomorphic and returns false outside a native WebView.
 *
 * Use this to branch any code that depends on native-only behaviour (deep-link
 * OAuth, local notifications, native share, Preferences-backed storage, etc.)
 * so the web bundle keeps using standard web APIs.
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

declare global {
  interface Window {
    huddleDesktop?: {
      platform: string
      isDesktop: boolean
      beginOAuth: () => Promise<string>
      openOAuth: (url: string) => Promise<void>
      cancelOAuth: () => Promise<void>
    }
  }
}

/** True inside the packaged Electron desktop shell. */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && window.huddleDesktop?.isDesktop === true
}

/** 'ios' | 'android' | 'web' */
export function getPlatform(): string {
  return Capacitor.getPlatform()
}
