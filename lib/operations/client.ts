import { isNative } from '@/lib/platform'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/lib/supabase/database.types'

// On app start the auth guard, the user menu and the notices bar all ask for
// 'self' at the same moment. Share one request among concurrent callers (and
// callers within a short window) instead of hitting the RPC three times. Any
// other action except known reads — every mutation goes through here — drops
// the shared result both when it starts and when it settles, so a read after
// a write is never served stale.
const SELF_SHARE_MS = 5000
const READ_ONLY_ACTIONS = new Set(['announcements', 'leaderboard'])
let selfShared: { promise: Promise<unknown>; at: number } | null = null

/** Called on sign-in/sign-out so a shared 'self' never crosses accounts. */
export function resetSharedSelf() {
  selfShared = null
}

export function operations<T>(
  action: string,
  data: Record<string, unknown> = {}
): Promise<T> {
  if (READ_ONLY_ACTIONS.has(action)) return callOperations<T>(action, data)
  if (action !== 'self' || Object.keys(data).length > 0) {
    selfShared = null
    return callOperations<T>(action, data).finally(() => {
      selfShared = null
    })
  }
  if (selfShared && Date.now() - selfShared.at < SELF_SHARE_MS)
    return selfShared.promise as Promise<T>
  const shared = { promise: callOperations<T>('self', data) as Promise<unknown>, at: Date.now() }
  selfShared = shared
  // Never cache a failure: the next caller retries.
  shared.promise.catch(() => {
    if (selfShared === shared) selfShared = null
  })
  return shared.promise as Promise<T>
}

async function callOperations<T>(
  action: string,
  data: Record<string, unknown>
): Promise<T> {
  const { data: result, error } = await createClient().rpc(
    'huddle_operations',
    { p_action: action, p_data: data as Json }
  )
  if (error) {
    if (error.code === 'PGRST202')
      throw new Error(
        '會員服務尚未啟用，請稍後再試。管理員需先完成資料庫更新。'
      )
    throw new Error(error.message)
  }
  // Some refusals (e.g. rate-limited coupon attempts) are returned rather than
  // raised so the server can persist them; surface them as errors here.
  if (
    result &&
    typeof result === 'object' &&
    !Array.isArray(result) &&
    result.ok === false
  )
    throw new Error(
      typeof result.error === 'string' ? result.error : '操作失敗，請再試一次'
    )
  return result as T
}
export function dateLabel(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'
}
export const sourceLabel: Record<string, string> = {
  trial: '新戶體驗',
  coupon: '活動優惠',
  referral: '推薦獎勵',
  friend: '推薦體驗',
  manual: '管理員贈送',
}

/** Native apps share the public website, never capacitor://localhost. */
export function enrollmentLink(kind: 'ref' | 'coupon', code: string): string {
  const origin =
    typeof window !== 'undefined' &&
    !isNative() &&
    /^https?:$/.test(window.location.protocol)
      ? window.location.origin
      : 'https://waddle.zeabur.app'
  return `${origin}/signup?${kind}=${encodeURIComponent(code)}`
}
