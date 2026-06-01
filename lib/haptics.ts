// Platform-branching haptic feedback facade.
//
// On the native (Capacitor) iOS/Android shell this triggers the Taptic Engine
// so finishing a task gives a real physical "click" — one of the small native
// touches that makes the iOS build feel like an app, not a wrapped website.
// On web it's a silent no-op (the Web Vibration API is unsupported on desktop
// Safari/iOS Safari, so there's nothing meaningful to fall back to).

import { isNative } from '@/lib/platform'

/**
 * A short success-style tap, fired on a task's off→on completion transition.
 * Fire-and-forget: never throws and never blocks the UI. No-op on web.
 */
export function hapticTaskComplete(): void {
  if (!isNative()) return
  void (async () => {
    try {
      const { Haptics, NotificationType } = await import('@capacitor/haptics')
      await Haptics.notification({ type: NotificationType.Success })
    } catch {
      /* haptics unavailable (e.g. simulator / permission) — ignore */
    }
  })()
}
