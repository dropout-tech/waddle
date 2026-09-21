let activeAccount: string | null = null
let earliestFocusStart = Date.now()
export function setDesktopNotificationAccount(account: string | null) {
  if (activeAccount !== account) {
    earliestFocusStart = Date.now()
    activeAccount = account
    if (typeof window !== 'undefined') void window.huddleDesktop?.clearNotifications?.().catch(() => {})
  }
}
export const DESKTOP_NOTIFICATIONS_KEY = 'huddle.desktopNotifications.enabled'
export function desktopNotificationsEnabled() {
  if (typeof window === 'undefined') return false
  try { return !!window.huddleDesktop?.showNotification && localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) === '1' } catch { return false }
}
export function setDesktopNotificationsEnabled(enabled: boolean) {
  localStorage.setItem(DESKTOP_NOTIFICATIONS_KEY, enabled ? '1' : '0')
  if (!enabled) void window.huddleDesktop?.clearNotifications?.().catch(() => {})
}
export async function notifyDesktop(payload: { kind: 'meeting' | 'focus' | 'water' | 'test'; id: string; title: string; body: string; silent?: boolean; startedAt?: number }) {
  if (!desktopNotificationsEnabled() || !activeAccount) return false
  if (payload.kind === 'focus' && (!payload.startedAt || payload.startedAt < earliestFocusStart)) return false
  try {
    const result = await window.huddleDesktop!.showNotification!({ ...payload, id: payload.id.slice(0, 200), title: payload.title.slice(0, 160), body: payload.body.slice(0, 500) })
    return result.status === 'submitted' || result.status === 'duplicate'
  } catch { return false }
}
