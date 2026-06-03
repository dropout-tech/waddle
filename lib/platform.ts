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

/** 'ios' | 'android' | 'web' */
export function getPlatform(): string {
  return Capacitor.getPlatform()
}
