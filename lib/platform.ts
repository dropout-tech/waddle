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
      /** Mac 桌面殼 0.1.4 起：懸浮視窗可選擇蓋在全螢幕 App 上。 */
      floatOverFullscreen?: boolean
      beginOAuth: () => Promise<string>
      openOAuth: (url: string) => Promise<void>
      clearNotifications?: () => Promise<void>
      notificationStatus?: () => Promise<{ supported: boolean; permission: 'unknown'; lastError: string | null }>
      showNotification?: (payload: { kind: 'meeting' | 'focus' | 'water' | 'test'; id: string; title: string; body: string; silent?: boolean }) => Promise<{ status: string }>
      /** Mac 選單列專注倒數（desktop/focus-tray.cjs）；null＝收掉。 */
      setFocusStatus?: (payload: {
        state: 'running' | 'paused' | 'completed'
        mode: 'pomodoro' | 'stopwatch'
        startedAt: number
        pausedMs: number
        pausedAt: number | null
        targetSeconds: number
        prefix: string
      } | null) => Promise<{ status: string }>
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
