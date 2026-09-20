import { createClient } from '@/lib/supabase/client'
export const DESKTOP_PENDING = 'huddle-desktop-oauth-pending'
let rejectPending: ((reason: Error) => void) | undefined
export async function cancelDesktopOAuth() {
  localStorage.removeItem(DESKTOP_PENDING)
  await window.huddleDesktop?.cancelOAuth()
  rejectPending?.(new Error('已取消登入，請重新選擇登入方式'))
}
export async function desktopSignIn(provider: 'google' | 'apple'): Promise<void> {
  const bridge = window.huddleDesktop
  if (!bridge?.beginOAuth) throw new Error('請下載最新桌面版後重新登入')
  if (rejectPending) await cancelDesktopOAuth()
  const state = await bridge.beginOAuth()
  localStorage.setItem(DESKTOP_PENDING, JSON.stringify({ state, expires: Date.now() + 300000 }))
  const redirect = new URL('/auth/callback', window.location.origin)
  redirect.searchParams.set('desktop', '1')
  redirect.searchParams.set('desktop_state', state)
  try {
    const { data, error } = await createClient().auth.signInWithOAuth({ provider, options: { redirectTo: redirect.href, skipBrowserRedirect: true } })
    if (error || !data.url) throw error || new Error('無法開啟登入頁面')
    await bridge.openOAuth(data.url)
    await new Promise<void>((_resolve, reject) => {
      const timer = setTimeout(() => { void bridge.cancelOAuth(); localStorage.removeItem(DESKTOP_PENDING); reject(new Error('登入等待逾時，請重試')) }, 300000)
      rejectPending = reason => { clearTimeout(timer); reject(reason) }
    })
  } catch (error) {
    await bridge.cancelOAuth()
    localStorage.removeItem(DESKTOP_PENDING)
    throw error
  } finally { rejectPending = undefined }
}

// React Strict Mode can mount the callback twice. Share the one-time exchange.
const exchanges = new Map<string, Promise<boolean>>()
export function completeDesktopOAuth(code: string, state: string): Promise<boolean> {
  const existing = exchanges.get(code)
  if (existing) return existing
  const result = (async () => {
    let pending
    try { pending = JSON.parse(localStorage.getItem(DESKTOP_PENDING) || 'null') } catch {}
    localStorage.removeItem(DESKTOP_PENDING)
    if (!window.huddleDesktop?.isDesktop || !pending || pending.expires < Date.now() || pending.state !== state || !code) return false
    const { data, error } = await createClient().auth.exchangeCodeForSession(code)
    return !error && !!data.session
  })().catch(() => false)
  exchanges.set(code, result)
  return result
}
